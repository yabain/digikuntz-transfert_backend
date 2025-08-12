/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
// src/transactions/transactions.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Req,
  Headers,
  Logger,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { InitPaymentDto } from './transactions.dto';
import axios from 'axios';
import * as crypto from 'crypto';
import { HttpException } from '@nestjs/common';

@Controller('payments')
export class TransactionsController {
  private readonly logger = new Logger(TransactionsController.name);
  constructor(private txService: TransactionsService) {}

  // 1) initialisation : backend crée txRef + enregistre, renvoie les données au front
  @Post('initialize')
  async initialize(@Body() dto: any) {
    const tx = await this.txService.initTransaction({
      amount: dto.amount,
      currency: dto.currency || 'XAF',
      customerEmail: dto.customerEmail,
    });
    console.log('initialaze: ', tx);
    // retourne infos nécessaires au frontend: txRef, publicKey, amount, currency, customerEmail
    return {
      txRef: tx.txRef,
      amount: tx.amount,
      currency: tx.currency,
      customerEmail: tx.customerEmail,
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
      // tu peux aussi retourner un redirect_url si tu veux
    };
  }

  // 2) webhook endpoint pour être notifié par Flutterwave
  @Post('webhook')
  async webhook(@Req() req: any, @Headers('verif-hash') verifHash: string) {
    const secretHash = process.env.FLUTTERWAVE_SECRET_HASH || ''; // configuré dans dashboard Flutterwave
    const bodyStr = JSON.stringify(req.body || {});
    // vérification du header (selon doc flutterwave : header 'verif-hash')
    if (secretHash) {
      const computed = crypto
        .createHmac('sha256', secretHash)
        .update(bodyStr)
        .digest('hex');
      if (computed !== verifHash) {
        this.logger.warn('Webhook signature mismatch');
        return { status: 'ignored' };
      }
    }
    const payload = req.body;
    // tx_ref se trouve souvent dans payload.data.tx_ref ou payload.data?.tx?.tx_ref
    const txRef =
      payload?.data?.tx_ref ||
      payload?.data?.tx?.tx_ref ||
      payload?.data?.reference ||
      payload?.data?.id;
    if (!txRef) {
      this.logger.warn(
        'Webhook: txRef not found in payload',
        JSON.stringify(payload),
      );
      return { status: 'no-txref' };
    }
    const updated = await this.txService.saveFlutterwaveResult(txRef, payload);
    this.logger.log(
      `Webhook processed txRef=${txRef} status=${updated?.status}`,
    );
    return { status: 'ok' };
  }

  @Get('status/:txRef')
  async status(@Param('txRef') txRef: string) {
    this.logger.log(`status endpoint called with ${txRef}`);
    try {
      const resp = await this.txService.verifyWithFlutterwaveByTxRef(txRef);
      return resp;
    } catch (err) {
      this.logger.error(
        `status error for ${txRef}: ${err?.message || JSON.stringify(err)}`,
      );
      // si err est HttpException, on peut renvoyer son contenu, sinon on renvoie generic
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        { message: err?.message || 'Error verifying transaction' },
        502,
      );
    }
  }
}
