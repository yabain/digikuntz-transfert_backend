import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron } from '@nestjs/schedule';
import { Transaction } from '../transaction/transaction.schema';
import { TStatus } from '../transaction/transaction.schema';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';
import { DevService } from '../dev/dev.service';

@Injectable()
export class AutoApprovePayoutCron {
  private readonly logger = new Logger(AutoApprovePayoutCron.name);

  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    private fwService: FlutterwaveService,
    private devService: DevService,
  ) {}

  @Cron('*/5 * * * *')
  async handleAutoApprove() {
    if (!this.devService.getAutoApproveState()) return;
    const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 60 min

    const pending = await this.transactionModel
      .find({
        status: TStatus.PAYINSUCCESS,
        updatedAt: { $lt: cutoff },
        $or: [
          { transactionType: 'transfer' },
          { transactionType: 'withdrawal' },
          { transactionType: 'systemWithdrawal' },
          { transactionType: 'apiCall', isApiPayout: true },
        ],
      })
      .lean()
      .exec();

    if (!pending.length) return;

    this.logger.log(`Auto-approve: ${pending.length} pending payout(s) older than 60min`);

    for (const tx of pending) {
      if (!tx.userId) continue;
      try {
        await this.fwService.payout(String(tx._id), String(tx.userId));
        this.logger.log(`Auto-approved payout transaction ${tx._id}`);
      } catch (err: any) {
        this.logger.error(`Auto-approve failed for ${tx._id}: ${err?.message || err}`);
      }
    }
  }
}
