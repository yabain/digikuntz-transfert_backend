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
import { EmailService } from 'src/email/email.service';
import { User } from 'src/user/user.schema';
import { SmtpService } from 'src/email/smtp/smtp.service';
import * as fs from 'fs';
import { SystemService } from 'src/system/system.service';

/** File-scoped types (inchangés côté interface publique) */
interface QueuedMessage {
  id: string;
  to: string;
  message: string;
  timestamp: Date;
  retries: number;
}

type HealthEstimation = 'immediate' | 'when_ready' | 'retry';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);

  /** WhatsApp Web client instance (non persistée) */
  private client: Client | null = null;

  /** Indique si le client est prêt à envoyer des messages */
  private isReady = false;

  /** Indique si un scan QR est requis maintenant */
  private needToScan = true;

  /** Compteurs d’échecs d’envoi pour alerte “mass failure” */
  private currentFailNumber = 0;
  private maxFailNumber = 5;

  /** Reconnexion (exponential backoff) */
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private baseReconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  /** Health monitoring */
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly healthCheckDelay = 60 * 1000;
  private healthCheckStarted = false;

  /** Handlers attachés une seule fois */
  private handlersBound = false;

  /** Gestion d’alertes */
  private alertSent = false;
  private lastConnAlertAt: number | null = null;

  /** Fenêtre de “warmup” post-auth/load */
  private lastAuthAt: number | null = null;
  private lastLoadingPercent = 0;
  private lastLoadingAt: number | null = null;
  private readonly authWarmupMs = 2 * 60 * 1000;
  private readyProbeTimer: NodeJS.Timeout | null = null;

  /** Boot state */
  private initializing = false;

  /** Front URL & alert email */
  private frontUrl = '';
  private alertEmail = 'flambel55@gmail.com';

  /** --------- Mémoire locale (remplace Mongo) --------- */
  private memoryStatus: { status: boolean; message: string } = {
    status: false,
    message: 'Not initialized',
  };
  private memoryQr: {
    qr: string | null;
    status: boolean;
    message: string;
    code?: string;
    phone?: string;
  } = { qr: null, status: false, message: 'No QR yet' };

  constructor(
    // On garde userModel (ton appli peut en avoir besoin pour les templates)
    @InjectModel(User.name)
    private userModel: mongoose.Model<User>,
    private configService: ConfigService,
    private emailService: EmailService,
    private smtpService: SmtpService,
    private systemService: SystemService,
  ) {
    this.frontUrl =
      this.configService.get<string>('FRONT_URL') ||
      'https://payments.digikuntz.com';
    this.getSystemData();
    this.getSmtpData();
  }

  async getSystemData() {
    const system = await this.systemService.getSystemData();
    this.alertEmail = system.alertEmail || 'flambel55@gmail.com';
  }

  async getSmtpData() {
    const smtp = await this.smtpService.getSmtpData();
    if (smtp) this.alertEmail = smtp.smtpUser;
  }

  onModuleInit() {
    this.logger.log('Whatsapp module initiated');
    this.initWhatsapp().catch((err) => {
      const message =
        'Error during WhatsApp init (non-blocking): ' + err?.message;
      this.logger.error(message);
      this.sendConnexionFailureAlert(message);
    });
  }

  /** --------- Init/Destroy sans persistance --------- */
  async initWhatsapp(): Promise<any> {
    this.logger.log('initWhatsapp (stateless)');

    if (this.initializing) {
      this.logger.warn('initWhatsapp: already initializing, skip');
      return { status: false, message: 'Already initializing' };
    }
    this.initializing = true;

    try {
      // détruire l’ancien client si présent
      if (this.client) {
        if (this.isReady) {
          return { status: true, message: 'WhatsApp already initialized' };
        }
        await this.safeDestroyClient();
        this.client = null;
        this.handlersBound = false;
      }

      // Chromium: flags Linux
      const isLinux = process.platform === 'linux';
      const args = isLinux
        ? [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
          ]
        : [];

      // Optionnel: chemin Chrome si Puppeteer n’a pas Chromium
      const chromePath =
        process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)
          ? process.env.CHROME_PATH
          : undefined;

      // ⚠️ Aucune authStrategy → pas de persistance, QR à chaque démarrage
      this.client = new Client({
        // ⚠️ pas d'authStrategy ici -> pas de persistance de session (QR à chaque démarrage)
        webVersion: '2.3000.1025302125-alpha',
        webVersionCache: {
          type: 'remote',
          // WPPConnect maintient l’index des HTML de WhatsApp Web
          // {version} sera remplacé par la valeur de webVersion ci-dessus
          remotePath:
            'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
          strict: false, // si la version épinglée n’est pas dispo, prendre la dernière connue
        },
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
        authStrategy: new LocalAuth(),
      });

      this.setupEventHandlers();

      try {
        await this.client.initialize();
        const state = await (this.client as any).getState?.();
        this.logger.log(`Initial WA state: ${state ?? 'UNKNOWN'}`);
      } catch {
        this.logger.warn('Cannot read initial WA state');
      }

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
      this.logger.warn(
        `safeDestroyClient: ignore destroy error: ${e?.message}`,
      );
    }
  }

  /** --------- Envoi de message --------- */
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

    let formatted = to;
    if (code && !to.startsWith(code)) formatted = code + to;

    if (!this.isReady || !this.client) {
      this.currentFailNumber++;
      await this.checkForMassFailure();
      return {
        success: false,
        error: 'WhatsApp client not ready',
        estimatedDelivery: 'when_ready',
      };
    }
    // ... après les checks this.isReady / this.client
    const phoneDigits = (code && !to.startsWith(code) ? code + to : to).replace(
      /\D/g,
      '',
    );

    // 1) Résoudre l'ID WhatsApp (vérifie aussi que le numéro est réellement sur WhatsApp)
    try {
      const wid = await this.client.getNumberId(phoneDigits);
      if (!wid) {
        return {
          success: false,
          error: 'Recipient is not a WhatsApp account',
          estimatedDelivery: 'retry',
        };
      }

      await this.client.sendMessage(wid._serialized, message);
      return { success: true, estimatedDelivery: 'immediate' };
    } catch (err: any) {
      // Petit retry si l’injection n’est pas tout à fait prête
      const msg = String(err?.message ?? err);
      // if (msg.includes('getChat') || msg.includes('Evaluation failed')) {
      //   await new Promise((res) => setTimeout(res, 1200));
      //   try {
      //     await this.client.sendMessage(wid._serialized, message);
      //     this.logger.log(`Message sent on retry → ${wid._serialized}`);
      //     return { success: true, estimatedDelivery: 'immediate' };
      //   } catch (err2: any) {
      //     this.currentFailNumber++;
      //     await this.checkForMassFailure();
      //     return {
      //       success: false,
      //       error: String(err2?.message ?? err2),
      //       estimatedDelivery: 'retry',
      //     };
      //   }
      // }

      this.currentFailNumber++;
      await this.checkForMassFailure();
      return {
        success: false,
        error: msg,
        estimatedDelivery: 'retry',
      };
    }
  }

  /** --------- Events / Health --------- */
  private setupEventHandlers() {
    this.logger.debug('setupEventHandlers');
    if (!this.client) {
      this.logger.error('setupEventHandlers: client is null');
      return;
    }
    if (!this.handlersBound) {
      this.client.on('qr', (qr) => this.handleQrCode(qr));
      this.client.on('ready', () => this.handleReady());
      this.client.on('authenticated', () => this.handleAuthenticated());
      this.client.on('change_state', (state) => this.handleChangeState(state));
      this.client.on('loading_screen', (percent, message) =>
        this.handleLoadingScreen(Number(percent), message),
      );
      this.client.on('auth_failure', (msg) => this.handleAuthFailure(msg));
      this.client.on('disconnected', (reason) =>
        this.handleDisconnected(reason),
      );
      this.handlersBound = true;
    }
    this.startHealthCheck();
  }

  private handleLoadingScreen(percent: number, message: string) {
    this.logger.debug(`loading_screen ${percent}% - ${message}`);
    this.lastLoadingPercent = percent;
    this.lastLoadingAt = Date.now();
    if (percent >= 99) this.scheduleReadyProbe(0);
  }

  private async handleAuthenticated() {
    this.logger.log('Authenticated');
    this.needToScan = false;
    this.lastAuthAt = Date.now();
    await this.updateQrStatus(false, 'Authenticated, loading chats...');
    this.scheduleReadyProbe(3000);
  }

  private async handleChangeState(state: string) {
    this.logger.warn(`WA state changed → ${state}`);
    if (state === 'CONNECTED') {
      await this.markReadyAndClearQr('Client connected');
    } else if (state === 'UNPAIRED') {
      this.isReady = false;
      this.needToScan = true;
      await this.updateQrStatus(false, `State: ${state}`);
    } else {
      await this.updateQrStatus(false, `State: ${state}`);
    }
  }

  private scheduleReadyProbe(delayMs = 5000) {
    if (this.readyProbeTimer) clearTimeout(this.readyProbeTimer);
    this.readyProbeTimer = setTimeout(() => this.tryMarkReady(), delayMs);
  }

  private async tryMarkReady() {
    if (!this.client) return;
    try {
      const state = await (this.client as any).getState?.();
      this.logger.log(`Probe WA state: ${state ?? 'UNKNOWN'}`);
      if (state === 'CONNECTED') {
        await this.markReadyAndClearQr('Client ready (probe)');
        return;
      }
      if (this.inWarmupWindow()) this.scheduleReadyProbe(5000);
    } catch {
      if (this.inWarmupWindow()) this.scheduleReadyProbe(5000);
    }
  }

  private inWarmupWindow(): boolean {
    const now = Date.now();
    if (this.lastAuthAt && now - this.lastAuthAt < this.authWarmupMs)
      return true;
    if (this.lastLoadingAt && now - this.lastLoadingAt < 60_000) return true;
    return false;
  }

  private async markReadyAndClearQr(message: string) {
    this.needToScan = false;
    this.reconnectAttempts = 0;

    // maj in-memory (plus de DB)
    this.memoryQr.qr = null;
    this.memoryQr.status = true;
    this.memoryQr.message = message;
    await this.updateQrStatus(true, message);

    // ping “service ready” si tu veux garder le comportement
    const phoneToPing = this.memoryQr.phone || '91224472';
    const code = this.memoryQr.code || '237';
    if (!this.isReady) {
      await this.sendMessage(
        phoneToPing,
        '✅ ✅ *WhatsApp Service is ready*',
        code,
      );
      await this.sendWhatsappConnectedNotification();
    }
    this.isReady = true;
  }

  private async clearQrAndMarkReady(message: string) {
    this.memoryQr.qr = null;
    this.memoryQr.status = true;
    this.memoryQr.message = message;
    await this.updateQrStatus(true, message);
  }

  private async handleQrCode(qr: string) {
    this.logger.warn('Received QR — scan with your phone');
    qrcode.generate(qr, { small: true });
    this.needToScan = true;

    // stocke le QR en mémoire (plus de DB)
    this.memoryQr.qr = qr;
    this.memoryQr.status = false;
    this.memoryQr.message = 'Awaiting QR scan';
  }

  private async handleReady() {
    this.logger.log('Client ready');
    await this.markReadyAndClearQr('Client ready');
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

  /** --------- Mass failure --------- */
  private async checkForMassFailure() {
    if (this.currentFailNumber <= this.maxFailNumber || this.alertSent) return;
    const errMessage = `MASS FAILURE DETECTED (${this.currentFailNumber}/${this.maxFailNumber} messages failed)`;
    this.logger.error(errMessage);
    await this.sendMassFailureAlert(errMessage);
    this.alertSent = true;
    this.currentFailNumber = 0;
    setTimeout(
      () => {
        this.alertSent = false;
        this.currentFailNumber = 0;
      },
      15 * 60 * 1000,
    );
  }

  /** --------- Reconnexion/backoff --------- */
  private async handleDisconnect(): Promise<void> {
    this.logger.warn('handleDisconnect');
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      const message = `Max reconnection attempts (${this.maxReconnectAttempts}) reached.`;
      this.logger.error(message);
      await this.updateQrStatus(false, message);
      await this.sendConnexionFailureAlert(message);
      await this.disconnect();
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay,
    );
    this.logger.warn(
      `Reconnecting in ${delay}ms (Attempt ${this.reconnectAttempts})`,
    );
    this.reconnectTimeout = setTimeout(() => this.initWhatsapp(), delay);
  }

  /** --------- Helpers “statut” (remplacent la DB) --------- */
  private async updateQrStatus(
    status: boolean,
    message: string,
  ): Promise<void> {
    this.memoryStatus = { status, message };
  }

  private startHealthCheck(): void {
    if (this.healthCheckStarted) return;
    this.healthCheckInterval = setInterval(
      () => this.performHealthCheck(),
      this.healthCheckDelay,
    );
    this.healthCheckStarted = true;
    this.logger.log(`Health check started (every ${this.healthCheckDelay}ms)`);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.logger.log('Health check stopped');
    }
    this.healthCheckStarted = false;
  }

  private async performHealthCheck(): Promise<void> {
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

  /** --------- API publiques (signatures inchangées) --------- */
  public async refreshQr() {
    if (this.isReady) {
      return { message: 'Whatsapp service working good !', status: true };
    }
    const qr = await this.getCurrentQr();
    if (qr?.qr) qrcode.generate(qr.qr, { small: true });
    return qr;
  }

  private async sendMassFailureAlert(errMessage?: string): Promise<void> {
    try {
      const subject =
        `🚨 🚨 WhatsApp ${errMessage} Alert - digiKUNTZ Payments ` +
        new Date().toISOString();
      const message = `
        <h2>WhatsApp ${errMessage}</h2>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>Failed Messages:</strong> ${this.currentFailNumber}/${this.maxFailNumber}</p>
        <p><strong>Client Status:</strong> ${this.isReady ? 'Ready' : 'Not Ready'}</p>
        <p><strong>Reconnection Attempts:</strong> ${this.reconnectAttempts}/${this.maxReconnectAttempts}</p>`;
      await this.emailService.sendEmail(this.alertEmail, subject, message);
      this.logger.warn(`Mass failure alert sent to ${this.alertEmail}`);
    } catch (error: any) {
      this.logger.error(`Failed to send mass failure alert: ${error.message}`);
    }
  }

  private async sendConnexionFailureAlert(info?: string): Promise<void> {
    const now = Date.now();
    if (this.alertSent) return;
    if (this.lastConnAlertAt && now - this.lastConnAlertAt < 30 * 60 * 1000)
      return;
    this.lastConnAlertAt = now;

    const subject =
      `🚨🚨🚨 WhatsApp Connexion Failure Alert - digiKUNTZ Payments ` +
      new Date().toISOString();
    const message = `
      <h2>WhatsApp messaging service: ${info ?? 'Connexion Failure Alert'}</h2>
      <p>The system is unable to connect to the WhatsApp account.</p>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>
      <p><strong>Client Status:</strong> ${this.isReady ? 'Ready' : 'Not Ready'}</p>
      <p><strong>Reconnection Attempts:</strong> ${this.reconnectAttempts}/${this.maxReconnectAttempts}</p>`;
    try {
      await this.emailService.sendEmail(this.alertEmail, subject, message);
    } catch (e: any) {
      this.logger.error(
        `Failed to send connexion failure alert: ${e?.message}`,
      );
    }
  }

  private async sendQrCodeFailureAlert(info?: string): Promise<void> {
    const subject =
      `🚨 Error saving WhatsApp QR-code alert - digiKUNTZ Payments ` +
      new Date().toISOString();
    const message = `
      <h2>${info ?? 'Error saving WhatsApp QR-code alert'}</h2>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>`;
    try {
      await this.emailService.sendEmail(this.alertEmail, subject, message);
    } catch (e: any) {
      this.logger.error(`Failed to send QR-code failure alert: ${e?.message}`);
    }
  }

  private async sendQrNeedToScanAlert(info?: string): Promise<void> {
    const subject =
      `🚨 WhatsApp QR-code Need to scan - digiKUNTZ Payments ` +
      new Date().toISOString();
    const message = `
      <h2>${info ?? 'WhatsApp QR-code Need to scan'}</h2>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>`;
    try {
      await this.emailService.sendEmail(this.alertEmail, subject, message);
    } catch (e: any) {
      this.logger.error(`Failed to send need-to-scan alert: ${e?.message}`);
    }
  }

  private async sendWhatsappConnectedNotification(
    info?: string,
  ): Promise<void> {
    const subject =
      `✅ ✅ WhatsApp Service is ready - digiKUNTZ Payments ` +
      new Date().toISOString();
    const message = `
      <h2>${info ?? '✅ ✅ WhatsApp Service is ready'}</h2>
      <p><strong>Time:</strong> ${new Date().toISOString()}</p>`;
    try {
      await this.emailService.sendEmail(this.alertEmail, subject, message);
    } catch (e: any) {
      this.logger.error(`Failed to send connected notif: ${e?.message}`);
    }
  }

  async welcomeMessage(userData): Promise<any> {
    const formattedMessage = this.buildAccountCreationMessage(userData);
    return this.sendMessage(
      userData.phone,
      formattedMessage,
      userData.countryId.code,
    );
  }

  async buildTransetMessageForReceiver(transactionData: any, user: any) {
    const formattedMessage = this.buildTransetMessageForReceiver(
      transactionData,
      user.language,
    );

    return this.sendMessage(user.phone, formattedMessage, user.countryId.code);
  }

  private async getUser(userId: string): Promise<User> {
    // ⚠️ Ici on conserve ta logique app (User en DB). Ce n’est PAS la persistance WhatsApp.
    const user = await this.userModel.findById(userId).populate('countryId');
    if (!user) throw new NotFoundException('User not found');
    // nettoyage facultatif
    (user as any).password = '';
    (user as any).resetPasswordToken = '';
    return user;
  }

  async getCurrentQr(): Promise<any> {
    // même forme de retour que ton ancienne méthode (qr/status/message)
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

  public async updateSystemContact(body: {
    code: string;
    contact: string;
  }): Promise<{ status: boolean }> {
    // on stocke en mémoire (plus de DB)
    this.memoryQr.code = body.code;
    this.memoryQr.phone = body.contact;
    return { status: true };
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
