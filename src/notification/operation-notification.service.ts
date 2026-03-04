import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { EmailService } from 'src/email/email.service';
import { UserService } from 'src/user/user.service';
import { WhatsappService } from 'src/wa/whatsapp.service';

@Injectable()
export class OperationNotificationService {
  constructor(
    private readonly userService: UserService,
    private readonly emailService: EmailService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
  ) {}

  private async safe(task: Promise<any>, label: string): Promise<void> {
    try {
      await task;
    } catch (error) {
      console.error(`${label} failed:`, error);
    }
  }

  async notifyTransferSuccess(transaction: any): Promise<void> {
    const [sender, receiver] = await Promise.all([
      this.userService.getUserById(transaction.senderId),
      this.userService.getUserById(transaction.receiverId),
    ]);

    if (receiver) {
      await this.safe(
        this.whatsappService.sendMessageForTransferReceiver(
          transaction,
          receiver.language || 'fr',
        ),
        'WA transfer receiver',
      );
      await this.safe(
        this.emailService.sendTransferConfirmationEmail(receiver, transaction),
        'Email transfer receiver',
      );
    }

    if (sender) {
      await this.safe(
        this.whatsappService.sendMessageForTransferSender(
          transaction,
          sender.language || 'fr',
        ),
        'WA transfer sender',
      );
      await this.safe(
        this.emailService.sendTransferConfirmationEmail(sender, transaction),
        'Email transfer sender',
      );
    }
  }

  async notifyWithdrawalSuccess(transaction: any): Promise<void> {
    const user = await this.userService.getUserById(transaction.receiverId);
    if (!user) return;

    await this.safe(
      this.whatsappService.sendWithdrawalMessage(transaction),
      'WA withdrawal author',
    );
    await this.safe(
      this.emailService.sendWithdrawalConfirmationEmail(user, transaction),
      'Email withdrawal author',
    );
  }

  async notifyServicePaymentSuccess(transaction: any): Promise<void> {
    const [sender, receiver] = await Promise.all([
      this.userService.getUserById(transaction.senderId),
      this.userService.getUserById(transaction.receiverId),
    ]);

    await this.safe(
      this.whatsappService.sendServiceMessage(transaction),
      'WA service sender',
    );
    await this.safe(
      this.whatsappService.sendServiceMessageForReceiver(transaction),
      'WA service receiver',
    );

    if (sender) {
      await this.safe(
        this.emailService.sendOperationConfirmationEmail(sender, transaction, {
          subjectFr: 'Confirmation de paiement de service',
          subjectEn: 'Service payment confirmation',
        }),
        'Email service sender',
      );
    }

    if (receiver) {
      await this.safe(
        this.emailService.sendOperationConfirmationEmail(receiver, transaction, {
          subjectFr: 'Paiement de service reçu',
          subjectEn: 'Service payment received',
        }),
        'Email service receiver',
      );
    }
  }

  async notifySubscriptionSuccess(
    plan: any,
    transaction: any,
    subscriberId: string,
    beneficiaryId: string,
  ): Promise<void> {
    const [subscriber, beneficiary] = await Promise.all([
      this.userService.getUserById(subscriberId),
      this.userService.getUserById(beneficiaryId),
    ]);

    if (subscriber) {
      await this.safe(
        this.whatsappService.sendNewSubscriberMessage(
          plan?._id?.toString?.() ?? plan?.toString?.(),
          subscriber._id.toString(),
          transaction._id.toString(),
        ),
        'WA subscription subscriber',
      );
      await this.safe(
        this.emailService.sendOperationConfirmationEmail(subscriber, transaction, {
          subjectFr: 'Confirmation de paiement d’abonnement',
          subjectEn: 'Subscription payment confirmation',
        }),
        'Email subscription subscriber',
      );
    }

    if (beneficiary && plan) {
      await this.safe(
        this.whatsappService.sendNewSubscriberMessageForPlanAuthor(plan, beneficiary),
        'WA subscription beneficiary',
      );
      await this.safe(
        this.emailService.sendOperationConfirmationEmail(
          beneficiary,
          transaction,
          {
            subjectFr: 'Paiement d’abonnement reçu',
            subjectEn: 'Subscription payment received',
          },
        ),
        'Email subscription beneficiary',
      );
    }
  }

  async notifyAdminPayoutPending(transaction: any): Promise<void> {
    await this.safe(
      this.whatsappService.sendNeedValidationMessage(transaction, 'fr'),
      'WA admin pending payout',
    );
    await this.safe(
      this.emailService.sendAlertEmail(
        '⚠️ Payout en attente de validation',
        `Transaction ${transaction.transactionRef || transaction._id} en attente de validation admin.`,
        'admin/payout/pending',
      ) as any,
      'Email admin pending payout',
    );
  }

  async notifyAdminPayoutFailed(transaction: any): Promise<void> {
    await this.safe(
      this.whatsappService.sendPayoutFailedAdminMessage(transaction, 'fr'),
      'WA admin payout failed',
    );
    await this.safe(
      this.emailService.sendAlertEmail(
        '🚨 Echec payout',
        `Echec payout pour transaction ${transaction.transactionRef || transaction._id}.`,
        'admin/payout/failed',
      ) as any,
      'Email admin payout failed',
    );
  }

  async notifyRejectedTransaction(transaction: any): Promise<void> {
    const userId = transaction?.senderId || transaction?.userId;
    if (!userId) return;
    const user = await this.userService.getUserById(userId);
    if (!user) return;

    await this.safe(
      this.whatsappService.sendTransactionRejectedMessage(transaction, user),
      'WA rejected transaction user',
    );
    await this.safe(
      this.emailService.sendOperationConfirmationEmail(user, transaction, {
        subjectFr: 'Transaction rejetée',
        subjectEn: 'Transaction rejected',
      }),
      'Email rejected transaction user',
    );
  }

  async notifyFundraisingDonation(
    transaction: any,
    fundraising: any,
    donation: any,
  ): Promise<void> {
    const [donor, owner] = await Promise.all([
      this.userService.getUserById(transaction.senderId || transaction.userId),
      this.userService.getUserById(transaction.receiverId),
    ]);

    if (donor) {
      await this.safe(
        this.whatsappService.sendFundraisingDonationMessageToDonor(
          transaction,
          fundraising,
          donor,
        ),
        'WA fundraising donor',
      );
      await this.safe(
        this.emailService.sendOperationConfirmationEmail(donor, transaction, {
          subjectFr: 'Confirmation de don',
          subjectEn: 'Donation confirmation',
        }),
        'Email fundraising donor',
      );
    }

    if (owner) {
      await this.safe(
        this.whatsappService.sendFundraisingDonationMessageToOwner(
          transaction,
          fundraising,
          owner,
          donor,
        ),
        'WA fundraising owner',
      );
      await this.safe(
        this.emailService.sendOperationConfirmationEmail(owner, transaction, {
          subjectFr: 'Nouveau don reçu',
          subjectEn: 'New donation received',
        }),
        'Email fundraising owner',
      );
    }
  }
}
