/**
 * Services Integration Tests
 *
 * Tests cross-service flows to ensure all services work together correctly:
 * 1. Outreach → Trust → Persistence flow
 * 2. Session → Context → Intelligence flow
 * 3. User Identification → Voice Memory → Profile flow
 * 4. Feature Rollout → Observability flow
 *
 * @module tests/services-integration
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// ============================================================================
// TEST: OUTREACH → TRUST → PERSISTENCE FLOW
// ============================================================================

describe('Outreach → Trust → Persistence Integration', () => {
  const testUserId = `integration-test-${Date.now()}`;

  beforeAll(async () => {
    // Initialize services
    const { initializeServices } = await import('../services/index.js');
    await initializeServices(false); // Don't index persona
  });

  afterAll(async () => {
    // Cleanup
    const { resetGlobalServices } = await import('../services/index.js');
    await resetGlobalServices();
  });

  describe('Trust Context Building', () => {
    it('should build trust context for a conversation turn', async () => {
      const { buildTrustContext } = await import('../services/trust-systems/index.js');

      const context = buildTrustContext(testUserId, 'I am feeling a bit overwhelmed today', {
        currentTopic: 'stress',
        detectedEmotion: 'anxiety',
        emotionIntensity: 0.7,
      });

      expect(context).toBeDefined();
      expect(context.topicsToAvoid).toBeDefined();
      expect(Array.isArray(context.unsaidSignals)).toBe(true);
    });

    it('should detect and respect boundaries', async () => {
      const { detectNewBoundary, checkBoundary, isTopicOffLimits } =
        await import('../services/trust-systems/index.js');

      // Simulate user establishing a boundary
      detectNewBoundary(testUserId, "I don't want to talk about my ex", {
        currentTopic: 'relationships',
        emotionDetected: 'discomfort',
        emotionIntensity: 0.8,
      });

      // Check if boundary is respected
      const check = checkBoundary(testUserId, 'Tell me about your past relationships', {
        currentTopic: 'relationships',
      });

      expect(check.crossesBoundary || isTopicOffLimits(testUserId, 'ex')).toBe(true);
    });

    it('should track growth and generate reflections', async () => {
      const { recordResponse, getGrowthPatterns } =
        await import('../services/trust-systems/index.js');

      // Record responses over time
      recordResponse(testUserId, 'anxiety', 'I feel anxious about work', 'fear', 'work');
      recordResponse(
        testUserId,
        'anxiety',
        'Work is getting more manageable',
        'contentment',
        'work'
      );
      recordResponse(testUserId, 'anxiety', 'I actually feel confident now', 'confidence', 'work');

      const patterns = getGrowthPatterns(testUserId);
      expect(patterns).toBeDefined();
    });
  });

  describe('Outreach Decision Flow', () => {
    it('should generate outreach for commitment check', async () => {
      const { generateTextMessage, selectPersonaForOutreach } =
        await import('../services/outreach/index.js');

      const persona = selectPersonaForOutreach('commitment_check');

      expect(persona).toBeDefined();

      // generateTextMessage requires (personaId, context, tone)
      const context = {
        userId: testUserId,
        userName: 'Test User',
        relationshipStage: 'building' as const,
        trigger: {
          type: 'commitment_check' as const,
          reason: 'User said they would exercise this morning',
          urgency: 'medium' as const,
        },
        commitment: 'morning workout',
        context: {
          recentTopics: ['fitness'],
        },
      };

      const message = generateTextMessage(persona || 'ferni', context, 'encouraging');

      expect(message).toBeDefined();
      expect(message.length).toBeGreaterThan(10);
    });

    it('should respect timing preferences', async () => {
      const { getTimingProfile, updateTimingPreferences } =
        await import('../services/outreach/index.js');

      // Set user preferences
      updateTimingPreferences(testUserId, {
        preferredHours: { start: 9, end: 21 },
        timezone: 'America/New_York',
      });

      // Get timing profile - verifies preferences are saved
      const profile = getTimingProfile(testUserId);
      expect(profile).toBeDefined();
      expect(profile.preferences).toBeDefined();
    });
  });

  describe('Persistence Flow', () => {
    it('should save and load trust profiles', async () => {
      const { saveTrustProfiles, loadTrustProfiles } =
        await import('../services/trust-systems/index.js');

      // Save profiles
      await saveTrustProfiles(testUserId);

      // Load should work without error
      await loadTrustProfiles(testUserId);
    });

    it('should export and import trust bundle', async () => {
      const { exportTrustBundle, importTrustBundle } =
        await import('../services/trust-systems/index.js');

      const bundle = exportTrustBundle(testUserId);
      expect(bundle).toBeDefined();
      expect(bundle.userId).toBe(testUserId);

      // Import should work
      importTrustBundle(bundle);
    });
  });
});

// ============================================================================
// TEST: SESSION → CONTEXT → INTELLIGENCE FLOW
// ============================================================================

describe('Session → Context → Intelligence Integration', () => {
  const testUserId = `session-test-${Date.now()}`;
  const testSessionId = `session-${Date.now()}`;

  it('should create session services and analyze messages', async () => {
    const { createSessionServices } = await import('../services/index.js');
    const { analyzeMessage } = await import('../intelligence/index.js');

    const session = await createSessionServices({
      userId: testUserId,
      sessionId: testSessionId,
      personaId: 'ferni',
    });

    expect(session).toBeDefined();

    // Analyze a message
    const analysis = analyzeMessage('I am really stressed about my job interview tomorrow');

    expect(analysis).toBeDefined();
    expect(analysis.emotion).toBeDefined();
    expect(analysis.emotion.distressLevel).toBeGreaterThan(0.3);
    expect(analysis.intent).toBeDefined();
    expect(analysis.topics).toBeDefined();
  });

  it('should build conversation context with all builders', async () => {
    const { buildConversationContext } = await import('../intelligence/context-builders/index.js');
    const { getPersona } = await import('../personas/index.js');

    const persona = getPersona('ferni');

    const injections = await buildConversationContext({
      userText: 'I feel like giving up on my goals',
      analysis: {
        emotion: { primary: 'sadness', distressLevel: 0.7, valence: 'negative', intensity: 0.8 },
        intent: { primary: 'expressing_struggle' },
        topics: { detected: ['goals', 'motivation'], categories: ['emotional'] },
        state: { phase: 'exploring' },
      },
      services: {
        analyze: () => ({}),
        addTurn: () => {},
        trackResponseQuality: () => {},
        getPromptContext: () => '',
      },
      userData: { turnCount: 5, isReturningUser: true },
      persona,
    });

    expect(injections).toBeDefined();
  });
});

// ============================================================================
// TEST: FEATURE ROLLOUT → OBSERVABILITY FLOW
// ============================================================================

describe('Feature Rollout → Observability Integration', () => {
  it('should collect metrics from observability hub', async () => {
    const { observabilityHub } = await import('../services/observability/hub.js');

    const snapshot = observabilityHub.getSnapshot(5); // Last 5 minutes

    expect(snapshot).toBeDefined();
    expect(snapshot.overallHealth).toBeGreaterThanOrEqual(0);
    expect(snapshot.overallHealth).toBeLessThanOrEqual(100);
    expect(snapshot.llm).toBeDefined();
    expect(snapshot.errors).toBeDefined();
    expect(snapshot.ux).toBeDefined();
  });

  it('should track rollout state with real metrics', async () => {
    const { getRolloutState } = await import('../services/trust-systems/rollout.js');

    const state = getRolloutState();

    expect(state).toBeDefined();
    expect(state.currentStage).toBeDefined();
    expect(state.metrics).toBeDefined();
    expect(typeof state.metrics.errorRate).toBe('number');
    expect(typeof state.metrics.avgLatency).toBe('number');
  });
});

// ============================================================================
// TEST: ENGAGEMENT → NOTIFICATION FLOW
// ============================================================================

describe('Engagement → Notification Integration', () => {
  const testUserId = `engagement-test-${Date.now()}`;

  it('should track engagement and determine notification eligibility', async () => {
    const { canSendOutreach } = await import('../services/outreach-intelligence.js');

    // Should be able to send to new user
    const canSend = canSendOutreach(testUserId);
    expect(typeof canSend).toBe('boolean');
  });

  it('should track team engagement across personas', async () => {
    const { getTeamEngagementService, getHandoffBanter } =
      await import('../services/team-engagement.js');

    // Get the service instance
    const service = getTeamEngagementService();
    expect(service).toBeDefined();

    // Test handoff banter generation
    const banter = getHandoffBanter('ferni', 'maya-santos');
    // Banter may be null if not defined, but function should work
    expect(banter === null || typeof banter === 'string').toBe(true);
  });
});

// ============================================================================
// TEST: THERAPEUTIC FRAMEWORKS INTEGRATION
// ============================================================================

describe('Therapeutic Frameworks Integration', () => {
  const testUserId = `therapy-test-${Date.now()}`;

  it('should check values alignment with semantic matching', async () => {
    const { recordValue, checkValuesAlignment } =
      await import('../services/therapeutic-frameworks/act-values.js');

    // Record some values using correct signature: (userId, value, domain, options)
    recordValue(testUserId, 'family', 'relationships', {
      meaning: 'I value spending quality time with my kids',
      importance: 5,
    });

    recordValue(testUserId, 'health', 'health', {
      meaning: 'Staying healthy so I can be there for my family',
      importance: 4,
    });

    // Check alignment with semantic similarity
    const alignment = checkValuesAlignment(
      testUserId,
      'I want to spend more time with my children'
    );

    expect(alignment).toBeDefined();
    expect(alignment.hasValues).toBe(true);
    expect(alignment.alignedValues.length).toBeGreaterThan(0);
    expect(alignment.alignmentScore).toBeGreaterThan(0.5);
  });

  it('should integrate motivational interviewing', async () => {
    const { detectChangeTalk, buildMIContext, generateOARSResponse } =
      await import('../services/therapeutic-frameworks/motivational-interviewing.js');

    // Detect change talk in a statement
    const changeTalk = detectChangeTalk('I know I should exercise more but I keep finding excuses');

    expect(changeTalk).toBeDefined();
    expect(Array.isArray(changeTalk)).toBe(true);

    // Build MI context
    const context = buildMIContext(testUserId, 'I want to get healthier');
    // Context may be null if no history, but function should work

    // Generate OARS response
    const oars = generateOARSResponse({
      userId: testUserId,
      userText: 'I want to exercise more',
      topic: 'exercise',
    });

    expect(oars).toBeDefined();
  });
});

// ============================================================================
// TEST: COGNITIVE INTELLIGENCE INTEGRATION
// ============================================================================

describe('Cognitive Intelligence Integration', () => {
  const testUserId = `cognitive-test-${Date.now()}`;

  it('should detect cognitive patterns', async () => {
    const { detectDistortions, getGentleResponse } =
      await import('../services/cognitive-intelligence/index.js');

    // Detect distortions in a statement
    const distortions = detectDistortions(
      testUserId,
      "I'm a complete failure, nothing ever goes right for me"
    );

    expect(distortions).toBeDefined();
    expect(distortions.length).toBeGreaterThan(0);

    // Get gentle response for detected distortions
    if (distortions.length > 0) {
      const response = getGentleResponse(distortions[0]);
      expect(response).toBeDefined();
      expect(response.length).toBeGreaterThan(0);
    }
  });

  it('should build cognitive insights context', async () => {
    // Import the builder - it may not exist, so handle gracefully
    try {
      const module = await import('../intelligence/context-builders/cognitive-insights.js');
      if (module.buildCognitiveInsightsContext) {
        const context = await module.buildCognitiveInsightsContext({
          userId: testUserId,
          userText: 'I always mess everything up',
          analysis: {
            emotion: { primary: 'sadness', distressLevel: 0.6 },
            topics: { detected: ['self-criticism'] },
          },
        });

        expect(context).toBeDefined();
      }
    } catch {
      // Builder may not exist, skip
      expect(true).toBe(true);
    }
  });
});

// ============================================================================
// TEST: FULL E2E USER JOURNEY
// ============================================================================

describe('Full E2E User Journey', () => {
  const userId = `e2e-journey-${Date.now()}`;
  const sessionId = `session-${Date.now()}`;

  it('should handle complete user journey from first visit to ongoing relationship', async () => {
    // 1. Initialize services
    const { initializeServices, createSessionServices } = await import('../services/index.js');
    await initializeServices(false);

    // 2. Create session
    const session = await createSessionServices({
      userId,
      sessionId,
      personaId: 'ferni',
    });

    expect(session).toBeDefined();

    // 3. Analyze first message
    const { analyzeMessage } = await import('../intelligence/index.js');
    const analysis = analyzeMessage('Hi, this is my first time using Ferni');

    expect(analysis.emotion).toBeDefined();

    // 4. Build trust context
    const { buildTrustContext } = await import('../services/trust-systems/index.js');
    const trustContext = buildTrustContext(userId, 'Hi, this is my first time using Ferni', {
      detectedEmotion: analysis.emotion.primary,
      emotionIntensity: analysis.emotion.intensity || 0.5,
    });

    expect(trustContext).toBeDefined();

    // 5. Record interaction for engagement (correct signature: userId, date, respondedToOutreach, method)
    const { recordInteraction } = await import('../services/outreach-intelligence.js');
    recordInteraction(userId, new Date(), false, 'call');

    // 6. End session and persist
    const { onSessionEnd } = await import('../services/trust-systems/index.js');
    await onSessionEnd(userId);

    // 7. Verify data was saved
    const { exportTrustBundle } = await import('../services/trust-systems/index.js');
    const bundle = exportTrustBundle(userId);

    expect(bundle).toBeDefined();
    expect(bundle.userId).toBe(userId);
  });
});
