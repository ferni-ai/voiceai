/**
 * Geo Detection Service Tests
 */

import type { IncomingMessage } from 'http';
import { describe, expect, it } from 'vitest';
import {
  detectGeoFromRequest,
  extractCloudGeoHeaders,
  getClientIP,
  parseAcceptLanguage,
} from '../geo-detection.js';

// Helper to create mock request
function createMockRequest(
  headers: Record<string, string | string[] | undefined>
): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
}

describe('Geo Detection Service', () => {
  describe('parseAcceptLanguage', () => {
    it('should parse simple Accept-Language header', () => {
      const result = parseAcceptLanguage('en-US');
      expect(result).toEqual(['en-US']);
    });

    it('should parse multiple languages with quality values', () => {
      const result = parseAcceptLanguage('en-GB,en;q=0.9,de;q=0.7');
      expect(result).toEqual(['en-GB', 'en', 'de']);
    });

    it('should sort by quality value', () => {
      const result = parseAcceptLanguage('de;q=0.7,en-GB;q=1.0,en;q=0.9');
      expect(result).toEqual(['en-GB', 'en', 'de']);
    });

    it('should handle complex browser header', () => {
      const result = parseAcceptLanguage('en-AU,en-US;q=0.9,en;q=0.8');
      expect(result).toEqual(['en-AU', 'en-US', 'en']);
    });

    it('should return empty array for empty header', () => {
      expect(parseAcceptLanguage('')).toEqual([]);
      expect(parseAcceptLanguage(undefined as unknown as string)).toEqual([]);
    });
  });

  describe('extractCloudGeoHeaders', () => {
    it('should extract Google Cloud headers', () => {
      const req = createMockRequest({
        'x-appengine-country': 'GB',
        'x-appengine-region': 'eng',
        'x-appengine-city': 'london',
      });

      const result = extractCloudGeoHeaders(req);
      expect(result.countryCode).toBe('GB');
      expect(result.regionCode).toBe('eng');
      expect(result.city).toBe('london');
      expect(result.source).toBe('google-cloud');
    });

    it('should skip ZZ country code (unknown)', () => {
      const req = createMockRequest({
        'x-appengine-country': 'ZZ',
      });

      const result = extractCloudGeoHeaders(req);
      expect(result.countryCode).toBeUndefined();
    });

    it('should extract Cloudflare headers', () => {
      const req = createMockRequest({
        'cf-ipcountry': 'AU',
        'cf-ipcity': 'sydney',
      });

      const result = extractCloudGeoHeaders(req);
      expect(result.countryCode).toBe('AU');
      expect(result.city).toBe('sydney');
      expect(result.source).toBe('cloudflare');
    });

    it('should extract AWS CloudFront headers', () => {
      const req = createMockRequest({
        'cloudfront-viewer-country': 'IN',
        'cloudfront-viewer-country-region': 'MH',
        'cloudfront-viewer-city': 'mumbai',
      });

      const result = extractCloudGeoHeaders(req);
      expect(result.countryCode).toBe('IN');
      expect(result.regionCode).toBe('MH');
      expect(result.city).toBe('mumbai');
      expect(result.source).toBe('cloudfront');
    });

    it('should extract Vercel headers', () => {
      const req = createMockRequest({
        'x-vercel-ip-country': 'NZ',
      });

      const result = extractCloudGeoHeaders(req);
      expect(result.countryCode).toBe('NZ');
      expect(result.source).toBe('vercel');
    });

    it('should return empty for no cloud headers', () => {
      const req = createMockRequest({});
      const result = extractCloudGeoHeaders(req);
      expect(result.countryCode).toBeUndefined();
    });
  });

  describe('getClientIP', () => {
    it('should extract IP from x-forwarded-for', () => {
      const req = createMockRequest({
        'x-forwarded-for': '203.0.113.1, 198.51.100.1',
      });
      expect(getClientIP(req)).toBe('203.0.113.1');
    });

    it('should extract IP from x-real-ip', () => {
      const req = createMockRequest({
        'x-real-ip': '203.0.113.2',
      });
      expect(getClientIP(req)).toBe('203.0.113.2');
    });

    it('should fall back to socket remoteAddress', () => {
      const req = createMockRequest({});
      expect(getClientIP(req)).toBe('127.0.0.1');
    });
  });

  describe('detectGeoFromRequest', () => {
    it('should detect British accent from en-GB Accept-Language', async () => {
      const req = createMockRequest({
        'accept-language': 'en-GB,en;q=0.9',
      });

      const result = await detectGeoFromRequest(req);
      expect(result.accent).toBe('british');
      expect(result.confidence).toBe('high');
      expect(result.source).toBe('accept-language');
      expect(result.languages).toEqual(['en-GB', 'en']);
    });

    it('should detect Australian accent from en-AU Accept-Language', async () => {
      const req = createMockRequest({
        'accept-language': 'en-AU,en-US;q=0.9,en;q=0.8',
      });

      const result = await detectGeoFromRequest(req);
      expect(result.accent).toBe('australian');
      expect(result.confidence).toBe('high');
    });

    it('should detect Indian accent from en-IN Accept-Language', async () => {
      const req = createMockRequest({
        'accept-language': 'en-IN,hi;q=0.9,en;q=0.8',
      });

      const result = await detectGeoFromRequest(req);
      expect(result.accent).toBe('indian');
      expect(result.confidence).toBe('high');
    });

    it('should fall back to cloud header when Accept-Language is low confidence', async () => {
      const req = createMockRequest({
        'accept-language': 'en', // No region - low confidence
        'x-appengine-country': 'AU',
      });

      const result = await detectGeoFromRequest(req);
      expect(result.accent).toBe('australian');
      expect(result.source).toBe('cloud-header');
      expect(result.countryCode).toBe('AU');
    });

    it('should detect accent from country code', async () => {
      const req = createMockRequest({
        'cf-ipcountry': 'IN',
      });

      const result = await detectGeoFromRequest(req);
      expect(result.accent).toBe('indian');
      expect(result.countryCode).toBe('IN');
    });

    it('should return default American for no geo data', async () => {
      const req = createMockRequest({});

      const result = await detectGeoFromRequest(req);
      expect(result.accent).toBe('american');
      expect(result.confidence).toBe('low');
      expect(result.source).toBe('default');
    });

    it('should prioritize Accept-Language over cloud headers', async () => {
      const req = createMockRequest({
        'accept-language': 'en-GB,en;q=0.9',
        'x-appengine-country': 'US', // Different country
      });

      const result = await detectGeoFromRequest(req);
      expect(result.accent).toBe('british');
      expect(result.source).toBe('accept-language');
      // But should still include country from cloud header
      expect(result.countryCode).toBe('US');
    });
  });

  describe('Country to Accent Mapping', () => {
    const testCases: Array<{ country: string; expectedAccent: string }> = [
      // American English countries
      { country: 'US', expectedAccent: 'american' },
      { country: 'CA', expectedAccent: 'american' },
      { country: 'PH', expectedAccent: 'american' },

      // British English countries
      { country: 'GB', expectedAccent: 'british' },
      { country: 'IE', expectedAccent: 'british' },
      { country: 'ZA', expectedAccent: 'british' },
      { country: 'NG', expectedAccent: 'british' },
      { country: 'SG', expectedAccent: 'british' },

      // Australian English countries
      { country: 'AU', expectedAccent: 'australian' },
      { country: 'NZ', expectedAccent: 'australian' },

      // Indian English countries
      { country: 'IN', expectedAccent: 'indian' },
      { country: 'PK', expectedAccent: 'indian' },
      { country: 'BD', expectedAccent: 'indian' },
    ];

    it.each(testCases)(
      'should map $country to $expectedAccent accent',
      async ({ country, expectedAccent }) => {
        const req = createMockRequest({
          'cf-ipcountry': country,
        });

        const result = await detectGeoFromRequest(req);
        expect(result.accent).toBe(expectedAccent);
      }
    );
  });
});
