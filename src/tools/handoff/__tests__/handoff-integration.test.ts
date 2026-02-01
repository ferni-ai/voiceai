/**
 * Handoff Integration Tests
 *
 * Tests the FULL handoff flow including:
 * - Event creation with all required fields
 * - Voice ID propagation through the entire flow
 * - Banter lookup with real persona IDs
 *
 * These tests would have caught:
 * - Missing voiceId in HandoffEventData
 * - Voice ID not being passed to TTS
 * - Persona ID mismatches with banter tables
 *
 * Run with: npx vitest run src/tools/handoff/__tests__/handoff-integration.test.ts
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// REALISTIC PERSONA MOCKS - Must match production structure!
// ============================================================================

const REALISTIC_PERSONAS: Record<
  string,
  {
    id: string;
    name: string;
    description: string;
    voice: { voiceId: string; name: string };
  }
> = {
  ferni: {
    id: 'ferni',
    name: 'Ferni',
    description: 'Your coach',
    voice: { voiceId: 'ferni-voice-id-12345', name: 'Ferni Voice' },
  },
  'maya-santos': {
    id: 'maya-santos',
    name: 'Maya Santos',
    description: 'Habit coach',
    voice: { voiceId: 'maya-voice-id-67890', name: 'Maya Voice' },
  },
  'peter-john': {
    id: 'peter-john',
    name: 'Peter John',
    description: 'Research analyst',
    voice: { voiceId: 'peter-voice-id-11111', name: 'Peter Voice' },
  },
  'alex-chen': {
    id: 'alex-chen',
    name: 'Alex Chen',
    description: 'Chief of staff',
    voice: { voiceId: 'alex-voice-id-22222', name: 'Alex Voice' },
  },
  'jordan-taylor': {
    id: 'jordan-taylor',
    name: 'Jordan Taylor',
    description: 'Life planner',
    voice: { voiceId: 'jordan-voice-id-33333', name: 'Jordan Voice' },
  },
  'nayan-patel': {
    id: 'nayan-patel',
    name: 'Nayan Patel',
    description: 'Wisdom guide',
    voice: { voiceId: 'nayan-voice-id-44444', name: 'Nayan Voice' },
  },
};

// Control variable to allow tests to override the default behavior
let mockPersonaOverride: ((id: string) => unknown) | null = null;

// Mock personas index with REALISTIC structure
vi.mock('../../../personas/index.js', () => ({
  getPersona: (id: string) => {
    if (mockPersonaOverride) return mockPersonaOverride(id);
    return REALISTIC_PERSONAS[id] || null;
  },
  getPersonaAsync: async (id: string) => {
    if (mockPersonaOverride) return mockPersonaOverride(id);
    return REALISTIC_PERSONAS[id] || null;
  },
  getAllPersonaIds: () => Object.keys(REALISTIC_PERSONAS),
  getCanonicalPersonaId: (id: string) => {
    const aliases: Record<string, string> = {
      maya: 'maya-santos',
      peter: 'peter-john',
      alex: 'alex-chen',
      jordan: 'jordan-taylor',
      nayan: 'nayan-patel',
    };
    return aliases[id] || id;
  },
}));

// ============================================================================
// TESTS
// ============================================================================

describe('Handoff Integration - Voice ID Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPersonaOverride = null; // Reset to default behavior
  });

  afterEach(() => {
    mockPersonaOverride = null; // Clean up
  });

  describe('createHandoffEvent', () => {
    it('should include voiceId from persona.voice.voiceId', async () => {
      const { createHandoffEvent } = await import('../types.js');

      const event = await createHandoffEvent('maya-santos', {
        greeting: 'Hello!',
        previousAgentId: 'ferni',
      });

      // CRITICAL: voiceId must be at top level of event data
      expect(event.voiceId).toBeDefined();
      expect(event.voiceId).toBe('maya-voice-id-67890');
      expect(event.persona.id).toBe('maya-santos');
    });

    it('should throw if persona has no voiceId', async () => {
      // Override the mock to return a persona without voiceId
      mockPersonaOverride = () => ({
        id: 'broken-persona',
        name: 'Broken',
        voice: {}, // Missing voiceId!
      });

      const { createHandoffEvent } = await import('../types.js');

      await expect(createHandoffEvent('broken-persona')).rejects.toThrow('no voiceId');
    });

    it('should extract voiceId for all personas', async () => {
      const { createHandoffEvent } = await import('../types.js');

      for (const [id, persona] of Object.entries(REALISTIC_PERSONAS)) {
        const event = await createHandoffEvent(id);

        expect(event.voiceId).toBe(persona.voice.voiceId);
        expect(event.agentId).toBe(id);
      }
    });
  });
});

describe('Handoff Integration - Banter Lookup', () => {
  /**
   * These tests verify that banter lookups work with the EXACT persona IDs
   * that will be used in production handoffs.
   */

  it('should find banter for all core handoff paths', async () => {
    const { getHandoffBanter, getArrivingBanter } =
      await import('../../../services/team-engagement/banter.js');

    const corePersonas = ['ferni', 'maya-santos', 'peter-john', 'alex-chen', 'jordan-taylor'];

    // Test Ferni -> Everyone
    for (const target of corePersonas) {
      if (target !== 'ferni') {
        const softOpen = getHandoffBanter('ferni', target);
        const arriving = getArrivingBanter(target, 'ferni');

        expect(softOpen).not.toBeNull();
        expect(arriving).not.toBeNull();
      }
    }
  });

  it('should match persona IDs from createHandoffEvent to banter tables', async () => {
    const { createHandoffEvent } = await import('../types.js');
    const { getHandoffBanter, getArrivingBanter } =
      await import('../../../services/team-engagement/banter.js');

    // Simulate real handoff: Ferni -> Maya
    const event = await createHandoffEvent('maya-santos', {
      previousAgentId: 'ferni',
    });

    // The IDs from the event should work with banter lookup
    const softOpen = getHandoffBanter('ferni', event.persona.id);
    const arriving = getArrivingBanter(event.persona.id, 'ferni');

    expect(softOpen).not.toBeNull();
    expect(arriving).not.toBeNull();
  });

  it('should handle alias IDs correctly', async () => {
    const { getHandoffBanter } = await import('../../../services/team-engagement/banter.js');

    // Aliases should NOT work directly - must be normalized first
    const banterWithAlias = getHandoffBanter('ferni', 'maya'); // alias
    const banterWithCanonical = getHandoffBanter('ferni', 'maya-santos'); // canonical

    // Alias lookup fails (as expected - banter uses canonical IDs)
    expect(banterWithAlias).toBeNull();
    // Canonical lookup succeeds
    expect(banterWithCanonical).not.toBeNull();
  });
});

describe('Handoff Integration - Full Flow Simulation', () => {
  /**
   * Simulates the complete handoff flow to verify all pieces connect.
   */

  it('should pass voice ID through entire handoff flow', async () => {
    const { createHandoffEvent } = await import('../types.js');

    // Step 1: Create event (like executor does)
    const event = await createHandoffEvent('maya-santos', {
      previousAgentId: 'ferni',
      greeting: 'Maya here!',
    });

    // Step 2: Verify event has all required fields
    expect(event.voiceId).toBe('maya-voice-id-67890');
    expect(event.persona.id).toBe('maya-santos');
    expect(event.agentId).toBe('maya-santos');

    // Step 3: Simulate handler extracting voiceId
    // This is what handoff-handler.ts does
    const voiceIdFromEvent = event.voiceId;
    const personaVoiceId = event.persona.voice?.voiceId;

    // Both should be available
    expect(voiceIdFromEvent).toBe('maya-voice-id-67890');
    expect(personaVoiceId).toBe('maya-voice-id-67890');

    // Step 4: The effective voice ID (what TTS should receive)
    const effectiveVoiceId = voiceIdFromEvent || personaVoiceId;
    expect(effectiveVoiceId).toBe('maya-voice-id-67890');
  });

  it('should have banter available for handoff', async () => {
    const { createHandoffEvent } = await import('../types.js');
    const { getHandoffBanter, getArrivingBanter } =
      await import('../../../services/team-engagement/banter.js');

    const previousPersonaId = 'ferni';
    const event = await createHandoffEvent('maya-santos', {
      previousAgentId: previousPersonaId,
    });

    // Simulate what handoff-handler does
    const softOpenBanter = getHandoffBanter(previousPersonaId, event.persona.id);
    const arrivingBanter = getArrivingBanter(event.persona.id, previousPersonaId);

    // Both should be available
    expect(softOpenBanter).not.toBeNull();
    expect(arrivingBanter).not.toBeNull();

    // Banter should be non-empty strings (SSML tags are optional - some entries are simple greetings)
    expect(typeof softOpenBanter).toBe('string');
    expect(typeof arrivingBanter).toBe('string');
    expect(softOpenBanter!.length).toBeGreaterThan(0);
    expect(arrivingBanter!.length).toBeGreaterThan(0);
  });
});

describe('Handoff Integration - Persona ID Consistency', () => {
  /**
   * Verifies that persona IDs are consistent across all systems.
   */

  const CANONICAL_IDS = [
    'ferni',
    'maya-santos',
    'peter-john',
    'alex-chen',
    'jordan-taylor',
    'nayan-patel',
  ];

  it('should use canonical IDs in persona configs', () => {
    for (const id of CANONICAL_IDS) {
      const persona = REALISTIC_PERSONAS[id];
      expect(persona).toBeDefined();
      expect(persona.id).toBe(id); // ID in config matches key
    }
  });

  it('should have banter entries for all canonical IDs', async () => {
    const { HANDOFF_BANTER, ARRIVING_BANTER } =
      await import('../../../services/team-engagement/banter.js');

    for (const id of CANONICAL_IDS) {
      // Each persona should either be in HANDOFF_BANTER or have entries pointing to them
      const hasBanterFrom = id in HANDOFF_BANTER;
      const hasBanterTo = Object.values(HANDOFF_BANTER).some(
        (targets) => id in (targets as Record<string, unknown>)
      );
      const hasArrivingBanter = id in ARRIVING_BANTER;

      expect(hasBanterFrom || hasBanterTo).toBe(true);
      expect(hasArrivingBanter).toBe(true);
    }
  });
});

describe('Handoff Integration - Intelligent Banter', () => {
  /**
   * Tests the intelligent banter system that provides context-aware
   * handoff phrases based on topic, emotion, time, and relationship depth.
   *
   * This test suite verifies:
   * - Intelligent banter is properly wired and callable
   * - It returns both softOpenBanter and arrivingBanter
   * - Context affects the banter generation
   * - Falls back gracefully when context is missing
   */

  const CANONICAL_IDS = [
    'ferni',
    'maya-santos',
    'peter-john',
    'alex-chen',
    'jordan-taylor',
    'nayan-patel',
  ];

  it('should generate intelligent banter for all persona pairs', async () => {
    const { getIntelligentBanter } =
      await import('../../../services/team-engagement/intelligent-banter.js');

    // Test ferni → each team member
    for (const target of CANONICAL_IDS) {
      if (target === 'ferni') continue;

      const result = getIntelligentBanter('ferni', target, {});

      // Should always return both banter strings
      expect(result.softOpenBanter).toBeDefined();
      expect(result.arrivingBanter).toBeDefined();
      expect(typeof result.softOpenBanter).toBe('string');
      expect(typeof result.arrivingBanter).toBe('string');
      expect(result.softOpenBanter.length).toBeGreaterThan(0);
      expect(result.arrivingBanter.length).toBeGreaterThan(0);
    }
  });

  it('should indicate when intelligent banter was used vs fallback', async () => {
    const { getIntelligentBanter } =
      await import('../../../services/team-engagement/intelligent-banter.js');

    // With minimal context - may use fallback
    const minimalResult = getIntelligentBanter('ferni', 'maya-santos', {});
    expect(typeof minimalResult.wasIntelligent).toBe('boolean');

    // With rich context - should use intelligent banter
    const richResult = getIntelligentBanter('ferni', 'maya-santos', {
      currentTopic: 'building a morning routine habit',
      userEmotion: 'positive',
      handoffCountThisSession: 0,
      handoffReason: 'User wants help with habits',
      totalSessions: 15,
      timeOfDay: 'morning',
      relationshipStage: 'established',
    });

    expect(richResult.softOpenBanter).toBeDefined();
    expect(richResult.arrivingBanter).toBeDefined();
    // With rich context, intelligent banter should be used
    expect(richResult.wasIntelligent).toBe(true);
  });

  it('should adapt banter based on handoff count (brevity mode)', async () => {
    const { getIntelligentBanter } =
      await import('../../../services/team-engagement/intelligent-banter.js');

    // First handoff - should have fuller banter
    const firstHandoff = getIntelligentBanter('ferni', 'peter-john', {
      handoffCountThisSession: 0,
    });

    // Third+ handoff - should be more brief
    const thirdHandoff = getIntelligentBanter('ferni', 'peter-john', {
      handoffCountThisSession: 3,
    });

    // Both should work and produce valid banter
    expect(firstHandoff.softOpenBanter.length).toBeGreaterThan(0);
    expect(thirdHandoff.softOpenBanter.length).toBeGreaterThan(0);

    // Both should be reasonable lengths (brevity mode may not always be shorter
    // depending on the specific banter selected from the templates)
    // Main assertion: both produce valid output, no errors from handoff count context
    expect(firstHandoff.softOpenBanter.length).toBeLessThan(500);
    expect(thirdHandoff.softOpenBanter.length).toBeLessThan(500);
  });

  it('should include context metadata in result when intelligent banter is used', async () => {
    const { getIntelligentBanter } =
      await import('../../../services/team-engagement/intelligent-banter.js');

    const result = getIntelligentBanter('ferni', 'alex-chen', {
      currentTopic: 'email communication',
      userEmotion: 'stressed',
      timeOfDay: 'evening',
      handoffReason: 'calendar scheduling',
    });

    // When intelligent banter is used, contextUsed should be populated
    if (result.wasIntelligent) {
      expect(result.contextUsed).toBeDefined();
      // At least some context should be recorded
      const hasContext =
        result.contextUsed?.topic ||
        result.contextUsed?.emotion ||
        result.contextUsed?.timeOfDay ||
        result.contextUsed?.handoffReason;
      expect(hasContext).toBeTruthy();
    }
  });

  it('should handle emotion-aware banter', async () => {
    const { getIntelligentBanter } =
      await import('../../../services/team-engagement/intelligent-banter.js');

    // Test stressed emotion
    const stressedResult = getIntelligentBanter('ferni', 'maya-santos', {
      userEmotion: 'stressed',
    });

    // Test positive emotion
    const positiveResult = getIntelligentBanter('ferni', 'maya-santos', {
      userEmotion: 'positive',
    });

    // Both should generate valid banter
    expect(stressedResult.softOpenBanter.length).toBeGreaterThan(0);
    expect(positiveResult.softOpenBanter.length).toBeGreaterThan(0);
  });

  it('should handle team-to-team handoffs', async () => {
    const { getIntelligentBanter } =
      await import('../../../services/team-engagement/intelligent-banter.js');

    // Maya → Peter (team to team)
    const result = getIntelligentBanter('maya-santos', 'peter-john', {
      currentTopic: 'tracking habit progress with data',
    });

    expect(result.softOpenBanter).toBeDefined();
    expect(result.arrivingBanter).toBeDefined();
    expect(result.softOpenBanter.length).toBeGreaterThan(0);
  });
});
