/**
 * Unit tests for Higgs STT integration.
 *
 * Covers: isHiggsSTTEnabled, getHiggsSTTProvider (when disabled), sendUserAudioToHiggs (no-op when disabled),
 * fetchHiggsTranscriptAndBiomarkers (returns null when no provider).
 *
 * @module agents/integrations/__tests__/higgs-stt-integration.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchHiggsTranscriptAndBiomarkers,
  getHiggsSTTProvider,
  isHiggsSTTEnabled,
  sendUserAudioToHiggs,
} from '../../../speech/providers/higgs-stt-integration.js';

describe('higgs-stt-integration', () => {
  const origEnv = process.env.TTS_PROVIDER;

  afterEach(() => {
    process.env.TTS_PROVIDER = origEnv;
    vi.restoreAllMocks();
  });

  describe('isHiggsSTTEnabled', () => {
    it('returns true when TTS_PROVIDER is higgs-pipeline', () => {
      process.env.TTS_PROVIDER = 'higgs-pipeline';
      expect(isHiggsSTTEnabled()).toBe(true);
    });

    it('returns true when TTS_PROVIDER is higgs', () => {
      process.env.TTS_PROVIDER = 'higgs';
      expect(isHiggsSTTEnabled()).toBe(true);
    });

    it('returns false when TTS_PROVIDER is cartesia', () => {
      process.env.TTS_PROVIDER = 'cartesia';
      expect(isHiggsSTTEnabled()).toBe(false);
    });

    it('returns false when TTS_PROVIDER is unset', () => {
      delete process.env.TTS_PROVIDER;
      expect(isHiggsSTTEnabled()).toBe(false);
    });

    it('is case-insensitive', () => {
      process.env.TTS_PROVIDER = 'HIGGS-PIPELINE';
      expect(isHiggsSTTEnabled()).toBe(true);
    });
  });

  describe('getHiggsSTTProvider', () => {
    it('returns null when Higgs STT is not enabled', () => {
      process.env.TTS_PROVIDER = 'cartesia';
      expect(getHiggsSTTProvider()).toBe(null);
    });
  });

  describe('sendUserAudioToHiggs', () => {
    it('does not throw when Higgs is disabled (no-op)', () => {
      process.env.TTS_PROVIDER = 'cartesia';
      const frame = new Int16Array(160); // 10ms at 16k
      expect(() => sendUserAudioToHiggs(frame, 16000)).not.toThrow();
    });

    it('does not throw when given empty frame', () => {
      process.env.TTS_PROVIDER = 'higgs-pipeline';
      expect(() => sendUserAudioToHiggs(new Int16Array(0), 16000)).not.toThrow();
    });
  });

  describe('fetchHiggsTranscriptAndBiomarkers', () => {
    it('returns null when Higgs is disabled', async () => {
      process.env.TTS_PROVIDER = 'cartesia';
      const result = await fetchHiggsTranscriptAndBiomarkers();
      expect(result).toBe(null);
    });
  });
});
