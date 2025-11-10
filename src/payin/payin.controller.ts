/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unused-vars */
// src/Payin/Payin.controller.ts
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
import { PayinService } from './payin.service';
import axios from 'axios';
import * as crypto from 'crypto';
import { HttpException } from '@nestjs/common';

@Controller('payin')
export class PayinController {
  private readonly logger = new Logger(PayinController.name);
  constructor(private payinService: PayinService) {}

  // 1) initialisation : backend crée txRef + enregistre, renvoie les données au front
  @Post('initialize')
  async initialize(@Body() dto: any) {
    console.log('Payin initialize:');
    return this.payinService.initPayin({
      txRef: dto.txRef,
      amount: dto.amount,
      currency: dto.currency || 'XAF',
      customerEmail: dto.customerEmail,
      transactionId: dto.transactionId
    });
  }

  // 2) webhook endpoint pour être notifié par Flutterwave
  // @Post('webhook')
  // async webhook(@Req() req: any, @Headers('verif-hash') verifHash: string) {
  //   console.log('Payin webhook:');
  //   const secretHash = process.env.FLUTTERWAVE_SECRET_HASH || ''; // configuré dans dashboard Flutterwave
  //   const bodyStr = JSON.stringify(req.body || {});
  //   // vérification du header (selon doc flutterwave : header 'verif-hash')
  //   if (secretHash) {
  //     const computed = crypto
  //       .createHmac('sha256', secretHash)
  //       .update(bodyStr)
  //       .digest('hex');
  //     if (computed !== verifHash) {
  //       this.logger.warn('Webhook signature mismatch');
  //       return { status: 'ignored' };
  //     }
  //   }
  //   const payload = req.body;
  //   // tx_ref se trouve souvent dans payload.data.tx_ref ou payload.data?.tx?.tx_ref
  //   const txRef =
  //     payload?.data?.tx_ref ||
  //     payload?.data?.tx?.tx_ref ||
  //     payload?.data?.reference ||
  //     payload?.data?.id;
  //   if (!txRef) {
  //     this.logger.warn(
  //       'Webhook: txRef not found in payload',
  //       JSON.stringify(payload),
  //     );
  //     return { status: 'no-txref' };
  //   }
  //   const updated = await this.payinService.saveFlutterwaveResult(txRef, payload);
  //   this.logger.log(
  //     `Webhook processed txRef=${txRef} status=${updated?.status}`,
  //   );
  //   return { status: 'ok' };
  // }

  @Get('get-txRef/:txRef')
  async getPayinByTxRef(@Param('txRef') txRef: string) {
    return this.payinService.getPayinByTxRef(txRef);
  }
}
