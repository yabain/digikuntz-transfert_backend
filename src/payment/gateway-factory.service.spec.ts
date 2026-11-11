/**
 * Specs de la fabrique de passerelles : le résolveur de devise doit charger le
 * provider correspondant au TYPE de passerelle active pour la devise.
 *
 * La mission porte sur les passerelles natives Cameroun : `forCurrency('XAF')`
 * doit retourner un `OrangeCmProvider`/`MtnCmProvider` selon le type chargé, et
 * charger leurs credentials via `setCredentials`.
 */
import { GatewayFactoryService } from './gateway-factory.service';
import { OrangeCmProvider } from './providers/orange-cm.provider';
import { MtnCmProvider } from './providers/mtn-cm.provider';

interface FactoryHarness {
  factory: GatewayFactoryService;
  gatewayLoader: { getConfig: jest.Mock };
  services: {
    flutterwaveService: { setCredentials: jest.Mock };
    paystackService: Record<string, never>;
    mpesaService: Record<string, never>;
    orangeCmService: { setCredentials: jest.Mock };
    mtnCmService: { setCredentials: jest.Mock };
  };
}

function build(type: string): FactoryHarness {
  const gatewayLoader = {
    getConfig: jest.fn().mockResolvedValue({
      _id: 'gw-1',
      name: `Gateway ${type}`,
      type,
      currency: 'XAF',
      credentials: { apiKey: 'credential-value' },
    }),
  };

  const services = {
    flutterwaveService: { setCredentials: jest.fn() },
    paystackService: {},
    mpesaService: {},
    orangeCmService: { setCredentials: jest.fn() },
    mtnCmService: { setCredentials: jest.fn() },
  };

  const factory = new GatewayFactoryService(
    gatewayLoader as any,
    services.flutterwaveService as any,
    services.paystackService as any,
    services.mpesaService as any,
    services.orangeCmService as any,
    services.mtnCmService as any,
  );

  return { factory, gatewayLoader, services };
}

describe('GatewayFactoryService.forCurrency', () => {
  it('retourne un OrangeCmProvider chargé pour une passerelle active orange_cm', async () => {
    const { factory, gatewayLoader, services } = build('orange_cm');

    const provider = await factory.forCurrency('XAF');

    expect(provider).toBeInstanceOf(OrangeCmProvider);
    expect(gatewayLoader.getConfig).toHaveBeenCalledWith('XAF');
    expect(services.orangeCmService.setCredentials).toHaveBeenCalledWith({
      apiKey: 'credential-value',
    });
  });

  it('retourne un MtnCmProvider chargé pour une passerelle active mtn_cm', async () => {
    const { factory, services } = build('mtn_cm');

    const provider = await factory.forCurrency('XAF');

    expect(provider).toBeInstanceOf(MtnCmProvider);
    expect(services.mtnCmService.setCredentials).toHaveBeenCalledWith({
      apiKey: 'credential-value',
    });
  });

  it('met en cache par devise (une seule résolution par devise)', async () => {
    const { factory, gatewayLoader } = build('orange_cm');

    await factory.forCurrency('XAF');
    await factory.forCurrency('xaf');

    expect(gatewayLoader.getConfig).toHaveBeenCalledTimes(1);
  });

  it('propage une erreur claire quand aucune passerelle n’est trouvée', async () => {
    const { factory, gatewayLoader } = build('orange_cm');
    gatewayLoader.getConfig.mockRejectedValue(
      new Error('No gateway found for currency "XAF"'),
    );

    await expect(factory.forCurrency('XAF')).rejects.toThrow(
      'No active gateway configuration found for currency "XAF"',
    );
  });
});