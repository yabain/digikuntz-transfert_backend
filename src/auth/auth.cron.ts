/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/user/user.schema';
import { DistributedLockService } from 'src/distributed-lock/distributed-lock.service';

/**
 * Débloque automatiquement les comptes dont le verrouillage (suspicion de
 * brute-force) a expiré. Le verrouillage dure 1 heure (LOCKOUT_DURATION_MS).
 *
 * IMPORTANT : les comptes désactivés par un administrateur (isActive: false)
 * ne sont JAMAIS débloqués par ce cron — seul l'admin peut les réactiver.
 */
@Injectable()
export class AuthCron {
  private readonly logger = new Logger(AuthCron.name);

  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    private readonly lockService: DistributedLockService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async unlockExpiredLockouts() {
    await this.lockService.withLock('cron:auth:unlock-lockouts', 60_000, async () => {
      const now = new Date();

      const result = await this.userModel.updateMany(
        {
          // Ne débloquer que les comptes encore actifs : un compte désactivé
          // par l'administrateur (isActive: false) doit le rester.
          isActive: true,
          lockoutUntil: { $ne: null, $lt: now },
        },
        {
          $set: {
            lockoutUntil: null,
            loginAttempts: 0,
            firstFailedAttemptAt: null,
          },
        },
      );

      if (result.modifiedCount > 0) {
        this.logger.log(
          `(auth cron) ${result.modifiedCount} compte(s) débloqué(s) après expiration du verrouillage`,
        );
      }
    });
  }
}