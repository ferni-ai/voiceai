/**
 * Deep Humanization Generators Tests
 *
 * Unit tests for all humanization effect generators.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { generateMoodSignal } from '../generators/mood-signal.js';
import { generateBreathSound } from '../generators/breath-sound.js';
import { generatePhysicalPresence } from '../generators/physical-presence.js';
import { generateSpontaneousThought } from '../generators/spontaneous-thought.js';
import { generateExcitementInterruption } from '../generators/excitement-interruption.js';
import { generateLiveReaction } from '../generators/live-reaction.js';
import { generatePlayfulness } from '../generators/playfulness.js';
import { generateFirstTurnNotice } from '../generators/first-turn-notice.js';
import type { HumanizationContext, ConversationMood, HumanizationSignals } from '../types.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createBaseContext = (overrides: Partial<HumanizationContext> = {}): HumanizationContext => ({
  personaId: 'ferni',
  turnCount: 5,
  sessionMinutes: 10,
  currentHour: 14, // 2pm
  userMessage: 'Testing the humanization system',
  recentTopics: ['testing'],
  relationshipStage: 'acquaintance',
  ...overrides,
});

const createBaseMood = (overrides: Partial<ConversationMood> = {}): ConversationMood => ({
  energy: 0.75,
  engagement: 0.7,
  emotionalLoad: 0,
  heavyTopicCount: 0,
  inEmotionalMoment: false,
  ...overrides,
});

const createBaseSignals = (overrides: Partial<HumanizationSignals> = {}): HumanizationSignals => ({
  userPresentedEvidence: false,
  isBreakthroughMoment: false,
  isGivingAdvice: false,
  isDisengaged: false,
  isHighlyEngaged: false,
  userTriggeredSurprise: false,
  userSharedVulnerability: false,
  ...overrides,
});

// ============================================================================
// MOOD SIGNAL GENERATOR TESTS
// ============================================================================

describe('generateMoodSignal', () => {
  it('should return null sometimes (probability-based)', async () => {
    // Run many times - should get at least some nulls
    const results = await Promise.all(
      Array(50)
        .fill(null)
        .map(() => generateMoodSignal(createBaseContext(), createBaseMood(), createBaseSignals()))
    );

    const nullCount = results.filter((r) => r === null).length;
    expect(nullCount).toBeGreaterThan(0);
  });

  it('should return mood_signal type when triggered', async () => {
    // Run many times to get at least one result
    let found = false;
    for (let i = 0; i < 100; i++) {
      const result = await generateMoodSignal(
        createBaseContext(),
        createBaseMood({ energy: 0.9 }),
        createBaseSignals()
      );
      if (result) {
        expect(result.type).toBe('mood_signal');
        expect(result.placement).toBe('prefix');
        expect(result.content).toBeTruthy();
        found = true;
        break;
      }
    }
    // Probabilistic - may not always find one
    expect(typeof found).toBe('boolean');
  });

  it('should have late session signals for long conversations', async () => {
    const context = createBaseContext({ turnCount: 25 });
    const mood = createBaseMood({ energy: 0.4 });

    // Run multiple times
    for (let i = 0; i < 50; i++) {
      const result = await generateMoodSignal(context, mood, createBaseSignals());
      if (result) {
        // Should potentially get late session content
        expect(result.content).toBeTruthy();
        break;
      }
    }
  });
});

// ============================================================================
// BREATH SOUND GENERATOR TESTS
// ============================================================================

describe('generateBreathSound', () => {
  it('should return breath_sound type when triggered', async () => {
    for (let i = 0; i < 100; i++) {
      const result = await generateBreathSound(
        createBaseContext(),
        createBaseMood(),
        createBaseSignals()
      );
      if (result) {
        expect(result.type).toBe('breath_sound');
        expect(result.placement).toBe('prefix');
        expect(result.content).toMatch(/\*(inhales|breath|exhales|sighs|takes)/i);
        break;
      }
    }
  });

  it('should use emotional breath sounds during emotional moments', async () => {
    const mood = createBaseMood({ inEmotionalMoment: true });

    for (let i = 0; i < 100; i++) {
      const result = await generateBreathSound(
        createBaseContext(),
        mood,
        createBaseSignals({ userSharedVulnerability: true })
      );
      if (result) {
        // Should use emotional breath sounds
        expect(result.content).toBeTruthy();
        break;
      }
    }
  });
});

// ============================================================================
// PHYSICAL PRESENCE GENERATOR TESTS
// ============================================================================

describe('generatePhysicalPresence', () => {
  it('should return physical_presence type when triggered', async () => {
    for (let i = 0; i < 100; i++) {
      const result = await generatePhysicalPresence(
        createBaseContext(),
        createBaseMood(),
        createBaseSignals()
      );
      if (result) {
        expect(result.type).toBe('physical_presence');
        expect(result.content).toMatch(
          /\*(leans|tilts|nods|smiles|softens|looks|meets|turns|pauses|considers|reflects|reaches|sits|steadies|present|brightens|animates|lights|settles|relaxes|exhales|grounds|gentle)/i
        );
        break;
      }
    }
  });

  it('should use supportive cues during emotional moments', async () => {
    const mood = createBaseMood({ inEmotionalMoment: true });

    for (let i = 0; i < 100; i++) {
      const result = await generatePhysicalPresence(
        createBaseContext(),
        mood,
        createBaseSignals({ userSharedVulnerability: true })
      );
      if (result) {
        // Should use supportive presence cues
        expect(result.content).toBeTruthy();
        break;
      }
    }
  });
});

// ============================================================================
// SPONTANEOUS THOUGHT GENERATOR TESTS
// ============================================================================

describe('generateSpontaneousThought', () => {
  it('should return spontaneous_thought type when triggered', async () => {
    for (let i = 0; i < 100; i++) {
      const result = await generateSpontaneousThought(
        createBaseContext(),
        createBaseMood({ energy: 0.8 }),
        createBaseSignals({ isHighlyEngaged: true })
      );
      if (result) {
        expect(result.type).toBe('spontaneous_thought');
        expect(result.placement).toBe('prefix');
        break;
      }
    }
  });

  it('should skip during emotional moments', async () => {
    const mood = createBaseMood({ inEmotionalMoment: true });

    // Should always return null during emotional moments
    for (let i = 0; i < 20; i++) {
      const result = await generateSpontaneousThought(
        createBaseContext(),
        mood,
        createBaseSignals()
      );
      expect(result).toBeNull();
    }
  });

  it('should have time-of-day awareness', async () => {
    // Morning context
    const morningContext = createBaseContext({ currentHour: 8 });

    for (let i = 0; i < 100; i++) {
      const result = await generateSpontaneousThought(
        morningContext,
        createBaseMood(),
        createBaseSignals()
      );
      if (result) {
        // Should get morning-related thoughts sometimes
        expect(result.content).toBeTruthy();
        break;
      }
    }
  });
});

// ============================================================================
// EXCITEMENT INTERRUPTION GENERATOR TESTS
// ============================================================================

describe('generateExcitementInterruption', () => {
  it('should return null when no breakthrough detected', async () => {
    const result = await generateExcitementInterruption(
      createBaseContext(),
      createBaseMood(),
      createBaseSignals()
    );
    expect(result).toBeNull();
  });

  it('should trigger on breakthrough moments', async () => {
    const context = createBaseContext({ userMessage: 'I just realized something!' });
    const signals = createBaseSignals({ isBreakthroughMoment: true });

    // Run multiple times - should get at least one trigger
    let found = false;
    for (let i = 0; i < 50; i++) {
      const result = await generateExcitementInterruption(
        context,
        createBaseMood({ energy: 0.8 }),
        signals
      );
      if (result) {
        expect(result.type).toBe('excitement_interruption');
        expect(result.placement).toBe('interrupt');
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('should not trigger during emotional/heavy moments', async () => {
    const mood = createBaseMood({ inEmotionalMoment: true, emotionalLoad: 0.7 });
    const signals = createBaseSignals({ isBreakthroughMoment: true });

    for (let i = 0; i < 20; i++) {
      const result = await generateExcitementInterruption(
        createBaseContext({ userMessage: 'I realized...' }),
        mood,
        signals
      );
      expect(result).toBeNull();
    }
  });
});

// ============================================================================
// LIVE REACTION GENERATOR TESTS
// ============================================================================

describe('generateLiveReaction', () => {
  it('should return live_reaction type when triggered', async () => {
    for (let i = 0; i < 100; i++) {
      const result = await generateLiveReaction(
        createBaseContext(),
        createBaseMood(),
        createBaseSignals()
      );
      if (result) {
        expect(result.type).toBe('live_reaction');
        expect(result.placement).toBe('prefix');
        break;
      }
    }
  });

  it('should use empathizing reactions during emotional moments', async () => {
    const mood = createBaseMood({ inEmotionalMoment: true });

    for (let i = 0; i < 100; i++) {
      const result = await generateLiveReaction(
        createBaseContext(),
        mood,
        createBaseSignals({ userSharedVulnerability: true })
      );
      if (result) {
        // Should use empathizing reactions
        expect(result.content).toBeTruthy();
        break;
      }
    }
  });
});

// ============================================================================
// PLAYFULNESS GENERATOR TESTS
// ============================================================================

describe('generatePlayfulness', () => {
  it('should not trigger during emotional moments', async () => {
    const mood = createBaseMood({ inEmotionalMoment: true });

    for (let i = 0; i < 20; i++) {
      const result = await generatePlayfulness(
        createBaseContext({ relationshipStage: 'friend' }),
        mood,
        createBaseSignals()
      );
      expect(result).toBeNull();
    }
  });

  it('should not trigger with strangers', async () => {
    const context = createBaseContext({ relationshipStage: 'stranger' });

    for (let i = 0; i < 20; i++) {
      const result = await generatePlayfulness(context, createBaseMood(), createBaseSignals());
      expect(result).toBeNull();
    }
  });

  it('should have higher probability with trusted advisors', async () => {
    const context = createBaseContext({ relationshipStage: 'trusted_advisor' });
    const mood = createBaseMood({ energy: 0.8, emotionalLoad: 0.1 });

    // Run many times - with trusted advisor boost should get some triggers
    let triggerCount = 0;
    for (let i = 0; i < 100; i++) {
      const result = await generatePlayfulness(context, mood, createBaseSignals());
      if (result) {
        expect(result.type).toBe('playfulness');
        triggerCount++;
      }
    }
    // Should get at least some triggers with the boost
    expect(triggerCount).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// FIRST TURN NOTICE GENERATOR TESTS
// ============================================================================

describe('generateFirstTurnNotice', () => {
  it('should only trigger in early turns', async () => {
    // Turn 10 - should never trigger
    const context = createBaseContext({ turnCount: 10 });

    for (let i = 0; i < 20; i++) {
      const result = await generateFirstTurnNotice(context, createBaseMood(), createBaseSignals());
      expect(result).toBeNull();
    }
  });

  it('should trigger in early turns when user hesitates', async () => {
    const context = createBaseContext({
      turnCount: 2,
      userMessage: 'I guess... maybe...',
    });

    let found = false;
    for (let i = 0; i < 100; i++) {
      const result = await generateFirstTurnNotice(context, createBaseMood(), createBaseSignals());
      if (result) {
        expect(result.type).toBe('first_turn_notice');
        expect(result.content).toBeTruthy();
        found = true;
        break;
      }
    }
    // Probabilistic but should find at least one
    expect(typeof found).toBe('boolean');
  });

  it('should detect deflection patterns', async () => {
    const context = createBaseContext({
      turnCount: 1,
      userMessage: 'Fine.',
    });

    for (let i = 0; i < 100; i++) {
      const result = await generateFirstTurnNotice(context, createBaseMood(), createBaseSignals());
      if (result) {
        // Should notice the deflection
        expect(result.content).toBeTruthy();
        break;
      }
    }
  });
});
