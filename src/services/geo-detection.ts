/**
 * Geo-Detection Service
 *
 * Detects user's geographic location and language preferences from HTTP headers.
 * Used for automatic accent/locale detection for voice TTS.
 *
 * Detection sources (in priority order):
 * 1. Accept-Language header (browser language preferences)
 * 2. Cloud provider headers (Google Cloud, Cloudflare)
 * 3. IP geolocation API (fallback)
 *
 * Privacy: IP addresses are not stored - only country/region is extracted.
 */

import type { IncomingMessage } from 'http';
import { detectAccentFromLocales, type EnglishAccent } from '../config/voice-accents.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'GeoDetection' });

// =============================================================================
// TYPES
// =============================================================================

export interface GeoDetectionResult {
  /** Detected country code (ISO 3166-1 alpha-2) */
  countryCode?: string;
  /** Detected region/state code */
  regionCode?: string;
  /** Detected city name */
  city?: string;
  /** Browser language preferences (from Accept-Language) */
  languages: string[];
  /** Primary language preference */
  primaryLanguage?: string;
  /** Detected English accent */
  accent: EnglishAccent;
  /** Confidence level of the detection */
  confidence: 'high' | 'medium' | 'low';
  /** Source of the detection */
  source: 'accept-language' | 'cloud-header' | 'ip-geo' | 'default';
}

export interface GeoDetectionOptions {
  /** Enable IP geolocation lookup (requires external API call) */
  enableIpLookup?: boolean;
  /** Timeout for IP lookup in milliseconds */
  ipLookupTimeout?: number;
}

// =============================================================================
// COUNTRY CODE TO ACCENT MAPPING
// =============================================================================

/**
 * Map country codes to likely English accents.
 * Used when we have country but not language preference.
 */
const COUNTRY_TO_ACCENT: Record<string, EnglishAccent> = {
  // American English
  US: 'american',
  CA: 'american', // Canada uses American pronunciation mostly
  PR: 'american', // Puerto Rico
  VI: 'american', // US Virgin Islands
  GU: 'american', // Guam
  AS: 'american', // American Samoa
  MX: 'american', // Mexico (American English influence)
  PH: 'american', // Philippines (American English influence)

  // British English
  GB: 'british',
  UK: 'british',
  IE: 'british', // Ireland
  MT: 'british', // Malta
  CY: 'british', // Cyprus
  ZA: 'british', // South Africa
  ZW: 'british', // Zimbabwe
  KE: 'british', // Kenya
  NG: 'british', // Nigeria
  GH: 'british', // Ghana
  SG: 'british', // Singapore
  HK: 'british', // Hong Kong
  MY: 'british', // Malaysia

  // Australian English
  AU: 'australian',
  NZ: 'australian', // New Zealand (similar)
  FJ: 'australian', // Fiji
  PG: 'australian', // Papua New Guinea

  // Indian English
  IN: 'indian',
  PK: 'indian', // Pakistan
  BD: 'indian', // Bangladesh
  LK: 'indian', // Sri Lanka
  NP: 'indian', // Nepal
};

// =============================================================================
// ACCEPT-LANGUAGE PARSING
// =============================================================================

/**
 * Parse Accept-Language header into sorted array of locale strings.
 *
 * @example
 * parseAcceptLanguage("en-GB,en;q=0.9,de;q=0.7")
 * // Returns: ["en-GB", "en", "de"]
 */
export function parseAcceptLanguage(header: string): string[] {
  if (!header) return [];

  try {
    return header
      .split(',')
      .map((part) => {
        const [lang, qPart] = part.trim().split(';');
        const q = qPart ? parseFloat(qPart.replace('q=', '')) : 1.0;
        return { lang: lang.trim(), q };
      })
      .sort((a, b) => b.q - a.q)
      .map((item) => item.lang)
      .filter((lang) => lang.length > 0);
  } catch {
    log.debug({ header }, 'Failed to parse Accept-Language header');
    return [];
  }
}

// =============================================================================
// CLOUD PROVIDER HEADER DETECTION
// =============================================================================

/**
 * Extract geo information from cloud provider headers.
 *
 * Supported providers:
 * - Google Cloud Run/App Engine: X-Appengine-Country, X-Appengine-Region, X-Appengine-City
 * - Cloudflare: CF-IPCountry, CF-IPCity
 * - AWS CloudFront: CloudFront-Viewer-Country
 * - Vercel: X-Vercel-IP-Country
 */
export function extractCloudGeoHeaders(req: IncomingMessage): {
  countryCode?: string;
  regionCode?: string;
  city?: string;
  source?: string;
} {
  const { headers } = req;

  // Google Cloud Run / App Engine
  const googleCountry = headers['x-appengine-country'] as string | undefined;
  if (googleCountry && googleCountry !== 'ZZ') {
    return {
      countryCode: googleCountry.toUpperCase(),
      regionCode: headers['x-appengine-region'] as string | undefined,
      city: headers['x-appengine-city'] as string | undefined,
      source: 'google-cloud',
    };
  }

  // Cloudflare
  const cfCountry = headers['cf-ipcountry'] as string | undefined;
  if (cfCountry && cfCountry !== 'XX') {
    return {
      countryCode: cfCountry.toUpperCase(),
      city: headers['cf-ipcity'] as string | undefined,
      source: 'cloudflare',
    };
  }

  // AWS CloudFront
  const awsCountry = headers['cloudfront-viewer-country'] as string | undefined;
  if (awsCountry) {
    return {
      countryCode: awsCountry.toUpperCase(),
      regionCode: headers['cloudfront-viewer-country-region'] as string | undefined,
      city: headers['cloudfront-viewer-city'] as string | undefined,
      source: 'cloudfront',
    };
  }

  // Vercel
  const vercelCountry = headers['x-vercel-ip-country'] as string | undefined;
  if (vercelCountry) {
    return {
      countryCode: vercelCountry.toUpperCase(),
      regionCode: headers['x-vercel-ip-country-region'] as string | undefined,
      city: headers['x-vercel-ip-city'] as string | undefined,
      source: 'vercel',
    };
  }

  return {};
}

// =============================================================================
// IP GEOLOCATION (FREE API)
// =============================================================================

/**
 * Get client IP from request headers.
 */
export function getClientIP(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }

  const realIP = req.headers['x-real-ip'];
  if (realIP) {
    return typeof realIP === 'string' ? realIP : realIP[0];
  }

  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Lookup country from IP using free ip-api.com service.
 * Note: Rate limited to 45 requests/minute on free tier.
 *
 * @param ip - IP address to lookup
 * @param timeout - Timeout in milliseconds (default: 2000)
 */
export async function lookupIPCountry(
  ip: string,
  timeout = 2000
): Promise<{ countryCode?: string; regionCode?: string; city?: string } | null> {
  // Skip private/local IPs
  if (
    ip === 'unknown' ||
    ip.startsWith('127.') ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('172.') ||
    ip === '::1' ||
    ip.startsWith('::ffff:127.') ||
    ip.startsWith('::ffff:10.') ||
    ip.startsWith('::ffff:192.168.')
  ) {
    log.debug({ ip }, 'Skipping IP lookup for local/private IP');
    return null;
  }

  try {
    // AbortController is a built-in global in Node.js 16+
    const controller = new globalThis.AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Using ip-api.com (free, no API key needed, 45 req/min limit)
    // Fields: countryCode, region, city
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,region,city`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      log.debug({ ip, status: response.status }, 'IP lookup returned non-OK status');
      return null;
    }

    const data = (await response.json()) as {
      countryCode?: string;
      region?: string;
      city?: string;
    };

    if (data.countryCode) {
      return {
        countryCode: data.countryCode,
        regionCode: data.region,
        city: data.city,
      };
    }

    return null;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      log.debug({ ip }, 'IP lookup timed out');
    } else {
      log.debug({ ip, error: String(err) }, 'IP lookup failed');
    }
    return null;
  }
}

// =============================================================================
// MAIN DETECTION FUNCTION
// =============================================================================

/**
 * Detect user's geographic location and accent preference from HTTP request.
 *
 * @param req - HTTP request object
 * @param options - Detection options
 * @returns Detection result with accent and metadata
 *
 * @example
 * const geo = await detectGeoFromRequest(req, { enableIpLookup: true });
 * console.log(geo.accent); // 'british'
 * console.log(geo.countryCode); // 'GB'
 */
export async function detectGeoFromRequest(
  req: IncomingMessage,
  options: GeoDetectionOptions = {}
): Promise<GeoDetectionResult> {
  const { enableIpLookup = false, ipLookupTimeout = 2000 } = options;

  // 1. Parse Accept-Language header (highest priority for language)
  const acceptLanguage = req.headers['accept-language'] as string | undefined;
  const languages = parseAcceptLanguage(acceptLanguage || '');
  const primaryLanguage = languages[0];

  // 2. Extract cloud provider geo headers
  const cloudGeo = extractCloudGeoHeaders(req);

  // 3. Try to detect accent from Accept-Language
  if (languages.length > 0) {
    const langDetection = detectAccentFromLocales(languages);

    if (langDetection.confidence === 'high' || langDetection.confidence === 'medium') {
      log.debug(
        {
          languages,
          accent: langDetection.accent,
          confidence: langDetection.confidence,
        },
        '🌍 Accent detected from Accept-Language'
      );

      return {
        countryCode: cloudGeo.countryCode,
        regionCode: cloudGeo.regionCode,
        city: cloudGeo.city,
        languages,
        primaryLanguage,
        accent: langDetection.accent,
        confidence: langDetection.confidence,
        source: 'accept-language',
      };
    }
  }

  // 4. Try to detect accent from cloud geo headers (country code)
  if (cloudGeo.countryCode) {
    const accent = COUNTRY_TO_ACCENT[cloudGeo.countryCode] || 'american';

    log.debug(
      {
        countryCode: cloudGeo.countryCode,
        accent,
        source: cloudGeo.source,
      },
      '🌍 Accent detected from cloud header'
    );

    return {
      countryCode: cloudGeo.countryCode,
      regionCode: cloudGeo.regionCode,
      city: cloudGeo.city,
      languages,
      primaryLanguage,
      accent,
      confidence: 'medium',
      source: 'cloud-header',
    };
  }

  // 5. IP geolocation lookup (if enabled)
  if (enableIpLookup) {
    const ip = getClientIP(req);
    const ipGeo = await lookupIPCountry(ip, ipLookupTimeout);

    if (ipGeo?.countryCode) {
      const accent = COUNTRY_TO_ACCENT[ipGeo.countryCode] || 'american';

      log.debug(
        {
          ip: `${ip.substring(0, 6)}...`, // Partial IP for privacy
          countryCode: ipGeo.countryCode,
          accent,
        },
        '🌍 Accent detected from IP geolocation'
      );

      return {
        countryCode: ipGeo.countryCode,
        regionCode: ipGeo.regionCode,
        city: ipGeo.city,
        languages,
        primaryLanguage,
        accent,
        confidence: 'medium',
        source: 'ip-geo',
      };
    }
  }

  // 6. Default fallback
  log.debug('🌍 Using default American accent (no geo data available)');

  return {
    languages,
    primaryLanguage,
    accent: 'american',
    confidence: 'low',
    source: 'default',
  };
}

// =============================================================================
// HELPER: BUILD METADATA WITH GEO
// =============================================================================

/**
 * Build agent dispatch metadata with geo detection.
 * Use this when creating LiveKit tokens to automatically include locale/accent info.
 *
 * @example
 * const metadata = await buildMetadataWithGeo(req, {
 *   user_name: 'Alice',
 *   persona_id: 'ferni',
 * });
 * // metadata now includes: locale, locales, detectedAccent, countryCode
 */
export async function buildMetadataWithGeo(
  req: IncomingMessage,
  baseMetadata: Record<string, unknown>,
  options: GeoDetectionOptions = {}
): Promise<Record<string, unknown>> {
  const geo = await detectGeoFromRequest(req, options);

  return {
    ...baseMetadata,
    // Primary locale for accent detection
    locale: geo.primaryLanguage || 'en-US',
    // Full language preferences (for future multilingual support)
    locales: geo.languages.length > 0 ? geo.languages : ['en-US'],
    // Pre-detected accent (voice agent can use this directly)
    detectedAccent: geo.accent,
    // Country code for analytics/personalization
    countryCode: geo.countryCode,
    // Geo detection metadata
    geoSource: geo.source,
    geoConfidence: geo.confidence,
  };
}

// =============================================================================
// EXPRESS MIDDLEWARE (for future use)
// =============================================================================

/**
 * Express middleware to attach geo detection to request.
 * Can be used if migrating to Express in the future.
 *
 * @example
 * app.use(geoDetectionMiddleware({ enableIpLookup: true }));
 * app.get('/token', (req, res) => {
 *   const accent = req.geoDetection.accent;
 * });
 */
export function geoDetectionMiddleware(options: GeoDetectionOptions = {}) {
  return async (
    req: IncomingMessage & { geoDetection?: GeoDetectionResult },
    _res: unknown,
    next: () => void
  ) => {
    req.geoDetection = await detectGeoFromRequest(req, options);
    next();
  };
}
