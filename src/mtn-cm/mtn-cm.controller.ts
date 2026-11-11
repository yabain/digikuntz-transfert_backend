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
import { MtnCmService } from './mtn-cm.service';
import { Payin, PayinDocument, PayinProvider, PayinStatus } from 'src/payin/payin.schema';
import { Gateway } from 'src/gateway/gateway.schema';
import { CryptService } from 'src/dev/crypt.service';

@ApiTags('mtn-cm')
@Controller('mtn-cm')
export class MtnCmController {
  constructor(
    private readonly mtnCmService: MtnCmService,
    private readonly cryptService: CryptService,
    @InjectModel(Payin.name) private readonly payinModel: mongoose.Model<PayinDocument>,
    @InjectModel(Gateway.name) private readonly gatewayModel: mongoose.Model<Gateway>,
  ) {}

  private async loadGatewayCredentials(gatewayId?: string): Promise<Record<string, any>> {
    const gateway = gatewayId
      ? await this.gatewayModel.findById(gatewayId).exec()
      : await this.gatewayModel.findOne({ type: 'mtn_cm', isActive: true }).exec();
    if (!gateway) {
      throw new NotFoundException('No active MTN CM gateway found');
    }
    let creds: Record<string, any> = {};
    try {
      creds = JSON.parse(this.cryptService.decryptWithPassphrase(gateway.credentials));
    } catch {
      creds = {};
    }
    this.mtnCmService.setCredentials(creds);
    return creds;
  }

  /**
   * Débit MTN MoMo Cameroun. Persist-then-charge. `X-Reference-Id` UUID v4
   * généré par payin (idempotence) et stocké dans `meta.xReferenceId`.
   */
  @Post('payin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initier un débit MTN MoMo Cameroun (admin only)', deprecated: true })
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
      msisdn: string;
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
    const msisdn = String(body.msisdn || '').replace(/\s+/g, '').trim();
    if (msisdn.length < 12) {
      throw new HttpException(
        { message: 'msisdn is not a valid Cameroonian MTN number' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const txRef = String(body.txRef || `txMtn-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    const xReferenceId = this.mtnCmService.newXReferenceId();

    const payin = await this.payinModel.create({
      txRef,
      amount,
      currency: 'XAF',
      customerEmail: 'native-cm@digikuntz.local',
      provider: PayinProvider.MTN_CM,
      status: PayinStatus.PENDING,
      meta: {
        flow: 'native_cm',
        msisdn,
        xReferenceId,
        description: body.description || 'MTN MoMo Cameroun',
      },
    });

    try {
      await this.mtnCmService.requestToPay({
        partyId: msisdn,
        amount,
        currency: 'XAF',
        externalId: txRef,
        payerMessage: `Paiement de ${amount} XAF`,
        payeeNote: `Paiement de ${amount} XAF`,
        xReferenceId,
      });
    } catch (error) {
      // Rejet avant tout appel (config absente)→ terminal ; erreur ambiguë
      // (timeout/5xx) → laisser pending (le cron trancheran).
      const status = (error as any)?.status;
      if (status === HttpStatus.SERVICE_UNAVAILABLE) {
        await this.payinModel.updateOne(
          { _id: payin._id, status: PayinStatus.PENDING },
          { $set: { status: PayinStatus.FAILED, error: { source: 'mtn_cm', message: (error as any)?.message } } },
        );
      }
      throw error;
    }

    return { payin, xReferenceId };
  }

  /** Statut courant d'un payin MTN CM (admin) par txRef. */
  @Get('payin/:txRef')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Statut d’un payin MTN CM (admin only)' })
  @ApiResponse({ status: 200, description: 'Payin + statut natif.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getPayin(@Req() req, @Param('txRef') txRef: string) {
    if (!req.user?.isAdmin) throw new ForbiddenException('Unauthorised');
    const payin = await this.payinModel.findOne({ txRef, provider: PayinProvider.MTN_CM }).lean().exec();
    if (!payin) throw new NotFoundException('MTN CM payin not found');

    const xReferenceId = payin?.meta?.xReferenceId;
    let remote: any = null;
    if (xReferenceId) {
      try {
        await this.loadGatewayCredentials(String((payin as any).gatewayId || ''));
        remote = await this.mtnCmService.getStatus(xReferenceId);
      } catch {
        remote = null;
      }
    }
    return { payin, remote };
  }

  /**
   * Solde du wallet marchand MTN MoMo (admin only).
   * Interroge l'endpoint officiel `GET /collection/v1_0/account/balance` puis
   * stocke le résultat dans `Gateway.balance` (paginé comme M-Pesa).
   */
  @Get('balance')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Solde MTN MoMo Cameroun (admin only)' })
  @ApiQuery({ name: 'gatewayId', required: false, description: 'Gateway MTN CM à interroger (sinon le premier actif)' })
  @ApiResponse({ status: 200, description: 'Solde retourné.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getBalance(@Req() req, @Query('gatewayId') gatewayId?: string) {
    if (!req.user?.isAdmin) throw new ForbiddenException('Unauthorised');
    const creds = await this.loadGatewayCredentials(gatewayId);
    const gateway = await (gatewayId
      ? this.gatewayModel.findById(gatewayId).exec()
      : this.gatewayModel.findOne({ type: 'mtn_cm', isActive: true }).exec());

    if (!gateway) throw new NotFoundException('No active MTN CM gateway found');

    let balance: any;
    try {
      // `setCredentials` est repliqué ici car `loadGatewayCredentials` l'a déjà
      // appelé ; il n'y a donc rien de plus à faire côté service.
      balance = await this.mtnCmService.getAccountBalance();
    } catch (error: any) {
      throw new HttpException(
        { message: error?.message || 'Unable to fetch MTN CM balance' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    await this.gatewayModel
      .updateOne(
        { _id: gateway._id },
        {
          $set: {
            balance: {
              availableBalance: balance.availableBalance,
              balance: balance.balance,
              currency: balance.currency,
              fetchedAt: new Date(),
            },
          },
        },
      )
      .exec();

    return { balance, gatewayId: String(gateway._id) };
  }

  /**
   * Liste des encaissements MTN CM stockés en base (admin only) — la version
   * paginée locale, comme `MpesaController.listIncoming`.
   */
  @Get('incoming-transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Liste des payins MTN CM en base (admin only)' })
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
        .find({ provider: PayinProvider.MTN_CM })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean()
        .exec(),
      this.payinModel.countDocuments({ provider: PayinProvider.MTN_CM }),
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