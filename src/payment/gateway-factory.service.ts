import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GatewayLoaderService } from './gateway-loader.service';
import { FlutterwaveService } from 'src/flutterwave/flutterwave.service';
import { PaystackService } from 'src/paystack/paystack.service';
import { MpesaService } from 'src/mpesa/mpesa.service';
import { PaymentGateway } from './interfaces/payment-gateway.interface';
import { FlutterwaveProvider } from './providers/flutterwave.provider';
import { PaystackProvider } from './providers/paystack.provider';
import { MpesaProvider } from './providers/mpesa.provider';

@Injectable()
export class GatewayFactoryService {
  private readonly logger = new Logger(GatewayFactoryService.name);

  constructor(
    private readonly gatewayLoader: GatewayLoaderService,
    private readonly flutterwaveService: FlutterwaveService,
    private readonly paystackService: PaystackService,
    private readonly mpesaService: MpesaService,
  ) {}

  private readonly providerCache = new Map<string, PaymentGateway>();

  async forCurrency(currency: string): Promise<PaymentGateway> {
    const cacheKey = currency.toUpperCase();

    if (this.providerCache.has(cacheKey)) {
      return this.providerCache.get(cacheKey)!;
    }

    let config;
    try {
      config = await this.gatewayLoader.getConfig(cacheKey);
    } catch (err) {
      throw new NotFoundException(
        `No active gateway configuration found for currency "${cacheKey}"`,
      );
    }

    const provider = this.createProvider(config.type);
    provider.setCredentials(config.credentials);

    this.providerCache.set(cacheKey, provider);
    this.logger.log(`Gateway ${config.type} loaded for currency ${cacheKey}`);

    return provider;
  }

  async reloadForCurrency(currency: string): Promise<PaymentGateway> {
    this.providerCache.delete(currency.toUpperCase());
    return this.forCurrency(currency);
  }

  private createProvider(type: string): PaymentGateway {
    switch (type) {
      case 'flutterwave':
        return new FlutterwaveProvider(this.flutterwaveService);
      case 'paystack':
        return new PaystackProvider(this.paystackService);
      case 'mpesa':
        return new MpesaProvider(this.mpesaService);
      default:
        throw new NotFoundException(`Unsupported gateway type: "${type}"`);
    }
  }
}
