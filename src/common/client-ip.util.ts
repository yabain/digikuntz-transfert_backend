/**
 * Extraction de l'IP appelante pour la notation de fraude Flutterwave.
 *
 * Centralisé parce que trois contrôleurs en ont besoin et qu'une divergence entre
 * eux affaiblirait silencieusement un signal de sécurité. Le principe est unique :
 * l'IP vient de la REQUÊTE, jamais du corps envoyé par l'appelant — sinon
 * l'attaquant choisirait le champ censé l'identifier, et la limitation de débit par
 * IP deviendrait contournable.
 *
 * `trust proxy` est activé dans `main.ts`, donc `req.ip` reflète la chaîne de
 * proxys. La forme IPv6 encapsulant l'IPv4 (`::ffff:1.2.3.4`) est dépliée car
 * Flutterwave attend une adresse simple.
 */

/**
 * Lit l'IP du client depuis la requête.
 *
 * Le paramètre est `unknown` parce que la valeur vient d'un framework non typé :
 * on vérifie la forme plutôt que de faire confiance au type.
 *
 * @param {unknown} req - Requête Express.
 * @returns {string|undefined} - Une adresse simple, ou undefined si inconnue.
 */
export function resolveClientIp(req: unknown): string | undefined {
  if (req === null || typeof req !== 'object') return undefined;

  const ip = (req as { ip?: unknown }).ip;
  if (typeof ip !== 'string' || ip.length === 0) return undefined;

  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}
