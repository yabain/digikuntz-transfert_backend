/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client, LocalAuth, MessageMedia } from 'whatsapp-web.js';
import * as fs from 'fs';
import * as path from 'path';
import * as QR from 'qrcode';
import { EmailService } from 'src/email/email.service';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/user/user.schema';
import mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';

type ConnState =
  | 'NO_CLIENT'
  | 'INITIALIZING'
  | 'CONNECTED'
  | 'UNPAIRED'
  | 'TIMEOUT'
  | 'UNKNOWN';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);

  private client: Client | null = null;
  private ready = false;

  // mémoire: dernier QR + statut
  private lastQr: string | null = null;
  private lastState: ConnState = 'NO_CLIENT';
  private frontUrl = '';
  private alertEmail = 'flambel55@gmail.com,f.sanou@yaba-in.com';
  private alertPhoneNumber = '691224472';
  private alertCountryCode = '237';
  private currentFailNumber = 0;
  private readonly maxFailNumber = 6; // ★ alerte après 6 échecs (comme demandé)

  // chemins de session
  private readonly authDataPath = '.wwebjs_session';
  private readonly clientId = 'default';

  async onModuleInit() {
    await this.boot();
  }

  constructor(
    @InjectModel(User.name) private userModel: mongoose.Model<User>,
    private config: ConfigService,
    private email: EmailService,
  ) {
    this.frontUrl =
      this.config.get<string>('FRONT_URL') || 'https://example.com';
    this.alertEmail = this.config.get<string>('ALERT_EMAIL') || this.alertEmail;
    this.alertPhoneNumber =
      this.config.get<string>('ALERT_PHONE') || this.alertPhoneNumber;
    this.alertCountryCode =
      this.config.get<string>('ALERT_COUNTRY_CODE') || this.alertCountryCode;
  }

  /** Détecte s'il existe une session LocalAuth sur disque */
  private hasPreviousSession(): boolean {
    try {
      // Structure LocalAuth : <dataPath>/session-<clientId> (ou similaire selon versions).
      // On checke plusieurs patterns par précaution.
      const candidates = [
        path.join(this.authDataPath, `session-${this.clientId}`),
        path.join(this.authDataPath, `Session-${this.clientId}`),
        path.join(this.authDataPath, this.clientId),
        this.authDataPath,
      ];
      return candidates.some(
        (p) => fs.existsSync(p) && fs.readdirSync(p).length > 0,
      );
    } catch {
      return false;
    }
  }

  /** Boot du client wwebjs avec LocalAuth (session persistée) */
  private async boot() {
    if (this.client) return; // idempotent
    this.lastState = 'INITIALIZING';

    const chromePath =
      process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)
        ? process.env.CHROME_PATH
        : undefined;

    const hadPrevSession = this.hasPreviousSession(); // ★

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: this.authDataPath,
        clientId: this.clientId,
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
        executablePath: chromePath,
      },
      webVersionCache: {
        type: 'remote',
        remotePath:
          'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/last.json',
      },
      restartOnAuthFail: true,
    });

    // ---- Events
    this.client.on('qr', (qr) => {
      this.logger.log('QR reçu — scanne-le dans WhatsApp > Appareils liés');
      this.lastQr = qr;
      this.ready = false;
      this.lastState = 'INITIALIZING';

      // ★ Au démarrage SANS session, on notifie qu'une (re)connexion est requise.
      // if (!hadPrevSession) {
        void this.sendConnexionFailureAlert();
      // }
    });

    this.client.on('authenticated', () => {
      this.logger.log('Authentifié');
      this.lastQr = null;
    });

    this.client.on('ready', () => {
      this.logger.log('Client prêt');
      this.ready = true;
      this.lastState = 'CONNECTED';
      this.lastQr = null;

      // ★ Service opérationnel => mail de succès
      void this.sendMailWatsappserviceReady();
      // reset compteur d'échecs d’envoi
      this.currentFailNumber = 0;
    });

    this.client.on('change_state', (state) => {
      this.logger.warn(`État WhatsApp: ${state}`);
      this.lastState = (state as ConnState) ?? 'UNKNOWN';
    });

    this.client.on('auth_failure', (msg) => {
      this.logger.error(`Échec auth: ${msg}`);
      this.ready = false;
      this.lastState = 'UNKNOWN';
      this.lastQr = null;

      // ★ Alerte échec d’authentification
      void this.sendConnexionFailureAlert();
    });

    this.client.on('disconnected', (reason) => {
      this.logger.warn(`Déconnecté: ${reason}`);
      this.ready = false;
      this.lastState = 'UNKNOWN';
      this.lastQr = null;

      // ★ Alerte déconnexion
      void this.sendConnexionFailureAlert();

      // relance douce
      setTimeout(() => this.reinitialize().catch(() => {}), 1500);
    });

    if (!hadPrevSession) {
      // ★ Dès le boot, s'il n'y a pas de session, on prévient immédiatement
      // (utile si on n’attend pas l’event 'qr' pour informer).
      void this.sendConnexionFailureAlert();
    }

    await this.client.initialize();
  }

  private async reinitialize() {
    try {
      await this.client?.destroy();
    } catch {
      this.logger.warn('Failed to destroy client');
    }
    this.client = null;
    await this.boot();
  }

  /** ---- Public API (utilisées par le Controller) ---- */

  /** Renvoie le dernier QR (brut + dataURL PNG) */
  async getQr(): Promise<{ qr: string | null; pngDataUrl?: string }> {
    if (!this.lastQr) return { qr: null };
    const pngDataUrl = await QR.toDataURL(this.lastQr);
    return { qr: this.lastQr, pngDataUrl };
  }

  /** Statut courant */
  async getStatus(): Promise<{ status: boolean; state: ConnState }> {
    if (!this.client) return { status: false, state: 'NO_CLIENT' };
    try {
      const state = await (this.client as any).getState?.();
      const norm: ConnState = (state as ConnState) ?? 'UNKNOWN';
      this.lastState = norm;
      return { status: this.ready, state: norm };
    } catch {
      return { status: this.ready, state: this.lastState };
    }
  }

  /** Envoi d’un message texte */
  async sendText(to: string, message: string, countryCode?: string) {
    this.assertClient();
    await this.ensureInjectionReady();

    try {
      const phone = this.formatPhone(to, countryCode);
      const wid = await this.client!.getNumberId(phone); // null si non WhatsApp
      if (!wid?._serialized) {
        // ★ échec logique d’envoi -> incrément + check
        this.currentFailNumber++;
        await this.checkForMassFailure();
        return { success: false, error: 'Recipient is not on WhatsApp' };
      }

      await this.client!.sendMessage(wid._serialized, message);
      // ★ succès -> reset compteur
      this.currentFailNumber = 0;
      return { success: true };
    } catch (e: any) {
      // ★ échec technique -> incrément + check
      this.currentFailNumber++;
      await this.checkForMassFailure();
      return { success: false, error: e?.message || 'Send failed' };
    }
  }

  /** Envoi d’un média (via URL) + légende optionnelle */
  async sendMediaUrl(
    to: string,
    fileUrl: string,
    caption?: string,
    countryCode?: string,
  ) {
    this.assertClient();
    await this.ensureInjectionReady();

    try {
      const phone = this.formatPhone(to, countryCode);
      const wid = await this.client!.getNumberId(phone);
      if (!wid?._serialized) {
        // ★ échec logique d’envoi -> incrément + check
        this.currentFailNumber++;
        await this.checkForMassFailure();
        return { success: false, error: 'Recipient is not on WhatsApp' };
      }

      const media = await MessageMedia.fromUrl(fileUrl);
      await this.client!.sendMessage(wid._serialized, media, { caption });

      // ★ succès -> reset compteur
      this.currentFailNumber = 0;
      return { success: true };
    } catch (e: any) {
      // ★ échec technique -> incrément + check
      this.currentFailNumber++;
      await this.checkForMassFailure();
      return { success: false, error: e?.message || 'Send failed' };
    }
  }

  // ---------- Helpers ----------
  private assertClient() {
    if (!this.client) throw new Error('Client not initialized');
    if (!this.ready)
      this.logger.warn('Client not ready yet, tentative d’envoi…');
  }

  /** ping d’injection: échoue tant que l’injection n’est pas prête */
  private async ensureInjectionReady(timeoutMs = 20_000) {
    if (!this.client) throw new Error('Client not initialized');
    const start = Date.now();
    let lastErr: any;
    while (Date.now() - start < timeoutMs) {
      try {
        await this.client.getChats();
        return;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    this.logger.error('Injection timeout: ' + (lastErr?.message ?? lastErr));
    throw new Error('Injection not ready');
  }

  private formatPhone(to: string, cc?: string) {
    let s = to.replace(/\D/g, '');
    if (cc && !s.startsWith(cc)) s = cc + s;
    return s;
  }

  // ---------- Emails / Notifications ----------
  private async sendConnexionFailureAlert() {
    try {
      await this.email.sendWhatsappAlert(
        '🚨 WhatsApp Connexion Failure 🚨',
        'whatsapp_off',
      );
    } catch (e) {
      this.logger.error('Failed to send connexion failure alert');
    }
  }

  private async checkForMassFailure() {
    if (this.currentFailNumber >= this.maxFailNumber) {
      try {
        await this.email.sendWhatsappAlert(
          '⚠️ WhatsApp Mass Failure ⚠️',
          `whatsapp_mass_fail`,
        );
      } catch {
        // ignore
      } finally {
        // on reset après alerte pour éviter le spam
        this.currentFailNumber = 0;
      }
    }
  }

  private async sendMailWatsappserviceReady() {
    try {
      await this.email.sendWhatsappAlert(
        '✅ WhatsApp Service Ready ✅',
        `whatsapp_on`,
      );
    } catch (e) {
      this.logger.error('Failed to send mail watsappservice ready');
    }
  }

  showName(user: any): string {
    return (user as any).name || `${user.firstName} ${user.lastName}`;
  }

  // MONEY SENT SUCCESSFULLY (Msg for receiver)
  async sendMessageForTransferReceiver(transactionData, language: string) {
    const message = this.buildMessageForTransferReceiver(
      transactionData,
      language,
    );
    return await this.sendText(
      transactionData.receiverContact,
      message,
      transactionData.receiverCountryCode,
    );
  }

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
        `\n _Accédez à votre compte_ : ${this.frontUrl} \n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New payment received !*\n\n` +
        `Hello ${transaction.receiverName}\n` +
        `You received a payment of *${transaction.estimation} ${transaction.receiverCurrency}* from *${transaction.senderName}*\n` +
        `Transaction reference: ${transaction._id}\n` +
        `Thank you for trusting digiKUNTZ Payments. \n` +
        `\n _Access your account_ : ${this.frontUrl}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // MONEY SENT SUCCESSFULLY (Msg for sender)
  async sendMessageForTransferSender(transactionData, language: string) {
    const message = this.buildMessageForTransferSender(
      transactionData,
      language,
    );
    return await this.sendText(
      transactionData.senderContact,
      message,
      transactionData.senderCountryCode,
    );
  }

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
        `\n _Accédez à votre compte_ : ${this.frontUrl} \n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New payment made !*\n\n` +
        `Hello ${transaction.senderName}\n` +
        `You sent *${transaction.estimation} ${transaction.senderCurrency}* to *${transaction.receiverName}*\n` +
        `Transaction reference: ${transaction._id}\n` +
        `Thank you for trusting digiKUNTZ Payments.\n` +
        `\n _Access your account_ : ${this.frontUrl}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // ACCOUNT CREATION MESSAGE
  async sendWelcomeMessage(user: any, countryCode: string) {
    const message = this.buildAccountCreationMessage(user);
    return await this.sendText(user.phone, message, countryCode);
  }

  private buildAccountCreationMessage(user: any): string {
    if (user.language === 'fr')
      return (
        `*Bienvenue ${this.showName(user)} !*\n\n` +
        `Votre compte *digiKUNTZ Payments* a été créé avec succès.\n` +
        `Nous sommes ravis de vous accueillir chez-nous chez-vous.\n` +
        `Votre solution intelligente tout-en-un pour la gestion de vos paiements.\n` +
        `Vous pouvez dès à présent effectuer vos transactions et gérer vos abonnements facilement.\n` +
        `\n _Accédez à votre compte_ : ${this.frontUrl} \n` +
        `\n\n> Ceci est un message automatique du service WhatsApp de digiKUNTZ Payments.`
      );
    else
      return (
        `*Welcome ${this.showName(user)} !*\n\n` +
        `Your *digiKUNTZ Payments* account has been successfully created.\n` +
        `We are delighted to welcome you to our platform.*\n` +
        `Your smart all-in-one solution for payments management.\n` +
        `You can now make payments and manage your plans easily.\n` +
        `\n _Access your account_ : ${this.frontUrl}` +
        `\n\n> This is an automatic message from the digiKUNTZ Payments WhatsApp service.`
      );
  }

  // BALANCE CREDITED
  async sendBalanceCreditedMessage(transaction: any, language: string) {
    const message = this.buildBalanceCreditedMessage(transaction, language);
    return await this.sendText(
      transaction.receiverContact,
      message,
      transaction.receiverCountryCode,
    );
  }

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
        `\n _Accédez à votre compte_ : ${this.frontUrl} \n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*Balance credited!*\n\n` +
        `Hello *${transaction.receiverName}*\n` +
        `Your account has been credited with *${transaction.estimation} ${transaction.receiverCurrency}*.\n` +
        `Reason: ${transaction.raisonForTransfer || 'Account credit'}\n\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n _Access your account_ : ${this.frontUrl}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // BALANCE DEBITED
  async sendBalanceDebitedMessage(transaction: any, language: string) {
    const message = this.buildBalanceDebitedMessage(transaction, language);
    return await this.sendText(
      transaction.receiverContact,
      message,
      transaction.receiverCountryCode,
    );
  }

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
        `\n _Access your account_ : ${this.frontUrl}\n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*Balance debited!*\n\n` +
        `Hello *${transaction.senderName}*\n` +
        `Your account has been debited by *${transaction.paymentWithTaxes} ${transaction.senderCountry}*.\n` +
        `Reason: ${transaction.raisonForTransfer || 'Account debit'}\n\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n _Access your account_ : ${this.frontUrl}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // NEW SUBSCRIBER OF PLAN
  async sendNewSubscriberMessage(plan: any, user: any) {
    const message = this.buildNewSubscriberMessage(plan, user);
    return await this.sendText(user.phone, message, user.countryId.code);
  }

  private buildNewSubscriberMessage(plan: any, user: any): string {
    if (user.language === 'fr')
      return (
        `*Nouvel abonnement actif !*\n\n` +
        `Hello ${this.showName(user)},\n` +
        `Vous venez de souscrire à *${plan.title}* (${plan.subTitle}).\n` +
        `Merci d'utiliser digiKUNTZ Payments.\n` +
        `\n _Access your account_ : ${this.frontUrl}\n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New subscription activated!*\n\n` +
        `Hello ${this.showName(user)},\n` +
        `You have successfully subscribed to *${plan.title}* (${plan.subTitle}).\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n _Access your account_ : ${this.frontUrl}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // NEW SUBSCRIBER OF PLAN (By plan author to subscriber)
  async sendNewSubscriberMessageFromPlanAuthor(plan: any, user: any) {
    const message = this.buildNewSubscriberMessageFromPlanAuthor(plan, user);
    console.log('message: ', message);
    console.log('user to send Whatsapp: ', user);

    // Vérifier si countryId est un objet complet ou juste un ID
    const countryCode = user.countryId?.code || user.countryId;
    if (!countryCode) {
      console.error('Country code not found for user:', user._id);
      return;
    }

    console.log('Sending to: ', countryCode + user.phone);
    return await this.sendText(user.phone, message, countryCode);
  }

  private buildNewSubscriberMessageFromPlanAuthor(
    plan: any,
    subscriber: any, // Subscriber
  ): string {
    if (subscriber.language === 'fr')
      return (
        `*Nouvel abonnement actif !*\n\n` +
        `Hello ${this.showName(subscriber)},\n` +
        `Vous avez été affilié à *${plan.title}* (${plan.subTitle}).\n` +
        `\n _Vous pouvez payer via_ : ${this.frontUrl}/package-details/${plan._id}AAA${subscriber._id} \n\n` +
        `Vos informations de connexion sont les suivantes\n` +
        `Email: ${subscriber.email}\n` +
        `Mot de passe: *12345678*\n` +
        `Pensez à les modifier dès que possible.\n` +
        `Merci d'utiliser digiKUNTZ Payments.\n` +
        `\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New subscription activated!*\n\n` +
        `Hello ${this.showName(subscriber)},\n` +
        `You have successfully subscribed to *${plan.title}* (${plan.subTitle}).\n` +
        `\n _You can pay via_ : ${this.frontUrl}/package-details/${plan._id}AAA${subscriber._id} \n\n` +
        `Your login information is as follows:\n` +
        `Email: ${subscriber.email}\n` +
        `Password: *12345678*\n` +
        `Consider changing them as soon as possible.\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // NEW SUBSCRIBER OF PLAN (for plan author)
  async sendNewSubscriberMessageForPlanAuthor(plan: any, user: any) {
    const message = this.buildNewSubscriberMessageForPlanAuthor(plan, user);

    // Vérifier si countryId est un objet complet ou juste un ID
    const countryCode = user.countryId?.code || user.countryId;
    if (!countryCode) {
      console.error('Country code not found for user:', user._id);
      return;
    }

    return await this.sendText(user.phone, message, countryCode);
  }

  private buildNewSubscriberMessageForPlanAuthor(
    plan: any,
    author: any,
  ): string {
    if (author.language === 'fr')
      return (
        `*Nouvel abonnement actif !*\n\n` +
        `Hello ${this.showName(author)},\n` +
        `Vous avez un nouvel abonné à *${plan.title}* (${plan.subTitle}).\n` +
        `Merci d'utiliser digiKUNTZ Payments.\n` +
        `\n _Access your account_ : ${this.frontUrl}\n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New subscription activated!*\n\n` +
        `Hello ${this.showName(author)},\n` +
        `You have a new subscriber to *${plan.title}* (${plan.subTitle}).\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n _Access your account_ : ${this.frontUrl}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // NEED VALIDATION PAYMENT (ADMIN)
  async sendNeedValidationMessage(transaction: any, language: any) {
    const message = this.buildNeedValidationMessage(transaction, language);
    return await this.sendText(
      this.alertPhoneNumber,
      message,
      this.alertCountryCode,
    );
  }

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
