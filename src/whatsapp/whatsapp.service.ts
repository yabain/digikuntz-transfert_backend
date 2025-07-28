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
  OnModuleDestroy,
  NotFoundException,
} from '@nestjs/common';
import { Client, LocalAuth } from 'whatsapp-web.js';
import { InjectModel } from '@nestjs/mongoose';
import mongoose, { Model } from 'mongoose';
import { WhatsappQr } from './whatsapp-qr.schema';
import { ConfigService } from '@nestjs/config';
import * as qrcode from 'qrcode-terminal';
import { EmailService } from 'src/email/email.service';
import { User } from 'src/user/user.schema';

/**
 * Interface representing a message in the queue
 */
interface QueuedMessage {
  /** Unique identifier for the message */
  id: string;
  /** Recipient phone number (international format) */
  to: string;
  /** Message content to send */
  message: string;
  /** Timestamp when the message was queued */
  timestamp: Date;
  /** Number of retry attempts for this message */
  retries: number;
}

/**
 * WhatsApp service providing message sending capabilities with queue management,
 * automatic reconnection, health monitoring, and mass failure alerts.
 *
 * Features:
 * - Asynchronous message queue with FIFO ordering
 * - Automatic reconnection with exponential backoff
 * - Health monitoring and crash recovery
 * - Session persistence and QR code management
 * - Mass failure detection and email alerts
 *
 */
@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);

  /** WhatsApp Web client instance */
  private client: Client;

  /** Indicates if the WhatsApp client is ready to send messages */
  private isReady = false;

  private needToScan = true;

  private currentFailNumber = 0;
  private maxFailNumber = 5;

  // Reconnection management with exponential backoff
  /** Current number of reconnection attempts */
  private reconnectAttempts = 0;

  /** Maximum number of reconnection attempts before giving up */
  private maxReconnectAttempts = 5;

  /** Base delay for exponential backoff (in milliseconds) */
  private baseReconnectDelay = 1000; // 1 second

  /** Maximum delay for exponential backoff (in milliseconds) */
  private maxReconnectDelay = 30000; // 30 seconds

  /** Timeout reference for scheduled reconnection attempts */
  private reconnectTimeout: NodeJS.Timeout;

  /** Minimum time to consider a connection stable (in milliseconds) */
  private readonly stableConnectionTime = 30000; // 30 seconds

  // Health monitoring
  /** Interval reference for periodic health checks */
  private healthCheckInterval: NodeJS.Timeout;

  /** Delay between health checks (in milliseconds) */
  private readonly healthCheckDelay = 60 * 1000; // 60 seconds

  private ResultsLimite = 1000;

  count: number = 0;

  /** Flag to prevent multiple alerts for the same failure period */
  private alertSent = false;

  /** Frontend URL for messages */
  private frontUrl: any = '';

  private alertEmail: string = 'support@yabi.cm';

  /**
   * Creates a new WhatsApp service instance
   * @param qrModel - Mongoose model for storing QR codes
   * @param configService - Configuration service for environment variables
   */
  constructor(
    @InjectModel(WhatsappQr.name)
    private readonly qrModel: Model<WhatsappQr>,
    @InjectModel(User.name)
    private userModel: mongoose.Model<User>,
    private configService: ConfigService,
    private emailService: EmailService,
  ) {
    this.count = 0;
    this.reconnectAttempts = 0;
    this.frontUrl = this.configService.get<string>('FRONT_URL')
      ? this.configService.get<string>('FRONT_URL')
      : 'https://payments.digikuntz.com';
  }

  /**
   * Initializes the WhatsApp service when the module starts.
   * Starts the WhatsApp client initialization and health monitoring in the background.
   */
  onModuleInit() {
    console.log('Whatsapp module initiated');
    // Start WhatsApp initialization in the background, without waiting
    this.initWhatsapp().catch((err) => {
      const message =
        'Error during WhatsApp init (non-blocking) : ' + err.message;
      this.logger.error(message);
      this.sendConnexionFailureAlert(message);
    });
  }

  /**
   * Cleans up resources when the module is destroyed.
   * Stops health monitoring, clears timeouts, and destroys the WhatsApp client.
   */
  // onModuleDestroy() {
  //   this.stopHealthCheck();
  //   if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
  //   if (this.client) this.disconnect();
  // }

  /**
   * Initializes the WhatsApp Web client with session persistence and event handlers.
   * Sets up QR code handling, connection monitoring, and automatic reconnection.
   *
   */
  async initWhatsapp(): Promise<any> {
    console.log('initWhatsapp');
    try {
      this.client = new Client({
        authStrategy: new LocalAuth({ dataPath: './assets/sessions/whatsapp' }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
          ],
        },
      });

      // ATTACHE LES HANDLERS AVANT D'INITIALISER
      this.setupEventHandlers();
      await this.client.initialize();
      return true;
    } catch (err) {
      const message = `Error initializing WhatsApp client : ${err.message}`;
      this.updateQrStatus(false, message);
      this.logger.error(message);
      this.handleDisconnect();
      setTimeout(() => this.initWhatsapp(), 30 * 1000);
      return message;
    }
  }

  /**
   * send messages.
   * Returns immediately with a promise that resolves when the message is queued.
   * Le message sera envoyé immédiatement si le client est prêt.
   */
  async sendMessage(to: string, message: string, code?: string): Promise<any> {
    console.log('sendMessage');
    console.log('isReady: ', this.isReady);
    await this.checkForMassFailure();
    let formattedPhoneNumber = to;
    if (code && !to.startsWith(code)) formattedPhoneNumber = code + to;
    let success = false;
    let errorMsg = '';
    try {
      if (!this.isReady) {
        this.currentFailNumber++;
        console.log('fail number00: ', this.currentFailNumber);
        return;
      }
      this.logger.log(`sending (ID: ${formattedPhoneNumber})`);
      const chatId = formattedPhoneNumber.replace(/\D/g, '') + '@c.us';
      await this.client.sendMessage(chatId, message);
      success = true;
      this.logger.log(`Message sent (ID: ${formattedPhoneNumber})`);
    } catch (error) {
      errorMsg = error.message;
      this.logger.error(
        `Message failed (Number: ${formattedPhoneNumber}): ${errorMsg}`,
      );
      console.log('fail number: ', this.currentFailNumber);
      this.currentFailNumber++;
    }
    // Retourne le statut d'envoi
    return {
      success,
      error: errorMsg || undefined,
      estimatedDelivery: this.isReady ? 'immediate' : 'when_ready',
    };
  }

  private async setupEventHandlers() {
    console.log('setupEventHandlers');

    if (!this.client) {
      console.error('setupEventHandlers: this.client is undefined!');
      console.log('setupEventHandlers called');
      return;
    }
    this.startHealthCheck();

    this.client.on('qr', async (qr) => this.handleQrCode(qr));

    this.client.on('ready', () => this.handleReady());

    this.client.on('auth_failure', (msg) => this.handleAuthFailure(msg));

    this.client.on('disconnected', (reason) => this.handleDisconnected(reason));
  }

  private async handleQrCode(qr) {
    console.log('handleQrCode');
    const message =
      'Received QR code for WhatsApp Web. Scan it with your phone.';
    this.logger.warn(message);
    qrcode.generate(qr, { small: true });
    if (this.count === 0) {
      this.sendQrNeedToScanAlert();
      this.count++;
    }

    try {
      // if (this.isReady) return;
      this.needToScan = true;
      await this.qrModel.findOneAndUpdate(
        {},
        { qr, status: false, message: 'Awaiting QR scan' },
        { upsert: true, new: true },
      );
    } catch (err) {
      const errMessage = `QR save failed: ${err.message}`;
      this.logger.error(errMessage);
      this.sendQrCodeFailureAlert(errMessage);
    }
  }

  private async handleReady() {
    console.log('handleReady');
    this.isReady = true;
    this.reconnectAttempts = 0;
    this.needToScan = false;
    this.logger.log('Client ready');
    this.updateQrStatus(true, 'Client ready');
    const qrDoc = await this.qrModel.findOne({});
    this.sendMessage(
      qrDoc?.phone ? qrDoc.phone : '91224472',
      ' ✅ ✅ *WhatsApp Service is ready* ',
      qrDoc?.code ? qrDoc.code : '237',
    );
    this.sendWhatsappConnectedNotification();
    // Start health monitoring
    // this.startHealthCheck();
  }

  private handleAuthFailure(msg) {
    console.log('handlAuthFailure');
    this.needToScan = false;
    const message = `Auth failure: ${msg}`;
    this.logger.error(message);
    this.updateQrStatus(false, message);
    this.handleDisconnect();
  }

  private handleDisconnected(reason) {
    console.log('handleDisconnected');
    this.needToScan = false;
    const message = `Disconnected: ${reason}`;
    if (reason === 'LOGOUT') return this.disconnect();
    this.logger.warn(message);
    this.updateQrStatus(false, message);
    this.handleDisconnect();
  }

  /**
   * Checks for mass failure conditions and sends alert if threshold is exceeded.
   *
   * @private
   */
  private async checkForMassFailure() {
    console.log('checkForMassFailure');

    if (this.currentFailNumber <= this.maxFailNumber) {
      return;
    }

    const errMessage =
      `MASS FAILURE DETECTED ` +
      `(${this.currentFailNumber}/${this.maxFailNumber} messages failed)`;
    this.logger.error(errMessage);

    // this.updateQrStatus(false, errMessage);
    this.sendMassFailureAlert(errMessage);
    this.alertSent = true;
    this.isReady = false;
    this.currentFailNumber = 0; // reset ici

    setTimeout(
      () => {
        this.alertSent = false;
        this.currentFailNumber = 0; // reset aussi ici pour être sûr
      },
      15 * 60 * 1000,
    );
  }

  /**
   * Sends a mass failure alert email to the configured address.
   *
   * @param failureRate - The percentage of failed messages
   * @param this.currentFailNumber - The number of failed messages
   * @param this.maxFailNumber - The total number of messages processed
   * @private
   */
  private async sendMassFailureAlert(errMessage?): Promise<void> {
    try {
      const subject =
        `🚨 🚨 WhatsApp ${errMessage} Alert - Yabi Events` +
        new Date().toISOString();
      const message = `
        <h2>WhatsApp ${errMessage} Alert</h2>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>Failed Messages:</strong> ${this.currentFailNumber}/${this.maxFailNumber}</p>
        <p><strong>Client Status:</strong> ${this.isReady ? 'Ready' : 'Not Ready'}</p>
        <p><strong>Reconnection Attempts:</strong> ${this.reconnectAttempts}/${this.maxReconnectAttempts}</p>

        <h3>Recommended Actions:</h3>
        <ul>
          <li>Check WhatsApp Web session status</li>
          <li>Verify network connectivity</li>
          <li>Review recent error logs</li>
          <li>Consider manual reconnection if needed</li>
        </ul>

        <p><em>This is an automated alert from the Yabi Events WhatsApp service.</em></p>
      `;

      this.logger.warn(
        `🚨 🚨 🚨  Mass failure alert would be sent to ${this.alertEmail}`,
      );
      this.logger.warn(`Alert details: ${errMessage}`);
      // Send alert by mail
      await this.emailService.sendEmail(this.alertEmail, subject, message);
      // this.disconnect();
    } catch (error) {
      this.logger.error(`Failed to send mass failure alert: ${error.message}`);
    }
  }

  private async sendConnexionFailureAlert(info?: string): Promise<void> {
    if (this.alertSent) return;
    if (!info) info = 'Connexion Failure Alert';

    try {
      const subject =
        `🚨🚨🚨 WhatsApp Connexion Failure Alert - Yabi Events ` +
        new Date().toISOString();
      const message = `
        <h2>WhatsApp messaging service: ${info}</h2>
        <p>The system is unable to send WhatsApp messages because the attempt to connect to the Yabi Events WhatsApp account failed.</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>Failed Messages:</strong> WhatsApp Connexion Failure.</p>
        <p><strong>Client Status:</strong> ${this.isReady ? 'Ready' : 'Not Ready'}</p>
        <p><strong>Reconnection Attempts:</strong> ${this.reconnectAttempts}/${this.maxReconnectAttempts}</p>
        <p><strong>Action required:</strong> You need to open the admin dashboard and scan the Whatsapp QR code with Yabi Events WhatsApp account.</p>

        <h3>Recommended Actions:</h3>
        <ul>
          <li>Check WhatsApp Web session status</li>
          <li>Verify network connectivity</li>
          <li>Review recent error logs</li>
          <li>Consider manual reconnection if needed</li>
        </ul>

        <p><em>This is an automated alert from the Yabi Events WhatsApp service.</em></p>
      `;

      // Send alert by mail
      await this.emailService.sendEmail(this.alertEmail, subject, message);

      this.logger.warn(`${info} would be sent to ${this.alertEmail}`);
    } catch (error) {
      this.logger.error(`Failed to send mass failure alert: ${error.message}`);
    }
  }

  private async sendQrCodeFailureAlert(info?: string): Promise<void> {
    if (this.alertSent) return;
    if (!info) info = 'Error saving WhatsApp Qr-Code alert';

    try {
      const subject =
        `🚨 Error saving WhatsApp Qr-Code alert - Yabi Events ` +
        new Date().toISOString();
      const message = `
        <h2>WhatsApp messaging service: ${info}</h2>
        <p>The system is unable to save WhatsApp AR-code to update database for scan.</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>Failed Messages:</strong> Error saving WhatsApp Qr-Code alert.</p>
        <p><strong>Client Status:</strong> ${this.isReady ? 'Ready' : 'Not Ready'}</p>
        <p><strong>Reconnection Attempts:</strong> ${this.reconnectAttempts}/${this.maxReconnectAttempts}</p>
        <p><strong>Action required:</strong> Restart the backend server to night.</p>

        <h3>Recommended Actions:</h3>
        <ul>
          <li>Check WhatsApp Web session status</li>
          <li>Verify network connectivity</li>
          <li>Review recent error logs</li>
          <li>Consider manual reconnection if needed</li>
        </ul>

        <p><em>This is an automated alert from the Yabi Events WhatsApp service.</em></p>
      `;

      // Send alert by mail
      await this.emailService.sendEmail(this.alertEmail, subject, message);

      this.logger.warn(`${info} would be sent to ${this.alertEmail}`);
    } catch (error) {
      this.logger.error(`Failed to send mass failure alert: ${error.message}`);
    }
  }

  private async sendQrNeedToScanAlert(info?: string): Promise<void> {
    if (this.alertSent) return;
    if (!info) info = 'WhatsApp Qr-Code Need to scan alert';

    try {
      const subject =
        `🚨 WhatsApp Qr-Code Need to scan alert - Yabi Events ` +
        new Date().toISOString();
      const message = `
        <h2>WhatsApp messaging service: ${info}</h2>
        <p>The system is unable to save WhatsApp AR-code to update database for scan.</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>Failed Messages:</strong> WhatsApp Qr-Code Need to scan alert.</p>
        <p><strong>Client Status:</strong> ${this.isReady ? 'Ready' : 'Not Ready'}</p>
        <p><strong>Reconnection Attempts:</strong> ${this.reconnectAttempts}/${this.maxReconnectAttempts}</p>

        <p><em>This is an automated alert from the Yabi Events WhatsApp service.</em></p>
      `;

      // Send alert by mail
      await this.emailService.sendEmail(this.alertEmail, subject, message);

      this.logger.warn(`${info} would be sent to ${this.alertEmail}`);
    } catch (error) {
      this.logger.error(`Failed to send mass failure alert: ${error.message}`);
    }
  }

  private async sendWhatsappConnectedNotification(
    info?: string,
  ): Promise<void> {
    if (this.alertSent) return;
    if (!info) info = '✅ ✅ WhatsApp Service is ready';

    try {
      const subject =
        `✅ ✅ WhatsApp Service is ready - Yabi Events ` +
        new Date().toISOString();
      const message = `
        <h2>WhatsApp messaging service: ${info}</h2>
        <p>The system is ready to send messages using Whatsapp service.</p>
        <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        <p><strong>Client Status:</strong> ${this.isReady ? 'Ready' : 'Not Ready'}</p>
        <p><strong>Reconnection Attempts:</strong> ${this.reconnectAttempts}/${this.maxReconnectAttempts}</p>

        <p><em>This is an automated notification from the Yabi Events WhatsApp service.</em></p>
      `;

      await this.emailService.sendEmail(this.alertEmail, subject, message);

      this.logger.debug(
        `${info} notification would be sent to ${this.alertEmail}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send Whatsapp Connected Notification: ${error.message}`,
      );
    }
  }

  /**
   * Handles client disconnection with exponential backoff reconnection strategy.
   * Schedules reconnection attempts with increasing delays to avoid overwhelming the service.
   *
   * @private
   */
  private async handleDisconnect(): Promise<void> {
    console.log('handleDisconnect');
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      const message = `Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping reconnection attempts.`;
      this.logger.error(message);
      this.updateQrStatus(false, message);
      this.sendConnexionFailureAlert(message);
      this.disconnect();
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

    this.reconnectTimeout = setTimeout(async () => {
      this.logger.log(
        `Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`,
      );

      try {
        // if (this.client) await this.client.destroy();
        await this.initWhatsapp();
      } catch (error) {
        const message = `Reconnection attempt ${this.reconnectAttempts} failed: ${error.message}`;
        this.updateQrStatus(false, message);
        this.logger.error(message);
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.handleDisconnect();
        }
      }
    }, delay);
  }

  private async updateQrStatus(
    status: boolean,
    message: string,
  ): Promise<void> {
    try {
      await this.qrModel.findOneAndUpdate(
        {},
        { status, message },
        { upsert: true, new: true },
      );
    } catch (err) {
      this.logger.error(`QR status update failed: ${err.message}`);
    }
  }

  /**
   * Starts periodic health monitoring to detect silent failures.
   * Checks client status every 60 seconds and triggers reconnection if needed.
   *
   * @private
   */
  private startHealthCheck(): void {
    console.log('startHealthCheack');
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckDelay);

    this.logger.log(`Health check started (every ${this.healthCheckDelay}ms)`);
  }

  /**
   * Stops the periodic health monitoring.
   *
   * @private
   */
  private stopHealthCheck(): void {
    console.log('stopHealthCheck');
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.logger.log('Health check stopped');
    }
  }

  /**
   * Performs a health check on the WhatsApp client.
   * Triggers reconnection if the client is not ready and max attempts not reached.
   *
   * @private
   */
  private async performHealthCheck(): Promise<void> {
    console.log('performHealthCheck');
    if (!this.isReady) {
      const message =
        'Health check: Client not ready - attempting reconnection';
      this.logger.warn(message);
      this.updateQrStatus(false, message);
      console.log('needToScan: ', this.needToScan);
      if (this.needToScan === false) this.handleDisconnect();
    } else if (this.isReady === true) {
      this.logger.debug(this.isReady);
      const message = 'Health check: Whatsapp Client is healthy';
      this.isReady = true;
      this.needToScan = false;
      this.logger.debug(message);
      this.updateQrStatus(true, message);
      console.log('needToScan: ', this.needToScan);
    }
  }

  // getQueueStatus supprimé car la file d'attente n'existe plus

  // clearQueue supprimé car la file d'attente n'existe plus

  public async refreshQr() {
    console.log('refreshQr');
    if (this.isReady) {
      this.logger.warn('WhatsApp client is ready');
      return 'Whatsapp service working good !';
    }
    await this.setupEventHandlers();
    const qr = await this.getCurrentQr();
    qrcode.generate(qr.qr, { small: true });
    return qr;
  }

  /**
   * Sends a welcome formatted message to user.
   * Formats the message using WhatsApp's markdown syntax and emojis.
   *
   * @param data - Recipient phone number in international format
   * @param isUser - True if data contain user data, false if data contain just userId (string)
   * @returns Promise resolving to queue status information
   *
   * @example
   * ```typescript
   * await whatsappService.welcomeMessage ('237612345678', {
   *   firstName: 'Tagne Bernard',
   *   language: 'en',
   *   ...
   * });
   * ```
   */
  async welcomeMessage(data: any, isUser: boolean): Promise<any> {
    const user = isUser ? data : await this.getUser(data);

    // Message construction
    const formattedMessage =
      user.language === 'fr'
        ? this.buildFrenchWelcomeMessage(user)
        : this.buildEnglishWelcomeMessage(user);

    return this.sendMessage(user.phone, formattedMessage, user.countryId.code);
  }

  async participateToEventMessage(userId, event) {
    const user = await this.getUser(userId);
    const formattedMessage =
      user.language === 'fr'
        ? this.buildFrenchEventMessage(user, event)
        : this.buildEnglishEventMessage(user, event);
    return this.sendMessage(user.phone, formattedMessage, user.countryId.code);
  }

  private async getUser(userId: string): Promise<User> {
    const user = await this.userModel.findById(userId).populate('countryId');
    if (!user) throw new NotFoundException('User not found');

    // Clean sensitive data
    user.password = '';
    user.resetPasswordToken = '';

    return user;
  }

  /**
   * Retrieves the current QR code from the database.
   * Useful for displaying the QR code in a web interface or API endpoint.
   *
   * @returns Promise resolving to the QR code string or null if not available
   *
   * @example
   * ```typescript
   * const qrCode = await whatsappService.getCurrentQr();
   * if (qrCode) {
   *   // Display QR code in web interface
   *   res.json({ qrCode });
   * }
   * ```
   */
  async getCurrentQr(): Promise<any> {
    console.log('getCurrentQr');
    console.log('isReady: ', this.isReady);
    const qrDoc = await this.qrModel.findOne({});
    if (!qrDoc || !qrDoc.qr) {
      this.logger.warn('No QR code found in database');
      return null;
    }
    return qrDoc;
  }

  /**
   * Gracefully disconnects the WhatsApp session and cleans up resources.
   * Stops health monitoring, clears timeouts, and destroys the client.
   *
   * @returns Promise resolving to disconnect status information
   *
   * @example
   * ```typescript
   * const result = await whatsappService.disconnect();
   * console.log(result);
   * // Output: { status: true, message: 'WhatsApp session disconnected and client destroyed.' }
   * ```
   */
  async disconnect(): Promise<{ status: boolean; message: string }> {
    console.log('disconnect');
    // this.sendConnexionFailureAlert();
    this.stopHealthCheck();

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

    let message = '';
    if (this.client) {
      await this.client.destroy();
      message =
        'health check stopped: WhatsApp session disconnected and client destroyed';
    } else {
      message = 'No current WhatsApp client to disconnect.';
    }
    this.isReady = false;
    this.needToScan = true;
    this.logger.warn(message);
    this.updateQrStatus(false, message);
    return {
      status: true,
      message,
    };
  }

  public async updateSystemContact(body): Promise<{ status: boolean }> {
    const code = body.code;
    const phone = body.phone;
    try {
      await this.qrModel.findOneAndUpdate(
        {},
        { code, phone },
        { upsert: true, new: true },
      );
      return { status: true };
    } catch (err) {
      this.logger.error(`QR status update failed: ${err.message}`);
      return { status: false };
    }
  }

  private buildFrenchWelcomeMessage(user: User): string {
    const userName = user.name || `${user.firstName} ${user.lastName}`;
    return (
      `Hello *${userName} !!*\n\n` +
      `Nous sommes ravis de vous accueillir sur *Yabi Events*\n` +
      `Votre solution intelligente tout-en-un pour la gestion d'événements.\n\n` +
      `🔗 _Rendez-vous sur_ :\n${this.frontUrl}` +
      `\n\n\n> Ceci est un message automatique du service WhatsApp de Yabi Events.`
    );
  }

  private buildEnglishWelcomeMessage(user: User): string {
    const userName = user.name || `${user.firstName} ${user.lastName}`;
    return (
      `Hello *${userName} !!*\n\n` +
      `We are thrilled to welcome you to *Yabi Events*\n` +
      `Your smart all-in-one solution for event management.\n\n` +
      `🔗 _Visit us at:_\n${this.frontUrl}` +
      `\n\n\n> This is an automatic message from the Yabi Events WhatsApp service.`
    );
  }

  private buildFrenchEventMessage(user: User, event: any): string {
    const userName = user.name || `${user.firstName} ${user.lastName}`;
    return (
      `*Votre place est assurée !*\n\n` +
      `Hello ${userName}\n` +
      `Nous avons réservé votre place pour *${event.event_title}*\n` +
      `* Début : ${event.event_start}\n` +
      `* Fin : ${event.event_end}\n` +
      `* Lieu : ${event.event_country}, ${event.event_city},\n` +
      `${event.event_location}\n\n` +
      `🔗 _A propos de l'event :_ ${event.event_url}` +
      `\n\n\n> Ceci est un message automatique du service WhatsApp de Yabi Events.`
    );
  }

  private buildEnglishEventMessage(user: User, event: any): string {
    const userName = user.name || `${user.firstName} ${user.lastName}`;
    return (
      `*Your seat is reserved !*\n\n` +
      `Hello ${userName}\n` +
      `We have reserved your seat for *${event.event_title}*\n` +
      `* Start : ${event.event_start}\n` +
      `* End : ${event.event_end}\n` +
      `* Location : ${event.event_country}, ${event.event_city},\n` +
      `${event.event_location}\n\n` +
      `🔗 _About event :_ ${event.event_url}` +
      `\n\n\n> This is an automatic message from the Yabi Events WhatsApp service.`
    );
  }

  async getWhatsappClientStatus(): Promise<{ status: boolean }> {
    const status = this.isReady;
    return { status };
  }
}
