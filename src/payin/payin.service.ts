/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
// src/transactions/transactions.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { randomBytes } from 'crypto';
import { Payin, PayinDocument } from './payin.schema';
import { HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class PayinService {
  private readonly logger = new Logger(PayinService.name);
  statusT = {
    INITIALIZED: 'transaction_initialized',
    PENDING: 'transaction_pending',
    PAYIN: 'transaction_payin',
    PAYINSUCCESS: 'transaction_payin_success',
    PAYINERROR: 'transaction_payin_error',
    PAYOUT: 'transaction_payout',
    PAYOUTSUCCESS: 'transaction_payout_success',
    PAYOUTERROR: 'transaction_payout_error',
    ERROR: 'transaction_error',
    SUCCESS: 'transaction_success',
  };

  constructor(
      @InjectModel(Payin.name) private payinModel: Model<PayinDocument>,
  ){}

  async initPayin(payload: {
    amount: number;
    currency: string;
    customerEmail?: string;
    transactionId: string;
    meta?: any;
  }) {
    console.log('Paying initPayin:');
    const txRef = `tx-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const tx = await this.payinModel.create({
      txRef,
      amount: payload.amount,
      currency: payload.currency || 'XAF',
      customerEmail: payload.customerEmail,
      transactionId: payload.transactionId,
      status: this.statusT.PENDING,
      meta: payload.meta || {},
    });
    return tx;
  }

  async saveFlutterwaveResult(txRef: string, flwPayload: any) {
    console.log('Paying saveFlutterwaveResult:');
    const flwId = flwPayload?.data?.id || flwPayload?.data?.tx?.id || undefined;
    const status =
      (flwPayload?.data?.status ||
        flwPayload?.data?.tx?.status ||
        flwPayload?.status) ??
      this.statusT.PENDING;
    const updated = await this.payinModel
      .findOneAndUpdate(
        { txRef },
        { status, flwTxId: flwId, raw: flwPayload },
        { new: true },
      )
      .exec();
    return updated;
  }

  async verifyWithFlutterwaveByTxRef(txRef: string) {
    console.log('Paying verify:');
    // 0. Vérifier que la transaction existe localement d'abord (utile pour debug)
    const local = await this.payinModel.findOne({ txRef }).lean().exec();
    if (!local) {
      this.logger.warn(`Payin verify: txRef ${txRef} not found in local DB`);
      throw new HttpException({ message: `Local transaction ${txRef} not found` }, HttpStatus.NOT_FOUND);
    }
  
    const secret = process.env.FLUTTERWAVE_SECRET_KEY;
    if (!secret) {
      this.logger.error('FLUTTERWAVE_SECRET_KEY is not set in environment');
      throw new HttpException({ message: 'Payment provider not configured' }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  
    const url = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;
  
    try {
      this.logger.debug(`Payin Calling Flutterwave verify_by_reference for tx_ref=${txRef}`);
      const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${secret}` },
        timeout: 10000,
      });
  
      const data = resp.data;
      this.logger.debug(`Payin Flutterwave response for ${txRef}: ${JSON.stringify(data)}`);
  
      const status = data?.data?.status || data?.status || this.statusT.PENDING;
  
      const updated = await this.payinModel
        .findOneAndUpdate(
          { txRef },
          { status, raw: data, flwTxId: data?.data?.id },
          { new: true },
        )
        .exec();
  
      this.logger.log(`Payin Transaction ${txRef} updated to status=${status} (flwId=${data?.data?.id})`);
      return { success: true, data, updated };
    } catch (error) {
      // axios error peut contenir response.data avec message explicite de Flutterwave
      const fwData = error?.response?.data;
      this.logger.error(`Payin Error verifying tx ${txRef}: ${error?.message}`);
      if (fwData) this.logger.error(`Payin Flutterwave error payload: ${JSON.stringify(fwData)}`);
  
      // Mettre à jour localement le statut et stocker l'erreur
      await this.payinModel
        .findOneAndUpdate(
          { txRef },
          { status: 'failed', error: fwData || error.message },
          { new: true },
        )
        .exec();
  
      // Renvoyer une HttpException plus descriptive
      const message = fwData?.message || fwData || error.message || 'Unknown error from Flutterwave';
      // si Flutterwave renvoie "No transaction was found for this id", on le renvoie tel quel
      throw new HttpException({ message }, HttpStatus.BAD_GATEWAY);
    }
  }

  async getPayin(txRef: string) {
    return this.payinModel.findOne({ txRef }).lean().exec();
  }

  async findPending(limit = 50) {
    return this.payinModel.find({ status: this.statusT.PENDING }).limit(limit).exec();
  }
}
