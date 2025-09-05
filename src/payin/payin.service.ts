/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable prettier/prettier */
// src/transactions/transactions.service.ts
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import axios from 'axios';
import { randomBytes } from 'crypto';
import { Payin, PayinDocument, PayinStatus } from './payin.schema';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { CreatePayinDto } from './payin.dto';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PayinService {
  private readonly logger = new Logger(PayinService.name);

  private fwSecret: any;
  private fwPublic: any;
  private fwBaseUrlV3 = 'https://api.flutterwave.com/v3';
  // Some V4 payout endpoints (subject to account enablement)
  private fwBaseUrlV4 = 'https://api.flutterwave.cloud';
  private secretHash: any;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @InjectModel(Payin.name) private payinModel: mongoose.Model<PayinDocument>,
  ) {
    this.secretHash = this.config.get<string>('FLUTTERWAVE_SECRET_HASH');
    this.fwSecret = this.config.get<string>('FLUTTERWAVE_SECRET_KEY');
    this.fwPublic = this.config.get<string>('FLUTTERWAVE_PUBLIC_KEY');
  }

  // ---------- Helpers ----------
  private authHeader() {
    return { Authorization: `Bearer ${this.fwSecret}` };
  }

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
      status: PayinStatus.PENDING,
      meta: payload.meta || {},
    });

    return {
      txRef: tx.txRef,
      amount: tx.amount,
      currency: tx.currency,
      customerEmail: tx.customerEmail,
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
      // tu peux aussi retourner un redirect_url si tu veux
    };
  }

  // ---------- Pay-In (Hosted Payment) ---------
  async createPayin(dto: CreatePayinDto) {
    console.log('Paying createPayin: ', dto);
    const txRef = `tx-${Date.now()}-${randomBytes(4).toString('hex')}`;
    const payload: any = {
      tx_ref: txRef,
      amount: dto.amount,
      currency: dto.currency,
      redirect_url:
        dto.redirectUrl ??
        this.config.get('FLUTTERWAVE_REDIRECT_URL') + '/subscription/packages',
      customer: { email: dto.customerEmail, name: dto.customerName },
      meta: { app: 'digikuntz-payments', env: this.config.get('NODE_ENV') },
      payment_options: dto.channel ?? undefined,
    };
    const url = `${this.fwBaseUrlV3}/payments`;
    const res = await firstValueFrom(
      this.http.post(url, payload, { headers: this.authHeader() }),
    );

    // Save pending Payin
    await this.payinModel.create({
      userId: dto.userId,
      transactionId: dto.transactionId,
      txRef: txRef,
      amount: dto.amount,
      currency: dto.currency,
      customerEmail: dto.customerEmail,
      customerName: dto.customerName,
      status: 'pending',
      raw: res.data,
    });
    console.log('res data payIn: ', res);
    const output = {
      status: 'pending',
      txRef: txRef,
      amount: dto.amount,
      currency: dto.currency,
      customerEmail: dto.customerEmail,
      publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
      redirect_url: res.data.data.link,
    };
    console.log('output data payIn: ', output);

    return output;
  }

  async saveFlutterwaveResult(txRef: string, flwPayload: any) {
    console.log('Paying saveFlutterwaveResult:');
    const flwId = flwPayload?.data?.id || flwPayload?.data?.tx?.id || undefined;
    const status =
      (flwPayload?.data?.status ||
        flwPayload?.data?.tx?.status ||
        flwPayload?.status) ??
      'pending';
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
      this.logger.warn(`Payin verify: txRef ${txRef} not found in DB`);
      throw new HttpException(
        { message: `Local transaction ${txRef} not found` },
        HttpStatus.NOT_FOUND,
      );
    }
    const secret = process.env.FLUTTERWAVE_SECRET_KEY;
    const url = `${this.fwBaseUrlV3}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;

    try {
      this.logger.debug(
        `Payin Calling Flutterwave verify_by_reference for tx_ref=${txRef}`,
      );
      const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${secret}` },
        timeout: 10000,
      });

      const data = resp.data;
      this.logger.debug(
        `Payin Flutterwave response for ${txRef}: ${JSON.stringify(data)}`,
      );

      const status = data?.data?.status || data?.status || 'pending';

      const updated = await this.payinModel
        .findOneAndUpdate(
          { txRef },
          { status, raw: data, flwTxId: data?.data?.id },
          { new: true },
        )
        .exec();

      this.logger.log(
        `Payin Transaction ${txRef} updated to status=${status} (flwId=${data?.data?.id})`,
      );
      return { success: true, data, updated };
    } catch (error) {
      // axios error peut contenir response.data avec message explicite de Flutterwave
      const fwData = error?.response?.data;
      this.logger.error(`Payin Error verifying tx ${txRef}: ${error?.message}`);
      if (fwData)
        this.logger.error(
          `Payin Flutterwave error payload: ${JSON.stringify(fwData)}`,
        );

      // Mettre à jour localement le statut et stocker l'erreur
      await this.payinModel
        .findOneAndUpdate(
          { txRef },
          { status: 'failed', error: fwData || error.message },
          { new: true },
        )
        .exec();

      // Renvoyer une HttpException plus descriptive
      const message =
        fwData?.message ||
        fwData ||
        error.message ||
        'Unknown error from Flutterwave';
      // si Flutterwave renvoie "No transaction was found for this id", on le renvoie tel quel
      throw new HttpException({ message }, HttpStatus.BAD_GATEWAY);
    }
  }

  async getPayin(txRef: string) {
    return this.payinModel.findOne({ txRef }).lean().exec();
  }

  async findPending(limit = 1000) {
    return this.payinModel
      .find({ status: PayinStatus.PENDING })
      .limit(limit)
      .exec();
  }

  ///
  async updatePayinStatus(txRef: string, status: string) {
    return this.payinModel.findOneAndUpdate(
      { txRef },
      { status: status },
      { new: true },
    );
  }

  async updatePayin(data: any, status: string) {
    return this.payinModel.findOneAndUpdate(
      { txRef: data.tx_ref },
      {
        status: status,
        flwTxId: String(data.id),
        raw: data,
      },
    );
  }

  async verifyPayin(idOrTxRef: string) {
    let res;

    try {
      if (/^\d+$/.test(idOrTxRef)) {
        console.log('verifyPayin using id:', idOrTxRef);
        // looks like numeric flw tx id
        res = await firstValueFrom(
          this.http.get(
            `${this.fwBaseUrlV3}/transactions/${idOrTxRef}/verify`,
            {
              headers: this.authHeader(),
            },
          ),
        );
      } else {
        console.log('verifyPayin using txRef:', idOrTxRef);
        res = await firstValueFrom(
          this.http.get(
            `${this.fwBaseUrlV3}/transactions/verify_by_reference`,
            {
              headers: this.authHeader(),
              params: { tx_ref: idOrTxRef },
            },
          ),
        );
      }
      this.logger.debug(
        `Payin Flutterwave response for ${idOrTxRef}: ${JSON.stringify(res.data)}`,
      );
      return this.handleClosePayin(idOrTxRef, res);
    } catch (error) {
      console.log('error updating payin:', error);
      // axios error peut contenir response.data avec message explicite de Flutterwave
      const fwData = error?.response?.data;
      this.logger.error(
        `Payin Error verifying tx ${idOrTxRef}: ${error?.message}`,
      );
      if (fwData)
        this.logger.error(
          `Payin Flutterwave error payload: ${JSON.stringify(fwData)}`,
        );

      if (
        fwData?.message &&
        fwData.message.includes('No transaction was found for this id')
      ) {
        console.log('00000. No transaction found, returning local record');
        return this.handleClosePayin(idOrTxRef);
      }
      // Mettre à jour localement le statut et stocker l'erreur
      await this.payinModel
        .findOneAndUpdate(
          { idOrTxRef },
          { status: 'failed', error: fwData || error.message },
          { new: true },
        )
        .exec();

      // Renvoyer une HttpException plus descriptive
      const message =
        fwData?.message ||
        fwData ||
        error.message ||
        'Unknown error from Flutterwave';
      // si Flutterwave renvoie "No transaction was found for this id", on le renvoie tel quel
      throw new HttpException({ message }, HttpStatus.BAD_GATEWAY);
    }
  }

  async handleClosePayin(idOrTxRef: string, res?) {
    if (res?.data) {
      console.log('1111 No response data from FW, returning local record');
      const data = res.data?.data;
      const status = data?.data?.status || data?.status || PayinStatus.PENDING;
      const txRef = data.tx_ref;
      // 0. Vérifier que la transaction existe en BD (utile pour debug)
      const local = await this.payinModel.findOne({ txRef }).lean().exec();
      if (!local) {
        this.logger.warn(`Payin verify: txRef ${txRef} not found in DB`);
        throw new HttpException(
          { message: `Local transaction ${txRef} not found` },
          HttpStatus.NOT_FOUND,
        );
      }
      const updatedData = await this.payinModel
        .findOneAndUpdate(
          { txRef },
          {
            status: status,
            flwTxId: String(data.id),
            raw: data,
          },
        )
        .exec();
      return updatedData;
    } else {
      console.log('2222 No response data from FW, returning local record');
      return await this.payinModel.findOne({ txRef: idOrTxRef }).lean().exec();
    }
  }

  async verifyWebhook(req: Request) {
    const signature = req.headers['verif-hash'] as string;
    const body: any = req.body;

    if (!signature || signature !== this.secretHash) {
      throw new UnauthorizedException('Invalid Flutterwave webhook signature');
    }

    // exemple : mise à jour du Payin
    if (
      body.event === 'charge.completed' &&
      body.data.status === 'successful'
    ) {
      await this.payinModel.findOneAndUpdate(
        { fwId: body.data.id },
        { status: 'SUCCESSFUL' },
      );
    }

    return { status: 'ok' };
  }
}
