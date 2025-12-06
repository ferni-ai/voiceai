/**
 * Handoff Validation Tests
 *
 * These tests ensure the handoff system works correctly by validating:
 * 1. ID mappings are consistent across all files
 * 2. All aliases resolve to correct canonical IDs
 * 3. Frontend ↔ Backend ID conversion works both ways
 * 4. Voice IDs are correctly mapped
 * 5. Handoff tools use consistent IDs
 */

import { describe, it, expect } from 'vitest';
// All persona-related imports from central module
import {
  CANONICAL_IDS,
  ALL_CANONICAL_IDS,
  ALIAS_TO_CANONICAL,
  CANONICAL_TO_FRONTEND,
  FRONTEND_TO_CANONICAL,
  toCanonical,
  toFrontend,
  fromFrontend,
  isCanonicalId,
  isSamePersona,
  isCoach,
  isTeamMember,
  getVoiceId,
  getCanonicalPersonaId,
  getFrontendPersonaId,
  getPersonaDisplayName as getDisplayName,
} from '../personas/index.js';

describe('Persona ID System', () => {
  describe('Canonical IDs', () => {
    it('should have exactly 6 canonical personas', () => {
      expect(ALL_CANONICAL_IDS).toHaveLength(6);
    });

    it('should include all expected personas', () => {
      expect(ALL_CANONICAL_IDS).toContain('ferni');
      expect(ALL_CANONICAL_IDS).toContain('nayan-patel');
      expect(ALL_CANONICAL_IDS).toContain('peter-john');
      expect(ALL_CANONICAL_IDS).toContain('alex-chen');
      expect(ALL_CANONICAL_IDS).toContain('maya-santos');
      expect(ALL_CANONICAL_IDS).toContain('jordan-taylor');
    });

    it('should validate canonical IDs correctly', () => {
      expect(isCanonicalId('ferni')).toBe(true);
      expect(isCanonicalId('nayan-patel')).toBe(true);
      expect(isCanonicalId('jack-b')).toBe(false); // Frontend ID, not canonical
      expect(isCanonicalId('comm-specialist')).toBe(false);
    });
  });

  describe('Alias Resolution', () => {
    it('should resolve Ferni aliases', () => {
      expect(toCanonical('ferni')).toBe('ferni');
      expect(toCanonical('jack-b')).toBe('ferni');
      expect(toCanonical('coach')).toBe('ferni');
      expect(toCanonical('life-coach')).toBe('ferni');
    });

    it('should resolve Nayan Patel aliases', () => {
      expect(toCanonical('nayan-patel')).toBe('nayan-patel');
      expect(toCanonical('nayan')).toBe('nayan-patel');
      expect(toCanonical('patel')).toBe('nayan-patel');
      expect(toCanonical('sage')).toBe('nayan-patel');
    });

    it('should resolve Peter John aliases', () => {
      expect(toCanonical('peter-john')).toBe('peter-john');
      expect(toCanonical('peter')).toBe('peter-john');
      expect(toCanonical('researcher')).toBe('peter-john');
    });

    it('should resolve Alex Chen aliases', () => {
      expect(toCanonical('alex-chen')).toBe('alex-chen');
      expect(toCanonical('alex')).toBe('alex-chen');
      expect(toCanonical('comm-specialist')).toBe('alex-chen');
      expect(toCanonical('communicator')).toBe('alex-chen');
    });

    it('should resolve Maya Santos aliases', () => {
      expect(toCanonical('maya-santos')).toBe('maya-santos');
      expect(toCanonical('maya')).toBe('maya-santos');
      expect(toCanonical('spend-save')).toBe('maya-santos');
      expect(toCanonical('budget')).toBe('maya-santos');
    });

    it('should resolve Jordan Taylor aliases', () => {
      expect(toCanonical('jordan-taylor')).toBe('jordan-taylor');
      expect(toCanonical('jordan')).toBe('jordan-taylor');
      expect(toCanonical('event-planner')).toBe('jordan-taylor');
      expect(toCanonical('planner')).toBe('jordan-taylor');
    });

    it('should be case-insensitive', () => {
      expect(toCanonical('FERNI')).toBe('ferni');
      expect(toCanonical('NAYAN-PATEL')).toBe('nayan-patel');
      expect(toCanonical('PETER-JOHN')).toBe('peter-john');
    });
  });

  describe('Frontend ↔ Backend Conversion', () => {
    it('should convert canonical to frontend (now identity after standardization)', () => {
      // After ID standardization, frontend uses canonical IDs
      expect(toFrontend('ferni')).toBe('ferni');
      expect(toFrontend('alex-chen')).toBe('alex-chen');
      expect(toFrontend('maya-santos')).toBe('maya-santos');
      expect(toFrontend('jordan-taylor')).toBe('jordan-taylor');
      expect(toFrontend('nayan-patel')).toBe('nayan-patel');
      expect(toFrontend('peter-john')).toBe('peter-john');
    });

    it('should convert legacy frontend IDs to canonical', () => {
      // Legacy IDs are still supported via alias mapping
      expect(fromFrontend('jack-b')).toBe('ferni');
      expect(fromFrontend('comm-specialist')).toBe('alex-chen');
      expect(fromFrontend('spend-save')).toBe('maya-santos');
      expect(fromFrontend('event-planner')).toBe('jordan-taylor');
    });

    it('should be reversible', () => {
      for (const canonical of ALL_CANONICAL_IDS) {
        const frontend = toFrontend(canonical);
        const backToCanonical = fromFrontend(frontend);
        expect(backToCanonical).toBe(canonical);
      }
    });
  });

  describe('Comparison Helpers', () => {
    it('should identify same persona with different IDs', () => {
      expect(isSamePersona('ferni', 'jack-b')).toBe(true);
      expect(isSamePersona('alex-chen', 'comm-specialist')).toBe(true);
      expect(isSamePersona('maya', 'spend-save')).toBe(true);
      expect(isSamePersona('jordan', 'event-planner')).toBe(true);
    });

    it('should identify different personas', () => {
      expect(isSamePersona('ferni', 'maya')).toBe(false);
      expect(isSamePersona('nayan-patel', 'peter-john')).toBe(false);
    });

    it('should identify coach correctly', () => {
      expect(isCoach('ferni')).toBe(true);
      expect(isCoach('jack-b')).toBe(true);
      expect(isCoach('coach')).toBe(true);
      expect(isCoach('nayan-patel')).toBe(false);
      expect(isCoach('maya')).toBe(false);
    });

    it('should identify team members correctly', () => {
      expect(isTeamMember('ferni')).toBe(false);
      expect(isTeamMember('nayan-patel')).toBe(true);
      expect(isTeamMember('peter-john')).toBe(true);
      expect(isTeamMember('alex-chen')).toBe(true);
      expect(isTeamMember('maya-santos')).toBe(true);
      expect(isTeamMember('jordan-taylor')).toBe(true);
    });
  });

  describe('Display Names', () => {
    it('should return correct display names', () => {
      expect(getDisplayName('ferni')).toBe('Ferni');
      expect(getDisplayName('jack-b')).toBe('Ferni');
      expect(getDisplayName('nayan-patel')).toBe('Nayan');
      expect(getDisplayName('peter-john')).toBe('Peter');
      expect(getDisplayName('alex-chen')).toBe('Alex');
      expect(getDisplayName('maya-santos')).toBe('Maya');
      expect(getDisplayName('jordan-taylor')).toBe('Jordan');
    });
  });
});

describe('Voice Registry Integration', () => {
  it('should return voice IDs for all canonical IDs', () => {
    for (const canonical of ALL_CANONICAL_IDS) {
      const voiceId = getVoiceId(canonical);
      expect(voiceId).toBeDefined();
      expect(typeof voiceId).toBe('string');
      expect(voiceId.length).toBeGreaterThan(0);
    }
  });

  it('should return same voice ID for aliases', () => {
    // Ferni aliases
    expect(getVoiceId('ferni')).toBe(getVoiceId('jack-b'));
    expect(getVoiceId('ferni')).toBe(getVoiceId('coach'));

    // Alex aliases
    expect(getVoiceId('alex-chen')).toBe(getVoiceId('comm-specialist'));
    expect(getVoiceId('alex-chen')).toBe(getVoiceId('alex'));

    // Maya aliases
    expect(getVoiceId('maya-santos')).toBe(getVoiceId('spend-save'));
    expect(getVoiceId('maya-santos')).toBe(getVoiceId('maya'));

    // Jordan aliases
    expect(getVoiceId('jordan-taylor')).toBe(getVoiceId('event-planner'));
    expect(getVoiceId('jordan-taylor')).toBe(getVoiceId('jordan'));
  });

  it('should resolve canonical IDs correctly via voice registry', () => {
    expect(getCanonicalPersonaId('jack-b')).toBe('ferni');
    expect(getCanonicalPersonaId('comm-specialist')).toBe('alex-chen');
    expect(getCanonicalPersonaId('spend-save')).toBe('maya-santos');
    expect(getCanonicalPersonaId('event-planner')).toBe('jordan-taylor');
  });

  it('should resolve frontend IDs correctly via voice registry (now canonical)', () => {
    // After standardization, getFrontendPersonaId returns canonical IDs
    expect(getFrontendPersonaId('ferni')).toBe('ferni');
    expect(getFrontendPersonaId('alex-chen')).toBe('alex-chen');
    expect(getFrontendPersonaId('maya-santos')).toBe('maya-santos');
    expect(getFrontendPersonaId('jordan-taylor')).toBe('jordan-taylor');
    // Legacy IDs still resolve to canonical
    expect(getFrontendPersonaId('jack-b')).toBe('ferni');
    expect(getFrontendPersonaId('comm-specialist')).toBe('alex-chen');
  });
});

describe('Handoff ID Consistency', () => {
  it('should have matching mappings in persona-ids and voice-registry', () => {
    // The two systems should produce identical results
    for (const canonical of ALL_CANONICAL_IDS) {
      const frontendFromPersonaIds = toFrontend(canonical);
      const frontendFromVoiceRegistry = getFrontendPersonaId(canonical);
      expect(frontendFromPersonaIds).toBe(frontendFromVoiceRegistry);
    }
  });

  it('should resolve all frontend IDs to canonical via both systems', () => {
    const frontendIds = [
      'jack-b',
      'nayan-patel',
      'peter-john',
      'comm-specialist',
      'spend-save',
      'event-planner',
    ];

    for (const frontendId of frontendIds) {
      const canonicalFromPersonaIds = toCanonical(frontendId);
      const canonicalFromVoiceRegistry = getCanonicalPersonaId(frontendId);
      expect(canonicalFromPersonaIds).toBe(canonicalFromVoiceRegistry);
    }
  });
});

describe('Edge Cases', () => {
  it('should handle unknown IDs gracefully', () => {
    // Unknown IDs should default to ferni without throwing
    expect(toCanonical('unknown-id')).toBe('ferni');
    expect(toCanonical('')).toBe('ferni');
  });

  it('should throw in strict mode for unknown IDs', () => {
    expect(() => toCanonical('unknown-id', true)).toThrow();
  });

  it('should handle whitespace and case variations', () => {
    // Whitespace should be trimmed and normalized
    expect(toCanonical(' ferni ')).toBe('ferni');
    expect(toCanonical('  nayan-patel  ')).toBe('nayan-patel');
    // Case should be normalized
    expect(toCanonical('NAYAN-PATEL')).toBe('nayan-patel');
    expect(toCanonical('Maya-Santos')).toBe('maya-santos');
  });
});
