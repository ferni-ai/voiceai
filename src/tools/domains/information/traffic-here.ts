/**
 * HERE geocoding and routing, the traffic fallback when Google Maps is not configured.
 *
 * @module tools/domains/information/traffic-here
 */

const HERE_API_KEY = process.env.HERE_API_KEY || '';

export async function geocodeHere(query: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({ q: query, apiKey: HERE_API_KEY });
  const url = `https://geocode.search.hereapi.com/v1/geocode?${params}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    items?: Array<{ position?: { lat?: number; lng?: number } }>;
  };
  const pos = data.items?.[0]?.position;
  if (!pos || typeof pos.lat !== 'number' || typeof pos.lng !== 'number') return null;
  return { lat: pos.lat, lng: pos.lng };
}

export async function getHereRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<{
  distanceText: string;
  durationSeconds: number;
  durationInTrafficSeconds: number;
  summary?: string;
} | null> {
  const params = new URLSearchParams({
    transportMode: 'car',
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    return: 'summary,typicalDuration',
    routingMode: 'fast',
    // enable traffic where supported
    departureTime: 'now',
    apiKey: HERE_API_KEY,
  });

  const url = `https://router.hereapi.com/v8/routes?${params}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;

  const data = (await response.json()) as {
    routes?: Array<{
      sections?: Array<{
        summary?: {
          length?: number; // meters
          duration?: number; // seconds
          baseDuration?: number; // seconds (no traffic)
          typicalDuration?: number; // seconds
        };
      }>;
    }>;
  };

  const summary = data.routes?.[0]?.sections?.[0]?.summary;
  if (!summary) return null;

  const lengthMeters = summary.length ?? 0;
  const durationSeconds = summary.baseDuration ?? summary.typicalDuration ?? summary.duration ?? 0;
  const durationInTrafficSeconds = summary.duration ?? durationSeconds;

  if (durationInTrafficSeconds <= 0) return null;

  const distanceText =
    lengthMeters > 0
      ? lengthMeters >= 1000
        ? `${(lengthMeters / 1000).toFixed(1)} km`
        : `${Math.round(lengthMeters)} m`
      : 'Unknown';

  return {
    distanceText,
    durationSeconds,
    durationInTrafficSeconds,
  };
}
