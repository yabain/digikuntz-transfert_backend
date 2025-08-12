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
import { Transactions, TransactionsDocument } from './transactions.schema';
import { HttpException, HttpStatus } from '@nestjs/common';

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  constructor(
    @InjectModel(Transactions.name) private txModel: Model<TransactionsDocument>,
  ) {}

  async initTransaction(payload: {
    amount: number;
    currency: string;
    customerEmail?: string;
    meta?: any;
  }) {
    const txRef = `tx-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const tx = await this.txModel.create({
      txRef,
      amount: payload.amount,
      currency: payload.currency || 'XAF',
      customerEmail: payload.customerEmail,
      status: 'pending',
      meta: payload.meta || {},
    });
    return tx;
  }

  async saveFlutterwaveResult(txRef: string, flwPayload: any) {
    const flwId = flwPayload?.data?.id || flwPayload?.data?.tx?.id || undefined;
    const status =
      (flwPayload?.data?.status ||
        flwPayload?.data?.tx?.status ||
        flwPayload?.status) ??
      'pending';
    const updated = await this.txModel
      .findOneAndUpdate(
        { txRef },
        { status, flwTxId: flwId, raw: flwPayload },
        { new: true },
      )
      .exec();
    return updated;
  }

async verifyWithFlutterwaveByTxRef(txRef: string) {
  // 0. Vérifier que la transaction existe localement d'abord (utile pour debug)
  const local = await this.txModel.findOne({ txRef }).lean().exec();
  if (!local) {
    this.logger.warn(`verify: txRef ${txRef} not found in local DB`);
    throw new HttpException({ message: `Local transaction ${txRef} not found` }, HttpStatus.NOT_FOUND);
  }

  const secret = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!secret) {
    this.logger.error('FLUTTERWAVE_SECRET_KEY is not set in environment');
    throw new HttpException({ message: 'Payment provider not configured' }, HttpStatus.INTERNAL_SERVER_ERROR);
  }

  const url = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;

  try {
    this.logger.debug(`Calling Flutterwave verify_by_reference for tx_ref=${txRef}`);
    const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${secret}` },
      timeout: 10000,
    });

    const data = resp.data;
    this.logger.debug(`Flutterwave response for ${txRef}: ${JSON.stringify(data)}`);

    const status = data?.data?.status || data?.status || 'pending';

    const updated = await this.txModel
      .findOneAndUpdate(
        { txRef },
        { status, raw: data, flwTxId: data?.data?.id },
        { new: true },
      )
      .exec();

    this.logger.log(`Transaction ${txRef} updated to status=${status} (flwId=${data?.data?.id})`);
    return { success: true, data, updated };
  } catch (error) {
    // axios error peut contenir response.data avec message explicite de Flutterwave
    const fwData = error?.response?.data;
    this.logger.error(`Error verifying tx ${txRef}: ${error?.message}`);
    if (fwData) this.logger.error(`Flutterwave error payload: ${JSON.stringify(fwData)}`);

    // Mettre à jour localement le statut et stocker l'erreur
    await this.txModel
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


  async getTransaction(txRef: string) {
    return this.txModel.findOne({ txRef }).lean().exec();
  }

  async findPending(limit = 50) {
    return this.txModel.find({ status: 'pending' }).limit(limit).exec();
  }
}
