export function resolvePublicBaseUrl(nodeEnv: string | undefined, backUrl?: string): string {
  const trimmed = String(backUrl || '').trim().replace(/\/$/, '');
  if (trimmed) return trimmed;
  return nodeEnv === 'production'
    ? 'https://app.digikuntz.com'
    : 'http://127.0.0.1:3002';
}

export function buildAssetImageUrl(
  nodeEnv: string | undefined,
  filename: string,
  backUrl?: string,
): string {
  const baseUrl = resolvePublicBaseUrl(nodeEnv, backUrl);
  return `${baseUrl}/assets/images/${filename}`;
}
