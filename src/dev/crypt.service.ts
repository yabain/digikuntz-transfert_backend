/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from 'crypto';
import { Dev } from './dev.schema';
import * as mongoose from 'mongoose';

@Injectable()
export class CryptService {
    private static readonly PBKDF2_ITERS = 100_000;
    private static readonly KEY_LEN = 32;
    private static readonly DIGEST = 'sha256';
    private cryptKey: string = process.env.CRYPT_KEY || '';

  constructor(
  ) { }

  encryptWithPassphrase(plainText: string, passphrase: string = this.cryptKey): string {
    const salt = randomBytes(16);
    const iv = randomBytes(16);
    const key = pbkdf2Sync(
      passphrase,
      salt,
      CryptService.PBKDF2_ITERS,
      CryptService.KEY_LEN,
      CryptService.DIGEST,
    );

    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);

    const hmac = createHmac('sha256', key)
      .update(Buffer.concat([salt, iv, ciphertext]))
      .digest();

    return [
      salt.toString('base64'),
      iv.toString('base64'),
      ciphertext.toString('base64'),
      hmac.toString('base64'),
    ].join(':');
  }

  decryptWithPassphrase(payload: string, passphrase: string = this.cryptKey): string {
    const parts = payload.split(':');
    if (parts.length !== 4) {
      throw new ConflictException('Invalid payload format');
    }
    const [saltB64, ivB64, ctB64, hmacB64] = parts;

    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const ciphertext = Buffer.from(ctB64, 'base64');
    const hmac = Buffer.from(hmacB64, 'base64');

    const key = pbkdf2Sync(
      passphrase,
      salt,
      CryptService.PBKDF2_ITERS,
      CryptService.KEY_LEN,
      CryptService.DIGEST,
    );

    const expectedHmac = createHmac('sha256', key)
      .update(Buffer.concat([salt, iv, ciphertext]))
      .digest();

    if (
      hmac.length !== expectedHmac.length ||
      !timingSafeEqual(hmac, expectedHmac)
    ) {
      throw new ConflictException('Invalid HMAC');
    }

    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    const plain = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plain.toString('utf8');
  }

}
