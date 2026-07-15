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
import { PayinProvider } from 'src/payin/payin.schema';
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
  ) {}

  setCredentials(creds: Record<string, any>): void {
    const secret = creds.secretKey || creds.FLUTTERWAVE_SECRET_KEY;
    const pubKey = creds.publicKey || creds.FLUTTERWAVE_PUBLIC_KEY;
    const hash = creds.secretHash || creds.FLUTTERWAVE_SECRET_HASH;
    if (secret) this.fwSecret = secret;
    if (pubKey) this.fwPublic = pubKey;
    if (hash) this.secretHash = hash;
  }

  async loadDbCredentials(currency?: string, gatewayId?: string): Promise<void> {
    let gateway;
    if (gatewayId) {
      this.logger.log(`loadDbCredentials: loading gateway by id=${gatewayId}`);
      gateway = await this.gatewayModel.findById(gatewayId).exec();
    } else {
      const cur = currency || 'XAF';
      this.logger.log(`loadDbCredentials: loading gateway by currency=${cur}`);
      gateway = await this.gatewayModel.findOne({ type: 'flutterwave', currency: cur, isActive: true }).exec();
      if (!gateway) {
        this.logger.log(`loadDbCredentials: no flutterwave gateway for ${cur}, trying any active gateway`);
        gateway = await this.gatewayModel.findOne({ currency: cur, isActive: true }).exec();
      }
    }
    if (!gateway) {
      this.logger.warn(`loadDbCredentials: no gateway found (gatewayId=${gatewayId}, currency=${currency})`);
      return;
    }
    try {
      const decrypted = this.cryptService.decryptWithPassphrase(gateway.credentials);
      const creds = JSON.parse(decrypted);
      this.logger.log(`loadDbCredentials: gateway type=${gateway.type}, credentials loaded`);
      this.setCredentials(creds);
      this.payinService.setCredentials(creds);
      this.mpesaService.setCredentials(creds);
    } catch (e) {
      this.logger.error(`loadDbCredentials: failed to decrypt/set credentials: ${e.message}`);
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

  private isHtmlUpstreamPayload(payload: unknown): boolean {
    if (typeof payload !== 'string') return false;
    const value = payload.toLowerCase();
    return value.includes('<!doctype html') || value.includes('<html');
  }

  private sanitizeFlutterwaveError(error: any, fallbackMessage: string) {
    let statusCode = Number(error?.response?.status) || HttpStatus.BAD_GATEWAY;
    const upstreamPayload = error?.response?.data;

    // Never propagate 401 from Flutterwave API (invalid key) to avoid frontend auth clear
    if (statusCode === 401) {
      statusCode = HttpStatus.BAD_GATEWAY;
    }

    if (this.isHtmlUpstreamPayload(upstreamPayload)) {
      const message = 'Flutterwave temporary unavailable';
      this.logger.error(`${message} (upstream HTML ${statusCode})`);
      return {
        statusCode: HttpStatus.BAD_GATEWAY,
        payload: {
          message,
          provider: 'flutterwave',
          code: 'FW_UPSTREAM_5XX',
        },
      };
    }

    if (upstreamPayload && typeof upstreamPayload === 'object') {
      return {
        statusCode,
        payload: upstreamPayload,
      };
    }

    const message = error?.message || fallbackMessage;
    return {
      statusCode: HttpStatus.BAD_GATEWAY,
      payload: {
        message: fallbackMessage,
        details: message,
      },
    };
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

  private normalizeProviderFullName(value?: string, fieldName = 'name'): string {
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
      const res = await firstValueFrom(
        this.http.get(url, { headers }),
      );
      return res.data;
    } catch (err: any) {
      const parsed = this.sanitizeFlutterwaveError(err, 'Failed to fetch Flutterwave balance');
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
    // console.log('params: ', query?.periode);
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
      console.log('FW listPayinTransactions URL:', url, 'params:', JSON.stringify(params), 'key:', countryWallet === 'CM' ? 'fwSecret (FLUTTERWAVE_SECRET_KEY)' : 'fwSecretNGN (FLUTTERWAVE_SECRET_KEY_NGN)', 'len:', headers?.Authorization?.length);
      const res = await firstValueFrom(this.http.get(url, { headers, params }));
      return res.data;
    } catch (err: any) {
      console.error('FW listPayinTransactions error:', err?.message, err?.response?.status, JSON.stringify(err?.response?.data));
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
    const balance = await this.balanceService.getBalanceByUserId(String(userId));
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

  // ---------- Pay-In (Hosted Payment) ----------
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
      const gw = await this.gatewayModel.findById(transactionData.gatewayId).lean().exec();
      if (gw) selectedGatewayType = gw.type;
    }

    await this.loadDbCredentials(
      transactionData.senderCurrency || transactionData.receiverCurrency || 'XAF',
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
        transactionData.senderCurrency || transactionData.receiverCurrency || 'XAF',
        'deposit',
      );
    }

    transactionData.userId = userId;
    const txRef = this.payinService.generateTxRef('txPayin')
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
    const gateway = await this.gatewayModel.findById(transactionData.gatewayId).exec();
    if (!gateway) {
      throw new NotFoundException('Gateway not found');
    }
    try {
      const decrypted = this.cryptService.decryptWithPassphrase(gateway.credentials);
      const creds = JSON.parse(decrypted);
      this.paystackService.setCredentials(creds);
    } catch {
      throw new HttpException('Invalid gateway credentials', HttpStatus.INTERNAL_SERVER_ERROR);
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

    const savedTransaction = await this.transactionService.createTransaction(raw);
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

    const backendUrl = this.config.get<string>('BACK_URL') ?? 'https://api.digikuntz.com';
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

    const savedTransaction = await this.transactionService.createTransaction(raw);
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

  private getCountryForCurrency(currency: string): string | undefined {
    const map: Record<string, string> = {
      XAF: 'CM',
      XOF: 'CI',
      NGN: 'NG',
      KES: 'KE',
      GHS: 'GH',
      UGX: 'UG',
      RWF: 'RW',
    };
    return map[currency];
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
        { status: HttpStatus.BAD_REQUEST, error: 'Invalid amount: must be a positive number' },
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
        { status: HttpStatus.BAD_REQUEST, error: 'A valid phone number is required' },
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
        { status: HttpStatus.BAD_REQUEST, error: 'network is required for NGN mobile money (MTN, AIRTEL, GLO, 9MOBILE)' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (currency === 'GHS' && !dto.network) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: 'network is required for GHS mobile money (MTN, VODAFONE, AIRTELTIGO)' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const supportedCurrencies = ['XAF', 'XOF', 'NGN', 'KES', 'GHS', 'UGX', 'RWF'];
    if (!supportedCurrencies.includes(currency)) {
      throw new HttpException(
        { status: HttpStatus.BAD_REQUEST, error: `Unsupported currency: ${currency}. Supported: ${supportedCurrencies.join(', ')}` },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async directMobileMoneyCharge(dto: {
    amount: number;
    currency: string;
    phone: string;
    email: string;
    name?: string;
    network?: string;
    txRef: string;
  }): Promise<any> {
    this.validateDirectChargePayload(dto);

    const currency = String(dto.currency || '').toUpperCase();
    const phone = dto.phone.replace(/\s+/g, '').trim();

    const payload: any = {
      tx_ref: dto.txRef,
      amount: Number(dto.amount),
      currency,
      email: dto.email,
      phone_number: phone,
      fullname: dto.name || 'Customer',
      meta: { app: 'digikuntz-payments', flow: 'direct_charge' },
    };

    if (dto.network) {
      payload.network = dto.network.toUpperCase();
    }

    const countryOverride = this.getCountryForCurrency(currency);
    if (countryOverride && (currency === 'XAF' || currency === 'XOF')) {
      payload.country = countryOverride;
    }

    let chargeType: string;
    switch (currency) {
      case 'KES':
        chargeType = 'mpesa';
        break;
      case 'XAF':
      case 'XOF':
        chargeType = 'mobile_money_franco';
        break;
      case 'GHS':
        chargeType = 'mobile_money_ghana';
        break;
      case 'NGN':
        chargeType = 'mobile_money_nigeria';
        break;
      case 'UGX':
        chargeType = 'mobile_money_uganda';
        break;
      case 'RWF':
        chargeType = 'mobile_money_rwanda';
        break;
      default:
        chargeType = 'mobile_money';
    }

    const res = await firstValueFrom(
      this.http.post(
        `${this.fwBaseUrlV3}/charges?type=${chargeType}`,
        payload,
        {
          headers: this.authHeader(),
          timeout: 30000,
        },
      ),
    );
    return res.data;
  }

  async createDirectCharge(data: any, userId: any): Promise<any> {
    const depositAmount = Number(data.estimation);
    if (Number.isFinite(depositAmount) && depositAmount > 0) {
      await this.transactionService.validateTransactionLimit(
        depositAmount,
        data.currency || 'XAF',
        'deposit',
      );
    }

    const txRef = this.payinService.generateTxRef('txDirect');
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

    const chargeResult = await this.directMobileMoneyCharge({
      amount: Number(savedTransaction.paymentWithTaxes),
      currency: data.currency,
      phone: data.phone,
      email: data.email || '',
      name: data.name,
      network: data.network,
      txRef,
    });

    await this.payinService.createPayin({
      amount: Number(savedTransaction.paymentWithTaxes),
      txRef,
      transactionId: savedTransaction._id,
      currency: data.currency,
      customerEmail: data.email || '',
      customerName: data.name || 'Customer',
      customerPhone: data.phone,
      status: 'pending',
      userId,
    });

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
    const taxesDetails = await this.transactionService.calculateTaxesAmount(amount, customRate);
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

    try {
      const savedTransaction = await this.transactionService.createTransaction(raw);
      if (!savedTransaction) {
        throw new NotFoundException('Error to save transaction details');
      }

      void this.operationNotificationService
        .notifyAdminPayoutPending(savedTransaction)
        .catch(() => undefined);

      return {
        status: 'pending',
        transactionId: savedTransaction._id,
        transaction: savedTransaction,
      };
    } catch (error) {
      await this.balanceService
        .creditBalance(String(userId), totalToDebit, senderCurrency)
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
    const payin: any = await this.payinService.verifyPayin(txRef, false, flwTxId);
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
          return { message: 'Payin already successful', status: 'successful' };
        }

        await this.processSuccessfulPayin(transaction, String(payin.transactionId));
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
    const payin: any = await this.payinService.verifyPayin(txRef, true, flwTxId);
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
          return { message: 'Payin already successful', status: 'successful' };
        }

        await this.processSuccessfulPayin(transaction, String(payin.transactionId));
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
    await this.operationNotificationService.notifyAdminPayoutPending(transaction);
  }

  async processSuccessfulPayin(transaction: any, transactionId: string) {
    const claimed =
      await this.transactionService.claimTransactionForSuccessfulPayin(
        transactionId,
      );
    if (!claimed) {
      return;
    }

    if (
      transaction.transactionType !== 'withdrawal' &&
      transaction.transactionType !== 'transfer'
    ) {
      await this.balanceService.creditBalance(
        transaction.receiverId,
        Number(transaction.estimation),
        transaction.senderCurrency,
      );
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

      const subscriptionStatus = await this.subscriptionService.verifySubscription(
        subscriberId,
        planId,
      );
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
        const payload = this.subscriptionService.parseTransactionToSubscription(transaction);
        resp = await this.subscriptionService.createSubscriptionWithTransaction(payload, transaction._id);
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

      void this.operationNotificationService.notifyServicePaymentSuccess(transaction);

    } catch (err) {
      return {
        message: '(fw service: handleService) Error operationNotificationService: ' + err,
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
    return this.balanceService.creditBalance(
      transaction.receiverId || transaction.userId,
      Number(transaction.estimation),
      transaction.senderCurrency || transaction.receiverCurrency,
    );
  }

  async createSubscriptionOfTransaction(transaction) {
    const payload = this.subscriptionService.parseTransactionToSubscription(transaction)
    await this.subscriptionService.subscribe(payload, transaction._id);
  }

  async createServicePayment(transaction) {
    const payload = this.servicePaymentService.parseTransactionToServicePayment(transaction)
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
    const tx = await this.transactionService.findById(transactionId).catch(() => null);
    const currency = tx?.receiverCurrency || tx?.senderCurrency || 'XAF';

    let methodGwId: string | undefined;
    if (tx?.paymentMethod) {
      const method = await this.paymentMethodService.findByCode(tx.paymentMethod).catch(() => null);
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

    const transaction = await this.transactionService.claimTransactionForPayout(
      transactionId,
    );
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
      amount: transaction.transactionType === 'transfer' ? transaction.receiverAmount : transaction.estimation,
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
    if (payloadPayout.type === 'mobile_money' && payloadPayout.accountNumber && !payloadPayout.accountNumber.startsWith(cc)) {
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
            : err?.response?.data ?? {
                message: err?.message ?? 'M-Pesa payout initiation failed',
              };
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
      const doc = await this.payoutService.createPayout(payloadPayout, res.data);

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
      throw new NotFoundException('Transaction not found or not payin success or not in payout error');
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

  async verifyPayout(reference: string, verifyPayout = false, flwTxId?: string) {
    return await this.payoutService.verifyPayout(reference, verifyPayout, flwTxId);
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

  async verifyWebhookPayin(req) {
    const result = await this.payinService.verifyWebhook(req);

    if (result?.payin?.status === 'successful' && result.payin.transactionId) {
      try {
        const transaction = await this.transactionService.findById(
          String(result.payin.transactionId),
        );
        if (transaction) {
          await this.processSuccessfulPayin(transaction, String(result.payin.transactionId));
        }
      } catch (err) {
        this.logger.error('Webhook processSuccessfulPayin failed', err);
      }
    }

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
        { message: `Interval must be one of: ${[...allowedIntervals].join(', ')}` },
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
      console.error('Unexpected createVirtualCard error: ', err?.message ?? err);
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
  async getVirtualCards(countryWallet: string, params?: { page?: number; per_page?: number }) {
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
    if (!amount || amount <= 0) throw new HttpException('Amount must be greater than 0', HttpStatus.BAD_REQUEST);

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

      const res = await firstValueFrom(this.http.post(url, payload, { headers }));
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

    return text
      // 1. Supprimer les accents et normaliser
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // retire les diacritiques
      // 2. Remplacer les caractères non alphanumériques par rien
      .replace(/[^a-zA-Z0-9]/g, '')
      // 3. Supprimer les espaces (facultatif selon besoin)
      .trim();
  }

  async checkPayinStatusOnFlutterwave(txRef: string, flwTxId?: string): Promise<string | null> {
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

  async checkPayoutStatusOnFlutterwave(reference: string, flwTxId?: string): Promise<string | null> {
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
