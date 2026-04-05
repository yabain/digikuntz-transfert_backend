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
  HttpStatus,
  Req,
  Query,
  Headers,
  Logger,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PayinService } from './payin.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import axios from 'axios';
import * as crypto from 'crypto';
import { HttpException } from '@nestjs/common';

@ApiTags('payin')
@Controller('payin')
export class PayinController {
  private readonly logger = new Logger(PayinController.name);
  constructor(
    private payinService: PayinService,
    private fwService: FlutterwaveService,
  ) {}

  // 1) initialisation : backend crée txRef + enregistre, renvoie les données au front
  @Post('initialize')
  @ApiOperation({ summary: 'Initialize a payin' })
  @ApiBody({
    schema: {
      example: {
        txRef: 'txPayin-1741130000000-abcd1234',
        amount: 1000,
        currency: 'XAF',
        customerEmail: 'john@mail.com',
        transactionId: '65f0aa12d4b1c2f1a8a4f001',
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Payin initialized.' })
  @ApiResponse({ status: 400, description: 'Invalid payload.' })
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
  @ApiOperation({ summary: 'Get local payin by txRef' })
  @ApiParam({ name: 'txRef', description: 'Payin transaction reference' })
  @ApiResponse({ status: 200, description: 'Payin data returned.' })
  @ApiResponse({ status: 404, description: 'Payin not found.' })
  async getPayinByTxRef(@Param('txRef') txRef: string) {
    return this.payinService.getPayinByTxRef(txRef);
  }

  @Post('mpesa/callback')
  @ApiOperation({
    summary:
      'M-Pesa STK callback endpoint (updates payin + transaction workflow)',
  })
  @ApiProduces('application/json')
  @ApiResponse({ status: 200, description: 'Callback accepted and processed.' })
  async mpesaCallback(@Body() payload: any, @Query('txRef') txRef?: string) {
    this.logger.log(
      `[M-Pesa callback] received payload keys=${Object.keys(payload || {}).join(',')}`,
    );

    // Safaricom expects a fast HTTP 200 acknowledgment.
    // Process callback asynchronously to avoid retries/timeouts.
    void this.processMpesaCallbackAsync(payload, txRef);

    return {
      ResultCode: 0,
      ResultDesc: 'Accepted',
      statusCode: HttpStatus.OK,
    };
  }

  private async processMpesaCallbackAsync(payload: any, txRef?: string) {
    const callbackResult = await this.payinService.handleMpesaStkCallback(
      payload,
      txRef,
    );
    const cb = payload?.Body?.stkCallback || payload?.stkCallback || {};
    const metadataItems = Array.isArray(cb?.CallbackMetadata?.Item)
      ? cb.CallbackMetadata.Item
      : [];
    this.logger.log(
      `[M-Pesa callback] txRef=${callbackResult?.txRef || 'n/a'} checkoutRequestId=${String(
        cb?.CheckoutRequestID || '',
      )} merchantRequestId=${String(
        cb?.MerchantRequestID || '',
      )} resultCode=${String(cb?.ResultCode ?? '')} resultDesc="${String(
        cb?.ResultDesc || '',
      )}" localStatus=${String(callbackResult?.status || 'n/a')}`,
    );
    this.logger.debug(
      `[M-Pesa callback][technical] ${JSON.stringify({
        txRefHint: txRef || '',
        resultCode: cb?.ResultCode ?? null,
        resultDesc: cb?.ResultDesc ?? '',
        checkoutRequestId: cb?.CheckoutRequestID || '',
        merchantRequestId: cb?.MerchantRequestID || '',
        callbackMetadata: metadataItems,
        stkCallback: cb,
      })}`,
    );
    if (!callbackResult?.accepted || !callbackResult?.txRef) return;

    try {
      if (callbackResult.status === 'successful') {
        await this.fwService.verifyPayin(callbackResult.txRef);
      } else if (
        callbackResult.status === 'failed' ||
        callbackResult.status === 'cancelled'
      ) {
        await this.fwService.verifyAndClosePayin(callbackResult.txRef);
      } else {
        await this.fwService.verifyPayin(callbackResult.txRef);
      }
    } catch (error: any) {
      this.logger.error(
        `M-Pesa callback post-processing failed for txRef=${callbackResult.txRef}`,
        error?.message || error,
      );
    }
  }
}
