import { BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as path from 'path';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  AnnouncementDelivery,
  AnnouncementDeliveryDocument,
  AnnouncementDeliveryStatus,
} from './announcement-delivery.schema';
import {
  Announcement,
  AnnouncementChannel,
  AnnouncementDocument,
  AnnouncementRecipientGroup,
  AnnouncementStatus,
} from './announcement.schema';
import {
  AnnouncementSettings,
  AnnouncementSettingsDocument,
} from './announcement-settings.schema';
import { User } from 'src/user/user.schema';
import { ProspectsService } from 'src/prospects/prospects.service';
import { EmailService } from 'src/email/email.service';
import { DistributedLockService } from 'src/distributed-lock/distributed-lock.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  // Anti-spam progressive delivery parameters (email only)
  private readonly WAVE_SIZE = 10;
  private readonly WAVE_DELAY_MIN_SEC = 30;
  private readonly WAVE_DELAY_MAX_SEC = 90;
  private readonly PAUSE_MIN_MINUTES = 5;
  private readonly PAUSE_MAX_MINUTES = 15;
  private readonly MAX_WAVE_FAILURES = 5;
  private readonly DAILY_EMAIL_LIMIT = 1500;
  private readonly EMAIL_START_HOUR = 6;
  private readonly EMAIL_END_HOUR = 22;

  constructor(
    @InjectModel(Announcement.name)
    private readonly announcementModel: Model<AnnouncementDocument>,
    @InjectModel(AnnouncementDelivery.name)
    private readonly deliveryModel: Model<AnnouncementDeliveryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectModel(AnnouncementSettings.name)
    private readonly settingsModel: Model<AnnouncementSettingsDocument>,
    private readonly prospectsService: ProspectsService,
    private readonly emailService: EmailService,
    private readonly lockService: DistributedLockService,
  ) {}

  async list(page?: number, limit?: number, status?: AnnouncementStatus, search?: string) {
    const safePage = Number(page) > 0 ? Number(page) : 1;
    const safeLimit = Number(limit) > 0 ? Math.min(Number(limit), 100) : 25;
    const skip = (safePage - 1) * safeLimit;

    const filter: FilterQuery<AnnouncementDocument> = {};
    if (status) filter.status = status;
    if (search && search.trim()) {
      const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ subject: regex }, { recipientEmails: regex }];
    }

    const [data, total] = await Promise.all([
      this.announcementModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      this.announcementModel.countDocuments(filter),
    ]);

    const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 0;
    return {
      data,
      pagination: {
        currentPage: safePage,
        totalPages,
        totalItems: total,
        hasNextPage: totalPages > 0 && safePage < totalPages,
        hasPrevPage: safePage > 1,
        limit: safeLimit,
      },
    };
  }

  async findOne(id: string) {
    const announcement = await this.announcementModel.findById(id);
    if (!announcement) throw new NotFoundException('Announcement not found');

    const [deliveries, snapshot] = await Promise.all([
      this.deliveryModel
        .find({ announcementId: announcement._id })
        .sort({ createdAt: 1, _id: 1 })
        .lean(),
      Promise.resolve(announcement.recipientsSnapshot || []),
    ]);

    const isQueued =
      announcement.status === AnnouncementStatus.SCHEDULED ||
      announcement.status === AnnouncementStatus.DRAFT;

    const formatRecipient = (r: any) => ({
      email: r.email || r.userEmail || '',
      userName: r.userName || '',
      userFirstName: r.userFirstName || '',
      userLastName: r.userLastName || '',
      phone: r.phone || '',
      userPhone: r.userPhone || r.phone || '',
      userId: r.userId || '',
      status: String(r.status || (isQueued ? 'planned' : 'pending')),
      attempts: Number(r.attempts || 0),
      lastError: r.lastError || '',
      sentAt: r.sentAt || null,
    });

    const byEmail = new Map<string, any>();
    for (const d of deliveries) byEmail.set(String(d.email || d.recipientKey || '').toLowerCase(), d);
    for (const s of snapshot) {
      const key = String(s.email || '').toLowerCase();
      if (!key || byEmail.has(key)) continue;
      byEmail.set(key, s);
    }

    const recipients = [...byEmail.values()].map(formatRecipient);
    if (recipients.length === 0 && isQueued) {
      for (const email of announcement.recipientEmails || []) {
        if (String(email || '').trim()) {
          recipients.push({
            email: String(email).toLowerCase(),
            userName: '',
            userFirstName: '',
            userLastName: '',
            phone: '',
            userPhone: '',
            userId: '',
            status: 'planned',
            attempts: 0,
            lastError: '',
            sentAt: null,
          });
        }
      }
    }

    const result: any = announcement.toObject();
    result.recipients = recipients;
    return result;
  }

  async getSettings(): Promise<any> {
    const settings = await this.settingsModel.findOne().sort({ createdAt: -1 });
    return {
      headerHtml: settings?.headerHtml || '',
      footerHtml: settings?.footerHtml || '',
    };
  }

  async updateSettings(dto: { headerHtml?: string; footerHtml?: string }) {
    let settings = await this.settingsModel.findOne().sort({ createdAt: -1 });
    if (!settings) {
      settings = new this.settingsModel({});
    }
    if (dto.headerHtml !== undefined) settings.headerHtml = dto.headerHtml;
    if (dto.footerHtml !== undefined) settings.footerHtml = dto.footerHtml;
    await settings.save();
    return {
      headerHtml: settings.headerHtml,
      footerHtml: settings.footerHtml,
    };
  }

  private async resolveSettings(): Promise<{ headerHtml: string; footerHtml: string }> {
    const settings = await this.settingsModel.findOne().sort({ createdAt: -1 });
    return {
      headerHtml: settings?.headerHtml || '',
      footerHtml: settings?.footerHtml || '',
    };
  }

  private composeHtml(
    html: string,
    useHeader: boolean,
    useFooter: boolean,
    headerHtml: string,
    footerHtml: string,
  ): string {
    const parts: string[] = [];
    if (useHeader && headerHtml) parts.push(headerHtml);
    parts.push(html);
    if (useFooter && footerHtml) parts.push(footerHtml);
    return parts.join('\n');
  }

  async create(actor: any, dto: CreateAnnouncementDto, sendNow = false) {
    const recipientEmails = this.parseEmails(dto.recipientEmails);
    const recipientGroup = dto.recipientGroup ?? null;
    if (!this.hasRecipientTarget(recipientGroup, recipientEmails)) {
      throw new BadRequestException(
        'At least one recipient group or recipient email is required',
      );
    }

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const status = scheduledAt
      ? AnnouncementStatus.SCHEDULED
      : AnnouncementStatus.DRAFT;

    const useHeader = Boolean(dto.useHeader);
    const useFooter = Boolean(dto.useFooter);
    const settings = useHeader || useFooter ? await this.resolveSettings() : { headerHtml: '', footerHtml: '' };

    const announcement = await this.announcementModel.create({
      channel: AnnouncementChannel.EMAIL,
      subject: dto.subject,
      html: dto.html,
      useHeader,
      useFooter,
      headerHtml: useHeader ? settings.headerHtml : '',
      footerHtml: useFooter ? settings.footerHtml : '',
      attachmentUrl: dto.attachmentUrl || null,
      attachmentPath: dto.attachmentPath || null,
      attachmentName: dto.attachmentName || null,
      attachmentMimeType: dto.attachmentMimeType || null,
      attachmentSize: Number(dto.attachmentSize || 0),
      recipientGroup,
      recipientEmails,
      recipientLabel: this.buildRecipientLabel(recipientGroup, recipientEmails),
      status,
      scheduledAt,
      createdBy: actor?.sub || null,
    });

    if (sendNow) return this.sendAnnouncement(String(announcement._id));
    return announcement;
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const announcement = await this.announcementModel.findById(id);
    if (!announcement) throw new NotFoundException('Announcement not found');
    if ([AnnouncementStatus.SENT, AnnouncementStatus.FAILED].includes(announcement.status)) {
      throw new BadRequestException('Only draft or scheduled announcements can be edited');
    }

    if (dto.subject !== undefined) announcement.subject = dto.subject;
    if (dto.html !== undefined) announcement.html = dto.html;
    if (dto.useHeader !== undefined) announcement.useHeader = Boolean(dto.useHeader);
    if (dto.useFooter !== undefined) announcement.useFooter = Boolean(dto.useFooter);
    if (dto.useHeader !== undefined || announcement.useHeader) {
      const settings = await this.resolveSettings();
      announcement.headerHtml = announcement.useHeader ? settings.headerHtml : '';
    }
    if (dto.useFooter !== undefined || announcement.useFooter) {
      const settings = await this.resolveSettings();
      announcement.footerHtml = announcement.useFooter ? settings.footerHtml : '';
    }
    if (dto.attachmentUrl !== undefined) announcement.attachmentUrl = dto.attachmentUrl;
    if (dto.attachmentPath !== undefined) announcement.attachmentPath = dto.attachmentPath;
    if (dto.attachmentName !== undefined) announcement.attachmentName = dto.attachmentName;
    if (dto.attachmentMimeType !== undefined) announcement.attachmentMimeType = dto.attachmentMimeType;
    if (dto.attachmentSize !== undefined) announcement.attachmentSize = dto.attachmentSize;
    if (dto.recipientGroup !== undefined) announcement.recipientGroup = dto.recipientGroup;
    if (dto.recipientEmails !== undefined) announcement.recipientEmails = this.parseEmails(dto.recipientEmails);
    if (dto.scheduledAt !== undefined) announcement.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    if (!this.hasRecipientTarget(announcement.recipientGroup, announcement.recipientEmails)) {
      throw new BadRequestException('At least one recipient group or recipient email is required');
    }

    announcement.recipientLabel = this.buildRecipientLabel(
      announcement.recipientGroup,
      announcement.recipientEmails,
    );
    announcement.status = announcement.scheduledAt
      ? AnnouncementStatus.SCHEDULED
      : AnnouncementStatus.DRAFT;
    return announcement.save();
  }

  async sendAnnouncement(id: string) {
    const announcement = await this.announcementModel.findById(id);
    if (!announcement) throw new NotFoundException('Announcement not found');
    if ([AnnouncementStatus.SENT, AnnouncementStatus.SENDING].includes(announcement.status)) {
      throw new BadRequestException('Announcement already sent or sending');
    }

    const recipients = await this.resolveRecipients(
      announcement.recipientGroup,
      announcement.recipientEmails,
    );
    if (!recipients.length) {
      announcement.status = AnnouncementStatus.FAILED;
      announcement.failureReason = 'No recipient resolved';
      announcement.recipientCount = 0;
      announcement.successCount = 0;
      announcement.failureCount = 0;
      await announcement.save();
      return announcement;
    }

    await this.enqueueDeliveries(announcement, recipients);
    announcement.status = AnnouncementStatus.SENDING;
    announcement.sentAt = null;
    announcement.failureReason = null;
    announcement.recipientCount = recipients.length;
    announcement.successCount = 0;
    announcement.failureCount = 0;
    announcement.currentWaveCount = 0;
    announcement.totalWaveFailures = 0;
    announcement.consecutiveFailures = 0;
    announcement.stoppedByFailure = false;
    announcement.nextProcessAt = new Date();
    announcement.recipientsSnapshot = recipients.slice(0, 100) as any[];
    return announcement.save();
  }

  async retryFailedDeliveries(id: string) {
    const announcement = await this.announcementModel.findById(id);
    if (!announcement) throw new NotFoundException('Announcement not found');
    if (announcement.status === AnnouncementStatus.SENDING) {
      throw new BadRequestException('Announcement delivery is still in progress');
    }

    const announcementId = announcement._id as Types.ObjectId;
    const toRetry = await this.deliveryModel.countDocuments({
      announcementId,
      status: {
        $in: [AnnouncementDeliveryStatus.FAILED, AnnouncementDeliveryStatus.PENDING],
      },
    });
    if (!toRetry) {
      throw new BadRequestException('No failed recipient to retry');
    }

    await this.deliveryModel.updateMany(
      {
        announcementId,
        status: {
          $in: [AnnouncementDeliveryStatus.FAILED, AnnouncementDeliveryStatus.PENDING],
        },
      },
      {
        $set: {
          status: AnnouncementDeliveryStatus.PENDING,
          attempts: 0,
          lastError: null,
          lockedAt: null,
          sentAt: null,
        },
      },
    );

    announcement.status = AnnouncementStatus.SENDING;
    announcement.sentAt = null;
    announcement.failureReason = null;
    announcement.stoppedByFailure = false;
    announcement.totalWaveFailures = 0;
    announcement.consecutiveFailures = 0;
    announcement.currentWaveCount = 0;
    announcement.nextProcessAt = new Date();
    await announcement.save();

    this.logger.log(`Retrying ${toRetry} delivery(ies) for announcement ${announcement._id}`);
    return announcement;
  }

  async delete(id: string) {
    const announcement = await this.announcementModel.findByIdAndDelete(id);
    if (!announcement) throw new NotFoundException('Announcement not found');
    await this.deliveryModel.deleteMany({ announcementId: announcement._id });
    return announcement;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sendScheduledAnnouncements() {
    await this.lockService.withLock('cron:announcement:scheduled', 50_000, async () => {
      const due = await this.announcementModel
        .find({
          status: AnnouncementStatus.SCHEDULED,
          scheduledAt: { $lte: new Date() },
        })
        .limit(10);

      for (const announcement of due) {
        try {
          await this.sendAnnouncement(String(announcement._id));
        } catch (error) {
          this.logger.warn(
            `Unable to send scheduled announcement ${announcement._id}: ${error?.message || error}`,
          );
        }
      }
    });
  }

  @Cron('*/10 * * * * *')
  async processPendingDeliveries() {
    await this.lockService.withLock('cron:announcement:process', 9_000, async () => {
      try {
        await this.releaseStaleProcessingDeliveries();
        await this.processNextWaveDeliveries();
      } catch (error) {
        this.logger.warn(
          `Unable to process announcement deliveries: ${error?.message || error}`,
        );
      }
    });
  }

  private async processNextWaveDeliveries() {
    const now = new Date();
    const announcements = await this.announcementModel
      .find({
        status: AnnouncementStatus.SENDING,
        stoppedByFailure: false,
        nextProcessAt: { $lte: now },
      })
      .sort({ nextProcessAt: 1 })
      .limit(10);

    for (const announcement of announcements) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const sentToday = await this.deliveryModel.countDocuments({
        status: AnnouncementDeliveryStatus.SENT,
        sentAt: { $gte: startOfDay },
      });

      if (sentToday >= this.DAILY_EMAIL_LIMIT) {
        const nextDay = this.nextSendingWindow();
        await this.announcementModel.updateOne(
          { _id: announcement._id },
          { $set: { nextProcessAt: nextDay, currentWaveCount: 0 } },
        );
        this.logger.log(
          `Daily email limit (${sentToday}/${this.DAILY_EMAIL_LIMIT}) reached for ` +
            `announcement ${announcement._id}, resuming ${nextDay.toISOString()}`,
        );
        continue;
      }

      if (!this.isWithinSendingHours(now)) {
        const nextWindow = this.nextSendingWindow();
        await this.announcementModel.updateOne(
          { _id: announcement._id },
          { $set: { nextProcessAt: nextWindow, currentWaveCount: 0 } },
        );
        this.logger.log(
          `Outside email sending hours for announcement ${announcement._id}, ` +
            `resuming at ${nextWindow.toISOString()}`,
        );
        continue;
      }

      const delivery = await this.deliveryModel.findOneAndUpdate(
        {
          announcementId: announcement._id,
          status: AnnouncementDeliveryStatus.PENDING,
        },
        {
          $set: { status: AnnouncementDeliveryStatus.PROCESSING, lockedAt: new Date() },
          $inc: { attempts: 1 },
        },
        { sort: { createdAt: 1 } },
      );
      if (!delivery) {
        const remaining = await this.deliveryModel.countDocuments({
          announcementId: announcement._id,
          status: {
            $in: [AnnouncementDeliveryStatus.PENDING, AnnouncementDeliveryStatus.PROCESSING],
          },
        });
        if (remaining === 0 && !announcement.stoppedByFailure) {
          const [sentCount, failedCount] = await Promise.all([
            this.deliveryModel.countDocuments({
              announcementId: announcement._id,
              status: AnnouncementDeliveryStatus.SENT,
            }),
            this.deliveryModel.countDocuments({
              announcementId: announcement._id,
              status: AnnouncementDeliveryStatus.FAILED,
            }),
          ]);
          if (failedCount > 0 && sentCount === 0) {
            await this.announcementModel.updateOne(
              { _id: announcement._id },
              {
                $set: {
                  status: AnnouncementStatus.FAILED,
                  failureReason: 'Aucun envoi n’a abouti',
                  successCount: 0,
                  failureCount: failedCount,
                  nextProcessAt: null,
                },
              },
            );
          } else {
            await this.announcementModel.updateOne(
              { _id: announcement._id },
              {
                $set: {
                  status: AnnouncementStatus.SENT,
                  sentAt: now,
                  successCount: sentCount,
                  failureCount: failedCount,
                  nextProcessAt: null,
                },
              },
            );
          }
        }
        continue;
      }
      await this.processOneDeliveryForWave(delivery);
    }
  }

  private async releaseStaleProcessingDeliveries() {
    const staleAfterMinutes = Number(process.env.ANNOUNCEMENT_DELIVERY_LOCK_TIMEOUT_MINUTES || 10);
    const staleBefore = new Date(Date.now() - Math.max(1, staleAfterMinutes) * 60_000);
    await this.deliveryModel.updateMany(
      {
        status: AnnouncementDeliveryStatus.PROCESSING,
        lockedAt: { $lte: staleBefore },
      },
      {
        $set: {
          status: AnnouncementDeliveryStatus.PENDING,
          lockedAt: null,
          lastError: 'Traitement interrompu, reprise automatique',
        },
      },
    );
  }

  private async enqueueDeliveries(
    announcement: AnnouncementDocument,
    recipients: any[],
  ) {
    const announcementId = announcement._id as Types.ObjectId;
    await this.deliveryModel.deleteMany({
      announcementId,
      status: {
        $in: [
          AnnouncementDeliveryStatus.PENDING,
          AnnouncementDeliveryStatus.PROCESSING,
          AnnouncementDeliveryStatus.FAILED,
        ],
      },
    });

    const deliveries = recipients
      .map((recipient) => {
        const email = recipient.email ? String(recipient.email).toLowerCase() : '';
        return {
          announcementId,
          channel: AnnouncementChannel.EMAIL,
          recipientKey: email,
          email,
          phone: recipient.phone || '',
          userId: recipient.userId || '',
          userName: recipient.userName || '',
          userFirstName: recipient.userFirstName || '',
          userLastName: recipient.userLastName || '',
          userPhone: recipient.userPhone || '',
          status: AnnouncementDeliveryStatus.PENDING,
          attempts: 0,
        };
      })
      .filter((delivery) => delivery.recipientKey);

    if (deliveries.length) {
      await this.deliveryModel
        .insertMany(deliveries, { ordered: false })
        .catch((error) => {
          if (error?.code !== 11000) throw error;
        });
    }
  }

  private async processOneDeliveryForWave(delivery: AnnouncementDeliveryDocument) {
    const announcement = await this.announcementModel.findById(delivery.announcementId);
    if (!announcement) {
      await this.markDeliveryFailed(delivery, 'Annonce introuvable');
      return;
    }

    let success = false;
    try {
      const baseContent = this.composeHtml(
        announcement.html,
        announcement.useHeader,
        announcement.useFooter,
        announcement.headerHtml || '',
        announcement.footerHtml || '',
      );
      const content = this.renderContent(baseContent, delivery);
      const subjectPrefix = ['', '\u202F', '\u00A0'][
        this.simpleHash(delivery.recipientKey) % 3
      ];
      const attachments = announcement.attachmentPath
        ? [{ filename: announcement.attachmentName || 'attachment', path: this.resolveAttachmentAbsolutePath(announcement.attachmentPath) }]
        : undefined;
      const sent = await this.emailService.proceedToSendEmail(
        delivery.email,
        subjectPrefix + announcement.subject,
        content,
        undefined,
        attachments,
      );
      if (!sent) {
        throw new Error(`Adresse email rejetée : ${delivery.email}`);
      }

      await this.deliveryModel.updateOne(
        { _id: delivery._id },
        {
          $set: {
            status: AnnouncementDeliveryStatus.SENT,
            sentAt: new Date(),
            lastError: null,
          },
        },
      );
      success = true;
    } catch (error) {
      await this.markDeliveryFailed(delivery, error?.message || String(error));
    }

    await this.updateWaveProgress(
      String(delivery.announcementId),
      success,
      success ? undefined : delivery,
    );
  }

  private async updateWaveProgress(
    announcementId: string,
    success: boolean,
    failedDelivery?: AnnouncementDeliveryDocument,
  ) {
    const ann = await this.announcementModel.findById(announcementId);
    if (!ann) return;

    const now = new Date();
    const update: Record<string, any> = {};

    if (success) {
      update.currentWaveCount = (ann.currentWaveCount || 0) + 1;
      update.consecutiveFailures = 0;

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const sentToday = await this.deliveryModel.countDocuments({
        status: AnnouncementDeliveryStatus.SENT,
        sentAt: { $gte: startOfDay },
      });

      if (sentToday >= this.DAILY_EMAIL_LIMIT) {
        update.nextProcessAt = this.nextSendingWindow();
        update.currentWaveCount = 0;
        this.logger.log(
          `Daily email limit (${sentToday}/${this.DAILY_EMAIL_LIMIT}) reached for ` +
            `announcement ${ann._id}, resuming ${update.nextProcessAt.toISOString()}`,
        );
      } else if (!this.isWithinSendingHours(now)) {
        update.nextProcessAt = this.nextSendingWindow();
        update.currentWaveCount = 0;
        this.logger.log(
          `Outside email sending hours for announcement ${ann._id}, ` +
            `resuming at ${update.nextProcessAt.toISOString()}`,
        );
      } else if (update.currentWaveCount >= this.jitteredWaveLimit()) {
        update.nextProcessAt = new Date(
          now.getTime() +
            this.randomInt(this.PAUSE_MIN_MINUTES, this.PAUSE_MAX_MINUTES) *
              60 *
              1000,
        );
        update.currentWaveCount = 0;
      } else {
        update.nextProcessAt = new Date(
          now.getTime() +
            this.randomInt(this.WAVE_DELAY_MIN_SEC, this.WAVE_DELAY_MAX_SEC) *
              1000,
        );
      }
    } else {
      update.consecutiveFailures = (ann.consecutiveFailures || 0) + 1;
      update.totalWaveFailures = (ann.totalWaveFailures || 0) + 1;

      if (update.totalWaveFailures >= this.MAX_WAVE_FAILURES) {
        update.stoppedByFailure = true;
        update.status = AnnouncementStatus.FAILED;
        update.failureReason = `Envoi interrompu après ${this.MAX_WAVE_FAILURES} échecs`;
        update.nextProcessAt = null;
        this.notifyAdminStoppedByFailure(ann);
      } else {
        update.nextProcessAt = new Date(
          now.getTime() +
            this.randomInt(this.WAVE_DELAY_MIN_SEC, this.WAVE_DELAY_MAX_SEC) *
              1000,
        );
      }
    }

    const [successCount, pendingCount, failureCount] = await Promise.all([
      this.deliveryModel.countDocuments({
        announcementId: new Types.ObjectId(announcementId),
        status: AnnouncementDeliveryStatus.SENT,
      }),
      this.deliveryModel.countDocuments({
        announcementId: new Types.ObjectId(announcementId),
        status: {
          $in: [AnnouncementDeliveryStatus.PENDING, AnnouncementDeliveryStatus.PROCESSING],
        },
      }),
      this.deliveryModel.countDocuments({
        announcementId: new Types.ObjectId(announcementId),
        status: AnnouncementDeliveryStatus.FAILED,
      }),
    ]);

    update.successCount = successCount;
    update.failureCount = failureCount;

    if (pendingCount === 0 && !ann.stoppedByFailure && !update.stoppedByFailure) {
      // Plus aucun envoi en attente : le statut final dépend du résultat.
      if (successCount > 0 && failureCount === 0) {
        update.status = AnnouncementStatus.SENT;
        update.sentAt = now;
        update.nextProcessAt = null;
      } else if (successCount === 0 && failureCount > 0) {
        update.status = AnnouncementStatus.FAILED;
        update.failureReason = 'Aucun envoi n’a abouti';
        update.nextProcessAt = null;
      } else {
        // Envoi partiel : tout est traité, on considère la campagne envoyée.
        update.status = AnnouncementStatus.SENT;
        update.sentAt = now;
        update.nextProcessAt = null;
      }
    }

    await this.announcementModel.updateOne({ _id: ann._id }, { $set: update });
  }

  private async resolveRecipients(
    group?: AnnouncementRecipientGroup,
    emails: string[] = [],
  ) {
    const recipientMap = new Map<string, any>();
    const addRecipient = (recipient: any) => {
      const key = String(recipient?.email || '').toLowerCase();
      if (!key) return;
      recipientMap.set(key, {
        email: String(key).toLowerCase(),
        phone: recipient.phone ? String(recipient.phone).replace(/\D/g, '') : '',
        userId: recipient.userId || '',
        userName: recipient.userName || '',
        userFirstName: recipient.userFirstName || '',
        userLastName: recipient.userLastName || '',
        userPhone: recipient.userPhone || '',
      });
    };

    const explicitUsersByEmail = await this.findUsersByEmails(emails);
    for (const email of emails) {
      addRecipient(this.buildRecipientFromUser(explicitUsersByEmail.get(email)) || { email });
    }

    if (group) {
      if (group === AnnouncementRecipientGroup.ALL_PROSPECTS) {
        const prospects = await this.prospectsService.findAllRecipients();
        for (const prospect of prospects) {
          const email = String(prospect.email || '').toLowerCase();
          if (!email) continue;
          const prospectName = String(prospect.name || '').trim();
          addRecipient({
            email,
            phone: prospect.phone || '',
            userName: prospectName || 'Prospect',
            userFirstName: prospectName,
            userLastName: prospectName,
            userPhone: prospect.phone || '',
          });
        }
      } else {
        const userFilter = this.userFilterForGroup(group);
        const users = await this.userModel
          .find({
            ...userFilter,
            isActive: { $ne: false },
            email: { $exists: true, $ne: '' },
          })
          .select('firstName lastName name email phone accountType isAdmin');
        for (const user of users) {
          addRecipient(this.buildRecipientFromUser(user));
        }
      }
    }

    return [...recipientMap.values()];
  }

  private async findUsersByEmails(emails: string[]) {
    const normalizedEmails = [
      ...new Set(emails.map((email) => String(email).toLowerCase())),
    ];
    if (!normalizedEmails.length) return new Map<string, User>();

    const users = await this.userModel
      .find({ email: { $in: normalizedEmails } })
      .select('firstName lastName name email phone accountType isAdmin');

    return new Map(users.map((user) => [String(user.email).toLowerCase(), user]));
  }

  private buildRecipientFromUser(user?: User | null) {
    if (!user?.email) return null;
    const isPersonal = String(user.accountType || '').toLowerCase() === 'personal'
      || (!user.accountType && !!user.firstName);
    const firstName = String(user.firstName || '').trim();
    const lastName = String(user.lastName || '').trim();
    const fullName = [firstName, lastName].filter(Boolean).join(' ');
    const entityName = String(user.name || '').trim();

    return {
      email: String(user.email).toLowerCase(),
      phone: user.phone ? String(user.phone).replace(/\D/g, '') : '',
      userId: String(user._id),
      accountType: isPersonal ? 'personal' : 'organisation',
      // Compte personnel : nom complet (prénom + nom).
      // Compte organisation : raison sociale (name).
      userName: isPersonal ? (fullName || entityName) : entityName,
      // Pour un compte personnel : prénom / nom séparés.
      // Sinon (organisation) : on utilise le nom de l'entité.
      userFirstName: isPersonal ? firstName : entityName,
      userLastName: isPersonal ? lastName : entityName,
      userPhone: user.phone || '',
    };
  }

  private userFilterForGroup(group: AnnouncementRecipientGroup): FilterQuery<User> {
    switch (group) {
      case AnnouncementRecipientGroup.ALL_USERS:
        return {};
      case AnnouncementRecipientGroup.ALL_ADMINS:
        return { isAdmin: true };
      case AnnouncementRecipientGroup.ALL_PERSONAL:
        return { accountType: 'personal' };
      case AnnouncementRecipientGroup.ALL_ORGANISATIONS:
        return { accountType: 'organisation' };
      default:
        return {};
    }
  }

  private hasRecipientTarget(
    group?: AnnouncementRecipientGroup | null,
    emails: string[] = [],
  ) {
    if (group) return true;
    return emails.length > 0;
  }

  private buildRecipientLabel(
    group?: AnnouncementRecipientGroup | null,
    emails: string[] = [],
  ) {
    const labels: string[] = [];
    if (group) labels.push(this.groupLabel(group));
    if (emails.length) {
      labels.push(emails.length === 1 ? emails[0] : `${emails.length} adresses spécifiques`);
    }
    return labels.join(' + ');
  }

  private groupLabel(group: AnnouncementRecipientGroup) {
    const labels: Record<string, string> = {
      [AnnouncementRecipientGroup.ALL_USERS]: 'Tous utilisateurs',
      [AnnouncementRecipientGroup.ALL_ADMINS]: 'Tous Admins',
      [AnnouncementRecipientGroup.ALL_PERSONAL]: 'Tous comptes personnels',
      [AnnouncementRecipientGroup.ALL_ORGANISATIONS]: 'Toutes les organisations',
      [AnnouncementRecipientGroup.ALL_PROSPECTS]: 'Tous Prospects',
    };
    return labels[group] || group;
  }

  private renderContent(html: string, recipient: any) {
    const values = {
      userName: recipient.userName || 'Monsieur/Madame',
      userFirstName: recipient.userFirstName || '',
      userLastName: recipient.userLastName || '',
      userPhone: recipient.userPhone || '',
      userEmail: recipient.email || '',
    };

    return Object.entries(values).reduce(
      (content, [key, value]) =>
        content.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
      html,
    );
  }

  private resolveAttachmentAbsolutePath(relativePath: string): string {
    const clean = relativePath.replace(/^\/+|\/+$/g, '');
    return path.join(process.cwd(), clean);
  }

  private notifyAdminStoppedByFailure(announcement: AnnouncementDocument) {
    const subject = `⚠️ Annonce interrompue — ${announcement.subject || 'sans sujet'}`;
    const message =
      `L'envoi de l'annonce « ${announcement.subject || 'sans sujet'} » (${announcement._id}) ` +
      `a été interrompu après plus de ${this.MAX_WAVE_FAILURES} échecs successifs.\n\n` +
      `Statut final : FAILED — StoppedByFailure.\n` +
      `Relancez l'envoi depuis l'interface (bouton « Reprendre l'envoi ») pour repartir ` +
      `uniquement des destinataires en échec.`;
    void this.emailService
      .sendAlertEmail(subject, message)
      .catch((error) => this.logger.warn(`Annonce alert admin failed: ${error?.message || error}`));
  }

  private async markDeliveryFailed(
    delivery: AnnouncementDeliveryDocument,
    message: string,
  ) {
    const maxAttempts = Number(process.env.ANNOUNCEMENT_DELIVERY_MAX_ATTEMPTS || 3);
    const nextStatus =
      delivery.attempts >= maxAttempts
        ? AnnouncementDeliveryStatus.FAILED
        : AnnouncementDeliveryStatus.PENDING;
    await this.deliveryModel.updateOne(
      { _id: delivery._id },
      {
        $set: {
          status: nextStatus,
          lastError: message.slice(0, 500),
          lockedAt: null,
        },
      },
    );
  }

  private parseEmails(raw?: string) {
    return [
      ...new Set(
        (raw || '')
          .split(/[;,]/)
          .map((email) => email.trim().toLowerCase())
          .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
      ),
    ];
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private isWithinSendingHours(now: Date): boolean {
    const hour = now.getHours();
    return hour >= this.EMAIL_START_HOUR && hour < this.EMAIL_END_HOUR;
  }

  private nextSendingWindow(): Date {
    const now = new Date();
    const start = this.EMAIL_START_HOUR;
    const end = this.EMAIL_END_HOUR;
    const hour = now.getHours();
    if (hour < start) {
      const next = new Date(now);
      next.setHours(start, this.randomInt(0, 30), 0, 0);
      return next;
    }
    if (hour >= end) {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(start, this.randomInt(0, 30), 0, 0);
      return next;
    }
    return now;
  }

  private jitteredWaveLimit(): number {
    return this.WAVE_SIZE + this.randomInt(-2, 5);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }
}