/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  HttpCode,
  UseGuards,
  UsePipes,
  ValidationPipe,ForbiddenException,
  NotFoundException,
  BadRequestException,
  Param,
} from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { Query as ExpressQuery } from 'express-serve-static-core';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PaymentMethodService } from 'src/payment-method/payment-method.service';
import { InjectModel } from '@nestjs/mongoose';
import type mongoose from 'mongoose';
import { Gateway } from 'src/gateway/gateway.schema';
import { CryptService } from 'src/dev/crypt.service';
import { PaymentRouterService } from 'src/payment/payment-router.service';
import { TransactionService } from 'src/transaction/transaction.service';
import { resolveClientIp } from 'src/common/client-ip.util';
import { PayinRouteService } from './payin-route.service';
import {
  MOBILE_MONEY_NETWORKS,
  MobileMoneyNetworkError,
  normalizeNetworkToken,
  resolveMobileMoneyNetwork,
} from './mobile-money-network.util';

/**
 * Jetons de réseau réellement supportés par la charge directe. Sert à ne
 * comparer que des valeurs connues : un `code` de méthode hors table (ex.
 * `BANK`) ne doit pas être interprété comme un opérateur.
 */
const KNOWN_DIRECT_CHARGE_NETWORKS = new Set(
  MOBILE_MONEY_NETWORKS.map((rule) => normalizeNetworkToken(rule.network)),
);

@ApiTags('flutterwave')
@Controller('fw')
export class FlutterwaveController {
  constructor(
    private readonly fw: FlutterwaveService,
    private readonly paymentMethodService: PaymentMethodService,
    private readonly cryptService: CryptService,
    @InjectModel(Gateway.name) private readonly gatewayModel: mongoose.Model<Gateway>,
    private readonly paymentRouter: PaymentRouterService,
    private readonly transactionService: TransactionService,
    private readonly payinRoute: PayinRouteService,
  ) {}

  private async loadFwCredentials(opts?: { gatewayId?: string; countryWallet?: string; currency?: string }): Promise<void> {
    const { gatewayId, countryWallet, currency } = opts || {};
    let gateway;
    if (gatewayId) {
      gateway = await this.gatewayModel.findById(gatewayId).exec();
    } else if (currency) {
      gateway = await this.gatewayModel.findOne({ type: 'flutterwave', currency, isActive: true }).exec();
    } else if (countryWallet) {
      const cur = countryWallet === 'NG' ? 'NGN' : 'XAF';
      gateway = await this.gatewayModel.findOne({ type: 'flutterwave', currency: cur, isActive: true }).exec();
    } else {
      throw new BadRequestException('gatewayId, currency, or countryWallet required');
    }
    if (!gateway) throw new NotFoundException('Active Flutterwave gateway not found');

    let creds: Record<string, any> = {};
    try {
      const decrypted = this.cryptService.decryptWithPassphrase(gateway.credentials);
      creds = JSON.parse(decrypted);
    } catch { creds = {}; }

    this.fw.setCredentials(creds);
  }

  @Get('balance/:countryWallet')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Flutterwave wallet balance by country wallet' })
  @ApiParam({ name: 'countryWallet', example: 'CM', description: 'Wallet country code (CM, NG, ...)' })
  @ApiQuery({ name: 'gatewayId', required: false, description: 'Optional gateway ID to use specific credentials' })
  @ApiResponse({ status: 200, description: 'Wallet balance returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getBalance(
    @Param('countryWallet') countryWallet,
    @Query('gatewayId') gatewayId: string | undefined,
    @Req() req,
  ) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    await this.loadFwCredentials({ gatewayId, countryWallet });
    return this.fw.getBalance(countryWallet);
  }

  @Get('payin-transactons/:countryWallet')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List Flutterwave payin transactions by wallet' })
  @ApiParam({ name: 'countryWallet', example: 'CM' })
  @ApiQuery({ name: 'gatewayId', required: false, description: 'Optional gateway ID to use specific credentials' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'status', required: false, type: String, example: 'successful' })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-01-31' })
  @ApiQuery({ name: 'periode', required: false, type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Payin transaction list returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async listPayinTransactions(
    @Query() query: ExpressQuery,
    @Param('countryWallet') countryWallet,
    @Query('gatewayId') gatewayId: string | undefined,
    @Req() req,
  ) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    await this.loadFwCredentials({ gatewayId, countryWallet });
    return this.fw.listPayinTransactions(countryWallet, query);
  }

  @Get('payout-transactons/:countryWallet')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List Flutterwave payout transactions by wallet' })
  @ApiParam({ name: 'countryWallet', example: 'CM' })
  @ApiQuery({ name: 'gatewayId', required: false, description: 'Optional gateway ID to use specific credentials' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'status', required: false, type: String, example: 'SUCCESSFUL' })
  @ApiQuery({ name: 'from', required: false, type: String, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, type: String, example: '2026-01-31' })
  @ApiQuery({ name: 'periode', required: false, type: Number, example: 1 })
  @ApiResponse({ status: 200, description: 'Payout transaction list returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async listPayoutTransactions(
    @Param('countryWallet') countryWallet,
    @Query() query: ExpressQuery,
    @Query('gatewayId') gatewayId: string | undefined,
    @Req() req,
  ) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    await this.loadFwCredentials({ gatewayId, countryWallet });
    return this.fw.listPayoutTransactions(countryWallet, query);
  }

  @Get('transactions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List generic Flutterwave transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'status', required: false, type: String, example: 'successful' })
  @ApiResponse({ status: 200, description: 'Transactions list returned.' })
  @UseGuards(AuthGuard('jwt'))
  listTx(@Query('page') page: number | undefined, @Query('status') status: string | undefined, @Req() req: any) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.fw.listTransactions({ page, status });
  }

  /**
   * Retire tout taux de taxe fourni par le client et le remplace, si une méthode
   * de paiement est identifiée dans le body, par le taux serveur de cette méthode :
   * `taxesPayment` pour un encaissement, `taxesTransfer` pour un transfert.
   *
   * Ces endpoints reçoivent un body non typé (`@Body() any`) répandu dans
   * `transactionData` ; sans ce filtre, un client pourrait envoyer
   * `taxRateOverride`/`invoiceTaxes` pour annuler ses propres frais. Le taux est
   * donc TOUJOURS re-dérivé côté serveur depuis la méthode, jamais repris du body.
   */
  private async resolveTaxOverride(
    body: any,
    direction: 'payin' | 'payout',
  ): Promise<any> {
    return this.paymentMethodService.resolveTaxOverride(body, direction);
  }

  @Post('payin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a payin session for a transaction' })
  @ApiBody({
    description: 'Transaction payload used to initialize payin.',
    schema: {
      example: {
        estimation: 1000,
        transactionRef: 'IN123#260305000100',
        senderEmail: 'sender@mail.com',
        senderName: 'John Doe',
        senderCurrency: 'XAF',
        receiverId: '65f0aa12d4b1c2f1a8a4f001',
        transactionType: 'transfer',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Payin initialized.' })
  @ApiResponse({ status: 400, description: 'Invalid payload.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createPayin(@Body() transactionData: any, @Req() req) {
    const data = await this.resolveTaxOverride(transactionData, 'payin');

    // Numéro saisi à l'étape 3 pour la charge mobile money. Il ne doit pas
    // partir dans le document `Transaction` (PII inutile) : on l'extrait puis
    // on le retire du corps avant tout appel à `createPayin`/`createDirectPayin`.
    const payerPhone = String(data?.payerPhone || '')
      .trim()
      // Écriture internationale `00…` : le résolveur attend l'indicatif nu.
      .replace(/^00/, '');
    delete data.payerPhone;

    // Un transfert peut choisir la méthode avec laquelle l'EXPÉDITEUR paie.
    // Mobile money → charge directe (même aiguillage que la facture) ; carte →
    // checkout hébergé restreint aux cartes. Sans méthode payeur (ancien client),
    // on conserve le checkout hébergé historique.
    const payerMethod = await this.resolveTransferPayerMethod(data);
    if (!payerMethod) {
      return this.fw.createPayin(data, req.user._id);
    }

    // Aligner la passerelle sur celle de la méthode : sinon le client pourrait
    // imposer un autre compte marchand (credentials de webhook différentes) et
    // une autre commission que celle affichée pour la méthode choisie.
    const methodGatewayId =
      (payerMethod as any)?.gatewayId?._id || (payerMethod as any)?.gatewayId;
    if (methodGatewayId) {
      data.gatewayId = String(methodGatewayId);
    }

    if (payerMethod.type === 'card') {
      return this.fw.createPayin(
        { ...data, payinChannel: 'card' },
        req.user._id,
      );
    }

    if (payerMethod.type === 'mobile') {
      // Numéro saisi à l'étape 3 ; repli sur le numéro du compte pour les
      // anciens clients. Il est validé contre l'opérateur de la méthode
      // ci-dessous, y compris côté serveur.
      const phone = payerPhone || String(req.user?.phone || '').trim();
      if (!phone) {
        // Pas de numéro : le payeur peut encore payer par carte en hébergé.
        return this.fw.createPayin(data, req.user._id);
      }

      this.assertPayerPhoneSupportsMethod(phone, payerMethod, data);

      return this.payinRoute.resolve(
        data,
        {
          method: 'mobile_money',
          phone,
          email: data.senderEmail || req.user?.email,
          name:
            data.senderName ||
            [req.user?.firstName, req.user?.lastName]
              .filter(Boolean)
              .join(' ')
              .trim(),
          // `findByCode` peuple `countryId` : la méthode mobile money est
          // rattachée à un pays. Le résolveur attend l'ISO2 (`CM`, `SN`…), pas
          // l'indicatif (`237`) : `Country.code` contient l'indicatif, `iso2`
          // porte le code pays. Le numéro envoyé inclut l'indicatif, donc cet
          // indice n'est qu'un secours.
          country:
            (payerMethod as any)?.countryId?.iso2 ||
            (req.user as any)?.countryId?.iso2,
          clientIp: resolveClientIp(req as unknown),
        },
        {
          flow: 'transfer',
          userId: req.user._id,
          meta: { transactionType: 'transfer' },
          fallbackEmail: data.senderEmail || req.user?.email,
          label: 'Transfer',
        },
      );
    }

    return this.fw.createPayin(data, req.user._id);
  }

  /**
   * Résout la méthode de paiement du payeur d'un transfert.
   *
   * Retourne `null` hors transfert ou lorsque le client n'en fournit pas, afin
   * de conserver le checkout hébergé historique. Les contrôles de devise,
   * d'activation et de bornes sont déjà faits par `resolveTaxOverride`, mais le
   * `type` (`mobile`/`card`) n'y est pas exposé : on relit le document.
   *
   * @param {any} data - Corps de requête déjà assaini.
   * @returns {Promise<any|null>} - Méthode payeur ou `null`.
   */
  private async resolveTransferPayerMethod(data: any): Promise<any | null> {
    if (String(data?.transactionType || '').toLowerCase() !== 'transfer') {
      return null;
    }

    const code = String(data?.payerPaymentMethodCode || '').trim().toUpperCase();
    if (!code) return null;

    const method = await this.paymentMethodService.findByCode(code);
    if (!method) {
      throw new NotFoundException(`Payment method '${code}' not found`);
    }
    if (!method.statusPayin) {
      throw new BadRequestException(
        `Payment method '${code}' is not available for payin`,
      );
    }

    const currency = String(
      data.senderCurrency || data.currency || '',
    ).toUpperCase();
    if (currency && String(method.currency).toUpperCase() !== currency) {
      throw new BadRequestException(
        `Currency mismatch: method '${code}' is for ${method.currency}, not ${currency}`,
      );
    }

    return method;
  }

  /**
   * Réseau attendu pour une méthode mobile money.
   *
   * Le `code` n'est pas toujours un jeton Flutterwave (`MOMO`, `OM`, ou un
   * libellé plus long). On inspecte donc code + nom + provider, en testant MTN
   * avant Orange (`MOMO` contient `OM`), puis on retombe sur les alias connus.
   *
   * @param {any} method - Méthode payeur.
   * @returns {string|null} - Jeton de réseau connu, ou `null`.
   */
  private resolveMethodNetwork(method: any): string | null {
    const haystack = [method?.code, method?.name, method?.provider]
      .map((value) => String(value || '').toUpperCase())
      .join(' ');

    if (haystack.includes('MPESA') || haystack.includes('M-PESA')) {
      return 'MPESA';
    }
    if (haystack.includes('MTN') || haystack.includes('MOMO')) {
      return 'MTN';
    }
    if (haystack.includes('ORANGE')) {
      return 'ORANGEMONEY';
    }

    const code = normalizeNetworkToken(method?.code);
    return KNOWN_DIRECT_CHARGE_NETWORKS.has(code) ? code : null;
  }

  /**
   * Vérifie que le numéro saisi appartient bien à l'opérateur de la méthode.
   *
   * La validation frontend est un premier filtre ; celle-ci est autoritaire.
   * Un numéro dont le réseau est indéterminé n'est pas rejeté ici : `PayinRoute`
   * décide du repli hébergé (utile pour les pays dont les préfixes ne sont pas
   * encore renseignés). En revanche, un numéro clairement invalide ou rattaché
   * à un autre opérateur est refusé avant toute écriture.
   *
   * @param {string} phone - Numéro saisi (national ou international).
   * @param {any} method - Méthode payeur résolue.
   * @param {any} data - Corps assaini (devise).
   */
  private assertPayerPhoneSupportsMethod(
    phone: string,
    method: any,
    data: any,
  ): void {
    const expected = this.resolveMethodNetwork(method);
    if (!expected) return;

    try {
      const resolved = resolveMobileMoneyNetwork({
        phone,
        country: method?.countryId?.iso2,
        currency: data?.senderCurrency || data?.currency,
      });

      if (resolved.network !== expected) {
        throw new BadRequestException(
          `The payer phone number does not belong to the selected operator (${method?.name || expected}).`,
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      if (error instanceof MobileMoneyNetworkError) {
        if (
          error.code === 'INVALID_PHONE' ||
          error.code === 'UNSUPPORTED_CURRENCY' ||
          error.code === 'UNSUPPORTED_COUNTRY'
        ) {
          throw new BadRequestException(error.message);
        }

        // NETWORK_NOT_RESOLVED / AMBIGUOUS_NUMBER : laisser PayinRoute décider
        // (repli hébergé), pour ne pas casser les pays sans table de préfixes.
        return;
      }

      throw error;
    }
  }

  @Post('direct-charge')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initiate a direct mobile money charge (no hosted checkout)' })
  @ApiBody({
    schema: {
      example: {
        estimation: 1000,
        currency: 'XAF',
        phone: '237691224472',
        email: 'customer@mail.com',
        name: 'John Doe',
        paymentMethodCode: 'ORANGEMONEY',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Direct charge initialized.' })
  @ApiResponse({ status: 400, description: 'Invalid payload.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createDirectCharge(@Body() data: any, @Req() req) {
    let feeRate: number | undefined;

    if (data.paymentMethodCode) {
      const code = String(data.paymentMethodCode).toUpperCase();
      const method = await this.paymentMethodService.findByCode(code);
      if (!method) {
        throw new NotFoundException(`Payment method '${code}' not found`);
      }
      if (
        String(method.currency).toUpperCase() !==
        String(data.currency).toUpperCase()
      ) {
        throw new BadRequestException(
          `Currency mismatch: method '${code}' is for ${method.currency}, not ${data.currency}`,
        );
      }
      if (!method.statusPayin) {
        throw new BadRequestException(
          `Payment method '${code}' is not available for payin`,
        );
      }
      const amount = Number(data.estimation);
      if (Number.isFinite(amount)) {
        if (method.minAmount > 0 && amount < method.minAmount) {
          throw new BadRequestException(
            `Amount ${amount} is below minimum ${method.minAmount} for method '${code}'`,
          );
        }
        if (method.maxAmount > 0 && amount > method.maxAmount) {
          throw new BadRequestException(
            `Amount ${amount} exceeds maximum ${method.maxAmount} for method '${code}'`,
          );
        }
      }
      feeRate = Number(method.taxesPayment) || undefined;
    }

    // `method.code` (MOMO, ORANGEMONEY, ...) is NOT a Flutterwave network token,
    // and sending it made Flutterwave reject the charge. The operator is now
    // derived from the payer's phone number; an explicit `data.network` is only
    // used as a fallback hint when the prefix cannot be resolved.
    const network = data.network
      ? String(data.network).toUpperCase()
      : undefined;

    return this.fw.createDirectCharge(
      {
        ...data,
        taxRateOverride: feeRate,
        network,
        // L'IP vient de la REQUÊTE uniquement : elle était auparavant écrasable par
        // `data.clientIp`, donc l'attaquant choisissait le champ censé l'identifier.
        clientIp: resolveClientIp(req as unknown),
      },
      req.user._id,
    );
  }

  @Post('transfer-from-balance')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a transfer from user account balance' })
  @ApiBody({
    schema: {
      example: {
        estimation: 5000,
        senderCurrency: 'XAF',
        receiverCurrency: 'XAF',
        senderName: 'John Doe',
        receiverName: 'Jane Doe',
        bankCode: 'ORANGEMONEY',
        bankAccountNumber: '2376XXXXXXX',
        receiverCountry: 'Cameroon',
        raisonForTransfer: 'Paiement fournisseur',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Transfer created and awaiting admin payout validation.' })
  @ApiResponse({ status: 400, description: 'Invalid payload or insufficient balance.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  createTransferFromBalance(@Body() transactionData: any, @Req() req) {
    return this.resolveTaxOverride(transactionData, 'payout').then((data) =>
      this.fw.createTransferFromBalance(data, req.user._id),
    );
  }

  @Post('withdrawal')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a withdrawal transaction from user balance' })
  @ApiBody({
    schema: {
      example: {
        estimation: 5000,
        paymentWithTaxes: 5250,
        senderCurrency: 'XAF',
        receiverCurrency: 'XAF',
        senderName: 'John Doe',
        receiverName: 'John Doe',
        bankCode: 'ORANGEMONEY',
        bankAccountNumber: '2376XXXXXXX',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Withdrawal initialized.' })
  @ApiResponse({ status: 400, description: 'Invalid payload or insufficient balance.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  withdrawal(@Body() transactionData: any, @Req() req) {
    console.log('(fw controller) withdrawal: ', transactionData);
    return this.fw.withdrawal(transactionData, req.user._id);
  }

  // Recharge du solde système : crée un payin `systemPayin` (sans frais) et
  // retourne le lien de paiement de la passerelle de la devise.
  @Post('system-payin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a system balance recharge (payin) — admin only',
  })
  @ApiBody({
    schema: {
      example: {
        currency: 'XAF',
        amount: 100000,
        description: 'Recharge trésorerie',
        email: 'admin@digikuntz.com',
        redirectUrl: 'https://app.digikuntz.com/system-balance',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Payin created, payment link returned.' })
  @ApiResponse({ status: 400, description: 'Invalid currency or amount.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createSystemPayin(@Body() body: any, @Req() req) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.fw.createSystemPayin(body, req.user);
  }

  // Retrait du solde système : débite le solde, crée une transaction
  // `systemWithdrawal` en attente de validation admin, puis envoyée au provider.
  @Post('system-withdrawal')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a system balance withdrawal (payout) — admin only',
  })
  @ApiBody({
    schema: {
      example: {
        currency: 'XAF',
        amount: 50000,
        description: 'Virement fournisseur',
        paymentMethod: 'BANK',
        receiverName: 'Bénéficiaire',
        receiverBankCode: '044',
        receiverAccountNumber: '1234567890',
        receiverCountryCode: 'CM',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'System withdrawal created, awaiting validation.' })
  @ApiResponse({ status: 400, description: 'Invalid payload or insufficient system balance.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createSystemWithdrawal(@Body() body: any, @Req() req) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.fw.createSystemWithdrawal(body, req.user);
  }

  @Get('verify-payin/:txRef')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify a payin status by txRef' })
  @ApiParam({ name: 'txRef', example: 'txPayin-1741130000000-abcd1234' })
  @ApiResponse({ status: 200, description: 'Payin verification result.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 404, description: 'Payin not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  verify(@Param('txRef') txRef: string) {
    return this.fw.verifyPayin(txRef);
  }

  @Get('verify-close-payin/:txRef')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify and close a payin by txRef when terminal' })
  @ApiParam({ name: 'txRef', example: 'txPayin-1741130000000-abcd1234' })
  @ApiResponse({ status: 200, description: 'Payin verification/close result.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  verifyAndClose(@Param('txRef') txRef: string) {
    return this.fw.verifyAndClosePayin(txRef);
  }

  @Get('get-bank/:code')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get banks/operator list by country code' })
  @ApiParam({ name: 'code', example: 'CM', description: 'Country code' })
  @ApiQuery({ name: 'gatewayId', required: false, description: 'Optional gateway ID to load credentials from a specific gateway' })
  @ApiResponse({ status: 200, description: 'Bank/operator list returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async getBanksList(@Param('code') countryCode: string, @Query('gatewayId') gatewayId?: string) {
    if (gatewayId) {
      await this.loadFwCredentials({ gatewayId });
    }
    return this.fw.getBanksList(countryCode);
  }

  // init payout transaction
  @Get('payout/:transactionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Initialize payout for a successful payin transaction (admin only)' })
  @ApiParam({ name: 'transactionId', example: '6a341f60841d03dcfbf8b2f4', description: 'Internal transaction ID' })
  @ApiResponse({
    status: 200,
    description: 'Payout initialized.',
    schema: {
      example: {
        status: 'transaction_payout_success',
        transactionId: '6a341f60841d03dcfbf8b2f4',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @ApiResponse({ status: 404, description: 'Transaction not found or invalid status.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async createPayout(@Req() req, @Param('transactionId') transactionId) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    const tx = await this.transactionService.findById(transactionId).catch(() => null);
    const currency = tx?.receiverCurrency || tx?.senderCurrency || 'XAF';
    return this.paymentRouter.payout(transactionId, req.user._id, false, currency);
  }

  // init payout transaction
  @Get('retry-payout/:transactionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retry payout for a failed payout transaction (admin only)' })
  @ApiParam({ name: 'transactionId', description: 'Internal transaction ID' })
  @ApiResponse({ status: 200, description: 'Payout retried.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Admin privileges required.' })
  @ApiResponse({ status: 404, description: 'Transaction not found or not eligible for retry.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  async retryPayout(@Req() req, @Param('transactionId') transactionId) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    const tx = await this.transactionService.findById(transactionId).catch(() => null);
    const currency = tx?.receiverCurrency || tx?.senderCurrency || 'XAF';
    return this.paymentRouter.payout(transactionId, req.user._id, true, currency);
  }

  // Webhook: this route must be PUBLIC (override guard upstream if needed)
  @Post('webhook')
  @HttpCode(200) // FW attend 200 sinon il retente
  // Le ThrottlerGuard global (100 req/min/IP) rejetait en 429 les rafales de
  // webhooks (backlog ou rejeu Flutterwave après incident), et Flutterwave
  // rejouait alors la livraison : un pic de notifications devenait une tempête.
  // La route reste protégée : la signature `verif-hash` est vérifiée avant tout
  // traitement, et l'enveloppe autorisée ici reste bornée.
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @ApiOperation({ summary: 'Flutterwave webhook endpoint' })
  @ApiBody({
    description: 'Webhook payload from Flutterwave.',
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  @ApiResponse({ status: 200, description: 'Webhook received and processed.' })
  async handleWebhook(@Req() req: Request) {
    return this.fw.verifyWebhookPayin(req);
  }

  @Get('verify-payout/:id')
  @ApiOperation({ summary: 'Verify payout status by transfer reference/id' })
  @ApiParam({ name: 'id', description: 'Payout reference or txRef' })
  @ApiResponse({ status: 200, description: 'Payout verification result.' })
  @ApiResponse({ status: 404, description: 'Payout not found.' })
  verifyPayout(@Param('id') reference: string) {
    console.log('verifyPayout tx: ', reference);
    return this.fw.verifyPayout(reference);
  }

  @Get('payment-plans')
  @ApiOperation({ summary: 'List Flutterwave payment plans' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'perPage', required: false, type: Number, example: 20 })
  @ApiResponse({ status: 200, description: 'Payment plans returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  listPaymentPlans(@Query() query: ExpressQuery, @Req() req) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    // Supports optional pagination params: page, perPage
    return this.fw.getPaymentPlans({
      page: query?.page as any,
      perPage: query?.perPage as any,
    });
  }

  // Create a Flutterwave payment plan (subscription plan)
  @Post('payment-plans')
  @ApiOperation({ summary: 'Create a Flutterwave payment plan' })
  @ApiBody({
    schema: {
      example: {
        name: 'Premium Monthly',
        amount: 5000,
        interval: 'monthly',
        currency: 'XAF',
        duration: 12,
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Payment plan created.' })
  @ApiResponse({ status: 400, description: 'Invalid plan payload.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  createPaymentPlan(@Body() planPayload: any, @Req() req) {
    console.log('Payload', planPayload);
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.fw.createPaymentPlan(planPayload);
  }

  @Get('open-payin/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Re-open a payin if still eligible' })
  @ApiParam({ name: 'id', description: 'Payin txRef' })
  @ApiResponse({ status: 200, description: 'Payin reopened or status returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 404, description: 'Payin/transaction not found.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  openPayin(@Param('id') txRef: string, @Req() req) {
    return this.fw.openPayin(txRef, req.user._id);
  }

  @Get('verify-open/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Compatibility route: verify/re-open a payin if eligible' })
  @ApiParam({ name: 'id', description: 'Payin txRef' })
  @ApiResponse({ status: 200, description: 'Payin reopened or status returned.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  verifyOpenPayin(@Param('id') txRef: string, @Req() req) {
    return this.fw.openPayin(txRef, req.user._id);
  }

  @Post('create-virtual-card/:countryWallet')
  @ApiOperation({ summary: 'Create virtual card for a wallet country' })
  @ApiParam({ name: 'countryWallet', example: 'NG' })
  @ApiBody({
    schema: {
      example: {
        currency: 'USD',
        amount: 20,
        billing_name: 'John Doe',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Virtual card created.' })
  @ApiResponse({ status: 400, description: 'Invalid card payload.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  createVirtualCard(@Body() cardPayload: Record<string, any>, @Req() req, @Param('countryWallet') countryWallet) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.fw.createVirtualCard(countryWallet, cardPayload);
  }

  @Get('get-cards-list/:countryWallet')
  @ApiOperation({ summary: 'Get virtual cards list by wallet country' })
  @ApiParam({ name: 'countryWallet', example: 'NG' })
  @ApiResponse({ status: 200, description: 'Virtual cards list returned.' })
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(ValidationPipe)
  getVirtualCardsList(@Req() req, @Param('countryWallet') countryWallet) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    return this.fw.getVirtualCards(countryWallet);
  }


  /// Test handling
  @Post('test-withdrawal')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test withdrawal handling flow (internal)' })
  @ApiBody({
    schema: {
      example: {
        estimation: 1000,
        senderCurrency: 'XAF',
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Test flow executed.' })
  @UseGuards(AuthGuard('jwt'))
  handleWithdrawal(@Body() transactionData: any, @Req() req) {
    if (!req.user.isAdmin) {
      throw new ForbiddenException('Unauthorised');
    }
    console.log('(fw controller) withdrawal: ', transactionData);
    return this.fw.handleTestWithdrawal(transactionData);
  }
}
