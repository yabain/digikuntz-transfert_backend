/**
 * L'IP appelante est un signal de sécurité : elle sert à la notation de fraude
 * Flutterwave et à la limitation de débit par IP. Deux propriétés doivent être
 * verrouillées, car une régression sur l'une ou l'autre est silencieuse :
 *
 * 1. la valeur vient de la REQUÊTE, jamais du corps envoyé par l'appelant —
 *    sinon l'attaquant choisit le champ censé l'identifier ;
 * 2. une valeur inexploitable ne doit jamais être inventée (pas de coercition,
 *    pas de chaîne vide envoyée à Flutterwave, qui rejetterait la charge).
 */
import { resolveClientIp } from './client-ip.util';

describe('resolveClientIp', () => {
  it('lit l’adresse depuis la requête', () => {
    expect(resolveClientIp({ ip: '41.202.219.7' })).toBe('41.202.219.7');
  });

  it('déplie la forme IPv6 encapsulant IPv4, que Flutterwave refuse', () => {
    expect(resolveClientIp({ ip: '::ffff:41.202.219.7' })).toBe('41.202.219.7');
  });

  it('ne déplie pas une adresse IPv6 légitime', () => {
    expect(resolveClientIp({ ip: '2001:db8::1' })).toBe('2001:db8::1');
  });

  it('ne lit JAMAIS une valeur fournie dans le corps', () => {
    // Sans cette garantie, la notation de fraude et le quota par IP seraient
    // contrôlés par l'appelant.
    expect(resolveClientIp({ body: { clientIp: '1.2.3.4' } })).toBeUndefined();

    expect(
      resolveClientIp({ body: { clientIp: '1.2.3.4' }, ip: '41.202.219.7' }),
    ).toBe('41.202.219.7');
  });

  it('renvoie undefined pour toute valeur inexploitable, sans coercition', () => {
    const unusable: unknown[] = [
      undefined,
      null,
      '41.202.219.7',
      42,
      [],
      {},
      { ip: '' },
      { ip: 123 },
      { ip: null },
      { ip: {} },
      { ip: ['41.202.219.7'] },
    ];

    for (const req of unusable) {
      expect(resolveClientIp(req)).toBeUndefined();
    }
  });
});
