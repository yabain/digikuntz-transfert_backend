/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-floating-promises */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import {
  Injectable,
  Logger,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { Client, LocalAuth } from 'whatsapp-web.js';
import { InjectModel } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as qrcode from 'qrcode-terminal';
import * as fs from 'fs';

import { EmailService } from 'src/email/email.service';
import { User } from 'src/user/user.schema';

type HealthEstimation = 'immediate' | 'when_ready' | 'retry';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);

  private client: Client | null = null;
  private isReady = false;
  private needToScan = true;

  private currentFailNumber = 0;
  private readonly maxFailNumber = 5;

  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly baseReconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly healthCheckDelay = 60_000;
  private healthCheckStarted = false;

  private handlersBound = false;
  private initializing = false;

  private readyProbeTimer: NodeJS.Timeout | null = null;
  private lastAuthAt: number | null = null;
  private lastLoadingAt: number | null = null;
  private readonly authWarmupMs = 2 * 60_000;

  private frontUrl = '';
  private alertEmail = 'alerts@example.com';

  private memoryQr: {
    qr: string | null;
    status: boolean;
    message: string;
    code?: string;
    phone?: string;
  } = {
    qr: null,
    status: false,
    message: 'No QR yet',
  };
  private memoryStatus: { status: boolean; message: string } = {
    status: false,
    message: 'Not initialized',
  };

  constructor(
    @InjectModel(User.name) private userModel: mongoose.Model<User>,
    private config: ConfigService,
    private email: EmailService,
  ) {
    this.frontUrl =
      this.config.get<string>('FRONT_URL') || 'https://example.com';
    this.alertEmail = this.config.get<string>('ALERT_EMAIL') || this.alertEmail;
  }

  //#region Init / destroy

  onModuleInit() {
    this.logger.log('Whatsapp module initiated');
    this.initWhatsapp().catch((err) => {
      const msg = 'Error during WhatsApp init: ' + (err?.message ?? err);
      this.logger.error(msg);
      this.sendConnexionFailureAlert(msg).catch(() => {});
    });
  }

  async initWhatsapp(): Promise<{ status: boolean; message: string }> {
    if (this.initializing)
      return { status: false, message: 'Already initializing' };
    this.initializing = true;

    try {
      if (this.client) {
        await this.safeDestroyClient();
        this.client = null;
        this.handlersBound = false;
      }

      const chromePath =
        process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)
          ? process.env.CHROME_PATH
          : undefined;

      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: '.wwebjs_session',
          clientId: 'digikuntz',
        }),
        puppeteer: {
          headless: true,
          args:
            process.platform === 'linux'
              ? [
                  '--no-sandbox',
                  '--disable-setuid-sandbox',
                  '--disable-dev-shm-usage',
                ]
              : [],
          executablePath:
            process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)
              ? process.env.CHROME_PATH
              : undefined,
        },
        // ✅ cache JSON “last.json” maintenu (pas d’HTML ici)
        webVersionCache: {
          type: 'remote',
          remotePath:
            'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/last.json',
        },
        restartOnAuthFail: true,
      });

      this.setupEventHandlers();
      await this.client.initialize();
      return { status: true, message: 'Initializing WhatsApp client' };
    } catch (err: any) {
      const message = `Error initializing WhatsApp client: ${err?.message ?? err}`;
      await this.updateQrStatus(false, message);
      this.logger.error(message);
      await this.handleDisconnect();
      return { status: false, message };
    } finally {
      this.initializing = false;
    }
  }

  private async safeDestroyClient() {
    try {
      const anyClient = this.client as any;
      if (anyClient?.pupBrowser || anyClient?.pupPage) {
        await this.client!.destroy();
      }
    } catch (e: any) {
      this.logger.warn(`safeDestroyClient: ${e?.message}`);
    }
  }

  //#endregion

  //#region Send message

  async sendMessage(
    to: string,
    message: string,
    code?: string,
  ): Promise<{
    success: boolean;
    error?: string;
    estimatedDelivery: HealthEstimation;
  }> {
    this.logger.debug('sendMessage → isReady=' + this.isReady);

    if (!this.client || !this.isReady) {
      this.currentFailNumber++;
      await this.checkForMassFailure();
      return {
        success: false,
        error: 'WhatsApp client not ready',
        estimatedDelivery: 'when_ready',
      };
    }

    // normaliser numéro
    let formatted = to;
    if (code && !to.startsWith(code)) formatted = code + to;
    const phoneDigits = formatted.replace(/\D/g, '');

    // injection prête avant d’envoyer
    if (!(await this.ensureInjectionReady(20_000))) {
      this.currentFailNumber++;
      await this.checkForMassFailure();
      return {
        success: false,
        error: 'Injection not ready',
        estimatedDelivery: 'retry',
      };
    }

    try {
      const wid = await this.client.getNumberId(phoneDigits);
      if (!wid?._serialized) {
        return {
          success: false,
          error: 'Recipient is not a WhatsApp account',
          estimatedDelivery: 'retry',
        };
      }
      const chatId = wid._serialized;

      const trySend = async () => this.client!.sendMessage(chatId, message);

      try {
        await trySend();
        return { success: true, estimatedDelivery: 'immediate' };
      } catch (err1: any) {
        const msg1 = String(err1?.message ?? err1);
        if (/getChat|Evaluation failed|Store\./i.test(msg1)) {
          this.logger.warn(`Injection shaky: ${msg1}. Retrying…`);
          for (const wait of [1200, 2500, 4000]) {
            await this.delay(wait);
            if (!(await this.ensureInjectionReady(10_000))) continue;
            try {
              await trySend();
              return { success: true, estimatedDelivery: 'immediate' };
            } catch {}
          }
        }
        throw err1;
      }
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      this.currentFailNumber++;
      await this.checkForMassFailure();
      return { success: false, error: msg, estimatedDelivery: 'retry' };
    }
  }

  private async ensureInjectionReady(timeoutMs = 10_000): Promise<boolean> {
    const start = Date.now();
    let lastErr: any;
    while (Date.now() - start < timeoutMs) {
      try {
        await this.client!.getChats(); // échoue tant que l’injection n’est pas prête
        return true;
      } catch (e) {
        lastErr = e;
        await this.delay(400);
      }
    }
    this.logger.error(
      'ensureInjectionReady timeout: ' + (lastErr?.message ?? lastErr),
    );
    return false;
  }

  private async delay(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  //#endregion

  //#region Events / health

  private setupEventHandlers() {
    if (!this.client || this.handlersBound) return;

    this.client.on('qr', (qr) => this.handleQr(qr));
    this.client.on('authenticated', () => this.handleAuthenticated());
    this.client.on('ready', () => this.handleReady());
    this.client.on('change_state', (s) => this.handleChangeState(s));
    this.client.on('loading_screen', (p, msg) =>
      this.handleLoading(Number(p), msg),
    );
    this.client.on('auth_failure', (msg) => this.handleAuthFailure(msg));
    this.client.on('disconnected', (reason) => this.handleDisconnected(reason));

    this.handlersBound = true;
    this.startHealthCheck();
  }

  private async handleQr(qr: string) {
    this.logger.warn('Received QR — scan with your phone', qr);
    qrcode.generate(qr, { small: true });
    this.needToScan = true;
    this.memoryQr = {
      qr,
      status: false,
      message: 'Awaiting QR scan',
    };
  }

  private async handleAuthenticated() {
    this.logger.log('Authenticated');
    this.needToScan = false;
    this.lastAuthAt = Date.now();
    await this.updateQrStatus(false, 'Authenticated, loading chats...');
    this.scheduleReadyProbe(3000);
  }

  private async handleReady() {
    this.logger.log('Client ready');
    await this.markReady('Client ready');
  }

  private async handleChangeState(state: string) {
    this.logger.warn(`WA state changed → ${state}`);
    if (state === 'CONNECTED') {
      await this.markReady('Client connected');
    } else if (state === 'UNPAIRED') {
      this.isReady = false;
      this.needToScan = true;
      await this.updateQrStatus(false, `State: ${state}`);
    } else {
      await this.updateQrStatus(false, `State: ${state}`);
    }
  }

  private handleLoading(percent: number, message: string) {
    this.logger.debug(`loading_screen ${percent}% - ${message}`);
    this.lastLoadingAt = Date.now();
    if (percent >= 99) this.scheduleReadyProbe(0);
  }

  private async handleAuthFailure(msg: string) {
    this.needToScan = true;
    const message = `Auth failure: ${msg}`;
    this.logger.error(message);
    await this.updateQrStatus(false, message);
    await this.handleDisconnect();
  }

  private async handleDisconnected(reason: string) {
    this.needToScan = true;
    const message = `Disconnected: ${reason}`;
    if (String(reason).toUpperCase().includes('LOGOUT')) {
      await this.disconnect();
      return;
    }
    this.logger.warn(message);
    await this.updateQrStatus(false, message);
    await this.handleDisconnect();
  }

  private scheduleReadyProbe(delayMs = 5000) {
    if (this.readyProbeTimer) clearTimeout(this.readyProbeTimer);
    this.readyProbeTimer = setTimeout(() => this.tryMarkReady(), delayMs);
  }

  private inWarmupWindow(): boolean {
    const now = Date.now();
    if (this.lastAuthAt && now - this.lastAuthAt < this.authWarmupMs)
      return true;
    if (this.lastLoadingAt && now - this.lastLoadingAt < 60_000) return true;
    return false;
  }

  private async tryMarkReady() {
    if (!this.client) return;
    try {
      const state = await (this.client as any).getState?.();
      if (state === 'CONNECTED') {
        if (await this.ensureInjectionReady(5000)) {
          await this.markReady('Client ready (probe)');
          return;
        }
      }
      if (this.inWarmupWindow()) this.scheduleReadyProbe(5000);
    } catch {
      if (this.inWarmupWindow()) this.scheduleReadyProbe(5000);
    }
  }

  private async markReady(message: string) {
    this.isReady = true;
    this.needToScan = false;
    this.memoryQr.qr = null;
    this.memoryQr.status = true;
    this.memoryQr.message = message;
    await this.updateQrStatus(true, message);
    // pas d’envoi automatique ici
  }

  private startHealthCheck() {
    if (this.healthCheckStarted) return;
    this.healthCheckInterval = setInterval(
      () => this.performHealthCheck(),
      this.healthCheckDelay,
    );
    this.healthCheckStarted = true;
  }

  private stopHealthCheck() {
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    this.healthCheckStarted = false;
  }

  private async performHealthCheck() {
    if (!this.client) {
      await this.updateQrStatus(false, 'No client instance');
      return;
    }
    try {
      const state = await (this.client as any).getState?.();
      if (state !== 'CONNECTED') {
        if (this.needToScan) {
          await this.updateQrStatus(false, 'Waiting for QR scan');
          return;
        }
        if (this.inWarmupWindow()) {
          await this.updateQrStatus(
            false,
            'Authenticated, initializing session...',
          );
          this.scheduleReadyProbe(5000);
          return;
        }
        const msg = 'Health: not connected — reconnecting';
        this.logger.warn(msg);
        await this.updateQrStatus(false, msg);
        await this.handleDisconnect();
      } else {
        await this.updateQrStatus(true, 'Health ok');
      }
    } catch (e: any) {
      const msg = `Health error: ${e?.message ?? e}`;
      this.logger.error(msg);
      await this.updateQrStatus(false, msg);
    }
  }

  //#endregion
  /** --------- Reconnexion avec backoff exponentiel --------- */
  private async handleDisconnect(): Promise<void> {
    this.logger.warn('handleDisconnect');
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

    // Si on a déjà dépassé le nombre maximal de tentatives
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      const message = `Max reconnection attempts (${this.maxReconnectAttempts}) reached.`;
      this.logger.error(message);
      await this.updateQrStatus(false, message);
      await this.sendConnexionFailureAlert(message);
      await this.disconnect();
      return;
    }

    // Sinon, calcul du délai exponentiel avant la prochaine tentative
    this.reconnectAttempts++;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay,
    );

    this.logger.warn(
      `Reconnecting in ${delay} ms (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );

    // Planifie la reconnexion
    this.reconnectTimeout = setTimeout(() => this.initWhatsapp(), delay);
  }

  public async updateSystemContact(body: {
    code: string;
    contact: string;
  }): Promise<{ status: boolean }> {
    // on stocke en mémoire (plus de DB)
    this.memoryQr.code = body.code;
    this.memoryQr.phone = body.contact;
    return { status: true };
  }

  async welcomeMessage(userData: any): Promise<any> {
    const formattedMessage = this.buildAccountCreationMessage(userData);
    return this.sendMessage(
      userData.phone,
      formattedMessage,
      userData.countryId.code,
    );
  }

  //#region Public API / utils

  public async refreshQr() {
    if (this.isReady)
      return { message: 'Whatsapp service working good !', status: true };
    const qr = await this.getCurrentQr();
    if (qr?.qr) qrcode.generate(qr.qr, { small: true });
    return qr;
  }

  async getCurrentQr() {
    if (!this.memoryQr.qr) {
      this.logger.warn('No QR in memory');
      return {
        qr: null,
        status: this.memoryQr.status,
        message: this.memoryQr.message,
      };
    }
    return { ...this.memoryQr };
  }

  async disconnect(): Promise<{ status: boolean; message: string }> {
    this.stopHealthCheck();
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

    let message = '';
    if (this.client) {
      await this.safeDestroyClient();
      message = 'WhatsApp session disconnected and client destroyed';
    } else {
      message = 'No current WhatsApp client to disconnect.';
    }
    this.client = null;
    this.handlersBound = false;
    this.isReady = false;
    this.needToScan = true;
    this.memoryQr.qr = null;
    await this.updateQrStatus(false, message);
    return { status: true, message };
  }

  async getWhatsappClientStatus(): Promise<{
    status: boolean;
    state?: string;
  }> {
    try {
      const state =
        this.client && (await (this.client as any).getState?.())
          ? await (this.client as any).getState()
          : this.client
            ? 'INITIALIZING_OR_NO_STATE'
            : 'NO_CLIENT';
      return { status: this.isReady, state };
    } catch {
      return { status: this.isReady, state: 'UNKNOWN' };
    }
  }

  private async sendConnexionFailureAlert(info?: string) {
    try {
      await this.email.sendEmail(
        this.alertEmail,
        '🚨🚨 WhatsApp Connexion Failure',
        info ?? 'Connexion failed',
      );
    } catch (e) {
      this.logger.error('Failed to send connexion failure alert');
    }
  }

  private async checkForMassFailure() {
    if (this.currentFailNumber <= this.maxFailNumber) return;
    try {
      await this.email.sendEmail(
        this.alertEmail,
        '⚠️⚠️ WhatsApp Mass Failure',
        `Failed ${this.currentFailNumber}/${this.maxFailNumber}`,
      );
    } catch {}
    this.currentFailNumber = 0;
  }

  private async sendMailWatsappserviceReady() {
    try {
      await this.email.sendEmail(
        this.alertEmail,
        '✅✅ WhatsApp Service Ready',
        `WhatsApp service is ready`,
      );
    } catch (e) {
      this.logger.error('Failed to send mail watsappservice ready');
    }
  }

  private async updateQrStatus(status: boolean, message: string) {
    this.memoryStatus = { status, message };
  }

  //#endregion

  showName(user: User): string {
    return (user as any).name || `${user.firstName} ${user.lastName}`;
  }

  // MONEY SENT SUCCESSFULLY (Msg for receiver)
  private buildMessageForTransferReceiver(
    transaction: any,
    language: string,
  ): string {
    if (language === 'fr')
      return (
        `*Nouveau paiement reçu !*\n\n` +
        `Hello ${transaction.receiverName}\n` +
        `Vous avez reçu un paiment de *${transaction.estimation} ${transaction.receiverCurrency}* de la part de *${transaction.senderName}*\n` +
        `Référence de la transaction : ${transaction._id}\n` +
        `Merci de faire confiance à digiKUNTZ Payments. \n` +
        `\n _Accédez à votre compte: ${this.frontUrl} \n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New payment received !*\n\n` +
        `Hello ${transaction.receiverName}\n` +
        `You received a payment of *${transaction.estimation} ${transaction.receiverCurrency}* from *${transaction.senderName}*\n` +
        `Transaction reference: ${transaction._id}\n` +
        `Thank you for trusting digiKUNTZ Payments. \n` +
        `\n _Access your account: ${this.frontUrl}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // MONEY SENT SUCCESSFULLY (Msg for sender)
  private buildMessageForTransferSender(
    transaction: any,
    language: string,
  ): string {
    if (language === 'fr')
      return (
        `*Envoi effectué avec succès !*\n\n` +
        `Hello ${transaction.senderName}\n` +
        `Vous avez envoyé *${transaction.estimation} ${transaction.senderCurrency}* à *${transaction.receiverName}*\n` +
        `Référence de la transaction : ${transaction._id}\n` +
        `Merci de faire confiance à digiKUNTZ Payments. \n` +
        `\n _Accédez à votre compte: ${this.frontUrl} \n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New payment made !*\n\n` +
        `Hello ${transaction.senderName}\n` +
        `You sent *${transaction.estimation} ${transaction.senderCurrency}* to *${transaction.receiverName}*\n` +
        `Transaction reference: ${transaction._id}\n` +
        `Thank you for trusting digiKUNTZ Payments.\n` +
        `\n _Access your account: ${this.frontUrl}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // ACCOUNT CREATION MESSAGE
  private buildAccountCreationMessage(user: User): string {
    if (user.language === 'fr')
      return (
        `*Bienvenue ${this.showName(user)} !*\n\n` +
        `Votre compte *digiKUNTZ Payments* a été créé avec succès.\n` +
        `Nous sommes ravis de vous accueillir chez-nous chez-vous.\n` +
        `Votre solution intelligente tout-en-un pour la gestion de vos paiements.\n` +
        `Vous pouvez dès à présent effectuer vos transactions et gérer vos abonnements facilement.\n` +
        `\n _Accédez à votre compte: ${this.frontUrl} \n` +
        `\n\n> Ceci est un message automatique du service WhatsApp de digiKUNTZ Payments.`
      );
    else
      return (
        `*Welcome ${this.showName(user)} !*\n\n` +
        `Your *digiKUNTZ Payments* account has been successfully created.\n` +
        `We are delighted to welcome you to our platform.*\n` +
        `Your smart all-in-one solution for payments management.\n` +
        `You can now make payments and manage your plans easily.\n` +
        `\n _Access your account: ${this.frontUrl}` +
        `\n\n> This is an automatic message from the digiKUNTZ Payments WhatsApp service.`
      );
  }

  // BALANCE CREDITED
  private buildBalanceCreditedMessage(
    transaction: any,
    language: string,
  ): string {
    if (language === 'fr')
      return (
        `*Crédit de solde !*\n\n` +
        `Hello *${transaction.receiverName}*\n` +
        `Votre compte a été crédité de *${transaction.estimation} ${transaction.receiverCurrency}*.\n` +
        `Motif : ${transaction.raisonForTransfer || ''}\n\n` +
        `Merci d’utiliser digiKUNTZ Payments.\n` +
        `\n _Accédez à votre compte: ${this.frontUrl} \n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*Balance credited!*\n\n` +
        `Hello *${transaction.receiverName}*\n` +
        `Your account has been credited with *${transaction.estimation} ${transaction.receiverCurrency}*.\n` +
        `Reason: ${transaction.raisonForTransfer || 'Account credit'}\n\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n _Access your account: ${this.frontUrl}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // BALANCE DEBITED
  private buildBalanceDebitedMessage(
    transaction: any,
    language: string,
  ): string {
    if (language === 'fr')
      return (
        `*Débit de solde !*\n\n` +
        `Hello *${transaction.senderName}*\n` +
        `Votre compte a été débité de *${transaction.paymentWithTaxes} ${transaction.senderCountry}*.\n` +
        `Motif : ${transaction.raisonForTransfer || 'Débit de compte'}\n\n` +
        `Merci d'utiliser digiKUNTZ Payments.\n` +
        `\n _Access your account: ${this.frontUrl}\n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*Balance debited!*\n\n` +
        `Hello *${transaction.senderName}*\n` +
        `Your account has been debited by *${transaction.paymentWithTaxes} ${transaction.senderCountry}*.\n` +
        `Reason: ${transaction.raisonForTransfer || 'Account debit'}\n\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n _Access your account: ${this.frontUrl}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // NEW SUBSCRIBER OF PLAN
  private buildNewSubscriberMessage(plan: any, user: User): string {
    if (user.language === 'fr')
      return (
        `*Nouvel abonnement actif !*\n\n` +
        `Hello ${this.showName(user)},\n` +
        `Vous venez de souscrire à *${plan.title}*.\n` +
        `Merci d'utiliser digiKUNTZ Payments.\n` +
        `\n _Access your account: ${this.frontUrl}\n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New subscription activated!*\n\n` +
        `Hello ${this.showName(user)},\n` +
        `You have successfully subscribed to *${plan.title}*.\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n _Access your account: ${this.frontUrl}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // NEW SUBSCRIBER OF PLAN (By plan maker to subscriber)
  private buildNewSubscriberMessageFromPlanMaker(
    plan: any,
    subscriber: User, // Subscriber
    language,
  ): string {
    if (language === 'fr')
      return (
        `*Nouvel abonnement actif !*\n\n` +
        `Hello ${this.showName(subscriber)},\n` +
        `Vous avez été affilié à *${plan.title}: * ${plan.subTitle}.\n` +
        `Merci d'utiliser digiKUNTZ Payments.\n` +
        `\n _Access your account: ${this.frontUrl}\n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New subscription activated!*\n\n` +
        `Hello ${this.showName(subscriber)},\n` +
        `You have successfully subscribed to *${plan.title}*.\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n _Access your account: ${this.frontUrl}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // NEED VALIDATION PAYMENT (ADMIN)
  private buildNeedValidationMessage(
    transaction: any,
    language: string,
  ): string {
    if (transaction.transactionType === 'transfer') {
      if (language === 'fr')
        return (
          `*Paiement en attente de validation !*\n\n` +
          `Un nouveau transfert nécessite votre validation.\n\n` +
          `Expéditeur : ${transaction.senderName}\n` +
          `Bénéficiaire : ${transaction.receiverName}\n` +
          `Montant : *${transaction.estimation} ${transaction.receiverCurrency}*\n` +
          `Référence : ${transaction._id}\n\n` +
          `Veuillez vous connecter à l’espace administrateur pour vérifier et valider la transaction.` +
          `\n${this.frontUrl}/login` +
          `\n\n> Ceci est une alerte automatique du service WhatsApp de digiKUNTZ Payments.`
        );
      else
        return (
          `*Payment pending validation!*\n\n` +
          `A new transfer requires your approval.\n\n` +
          `Sender : ${transaction.senderName}\n` +
          `Receiver : ${transaction.receiverName}\n` +
          `Amount: *${transaction.estimation} ${transaction.receiverCurrency}*\n` +
          `Reference: ${transaction._id}\n\n` +
          `Please log in to the admin dashboard to review and validate the transaction.` +
          `\n${this.frontUrl}/login` +
          `\n\n> This is an automatic alert from the digiKUNTZ Payments WhatsApp service.`
        );
    } else {
      if (language === 'fr')
        return (
          `*Paiement en attente de validation !*\n\n` +
          `Un nouveau retrait nécessite votre validation.\n\n` +
          `Client : ${transaction.senderName}\n` +
          `Montant : *${transaction.estimation} ${transaction.senderCurrency}*\n` +
          `Référence : ${transaction._id}\n\n` +
          `Veuillez vous connecter à l’espace administrateur pour vérifier et valider la transaction.` +
          `\n${this.frontUrl}/login` +
          `\n\n> Ceci est une alerte automatique du service WhatsApp de digiKUNTZ Payments.`
        );
      else
        return (
          `*Payment pending validation!*\n\n` +
          `A new payment requires your approval.\n\n` +
          `Customer: ${transaction.senderName}\n` +
          `Amount: *${transaction.estimation} ${transaction.senderCurrency}*\n` +
          `Reference: ${transaction._id}\n\n` +
          `Please log in to the admin dashboard to review and validate the transaction.` +
          `\n${this.frontUrl}/login` +
          `\n\n> This is an automatic alert from the digiKUNTZ Payments WhatsApp service.`
        );
    }
  }
}
