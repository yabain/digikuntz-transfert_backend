import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Gateway } from '../gateway/gateway.schema';
import { CryptService } from '../dev/crypt.service';

export interface GatewayCredentials {
  secretKey: string;
  publicKey: string;
  secretHash: string;
  [key: string]: any;
}

export interface GatewayConfig {
  _id: string;
  name: string;
  type: string;
  currency: string;
  credentials: GatewayCredentials;
}

@Injectable()
export class GatewayLoaderService {
  private readonly logger = new Logger(GatewayLoaderService.name);
  private cache: Map<string, GatewayConfig> = new Map();

  constructor(
    @InjectModel(Gateway.name) private gatewayModel: Model<Gateway>,
    private cryptService: CryptService,
  ) {}

  async getConfig(currency: string): Promise<GatewayConfig> {
    if (this.cache.has(currency)) {
      return this.cache.get(currency)!;
    }
    return this.loadAndCache(currency);
  }

  async reloadConfig(currency: string): Promise<GatewayConfig> {
    this.cache.delete(currency);
    return this.loadAndCache(currency);
  }

  async loadAllConfigs(): Promise<Map<string, GatewayConfig>> {
    const gateways = await this.gatewayModel.find({ isActive: true }).exec();
    for (const gw of gateways) {
      try {
        const config = this.toConfig(gw);
        this.cache.set(gw.currency, config);
      } catch (err) {
        this.logger.warn(`Failed to load gateway config for ${gw.currency}: ${err.message}`);
      }
    }
    this.logger.log(`Loaded ${this.cache.size} gateway configs from DB`);
    return this.cache;
  }

  private async loadAndCache(currency: string): Promise<GatewayConfig> {
    const gateway = await this.gatewayModel.findOne({ currency, isActive: true }).exec();
    if (!gateway) {
      throw new NotFoundException(`No active gateway found for currency "${currency}"`);
    }
    const config = this.toConfig(gateway);
    this.cache.set(currency, config);
    return config;
  }

  private toConfig(gateway: Gateway): GatewayConfig {
    let creds: Record<string, any> = {};
    try {
      const decrypted = this.cryptService.decryptWithPassphrase(gateway.credentials);
      creds = JSON.parse(decrypted);
    } catch {
      creds = {};
    }

    return {
      _id: String(gateway._id),
      name: gateway.name,
      type: gateway.type,
      currency: gateway.currency,
      credentials: {
        secretKey: creds.FLUTTERWAVE_SECRET_KEY || creds.PAYSTACK_SECRET_KEY || '',
        publicKey: creds.FLUTTERWAVE_PUBLIC_KEY || '',
        secretHash: creds.FLUTTERWAVE_SECRET_HASH || '',
        ...creds,
      },
    };
  }
}
