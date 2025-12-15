/**
 * Voice IDs Tests
 *
 * Tests for voice ID constants and lookup functions.
 *
 * @module @ferni/config/__tests__/voice-ids
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getVoiceIdForPersona,
  isValidVoiceId,
  VOICE_IDS,
} from '../voice-ids.js';

describe('Voice IDs', () => {
  // Store original env vars to restore after each test
  const originalEnv: Record<string, string | undefined> = {};
  const voiceEnvVars = [
    'FERNI_VOICE_ID',
    'JACK_B_VOICE_ID',
    'PETER_JOHN_VOICE_ID',
    'JACK_BOGLE_VOICE_ID',
    'ALEX_CHEN_VOICE_ID',
    'COMM_SPECIALIST_VOICE_ID',
    'MAYA_SANTOS_VOICE_ID',
    'SPEND_SAVE_VOICE_ID',
    'JORDAN_TAYLOR_VOICE_ID',
    'EVENT_PLANNER_VOICE_ID',
    'NAYAN_PATEL_VOICE_ID',
    'NAYAN_VOICE_ID',
    'PETER_LYNCH_VOICE_ID',
    'GENERIC_ADVISOR_VOICE_ID',
  ];

  beforeEach(() => {
    // Save and clear all voice env vars for true isolation
    for (const key of voiceEnvVars) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    // Restore original env vars
    for (const key of voiceEnvVars) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  describe('VOICE_IDS constants', () => {
    it('should have Ferni voice ID', () => {
      expect(VOICE_IDS.FERNI).toBeDefined();
      expect(isValidVoiceId(VOICE_IDS.FERNI)).toBe(true);
    });

    it('should have Peter John voice ID', () => {
      expect(VOICE_IDS.PETER_JOHN).toBeDefined();
      expect(isValidVoiceId(VOICE_IDS.PETER_JOHN)).toBe(true);
    });

    it('should have Alex Chen voice ID', () => {
      expect(VOICE_IDS.ALEX_CHEN).toBeDefined();
      expect(isValidVoiceId(VOICE_IDS.ALEX_CHEN)).toBe(true);
    });

    it('should have Maya Santos voice ID', () => {
      expect(VOICE_IDS.MAYA_SANTOS).toBeDefined();
      expect(isValidVoiceId(VOICE_IDS.MAYA_SANTOS)).toBe(true);
    });

    it('should have Jordan Taylor voice ID', () => {
      expect(VOICE_IDS.JORDAN_TAYLOR).toBeDefined();
      expect(isValidVoiceId(VOICE_IDS.JORDAN_TAYLOR)).toBe(true);
    });

    it('should have Nayan Patel voice ID', () => {
      expect(VOICE_IDS.NAYAN_PATEL).toBeDefined();
      expect(isValidVoiceId(VOICE_IDS.NAYAN_PATEL)).toBe(true);
    });

    it('should have generic voice ID', () => {
      expect(VOICE_IDS.GENERIC).toBeDefined();
      expect(isValidVoiceId(VOICE_IDS.GENERIC)).toBe(true);
    });

    it('all voice IDs should be unique', () => {
      const ids = Object.values(VOICE_IDS);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('isValidVoiceId', () => {
    it('should return true for valid UUID format', () => {
      expect(isValidVoiceId('fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc')).toBe(true);
      expect(isValidVoiceId('3f04e815-3260-4f50-8fd9-af9c657be4c2')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidVoiceId('')).toBe(false);
      expect(isValidVoiceId('not-a-uuid')).toBe(false);
      expect(isValidVoiceId('123')).toBe(false);
      expect(isValidVoiceId('fdeb5d75-4f2e-4224-9e98')).toBe(false); // Too short
    });

    it('should return false for null/undefined', () => {
      expect(isValidVoiceId(null as unknown as string)).toBe(false);
      expect(isValidVoiceId(undefined as unknown as string)).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isValidVoiceId('FDEB5D75-4F2E-4224-9E98-6AA6AA1188BC')).toBe(true);
      expect(isValidVoiceId('Fdeb5d75-4f2E-4224-9e98-6aa6AA1188BC')).toBe(true);
    });
  });

  describe('getVoiceIdForPersona', () => {
    describe('canonical persona names', () => {
      it('should return Ferni voice ID', () => {
        expect(getVoiceIdForPersona('ferni')).toBe(VOICE_IDS.FERNI);
      });

      it('should return Peter John voice ID', () => {
        expect(getVoiceIdForPersona('peter-john')).toBe(VOICE_IDS.PETER_JOHN);
      });

      it('should return Alex Chen voice ID', () => {
        expect(getVoiceIdForPersona('alex-chen')).toBe(VOICE_IDS.ALEX_CHEN);
      });

      it('should return Maya Santos voice ID', () => {
        expect(getVoiceIdForPersona('maya-santos')).toBe(VOICE_IDS.MAYA_SANTOS);
      });

      it('should return Jordan Taylor voice ID', () => {
        expect(getVoiceIdForPersona('jordan-taylor')).toBe(VOICE_IDS.JORDAN_TAYLOR);
      });

      it('should return Nayan Patel voice ID', () => {
        expect(getVoiceIdForPersona('nayan-patel')).toBe(VOICE_IDS.NAYAN_PATEL);
      });
    });

    describe('persona aliases', () => {
      it('should support Ferni aliases', () => {
        expect(getVoiceIdForPersona('coach')).toBe(VOICE_IDS.FERNI);
        expect(getVoiceIdForPersona('life-coach')).toBe(VOICE_IDS.FERNI);
        expect(getVoiceIdForPersona('jack-b')).toBe(VOICE_IDS.FERNI); // Legacy
      });

      it('should support Peter John aliases', () => {
        expect(getVoiceIdForPersona('peter')).toBe(VOICE_IDS.PETER_JOHN);
        expect(getVoiceIdForPersona('john')).toBe(VOICE_IDS.PETER_JOHN);
      });

      it('should support Alex Chen aliases', () => {
        expect(getVoiceIdForPersona('alex')).toBe(VOICE_IDS.ALEX_CHEN);
        expect(getVoiceIdForPersona('comm-specialist')).toBe(VOICE_IDS.ALEX_CHEN);
      });

      it('should support Maya Santos aliases', () => {
        expect(getVoiceIdForPersona('maya')).toBe(VOICE_IDS.MAYA_SANTOS);
        expect(getVoiceIdForPersona('spend-save')).toBe(VOICE_IDS.MAYA_SANTOS);
      });

      it('should support Jordan Taylor aliases', () => {
        expect(getVoiceIdForPersona('jordan')).toBe(VOICE_IDS.JORDAN_TAYLOR);
        expect(getVoiceIdForPersona('event-planner')).toBe(VOICE_IDS.JORDAN_TAYLOR);
      });

      it('should support Nayan Patel aliases', () => {
        expect(getVoiceIdForPersona('nayan')).toBe(VOICE_IDS.NAYAN_PATEL);
        expect(getVoiceIdForPersona('patel')).toBe(VOICE_IDS.NAYAN_PATEL);
        expect(getVoiceIdForPersona('guru')).toBe(VOICE_IDS.NAYAN_PATEL);
        expect(getVoiceIdForPersona('mystic')).toBe(VOICE_IDS.NAYAN_PATEL);
        expect(getVoiceIdForPersona('lifetime-advisor')).toBe(VOICE_IDS.NAYAN_PATEL);
      });

      it('should support generic advisor', () => {
        expect(getVoiceIdForPersona('generic-advisor')).toBe(VOICE_IDS.GENERIC);
      });
    });

    describe('case insensitivity', () => {
      it('should normalize persona IDs to lowercase', () => {
        expect(getVoiceIdForPersona('FERNI')).toBe(VOICE_IDS.FERNI);
        expect(getVoiceIdForPersona('Ferni')).toBe(VOICE_IDS.FERNI);
        expect(getVoiceIdForPersona('Peter-John')).toBe(VOICE_IDS.PETER_JOHN);
      });
    });

    describe('fallback behavior', () => {
      it('should fall back to Ferni for unknown persona', () => {
        expect(getVoiceIdForPersona('unknown-persona')).toBe(VOICE_IDS.FERNI);
        expect(getVoiceIdForPersona('')).toBe(VOICE_IDS.FERNI);
      });
    });

    describe('environment variable overrides', () => {
      it('should use FERNI_VOICE_ID env var when set', () => {
        const customId = '11111111-1111-1111-1111-111111111111';
        vi.stubEnv('FERNI_VOICE_ID', customId);
        expect(getVoiceIdForPersona('ferni')).toBe(customId);
      });

      it('should use legacy JACK_B_VOICE_ID as fallback for Ferni', () => {
        const customId = '22222222-2222-2222-2222-222222222222';
        vi.stubEnv('JACK_B_VOICE_ID', customId);
        expect(getVoiceIdForPersona('ferni')).toBe(customId);
      });

      it('should use PETER_JOHN_VOICE_ID env var when set', () => {
        const customId = '33333333-3333-3333-3333-333333333333';
        vi.stubEnv('PETER_JOHN_VOICE_ID', customId);
        expect(getVoiceIdForPersona('peter-john')).toBe(customId);
      });

      it('should use ALEX_CHEN_VOICE_ID env var when set', () => {
        const customId = '44444444-4444-4444-4444-444444444444';
        vi.stubEnv('ALEX_CHEN_VOICE_ID', customId);
        expect(getVoiceIdForPersona('alex-chen')).toBe(customId);
      });

      it('should use MAYA_SANTOS_VOICE_ID env var when set', () => {
        const customId = '55555555-5555-5555-5555-555555555555';
        vi.stubEnv('MAYA_SANTOS_VOICE_ID', customId);
        expect(getVoiceIdForPersona('maya-santos')).toBe(customId);
      });

      it('should use JORDAN_TAYLOR_VOICE_ID env var when set', () => {
        const customId = '66666666-6666-6666-6666-666666666666';
        vi.stubEnv('JORDAN_TAYLOR_VOICE_ID', customId);
        expect(getVoiceIdForPersona('jordan-taylor')).toBe(customId);
      });

      it('should use NAYAN_PATEL_VOICE_ID env var when set', () => {
        const customId = '77777777-7777-7777-7777-777777777777';
        vi.stubEnv('NAYAN_PATEL_VOICE_ID', customId);
        expect(getVoiceIdForPersona('nayan-patel')).toBe(customId);
      });

      it('should prefer canonical env var over legacy', () => {
        const canonical = '88888888-8888-8888-8888-888888888888';
        const legacy = '99999999-9999-9999-9999-999999999999';
        vi.stubEnv('FERNI_VOICE_ID', canonical);
        vi.stubEnv('JACK_B_VOICE_ID', legacy);
        expect(getVoiceIdForPersona('ferni')).toBe(canonical);
      });
    });
  });

  describe('Team Persona Voice Consistency', () => {
    // Ensure all team members have distinct voices

    it('Ferni and Peter John should have different voices', () => {
      expect(getVoiceIdForPersona('ferni')).not.toBe(
        getVoiceIdForPersona('peter-john')
      );
    });

    it('each team member should have unique voice', () => {
      const teamVoices = [
        getVoiceIdForPersona('ferni'),
        getVoiceIdForPersona('peter-john'),
        getVoiceIdForPersona('alex-chen'),
        getVoiceIdForPersona('maya-santos'),
        getVoiceIdForPersona('jordan-taylor'),
        getVoiceIdForPersona('nayan-patel'),
      ];

      const uniqueVoices = new Set(teamVoices);
      expect(uniqueVoices.size).toBe(teamVoices.length);
    });
  });
});

