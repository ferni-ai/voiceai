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
import { type EnglishAccent } from '../../config/voice-accents.js';
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
/**
 * Parse Accept-Language header into sorted array of locale strings.
 *
 * @example
 * parseAcceptLanguage("en-GB,en;q=0.9,de;q=0.7")
 * // Returns: ["en-GB", "en", "de"]
 */
export declare function parseAcceptLanguage(header: string): string[];
/**
 * Extract geo information from cloud provider headers.
 *
 * Supported providers:
 * - Google Cloud Run/App Engine: X-Appengine-Country, X-Appengine-Region, X-Appengine-City
 * - Cloudflare: CF-IPCountry, CF-IPCity
 * - AWS CloudFront: CloudFront-Viewer-Country
 * - Vercel: X-Vercel-IP-Country
 */
export declare function extractCloudGeoHeaders(req: IncomingMessage): {
    countryCode?: string;
    regionCode?: string;
    city?: string;
    source?: string;
};
/**
 * Get client IP from request headers.
 */
export declare function getClientIP(req: IncomingMessage): string;
/**
 * Lookup country from IP using free ip-api.com service.
 * Includes caching to avoid rate limiting (45 req/min on free tier).
 *
 * @param ip - IP address to lookup
 * @param timeout - Timeout in milliseconds (default: 2000)
 */
export declare function lookupIPCountry(ip: string, timeout?: number): Promise<{
    countryCode?: string;
    regionCode?: string;
    city?: string;
} | null>;
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
export declare function detectGeoFromRequest(req: IncomingMessage, options?: GeoDetectionOptions): Promise<GeoDetectionResult>;
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
export declare function buildMetadataWithGeo(req: IncomingMessage, baseMetadata: Record<string, unknown>, options?: GeoDetectionOptions): Promise<Record<string, unknown>>;
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
export declare function geoDetectionMiddleware(options?: GeoDetectionOptions): (req: IncomingMessage & {
    geoDetection?: GeoDetectionResult;
}, _res: unknown, next: () => void) => Promise<void>;
//# sourceMappingURL=geo-detection.d.ts.map