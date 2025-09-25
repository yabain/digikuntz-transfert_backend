/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Subscription } from './subscription.schema';
import { User } from '../../user/user.schema';
import { Plans } from '../plans.schema';
import * as mongoose from 'mongoose';
import { EmailService } from '../../email/email.service';
import { SubscriptionService } from './subscription.service';

@Injectable()
export class SubscriptionCronService {
  private readonly logger = new Logger(SubscriptionCronService.name);

  constructor(
    @InjectModel(Subscription.name)
    private subscriptionModel: mongoose.Model<Subscription>,
    @InjectModel(User.name)
    private userModel: mongoose.Model<User>,
    @InjectModel(Plans.name)
    private plansModel: mongoose.Model<Plans>,
    private emailService: EmailService,
    private subscriptionService: SubscriptionService,
  ) {}

  /**
   * Vérifie et gère les abonnements expirés
   * Exécuté tous les jours à 00:00
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredSubscriptions() {
    this.logger.log('🔄 Début de la vérification des abonnements expirés...');

    try {
      const expiredSubscriptions = await this.getExpiredSubscriptions();

      if (expiredSubscriptions.length === 0) {
        this.logger.log('✅ Aucun abonnement expiré trouvé');
        return;
      }

      this.logger.log(
        `📊 ${expiredSubscriptions.length} abonnement(s) expiré(s) trouvé(s)`,
      );

      for (const subscription of expiredSubscriptions) {
        await this.processExpiredSubscription(subscription);
      }

      this.logger.log('✅ Traitement des abonnements expirés terminé');
    } catch (error) {
      this.logger.error(
        '❌ Erreur lors du traitement des abonnements expirés:',
        error,
      );
    }
  }

  /**
   * Envoie des notifications d'expiration proche
   * Exécuté tous les jours à 09:00
   */
  //   @Cron('0 9 * * *') // Tous les jours à 09:00
  //   async sendExpirationNotifications() {
  //     this.logger.log('📧 Envoi des notifications d\'expiration proche...');

  //     try {
  //       const subscriptionsExpiringSoon = await this.getSubscriptionsExpiringSoon();

  //       if (subscriptionsExpiringSoon.length === 0) {
  //         this.logger.log('✅ Aucune notification d\'expiration à envoyer');
  //         return;
  //       }

  //       this.logger.log(`📊 ${subscriptionsExpiringSoon.length} notification(s) d'expiration à envoyer`);

  //       for (const subscription of subscriptionsExpiringSoon) {
  //         await this.sendExpirationNotification(subscription);
  //       }

  //       this.logger.log('✅ Notifications d\'expiration envoyées');
  //     } catch (error) {
  //       this.logger.error('❌ Erreur lors de l\'envoi des notifications:', error);
  //     }
  //   }

  /**
   * Nettoyage des abonnements expirés depuis plus de 30 jours
   * Exécuté tous les dimanches à 02:00
   */
  //   @Cron('0 2 * * 0') // Tous les dimanches à 02:00
  //   async cleanupOldExpiredSubscriptions() {
  //     this.logger.log('�� Nettoyage des anciens abonnements expirés...');

  //     try {
  //       const thirtyDaysAgo = new Date();
  //       thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  //       const result = await this.subscriptionModel.updateMany(
  //         {
  //           endDate: { $lt: thirtyDaysAgo },
  //           status: false,
  //         },
  //         {
  //           $set: {
  //             status: false,
  //             updatedAt: new Date()
  //           }
  //         }
  //       );

  //       this.logger.log(`🧹 ${result.modifiedCount} ancien(s) abonnement(s) nettoyé(s)`);
  //     } catch (error) {
  //       this.logger.error('❌ Erreur lors du nettoyage:', error);
  //     }
  //   }

  /**
   * Rapport hebdomadaire des abonnements
   * Exécuté tous les lundis à 08:00
   */
  //   @Cron('0 8 * * 1') // Tous les lundis à 08:00
  //   async generateWeeklyReport() {
  //     this.logger.log('📊 Génération du rapport hebdomadaire...');

  //     try {
  //       const report = await this.generateSubscriptionReport();
  //       await this.sendWeeklyReport(report);

  //       this.logger.log('✅ Rapport hebdomadaire généré et envoyé');
  //     } catch (error) {
  //       this.logger.error('❌ Erreur lors de la génération du rapport:', error);
  //     }
  //   }

  /**
   * Récupère les abonnements expirés
   */
  private async getExpiredSubscriptions(): Promise<Subscription[]> {
    return await this.subscriptionModel
      .find({
        endDate: { $lt: new Date() },
        status: true,
      })
      .populate('userId', 'name email')
      .populate('planId', 'title');
  }

  /**
   * Récupère les abonnements expirant dans les 7 prochains jours
   */
  //   private async getSubscriptionsExpiringSoon(): Promise<Subscription[]> {
  //     const sevenDaysFromNow = new Date();
  //     sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  //     return await this.subscriptionModel.find({
  //       endDate: {
  //         $gte: new Date(),
  //         $lte: sevenDaysFromNow
  //       },
  //       status: true,
  //     }).populate('userId', 'name email').populate('planId', 'title');
  //   }

  /**
   * Traite un abonnement expiré
   */
  private async processExpiredSubscription(
    subscription: Subscription,
  ): Promise<void> {
    try {
      // Désactiver l'abonnement
      await this.subscriptionModel.findByIdAndUpdate(subscription._id, {
        status: false,
      });

      // Envoyer notification d'expiration
      //   await this.sendExpirationEmail(subscription);

      this.logger.log(
        `✅ Abonnement ${subscription._id} désactivé et notification envoyée`,
      );
    } catch (error) {
      this.logger.error(
        `❌ Erreur lors du traitement de l'abonnement ${subscription._id}:`,
        error,
      );
    }
  }

  /**
   * Envoie une notification d'expiration proche
   */
  //   private async sendExpirationNotification(subscription: Subscription): Promise<void> {
  //     try {
  //       const user = subscription.userId as any;
  //       const plan = subscription.planId as any;

  //       const daysUntilExpiration = Math.ceil(
  //         (subscription.endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  //       );

  //       const emailData = {
  //         to: user.email,
  //         subject: `⚠️ Votre abonnement "${plan.title}" expire dans ${daysUntilExpiration} jour(s)`,
  //         template: 'subscription-expiration-warning',
  //         context: {
  //           userName: user.name,
  //           planTitle: plan.title,
  //           endDate: subscription.endDate.toLocaleDateString('fr-FR'),
  //           daysUntilExpiration,
  //           renewalLink: `${process.env.FRONTEND_URL}/subscription/renew/${subscription._id}`,
  //         },
  //       };

  //       await this.emailService.sendEmail(emailData);
  //       this.logger.log(`📧 Notification d'expiration envoyée à ${user.email}`);
  //     } catch (error) {
  //       this.logger.error(`❌ Erreur lors de l'envoi de la notification:`, error);
  //     }
  //   }

  /**
   * Envoie un email d'expiration
   */
  //   private async sendExpirationEmail(subscription: Subscription): Promise<void> {
  //     try {
  //       const user = subscription.userId as any;
  //       const plan = subscription.planId as any;

  //       const emailData = {
  //         to: user.email,
  //         subject: `❌ Votre abonnement "${plan.title}" a expiré`,
  //         template: 'subscription-expired',
  //         context: {
  //           userName: user.name,
  //           planTitle: plan.title,
  //           endDate: subscription.endDate.toLocaleDateString('fr-FR'),
  //           renewalLink: `${process.env.FRONTEND_URL}/subscription/renew/${subscription._id}`,
  //           supportEmail: process.env.SUPPORT_EMAIL || 'support@digikuntz.com',
  //         },
  //       };

  //       await this.emailService.sendEmail(emailData);
  //       this.logger.log(`📧 Email d'expiration envoyé à ${user.email}`);
  //     } catch (error) {
  //       this.logger.error(`❌ Erreur lors de l'envoi de l'email d'expiration:`, error);
  //     }
  //   }

  /**
   * Génère un rapport hebdomadaire des abonnements
   */
  //   private async generateSubscriptionReport(): Promise<any> {
  //     const now = new Date();
  //     const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  //     const [
  //       totalSubscriptions,
  //       activeSubscriptions,
  //       expiredThisWeek,
  //       newThisWeek,
  //       expiringNextWeek,
  //     ] = await Promise.all([
  //       this.subscriptionModel.countDocuments(),
  //       this.subscriptionModel.countDocuments({ status: true }),
  //       this.subscriptionModel.countDocuments({
  //         endDate: { $gte: oneWeekAgo, $lt: now },
  //         status: false,
  //       }),
  //       this.subscriptionModel.countDocuments({
  //         createdAt: { $gte: oneWeekAgo },
  //       }),
  //       this.subscriptionModel.countDocuments({
  //         endDate: { $gte: now, $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
  //         status: true,
  //       }),
  //     ]);

  //     return {
  //       period: `${oneWeekAgo.toLocaleDateString('fr-FR')} - ${now.toLocaleDateString('fr-FR')}`,
  //       totalSubscriptions,
  //       activeSubscriptions,
  //       expiredThisWeek,
  //       newThisWeek,
  //       expiringNextWeek,
  //       activeRate: totalSubscriptions > 0 ? ((activeSubscriptions / totalSubscriptions) * 100).toFixed(2) : 0,
  //     };
  //   }

  /**
   * Envoie le rapport hebdomadaire
   */
  //   private async sendWeeklyReport(report: any): Promise<void> {
  //     try {
  //       const adminEmails = process.env.ADMIN_EMAILS?.split(',') || ['admin@digikuntz.com'];

  //       for (const adminEmail of adminEmails) {
  //         const emailData = {
  //           to: adminEmail,
  //           subject: `📊 Rapport hebdomadaire des abonnements - ${report.period}`,
  //           template: 'subscription-weekly-report',
  //           context: {
  //             ...report,
  //             reportDate: new Date().toLocaleDateString('fr-FR'),
  //           },
  //         };

  //         await this.emailService.sendEmail(emailData);
  //       }

  //       this.logger.log(`�� Rapport hebdomadaire envoyé à ${adminEmails.length} administrateur(s)`);
  //     } catch (error) {
  //       this.logger.error('❌ Erreur lors de l\'envoi du rapport:', error);
  //     }
  //   }

  /**
   * Méthode manuelle pour forcer la vérification des expirations
   */
  //   async manualExpirationCheck(): Promise<void> {
  //     this.logger.log('🔧 Vérification manuelle des expirations...');
  //     await this.handleExpiredSubscriptions();
  //   }

  /**
   * Méthode manuelle pour forcer l'envoi des notifications
   */
  //   async manualNotificationSend(): Promise<void> {
  //     this.logger.log('🔧 Envoi manuel des notifications...');
  //     await this.sendExpirationNotifications();
  //   }
}

// Templates email nécessaires :
// Il faut créer les templates suivant dans le service email :
// subscription-expiration-warning : Avertissement 7 jours avant
// subscription-expired : Notification d'expiration
// subscription-weekly-report : Rapport hebdomadaire
