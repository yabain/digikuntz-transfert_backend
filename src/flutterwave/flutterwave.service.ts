/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable no-empty */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Payin, PayinDocument } from 'src/payin/payin.schema';
import { CreatePayinDto, VerifyPayinDto } from 'src/payin/payin.dto';
import { Payout, PayoutDocument } from 'src/payout/payout.schema';
import { CreatePayoutDto } from 'src/payout/payout.dto';
import { PayinService } from 'src/payin/payin.service';
import { PayinProvider, PayinStatus } from 'src/payin/payin.schema';
import { FlutterwaveApiService } from './flutterwave-api.service';
import {
  DirectChargeFlow,
  buildMobileMoneyCharge,
  isPreChargeRejection,
} from './mobile-money-charge.builder';
import { isDirectChargeEnabled } from './direct-charge.config';
import { PayoutService } from 'src/payout/payout.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { MpesaService } from 'src/mpesa/mpesa.service';
import { ConfigService } from '@nestjs/config';
import { TransactionService } from 'src/transaction/transaction.service';
import { ExceptionsHandler } from '@nestjs/core/exceptions/exceptions-handler';
import {
  Transaction,
  TStatus,
  TransactionType,
} from 'src/transaction/transaction.schema';
import { GatewayLoaderService } from 'src/payment/gateway-loader.service';
import { BalanceService } from 'src/balance/balance.service';
import { SubscriptionService } from 'src/plans/subscription/subscription.service';
import { ServicePaymentService } from 'src/service/service-payment/service-payment.service';
import { WhatsappService } from 'src/wa/whatsapp.service';
import { OperationNotificationService } from 'src/notification/operation-notification.service';
import { FundraisingService } from 'src/fundraising/fundraising.service';
import { CreatePaymentRequestDto } from 'src/payment-request/create-payment-request.dto';
import { PaymentRequestService } from 'src/payment-request/payment-request.service';
import { PaymentRequestStatus } from 'src/payment-request/payment-request.schema';
import { Gateway } from 'src/gateway/gateway.schema';
import { CryptService } from 'src/dev/crypt.service';
import { PaymentMethodService } from 'src/payment-method/payment-method.service';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { InvoiceService } from 'src/invoice/invoice.service';
import { SystemBalanceService } from 'src/system-balance/system-balance.service';
import { sanitizeFlutterwaveError as mapFlutterwaveError } from './flutterwave-error.util';

@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);
  private fwSecret: any;
  private fwPublic: any;
  private fwBaseUrlV3 = 'https://api.flutterwave.com/v3';
  // Some V4 payout endpoints (subject to account enablement)
  private fwBaseUrlV4 = 'https://api.flutterwave.cloud';
  private secretHash: any;
  private tStatus: any = TStatus;
  private transactionType: any = TransactionType;

  constructor(
    private readonly http: HttpService,
    private readonly flutterwaveApi: FlutterwaveApiService,
    private readonly gatewayLoader: GatewayLoaderService,
    @InjectModel(Payout.name) private payoutModel: Model<PayoutDocument>,
    private payinService: PayinService,
    private payoutService: PayoutService,
    @Inject(forwardRef(() => TransactionService))
    private transactionService: TransactionService,
    private balanceService: BalanceService,
    private subscriptionService: SubscriptionService,
    private servicePaymentService: ServicePaymentService,
    private operationNotificationService: OperationNotificationService,
    private fundraisingService: FundraisingService,
    @Inject(forwardRef(() => PaymentRequestService))
    private paymentRequestService: PaymentRequestService,
    @Inject(forwardRef(() => WhatsappService))
    private whatsappService: WhatsappService,
    @InjectModel(Gateway.name) private gatewayModel: Model<Gateway>,
    private cryptService: CryptService,
    @Inject(forwardRef(() => PaymentMethodService))
    private paymentMethodService: PaymentMethodService,
    private config: ConfigService,
    private paystackService: PaystackService,
    private mpesaService: MpesaService,
    private auditLogService: AuditLogService,
    @Inject(forwardRef(() => InvoiceService))
    private invoiceService: InvoiceService,
    private systemBalanceService: SystemBalanceService,
  ) {}

  setCredentials(creds: Record<string, any>): void {
    const secret = creds.secretKey || creds.FLUTTERWAVE_SECRET_KEY;
    const pubKey = creds.publicKey || creds.FLUTTERWAVE_PUBLIC_KEY;
    const hash = creds.secretHash || creds.FLUTTERWAVE_SECRET_HASH;
    if (secret) this.fwSecret = secret;
    if (pubKey) this.fwPublic = pubKey;
    if (hash) this.secretHash = hash;
  }

  async loadDbCredentials(
    currency?: string,
    gatewayId?: string,
  ): Promise<void> {
    let gateway;
    if (gatewayId) {
      this.logger.log(`loadDbCredentials: loading gateway by id=${gatewayId}`);
      gateway = await this.gatewayModel.findById(gatewayId).exec();
    } else {
      const cur = currency || 'XAF';
      this.logger.log(`loadDbCredentials: loading gateway by currency=${cur}`);
      gateway = await this.gatewayModel
        .findOne({ type: 'flutterwave', currency: cur, isActive: true })
        .exec();
      if (!gateway) {
        this.logger.log(
          `loadDbCredentials: no flutterwave gateway for ${cur}, trying any active gateway`,
        );
        gateway = await this.gatewayModel
          .findOne({ currency: cur, isActive: true })
          .exec();
      }
    }
    if (!gateway) {
      this.logger.warn(
        `loadDbCredentials: no gateway found (gatewayId=${gatewayId}, currency=${currency})`,
      );
      return;
    }
    try {
      const decrypted = this.cryptService.decryptWithPassphrase(
        gateway.credentials,
      );
      const creds = JSON.parse(decrypted);
      this.logger.log(
        `loadDbCredentials: gateway type=${gateway.type}, credentials loaded`,
      );
      this.setCredentials(creds);
      this.payinService.setCredentials(creds);
      this.mpesaService.setCredentials(creds);
    } catch (e) {
      this.logger.error(
        `loadDbCredentials: failed to decrypt/set credentials: ${e.message}`,
      );
    }
  }

  private isInsufficientPayoutBalance(details: any): boolean {
    const code = String(details?.code || '').toLowerCase();
    const message = String(
      details?.message ||
        details?.data?.message ||
        details?.error ||
        details ||
        '',
    ).toLowerCase();

    return (
      code.includes('insufficient') ||
      message.includes('insufficient balance') ||
      message.includes('balance is not enough') ||
      message.includes('insufficient fund')
    );
  }

  /**
   * Thin wrapper around the shared Flutterwave error mapper, kept so the many
   * existing call sites of this service stay untouched. The implementation now
   * lives in `flutterwave-error.util.ts` and is shared with FlutterwaveApiService.
   */
  private sanitizeFlutterwaveError(error: any, fallbackMessage: string) {
    return mapFlutterwaveError(error, fallbackMessage, this.logger);
  }

  // ---------- Helpers ----------
  private authHeader() {
    return { Authorization: `Bearer ${this.fwSecret}` };
  }

  private authHeaderNGN() {
    return this.authHeader();
  }

  private buildKesCustomerPhone(
    senderContact: string,
    senderCountryCode?: string,
  ): string {
    const raw = String(senderContact || '').trim();
    const digits = raw.replace(/\D/g, '');
    if (!digits) return raw;

    if (/^2547\d{8}$/.test(digits)) return digits;

    const cc = String(senderCountryCode || '').replace(/\D/g, '');
    if (cc === '254') {
      if (/^7\d{8}$/.test(digits)) return `254${digits}`;
      if (/^07\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
    }

    return raw;
  }

  private normalizeProviderFullName(
    value?: string,
    fieldName = 'name',
  ): string {
    const raw = String(value || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!raw) {
      throw new HttpException(
        { message: `Invalid field: ${fieldName} is required` },
        HttpStatus.BAD_REQUEST,
      );
    }
    return raw.includes(' ') ? raw : `${raw} --`;
  }

  // ---------- Balance ----------
  async getBalance(countryWallet) {
    const url = `${this.fwBaseUrlV3}/balances`;
    let headers;
    if (countryWallet == 'CM') {
      headers = this.authHeader();
    } else if (countryWallet == 'NG') {
      headers = this.authHeaderNGN();
    } else {
      headers = this.authHeaderNGN();
    }
    try {
      const res = await firstValueFrom(this.http.get(url, { headers }));
      return res.data;
    } catch (err: any) {
      const parsed = this.sanitizeFlutterwaveError(
        err,
        'Failed to fetch Flutterwave balance',
      );
      throw new HttpException(parsed.payload, parsed.statusCode);
    }
  }

  // ---------- Transactions list (incoming payments) ----------
  async listTransactions(query: { page?: number; status?: string }) {
    const params: any = {};
    if (query.page) params.page = query.page;
    if (query.status) params.status = query.status;
    const url = `${this.fwBaseUrlV3}/transactions`;
    const res = await firstValueFrom(
      this.http.get(url, { headers: this.authHeader(), params }),
    );
    return res.data;
  }

  async listPayinTransactions(
    countryWallet,
    query?: {
      page?: number;
      status?: string;
      from?: string;
      to?: string;
      periode?: number;
    },
  ) {
    const defaultDate = this.getDateRangeLastMonth(query?.periode || 1);

    const params: any = {};
    params.page = query?.page || 1;
    if (query?.status) params.status = query?.status; //  successful | failed | pending
    params.from = query?.from || defaultDate.from;
    params.to = query?.to || defaultDate.to;

    let headers;
    if (countryWallet == 'CM') {
      headers = this.authHeader();
    } else if (countryWallet == 'NG') {
      headers = this.authHeaderNGN();
    } else {
      headers = this.authHeaderNGN();
    }

    const url = `${this.fwBaseUrlV3}/transactions`;
    try {
      const res = await firstValueFrom(this.http.get(url, { headers, params }));
      return res.data;
    } catch (err: any) {
      // Operational trace only: never log the request URL, params or the upstream
      // payload (they can carry account data and were previously dumped raw).
      this.logger.error(
        `Failed to list payin transactions for wallet ${countryWallet}: ` +
          `${err?.message ?? 'unknown error'} (upstream ${err?.response?.status ?? 'n/a'})`,
      );
      const parsed = this.sanitizeFlutterwaveError(
        err,
        'Flutterwave API connection error while listing payin transactions',
      );
      throw new HttpException(parsed.payload, parsed.statusCode);
    }
  }

  async listPayoutTransactions(
    countryWallet,
    query?: {
      page?: number;
      status?: string;
      from?: string;
      to?: string;
      periode?: number;
    },
  ) {
    const defaultDate = this.getDateRangeLastMonth(query?.periode || 1);

    const params: any = {};
    params.page = query?.page || 1;
    if (query?.status) params.status = query?.status; // NEW | SUCCESSFUL | FAILED | PROCESSING
    params.from = query?.from || defaultDate.from;
    params.to = query?.to || defaultDate.to;

    let headers;
    if (countryWallet == 'CM') {
      headers = this.authHeader();
    } else if (countryWallet == 'NG') {
      headers = this.authHeaderNGN();
    } else {
      headers = this.authHeaderNGN();
    }

    const url = `${this.fwBaseUrlV3}/transfers`;
    try {
      const res = await firstValueFrom(this.http.get(url, { headers, params }));
      return res.data;
    } catch (err: any) {
      const parsed = this.sanitizeFlutterwaveError(
        err,
        'Flutterwave API connection error while listing payout transactions',
      );
      throw new HttpException(parsed.payload, parsed.statusCode);
    }
  }

  private getDateRangeLastMonth(periode: number = 1) {
    // console.log('Periode: ', periode);
    const today = new Date();

    // "to" = aujourd’hui
    const to = new Date(today);
    const toStr = to.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // "from" = aujourd’hui - 1 mois
    const from = new Date(today);
    from.setMonth(from.getMonth() - periode);
    const fromStr = from.toISOString().split('T')[0]; // "YYYY-MM-DD"

    return {
      from: fromStr,
      to: toStr,
    };
  }

  async withdrawal(transactionData: any, userId) {
    // Vérifier les limites de retrait
    const withdrawalAmount = Number(transactionData.estimation);
    if (Number.isFinite(withdrawalAmount) && withdrawalAmount > 0) {
      await this.transactionService.validateTransactionLimit(
        withdrawalAmount,
        transactionData.senderCurrency || 'XAF',
        'withdrawal',
      );
    }

    transactionData.userId = userId;
    const raw = {
      ...transactionData,
      txRef: this.payoutService.generateTxRef('txPayout'),
      userId,
      senderId: userId,
      receiverId: userId,
      transactionType: 'withdrawal',
      status: 'transaction_payin_success',
      noFees: true,
    };
    // console.log('withdrawal raw: ', raw);
    const balance = await this.balanceService.getBalanceByUserId(
      String(userId),
    );
    if (!Number.isFinite(withdrawalAmount) || withdrawalAmount <= 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Invalid withdrawal amount',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (balance.balance < withdrawalAmount) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Insufficient balance',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const newBalance = await this.balanceService.debitBalance(
        String(userId),
        withdrawalAmount,
        transactionData.senderCurrency,
      );

      const savedTransaction =
        await this.transactionService.createTransaction(raw);
      if (!savedTransaction) {
        throw new NotFoundException('Error to save transaction details');
      }

      if (
        transactionData?.transactionType === 'transfer' ||
        transactionData?.transactionType === 'withdrawal'
      ) {
        void this.operationNotificationService
          .notifyAdminPayoutPending(savedTransaction)
          .catch(() => undefined);
      }

      return { status: 'pending' };
    } catch (error) {
      console.error('Withdrawal error:', error);
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: error.message || 'Unknown error occurred',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /** Nom d'affichage de l'utilisateur (personal => prénom + nom, sinon nom d'entité) */
  private userDisplayName(user: any): string {
    if (!user) return '';
    const first = String(user?.firstName || '').trim();
    const last = String(user?.lastName || '').trim();
    if (first || last) return `${first} ${last}`.trim();
    return String(user?.name || '').trim();
  }

  // ---------- Pay-In (Hosted Payment) ----------
  async createSystemPayin(body: any, user: any) {
    const userId = String(user?._id || '');
    if (!userId) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'User not found' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const currency = String(body?.currency || '').toUpperCase();
    const amount = Number(body?.amount);
    if (!currency || !Number.isFinite(amount) || amount <= 0) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'Invalid currency or amount' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Appliquer les limites de transaction de la devise (dépôt)
    await this.transactionService.validateTransactionLimit(
      amount,
      currency,
      'deposit',
    );

    // Router le payin vers la passerelle active de la devise
    // (Flutterwave / Paystack / M-Pesa) comme pour un payin classique.
    const gateway = await this.gatewayModel
      .findOne({ currency, isActive: true })
      .lean()
      .exec();
    if (!gateway) {
      throw new NotFoundException(
        `No active payment gateway found for currency ${currency}`,
      );
    }

    // Détails de l'administrateur qui effectue la recharge
    const adminName = this.userDisplayName(user);
    const adminEmail = String(user?.email || '').trim();
    const adminPhone = String(user?.phone || '').trim();

    // Commission (%) prélevée par le provider gateway : le paiement est
    // initié à `montant + montant*commission%` (ex. 100 XAF @ 3% → 103),
    // mais le solde système n'est crédité que du montant de base.
    const commissionRate = Number(gateway?.providerCommission) || 0;

    const raw = {
      transactionType: 'systemPayin',
      status: TStatus.PAYINPENDING,
      estimation: amount,
      senderCurrency: currency,
      receiverCurrency: currency,
      senderId: userId,
      userId,
      senderName: adminName || 'Système',
      senderEmail: adminEmail || body?.email || undefined,
      senderContact: adminPhone || body?.phone || undefined,
      receiverName: 'System',
      receiverId: userId,
      raisonForTransfer: body?.description || 'Recharge du solde système',
      noFees: true,
      gatewayId: String(gateway._id),
      redirectUrl: body?.redirectUrl,
    };

    const payin = await this.createPayin(raw, userId);

    // Création immédiate du mouvement de solde en `status: pending` : il est
    // visible dans la liste /system-balance dès la création du payin, et son
    // statut évolue en temps réel avec la transaction (`completed` à la
    // confirmation via `creditSystemBalance`, `failed`/`cancelled` sinon).
    // Le solde n'est crédité qu'à la confirmation, du montant de base MINUS
    // la commission du provider gateway (ex. 15 XAF @ 3% → crédité 14.55).
    try {
      const transactionId = String(payin?.transactionId || '');
      if (transactionId) {
        const commissionAmount =
          commissionRate > 0
            ? Math.max(Math.ceil((amount * commissionRate) / 100), 0)
            : 0;
        const creditedAmount = Math.max(amount - commissionAmount, 0);
        await this.systemBalanceService.createPendingMovement({
          key: `system-payin-credit:${transactionId}`,
          type: 'in',
          amount: creditedAmount,
          currency,
          transactionId,
          reference: String(payin?.txRef || ''),
          description: body?.description || 'Recharge du solde système',
          amountCollected: amount,
          gatewayFee: 0,
          providerCommission: commissionAmount,
          amountCredited: creditedAmount,
          performedBy: { userId, name: adminName, email: adminEmail },
        });
      }
    } catch (err) {
      this.logger.warn(
        'createSystemPayin: pending movement creation failed',
        err,
      );
    }

    return payin;
  }

  async createSystemWithdrawal(body: any, user: any) {
    const userId = String(user?._id || '');
    if (!userId) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'User not found' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const currency = String(body?.currency || '').toUpperCase();
    const amount = Number(body?.amount);
    if (!currency || !Number.isFinite(amount) || amount <= 0) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'Invalid currency or amount' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const paymentMethod = String(body?.paymentMethod || '').toUpperCase();
    if (!['OM', 'MTN', 'MPESA', 'BANK'].includes(paymentMethod)) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Invalid payment method (OM, MTN, MPESA or BANK)',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Appliquer les limites de transaction de la devise (retrait)
    await this.transactionService.validateTransactionLimit(
      amount,
      currency,
      'withdrawal',
    );

    // Vérifier que le solde système est suffisant
    const balance = await this.systemBalanceService.getSystemBalance(currency);
    if (Number(balance?.balance ?? 0) < amount) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Insufficient system balance',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Détails de l'administrateur qui effectue le retrait
    const adminName = this.userDisplayName(user);
    const adminEmail = String(user?.email || '').trim();
    const performedBy = { userId, name: adminName, email: adminEmail };

    const txRef = this.payoutService.generateTxRef('txPayout');
    const raw = {
      txRef,
      userId,
      senderId: userId,
      receiverId: userId,
      senderName: adminName || 'Système',
      senderEmail: adminEmail || undefined,
      senderContact: String(user?.phone || '').trim() || undefined,
      senderCurrency: currency,
      receiverCurrency: currency,
      receiverCountryCode: body?.receiverCountryCode,
      receiverName: body?.receiverName || adminName || 'Système',
      paymentMethod,
      bankCode: body?.receiverBankCode,
      bankAccountNumber: body?.receiverAccountNumber || body?.receiverPhone,
      receiverMobileAccountNumber: body?.receiverPhone,
      raisonForTransfer: body?.description || 'Retrait du solde système',
      estimation: amount,
      transactionType: 'systemWithdrawal',
      status: TStatus.PAYINSUCCESS,
      noFees: true,
    };

    // Créer d'abord la transaction (permet de référencer son id dans le mouvement),
    // puis débiter le solde système (idempotent via clé unique = id de transaction).
    let saved: any;
    try {
      saved = await this.transactionService.createTransaction(raw);
      if (!saved) {
        throw new NotFoundException('Error to save transaction details');
      }
    } catch (error) {
      throw error;
    }

    try {
      await this.systemBalanceService.debitSystemBalance(
        currency,
        amount,
        `system-withdraw:${String(saved._id)}`,
        {
          reference: txRef,
          description: `Retrait du solde système (${paymentMethod})`,
          transactionId: String(saved._id),
          amountCollected: amount,
          amountCredited: amount,
          performedBy,
        },
      );
      // Informer les admins qu'un retrait du solde système attend validation
      void this.operationNotificationService
        .notifyAdminPayoutPending(saved)
        .catch(() => undefined);
      return { status: 'pending', transactionId: saved._id, txRef };
    } catch (error) {
      // Débit échoué → retirer la transaction créée (pas de paiement sans fonds)
      await this.transactionService
        .deleteTransaction(String(saved._id))
        .catch(() => undefined);
      throw error;
    }
  }

  async createPayin(
    transactionData: any,
    userId,
    options?: {
      paymentRequestMode?: boolean;
      paymentRequestInput?: CreatePaymentRequestDto;
    },
  ) {
    let selectedGatewayType: string | undefined;
    if (transactionData.gatewayId) {
      const gw = await this.gatewayModel
        .findById(transactionData.gatewayId)
        .lean()
        .exec();
      if (gw) selectedGatewayType = gw.type;
    }

    await this.loadDbCredentials(
      transactionData.senderCurrency ||
        transactionData.receiverCurrency ||
        'XAF',
      transactionData.gatewayId,
    );

    // Router par type de gateway (pas par devise)
    if (selectedGatewayType === 'paystack') {
      return this.createPaystackPayin(transactionData, userId, options);
    }
    if (selectedGatewayType === 'mpesa') {
      return this.createMpesaPayin(transactionData, userId, options);
    }

    // Vérifier les limites d'encaissement pour la devise
    const depositAmount = Number(transactionData.estimation);
    if (Number.isFinite(depositAmount) && depositAmount > 0) {
      await this.transactionService.validateTransactionLimit(
        depositAmount,
        transactionData.senderCurrency ||
          transactionData.receiverCurrency ||
          'XAF',
        'deposit',
      );
    }

    transactionData.userId = userId;
    const txRef = this.payinService.generateTxRef('txPayin');
    const raw = {
      ...transactionData,
      userId,
      txRef,
      status: TStatus.PAYINPENDING,
    };

    try {
      const savedTransaction =
        await this.transactionService.createTransaction(raw);
      if (!savedTransaction) {
        throw new NotFoundException('Error to save transaction details');
      }

      const amount = Number(savedTransaction.paymentWithTaxes);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new HttpException(
          { status: HttpStatus.BAD_REQUEST, error: 'Invalid payment amount' },
          HttpStatus.BAD_REQUEST,
        );
      }

      const payinResult = await this.payinService.createPayin({
        amount,
        txRef,
        transactionId: savedTransaction._id,
        currency: savedTransaction.senderCurrency,
        customerEmail: savedTransaction.senderEmail,
        customerName: savedTransaction.senderName,
        customerPhone: savedTransaction.senderContact,
        redirectUrl: transactionData?.redirectUrl,
        status: 'pending',
        userId,
      });

      // Store flwTxId from Flutterwave on the transaction
      const createdPayin = await this.payinService.getPayinByTxRef(txRef);
      if (createdPayin?.flwTxId) {
        await this.transactionService.updateTransactionFlwTxId(
          String(savedTransaction._id),
          String(createdPayin.flwTxId),
        );
      }

      return payinResult;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const parsed = this.sanitizeFlutterwaveError(
        error,
        'Flutterwave createPayin failed',
      );
      this.logger.error(
        `Flutterwave createPayin failed: ${JSON.stringify(parsed.payload)}`,
      );
      throw new HttpException(parsed.payload, parsed.statusCode);
    }
  }

  private async createPaystackPayin(
    transactionData: any,
    userId,
    options?: {
      paymentRequestMode?: boolean;
      paymentRequestInput?: CreatePaymentRequestDto;
    },
  ) {
    const txRef = this.payinService.generateTxRef('txPayin');

    // Load Paystack credentials from the selected gateway
    const gateway = await this.gatewayModel
      .findById(transactionData.gatewayId)
      .exec();
    if (!gateway) {
      throw new NotFoundException('Gateway not found');
    }
    try {
      const decrypted = this.cryptService.decryptWithPassphrase(
        gateway.credentials,
      );
      const creds = JSON.parse(decrypted);
      this.paystackService.setCredentials(creds);
    } catch {
      throw new HttpException(
        'Invalid gateway credentials',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    // Validate deposit limits
    const depositAmount = Number(transactionData.estimation);
    if (Number.isFinite(depositAmount) && depositAmount > 0) {
      await this.transactionService.validateTransactionLimit(
        depositAmount,
        transactionData.senderCurrency || 'KES',
        'deposit',
      );
    }

    const raw = {
      ...transactionData,
      userId,
      txRef,
      status: TStatus.PAYINPENDING,
    };

    const savedTransaction =
      await this.transactionService.createTransaction(raw);
    if (!savedTransaction) {
      throw new NotFoundException('Error to save transaction details');
    }

    const amount = Number(savedTransaction.paymentWithTaxes);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'Invalid payment amount' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const backendUrl =
      this.config.get<string>('BACK_URL') ?? 'https://api.digikuntz.com';
    const callbackUrl = `${backendUrl}/paystack/payin-callback?txRef=${txRef}`;

    const paystackResp = await this.paystackService.initializeKesMpesaPayment({
      email: savedTransaction.senderEmail,
      amountKobo: Math.round(amount * 100),
      reference: txRef,
      callbackUrl,
      metadata: {
        transactionId: String(savedTransaction._id),
        userId,
      },
    });

    const authorizationUrl = paystackResp?.authorization_url;
    if (!authorizationUrl) {
      throw new HttpException(
        { message: 'Failed to get Paystack checkout URL' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    // Create payin record
    await this.payinService.createPaystackPayin({
      userId,
      transactionId: String(savedTransaction._id),
      txRef,
      amount,
      currency: savedTransaction.senderCurrency || 'KES',
      customerEmail: savedTransaction.senderEmail,
      customerName: savedTransaction.senderName,
      raw: {
        ...paystackResp,
        authorizationUrl,
        gatewayId: String(gateway._id),
      },
    });

    return {
      status: 'pending',
      transactionId: savedTransaction._id,
      txRef,
      amount,
      currency: savedTransaction.senderCurrency || 'KES',
      customerEmail: savedTransaction.senderEmail,
      redirect_url: authorizationUrl,
      provider: 'paystack',
    };
  }

  private async createMpesaPayin(
    transactionData: any,
    userId,
    options?: {
      paymentRequestMode?: boolean;
      paymentRequestInput?: CreatePaymentRequestDto;
    },
  ) {
    const txRef = this.payinService.generateTxRef('txPayin');

    const depositAmount = Number(transactionData.estimation);
    if (Number.isFinite(depositAmount) && depositAmount > 0) {
      await this.transactionService.validateTransactionLimit(
        depositAmount,
        transactionData.senderCurrency || 'KES',
        'deposit',
      );
    }

    const raw = {
      ...transactionData,
      userId,
      txRef,
      status: TStatus.PAYINPENDING,
    };

    const savedTransaction =
      await this.transactionService.createTransaction(raw);
    if (!savedTransaction) {
      throw new NotFoundException('Error to save transaction details');
    }

    const amount = Number(savedTransaction.paymentWithTaxes);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'Invalid payment amount' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const customerPhone = this.buildKesCustomerPhone(
      String(savedTransaction.senderContact || ''),
      String(savedTransaction.senderCountryCode || ''),
    );

    const payinResult = await this.payinService.createMpesaPayin({
      amount,
      txRef,
      transactionId: savedTransaction._id,
      currency: savedTransaction.senderCurrency,
      customerEmail: savedTransaction.senderEmail,
      customerName: savedTransaction.senderName,
      customerPhone,
      redirectUrl: transactionData?.redirectUrl,
      status: 'pending',
      userId,
    });

    return payinResult;
  }

  private validateDirectChargePayload(dto: {
    amount: number;
    currency: string;
    phone: string;
    email: string;
    name?: string;
    network?: string;
    txRef: string;
  }): void {
    const currency = String(dto.currency || '').toUpperCase();
    const amount = Number(dto.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'Invalid amount: must be a positive number',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.txRef) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'txRef is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.phone || String(dto.phone).replace(/\s+/g, '').length < 5) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: 'A valid phone number is required',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!dto.email) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'Customer email is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (currency === 'NGN' && !dto.network) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error:
            'network is required for NGN mobile money (MTN, AIRTEL, GLO, 9MOBILE)',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (currency === 'GHS' && !dto.network) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error:
            'network is required for GHS mobile money (MTN, VODAFONE, AIRTELTIGO)',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const supportedCurrencies = [
      'XAF',
      'XOF',
      'NGN',
      'KES',
      'GHS',
      'UGX',
      'RWF',
    ];
    if (!supportedCurrencies.includes(currency)) {
      throw new HttpException(
        {
          status: HttpStatus.BAD_REQUEST,
          error: `Unsupported currency: ${currency}. Supported: ${supportedCurrencies.join(', ')}`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Initiates a direct mobile-money charge (USSD/app push, no hosted checkout).
   *
   * Two live defects are fixed here:
   * 1. the payload is now built by `buildMobileMoneyCharge`, which derives
   *    `country`/`network` from the payer's phone number. The previous
   *    currency→country shortcut emitted invalid networks (`MOMO`,
   *    `ORANGEMONEY`) and omitted `client_ip`/`device_fingerprint`;
   * 2. credentials are resolved per currency by `FlutterwaveApiService` instead
   *    of the shared `fwSecret` field, which was still empty whenever no other
   *    call had run `loadDbCredentials` first — turning a 401 into a 502.
   *
   * Kenya (`KES`) deliberately keeps its previous code path: that rail has its
   * own gateway and its own MSISDN authority, and must not regress.
   *
   * @param {object} dto - Charge inputs. `txRef` MUST already be persisted so the
   *   charge can always be reconciled back to a local payin.
   * @returns {Promise<any>} - Flutterwave's full envelope. `meta.authorization.redirect_url`
   *   must stay reachable: some operators still require a redirect even here.
   */
  async directMobileMoneyCharge(dto: {
    amount: number;
    currency: string;
    phone: string;
    email: string;
    name?: string;
    network?: string;
    country?: string;
    txRef: string;
    clientIp?: string;
    deviceFingerprint?: string;
    flow?: DirectChargeFlow;
  }): Promise<any> {
    const currency = String(dto.currency || '')
      .trim()
      .toUpperCase();

    if (currency === 'KES') {
      return this.legacyKesDirectCharge(dto);
    }

    const built = buildMobileMoneyCharge({
      txRef: dto.txRef,
      amount: dto.amount,
      currency,
      phone: dto.phone,
      email: dto.email,
      fullname: dto.name,
      network: dto.network,
      country: dto.country,
      clientIp: dto.clientIp,
      deviceFingerprint: dto.deviceFingerprint,
      flow: dto.flow ?? 'direct_charge',
    });

    return this.flutterwaveApi.chargeMobileMoney(
      built.chargeType,
      built.body,
      built.resolved.currency,
    );
  }

  /**
   * Kenya mobile-money charge.
   *
   * Preserved from the original implementation (payload shape, `meta`, optional
   * uppercased `network`) with ONE change: credentials are now resolved for KES
   * explicitly instead of relying on the shared `fwSecret` field.
   */
  private async legacyKesDirectCharge(dto: {
    amount: number;
    currency: string;
    phone: string;
    email: string;
    name?: string;
    network?: string;
    txRef: string;
  }): Promise<any> {
    this.validateDirectChargePayload(dto);

    const payload: any = {
      tx_ref: dto.txRef,
      amount: Number(dto.amount),
      currency: 'KES',
      email: dto.email,
      phone_number: dto.phone.replace(/\s+/g, '').trim(),
      fullname: dto.name || 'Customer',
      meta: { app: 'digikuntz-payments', flow: 'direct_charge' },
    };

    if (dto.network) {
      payload.network = dto.network.toUpperCase();
    }

    return this.flutterwaveApi.chargeMobileMoney('mpesa', payload, 'KES');
  }

  /**
   * Creates a transaction + a local pending payin, THEN charges Flutterwave.
   *
   * Order is the whole point of this rewrite. The previous version charged first
   * and then called `payinService.createPayin(...)` — which is the HOSTED method
   * (`POST /v3/payments`). Every "direct charge" therefore ALSO created a hosted
   * checkout session at Flutterwave, and the charge's `flwTxId` and raw response
   * were never stored.
   *
   * Now:
   *  1. the transaction is created (`PAYINPENDING`);
   *  2. a local `pending` payin is persisted, so the unique `txRef` index becomes
   *     the reconciliation anchor and a crash after the charge can never leave an
   *     untracked payment on Flutterwave's side;
   *  3. the charge is issued;
   *  4. `flwTxId`, the raw envelope, the mapped status and any redirect URL are
   *     attached to the payin, and `flwTxId` is copied onto the transaction.
   *
   * When Flutterwave answers `successful` synchronously, the canonical
   * `processSuccessfulPayin` claim path is reused so the credit happens exactly
   * once even if the webhook or the cron fires at the same time.
   *
   * @param {any} data - Charge request (estimation, currency, phone, email, name, network...).
   * @param {any} userId - Owner of the transaction.
   * @returns {Promise<any>} - Polling contract consumed by the frontend.
   */
  async createDirectCharge(data: any, userId: any): Promise<any> {
    // Master rollback lever. This endpoint exists ONLY to issue a direct charge,
    // so there is no hosted route to fall back to: it fails closed with 503
    // rather than silently doing something else with money.
    if (!isDirectChargeEnabled(this.config)) {
      throw new ServiceUnavailableException({
        message: 'Direct mobile-money charge is currently disabled.',
        code: 'DIRECT_CHARGE_DISABLED',
      });
    }

    const depositAmount = Number(data.estimation);
    if (Number.isFinite(depositAmount) && depositAmount > 0) {
      await this.transactionService.validateTransactionLimit(
        depositAmount,
        data.currency || 'XAF',
        'deposit',
      );
    }

    // SÉCURITÉ : le `txRef` n'est JAMAIS repris du corps de la requête.
    // L'accepter permettait de faire écrire le résultat d'une charge sur un
    // payin préexistant appartenant à une autre transaction (confusion de
    // montant, voire double crédit), et une tentative de rejeu renvoyait le
    // `transactionId` d'autrui. Il est donc toujours généré côté serveur, ce qui
    // rend le `txRef` unique par tentative et supprime toute course entre deux
    // requêtes concurrentes.
    //
    // L'idempotence de cet endpoint reste à la charge de l'appelant côté API
    // (comme le flux développeur, via `IdempotencyService`) ; le flux facture est
    // protégé par la revendication atomique de la facture.
    const txRef = this.payinService.generateTxRef('txDirect');

    // Précondition AVANT toute écriture, même raisonnement que
    // `createDirectPayin` : sans credentials pour la devise, la charge échouerait
    // après la création de la transaction et du payin, laissant des lignes
    // orphelines qu'aucun cron ne peut résoudre.
    //
    // KES est volontairement EXCLU : il emprunte `legacyKesDirectCharge`, dont la
    // source de credentials n'est pas `FlutterwaveApiService`. Mieux vaut ne pas
    // couvrir ce chemin que risquer de bloquer une voie qui fonctionne
    // aujourd'hui.
    const preconditionCurrency = String(data.currency || 'XAF').toUpperCase();
    if (
      preconditionCurrency !== 'KES' &&
      !(await this.flutterwaveApi.hasCredentials(preconditionCurrency))
    ) {
      throw new NotFoundException(
        `No Flutterwave gateway credentials configured for currency "${preconditionCurrency}"`,
      );
    }

    const transactionData = {
      transactionRef: this.transactionService.generateInRef(),
      estimation: data.estimation,
      transactionType: data.transactionType || 'deposite',
      userId,
      senderId: userId,
      senderName: data.name || 'Customer',
      senderEmail: data.email || '',
      senderContact: data.phone,
      senderCountry: data.country || '',
      senderCurrency: data.currency,
      receiverId: userId,
      receiverName: data.name || 'Customer',
      receiverEmail: data.email || '',
      receiverContact: data.phone,
      receiverCurrency: data.currency,
      status: TStatus.PAYINPENDING,
      invoiceTaxes: data.invoiceTaxes,
    };

    const savedTransaction =
      await this.transactionService.createTransaction(transactionData);
    if (!savedTransaction) {
      throw new NotFoundException('Error to save transaction details');
    }

    const amount = Number(savedTransaction.paymentWithTaxes);

    await this.payinService.createPendingPayin({
      txRef,
      amount,
      currency: data.currency,
      customerEmail: data.email || '',
      customerName: data.name || 'Customer',
      transactionId: savedTransaction._id,
      userId,
      channel: 'mobile_money',
      meta: { flow: 'direct_charge' },
    });

    let chargeResult: any;
    try {
      chargeResult = await this.directMobileMoneyCharge({
        amount,
        currency: data.currency,
        phone: data.phone,
        email: data.email || '',
        name: data.name,
        network: data.network,
        country: data.country,
        txRef,
        clientIp: data.clientIp,
        deviceFingerprint: data.deviceFingerprint,
        flow: 'direct_charge',
      });
    } catch (error: any) {
      // The charge never reached Flutterwave (validation, credentials or
      // upstream failure). Finalise the payin so it is not polled forever, then
      // rethrow the original error so the caller keeps its contract.
      await this.recordChargeFailure(
        txRef,
        String(savedTransaction._id),
        error,
      );
      throw error;
    }

    const { status: payinStatus, flwTxId } = await this.recordChargeResult(
      txRef,
      String(savedTransaction._id),
      chargeResult,
    );

    if (flwTxId) {
      try {
        await this.transactionService.updateTransactionFlwTxId(
          String(savedTransaction._id),
          flwTxId,
        );
      } catch (error: any) {
        this.logger.warn(
          `Could not attach Flutterwave id ${flwTxId} to transaction ${String(
            savedTransaction._id,
          )}: ${error?.message ?? 'unknown error'}`,
        );
      }
    }

    if (payinStatus === PayinStatus.SUCCESSFUL) {
      // Same guarded, idempotent claim path as the webhook.
      await this.processSuccessfulPayin(
        savedTransaction,
        String(savedTransaction._id),
      );
    }

    return {
      status: 'payin_pending',
      transactionId: savedTransaction._id,
      txRef,
      estimation: savedTransaction.estimation,
      invoiceTaxes: savedTransaction.invoiceTaxes,
      taxesAmount: savedTransaction.taxesAmount,
      paymentWithTaxes: savedTransaction.paymentWithTaxes,
      chargeResponse: chargeResult,
    };
  }

  /**
   * Persists the outcome of a charge envelope against an already-created payin
   * (Flutterwave id, raw envelope, mapped status, operator-imposed redirect URL).
   *
   * Shared by the public API flow and the developer API flow so the mapping
   * exists in exactly one place.
   *
   * @param {string} txRef - Local reference of the attempt.
   * @param {any} chargeResult - Flutterwave's full response envelope.
   * @returns {Promise<{status: PayinStatus; flwTxId?: string}>} - Mapped status and upstream id.
   */
  /**
   * Records the outcome of a charge attempt on the payin that OWNS it.
   *
   * @param {string} txRef - Local reference of the attempt (server-generated).
   * @param {string} transactionId - Owning transaction, added to the write filter
   *   so a charge result can never land on another transaction's payin.
   * @param {any} chargeResult - Flutterwave charge envelope.
   * @returns {Promise<{status: PayinStatus; flwTxId?: string}>} - Mapped outcome.
   */
  async recordChargeResult(
    txRef: string,
    transactionId: string,
    chargeResult: any,
  ): Promise<{ status: PayinStatus; flwTxId?: string }> {
    const chargeData = chargeResult?.data ?? {};
    const flwTxId =
      chargeData?.id !== undefined && chargeData?.id !== null
        ? String(chargeData.id)
        : undefined;
    const status = this.mapChargeStatusToPayinStatus(chargeData?.status);
    const redirectUrl = chargeResult?.meta?.authorization?.redirect_url;

    const attached = await this.payinService.attachChargeResult(
      txRef,
      transactionId,
      {
        flwTxId,
        raw: chargeResult,
        status,
        ...(redirectUrl ? { redirectUrl: String(redirectUrl) } : {}),
        ...(status === PayinStatus.FAILED
          ? { error: this.describeChargeError(chargeResult) }
          : {}),
      },
    );

    // A miss means the payin is not ours or is already terminal. The charge still
    // happened, so this must be visible: the webhook/cron will reconcile it by
    // `flwTxId`.
    if (!attached) {
      this.logger.warn(
        `Charge result not attached for txRef=${txRef} (payin missing, ownership mismatch or already final)`,
      );
    }

    return { status, flwTxId };
  }

  /**
   * Finalises a payin after a charge attempt that failed locally.
   *
   * CRITICAL: a transport/upstream failure is AMBIGUOUS — the charge may well
   * have reached Flutterwave and succeeded while the response was lost. Writing a
   * terminal `FAILED` in that case used to lose the payment for good: the cron
   * only scans `pending` payins, and the webhook ignores terminal ones, so the
   * real success could never be credited. Only a **pre-charge rejection** (proven
   * to have happened before any request left this process) is written as terminal;
   * everything else stays `pending` so `verifyPayin` resumes it against
   * `verify_by_reference` and lets the outcome be decided by Flutterwave.
   *
   * @param {string} txRef - Local reference of the attempt.
   * @param {string} transactionId - Owning transaction (write-filter guard).
   * @param {any} error - The original failure.
   * @returns {Promise<void>}
   */
  async recordChargeFailure(
    txRef: string,
    transactionId: string,
    error: any,
  ): Promise<void> {
    const preCharge = isPreChargeRejection(error);

    if (!preCharge) {
      // `describeChargeError` renvoie `Record<string, any>` : on ne l'interpole pas
      // tel quel (stringification d'objet) et on lit son message en le rétrécissant.
      const described: { message?: unknown } = this.describeChargeError(error);
      const reason =
        typeof described.message === 'string'
          ? described.message
          : 'unknown error';

      this.logger.warn(
        `Charge attempt ${txRef} failed ambiguously (${reason}); leaving the payin pending for upstream reconciliation`,
      );
      return;
    }

    const attached = await this.payinService.attachChargeResult(
      txRef,
      transactionId,
      {
        status: PayinStatus.FAILED,
        error: this.describeChargeError(error),
      },
    );

    if (!attached) {
      this.logger.warn(
        `Charge failure not attached for txRef=${txRef} (payin missing or already final)`,
      );
    }
  }

  /**
   * Direct mobile-money charge for a caller-built transaction.
   *
   * Used by the invoice and payment-request flows: each builds its own
   * transaction (different type, fees and commission payer) but shares the same
   * charge orchestration. The return envelope mirrors the hosted `createPayin`
   * contract so callers can treat both routes identically.
   *
   * Persist-then-charge ordering applies here too (see `createDirectCharge`), so
   * a crash after the charge always leaves a locally reconcilable payin.
   *
   * @param {any} transactionData - Transaction to create before charging.
   * @param {object} charge - Charge inputs and the originating flow.
   * @returns {Promise<object>} - `{ status, transactionId, txRef, redirect_url, network, ... }`.
   */
  async createDirectPayin(
    transactionData: any,
    charge: {
      phone: string;
      email: string;
      name?: string;
      network?: string;
      country?: string;
      clientIp?: string;
      deviceFingerprint?: string;
      flow: DirectChargeFlow;
      meta?: Record<string, any>;
    },
  ): Promise<any> {
    // Master rollback lever. With the flag off, nothing is sent upstream and the
    // rejection is a PRE-CHARGE code, so the invoice / payment-request callers
    // transparently use the hosted checkout they used before this feature.
    if (!isDirectChargeEnabled(this.config)) {
      throw this.preChargeRejection(
        'DIRECT_CHARGE_DISABLED',
        'Direct mobile-money charge is currently disabled.',
      );
    }

    const txRef = this.payinService.generateTxRef('txDirect');
    const amount = Number(transactionData?.estimation);
    const currency = String(
      transactionData.senderCurrency ||
        transactionData.receiverCurrency ||
        'XAF',
    ).toUpperCase();

    // Build (and validate) BEFORE creating anything: a route that cannot be
    // attempted must not leave an orphan transaction + payin behind for the
    // caller's fallback to trip over. `buildMobileMoneyCharge` is pure.
    const built = buildMobileMoneyCharge({
      txRef,
      amount,
      currency,
      phone: charge.phone,
      email: charge.email,
      fullname: charge.name,
      network: charge.network,
      country: charge.country,
      clientIp: charge.clientIp,
      deviceFingerprint: charge.deviceFingerprint,
      flow: charge.flow,
      meta: charge.meta,
    });

    // Précondition AVANT toute écriture : sans credentials pour cette devise, la
    // charge échouerait après la création de la transaction et du payin, laissant
    // des lignes orphelines et — sur la facture — un `PAYING` que le cron ne peut
    // jamais réconcilier (il lui faudrait les mêmes credentials). Échouer ici
    // n'écrit rien : l'appelant peut donc libérer sa revendication et réessayer.
    //
    // Concerne particulièrement XOF : la devise est acceptée (cf.
    // `GATEWAY_CURRENCIES`) mais n'est exploitable que si un document `Gateway`
    // actif existe pour elle.
    if (!(await this.flutterwaveApi.hasCredentials(built.resolved.currency))) {
      throw new NotFoundException(
        `No Flutterwave gateway credentials configured for currency "${built.resolved.currency}"`,
      );
    }

    const savedTransaction =
      await this.transactionService.createTransaction(transactionData);
    if (!savedTransaction) {
      throw new NotFoundException('Error to save transaction details');
    }

    await this.payinService.createPendingPayin({
      txRef,
      amount: Number(savedTransaction.paymentWithTaxes),
      currency,
      customerEmail: charge.email || '',
      customerName: charge.name || 'Customer',
      transactionId: savedTransaction._id,
      userId: transactionData.senderId
        ? String(transactionData.senderId)
        : undefined,
      channel: 'mobile_money',
      meta: { flow: charge.flow, ...(charge.meta ?? {}) },
    });

    let chargeResult: any;
    try {
      chargeResult = await this.flutterwaveApi.chargeMobileMoney(
        built.chargeType,
        built.body,
        built.resolved.currency,
      );
    } catch (error: any) {
      await this.recordChargeFailure(
        txRef,
        String(savedTransaction._id),
        error,
      );
      throw error;
    }

    const { status: payinStatus, flwTxId } = await this.recordChargeResult(
      txRef,
      String(savedTransaction._id),
      chargeResult,
    );

    if (flwTxId) {
      try {
        await this.transactionService.updateTransactionFlwTxId(
          String(savedTransaction._id),
          flwTxId,
        );
      } catch (error: any) {
        this.logger.warn(
          `Could not attach Flutterwave id ${flwTxId} to transaction ${String(
            savedTransaction._id,
          )}: ${error?.message ?? 'unknown error'}`,
        );
      }
    }

    if (payinStatus === PayinStatus.SUCCESSFUL) {
      // Same guarded, idempotent claim path as the webhook.
      await this.processSuccessfulPayin(
        savedTransaction,
        String(savedTransaction._id),
      );
    }

    return {
      status: 'pending',
      transactionId: String(savedTransaction._id),
      txRef,
      amount: Number(savedTransaction.paymentWithTaxes),
      currency,
      provider: PayinProvider.FLUTTERWAVE,
      network: built.resolved.network,
      chargeStatus: payinStatus,
      redirect_url: chargeResult?.meta?.authorization?.redirect_url || '',
    };
  }

  /**
   * Builds a rejection that happened BEFORE any Flutterwave request was issued.
   *
   * The `code` is what `isPreChargeRejection` keys on, so callers can safely fall
   * back to another payment route. It must never be used once a charge call has
   * been made — that is exactly how a double charge happens.
   *
   * @param {string} code - Machine-readable reason.
   * @param {string} message - Human-readable reason.
   * @returns {HttpException} - 400 with the pre-charge `code`.
   */
  private preChargeRejection(code: string, message: string): HttpException {
    return new HttpException({ message, code }, HttpStatus.BAD_REQUEST);
  }

  /**
   * Maps a Flutterwave charge status onto the local `PayinStatus`.
   *
   * Unknown or absent statuses stay `pending` ON PURPOSE: the webhook and the
   * reconciliation cron are the authority, and defaulting to `failed` would mark
   * a payment the payer may still approve on their phone.
   *
   * @param {unknown} status - `data.status` from the charge envelope.
   * @returns {PayinStatus} - The local status.
   */
  private mapChargeStatusToPayinStatus(status: unknown): PayinStatus {
    const value = String(status ?? '')
      .trim()
      .toLowerCase();

    if (value === 'successful' || value === 'success') {
      return PayinStatus.SUCCESSFUL;
    }
    if (value === 'failed' || value === 'error') {
      return PayinStatus.FAILED;
    }
    if (value === 'cancelled' || value === 'canceled') {
      return PayinStatus.CANCELLED;
    }

    return PayinStatus.PENDING;
  }

  /**
   * Reduces a charge failure to a persistable, secret-free description.
   *
   * Flutterwave error payloads can embed request context, so only the message,
   * the machine-readable code and the upstream status are kept — never headers
   * or credentials.
   *
   * @param {any} error - Anything thrown by the charge path.
   * @returns {Record<string, any>} - Safe description for the `Payin.error` field.
   */
  private describeChargeError(error: any): Record<string, any> {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      const payload =
        response && typeof response === 'object'
          ? (response as Record<string, any>)
          : { message: String(response) };

      const description: Record<string, any> = {
        source: 'flutterwave',
        message:
          payload.message ??
          payload.error ??
          error.message ??
          'Direct charge failed',
        upstreamStatus: error.getStatus(),
      };
      if (payload.code !== undefined) description.code = payload.code;

      return description;
    }

    return {
      source: 'flutterwave',
      message: error?.message ? String(error.message) : 'Direct charge failed',
    };
  }

  async createTransferFromBalance(transactionData: any, userId: any) {
    const amount = Number(transactionData?.estimation);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'Invalid transfer amount' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Vérifier les limites de retrait (un transfert depuis le solde est un retrait)
    const senderCurrency = String(transactionData?.senderCurrency || '');
    if (senderCurrency) {
      await this.transactionService.validateTransactionLimit(
        amount,
        senderCurrency,
        'withdrawal',
      );
    }

    const customRate = Number(transactionData?.invoiceTaxes) || undefined;
    const taxesDetails = await this.transactionService.calculateTaxesAmount(
      amount,
      customRate,
    );
    const totalToDebit = Number(taxesDetails.paymentWithTaxes);
    if (!senderCurrency) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'Missing sender currency' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const raw = {
      ...transactionData,
      userId,
      senderId: userId,
      status: TStatus.PAYINSUCCESS,
      paymentSource: 'account_balance',
      txRef: this.payoutService.generateTxRef('txBalanceTransfer'),
      invoiceTaxes: taxesDetails.invoiceTaxes,
      taxesAmount: taxesDetails.taxesAmount,
      paymentWithTaxes: totalToDebit,
    };

    await this.balanceService.debitBalance(
      String(userId),
      totalToDebit,
      senderCurrency,
    );

    let savedTransaction: any;
    try {
      savedTransaction = await this.transactionService.createTransaction(raw);
      if (!savedTransaction) {
        throw new NotFoundException('Error to save transaction details');
      }

      void this.operationNotificationService
        .notifyAdminPayoutPending(savedTransaction)
        .catch(() => undefined);

      void this.auditLogService.record({
        actorId: String(userId),
        action: 'transfer.from_balance',
        resourceType: 'transaction',
        resourceId: String(savedTransaction._id),
        metadata: {
          amount: totalToDebit,
          currency: senderCurrency,
          txRef: raw.txRef,
        },
      });

      return {
        status: 'pending',
        transactionId: savedTransaction._id,
        transaction: savedTransaction,
      };
    } catch (error) {
      const rollbackKey = savedTransaction
        ? `transfer-rollback:${String(savedTransaction._id)}`
        : undefined;
      await this.balanceService
        .creditBalance(
          String(userId),
          totalToDebit,
          senderCurrency,
          rollbackKey,
        )
        .catch((rollbackError) => {
          this.logger.error(
            `Balance transfer rollback failed: ${rollbackError?.message || rollbackError}`,
          );
        });
      throw error;
    }
  }

  parseTransactionToSubscription(transaction) {
    return this.subscriptionService.parseTransactionToSubscription(transaction);
  }

  async verifyPayin(txRef: string, flwTxId?: string) {
    const payin: any = await this.payinService.verifyPayin(
      txRef,
      false,
      flwTxId,
    );
    if (!payin) {
      throw new NotFoundException('Payin not found');
    }
    const transaction = await this.transactionService.findById(
      String(payin.transactionId),
    );
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    if (payin.status === 'cancelled') {
      /* Keep the transaction "pending" because the user can
      relaunch new payment attempts on the flutterwave front
      and if the status is no longer in this "pending" state,
      the cron will no longer update it with checks. The "payin cron"
      will take care of closing after 15 minutes with veryfyAndClose. */

      // await this.transactionService.updateTransactionStatus(
      //   String(payin.transactionId),
      //   this.tStatus.PAYINCLOSED,
      // );
      // return { message: 'Payin cancelled', status: 'cancelled' };
      return { message: 'Payin pending', status: 'pending' };
    } else if (payin.status === 'failed') {
      /* Keep the transaction "pending" because the user can
        relaunch new payment attempts on the flutterwave front
        and if the status is no longer in this "pending" state,
        the cron will no longer update it with checks. The "payin cron"
        will take care of closing after 15 minutes. */

      // await this.transactionService.updateTransactionStatus(
      //   String(payin.transactionId),
      //   this.tStatus.PAYINFAILED,
      // );
      // return { message: 'Payin failed', status: 'failed' };

      return { message: 'Payin pending', status: 'pending' };
    } else if (payin.status === 'successful') {
      try {
        const alreadySuccessful = await this.transactionService.findById(
          String(payin.transactionId),
        );
        if (alreadySuccessful?.status === this.tStatus.PAYINSUCCESS) {
          await this.repairInvoiceFinalization(transaction);
          return { message: 'Payin already successful', status: 'successful' };
        }

        await this.processSuccessfulPayin(
          transaction,
          String(payin.transactionId),
        );
        return { message: 'Payin already successful', status: 'successful' };
      } catch (err) {
        return {
          message: '(fw service: verifyAndClosePayin) Error: ' + err,
          status: 'error',
        };
      }
    } else {
      /* Keep the transaction "pending" because the user can
        relaunch new payment attempts on the flutterwave front
        and if the status is no longer in this "pending" state,
        the cron will no longer update it with checks. The "payin cron"
        will take care of closing after 15 minutes. */

      // if (transaction.status !== this.tStatus.PAYINPENDING) {
      //   await this.transactionService.updateTransactionStatus(
      //     String(payin.transactionId),
      //     this.tStatus.PAYINPENDING,
      //   );
      // }
      return { message: 'Payin pending', status: 'pending' };
    }
  }

  async verifyAndClosePayin(txRef: string, flwTxId?: string) {
    const payin: any = await this.payinService.verifyPayin(
      txRef,
      true,
      flwTxId,
    );
    if (!payin) {
      throw new NotFoundException('Payin not found');
    }
    const transaction = await this.transactionService.findById(
      String(payin.transactionId),
    );
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (
      payin.status === 'cancelled' &&
      transaction.status === this.tStatus.PAYINCLOSED
    ) {
      await this.transactionService.updateTransactionStatus(
        String(payin.transactionId),
        this.tStatus.PAYINCLOSED,
        payin.raw.data,
      );
      await this.systemBalanceService.updateMovementStatusByTransaction(
        String(payin.transactionId),
        'cancelled',
      );
      return { message: 'Payin already cancelled', status: 'cancelled' };
    }

    if (payin.status === 'cancelled') {
      await this.transactionService.updateTransactionStatus(
        String(payin.transactionId),
        this.tStatus.PAYINCLOSED,
      );
      if (transaction.transactionType === 'paymentRequest') {
        await this.paymentRequestService.updatePaymentRequestStatusByTransaction(
          String(payin.transactionId),
          PaymentRequestStatus.CANCELED,
        );
      }
      await this.payinService.updatePayinStatus(txRef, 'cancelled');
      await this.systemBalanceService.updateMovementStatusByTransaction(
        String(payin.transactionId),
        'cancelled',
      );
      return { message: 'Payin cancelled', status: 'cancelled' };
    }

    if (payin.status === 'failed') {
      try {
        // console.log('transaction to Updated: ', String(payin.transactionId));
        const transactionUpdated =
          await this.transactionService.updateTransactionStatus(
            String(payin.transactionId),
            this.tStatus.PAYINERROR,
            payin.raw,
          );
        if (transaction.transactionType === 'paymentRequest') {
          await this.paymentRequestService.updatePaymentRequestStatusByTransaction(
            String(payin.transactionId),
            PaymentRequestStatus.FAILED,
          );
        }
        // console.log('transactionUpdated: ', transactionUpdated);
        await this.payinService.updatePayinStatus(txRef, 'failed');
        await this.systemBalanceService.updateMovementStatusByTransaction(
          String(payin.transactionId),
          'failed',
        );
        return { message: 'Payin failed', status: 'failed' };
      } catch {
        return {
          message:
            '(fw service: verifyAndClosePayin) error to handle failed payin',
          status: 'failed',
        };
      }
    }

    if (payin.status === 'successful') {
      try {
        const alreadySuccessful = await this.transactionService.findById(
          String(payin.transactionId),
        );
        if (alreadySuccessful?.status === this.tStatus.PAYINSUCCESS) {
          await this.repairInvoiceFinalization(transaction);
          return { message: 'Payin already successful', status: 'successful' };
        }

        await this.processSuccessfulPayin(
          transaction,
          String(payin.transactionId),
        );
        return { message: 'Payin already successful', status: 'successful' };
      } catch (err) {
        return {
          message: '(fw service: verifyAndClosePayin) Error: ' + err,
          status: 'error',
        };
      }
    }

    if (
      payin.status === 'pending' &&
      this.payinService.hasExpiredInMinutes(payin.createdAt, 480) // 480mn = 8hours expiredt
    ) {
      await this.payinService.updatePayinStatus(txRef, 'cancelled');
      await this.transactionService.updateTransactionStatus(
        String(payin.transactionId),
        this.tStatus.PAYINCLOSED,
      );
      return {
        message: 'Payin closed',
        status: 'cancelled',
      };
    }

    return { message: 'Unknow status', status: 'Unknow' };
  }

  handleTransfer(transaction) {
    try {
      void this.operationNotificationService
        .notifyAdminPayoutPending(transaction)
        .catch(() => undefined);
    } catch (err) {
      console.error('(fw service: handleTransfer) Error: ', err);
    }
  }

  async notifyAdminPayoutPending(transaction: any): Promise<void> {
    await this.operationNotificationService.notifyAdminPayoutPending(
      transaction,
    );
  }

  /**
   * Répare la finalisation d'une facture restée bloquée en "en attente" :
   * appelée quand la transaction est déjà au statut PAYINSUCCESS mais que
   * la facture n'a jamais été marquée payée.
   */
  private async repairInvoiceFinalization(transaction: any): Promise<void> {
    await this.handleInvoice(transaction);
  }

  /**
   * Répare la facture lors du polling public (get-txRef) : si le payin est
   * réussi mais que la facture n'est pas encore marquée payée, elle l'est
   * immédiatement, même quand la transaction a déjà été réclamée.
   */
  async repairInvoiceFinalizationByTxRef(txRef: string): Promise<any> {
    const payin = await this.payinService.getPayinByTxRef(txRef);
    if (payin?.status !== 'successful' || !payin.transactionId) {
      return payin;
    }
    try {
      const transaction = await this.transactionService.findById(
        String(payin.transactionId),
      );
      if (transaction) {
        await this.processSuccessfulPayin(
          transaction,
          String(payin.transactionId),
        );
      }
    } catch (err) {
      this.logger.error('repairInvoiceFinalizationByTxRef: failed', err);
    }
    return payin;
  }

  /**
   * Réconciliation : finalise les payins marqués `successful` par la
   * passerelle mais dont la transaction n'a jamais été clôturée
   * (webhook non délivré, erreur transitoire lors du `processSuccessfulPayin`).
   * `processSuccessfulPayin` étant idempotent, relancer est sûr.
   */
  async reconcileSuccessfulPayins(): Promise<number> {
    const unclaimed = await this.payinService.findSuccessfulUnclaimed(100);
    let adjusted = 0;
    for (const payin of unclaimed) {
      const transactionId = String(payin.transactionId || '');
      try {
        // `processSuccessfulPayin` est idempotent (claim, crédit via clé
        // unique, finalisation facture) : on l'appelle même si la transaction
        // est déjà `PAYINSUCCESS` afin de réparer un crédit de solde manquant.
        const transaction =
          await this.transactionService.findById(transactionId);
        if (transaction) {
          await this.processSuccessfulPayin(transaction, transactionId);
          adjusted++;
        }
      } catch (err: any) {
        this.logger.warn(
          `reconcileSuccessfulPayins: ${payin.txRef} failed: ${err?.message}`,
        );
      }
    }
    return adjusted;
  }

  async processSuccessfulPayin(transaction: any, transactionId: string) {
    const claimed =
      await this.transactionService.claimTransactionForSuccessfulPayin(
        transactionId,
      );

    // La facture doit être marquée payée même si la transaction a déjà été
    // réclamée (statut PAYINSUCCESS) : cela répare les paiements restés
    // bloqués en "en attente" lors d'une précédente tentative échouée.
    // Ce handle s'exécute dans le bloc "toujours", hors de la garde `claimed`.
    await this.handleInvoice(transaction);

    // Le crédit du solde est idempotent (clé balance_movements unique) :
    // il s'exécute même si la transaction a déjà été réclamée, afin de
    // réparer les paiements crédités jamais (ex. claim passé sans crédit).
    // S'il existe déjà (créé en `pending` à la création du payin), il est
    // passé à `completed` et le crédit est appliqué une seule fois.
    const isSystemPayin = transaction.transactionType === 'systemPayin';
    const isUserCreditType =
      transaction.transactionType !== 'withdrawal' &&
      transaction.transactionType !== 'transfer' &&
      !isSystemPayin;

    if (isSystemPayin) {
      // Recharge du solde système : créditer le montant de BASE (estimation)
      // moins la commission du provider gateway. Ex. estimation 15 @ 3% →
      // 0.45 de commission provider, solde crédité de 14.55.
      const systemAmount = Number(transaction.estimation) || 0;
      if (systemAmount > 0) {
        const systemKey = `system-payin-credit:${transactionId}`;
        try {
          let commission = 0;
          try {
            const gw = transaction.gatewayId
              ? await this.gatewayModel
                  .findById(transaction.gatewayId)
                  .lean()
                  .exec()
              : null;
            const rate = Number(gw?.providerCommission) || 0;
            if (rate > 0) {
              commission = Math.ceil((systemAmount * rate) / 100);
            }
          } catch {
            commission = 0;
          }
          const amountCredited = Math.max(systemAmount - commission, 0);
          const collected =
            Number(transaction.paymentWithTaxes) || systemAmount;
          if (amountCredited > 0) {
            await this.systemBalanceService.creditSystemBalance(
              transaction.senderCurrency || transaction.receiverCurrency,
              amountCredited,
              systemKey,
              {
                reference: transaction.txRef || transactionId,
                description: 'Recharge du solde système',
                transactionId,
                amountCollected: collected,
                gatewayFee: 0,
                providerCommission: commission,
                amountCredited,
                performedBy: {
                  userId: String(
                    transaction.senderId || transaction.userId || '',
                  ),
                  name: String(transaction.senderName || '').trim(),
                  email: String(transaction.senderEmail || '').trim(),
                },
              },
            );
          }
        } catch (err) {
          this.logger.warn(
            'processSuccessfulPayin: system payin credit failed',
            err,
          );
        }
      }
    } else if (isUserCreditType) {
      // Déterminer qui paie la commission
      const commissionPayer = transaction.commissionPayer || 'customer';
      let userCreditAmount: number;

      if (commissionPayer === 'organization') {
        // Organisation paie : l'utilisateur reçoit le montant COMPLET (estimation)
        userCreditAmount = Number(transaction.estimation);
      } else {
        // Client paie : l'utilisateur reçoit le montant net (estimation)
        // La commission est implicitement dans paymentWithTaxes - estimation
        userCreditAmount = Number(transaction.estimation);
      }

      const creditKey = `payin-credit:${transactionId}`;
      try {
        const alreadyCredited =
          await this.balanceService.hasMovementKey(creditKey);
        if (!alreadyCredited) {
          await this.balanceService.creditBalance(
            transaction.receiverId,
            userCreditAmount,
            transaction.senderCurrency,
            creditKey,
          );
        }
      } catch (err) {
        // Un échec de crédit du solde ne doit pas empêcher la finalisation
        // du paiement (ex. devise non conforme, pays non renseigné).
        this.logger.warn('processSuccessfulPayin: creditBalance failed', err);
      }

      // Créditer le solde système : différence entre ce qui a été collecté et ce qui a été crédité à l'utilisateur
      const totalCollected = Number(transaction.paymentWithTaxes) || 0;
      const userCredited = userCreditAmount;
      const systemShare = Math.max(totalCollected - userCredited, 0);

      if (systemShare > 0) {
        const systemKey = `system-fees-credit:${transactionId}`;
        const alreadyCredited =
          await this.systemBalanceService.hasMovementKey(systemKey);
        if (!alreadyCredited && systemShare > 0) {
          await this.systemBalanceService.creditSystemBalance(
            transaction.senderCurrency || transaction.receiverCurrency,
            systemShare,
            `system-fees-credit:${transactionId}`,
            {
              reference: transaction.txRef || transactionId,
              description: `Répartition encaissement (commission: ${commissionPayer})`,
              transactionId,
              amountCollected: totalCollected,
              gatewayFee: 0,
              providerCommission: totalCollected - userCreditAmount,
              amountCredited: systemShare,
              performedBy: {
                userId: String(
                  transaction.senderId || transaction.userId || '',
                ),
                name: String(transaction.senderName || '').trim(),
                email: String(transaction.senderEmail || '').trim(),
              },
            },
          );
        }
      }
    }

    if (!claimed) {
      return;
    }

    if (transaction.transactionType === 'subscription') {
      await this.handleSubscription(transaction);
    }
    if (transaction.transactionType === 'service') {
      await this.handleService(transaction);
    }
    if (transaction.transactionType === 'withdrawal') {
      await this.handleWithdrawal(claimed);
    }
    if (transaction.transactionType === 'apiCall') {
      await this.handleApiCall(claimed);
    }
    if (transaction.transactionType === 'fundraising') {
      await this.handleFundraising(claimed);
    }
    if (transaction.transactionType === 'paymentRequest') {
      await this.handlePaymentRequest(claimed);
    }
    if (transaction.transactionType === 'transfer') {
      await this.handleTransfer(claimed);
    }

    return;
  }

  /**
   * Finalise une facture liée à un payin réussi. Idempotent : exécuté même
   * quand la transaction a déjà été réclamée (statut PAYINSUCCESS), afin de
   * réparer les factures restées en attente malgré un encaissement réussi
   * par la passerelle.
   */
  async handleInvoice(transaction: any): Promise<void> {
    if (
      transaction?.transactionType !== 'invoice' ||
      !transaction?.invoiceId ||
      transaction.payed
    ) {
      return;
    }
    try {
      await this.invoiceService.handlePaymentSuccess(transaction);
      transaction.payed = true;
    } catch (err) {
      this.logger.error('handleInvoice: invoice finalize failed', err);
    }
  }

  async handleSubscription(transaction) {
    try {
      const getEntityId = (value: any): string | undefined => {
        if (!value) return undefined;
        if (typeof value === 'string') return value;
        if (typeof value === 'object' && value._id) {
          return value._id?.toString?.() || String(value._id);
        }
        return value?.toString?.();
      };

      const subscriberId =
        getEntityId(transaction?.userId) || getEntityId(transaction?.senderId);
      const planId = getEntityId(transaction?.planId);

      if (!subscriberId || !planId) {
        throw new NotFoundException(
          'Missing subscriberId or planId for subscription transaction',
        );
      }

      // console.log('handleSubscription - userId: ', subscriberId);
      // console.log('handleSubscription - planId: ', planId);

      const subscriptionStatus =
        await this.subscriptionService.verifySubscription(subscriberId, planId);
      // console.log('handleSubscription - subscriptionStatus: ', subscriptionStatus);

      let resp: any = '';
      if (subscriptionStatus.existingSubscription === true) {
        // Existing subscription: subscribe() upgrades with transactionId
        resp = await this.subscriptionService.subscribe(
          subscriptionStatus.data,
          transaction._id,
        );
      } else {
        // Missing subscription: create then subscribe
        const payload =
          this.subscriptionService.parseTransactionToSubscription(transaction);
        resp = await this.subscriptionService.createSubscriptionWithTransaction(
          payload,
          transaction._id,
        );
      }

      // Send notification
      // this.whatsappService.sendNewSubscriberMessage(transaction.planId.toString(), transaction.userId.toString(), transaction._id.toString());
      return;
    } catch (err) {
      console.error('(fw service: handleSubscription) Error: ', err);
      throw err;
    }
  }

  async handleService(transaction) {
    try {
      const existingServicePayment =
        await this.servicePaymentService.findByTransactionId(
          transaction?._id?.toString?.() || String(transaction?._id || ''),
        );

      if (!existingServicePayment) {
        await this.createServicePayment(transaction);
      }

      void this.operationNotificationService.notifyServicePaymentSuccess(
        transaction,
      );
    } catch (err) {
      return {
        message:
          '(fw service: handleService) Error operationNotificationService: ' +
          err,
        status: 'error',
      };
    }
  }

  handleWithdrawal(transaction) {
    try {
      void this.operationNotificationService
        .notifyAdminPayoutPending(transaction)
        .catch(() => undefined);
    } catch (err) {
      console.error('(fw service: handleWithdrawal) Error: ', err);
      return {
        message: '(fw service: handleWithdrawal) Error: ' + err,
        status: 'error',
      };
    }
  }

  async handleApiCall(transaction) {
    // try {
    //   const newBalence = await this.balanceService.creditBalance(
    //     transaction.receiverId,
    //     Number(transaction.estimation),
    //     transaction.senderCurrency,
    //   );
    //   return newBalence;
    // } catch (err) {
    //   return {
    //     message: '(fw service: handleApiCall) Error: ' + err,
    //     status: 'error',
    //   };
    // }
  }

  async handleFundraising(transaction) {
    try {
      await this.fundraisingService.handleSuccessfulDonation(transaction);
      return true;
    } catch (err) {
      return {
        message: '(fw service: handleFundraising) Error: ' + err,
        status: 'error',
      };
    }
  }

  async handlePaymentRequest(transaction) {
    try {
      await this.paymentRequestService.handlePaymentRequest(transaction);
      return true;
    } catch (err) {
      console.error('(fw service: handlePaymentRequest) Error: ', err);
      throw err;
    }
  }

  async creditBalanceForPaymentRequest(transaction: any) {
    const txId = String(transaction._id || '');
    return this.balanceService.creditBalance(
      transaction.receiverId || transaction.userId,
      Number(transaction.estimation),
      transaction.senderCurrency || transaction.receiverCurrency,
      `payment-request-credit:${txId}`,
    );
  }

  async createSubscriptionOfTransaction(transaction) {
    const payload =
      this.subscriptionService.parseTransactionToSubscription(transaction);
    await this.subscriptionService.subscribe(payload, transaction._id);
  }

  async createServicePayment(transaction) {
    const payload =
      this.servicePaymentService.parseTransactionToServicePayment(transaction);
    await this.servicePaymentService.createServicePayment(payload);
  }

  async openPayin(txRef: string, userId: string) {
    const payin: any = await this.payinService.getPayinByTxRef(txRef);
    // console.log('verify an open payin:', payin);
    if (!payin) {
      throw new NotFoundException('Payin not found');
    }
    if (String(payin.userId) !== String(userId)) {
      throw new UnauthorizedException('Unauthorized');
    }

    const transaction = await this.transactionService.findById(
      String(payin.transactionId),
    );
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (
      payin.status === 'pending' ||
      payin.status === 'cancelled' ||
      payin.status === 'failed'
    ) {
      if (
        transaction.status === this.tStatus.PAYINCLOSED ||
        transaction.status === this.tStatus.INITIALIZED ||
        transaction.status === this.tStatus.PAYINERROR ||
        transaction.status === this.tStatus.PAYINPENDING
      ) {
        // console.log('In update status to pending');
        await this.payinService.updatePayinStatus(txRef, 'pending');
        await this.transactionService.updateTransactionStatus(
          String(payin.transactionId),
          this.tStatus.PAYINPENDING,
        );
        return { message: 'Payin opened', status: 'pending' };
      }
      return {
        message: 'Payin is in pending but transaction data is in Payout',
        status: 'error',
      };
    }
    // Mark transaction as completed
    // transaction.tStatus = 'COMPLETED';
    // await transaction.save();
    return {
      message: 'Payin is in pending but transaction data is in Payou',
      status: 'error',
    };
  }

  // ---------- Payouts ----------
  async payout(transactionId: string, userId: any, retrying: boolean = false) {
    const tx = await this.transactionService
      .findById(transactionId)
      .catch(() => null);
    const currency = tx?.receiverCurrency || tx?.senderCurrency || 'XAF';

    let methodGwId: string | undefined;
    if (tx?.paymentMethod) {
      const method = await this.paymentMethodService
        .findByCode(tx.paymentMethod)
        .catch(() => null);
      const gw = method?.gatewayId as any;
      methodGwId = gw?._id ? String(gw._id) : gw ? String(gw) : undefined;
    }

    await this.loadDbCredentials(currency, methodGwId);

    // Retraits initiés via /dev/payout : pas de retry direct sur la même
    // transaction. Le compte API doit créer une nouvelle requête (qui
    // re-débitera son solde) pour relancer le paiement Flutterwave.
    if (retrying) {
      const current = await this.transactionService.findById(transactionId);
      if (current?.isApiPayout === true) {
        throw new ConflictException(
          'Retry not allowed for API payouts. Create a new payout request from the API instead.',
        );
      }
    }

    const transaction =
      await this.transactionService.claimTransactionForPayout(transactionId);
    if (!transaction) {
      const current = await this.transactionService.findById(transactionId);
      if (!current) {
        throw new NotFoundException('Transaction not found');
      }
      throw new ConflictException(
        'Payout already initiated or transaction not eligible for payout',
      );
    }
    const newTxRef = this.payoutService.generateTxRef('txPayout');
    transaction.reference = newTxRef;
    transaction.txRef = transaction.txRef || newTxRef; // Save old txRef (if it is retry)

    const payloadPayout = {
      accountBankCode: transaction.bankCode,
      accountNumber: transaction.bankAccountNumber,
      amount:
        transaction.transactionType === 'transfer'
          ? transaction.receiverAmount
          : transaction.estimation,
      destinationCurrency: transaction.receiverCurrency,
      sourceCurrency: transaction.receiverCurrency,
      reference: newTxRef,
      transactionId: String(transaction._id),
      narration: this.toAlphanumeric(transaction.raisonForTransfer),
      txRef: transaction.txRef || newTxRef, // Save old txRef (if it is retry)
      userId: userId,
      type: this.getreceiverAccountType(transaction), // 'bank' | 'mobile_money' | 'wallet'
    };

    // Flutterwave exige l'indicatif pays pour les comptes mobile money
    const cc = transaction.receiverCountryCode || '237';
    if (
      payloadPayout.type === 'mobile_money' &&
      payloadPayout.accountNumber &&
      !payloadPayout.accountNumber.startsWith(cc)
    ) {
      payloadPayout.accountNumber = cc + payloadPayout.accountNumber;
    }

    // KES payouts are processed through direct M-Pesa integration (Daraja API).
    if (String(payloadPayout.destinationCurrency).toUpperCase() === 'KES') {
      try {
        await this.payoutService.initiateMpesaPayout(
          transaction,
          String(userId),
          newTxRef,
        );
        return this.transactionService.findById(transactionId);
      } catch (err: any) {
        const errorPayload =
          typeof err?.getResponse === 'function'
            ? err.getResponse()
            : (err?.response?.data ?? {
                message: err?.message ?? 'M-Pesa payout initiation failed',
              });
        await this.transactionService
          .updateTransactionStatus(
            transactionId,
            TStatus.PAYOUTERROR,
            errorPayload,
          )
          .catch(() => undefined);
        throw err;
      }
    }

    // console.log('Payout creation: ', payloadPayout);
    //     {
    //   "accountBankCode": "MTN",
    //   "accountNumber": "237672764405",
    //   "amount": 100,
    //   "destinationCurrency": "XAF",
    //   "sourceCurrency": "XAF",
    //   "reference": "payout_ref_test105",
    //   "narration": "Paiement Orange Money CM",
    //   "type": "mobile_money"
    // }

    const countryCode = this.toIso2(payloadPayout.destinationCurrency);
    let headers: any;

    if (countryCode == 'CM') {
      headers = this.authHeader();
    } else if (countryCode == 'NG') {
      headers = this.authHeaderNGN();
    } else {
      // for coming FW accounts
      headers = this.authHeader();
    }
    try {
      const payload = {
        account_bank: (payloadPayout.accountBankCode || '').toUpperCase(), // bank or MoMo operator
        account_number: payloadPayout.accountNumber, // account number or MSISDN
        amount: Number(payloadPayout.amount),
        currency: payloadPayout.destinationCurrency,
        reference: payloadPayout.reference,
        narration: payloadPayout.narration,
        debit_currency: payloadPayout.sourceCurrency,
        beneficiary_name: this.normalizeProviderFullName(
          transaction.receiverName,
          'receiverName',
        ),
        meta: [
          {
            beneficiary_country: this.toIso2(transaction.receiverCountryCode),
            sender: this.normalizeProviderFullName(
              transaction.senderName,
              'senderName',
            ),
            sender_address: transaction.senderCountry,
            sender_country: transaction.senderCountry,
            sender_mobile_number: transaction.senderContact,
          },
        ],
      };

      // console.log('payload for sending: ', payload);

      const res = await firstValueFrom(
        this.http.post(`${this.fwBaseUrlV3}/transfers`, payload, {
          headers,
        }),
      );

      // console.log('res of fw: ', res);
      const doc = await this.payoutService.createPayout(
        payloadPayout,
        res.data,
      );

      const resp = { api: 'v3', ...res.data, saved: doc };
      // const update = await this.transactionService.updateTransactionStatus(
      //   transactionId,
      //   this.normalizeStatus(res.data?.data?.status),
      //   resp,
      // );

      const update = await this.transactionService.updateTransactionStatus(
        transactionId,
        this.normalizeStatus(res.data?.data?.status),
        resp,
      );

      await this.transactionService.updateTransactionTxRef(
        transactionId,
        newTxRef,
      );

      const fwTransferId = String(res.data?.data?.id ?? '');
      if (fwTransferId) {
        await this.transactionService.updateTransactionFlwTxId(
          transactionId,
          fwTransferId,
        );
      }

      // console.log('update: ', update)
      return update;
    } catch (err) {
      const fwDetails = err?.response?.data ?? {
        message: err?.message ?? 'Flutterwave payout failed',
      };
      await this.transactionService
        .updateTransactionStatus(transactionId, TStatus.PAYOUTERROR, fwDetails)
        .catch(() => undefined);
      if (err?.response) {
        console.error('FW Error:', fwDetails);
        if (this.isInsufficientPayoutBalance(fwDetails)) {
          throw new HttpException(
            {
              message: 'Insufficient payout balance',
              code: 'INSUFFICIENT_PAYOUT_BALANCE',
              provider: 'flutterwave',
              details: fwDetails,
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      } else {
        console.error('Unexpected Error:', err);
      }
      throw err;
    }
  }

  async retryPayout(transactionId: string, userId) {
    const transaction = await this.transactionService.findById(transactionId);
    // console.log('transactionData', transaction);
    if (!transaction || transaction.status !== TStatus.PAYOUTERROR) {
      throw new NotFoundException(
        'Transaction not found or not payin success or not in payout error',
      );
    }

    try {
      await this.transactionService.reclaimPayoutFailureRefundForRetry(
        transactionId,
      );
      let update = await this.transactionService.updateTransactionStatus(
        transactionId,
        TStatus.PAYINSUCCESS,
      );

      // console.log('update: ', update);

      return this.payout(transactionId, userId, true);
    } catch (err) {
      if (err.response) {
        console.error('FW Error:', err.response.data);
      } else {
        console.error('Unexpected Error:', err);
      }
      throw err;
    }
  }

  getreceiverAccountType(transaction) {
    if (
      transaction.paymentMethod === 'OM' ||
      transaction.paymentMethod === 'MTN'
    )
      return 'mobile_money';
    else if (transaction.paymentMethod === 'BANK') return 'bank';
    else return 'wallet';
  }

  async verifyPayout(
    reference: string,
    verifyPayout = false,
    flwTxId?: string,
  ) {
    return await this.payoutService.verifyPayout(
      reference,
      verifyPayout,
      flwTxId,
    );
  }

  /**
   * Normalisation des statuts V3
   */
  private normalizeStatus(status: string): TStatus {
    const map: Record<string, TStatus> = {
      NEW: TStatus.PAYOUTPENDING,
      PENDING: TStatus.PAYOUTPENDING,
      QUEUED: TStatus.PAYOUTPENDING,
      SUCCESSFUL: TStatus.PAYOUTSUCCESS,
      FAILED: TStatus.PAYOUTERROR,
    };
    return map[status] || TStatus.PAYOUTPENDING;
  }

  /**
   * Every secret hash accepted for a Flutterwave webhook delivery.
   *
   * A multi-currency merchant account owns one gateway row per currency, each
   * with its own `secretHash`, and Flutterwave can notify with any of them. It
   * also makes the webhook work right after a restart, before any charge has run
   * `loadDbCredentials` on this process — a window in which `secretHash` is
   * still empty and a real payment used to be rejected with 401.
   *
   * SECURITY: only `flutterwave` gateways contribute. Accepting the credentials of
   * every gateway row (any provider, active or not) would lower webhook trust to
   * the weakest stored value — e.g. a leftover sandbox hash — and Flutterwave's
   * `verif-hash` is a merchant-level secret, not a per-row one.
   *
   * @returns {Promise<string[]>} - Non-empty secret hashes. Never the keys.
   */
  private async collectAcceptedWebhookHashes(): Promise<string[]> {
    try {
      const configs = await this.gatewayLoader.loadAllConfigs();
      const hashes = new Set<string>();

      for (const config of configs.values()) {
        if (String((config as any)?.type) !== 'flutterwave') continue;

        const credentials: any = (config as any)?.credentials ?? {};
        const hash =
          credentials.secretHash || credentials.FLUTTERWAVE_SECRET_HASH;

        if (typeof hash === 'string' && hash.length > 0) {
          hashes.add(hash);
        }
      }

      if (typeof this.secretHash === 'string' && this.secretHash.length > 0) {
        hashes.add(this.secretHash);
      }

      return [...hashes];
    } catch (error: any) {
      // Never reject a valid delivery because the gateway cache is unreachable:
      // the callee still compares against this instance's configured hash.
      this.logger.warn(
        `Could not load webhook hashes from gateways: ${
          error?.message ?? 'unknown error'
        }`,
      );
      return [];
    }
  }

  async verifyWebhookPayin(req) {
    const body = req.body ?? {};
    const event = body?.event;
    const txRef = body?.data?.tx_ref;
    const flwStatus = body?.data?.status;
    const signature = (req.headers as any)['verif-hash'] as string | undefined;

    let result: any;
    try {
      result = await this.payinService.verifyWebhook(
        req,
        await this.collectAcceptedWebhookHashes(),
      );
    } catch (err: any) {
      void this.auditLogService.record({
        action: 'webhook.flutterwave.rejected',
        resourceType: 'webhook',
        metadata: {
          event,
          txRef,
          flwStatus,
          reason: err?.message || 'invalid_signature',
          signaturePresent: !!signature,
        },
        method: 'POST',
        path: '/fw/webhook',
        statusCode: err?.status || 401,
      });
      throw err;
    }

    const payinSuccess =
      result?.payin?.status === 'successful' && result.payin.transactionId;
    if (payinSuccess) {
      try {
        const transaction = await this.transactionService.findById(
          String(result.payin.transactionId),
        );
        if (transaction) {
          await this.processSuccessfulPayin(
            transaction,
            String(result.payin.transactionId),
          );
        }
      } catch (err) {
        this.logger.error('Webhook processSuccessfulPayin failed', err);
        void this.auditLogService.record({
          action: 'webhook.flutterwave.process_error',
          resourceType: 'webhook',
          resourceId: String(result.payin.transactionId),
          metadata: { event, txRef, flwStatus, error: err?.message },
          method: 'POST',
          path: '/fw/webhook',
          statusCode: 500,
        });
      }
    } else if (
      body?.event === 'charge.completed' &&
      body?.data?.status === 'successful' &&
      txRef
    ) {
      // Le payin était déjà marqué successful (ex. vérification passée avant
      // l'arrivée du webhook) : on finalise quand même la transaction.
      try {
        const localPayin = await this.payinService.getPayinByTxRef(txRef);
        if (localPayin?.status === 'successful' && localPayin.transactionId) {
          const transaction = await this.transactionService.findById(
            String(localPayin.transactionId),
          );
          if (transaction) {
            await this.processSuccessfulPayin(
              transaction,
              String(localPayin.transactionId),
            );
          }
        }
      } catch (err) {
        this.logger.error(
          'Webhook already-successful finalization failed',
          err,
        );
      }
    }

    void this.auditLogService.record({
      action: payinSuccess
        ? 'webhook.flutterwave.processed'
        : 'webhook.flutterwave.ignored',
      resourceType: 'webhook',
      resourceId: result?.payin?.transactionId
        ? String(result.payin.transactionId)
        : undefined,
      metadata: { event, txRef, flwStatus, txId: result?.payin?.transactionId },
      method: 'POST',
      path: '/fw/webhook',
      statusCode: 200,
    });

    return result;
  }

  async getBanksList(country: string) {
    // console.log('getting balance');
    // const iso2 = this.toIso2(country);
    const iso2 = country;
    const url = `${this.fwBaseUrlV3}/banks/${encodeURIComponent(iso2)}`;
    try {
      const res = await firstValueFrom(
        this.http.get(url, { headers: this.authHeader() }),
      );
      // L’endpoint renvoie { status, message, data: [...] }
      return res.data?.data ?? res.data;
    } catch (e: any) {
      const fw = e?.response?.data;
      // message plus clair côté client
      throw new HttpException(
        {
          message:
            fw?.message ??
            `Impossible de récupérer les banques pour le pays "${iso2}"`,
          details: fw ?? e?.message,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private toIso2(country: string): string {
    const input = String(country).trim();

    // si déjà alpha-2
    if (/^[A-Za-z]{2}$/.test(input)) return input.toUpperCase();

    // alpha-3 courants -> alpha-2
    const a3: Record<string, string> = {
      CMR: 'CM',
      XAF: 'CM',
      Cameroon: 'CM',
      NGA: 'NG',
      NGN: 'NG',
      Nigeria: 'NG',
      GHA: 'GH',
      KEN: 'KE',
      RWA: 'RW',
      TZA: 'TZ',
      UGA: 'UG',
      ZAF: 'ZA',
      CIV: 'CI',
      SEN: 'SN',
      BEN: 'BJ',
      TGO: 'TG',
      MLI: 'ML',
      BFA: 'BF',
      NER: 'NE',
      COD: 'CD',
      COG: 'CG',
      MAR: 'MA',
      TUN: 'TN',
      DZA: 'DZ',
      ETH: 'ET',
      ZMB: 'ZM',
    };
    if (/^[A-Za-z]{3}$/.test(input) && a3[input.toUpperCase()]) {
      return a3[input.toUpperCase()];
    }

    // indicatifs téléphoniques -> alpha-2 (liste ciblée; ajoute au besoin)
    const dial: Record<string, string> = {
      '237': 'CM',
      '234': 'NG',
      '233': 'GH',
      '254': 'KE',
      '250': 'RW',
      '255': 'TZ',
      '256': 'UG',
      '27': 'ZA',
      '225': 'CI',
      '221': 'SN',
      '228': 'TG',
      '229': 'BJ',
      '223': 'ML',
      '226': 'BF',
      '227': 'NE',
      '243': 'CD',
      '242': 'CG',
      '212': 'MA',
      '216': 'TN',
      '213': 'DZ',
      '251': 'ET',
      '260': 'ZM',
    };
    if (/^\d{1,4}$/.test(input) && dial[input]) return dial[input];

    // fallback : on renvoie tel quel (laissera FW répondre "invalid country")
    return input.toUpperCase();
  }

  // --- Payment Plans & Subscriptions (Flutterwave V3) ---

  /**
   * Create a payment plan on Flutterwave (POST /v3/payment-plans)
   * planDto example:
   * {
   *   name: 'Monthly Plan Basic',
   *   amount: 1000,           // integer (minor units depending on currency rules) — FW expects decimal/truncation per docs
   *   currency: 'XAF',
   *   interval: 'monthly',    // 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'biannually' | 'annually'
   *   duration?: 12,          // optional number of cycles (null => indefinite)
   *   description?: '...'     // optional
   * }
   */
  async createPaymentPlan(planDto: {
    name: string;
    amount: number;
    currency?: string;
    interval: string;
    duration?: number | null;
    description?: string;
  }) {
    // console.log('Payload', planDto);
    // Accept JSON string payloads (common with some clients)
    if (typeof planDto === 'string') {
      try {
        planDto = JSON.parse(planDto) as any;
      } catch {
        throw new HttpException(
          { message: 'Invalid JSON payload' },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Support envelope { data: {...} }
    if (
      planDto &&
      typeof planDto === 'object' &&
      (planDto as any).data &&
      typeof (planDto as any).data === 'object'
    ) {
      planDto = (planDto as any).data as any;
    }

    // Defensive: ensure we have an object
    if (!planDto || typeof planDto !== 'object') {
      throw new HttpException(
        {
          message:
            'Payload is required. Hint: send JSON with Content-Type: application/json',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const allowedIntervals = new Set([
      'daily',
      'weekly',
      'monthly',
      'quarterly',
      'biannually',
      'annually',
    ]);

    // Basic validation to avoid useless calls to FW
    if (!planDto?.name || typeof planDto.name !== 'string') {
      throw new HttpException(
        { message: 'Plan name is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!planDto?.interval || !allowedIntervals.has(planDto.interval)) {
      throw new HttpException(
        {
          message: `Interval must be one of: ${[...allowedIntervals].join(', ')}`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!planDto?.amount || Number(planDto.amount) <= 0) {
      throw new HttpException(
        { message: 'Amount must be greater than 0' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const currency = planDto.currency || 'XAF';

    try {
      const payload: any = {
        name: String(planDto.name),
        amount: Number(planDto.amount), // Flutterwave expects a number (major units)
        interval: planDto.interval,
        currency,
      };
      if (planDto.duration != null) payload.duration = planDto.duration;
      if (planDto.description) payload.description = planDto.description;

      const headers = this.authHeader();

      const res = await firstValueFrom(
        this.http.post(`${this.fwBaseUrlV3}/payment-plans`, payload, {
          headers,
        }),
      );

      // console.log('FW createPaymentPlan response: ', res.data);
      return res.data; // direct FW response (status, message, data)
    } catch (err: any) {
      if (err.response) {
        console.error(
          'FW createPaymentPlan error: ' + JSON.stringify(err.response.data),
        );
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      console.error('Unexpected createPaymentPlan error: ' + err?.message);
      throw err;
    }
  }

  /**
   * List payment plans (GET /v3/payment-plans)
   */
  async getPaymentPlans(params?: { page?: number; perPage?: number }) {
    try {
      const url = `${this.fwBaseUrlV3}/payment-plans`;
      const res = await firstValueFrom(
        this.http.get(url, { headers: this.authHeader(), params }),
      );
      return res.data;
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      throw err;
    }
  }

  /**
   * Get a payment plan by id (GET /v3/payment-plans/{id})
   */
  async getPaymentPlan(planId: string) {
    try {
      const url = `${this.fwBaseUrlV3}/payment-plans/${encodeURIComponent(planId)}`;
      const res = await firstValueFrom(
        this.http.get(url, { headers: this.authHeader() }),
      );
      return res.data;
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      throw err;
    }
  }

  /**
   * Update a payment plan (PUT /v3/payment-plans/{id})
   * payload is partial fields you want to update (name, amount, interval, duration...)
   */
  async updatePaymentPlan(planId: string, payload: Record<string, any>) {
    try {
      const url = `${this.fwBaseUrlV3}/payment-plans/${encodeURIComponent(planId)}`;
      const res = await firstValueFrom(
        this.http.put(url, payload, { headers: this.authHeader() }),
      );
      return res.data;
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      throw err;
    }
  }

  /**
   * Cancel a payment plan (PUT /v3/payment-plans/{id}/cancel)
   */
  async cancelPaymentPlan(planId: string) {
    try {
      const url = `${this.fwBaseUrlV3}/payment-plans/${encodeURIComponent(planId)}/cancel`;
      const res = await firstValueFrom(
        this.http.put(url, {}, { headers: this.authHeader() }),
      );
      return res.data;
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      throw err;
    }
  }

  /**
   * Create a subscription (subscribe a customer to a plan)
   * This requires that the customer exists / you have a payment method (e.g. tokenized card) available.
   *
   * subscriptionDto example:
   * {
   *   plan: 'plan_id_from_fw',
   *   customer: {
   *     name: 'John Doe',
   *     email: 'john@example.com',
   *     phone_number: '237691224472'  // use the format expected by your FW account
   *   },
   *   // optional: start_date, authorization, // depends on FW support & your flow
   * }
   *
   * Note: For card recurring, you typically need a token/authorization id from a prior charge or saved token.
   */
  async createFwSubscription(subscriptionDto: {
    plan: string;
    customer: {
      name: string;
      email?: string;
      phone_number?: string;
      customer_code?: string;
    };
    authorization?: any; // optional, if you have saved authorization/token
    start_date?: string; // optional ISO date
  }) {
    try {
      const payload: any = {
        plan: subscriptionDto.plan,
        customer: subscriptionDto.customer,
      };
      if (subscriptionDto.authorization)
        payload.authorization = subscriptionDto.authorization;
      if (subscriptionDto.start_date)
        payload.start_date = subscriptionDto.start_date;

      const res = await firstValueFrom(
        this.http.post(`${this.fwBaseUrlV3}/subscriptions`, payload, {
          headers: this.authHeader(),
        }),
      );
      return res.data;
    } catch (err: any) {
      if (err.response) {
        console.error(
          'FW createSubscription error: ' + JSON.stringify(err.response.data),
        );
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      throw err;
    }
  }

  /**
   * Get subscriptions (GET /v3/subscriptions)
   */
  async getSubscriptions(params?: Record<string, any>) {
    try {
      const url = `${this.fwBaseUrlV3}/subscriptions`;
      const res = await firstValueFrom(
        this.http.get(url, { headers: this.authHeader(), params }),
      );
      return res.data;
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      throw err;
    }
  }

  /**
   * Get a subscription by id (GET /v3/subscriptions/{id})
   */
  async getSubscription(subscriptionId: string) {
    try {
      const url = `${this.fwBaseUrlV3}/subscriptions/${encodeURIComponent(subscriptionId)}`;
      const res = await firstValueFrom(
        this.http.get(url, { headers: this.authHeader() }),
      );
      return res.data;
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      throw err;
    }
  }

  /**
   * Activate subscription (PUT /v3/subscriptions/{id}/activate)
   */
  async activateSubscription(subscriptionId: string) {
    try {
      const url = `${this.fwBaseUrlV3}/subscriptions/${encodeURIComponent(subscriptionId)}/activate`;
      const res = await firstValueFrom(
        this.http.put(url, {}, { headers: this.authHeader() }),
      );
      return res.data;
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      throw err;
    }
  }

  /**
   * Deactivate subscription (PUT /v3/subscriptions/{id}/deactivate)
   */
  async deactivateSubscription(subscriptionId: string) {
    try {
      const url = `${this.fwBaseUrlV3}/subscriptions/${encodeURIComponent(subscriptionId)}/deactivate`;
      const res = await firstValueFrom(
        this.http.put(url, {}, { headers: this.authHeader() }),
      );
      return res.data;
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      throw err;
    }
  }

  // Virtual cards -----------------------

  // Create a virtual card
  // payload example:
  // {
  //   "currency": "USD",
  //   "amount": 50,
  //   "customer": {
  //     "name": "John Doe",
  //     "email": "john@example.com"
  //   },
  //   "billing": {
  //     "address": "1 Example St"
  //   },
  //   "meta": { / optional meta */ },
  //   "type": "virtual" // some implementations use card_type/type
  // }
  async createVirtualCard(
    countryWallet: string, // 'CM' | 'NG' | ...
    cardPayload: Record<string, any>,
  ) {
    // choisir la clé selon le wallet (comme pour les autres appels)
    let headers: any;
    if (countryWallet === 'CM') {
      headers = this.authHeader();
    } else if (countryWallet === 'NG') {
      headers = this.authHeaderNGN();
    } else {
      headers = this.authHeader(); // fallback
    }

    try {
      const url = `${this.fwBaseUrlV3}/virtual-cards`;
      const res = await firstValueFrom(
        this.http.post(url, cardPayload, { headers }),
      );
      // res.data contient le JSON renvoyé par FW
      // console.log('FW res: ', res);
      // console.log('FW createVirtualCard response: ', res.data);
      return res.data;
    } catch (err: any) {
      if (err.response) {
        console.error('FW createVirtualCard error: ', err.response.data);
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      console.error(
        'Unexpected createVirtualCard error: ',
        err?.message ?? err,
      );
      throw err;
    }
  }

  // get data of card
  async getVirtualCard(countryWallet: string, cardId: string) {
    if (!cardId) throw new NotFoundException('cardId required');

    let headers: any;
    if (countryWallet === 'CM') {
      headers = this.authHeader();
    } else if (countryWallet === 'NG') {
      headers = this.authHeaderNGN();
    } else {
      headers = this.authHeader();
    }

    try {
      const url = `${this.fwBaseUrlV3}/virtual-cards/${encodeURIComponent(cardId)}`;
      const res = await firstValueFrom(this.http.get(url, { headers }));
      return res.data;
    } catch (err: any) {
      if (err.response) {
        console.error('FW getVirtualCard error: ', err.response.data);
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      throw err;
    }
  }

  // get the list of cards
  async getVirtualCards(
    countryWallet: string,
    params?: { page?: number; per_page?: number },
  ) {
    let headers: any;
    if (countryWallet === 'CM') {
      headers = this.authHeader();
    } else if (countryWallet === 'NG') {
      headers = this.authHeaderNGN();
    } else {
      headers = this.authHeader();
    }

    try {
      const url = `${this.fwBaseUrlV3}/virtual-cards`;
      const res = await firstValueFrom(this.http.get(url, { headers, params }));
      return res.data;
    } catch (err: any) {
      if (err.response) {
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      throw err;
    }
  }

  /**
   * Fund a virtual card from the main wallet
   * @param countryWallet 'CM' | 'NG' | ...
   * @param cardId ID of the virtual card to fund
   * @param amount Amount to fund
   * @param currency Currency code, e.g. 'USD'
   */
  async fundVirtualCard(
    countryWallet: string,
    cardId: string,
    amount: number,
    currency: string = 'USD',
  ) {
    if (!cardId) throw new NotFoundException('cardId required');
    if (!amount || amount <= 0)
      throw new HttpException(
        'Amount must be greater than 0',
        HttpStatus.BAD_REQUEST,
      );

    // Choisir la clé selon le wallet
    let headers: any;
    if (countryWallet === 'CM') {
      headers = this.authHeader();
    } else if (countryWallet === 'NG') {
      headers = this.authHeaderNGN();
    } else {
      headers = this.authHeader();
    }

    try {
      const url = `${this.fwBaseUrlV3}/virtual-cards/${encodeURIComponent(cardId)}/fund`;
      const payload = {
        amount,
        currency,
      };

      const res = await firstValueFrom(
        this.http.post(url, payload, { headers }),
      );
      // res.data contient le JSON renvoyé par Flutterwave
      return res.data;
    } catch (err: any) {
      if (err.response) {
        console.error('FW fundVirtualCard error: ', err.response.data);
        throw new HttpException(
          err.response.data,
          err.response?.status || HttpStatus.BAD_GATEWAY,
        );
      }
      console.error('Unexpected fundVirtualCard error: ', err?.message ?? err);
      throw err;
    }
  }

  /**
   * Convert a text to alphanumeric
   * @param {string} text - the sentence in param
   * @returns {string} - Cleared sentence
   */
  toAlphanumeric(text) {
    if (typeof text !== 'string') return '';

    return (
      text
        // 1. Supprimer les accents et normaliser
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // retire les diacritiques
        // 2. Remplacer les caractères non alphanumériques par rien
        .replace(/[^a-zA-Z0-9]/g, '')
        // 3. Supprimer les espaces (facultatif selon besoin)
        .trim()
    );
  }

  async checkPayinStatusOnFlutterwave(
    txRef: string,
    flwTxId?: string,
  ): Promise<string | null> {
    try {
      // Use numeric ID endpoint when available (most reliable)
      if (flwTxId) {
        const resp = await firstValueFrom(
          this.http.get(`${this.fwBaseUrlV3}/transactions/${flwTxId}/verify`, {
            headers: this.authHeader(),
          }),
        );
        const status = resp?.data?.data?.status;
        if (status) return status;
      }
      // Fallback: verify by reference
      const resp = await firstValueFrom(
        this.http.get(`${this.fwBaseUrlV3}/transactions/verify_by_reference`, {
          headers: this.authHeader(),
          params: { tx_ref: txRef },
        }),
      );
      return resp?.data?.data?.status || null;
    } catch {
      return null;
    }
  }

  async checkPayoutStatusOnFlutterwave(
    reference: string,
    flwTxId?: string,
  ): Promise<string | null> {
    try {
      // Use numeric transfer ID endpoint when available (most reliable)
      if (flwTxId) {
        const resp = await firstValueFrom(
          this.http.get(`${this.fwBaseUrlV3}/transfers/${flwTxId}`, {
            headers: this.authHeader(),
          }),
        );
        const status = resp?.data?.data?.status;
        if (status) return status;
      }
      // Fallback: filter by reference
      const resp = await firstValueFrom(
        this.http.get(`${this.fwBaseUrlV3}/transfers`, {
          headers: this.authHeader(),
          params: { reference },
        }),
      );
      const data = resp?.data?.data;
      if (Array.isArray(data) && data.length > 0) {
        return data[0].status || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async handleTestWithdrawal(transactionData: any) {
    try {
      this.handleWithdrawal(transactionData);
    } catch (err) {
      return {
        message: '(fw service: handleTestWithdrawal) Error: ' + err,
        status: 'error',
      };
    }
  }
}
