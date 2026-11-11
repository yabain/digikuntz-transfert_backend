import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import type mongoose from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { OrangeCmService } from './orange-cm.service';
import { Payin, PayinDocument, PayinProvider, PayinStatus } from 'src/payin/payin.schema';
import { Gateway } from 'src/gateway/gateway.schema';
import { CryptService } from 'src/dev/crypt.service';

@ApiTags('orange-cm')
@Controller('orange-cm')
export class OrangeCmController {
  constructor(
    private readonly orangeCmService: OrangeCmService,
    private readonly cryptService: CryptService,
    private readonly config: ConfigService,
    @InjectModel(Payin.name) private readonly payinModel: mongoose.Model<PayinDocument>,
    @InjectModel(Gateway.name) private readonly gatewayModel: mongoose.Model<Gateway>,
  ) {}

  /** Retrouve le gateway Orange CM actif (ou par id) et charge ses credentials. */
  private async loadGatewayCredentials(gatewayId?: string): Promise<Record<string, any>> {
    const gateway = gatewayId
      ? await this.gatewayModel.findById(gatewayId).exec()
      : await this.gatewayModel.findOne({ type: 'orange_cm', isActive: true }).exec();
    if (!gateway) {
      throw new NotFoundException('No active Orange CM gateway found');
    }
    let creds: Record<string, any> = {};
    try {
      creds = JSON.parse(this.cryptService.decryptWithPassphrase(gateway.credentials));
    } catch {
      creds = {};
    }
    this.orangeCmService.setCredentials(creds);
    return creds;
  }

  /**
   * Débit Orange CM. Persist-then-charge : le Payin est créé AVANT l'appel
   * `/pay`, et l'échec de charge laisse le payin en `pending` (réconciliable)
   * sauf rejet avéré avant tout appel.
   */
  @Post('payin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initier un débit Orange Money Cameroun (admin only)', deprecated: true })
  @ApiResponse({ status: 201, description: 'Payin créé.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createPayin(
    @Req() req,
    @Body()
    body: {
      amount: number;
      subscriberMsisdn: string;
      description?: string;
      gatewayId?: string;
      txRef?: string;
    },
  ) {
    if (!req.user?.isAdmin) throw new ForbiddenException('Unauthorised');
    await this.loadGatewayCredentials(body.gatewayId);

    const amount = Math.round(Number(body.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpException({ message: 'Amount must be a positive number' }, HttpStatus.BAD_REQUEST);
    }
    const msisdn = String(body.subscriberMsisdn || '').replace(/\s+/g, '').trim();
    if (!/^2376[5-9]\d{7}$/.test(msisdn) && !/^2376[79]\d{7}$/.test(msisdn) && msisdn.length < 12) {
      // Orange CM : 655-659 / 686-689 / 69x. On accepte l'indicatif complet ou national.
      throw new HttpException(
        { message: 'subscriberMsisdn is not a valid Cameroonian Orange number' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const txRef = String(body.txRef || `txOm-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    // `customerEmail` est requis par le schéma ; un payin en attente d'un
    // ticket serveur est créé avec une adresse interne de veille, remplacée
    // par le flux réel (checkout/API) qui fournit l'email du payeur.
    const payin = await this.payinModel.create({
      txRef,
      amount,
      currency: 'XAF',
      customerEmail: 'native-cm@digikuntz.local',
      provider: PayinProvider.ORANGE_CM,
      status: PayinStatus.PENDING,
      meta: {
        flow: 'native_cm',
        msisdn,
        description: body.description || 'Orange Money Cameroun',
      },
    });

    try {
      const token = await this.orangeCmService.getAccessToken();
      const { payToken } = await this.orangeCmService.initPay(token);
      const notifUrl = `${(this.config.get<string>('BACK_URL') || '').replace(/\/+$/, '')}/orange-cm/notify`;
      await this.orangeCmService.pay({
        payToken,
        subscriberMsisdn: msisdn,
        amount,
        orderId: txRef,
        description: body.description || 'Orange Money Cameroun',
        notifUrl,
      });
      await this.payinModel.updateOne(
        { _id: payin._id, status: PayinStatus.PENDING },
        { $set: { 'meta.payToken': payToken } },
      );
    } catch (error) {
      // Rejet AVANT tout débit (token/payToken non obtenus) → payin terminal failed.
      // Erreur ambiguë (timeout/5xx après `/pay`) → laisser pending (réconciliation).
      const status = (error as any)?.status;
      if (status === HttpStatus.BAD_REQUEST || status === HttpStatus.SERVICE_UNAVAILABLE) {
        await this.payinModel.updateOne(
          { _id: payin._id, status: PayinStatus.PENDING },
          { $set: { status: PayinStatus.FAILED, error: { source: 'orange_cm', message: (error as any)?.message } } },
        );
      }
      throw error;
    }

    return { payin };
  }

  /** Statut courant d'un payin Orange CM (admin) par txRef. */
  @Get('payin/:txRef')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Statut d’un payin Orange CM (admin only)' })
  @ApiResponse({ status: 200, description: 'Payin + statut natif.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getPayin(@Req() req, @Param('txRef') txRef: string) {
    if (!req.user?.isAdmin) throw new ForbiddenException('Unauthorised');
    const payin = await this.payinModel.findOne({ txRef, provider: PayinProvider.ORANGE_CM }).lean().exec();
    if (!payin) throw new NotFoundException('Orange CM payin not found');

    const payToken = payin?.meta?.payToken;
    let remote: any = null;
    if (payToken) {
      try {
        await this.loadGatewayCredentials(String((payin as any).gatewayId || ''));
        remote = await this.orangeCmService.getStatus(payToken);
      } catch {
        remote = null;
      }
    }
    return { payin, remote };
  }

  /**
   * Callback de notification Orange (endpoint PUBLIC, appelé par Orange).
   * ACK rapide ; le polling `paymentstatus` reste la source de vérité — ce
   * callback sert d'accélérateur et ne conclut un payin que si l'enveloppe et
   * le payin local correspondent.
   */
  @Post('notify')
  @ApiOperation({ summary: 'Callback de notification Orange Money (public)' })
  @ApiResponse({ status: 200, description: 'ACK.' })
  @UsePipes(ValidationPipe)
  async notify(@Body() body: any) {
    try {
      const txRef = String(
        body?.orderId || body?.order_id || body?.data?.orderId || body?.data?.tx_ref || '',
      );
      const status = String(
        body?.status || body?.data?.status || body?.data?.data?.status || '',
      ).toUpperCase();
      const local = OrangeCmService.mapStatusToLocal(status);

      if (txRef && local !== 'pending') {
        await this.payinModel.updateOne(
          {
            txRef,
            provider: PayinProvider.ORANGE_CM,
            status: PayinStatus.PENDING,
          },
          {
            $set: {
              status: local === 'successful'
                ? PayinStatus.SUCCESSFUL
                : local === 'cancelled'
                  ? PayinStatus.CANCELLED
                  : PayinStatus.FAILED,
              raw: body,
            },
          },
        );
      }
    } catch (error) {
      // Toujours répondre 200 : Orange retentera si on renvoie autre chose.
      // Le handler est volontairement silencieux : le polling `paymentstatus`
      // reste la source de vérité, ce callback n'est qu'un accélérateur.
      void error;
    }
    return { status: 'ok' };
  }

  /**
   * Liste des encaissements Orange CM stockés en base (admin only) — l'API
   * `omcoreapis` n'offre pas de listing agrégé ; la base locale est la source
   * (pattern `MpesaController.listIncoming`).
   */
  @Get('incoming-transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des payins Orange CM en base (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Payins retournés.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async listIncoming(
    @Req() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    if (!req.user?.isAdmin) throw new ForbiddenException('Unauthorised');
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [data, total] = await Promise.all([
      this.payinModel
        .find({ provider: PayinProvider.ORANGE_CM })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.payinModel.countDocuments({ provider: PayinProvider.ORANGE_CM }),
    ]);

    return {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit) || 1,
      data,
    };
  }
}