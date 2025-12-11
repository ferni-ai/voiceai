/**
 * International Accent Support - Integration Tests
 *
 * Tests the complete flow from geo detection → voice localization → TTS creation.
 * This validates that all components work together correctly.
 */

import type { IncomingMessage } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch for Cartesia API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock environment
vi.stubEnv('CARTESIA_API_KEY', 'test-api-key');

// Mock voice-ids
vi.mock('../config/voice-ids.js', () => ({
  VOICE_IDS: { FERNI: 'ferni-original-voice-id' },
  getVoiceIdForPersona: vi.fn(() => 'ferni-original-voice-id'),
}));

// Mock logger
vi.mock('../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocks
import { detectAccentFromLocale, detectAccentFromLocales } from '../config/voice-accents.js';
import {
  clearLocalizationCache,
  getLocalizedVoiceId,
} from '../services/cartesia-voice-localization.js';
import { detectGeoFromRequest } from '../services/geo-detection.js';

// Helper to create mock HTTP request
function createMockRequest(
  headers: Record<string, string | string[] | undefined>
): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as IncomingMessage;
}

describe('International Accent Integration', () => {
  beforeEach(() => {
    clearLocalizationCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('E2E Flow: HTTP Request → Geo Detection → Voice Localization', () => {
    it('should detect British accent from Accept-Language and get localized voice', async () => {
      // Step 1: Simulate HTTP request with British locale
      const req = createMockRequest({
        'accept-language': 'en-GB,en;q=0.9',
      });

      // Step 2: Detect geo/accent from request
      const geoResult = await detectGeoFromRequest(req);
      expect(geoResult.accent).toBe('british');
      expect(geoResult.confidence).toBe('high');

      // Step 3: Mock Cartesia API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'localized-british-ferni-voice',
          name: 'Ferni (british)',
          description: 'British accent Ferni',
          language: 'en',
          created_at: new Date().toISOString(),
        }),
      });

      // Step 4: Get localized voice
      const voiceResult = await getLocalizedVoiceId('ferni', geoResult.accent);
      expect(voiceResult.voiceId).toBe('localized-british-ferni-voice');
      expect(voiceResult.isLocalized).toBe(true);

      // Verify API was called with correct dialect
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.dialect).toBe('uk');
    });

    it('should detect Australian accent from cloud header and get localized voice', async () => {
      // Step 1: Simulate request with Google Cloud header
      const req = createMockRequest({
        'x-appengine-country': 'AU',
      });

      // Step 2: Detect geo/accent
      const geoResult = await detectGeoFromRequest(req);
      expect(geoResult.accent).toBe('australian');
      expect(geoResult.source).toBe('cloud-header');

      // Step 3: Mock Cartesia API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'localized-australian-ferni-voice',
          name: 'Ferni (australian)',
          description: 'Australian accent Ferni',
          language: 'en',
          created_at: new Date().toISOString(),
        }),
      });

      // Step 4: Get localized voice
      const voiceResult = await getLocalizedVoiceId('ferni', geoResult.accent);
      expect(voiceResult.voiceId).toBe('localized-australian-ferni-voice');

      // Verify dialect
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.dialect).toBe('au');
    });

    it('should detect Indian accent and get localized voice', async () => {
      const req = createMockRequest({
        'accept-language': 'en-IN,hi;q=0.9,en;q=0.8',
      });

      const geoResult = await detectGeoFromRequest(req);
      expect(geoResult.accent).toBe('indian');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'localized-indian-ferni-voice',
          name: 'Ferni (indian)',
          description: 'Indian accent Ferni',
          language: 'en',
          created_at: new Date().toISOString(),
        }),
      });

      const voiceResult = await getLocalizedVoiceId('ferni', geoResult.accent);
      expect(voiceResult.voiceId).toBe('localized-indian-ferni-voice');

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.dialect).toBe('in');
    });

    it('should use original voice for American accent (no API call)', async () => {
      const req = createMockRequest({
        'accept-language': 'en-US,en;q=0.9',
      });

      const geoResult = await detectGeoFromRequest(req);
      expect(geoResult.accent).toBe('american');

      const voiceResult = await getLocalizedVoiceId('ferni', geoResult.accent);
      expect(voiceResult.voiceId).toBe('ferni-original-voice-id');
      expect(voiceResult.isLocalized).toBe(false);

      // Should NOT call Cartesia API for American accent
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fall back gracefully on API error', async () => {
      const req = createMockRequest({
        'accept-language': 'en-GB',
      });

      const geoResult = await detectGeoFromRequest(req);
      expect(geoResult.accent).toBe('british');

      // Simulate API error
      mockFetch.mockRejectedValueOnce(new Error('Cartesia API unavailable'));

      const voiceResult = await getLocalizedVoiceId('ferni', geoResult.accent);

      // Should fall back to original voice
      expect(voiceResult.voiceId).toBe('ferni-original-voice-id');
      expect(voiceResult.isLocalized).toBe(false);
    });
  });

  describe('Locale Detection Accuracy', () => {
    const testCases = [
      { locale: 'en-US', expected: 'american' },
      { locale: 'en-GB', expected: 'british' },
      { locale: 'en-AU', expected: 'australian' },
      { locale: 'en-NZ', expected: 'australian' }, // NZ → Australian (similar)
      { locale: 'en-IN', expected: 'indian' },
      { locale: 'en-CA', expected: 'american' }, // Canada → American
      { locale: 'en-IE', expected: 'british' }, // Ireland → British
      { locale: 'en-ZA', expected: 'british' }, // South Africa → British
      { locale: 'en-SG', expected: 'british' }, // Singapore → British
      { locale: 'en-PH', expected: 'american' }, // Philippines → American
    ];

    it.each(testCases)('should detect $locale as $expected accent', ({ locale, expected }) => {
      const result = detectAccentFromLocale(locale);
      expect(result.accent).toBe(expected);
    });
  });

  describe('Browser Locales Array', () => {
    it('should prioritize first matching locale', () => {
      const locales = ['en-AU', 'en-US', 'en'];
      const result = detectAccentFromLocales(locales);
      expect(result.accent).toBe('australian');
    });

    it('should find best match in mixed locales', () => {
      const locales = ['fr-FR', 'en-GB', 'de-DE'];
      const result = detectAccentFromLocales(locales);
      expect(result.accent).toBe('british');
    });
  });

  describe('Token Metadata Format', () => {
    it('should produce correct metadata structure for agent dispatch', async () => {
      const req = createMockRequest({
        'accept-language': 'en-GB,en;q=0.9',
      });

      const geoResult = await detectGeoFromRequest(req);

      // This is the metadata format sent to the agent
      const metadata = {
        user_name: 'Test User',
        persona_id: 'ferni',
        locale: geoResult.primaryLanguage || 'en-US',
        locales: geoResult.languages,
        preferredAccent: geoResult.accent,
        countryCode: geoResult.countryCode,
      };

      expect(metadata.preferredAccent).toBe('british');
      expect(metadata.locales).toContain('en-GB');
    });
  });
});
