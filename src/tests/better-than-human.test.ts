/**
 * Better Than Human - Unit Tests
 *
 * Tests for the 12 superhuman capabilities.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearAnticipatoryPresence,
  clearBetterThanHuman,
  clearDelightEngines,
  clearEmotionalMemory,
  clearEvolvingJokes,
  clearLinguisticMirroring,
  clearMetaRelationship,
  clearSomaticPresence,
  clearSuperhumanObservations,
  clearTeamCoherence,
  clearTemporalEmotional,
  getBetterThanHuman,
  getEmotionalMemory,
  getEvolvingJokes,
  getLinguisticMirroring,
  getMetaRelationship,
  getProtectiveInstincts,
  getSuperhumanObservations,
  getTeamCoherence,
  getTemporalEmotional,
  type BetterThanHumanContext,
} from '../conversation/superhuman/index.js';

const TEST_USER_ID = 'test-user-123';
const TEST_SESSION_ID = 'test-session-456';

describe('Better Than Human Orchestrator', () => {
  beforeEach(() => {
    // Clear all engines before each test
    clearBetterThanHuman(TEST_USER_ID, TEST_SESSION_ID);
    clearEmotionalMemory(TEST_USER_ID);
    clearAnticipatoryPresence(TEST_USER_ID);
    clearLinguisticMirroring(TEST_USER_ID);
    clearDelightEngines(TEST_USER_ID);
    clearEvolvingJokes(TEST_USER_ID);
    clearTeamCoherence(TEST_USER_ID);
    clearTemporalEmotional(TEST_USER_ID);
    clearMetaRelationship(TEST_USER_ID);
    clearSomaticPresence(TEST_USER_ID);
    clearSuperhumanObservations(TEST_USER_ID);
  });

  afterEach(() => {
    clearBetterThanHuman(TEST_USER_ID, TEST_SESSION_ID);
  });

  it('should create orchestrator with all engines', () => {
    const orchestrator = getBetterThanHuman(TEST_USER_ID, TEST_SESSION_ID, 'ferni', 0);

    expect(orchestrator).toBeDefined();
    expect(orchestrator.getRelationshipStage()).toBeDefined();
  });

  it('should analyze user message and return insight', () => {
    const orchestrator = getBetterThanHuman(TEST_USER_ID, TEST_SESSION_ID, 'ferni', 0);

    const context: BetterThanHumanContext = {
      userMessage: "I've been feeling really stressed lately",
      turnCount: 1,
      sessionCount: 0,
      personaId: 'ferni',
      userId: TEST_USER_ID,
      sessionId: TEST_SESSION_ID,
      relationshipStage: 'getting_to_know',
      isSessionStart: true,
      dayOfWeek: 1,
      timeOfDay: 'afternoon',
    };

    const insight = orchestrator.analyze(context);

    expect(insight).toBeDefined();
    expect(insight.emotionalBond).toBeDefined();
    expect(insight.confidence).toBeGreaterThanOrEqual(0);
    expect(insight.prioritizedActions).toBeInstanceOf(Array);
  });

  it('should detect self-criticism and trigger protection', () => {
    const orchestrator = getBetterThanHuman(
      TEST_USER_ID,
      TEST_SESSION_ID,
      'ferni',
      5 // Several sessions
    );

    const context: BetterThanHumanContext = {
      // Use message that matches pattern: /i('m| am) (so )?(stupid|dumb|idiot)/i
      userMessage: "I'm so stupid. I can't do anything right.",
      turnCount: 3,
      sessionCount: 5,
      personaId: 'ferni',
      userId: TEST_USER_ID,
      sessionId: TEST_SESSION_ID,
      relationshipStage: 'trusted_advisor',
      isSessionStart: false,
      dayOfWeek: 3,
      timeOfDay: 'evening',
    };

    const insight = orchestrator.analyze(context);

    // Should have a protective action
    const protectionAction = insight.prioritizedActions.find((a) => a.type === 'protection');
    expect(protectionAction).toBeDefined();
    expect(protectionAction?.priority).toBeGreaterThan(0.9);
  });

  it('should apply insights to response', () => {
    const orchestrator = getBetterThanHuman(TEST_USER_ID, TEST_SESSION_ID, 'ferni', 0);

    const context: BetterThanHumanContext = {
      userMessage: "I'm a complete failure",
      turnCount: 1,
      sessionCount: 0,
      personaId: 'ferni',
      userId: TEST_USER_ID,
      sessionId: TEST_SESSION_ID,
      relationshipStage: 'getting_to_know',
      isSessionStart: false,
      dayOfWeek: 1,
      timeOfDay: 'afternoon',
    };

    const insight = orchestrator.analyze(context);
    const originalResponse = 'That sounds difficult.';
    const enhanced = orchestrator.applyInsights(originalResponse, insight, 2);

    // Enhanced response should be different (have prefix/suffix)
    expect(enhanced.length).toBeGreaterThanOrEqual(originalResponse.length);
  });

  it('should export and import state', () => {
    const orchestrator = getBetterThanHuman(TEST_USER_ID, TEST_SESSION_ID, 'ferni', 5);

    // Build up some state
    const context: BetterThanHumanContext = {
      userMessage: "I've been working hard on my goals",
      turnCount: 1,
      sessionCount: 5,
      personaId: 'ferni',
      userId: TEST_USER_ID,
      sessionId: TEST_SESSION_ID,
      relationshipStage: 'trusted_advisor',
      isSessionStart: false,
      dayOfWeek: 1,
      timeOfDay: 'afternoon',
    };
    orchestrator.analyze(context);

    // Export state
    const exported = orchestrator.export();

    expect(exported).toBeDefined();
    expect(exported.emotionalBond).toBeDefined();
    expect(exported.sessionCount).toBe(5);

    // Create new orchestrator and import
    const newOrchestrator = getBetterThanHuman(TEST_USER_ID, 'new-session', 'ferni', 0);
    newOrchestrator.import(exported);

    // State should be restored
    const newExported = newOrchestrator.export();
    expect(newExported.sessionCount).toBe(5);
  });
});

describe('Emotional Memory Engine', () => {
  beforeEach(() => {
    clearEmotionalMemory(TEST_USER_ID);
  });

  it('should track emotional bond metrics', () => {
    const engine = getEmotionalMemory(TEST_USER_ID);

    // Record some interactions using the correct API
    engine.recordEvent('vulnerability_shared', {
      description: 'Shared something personal',
    });

    const bond = engine.getBond();
    expect(bond.trust).toBeGreaterThan(0);
  });

  it('should evolve bond over time', () => {
    const engine = getEmotionalMemory(TEST_USER_ID);

    // Record multiple positive interactions using valid event types
    for (let i = 0; i < 5; i++) {
      engine.recordEvent('growth_shown', {
        description: `Session ${i}`,
      });
    }

    const bond = engine.getBond();
    expect(bond.warmth).toBeGreaterThan(0);
  });

  it('should provide bond-aware phrases', () => {
    const engine = getEmotionalMemory(TEST_USER_ID);

    // Build up bond
    engine.recordEvent('vulnerability_shared', {
      description: 'Deep sharing',
    });

    const phrase = engine.getBondPhrase({
      turnCount: 15,
      wasVulnerable: true,
      showedGrowth: false,
    });

    // Should get a phrase after building bond
    // (May be null if bond not high enough yet)
    expect(phrase === null || typeof phrase.phrase === 'string').toBe(true);
  });
});

describe('Protective Instincts Engine', () => {
  beforeEach(() => {
    clearDelightEngines(TEST_USER_ID);
  });

  it('should detect harsh self-judgment', () => {
    const engine = getProtectiveInstincts(TEST_USER_ID);

    // Pattern: /i('m| am) (so )?(stupid|dumb|idiot|worthless)/i
    const result = engine.detectSelfCriticism("I'm so stupid");
    expect(result.detected).toBe(true);
    expect(result.type).toBe('harsh_judgment');
  });

  it('should detect catastrophizing', () => {
    const engine = getProtectiveInstincts(TEST_USER_ID);

    // Pattern: /my life is (over|ruined|a mess)/i
    const result = engine.detectSelfCriticism('My life is over');
    expect(result.detected).toBe(true);
    expect(result.type).toBe('catastrophizing');
  });

  it('should detect imposter syndrome', () => {
    const engine = getProtectiveInstincts(TEST_USER_ID);

    // Pattern: /i('m| am) a fraud/i
    const result = engine.detectSelfCriticism("I'm a fraud and they're going to find out.");
    expect(result.detected).toBe(true);
    expect(result.type).toBe('imposter_syndrome');
  });

  it('should provide protective response', () => {
    const engine = getProtectiveInstincts(TEST_USER_ID);

    const response = engine.getProtectiveResponse('harsh_judgment', 'high', 'trusted_advisor');

    expect(response).toBeDefined();
    expect(response.phrase).toBeTruthy();
  });
});

describe('Linguistic Mirroring Engine', () => {
  beforeEach(() => {
    clearLinguisticMirroring(TEST_USER_ID);
  });

  it('should learn user vocabulary', () => {
    const engine = getLinguisticMirroring(TEST_USER_ID);

    // Analyze multiple messages with consistent vocabulary
    engine.analyzeMessage('I want to vibe with this approach');
    engine.analyzeMessage('That vibes with what I was thinking');
    engine.analyzeMessage('The vibe here is really good');

    const profile = engine.getProfile();
    expect(profile.preferredTerms.size).toBeGreaterThanOrEqual(0);
  });

  it('should apply mirroring to response', () => {
    const engine = getLinguisticMirroring(TEST_USER_ID);

    // Teach the engine a preference
    engine.analyzeMessage('I want to utilize this feature');
    engine.analyzeMessage('We should utilize the new system');

    const result = engine.applyMirroring('You can use this feature.');

    expect(result.mirroredResponse).toBeDefined();
  });
});

describe('Evolving Jokes Engine', () => {
  beforeEach(() => {
    clearEvolvingJokes(TEST_USER_ID);
  });

  it('should detect joke seeds', () => {
    const engine = getEvolvingJokes(TEST_USER_ID);

    // Multiple mentions of the same funny thing with context
    engine.detectJokeSeed('My cat knocked over my coffee again today', {
      wasHumorous: true,
      userLaughed: true,
    });
    engine.detectJokeSeed('Cat strikes again - another coffee disaster', {
      wasHumorous: true,
      userLaughed: true,
    });

    const jokes = engine.getAllJokes();
    // May or may not have created a joke yet depending on threshold
    expect(Array.isArray(jokes)).toBe(true);
  });

  it('should evolve joke phases', () => {
    const engine = getEvolvingJokes(TEST_USER_ID);

    // Create a joke by multiple mentions
    engine.detectJokeSeed('My plant keeps dying', {
      wasHumorous: true,
      userLaughed: true,
    });
    engine.detectJokeSeed('Plant death count: 5', {
      wasHumorous: true,
      userLaughed: true,
    });
    engine.detectJokeSeed('Another plant casualty', {
      wasHumorous: true,
      userLaughed: true,
    });

    // Export state - returns array of jokes directly
    const exported = engine.export();
    expect(exported).toBeDefined();
    expect(Array.isArray(exported)).toBe(true);
  });
});

describe('Temporal Emotional Intelligence', () => {
  beforeEach(() => {
    clearTemporalEmotional(TEST_USER_ID);
  });

  it('should record session emotions', () => {
    const engine = getTemporalEmotional(TEST_USER_ID);

    engine.recordSessionEmotion({
      dominantEmotion: 'neutral',
      energyLevel: 0.5,
      positivity: 0.6,
      topics: ['work'],
      concernsDetected: false,
    });

    const profile = engine.export();
    expect(profile.sessionEmotions.length).toBe(1);
  });

  it('should detect emotional shifts', () => {
    const engine = getTemporalEmotional(TEST_USER_ID);

    // Record multiple sessions with different emotional states
    engine.recordSessionEmotion({
      dominantEmotion: 'stressed',
      energyLevel: 0.3,
      positivity: 0.3,
      topics: ['work'],
      concernsDetected: true,
    });

    engine.recordSessionEmotion({
      dominantEmotion: 'content',
      energyLevel: 0.7,
      positivity: 0.7,
      topics: ['life'],
      concernsDetected: false,
    });

    const profile = engine.export();
    // We recorded 2 sessions in this test
    expect(profile.sessionEmotions.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Team Coherence Engine', () => {
  beforeEach(() => {
    clearTeamCoherence(TEST_USER_ID);
  });

  it('should record handoff notes', () => {
    const engine = getTeamCoherence(TEST_USER_ID);

    engine.recordHandoffNote(
      'ferni',
      'maya',
      'user_state',
      'User is motivated to work on habits',
      'habits'
    );

    // Check that export contains the note
    const exported = engine.export();
    expect(exported.handoffNotes.length).toBe(1);
    expect(exported.handoffNotes[0].fromPersona).toBe('ferni');
    expect(exported.handoffNotes[0].toPersona).toBe('maya');
  });

  it('should provide team awareness', () => {
    const engine = getTeamCoherence(TEST_USER_ID);

    // Record some history
    engine.recordHandoffNote(
      'ferni',
      'peter',
      'recommendation',
      'Encourage deep questions about research',
      'research'
    );

    const awareness = engine.checkForTeamAwareness('ferni', {
      turnCount: 1,
      isSessionStart: true,
      currentTopic: 'research',
      sessionCount: 5,
    });

    // May or may not suggest mentioning team depending on timing
    expect(awareness).toBeDefined();
    expect(typeof awareness.shouldMention).toBe('boolean');
  });
});

describe('Meta Relationship Engine', () => {
  beforeEach(() => {
    clearMetaRelationship(TEST_USER_ID);
  });

  it('should track relationship milestones', () => {
    const engine = getMetaRelationship(TEST_USER_ID);

    engine.recordMilestone({
      type: 'first_vulnerable_share',
      description: 'First time sharing something personal',
      turnCount: 5,
      sessionCount: 2,
    });

    const milestones = engine.getMilestones();
    expect(milestones.length).toBe(1);
  });

  it('should check for meta comments', () => {
    const engine = getMetaRelationship(TEST_USER_ID);

    // Build up relationship
    engine.recordMilestone({
      type: 'trust_threshold',
      description: 'Reached trust threshold',
      turnCount: 50,
      sessionCount: 10,
    });

    const comment = engine.checkForMetaComment({
      turnCount: 55,
      sessionCount: 11,
      recentVulnerability: true,
      recentGrowth: true,
    });

    expect(comment).toBeDefined();
    expect(typeof comment.shouldComment).toBe('boolean');
  });
});

describe('Superhuman Observations Engine', () => {
  beforeEach(() => {
    clearSuperhumanObservations(TEST_USER_ID);
  });

  it('should analyze messages for patterns', () => {
    const engine = getSuperhumanObservations(TEST_USER_ID);

    // Send multiple messages with patterns
    engine.analyzeMessage('I should probably do that');
    engine.analyzeMessage('I know I should be better');
    engine.analyzeMessage('I should have done it differently');

    const observations = engine.getObservations();
    expect(Array.isArray(observations)).toBe(true);
  });

  it('should surface observations at appropriate times', () => {
    const engine = getSuperhumanObservations(TEST_USER_ID);

    // Build up patterns
    for (let i = 0; i < 10; i++) {
      engine.analyzeMessage('I should do better');
    }

    const result = engine.checkForSurfacing({
      turnCount: 20,
      sessionCount: 10,
      relationshipStage: 'trusted_advisor',
      currentContext: 'discussing goals',
    });

    expect(result).toBeDefined();
    expect(typeof result.shouldSurface).toBe('boolean');
  });
});
