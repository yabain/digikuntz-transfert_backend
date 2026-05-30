/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { EmailService } from 'src/email/email.service';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/user/user.schema';
import mongoose from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { UserService } from 'src/user/user.service';
import { PlansService } from 'src/plans/plans.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SystemService } from 'src/system/system.service';

type ConnState = 'CONNECTED' | 'DISABLED' | 'MISCONFIGURED' | 'UNKNOWN';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  private lastState: ConnState = 'UNKNOWN';
  private sendOnStart = false;
  private frontUrl = '';
  private alertEmail = 'flambel55@gmail.com,f.sanou@yaba-in.com';
  private alertPhoneNumber = '691224472';
  private alertCountryCode = '237';
  private currentFailNumber = 0;
  private readonly maxFailNumber = 6;
  private metaEnabled = true;
  private metaApiVersion = 'v22.0';
  private metaPhoneNumberId = '';
  private metaAccessToken = '';
  private metaUseTemplates = true;
  private startupTemplateTestEnabled = false;
  private startupTemplateTestName = 'dk_whatsapp_on';
  private startupTemplateTestLang = 'en';

  onModuleInit() {
    setImmediate(() => void this.bootstrapMeta());
  }

  constructor(
    @InjectModel(User.name) private userModel: mongoose.Model<User>,
    private config: ConfigService,
    private email: EmailService,
    private readonly http: HttpService,
    private userService: UserService,
    private systemService: SystemService,
    @Inject(forwardRef(() => PlansService))
    private planService: PlansService,
  ) {
    this.frontUrl =
      this.config.get<string>('FRONT_URL') || 'https://example.com';
    this.alertEmail = this.config.get<string>('ALERT_EMAIL') || this.alertEmail;
    this.alertPhoneNumber =
      this.config.get<string>('ALERT_PHONE') || this.alertPhoneNumber;
    this.alertCountryCode =
      this.config.get<string>('ALERT_COUNTRY_CODE') || this.alertCountryCode;
    this.metaEnabled =
      String(this.config.get<string>('WHATSAPP_META_ENABLED') || 'true') !==
      'false';
    this.metaApiVersion =
      this.config.get<string>('WHATSAPP_META_API_VERSION') || 'v22.0';
    this.metaPhoneNumberId =
      this.config.get<string>('WHATSAPP_META_PHONE_NUMBER_ID') || '';
    this.metaAccessToken =
      this.config.get<string>('WHATSAPP_META_ACCESS_TOKEN') || '';
    this.metaUseTemplates =
      String(this.config.get<string>('WHATSAPP_META_USE_TEMPLATES') || 'true') !==
      'false';
    this.startupTemplateTestEnabled =
      String(
        this.config.get<string>('NODE_ENV') === 'development' ? 'false': 'true',
      ) !== 'false';
    this.startupTemplateTestName =
      this.config.get<string>('WHATSAPP_STARTUP_TEMPLATE_TEST_NAME') ||
      this.startupTemplateTestName;
    this.startupTemplateTestLang =
      this.config.get<string>('WHATSAPP_STARTUP_TEMPLATE_TEST_LANG') ||
      this.startupTemplateTestLang;
  }

  private async bootstrapMeta() {
    if (!this.metaEnabled) {
      this.lastState = 'DISABLED';
      this.logger.warn('WhatsApp Meta integration is disabled');
      return;
    }
    if (!this.metaPhoneNumberId || !this.metaAccessToken) {
      this.lastState = 'MISCONFIGURED';
      this.logger.error(
        'WhatsApp Meta is misconfigured: missing WHATSAPP_META_PHONE_NUMBER_ID or WHATSAPP_META_ACCESS_TOKEN',
      );
      if (!this.sendOnStart) {
        this.sendOnStart = true;
        await this.sendConnexionFailureAlert();
      }
      return;
    }
    this.lastState = 'CONNECTED';
    await this.sendMailWatsappserviceReady();
    // await this.runStartupTemplateTest();
  }

  /** Not used in Meta mode; preserved for backward compatibility */
  async getQr(): Promise<{ qr: string | null; pngDataUrl?: string }> {
    return { qr: null };
  }

  /** Status in Meta mode */
  async getStatus(): Promise<{ status: boolean; state: ConnState }> {
    const ok = this.metaEnabled && !!this.metaPhoneNumberId && !!this.metaAccessToken;
    return { status: ok, state: ok ? 'CONNECTED' : this.lastState };
  }

  /** Send plain text via WhatsApp Cloud API */
  async sendText(to: string, message: string, countryCode?: string) {
    try {
      await this.sendMetaPayload({
        ...this.buildMetaEnvelope(to, countryCode, 'text'),
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      });
      this.currentFailNumber = 0;
      return { success: true };
    } catch (e: any) {
      const errorMessage = e?.message ?? String(e);
      this.logger.error(`Failed to send message: ${errorMessage}`);
      this.currentFailNumber++;
      await this.checkForMassFailure();
      return { success: false, error: errorMessage || 'Send failed' };
    }
  }

  private async runStartupTemplateTest() {

    this.logger.log('[WA Startup Test] Step 1/6: preparing test context');
    const lang = this.resolveTemplateLang(this.startupTemplateTestLang);
    const admins = await this.getAdminRecipients();
    const recipients = admins.filter((admin) => this.getUserPhone(admin));
    const candidates = Array.from(
      new Set(
        [
      this.startupTemplateTestName,
      'dk_whatsapp_on',
        ].filter(Boolean),
      ),
    );

    if (!recipients.length) {
      this.logger.warn('[WA Startup Test] No admin recipient found, skipping startup template send');
      return;
    }

    this.logger.log(
      `[WA Startup Test] Step 2/6: targets=${recipients.length} admin(s), templates=${candidates.join(', ')}, language=${lang}`,
    );

    for (const recipient of recipients) {
      const to = this.getUserPhone(recipient);
      const countryCode = this.getUserCountryCode(recipient);
      const recipientLang = this.getUserLanguage(recipient) || lang;
      let sent = false;
      for (const name of candidates) {
        try {
          this.logger.log(
            `[WA Startup Test] Step 3/6: sending template "${name}" to admin "${to}"`,
          );
          await this.sendMetaTemplateMessage(
            to,
            countryCode,
            name,
            recipientLang,
          );
          this.logger.log(
            `[WA Startup Test] Step 4/6: template "${name}" accepted by Meta for admin "${to}"`,
          );
          sent = true;
          break;
        } catch (error: any) {
          const details =
            typeof error?.getResponse === 'function'
              ? error.getResponse()
              : error?.response?.data || error;
          this.logger.warn(
            `[WA Startup Test] template "${name}" failed for admin "${to}": ${JSON.stringify(details)}`,
          );
        }
      }
      if (!sent) {
        this.logger.error(
          `[WA Startup Test] All template candidates failed for admin "${to}"`,
        );
      }
    }

    this.logger.log('[WA Startup Test] Step 5/6: startup test completed');
    this.logger.log('[WA Startup Test] Step 6/6: done');
  }

  async sendPasswordResetMessage(user: any, token: string) {
    console.log('In sendPasswordResetMessage');
    console.log(
      'Sending reset password message to: ',
      user?.whatsapp || user?.phone,
      ' with token: ',
      token,
    );
    if (!user) return;
    const countryCode = user.countryId?.code || user.countryId;
    const tokenString = String(token || '');
    const resetToken = tokenString.includes('/')
      ? tokenString.split('/').pop() || tokenString
      : tokenString;
    const resetUrl = `${this.frontUrl}/auth/new-password/${resetToken}`;
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(user.language);
        const templateName = 'dk_reset_password';
        console.log(
          `Sending ${templateName} to ${user.whatsapp || user.phone} with userName: ${this.showName(user)} and token: `,
          resetToken,
        );
        await this.sendMetaTemplateMessage(
          user.whatsapp || user.phone,
          countryCode,
          templateName,
          lang,
          [this.showName(user)],
          resetToken,
        );
        return { success: true };
      } catch (error) {
        const details =
          typeof error?.getResponse === 'function'
            ? error.getResponse()
            : error?.response?.data || error;
        this.logger.warn(
          `Template send failed (password reset), fallback text: ${JSON.stringify(details)}`,
        );
      }
    }
    const message =
      user.language === 'fr'
        ? `*Réinitialisation de mot de passe*\n\nHello ${this.showName(user)},\nVeuillez réinitialiser votre mot de passe via ce lien:\n${resetUrl}\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
        : `*Password reset*\n\nHello ${this.showName(user)},\nPlease reset your password using this link:\n${resetUrl}\n\n> This is an automatic message from digiKUNTZ Payments.`;
    return await this.sendText(user.whatsapp || user.phone, message, countryCode);
  }

  async sendWelcomeMessage(user: any, countryCode: string) {
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(user?.language);
        await this.sendMetaTemplateMessage(
          user.phone,
          countryCode,
          `dk_account_creation`,
          lang,
          [this.showName(user)],
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (welcome), fallback text: ${error?.message ?? error}`);
      }
    }
  }




  /** ---- Public API (utilisées par le Controller) ---- */


  /** Send media (image URL) via WhatsApp Cloud API */
  async sendMediaUrl(
    to: string,
    fileUrl: string,
    caption?: string,
    countryCode?: string,
  ) {
    try {
      await this.sendMetaPayload({
        ...this.buildMetaEnvelope(to, countryCode, 'image'),
        type: 'image',
        image: {
          link: fileUrl,
          caption: caption || '',
        },
      });
      this.currentFailNumber = 0;
      return { success: true };
    } catch (e: any) {
      const errorMessage = e?.message ?? String(e);
      this.logger.error(`Failed to send media: ${errorMessage}`);
      this.currentFailNumber++;
      await this.checkForMassFailure();
      return { success: false, error: errorMessage || 'Send failed' };
    }
  }

  async sendTemplate(
    to: string,
    templateName: string,
    language: string,
    bodyParams: string[] = [],
    buttonUrlParam?: string,
    countryCode?: string,
  ) {
    try {
      await this.sendMetaTemplateMessage(
        to,
        countryCode,
        templateName,
        language,
        bodyParams,
        buttonUrlParam,
      );
      this.currentFailNumber = 0;
      return { success: true };
    } catch (e: any) {
      const errorMessage = e?.message ?? String(e);
      this.logger.error(`Failed to send template: ${errorMessage}`);
      this.logger.error(`Raw: ${e}`);
      this.currentFailNumber++;
      await this.checkForMassFailure();
      return { success: false, error: errorMessage || 'Send failed' };
    }
  }

  private getMetaBaseUrl(): string {
    return `https://graph.facebook.com/${this.metaApiVersion}/${this.metaPhoneNumberId}/messages`;
  }

  private assertMetaReady() {
    if (!this.metaEnabled) {
      throw new HttpException(
        'WhatsApp Meta integration disabled',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!this.metaPhoneNumberId || !this.metaAccessToken) {
      throw new HttpException(
        'WhatsApp Meta integration misconfigured',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async sendMetaPayload(payload: Record<string, any>) {
    if (!(await this.isWhatsappNotificationsEnabled())) {
      return { skipped: true, reason: 'WhatsApp notifications disabled' };
    }

    this.assertMetaReady();
    try {
      const res = await firstValueFrom(
        this.http.post(this.getMetaBaseUrl(), payload, {
          headers: {
            Authorization: `Bearer ${this.metaAccessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 20000,
        }),
      );
      return res.data;
    } catch (error: any) {
      const details = error?.response?.data || error?.message || error;
      throw new HttpException(
        {
          message: 'Failed to send WhatsApp message via Meta Cloud API',
          details,
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async isWhatsappNotificationsEnabled(): Promise<boolean> {
    const systemData = await this.systemService.getSystemData();
    return systemData?.whatsappNotificationsEnabled !== false;
  }

  private resolveTemplateLang(language?: string): string {
    return String(language || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';
  }

  private buildMetaEnvelope(
    to: string,
    countryCode: string | undefined,
    type: 'text' | 'image' | 'template',
  ) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: this.formatPhone(to, countryCode),
      type,
    };
  }

  private async sendMetaTemplateMessage(
    to: string,
    countryCode: string | undefined,
    templateName: string,
    language: string,
    bodyParams: string[] = [],
    buttonUrlParam?: string,
  ) {
    const components: any[] = [];

    if (bodyParams.length) {
      components.push({
        type: 'body',
        parameters: bodyParams.map((text) => ({ type: 'text', text: String(text ?? '') })),
      });
    }

    if (buttonUrlParam) {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: 0,
        parameters: [{ type: 'text', text: String(buttonUrlParam) }],
      });
    }

    return this.sendMetaPayload({
      ...this.buildMetaEnvelope(to, countryCode, 'template'),
      type: 'template',
      template: {
        name: templateName,
        language: { code: this.resolveTemplateLang(language) },
        ...(components.length ? { components } : {}),
      },
    });
  }

  private async sendMetaTemplateByPriority(
    to: string,
    countryCode: string | undefined,
    templateNames: string[],
    language: string,
    bodyParams: string[] = [],
    buttonUrlParam?: string,
  ) {
    let lastError: any;
    for (const templateName of templateNames) {
      try {
        return await this.sendMetaTemplateMessage(
          to,
          countryCode,
          templateName,
          language,
          bodyParams,
          buttonUrlParam,
        );
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private formatPhone(to: string, cc?: string) {
    const rawTo = String(to || '').trim();
    let s = rawTo.replace(/\D/g, '');
    if (!s) return s;
    let country = String(cc || '').replace(/\D/g, '');

    // Guard against invalid country values (e.g. Mongo ObjectId) accidentally passed in.
    if (country.length < 1 || country.length > 4) {
      country = '';
    }

    // If caller already provided an international number (+...), keep it as-is.
    if (rawTo.startsWith('+')) {
      return s;
    }

    if (country && !s.startsWith(country)) {
      if (s.startsWith('0')) s = s.slice(1);
      s = `${country}${s}`;
    }
    return s;
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
    if (!this.startupTemplateTestEnabled) {
      this.logger.log('[WA Startup Test] Disabled by config');
      return;
    }

    try {
      await this.email.sendWhatsappAlert(
        '✅ WhatsApp Service Ready ✅',
        `whatsapp_on`,
      );
    } catch (e) {
      this.logger.error('Failed to send mail watsappservice ready');
    }

    await this.runStartupTemplateTest();
  }

  // ---------- Notifications ----------
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

  showName(user: any): string {
    return (user as any).name || `${user.firstName} ${user.lastName}`;
  }

  private async getAdminRecipients() {
    return this.userModel
      .find({ isAdmin: true, isActive: { $ne: false } })
      .select('name firstName lastName language whatsapp phone countryId')
      .populate('countryId', 'code')
      .lean();
  }

  private getUserLanguage(user: any): 'en' | 'fr' {
    return this.resolveTemplateLang(user?.language) === 'en' ? 'en' : 'fr';
  }

  private getUserPhone(user: any): string {
    return String(user?.whatsapp || user?.phone || '');
  }

  private getUserCountryCode(user: any): string | undefined {
    return String((user as any)?.countryId?.code || user?.countryId || '').trim() || undefined;
  }

  // MONEY SENT SUCCESSFULLY (Msg for receiver)
  async sendMessageForTransferReceiver(transactionData, language: string = 'fr') {
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(language);
        await this.sendMetaTemplateMessage(
          transactionData.receiverContact,
          transactionData.receiverCountryCode,
          `dk_transfer_success_receiver`,
          lang,
          [
            transactionData.receiverName,
            String(transactionData.estimation),
            transactionData.receiverCurrency,
            transactionData.senderName,
            transactionData.transactionRef || transactionData._id,
          ],
          String(transactionData._id),
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (transfer receiver), fallback text: ${error?.message ?? error}`);
      }
    }
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
        `Référence de la transaction : ${transaction.transactionRef}\n` +
        `Merci de faire confiance à digiKUNTZ Payments. \n` +
        `\n _Accédez à votre reçu_ : ${this.frontUrl}/invoice/${transaction._id} \n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New payment received !*\n\n` +
        `Hello ${transaction.receiverName}\n` +
        `You received a payment of *${transaction.estimation} ${transaction.receiverCurrency}* from *${transaction.senderName}*\n` +
        `Transaction reference: ${transaction.transactionRef}\n` +
        `Thank you for trusting digiKUNTZ Payments. \n` +
        `\n _Access your downloadable receipt_ : ${this.frontUrl}/invoice/${transaction._id} \n` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // MONEY SENT SUCCESSFULLY (Msg for sender)
  async sendMessageForTransferSender(transactionData, language: string = 'fr') {
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(language);
        await this.sendMetaTemplateMessage(
          transactionData.senderContact,
          transactionData.senderCountryCode,
          `dk_transfer_success_sender`,
          lang,
          [
            transactionData.senderName,
            String(transactionData.estimation),
            transactionData.senderCurrency,
            transactionData.receiverName,
            transactionData.transactionRef || transactionData._id,
          ],
          String(transactionData._id),
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (transfer sender), fallback text: ${error?.message ?? error}`);
      }
    }
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
        `\n _Accédez à votre reçu_ : ` +
        `${this.frontUrl}/invoice/${transaction._id}` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New payment made !*\n\n` +
        `Hello ${transaction.senderName}\n` +
        `You sent *${transaction.estimation} ${transaction.senderCurrency}* to *${transaction.receiverName}*\n` +
        `Transaction reference: ${transaction._id}\n` +
        `Thank you for trusting digiKUNTZ Payments.\n` +
        `\n _Access your downloadable receipt_ :` +
        `${this.frontUrl}/invoice/${transaction._id}` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // ACCOUNT CREATION MESSAGE

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
        `\n _Access your account_ : ${this.frontUrl}/dashboard` +
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
        `\n _Accédez à votre compte_ : ${this.frontUrl}\n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*Balance debited!*\n\n` +
        `Hello *${transaction.senderName}*\n` +
        `Your account has been debited by *${transaction.paymentWithTaxes} ${transaction.senderCountry}*.\n` +
        `Reason: ${transaction.raisonForTransfer || 'Account debit'}\n\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n _Access your account_ : ${this.frontUrl}/dashboard` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // NEW SUBSCRIBER OF PLAN
  async sendupgradeSubscriberMessage(planId: string, userId: string, transactionId: string) {
    const plan = await this.planService.getPlansById(planId);
    const user = await this.userService.getUserById(userId);
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(user?.language);
        await this.sendMetaTemplateMessage(
          user.phone.toString(),
          user.countryId.code.toString(),
          `dk_subscription_user`,
          lang,
          [
            this.showName(user),
            plan?.title ?? '',
            plan?.subTitle ?? '',
            String(plan?.amount ?? plan?.price ?? ''),
            String(plan?.currency ?? ''),
            transactionId,
          ],
          transactionId,
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (subscription user upgrade), fallback text: ${error?.message ?? error}`);
      }
    }
    const message = this.buildUpgradeSubscriberMessage(plan, user, transactionId);

    console.log('sendNewSubscriberMessage user: ', user);
    console.log('sendNewSubscriberMessage plan: ', plan);
    console.log('Sending to: ', user.countryId.code + user.phone);
    console.log('message: ', message);
    return await this.sendText(user.phone.toString(), message, user.countryId.code.toString());
  }
  private buildUpgradeSubscriberMessage(plan: any, user: any, transactionId: string): string {
    if (user.language === 'fr')
      return (
        `*Confirmation de votre paiement !*\n\n` +
        `Hello ${this.showName(user)},\n` +
        `Nous vous confirmons votre paiement. \n` +
        `Vous trouverez ci-dessous les informations relatives à votre transaction.\n\n` +
        `Motif du paiement : *${plan.title}* (${plan.subTitle}).\n` +
        `Consulter votre reçu: ${this.frontUrl}/invoice/${transactionId}\n\n` +
        `Merci d'utiliser digiKUNTZ Payments.\n` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*Confirmation of your payment !*\n\n` +
        `Hello ${this.showName(user)},\n` +
        `We confirm your payment. \n` +
        `You will find your transaction details below.\n\n` +
        `Reason for payment : *${plan.title}* (${plan.subTitle}).\n` +
        `View your receipt : ${this.frontUrl}/invoice/${transactionId}\n\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // NEW SUBSCRIBER OF PLAN
  async sendNewSubscriberMessage(planId: string, userId: string, transactionId: string) {
    const plan = await this.planService.getPlansById(planId);
    const user = await this.userService.getUserById(userId);
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(user?.language);
        await this.sendMetaTemplateMessage(
          user.phone.toString(),
          user.countryId.code.toString(),
          `dk_subscription_user`,
          lang,
          [
            this.showName(user),
            plan?.title ?? '',
            plan?.subTitle ?? '',
            String(plan?.amount ?? plan?.price ?? ''),
            String(plan?.currency ?? ''),
            transactionId,
          ],
          transactionId,
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (subscription user), fallback text: ${error?.message ?? error}`);
      }
    }
    const message = this.buildNewSubscriberMessage(plan, user, transactionId);

    console.log('sendNewSubscriberMessage user: ', user);
    console.log('sendNewSubscriberMessage plan: ', plan);
    console.log('Sending to: ', user.countryId.code + user.phone);
    console.log('message: ', message);
    return await this.sendText(user.phone, message, user.countryId.code);
  }

  private buildNewSubscriberMessage(plan: any, user: any, transactionId: string): string {
    if (user.language === 'fr')
      return (
        `*Nouvel abonnement actif !*\n\n` +
        `Hello ${this.showName(user)},\n` +
        `Vous venez d'effectuer un paiement pour: *${plan.title}* (${plan.subTitle}).\n` +
        `Votre reçu: ${this.frontUrl}/invoice/${transactionId}\n\n` +
        `Merci d'utiliser digiKUNTZ Payments.\n` +
        `\n _Accédez à votre compte_ : ${this.frontUrl}/dashboard` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New subscription activated!*\n\n` +
        `Hello ${this.showName(user)},\n` +
        `You have made a payment for *${plan.title}* (${plan.subTitle}).\n` +
        `Your invoice: ${this.frontUrl}/invoice/${transactionId}\n\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n _Access your account_ : ${this.frontUrl}/dashboard` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // NEW SUBSCRIBER OF PLAN (By plan author to subscriber)
  async sendNewSubscriberMessageFromPlanAuthor(plan, user) {
    if (!plan || !user) return;
    if (!user.phone || !user.countryId?.code) return;

    const message = this.buildNewSubscriberMessageFromPlanAuthor(plan, user);
    console.log('Sending to: ', user.countryId.code.toString() + user.phone.toString());
    console.log('message: ', message);
    return await this.sendText(
      user.phone.toString(),
      message,
      user.countryId.code.toString(),
    );
  }

  private buildNewSubscriberMessageFromPlanAuthor(
    plan: any,
    subscriber: any, // Subscriber
  ): string {
    if (subscriber.language === 'fr')
      return (
        `*Demande de paiement !*\n\n` +
          `Hello ${this.showName(subscriber)},\n` +
          `Vous avez été affilié au plan de paiement: *${plan.title}* (${plan.subTitle}).\n` +
          // `\n _Vous pouvez payer via_ : ${this.frontUrl}/package-details/${plan._id}AAA${subscriber._id} \n\n` +
          `\n _Vous pouvez payer via_ : ${this.frontUrl}/package-details/${plan._id}\n` +
          `Vos informations de connexion sont les suivantes\n` +
          `Email: ${subscriber.email}\n` +
          `Pays: ${subscriber.countryId.name}\n` +
          `phone: ${subscriber.phone}\n` +
          `Mot de passe: *12345678*\n` +
          `Pensez à les modifier dès que possible.\n` +
          `Merci d'utiliser digiKUNTZ Payments.\n` +
        `\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New subscription activated!*\n\n` +
          `Hello ${this.showName(subscriber)},\n` +
          `You have been enrolled in the payment plan : *${plan.title}* (${plan.subTitle}).\n` +
          `\n _You can pay via_ : ${this.frontUrl}/package-details/${plan._id}\n` +
          `Your login information is as follows:\n` +
          `Email: ${subscriber.email}\n` +
          `Country: ${subscriber.countryId.name}\n` +
          `Phone: ${subscriber.phone}\n` +
          `Password: *12345678*\n` +
          `Consider changing them as soon as possible.\n` +
          `Thank you for using digiKUNTZ Payments.\n` +
        `\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // NEW SUBSCRIBER OF PLAN (for plan author)
  async sendNewSubscriberMessageForPlanAuthor(plan, user) {
    if (!plan || !user) return;
    if (!user.phone || !user.countryId?.code) return;
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(user?.language);
        await this.sendMetaTemplateMessage(
          user.phone.toString(),
          user.countryId.code.toString(),
          `dk_subscription_author`,
          lang,
          [
            this.showName(user),
            plan?.title ?? '',
            plan?.subTitle ?? '',
          ],
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (subscription author), fallback text: ${error?.message ?? error}`);
      }
    }

    const message = this.buildNewSubscriberMessageForPlanAuthor(plan, user);

    console.log('Sending to: ', user.countryId.code.toString() + user.phone.toString());
    console.log('message: ', message);
    return await this.sendText(
      user.phone.toString(),
      message,
      user.countryId.code.toString(),
    );
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
        `\n _Access your account_ : ${this.frontUrl}/dashboard` +
        `\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
      );
    else
      return (
        `*New subscription activated!*\n\n` +
        `Hello ${this.showName(author)},\n` +
        `You have a new subscriber to *${plan.title}* (${plan.subTitle}).\n` +
        `Thank you for using digiKUNTZ Payments.\n` +
        `\n _Access your account_ : ${this.frontUrl}/dashboard` +
        `\n\n> This is an automatic message from digiKUNTZ Payments.`
      );
  }

  // NEED VALIDATION PAYMENT (ADMIN)
  async sendNeedValidationMessage(transaction: any, language: any) {
    const admins = await this.getAdminRecipients();
    if (!admins.length) {
      const fallbackLanguage = this.resolveTemplateLang(language || 'fr');
      const message = this.buildNeedValidationMessage(transaction, fallbackLanguage);
      return await this.sendText(
        this.alertPhoneNumber,
        message,
        this.alertCountryCode,
      );
    }

    for (const admin of admins) {
      const to = this.getUserPhone(admin);
      if (!to) continue;
      const lang = this.getUserLanguage(admin);
      const countryCode = this.getUserCountryCode(admin);
      if (this.metaUseTemplates) {
        try {
          await this.sendMetaTemplateMessage(
            to,
            countryCode,
            'dk_admin_payout_pending',
            lang,
            [
              String(transaction.transactionType ?? ''),
              String(transaction.senderName ?? ''),
              String(transaction.receiverName ?? ''),
              String(transaction.estimation ?? ''),
              String(transaction.receiverCurrency || transaction.senderCurrency || ''),
              String(transaction._id || transaction.transactionRef || ''),
            ],
          );
          continue;
        } catch (error) {
          this.logger.warn(`Template send failed (admin payout pending -> ${to}), fallback text: ${error?.message ?? error}`);
        }
      }

      const message = this.buildNeedValidationMessage(transaction, lang);
      await this.sendText(to, message, countryCode);
    }

    return { success: true };
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
          `\nAccédez à votre compte: ${this.frontUrl}/dashboard` +
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
          `\nAccess your account: ${this.frontUrl}/dashboard` +
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
          `\nAccédez à votre compte: ${this.frontUrl}/dashboard` +
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
          `\nAcces your account: ${this.frontUrl}/dashboard` +
          `\n\n> This is an automatic alert from the digiKUNTZ Payments WhatsApp service.`
        );
    }
  }

  async sendWithdrawalMessage(transaction: any) {
    const user = await this.userService.getUserById(transaction.receiverId);
    const language = user.language || 'fr';
    const message = this.buildWithdrawalMessage(transaction, language);
    const countryCode = user.countryId?.code || user.countryId;
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(language);
        await this.sendMetaTemplateMessage(
          user.whatsapp || user.phone,
          countryCode,
          `dk_withdrawal_success`,
          lang,
          [
            String(transaction.estimation),
            transaction.receiverCurrency,
            transaction.transactionRef || transaction._id,
          ],
          String(transaction._id),
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (withdrawal), fallback text: ${error?.message ?? error}`);
      }
    }
    return await this.sendText(
      user.whatsapp || user.phone,
      message,
      countryCode,
    );
  }

  private buildWithdrawalMessage(
    transaction: any,
    language: string = 'fr',
  ): string {
    if (language === 'fr')
      return (
        `*Retrait effectué avec succès !*\n\n` +
        `Un retrait a été effectué avec succès depuis votre compte. \n\n` +
        `Montant : *${transaction.estimation} ${transaction.receiverCurrency}*\n` +
        `Référence : ${transaction.transactionRef}\n\n` +
        `Vous troverez votre reçu téléchargeable: ` + `${this.frontUrl}/invoice/${transaction._id}` +
        `\n\n> Ceci est message automatique du service WhatsApp de digiKUNTZ Payments.`
      );
    else
      return (
        `*Withdrawal successful!*\n\n` +
        `A withdrawal has been successfully made from your account.\n\n` +
        `Amount: *${transaction.estimation} ${transaction.receiverCurrency}*\n` +
        `Reference: ${transaction.transactionRef}\n\n` +
        `You can find your downloadable receipt: ` + `${this.frontUrl}/invoice/${transaction._id}` +
        `\n\n> This is an automated message from digiKUNTZ Payments' WhatsApp service.`
      );
  }

  // SERVICE MESSAGE
  async sendServiceMessage(transaction: any) {
    const user = await this.userService.getUserById(transaction.senderId);
    const language = user.language || 'fr';
    const message = this.buildServiceMessage(transaction, language);
    const countryCode = user.countryId?.code || user.countryId;
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(language);
        await this.sendMetaTemplateMessage(
          user.whatsapp || user.phone,
          countryCode,
          `dk_service_payment_sender`,
          lang,
          [
            String(transaction.estimation),
            transaction.receiverCurrency,
            transaction.transactionRef || transaction._id,
          ],
          String(transaction._id),
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (service sender), fallback text: ${error?.message ?? error}`);
      }
    }
    return await this.sendText(
      user.whatsapp || user.phone,
      message,
      countryCode,
    );
  }

  async sendServiceMessageForReceiver(transaction: any) {
    const user = await this.userService.getUserById(transaction.receiverId);
    const language = user.language || 'fr';
    const message = this.buildServiceReceivedMessage(transaction, language);
    const countryCode = user.countryId?.code || user.countryId;
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(language);
        await this.sendMetaTemplateMessage(
          user.whatsapp || user.phone,
          countryCode,
          `dk_service_payment_receiver`,
          lang,
          [
            String(transaction.estimation),
            transaction.receiverCurrency,
            transaction.senderName,
            transaction.transactionRef || transaction._id,
          ],
          String(transaction._id),
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (service receiver), fallback text: ${error?.message ?? error}`);
      }
    }
    return await this.sendText(
      user.whatsapp || user.phone,
      message,
      countryCode,
    );
  }

  private buildServiceMessage(transaction: any, language: string = 'fr'): string {
    if (language === 'fr')
      return (
        `*Paiement effectué avec succès !*\n\n` +
        `Vous avez effectué un paiement de service avec succès. \n\n` +
        `Montant : *${transaction.estimation} ${transaction.receiverCurrency}*\n` +
        `Référence : ${transaction.transactionRef}\n\n` +
        `Vous troverez votre reçu téléchargeable: ` +
        `${this.frontUrl}/invoice/${transaction._id}` +
        `\n\n> Ceci est message automatique du service WhatsApp de digiKUNTZ Payments.`
      );
    else
      return (
        `*Payment successful!*\n\n` +
        `You have successfully made a service payment. \n\n` +
        `Amount: *${transaction.estimation} ${transaction.receiverCurrency}*\n` +
        `Reference: ${transaction.transactionRef}\n\n` +
        `You can find your downloadable receipt: ` + `${this.frontUrl}/invoice/${transaction._id}` +
        `\n\n> This is an automated message from digiKUNTZ Payments' WhatsApp service.`
      );
  }

  private buildServiceReceivedMessage(
    transaction: any,
    language: string = 'fr',
  ): string {
    if (language === 'fr')
      return (
        `*Paiement de service reçu !*\n\n` +
        `Vous avez reçu un paiement de service de *${transaction.estimation} ${transaction.receiverCurrency}*.\n` +
        `Client : ${transaction.senderName}\n` +
        `Référence : ${transaction.transactionRef}\n\n` +
        `Consultez votre reçu : ${this.frontUrl}/invoice/${transaction._id}` +
        `\n\n> Ceci est un message automatique du service WhatsApp de digiKUNTZ Payments.`
      );
    return (
      `*Service payment received!*\n\n` +
      `You received a service payment of *${transaction.estimation} ${transaction.receiverCurrency}*.\n` +
      `Customer: ${transaction.senderName}\n` +
      `Reference: ${transaction.transactionRef}\n\n` +
      `View your invoice: ${this.frontUrl}/invoice/${transaction._id}` +
      `\n\n> This is an automatic message from digiKUNTZ Payments WhatsApp service.`
    );
  }

  async sendPasswordUpdatedMessage(user: any) {
    if (!user) return;
    const countryCode = user.countryId?.code || user.countryId;
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(user.language);
        await this.sendMetaTemplateMessage(
          user.whatsapp || user.phone,
          countryCode,
          `dk_password_updated`,
          lang,
          [this.showName(user)],
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (password updated), fallback text: ${error?.message ?? error}`);
      }
    }
    const message =
      user.language === 'fr'
        ? `*Mot de passe modifié*\n\nHello ${this.showName(user)},\nVotre mot de passe a été mis à jour avec succès.\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
        : `*Password updated*\n\nHello ${this.showName(user)},\nYour password has been successfully updated.\n\n> This is an automatic message from digiKUNTZ Payments.`;
    return await this.sendText(user.whatsapp || user.phone, message, countryCode);
  }

  async sendPayoutFailedAdminMessage(transaction: any, language: string = 'fr') {
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(language);
        await this.sendMetaTemplateMessage(
          this.alertPhoneNumber,
          this.alertCountryCode,
          `dk_admin_payout_failed`,
          lang,
          [
            String(transaction.transactionType ?? ''),
            String(transaction.transactionRef || transaction._id || ''),
            String(transaction.estimation ?? ''),
            String(transaction.senderCurrency || transaction.receiverCurrency || ''),
          ],
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (admin payout failed), fallback text: ${error?.message ?? error}`);
      }
    }
    const message =
      language === 'fr'
        ? `*Échec payout*\n\nUn payout a échoué.\nType: ${transaction.transactionType}\nRéférence: ${transaction.transactionRef || transaction._id}\nMontant: ${transaction.estimation} ${transaction.senderCurrency || transaction.receiverCurrency}\n\n> Alerte automatique digiKUNTZ Payments.`
        : `*Payout failed*\n\nA payout has failed.\nType: ${transaction.transactionType}\nReference: ${transaction.transactionRef || transaction._id}\nAmount: ${transaction.estimation} ${transaction.senderCurrency || transaction.receiverCurrency}\n\n> Automatic alert from digiKUNTZ Payments.`;
    return await this.sendText(this.alertPhoneNumber, message, this.alertCountryCode);
  }

  async sendTransactionRejectedMessage(transaction: any, user: any) {
    if (!user) return;
    const countryCode = user.countryId?.code || user.countryId;
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(user.language);
        await this.sendMetaTemplateMessage(
          user.whatsapp || user.phone,
          countryCode,
          `dk_transaction_rejected`,
          lang,
          [
            this.showName(user),
            String(transaction.transactionRef || transaction._id || ''),
          ],
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (transaction rejected), fallback text: ${error?.message ?? error}`);
      }
    }
    const message =
      user.language === 'fr'
        ? `*Transaction rejetée*\n\nHello ${this.showName(user)},\nVotre transaction a été rejetée par l'administrateur.\nRéférence: ${transaction.transactionRef || transaction._id}\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
        : `*Transaction rejected*\n\nHello ${this.showName(user)},\nYour transaction was rejected by the administrator.\nReference: ${transaction.transactionRef || transaction._id}\n\n> This is an automatic message from digiKUNTZ Payments.`;
    return await this.sendText(user.whatsapp || user.phone, message, countryCode);
  }

  async sendFundraisingDonationMessageToDonor(
    transaction: any,
    fundraising: any,
    donor: any,
  ) {
    if (!donor) return;
    const countryCode = donor.countryId?.code || donor.countryId;
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(donor.language);
        await this.sendMetaTemplateMessage(
          donor.whatsapp || donor.phone,
          countryCode,
          `dk_fundraising_donor`,
          lang,
          [
            this.showName(donor),
            String(transaction.estimation ?? ''),
            String(fundraising.currency ?? ''),
            String(fundraising.title ?? ''),
            String(transaction.transactionRef || transaction._id || ''),
          ],
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (fundraising donor), fallback text: ${error?.message ?? error}`);
      }
    }
    const message =
      donor.language === 'fr'
        ? `*Don effectué avec succès !*\n\nHello ${this.showName(donor)},\nVotre don de *${transaction.estimation} ${fundraising.currency}* pour la collecte *${fundraising.title}* a été confirmé.\nRéférence: ${transaction.transactionRef || transaction._id}\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
        : `*Donation successful!*\n\nHello ${this.showName(donor)},\nYour donation of *${transaction.estimation} ${fundraising.currency}* to *${fundraising.title}* has been confirmed.\nReference: ${transaction.transactionRef || transaction._id}\n\n> This is an automatic message from digiKUNTZ Payments.`;

    return await this.sendText(
      donor.whatsapp || donor.phone,
      message,
      countryCode,
    );
  }

  async sendFundraisingDonationMessageToOwner(
    transaction: any,
    fundraising: any,
    owner: any,
    donor?: any,
  ) {
    if (!owner) return;
    const countryCode = owner.countryId?.code || owner.countryId;
    const donorName = donor
      ? this.showName(donor)
      : transaction.donorVisibility
        ? transaction.senderName || 'Anonymous'
        : 'Anonymous';
    const showDonor = transaction.donorVisibility !== false;
    const donorLabel = showDonor ? donorName : owner.language === 'fr' ? 'Anonyme' : 'Anonymous';
    if (this.metaUseTemplates) {
      try {
        const lang = this.resolveTemplateLang(owner.language);
        await this.sendMetaTemplateMessage(
          owner.whatsapp || owner.phone,
          countryCode,
          `dk_fundraising_owner`,
          lang,
          [
            this.showName(owner),
            String(transaction.estimation ?? ''),
            String(fundraising.currency ?? ''),
            String(fundraising.title ?? ''),
            String(donorLabel),
            String(transaction.transactionRef || transaction._id || ''),
          ],
        );
        return { success: true };
      } catch (error) {
        this.logger.warn(`Template send failed (fundraising owner), fallback text: ${error?.message ?? error}`);
      }
    }
    const message =
      owner.language === 'fr'
        ? `*Nouveau don reçu !*\n\nHello ${this.showName(owner)},\nVous avez reçu un don de *${transaction.estimation} ${fundraising.currency}* pour la collecte *${fundraising.title}*.\nDonateur: ${donorLabel}\nRéférence: ${transaction.transactionRef || transaction._id}\n\n> Ceci est un message automatique de digiKUNTZ Payments.`
        : `*New donation received!*\n\nHello ${this.showName(owner)},\nYou received a donation of *${transaction.estimation} ${fundraising.currency}* for *${fundraising.title}*.\nDonor: ${donorLabel}\nReference: ${transaction.transactionRef || transaction._id}\n\n> This is an automatic message from digiKUNTZ Payments.`;

    return await this.sendText(
      owner.whatsapp || owner.phone,
      message,
      countryCode,
    );
  }
}
