import * as geoip from 'geoip-lite';

export interface GeoLocation {
  country?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  location: string;
}

export function lookupIpLocation(ip?: string): GeoLocation | undefined {
  if (!ip) return undefined;
  const cleanIp = String(ip).trim();
  if (!cleanIp || cleanIp === '::1' || cleanIp === '127.0.0.1') return undefined;

  const geo = geoip.lookup(cleanIp);
  if (!geo) return undefined;

  return {
    country: geo.country,
    region: geo.region,
    city: geo.city,
    latitude: geo.ll?.[0],
    longitude: geo.ll?.[1],
    timezone: geo.timezone,
    location: [geo.city, geo.region, geo.country].filter((part) => part && part.trim()).join(', ') || 'Unknown',
  };
}
