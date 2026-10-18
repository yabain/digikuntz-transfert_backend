/**
 * Proves that `DIRECT_CHARGE_ENABLED` is a REAL rollback lever.
 *
 * The plan and the runbook both promise that setting the flag to `false` restores
 * the previous behaviour without a code change. A flag that gates nothing is worse
 * than no flag at all: it gives false confidence during a rollback while the
 * money-moving path keeps running. These tests therefore assert the observed
 * behaviour of the two entrypoints, not merely that the helper parses a string.
 *
 * No dependency is exercised here: the gate is the first statement of each method,
 * which is exactly the point — nothing upstream can be reached while it is closed.
 */
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service';
import { isPreChargeRejection } from './mobile-money-charge.builder';

type ServiceArgs = ConstructorParameters<typeof FlutterwaveService>;

/** Index of `ConfigService` in the constructor (see the class signature). */
const CONFIG_ARG_INDEX = 17;

/**
 * Builds the service with inert collaborators.
 *
 * Safe only because the code under test throws before touching any of them.
 */
function buildService(env: Record<string, string>): FlutterwaveService {
  const configService = {
    get: jest.fn((key: string) => env[key]),
  };

  const args = new Array<unknown>(CONFIG_ARG_INDEX + 1).fill({});
  args[CONFIG_ARG_INDEX] = configService;

  return new FlutterwaveService(...(args as unknown as ServiceArgs));
}

async function capture(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }

  throw new Error('Expected the call to reject');
}

describe('FlutterwaveService — DIRECT_CHARGE_ENABLED gate', () => {
  describe('createDirectPayin (invoice + payment request)', () => {
    it('refuses the direct route as a PRE-CHARGE failure when the flag is off', async () => {
      // Pre-charge is the crucial part: it is what lets the callers silently use
      // the hosted checkout again, i.e. the documented rollback behaviour.
      const service = buildService({ DIRECT_CHARGE_ENABLED: 'false' });

      const error = await capture(() =>
        service.createDirectPayin({ estimation: 5000 }, {} as never),
      );

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(400);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'DIRECT_CHARGE_DISABLED',
      });
      expect(isPreChargeRejection(error)).toBe(true);
    });

    it('is closed by default, so an unset variable cannot enable a live charge path', async () => {
      const service = buildService({});

      const error = await capture(() =>
        service.createDirectPayin({ estimation: 5000 }, {} as never),
      );

      expect(isPreChargeRejection(error)).toBe(true);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'DIRECT_CHARGE_DISABLED',
      });
    });

    it('lets the call through when the flag is on', async () => {
      const service = buildService({ DIRECT_CHARGE_ENABLED: 'true' });

      const error = await capture(() =>
        service.createDirectPayin({ estimation: 5000 }, {} as never),
      );

      // It now fails much later (a missing collaborator), which is the point:
      // the gate itself did not stop it.
      expect(error).not.toBeInstanceOf(HttpException);
    });
  });

  describe('createDirectCharge (/fw/direct-charge + dev flow)', () => {
    it('fails closed with 503 when disabled, because there is no hosted equivalent', async () => {
      const service = buildService({ DIRECT_CHARGE_ENABLED: 'false' });

      const error = await capture(() =>
        service.createDirectCharge({ estimation: 100 }, 'user-1'),
      );

      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getStatus()).toBe(503);
    });

    it('proceeds past the gate when the flag is on', async () => {
      const service = buildService({ DIRECT_CHARGE_ENABLED: 'true' });

      const error = await capture(() =>
        service.createDirectCharge({ estimation: 100 }, 'user-1'),
      );

      expect(error).toBeDefined();
      expect(error).not.toBeInstanceOf(ServiceUnavailableException);
    });

    it('accepts the flag spellings commonly found in .env files', async () => {
      for (const value of ['1', 'yes', 'on', 'TRUE']) {
        const service = buildService({ DIRECT_CHARGE_ENABLED: value });

        const error = await capture(() =>
          service.createDirectCharge({ estimation: 100 }, 'user-1'),
        );

        expect(error).not.toBeInstanceOf(ServiceUnavailableException);
      }
    });

    it('stays closed for an unrecognised value instead of guessing', async () => {
      const service = buildService({ DIRECT_CHARGE_ENABLED: 'maybe' });

      await expect(
        service.createDirectCharge({ estimation: 100 }, 'user-1'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
