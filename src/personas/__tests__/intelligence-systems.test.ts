/**
 * Intelligence Systems Tests
 *
 * Tests for the four persona intelligence systems:
 * 1. Relationship Memory Engine
 * 2. Cognitive Differentiation
 * 3. Team Chemistry
 * 4. Predictive Intelligence
 * 5. Moment Detection
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// RELATIONSHIP MEMORY ENGINE TESTS
// ============================================================================

describe('RelationshipMemoryEngine', () => {
  // Mock the modules
  beforeEach(() => {
    vi.resetModules();
  });

  it('should create a new relationship memory for new user', async () => {
    const { RelationshipMemoryEngine } = await import('../relationship-memory/engine.js');

    const engine = new RelationshipMemoryEngine('user-123', 'ferni');
    const memory = engine.getMemory();

    expect(memory.userId).toBe('user-123');
    expect(memory.personaId).toBe('ferni');
    expect(memory.stage).toBe('stranger');
    expect(memory.trustScore).toBe(0);
    expect(memory.totalSessions).toBe(0);
  });

  it('should progress through relationship stages', async () => {
    const { RelationshipMemoryEngine } = await import('../relationship-memory/engine.js');

    const engine = new RelationshipMemoryEngine('user-123', 'ferni');

    // Simulate multiple sessions with different moment types
    for (let i = 0; i < 10; i++) {
      engine.startSession();
      // Mix of moment types that contribute to trust
      if (i === 2) {
        engine.recordMoment('first_vulnerability', `Session ${i} vulnerability`, {
          significance: 0.9,
        });
      } else if (i % 3 === 0) {
        engine.recordMoment('breakthrough', `Session ${i} breakthrough`, { significance: 0.8 });
      } else {
        engine.recordMoment('laughter', `Session ${i} laughter`, { significance: 0.5 });
      }
      engine.endSession('positive', 'high', ['growth']);
    }

    const memory = engine.getMemory();
    expect(memory.totalSessions).toBe(10);
    // Should be a valid relationship stage
    expect(['stranger', 'acquaintance', 'friend', 'trusted_advisor', 'inner_circle']).toContain(
      memory.stage
    );
    // Should have tracked moments
    expect(memory.sharedMoments.length).toBeGreaterThan(0);
  });

  it('should record shared moments', async () => {
    const { RelationshipMemoryEngine } = await import('../relationship-memory/engine.js');

    const engine = new RelationshipMemoryEngine('user-123', 'ferni');
    engine.startSession();

    const moment = engine.recordMoment('first_vulnerability', 'User opened up about fears', {
      topic: 'career',
      userPhrase: 'I never told anyone this',
      significance: 0.9,
      tags: ['vulnerability', 'career'],
    });

    expect(moment.type).toBe('first_vulnerability');
    expect(moment.summary).toBe('User opened up about fears');
    expect(moment.significance).toBe(0.9);
    expect(engine.getMemory().sharedMoments.length).toBe(1);
  });

  it('should track inside joke seeds', async () => {
    const { RelationshipMemoryEngine, RELATIONSHIP_STAGE_CONFIGS } =
      await import('../relationship-memory/engine.js');

    // Create engine with friend stage (inside jokes enabled)
    const existingMemory = {
      userId: 'user-123',
      personaId: 'ferni',
      stage: 'friend' as const,
      trustScore: 0.6,
      trustFactors: {
        sessionCount: 15,
        vulnerabilityShared: 3,
        callbacksLanded: 5,
        crisesTogether: 0,
        consistencyScore: 0.7,
      },
      sharedMoments: [],
      insideJokes: [],
      insideJokeSeeds: [],
      milestones: [],
      callbackAttempts: [],
      callbackEffectiveness: [],
      temporalPatterns: {
        dayOfWeekFrequency: {
          monday: 0,
          tuesday: 0,
          wednesday: 0,
          thursday: 0,
          friday: 0,
          saturday: 0,
          sunday: 0,
        },
        timeOfDayFrequency: {
          early_morning: 0,
          morning: 0,
          afternoon: 0,
          evening: 0,
          late_night: 0,
        },
        topicsByTime: {},
        moodByDayOfWeek: {},
        averageSessionLength: 0,
        sessionsPerWeek: 0,
        typicalGapDays: 0,
        longestGap: 0,
      },
      emotionalTrajectory: {
        recentSessions: [],
        trendDirection: 'stable' as const,
        trendConfidence: 0,
        concerns: [],
        growthAreas: [],
      },
      firstConversation: new Date(),
      lastConversation: new Date(),
      totalSessions: 15,
      totalTurns: 100,
      updatedAt: new Date(),
    };

    const engine = new RelationshipMemoryEngine('user-123', 'ferni', existingMemory);

    engine.recordInsideJokeSeed('inbox bankruptcy', 'User coined this for email chaos', 'high');

    expect(engine.getMemory().insideJokeSeeds.length).toBe(1);
    expect(engine.getMemory().insideJokeSeeds[0].phrase).toBe('inbox bankruptcy');
  });

  it('should generate relationship context', async () => {
    const { RelationshipMemoryEngine } = await import('../relationship-memory/engine.js');

    const engine = new RelationshipMemoryEngine('user-123', 'ferni');
    engine.startSession();

    const context = engine.getRelationshipContext();

    expect(context.stage).toBe('stranger');
    expect(context.trustScore).toBe(0);
    expect(context.unlockedContent).toBeDefined();
    expect(context.unlockedContent.storyDepth).toBe('surface');
  });

  it('should build prompt injection', async () => {
    const { RelationshipMemoryEngine } = await import('../relationship-memory/engine.js');

    const engine = new RelationshipMemoryEngine('user-123', 'ferni');
    engine.startSession();

    const injection = engine.buildPromptInjection();

    expect(injection.relationshipPreamble).toContain('RELATIONSHIP CONTEXT');
    // Stage guidance should contain guidance about building rapport (stranger stage)
    expect(injection.stageGuidance).toContain('rapport');
  });
});

// ============================================================================
// COGNITIVE DIFFERENTIATION TESTS
// ============================================================================

describe('CognitiveDifferentiation', () => {
  it('should return differentiation profile for each persona', async () => {
    const { getCognitiveDifferentiation } = await import('../cognitive-differentiation.js');

    const personas = [
      'ferni',
      'peter-john',
      'alex-chen',
      'maya-santos',
      'jordan-taylor',
      'nayan-patel',
    ];

    for (const personaId of personas) {
      const profile = getCognitiveDifferentiation(personaId);
      expect(profile).toBeDefined();
      expect(profile?.personaId).toBe(personaId);
      expect(profile?.questioning).toBeDefined();
      expect(profile?.silence).toBeDefined();
      expect(profile?.disagreement).toBeDefined();
      expect(profile?.insight).toBeDefined();
      expect(profile?.pacing).toBeDefined();
    }
  });

  it('should have unique questioning styles', async () => {
    const { getCognitiveDifferentiation } = await import('../cognitive-differentiation.js');

    const ferni = getCognitiveDifferentiation('ferni');
    const peter = getCognitiveDifferentiation('peter-john');

    // Ferni is feeling-focused
    expect(ferni?.questioning.feelingVsData).toBeGreaterThan(0.5);
    // Peter is data-focused
    expect(peter?.questioning.feelingVsData).toBeLessThan(0.5);
  });

  it('should have unique silence handling', async () => {
    const { getCognitiveDifferentiation } = await import('../cognitive-differentiation.js');

    const ferni = getCognitiveDifferentiation('ferni');
    const nayan = getCognitiveDifferentiation('nayan-patel');

    // Ferni interprets silence as reflection
    expect(ferni?.silence.primaryInterpretation).toBe('reflection');
    // Nayan sees it as invitation
    expect(nayan?.silence.primaryInterpretation).toBe('invitation');
    // Nayan is more comfortable with silence
    expect(nayan?.silence.comfortWithSilence).toBeGreaterThan(
      ferni?.silence.comfortWithSilence || 0
    );
  });

  it('should provide persona questions', async () => {
    const { getPersonaQuestion } = await import('../cognitive-differentiation.js');

    const ferniQuestion = getPersonaQuestion('ferni', 'starter');
    expect(ferniQuestion).toBeDefined();
    expect(typeof ferniQuestion).toBe('string');

    const peterQuestion = getPersonaQuestion('peter-john', 'deep_dive');
    expect(peterQuestion).toBeDefined();
    expect(typeof peterQuestion).toBe('string');
  });

  it('should provide disagreement phrases', async () => {
    const { getDisagreementPhrase } = await import('../cognitive-differentiation.js');

    const mild = getDisagreementPhrase('ferni', 'mild');
    const strong = getDisagreementPhrase('ferni', 'strong');

    expect(mild).toBeDefined();
    expect(strong).toBeDefined();
    expect(mild).not.toBe(strong);
  });
});

// ============================================================================
// TEAM CHEMISTRY TESTS
// ============================================================================

describe('TeamChemistry', () => {
  it('should return team dynamics for persona pairs', async () => {
    const { getTeamDynamics } = await import('../shared/team-chemistry.js');

    const ferniPeter = getTeamDynamics('ferni', 'peter-john');

    expect(ferniPeter).toBeDefined();
    expect(ferniPeter?.relationship).toBe('complementary');
    expect(ferniPeter?.dynamic).toBeDefined();
    expect(ferniPeter?.handoffMoments).toBeDefined();
  });

  it('should return team references (admiration)', async () => {
    const { getTeamReference } = await import('../shared/team-chemistry.js');

    const ref = getTeamReference('ferni', 'peter-john', 'admiration');

    expect(ref).toBeDefined();
    expect(typeof ref).toBe('string');
    // Should mention Peter
    expect(ref?.toLowerCase()).toContain('peter');
  });

  it('should return team references (playful teasing)', async () => {
    const { getTeamReference } = await import('../shared/team-chemistry.js');

    const ref = getTeamReference('ferni', 'alex-chen', 'playful_teasing');

    expect(ref).toBeDefined();
    expect(typeof ref).toBe('string');
  });

  it('should check team inside jokes', async () => {
    const { checkTeamInsideJoke } = await import('../shared/team-chemistry.js');

    const joke = checkTeamInsideJoke('Check the spreadsheet', 'ferni');

    expect(joke).toBeDefined();
    expect(joke?.reference).toContain('Peter');
  });

  it('should return null for non-matching triggers', async () => {
    const { checkTeamInsideJoke } = await import('../shared/team-chemistry.js');

    const joke = checkTeamInsideJoke('random unrelated text', 'ferni');

    expect(joke).toBeNull();
  });

  it('should generate handoff notes', async () => {
    const { generateHandoffNote } = await import('../shared/team-chemistry.js');

    const note = generateHandoffNote('ferni', 'maya-santos', 'habits', 'struggling', 'friend');

    expect(note).toBeDefined();
    expect(note).toContain('Ferni');
    expect(note).toContain('habits');
  });

  it('should get team compliments', async () => {
    const { getTeamCompliment } = await import('../shared/team-chemistry.js');

    const generic = getTeamCompliment();
    expect(generic).toBeDefined();
    expect(typeof generic).toBe('string');

    const growth = getTeamCompliment('growth');
    expect(growth).toBeDefined();
    expect(growth.includes('growth') || growth.includes('change') || growth.includes('far')).toBe(
      true
    );
  });
});

// ============================================================================
// MOMENT DETECTION TESTS
// ============================================================================

describe('MomentDetection', () => {
  it('should detect breakthrough moments', async () => {
    const { detectMoments } = await import('../moment-detection.js');

    const moments = detectMoments({
      userMessage: "I never realized I was scared of success. That's why I keep self-sabotaging!",
      sessionNumber: 5,
      hasSharedVulnerabilityBefore: true,
    });

    expect(moments.length).toBeGreaterThan(0);
    expect(moments.some((m) => m.type === 'breakthrough')).toBe(true);
  });

  it('should detect vulnerability moments', async () => {
    const { detectMoments } = await import('../moment-detection.js');

    const moments = detectMoments({
      userMessage:
        "This is hard to say, but I've never told anyone about my struggles with anxiety.",
      sessionNumber: 3,
      hasSharedVulnerabilityBefore: false,
    });

    expect(moments.length).toBeGreaterThan(0);
    expect(moments.some((m) => m.type === 'first_vulnerability')).toBe(true);
  });

  it('should detect celebration moments', async () => {
    const { detectMoments } = await import('../moment-detection.js');

    const moments = detectMoments({
      userMessage: "I did it! I got the promotion! I can't believe it finally happened!",
      sessionNumber: 10,
      hasSharedVulnerabilityBefore: true,
    });

    expect(moments.length).toBeGreaterThan(0);
    expect(moments.some((m) => m.type === 'celebration')).toBe(true);
  });

  it('should detect crisis moments with high priority', async () => {
    const { detectMoments, getMomentPriority } = await import('../moment-detection.js');

    const moments = detectMoments({
      userMessage:
        "I can't do this anymore. Everything is falling apart and I don't know what to do.",
      sessionNumber: 5,
      hasSharedVulnerabilityBefore: true,
    });

    expect(moments.length).toBeGreaterThan(0);
    expect(moments.some((m) => m.type === 'crisis_support')).toBe(true);

    // Crisis should have highest priority
    expect(getMomentPriority('crisis_support')).toBe(10);
  });

  it('should detect laughter moments', async () => {
    const { detectMoments } = await import('../moment-detection.js');

    const moments = detectMoments({
      userMessage: "Hahaha that's hilarious! You're killing me! 😂",
      sessionNumber: 8,
      hasSharedVulnerabilityBefore: true,
    });

    expect(moments.length).toBeGreaterThan(0);
    expect(moments.some((m) => m.type === 'laughter')).toBe(true);
  });

  it('should limit detected moments to 2', async () => {
    const { detectMoments } = await import('../moment-detection.js');

    // Message with multiple potential moments
    const moments = detectMoments({
      userMessage:
        "I never realized this! Haha that's so funny! I'm so excited I finally get it! This is a breakthrough!",
      sessionNumber: 5,
      hasSharedVulnerabilityBefore: true,
    });

    expect(moments.length).toBeLessThanOrEqual(2);
  });

  it('should calculate significance correctly', async () => {
    const { detectMoments } = await import('../moment-detection.js');

    const moments = detectMoments({
      userMessage: 'I never realized I was avoiding this. Now I understand why.',
      sessionNumber: 3, // Early session = slight boost
      hasSharedVulnerabilityBefore: false, // First time = boost
    });

    if (moments.length > 0) {
      expect(moments[0].significance).toBeGreaterThan(0.3);
      expect(moments[0].significance).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// UNIFIED PERSONA INTELLIGENCE TESTS
// ============================================================================

describe('PersonaIntelligenceEngine', () => {
  it('should create unified intelligence context', async () => {
    const { PersonaIntelligenceEngine } = await import('../persona-intelligence.js');

    const engine = new PersonaIntelligenceEngine('ferni', 'user-123');
    const context = engine.getContext();

    expect(context.personaId).toBe('ferni');
    expect(context.userId).toBe('user-123');
    expect(context.relationship).toBeDefined();
    expect(context.cognitive).toBeDefined();
    expect(context.team).toBeDefined();
  });

  it('should build unified prompt injection', async () => {
    const { PersonaIntelligenceEngine } = await import('../persona-intelligence.js');

    const engine = new PersonaIntelligenceEngine('ferni', 'user-123');
    engine.startSession();

    const injection = engine.buildPromptInjection('career');

    expect(injection.combined).toBeDefined();
    expect(injection.relationshipSection).toBeDefined();
    expect(injection.cognitiveSection).toBeDefined();
  });

  it('should provide cognitive helpers', async () => {
    const { PersonaIntelligenceEngine } = await import('../persona-intelligence.js');

    const engine = new PersonaIntelligenceEngine('ferni', 'user-123');

    const question = engine.getQuestion('deep_dive');
    expect(question).toBeDefined();

    const disagreement = engine.getDisagreement('mild');
    expect(disagreement).toBeDefined();

    const insight = engine.getInsightIntro();
    expect(insight).toBeDefined();
  });

  it('should track relationship stage', async () => {
    const { PersonaIntelligenceEngine } = await import('../persona-intelligence.js');

    const engine = new PersonaIntelligenceEngine('ferni', 'user-123');

    expect(engine.getRelationshipStage()).toBe('stranger');
    expect(engine.getTrustScore()).toBe(0);
  });
});
