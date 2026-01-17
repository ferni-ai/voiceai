/**
 * Geo Detection Service Tests
 *
 * Tests for geographic location and accent detection from HTTP headers.
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { IncomingMessage } from 'http';
import {
  parseAcceptLanguage,
  extractCloudGeoHeaders,
  getClientIP,
  lookupIPCountry,
  detectGeoFromRequest,
  buildMetadataWithGeo,
} from '../geo-detection.js';

// Mock fetch for IP lookup tests
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/**
 * Create a mock IncomingMessage with specified headers
 */
function createMockRequest(
  headers: Record<string, string | string[] | undefined>
): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress: '192.168.1.1' },
  } as unknown as IncomingMessage;
}

describe('GeoDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear any environment overrides
    delete process.env.DEV_GEO_LOCATION;
  });

  // ===========================================================================
  // parseAcceptLanguage
  // ===========================================================================
  describe('parseAcceptLanguage', () => {
    it('should parse simple Accept-Language header', () => {
      const result = parseAcceptLanguage('en-US');
      expect(result).toEqual(['en-US']);
    });

    it('should parse multiple languages with quality values', () => {
      const result = parseAcceptLanguage('en-GB,en;q=0.9,de;q=0.7');
      expect(result).toEqual(['en-GB', 'en', 'de']);
    });

    it('should sort by quality value (highest first)', () => {
      const result = parseAcceptLanguage('de;q=0.5,en-US;q=1.0,fr;q=0.7');
      expect(result).toEqual(['en-US', 'fr', 'de']);
    });

    it('should handle languages without quality (default q=1.0)', () => {
      const result = parseAcceptLanguage('en-US,fr;q=0.8');
      expect(result).toEqual(['en-US', 'fr']);
    });

    it('should return empty array for empty header', () => {
      const result = parseAcceptLanguage('');
      expect(result).toEqual([]);
    });

    it('should handle malformed header gracefully', () => {
      const result = parseAcceptLanguage(';;;');
      expect(result).toEqual([]);
    });

    it('should trim whitespace from language codes', () => {
      const result = parseAcceptLanguage('  en-US  ,  fr  ');
      expect(result).toEqual(['en-US', 'fr']);
    });

    it('should handle complex real-world Accept-Language header', () => {
      const result = parseAcceptLanguage('en-AU,en;q=0.9,en-US;q=0.8,en-GB;q=0.7');
      expect(result[0]).toBe('en-AU');
      expect(result).toContain('en');
      expect(result).toContain('en-US');
      expect(result).toContain('en-GB');
    });
  });

  // ===========================================================================
  // extractCloudGeoHeaders
  // ===========================================================================
  describe('extractCloudGeoHeaders', () => {
    it('should extract Google Cloud headers', () => {
      const req = createMockRequest({
        'x-appengine-country': 'US',
        'x-appengine-region': 'ca',
        'x-appengine-city': 'san francisco',
      });

      const result = extractCloudGeoHeaders(req);
      expect(result).toEqual({
        countryCode: 'US',
        regionCode: 'ca',
        city: 'san francisco',
        source: 'google-cloud',
      });
    });

    it('should skip Google Cloud ZZ (unknown) country', () => {
      const req = createMockRequest({
        'x-appengine-country': 'ZZ',
      });

      const result = extractCloudGeoHeaders(req);
      expect(result).toEqual({});
    });

    it('should extract Cloudflare headers', () => {
      const req = createMockRequest({
        'cf-ipcountry': 'gb',
        'cf-ipcity': 'London',
      });

      const result = extractCloudGeoHeaders(req);
      expect(result).toEqual({
        countryCode: 'GB',
        city: 'London',
        source: 'cloudflare',
      });
    });

    it('should skip Cloudflare XX (unknown) country', () => {
      const req = createMockRequest({
        'cf-ipcountry': 'XX',
      });

      const result = extractCloudGeoHeaders(req);
      expect(result).toEqual({});
    });

    it('should extract AWS CloudFront headers', () => {
      const req = createMockRequest({
        'cloudfront-viewer-country': 'AU',
        'cloudfront-viewer-country-region': 'NSW',
        'cloudfront-viewer-city': 'Sydney',
      });

      const result = extractCloudGeoHeaders(req);
      expect(result).toEqual({
        countryCode: 'AU',
        regionCode: 'NSW',
        city: 'Sydney',
        source: 'cloudfront',
      });
    });

    it('should extract Vercel headers', () => {
      const req = createMockRequest({
        'x-vercel-ip-country': 'DE',
        'x-vercel-ip-country-region': 'BE',
        'x-vercel-ip-city': 'Berlin',
      });

      const result = extractCloudGeoHeaders(req);
      expect(result).toEqual({
        countryCode: 'DE',
        regionCode: 'BE',
        city: 'Berlin',
        source: 'vercel',
      });
    });

    it('should return empty object when no cloud headers present', () => {
      const req = createMockRequest({});
      const result = extractCloudGeoHeaders(req);
      expect(result).toEqual({});
    });

    it('should prioritize Google Cloud over other providers', () => {
      const req = createMockRequest({
        'x-appengine-country': 'US',
        'cf-ipcountry': 'GB',
      });

      const result = extractCloudGeoHeaders(req);
      expect(result.countryCode).toBe('US');
      expect(result.source).toBe('google-cloud');
    });
  });

  // ===========================================================================
  // getClientIP
  // ===========================================================================
  describe('getClientIP', () => {
    it('should extract IP from X-Forwarded-For header (single IP)', () => {
      const req = createMockRequest({
        'x-forwarded-for': '203.0.113.50',
      });

      const result = getClientIP(req);
      expect(result).toBe('203.0.113.50');
    });

    it('should extract first IP from X-Forwarded-For chain', () => {
      const req = createMockRequest({
        'x-forwarded-for': '203.0.113.50, 198.51.100.1, 192.0.2.1',
      });

      const result = getClientIP(req);
      expect(result).toBe('203.0.113.50');
    });

    it('should use X-Real-IP as fallback', () => {
      const req = createMockRequest({
        'x-real-ip': '203.0.113.100',
      });

      const result = getClientIP(req);
      expect(result).toBe('203.0.113.100');
    });

    it('should fall back to socket remote address', () => {
      const req = createMockRequest({});
      const result = getClientIP(req);
      expect(result).toBe('192.168.1.1');
    });

    it('should return "unknown" when no IP available', () => {
      const req = {
        headers: {},
        socket: {},
      } as unknown as IncomingMessage;

      const result = getClientIP(req);
      expect(result).toBe('unknown');
    });
  });

  // ===========================================================================
  // lookupIPCountry
  // ===========================================================================
  describe('lookupIPCountry', () => {
    // Use unique IPs for each test to avoid cache conflicts
    let testIpCounter = 1;
    const getUniqueIP = () => `203.0.${Math.floor(testIpCounter / 256)}.${testIpCounter++ % 256}`;

    it('should skip private IP addresses', async () => {
      const result = await lookupIPCountry('192.168.1.1');
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip localhost', async () => {
      const result = await lookupIPCountry('127.0.0.1');
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip IPv6 localhost', async () => {
      const result = await lookupIPCountry('::1');
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should skip unknown IP', async () => {
      const result = await lookupIPCountry('unknown');
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return country data from successful lookup', async () => {
      const testIP = getUniqueIP();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          countryCode: 'US',
          region: 'CA',
          city: 'Los Angeles',
        }),
      });

      const result = await lookupIPCountry(testIP);
      expect(result).toEqual({
        countryCode: 'US',
        regionCode: 'CA',
        city: 'Los Angeles',
      });
    });

    it('should handle API failure response', async () => {
      const testIP = getUniqueIP();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'fail',
          message: 'invalid query',
        }),
      });

      const result = await lookupIPCountry(testIP);
      expect(result).toBeNull();
    });

    it('should handle HTTP error', async () => {
      const testIP = getUniqueIP();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
      });

      const result = await lookupIPCountry(testIP);
      expect(result).toBeNull();
    });

    it('should handle network error', async () => {
      const testIP = getUniqueIP();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await lookupIPCountry(testIP);
      expect(result).toBeNull();
    });

    it('should cache successful lookups', async () => {
      const testIP = getUniqueIP();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          countryCode: 'GB',
          city: 'London',
        }),
      });

      // First call - hits API
      const callCountBefore = mockFetch.mock.calls.length;
      await lookupIPCountry(testIP);
      expect(mockFetch).toHaveBeenCalledTimes(callCountBefore + 1);

      // Second call - should use cache
      const result = await lookupIPCountry(testIP);
      expect(mockFetch).toHaveBeenCalledTimes(callCountBefore + 1); // Not called again
      expect(result?.countryCode).toBe('GB');
    });
  });

  // ===========================================================================
  // detectGeoFromRequest
  // ===========================================================================
  describe('detectGeoFromRequest', () => {
    it('should detect accent from Accept-Language with en-GB', async () => {
      const req = createMockRequest({
        'accept-language': 'en-GB,en;q=0.9',
      });

      const result = await detectGeoFromRequest(req);
      expect(result.accent).toBe('british');
      expect(result.source).toBe('accept-language');
      expect(result.languages).toContain('en-GB');
    });

    it('should detect accent from Accept-Language with en-AU', async () => {
      const req = createMockRequest({
        'accept-language': 'en-AU,en;q=0.8',
      });

      const result = await detectGeoFromRequest(req);
      expect(result.accent).toBe('australian');
      expect(result.source).toBe('accept-language');
    });

    it('should detect accent from cloud header country code', async () => {
      const req = createMockRequest({
        'x-appengine-country': 'IN',
        'accept-language': 'en', // No region specified
      });

      const result = await detectGeoFromRequest(req);
      expect(result.accent).toBe('indian');
      expect(result.countryCode).toBe('IN');
    });

    it('should fall back to american accent when no detection', async () => {
      const req = createMockRequest({});

      const result = await detectGeoFromRequest(req);
      expect(result.accent).toBe('american');
      expect(result.confidence).toBe('low');
      expect(result.source).toBe('default');
    });

    it('should use DEV_GEO_LOCATION override in development', async () => {
      process.env.DEV_GEO_LOCATION = 'London,Greater London,GB';
      process.env.NODE_ENV = 'development';

      const req = createMockRequest({});

      const result = await detectGeoFromRequest(req);
      expect(result.city).toBe('London');
      expect(result.countryCode).toBe('GB');
      expect(result.accent).toBe('british');
    });

    it('should include city and region from cloud headers', async () => {
      const req = createMockRequest({
        'accept-language': 'en-US',
        'x-appengine-country': 'US',
        'x-appengine-region': 'CA',
        'x-appengine-city': 'San Francisco',
      });

      const result = await detectGeoFromRequest(req);
      expect(result.city).toBe('San Francisco');
      expect(result.regionCode).toBe('CA');
      expect(result.countryCode).toBe('US');
    });
  });

  // ===========================================================================
  // buildMetadataWithGeo
  // ===========================================================================
  describe('buildMetadataWithGeo', () => {
    it('should merge geo data with base metadata', async () => {
      const req = createMockRequest({
        'accept-language': 'en-GB,en;q=0.9',
        'x-appengine-country': 'GB',
      });

      const baseMetadata = {
        user_name: 'Alice',
        persona_id: 'ferni',
      };

      const result = await buildMetadataWithGeo(req, baseMetadata);

      expect(result.user_name).toBe('Alice');
      expect(result.persona_id).toBe('ferni');
      expect(result.locale).toBe('en-GB');
      expect(result.detectedAccent).toBe('british');
      expect(result.countryCode).toBe('GB');
      expect(result.geoSource).toBe('accept-language');
    });

    it('should use default locale when no Accept-Language', async () => {
      const req = createMockRequest({});

      const result = await buildMetadataWithGeo(req, {});

      expect(result.locale).toBe('en-US');
      expect(result.locales).toEqual(['en-US']);
      expect(result.detectedAccent).toBe('american');
    });

    it('should preserve all base metadata fields', async () => {
      const req = createMockRequest({});

      const baseMetadata = {
        custom_field: 'value',
        nested: { key: 'value' },
        array: [1, 2, 3],
      };

      const result = await buildMetadataWithGeo(req, baseMetadata);

      expect(result.custom_field).toBe('value');
      expect(result.nested).toEqual({ key: 'value' });
      expect(result.array).toEqual([1, 2, 3]);
    });
  });
});
