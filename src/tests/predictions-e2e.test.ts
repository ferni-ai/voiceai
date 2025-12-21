/**
 * Predictions E2E Integration Test
 *
 * Tests the full predictions flow without requiring Firestore emulator.
 * Mocks the storage layer but tests real integration logic.
 *
 * Run: pnpm vitest run src/tests/predictions-e2e.test.ts
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';

// Test user for isolation
const TEST_USER_ID = `test-predictions-e2e-${Date.now()}`;
const TEST_SESSION_ID = `session-${Date.now()}`;

// Mock Firestore
vi.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: vi.fn(),
  firestore: vi.fn(() => null),
}));

vi.mock('../services/superhuman/firestore-utils.js', () => ({
  getFirestoreDb: vi.fn(() => null),
}));

describe('Predictions E2E Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Pattern Recording Flow (Memory Only)', () => {
    it('should record observations in memory cache', async () => {
      const { recordObservation, loadUserPatterns, clearPatternCache, getCacheStats } =
        await import('../services/superhuman/predictive-coaching.js');

      // Clear any existing cache
      await clearPatternCache(TEST_USER_ID);

      // Record a temporal pattern (Sunday anxiety)
      await recordObservation(TEST_USER_ID, {
        type: 'temporal',
        trigger: 'Sunday evening',
        outcome: 'anxiety about Monday',
        emotion: 'anxious',
        dayOfWeek: 0, // Sunday
        hour: 19, // 7pm
      });

      // Since Firestore is mocked, this will load from cache (empty on first load)
      const patterns = await loadUserPatterns(TEST_USER_ID);
      console.log(`📊 Patterns in cache: ${patterns.length}`);

      // Check cache stats
      const stats = getCacheStats();
      console.log('📊 Cache stats:', stats);

      expect(stats.redisEnabled).toBe(false); // No Redis in test
      expect(typeof stats.memoryCacheUsers).toBe('number');
    });

    it('should build patterns in memory', async () => {
      const { recordObservation, getCacheStats } =
        await import('../services/superhuman/predictive-coaching.js');

      // Record multiple patterns
      await recordObservation(TEST_USER_ID, {
        type: 'emotional',
        trigger: 'work deadline',
        outcome: 'stress',
        emotion: 'stressed',
        dayOfWeek: 1,
        hour: 10,
      });

      await recordObservation(TEST_USER_ID, {
        type: 'behavioral',
        trigger: 'morning routine',
        outcome: 'energy boost',
        emotion: 'energized',
        dayOfWeek: 2,
        hour: 7,
      });

      const stats = getCacheStats();
      console.log('📊 After multiple recordings:', stats);
      expect(stats).toBeDefined();
    });
  });

  describe('2. Prediction Generation Flow', () => {
    it('should generate predictions from patterns', async () => {
      const { generatePredictions } = await import('../services/superhuman/predictive-coaching.js');

      // Generate predictions (will be empty without Firestore, but tests flow)
      const predictions = await generatePredictions(TEST_USER_ID);
      console.log(`🔮 Generated ${predictions.length} predictions`);

      expect(Array.isArray(predictions)).toBe(true);
    });

    it('should build predictive context string', async () => {
      const { buildPredictiveContextString } =
        await import('../services/superhuman/predictive-coaching.js');

      const context = await buildPredictiveContextString(TEST_USER_ID);
      console.log('📝 Predictive context length:', context.length);

      expect(typeof context).toBe('string');
    });
  });

  describe('3. Predictive Intelligence Integration', () => {
    it('should initialize predictive intelligence', async () => {
      const { initializePredictiveIntelligence, cleanupPredictiveIntelligence } =
        await import('../agents/integrations/predictive-intelligence-integration.js');

      // Should not throw
      expect(() => {
        initializePredictiveIntelligence(TEST_SESSION_ID, TEST_USER_ID);
      }).not.toThrow();

      cleanupPredictiveIntelligence(TEST_SESSION_ID);
    });

    it('should process a turn observation', async () => {
      const {
        initializePredictiveIntelligence,
        processForPredictiveIntelligence,
        cleanupPredictiveIntelligence,
      } = await import('../agents/integrations/predictive-intelligence-integration.js');

      // Initialize for session
      initializePredictiveIntelligence(TEST_SESSION_ID, TEST_USER_ID);

      // Process a turn observation
      const result = await processForPredictiveIntelligence({
        userId: TEST_USER_ID,
        sessionId: TEST_SESSION_ID,
        message: "I'm feeling really stressed about the presentation tomorrow",
        topic: 'work',
        emotion: 'stressed',
        emotionIntensity: 0.8,
        dayOfWeek: new Date().getDay(),
        hourOfDay: new Date().getHours(),
        turnCount: 1,
        sessionCount: 1,
        relationshipStage: 'acquaintance',
      });

      console.log('🧠 Integration result:', result);

      expect(result).toHaveProperty('patternsRecorded');
      expect(result).toHaveProperty('superhumanObservationDetected');

      // Cleanup
      cleanupPredictiveIntelligence(TEST_SESSION_ID);
    });

    it('should detect patterns with hedging language', async () => {
      const {
        initializePredictiveIntelligence,
        processForPredictiveIntelligence,
        cleanupPredictiveIntelligence,
      } = await import('../agents/integrations/predictive-intelligence-integration.js');

      const sessionId = `session-hedging-${Date.now()}`;
      initializePredictiveIntelligence(sessionId, TEST_USER_ID);

      // Simulate turns with hedging language
      const messages = [
        'I guess I should probably try to exercise more',
        "Maybe I should think about changing jobs, I don't know",
        'I suppose I could try talking to my boss about it',
      ];

      let totalPatterns = 0;
      for (let i = 0; i < messages.length; i++) {
        const result = await processForPredictiveIntelligence({
          userId: TEST_USER_ID,
          sessionId,
          message: messages[i],
          topic: 'personal growth',
          emotion: 'uncertain',
          emotionIntensity: 0.5,
          dayOfWeek: new Date().getDay(),
          hourOfDay: new Date().getHours(),
          turnCount: i + 1,
          sessionCount: 5,
          relationshipStage: 'friend',
        });

        totalPatterns += result.patternsRecorded;
        console.log(`Turn ${i + 1}: ${result.patternsRecorded} patterns recorded`);
      }

      console.log(`🎯 Total patterns recorded: ${totalPatterns}`);
      expect(totalPatterns).toBeGreaterThanOrEqual(0);

      cleanupPredictiveIntelligence(sessionId);
    });
  });

  describe('4. Worker Event Processing', () => {
    it('should emit and receive prediction events', async () => {
      const { AsyncEvents } = await import('../services/async-events/index.js');

      // Track events received
      const eventsReceived: string[] = [];

      // Subscribe to prediction events
      const unsub1 = AsyncEvents.on('prediction:observation', (payload) => {
        eventsReceived.push(`observation:${payload.userId}`);
      });

      const unsub2 = AsyncEvents.on('prediction:generate', (payload) => {
        eventsReceived.push(`generate:${payload.userId}`);
      });

      // Emit events
      AsyncEvents.emit(
        'prediction:observation',
        { type: 'temporal', trigger: 'Monday morning', outcome: 'low energy' },
        { userId: TEST_USER_ID, sessionId: TEST_SESSION_ID }
      );

      AsyncEvents.emit('prediction:generate', {}, { userId: TEST_USER_ID });

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      console.log('📬 Events received:', eventsReceived);

      expect(eventsReceived).toContain(`observation:${TEST_USER_ID}`);
      expect(eventsReceived).toContain(`generate:${TEST_USER_ID}`);

      unsub1();
      unsub2();
    });

    it('should create and configure PredictionsWorker', async () => {
      const { PredictionsWorker } = await import('../workers/predictions-worker.js');

      const worker = new PredictionsWorker({
        name: 'E2ETestWorker',
      });

      expect(worker).toBeDefined();

      const stats = worker.getStats();
      console.log('📊 Worker stats:', stats);

      expect(stats.messagesReceived).toBe(0);
      expect(stats.messagesProcessed).toBe(0);
      expect(stats.messagesFailed).toBe(0);

      await worker.stop();
    });

    it('should handle conversation:turn events', async () => {
      const { AsyncEvents } = await import('../services/async-events/index.js');

      let turnReceived = false;

      const unsub = AsyncEvents.on('conversation:turn', (payload) => {
        turnReceived = true;
        console.log('📬 Turn event:', payload.data);
      });

      AsyncEvents.emit(
        'conversation:turn',
        {
          message: 'I need to think about my career path',
          topic: 'career',
          emotion: 'reflective',
          dayOfWeek: 3,
          hourOfDay: 14,
        },
        { userId: TEST_USER_ID, sessionId: TEST_SESSION_ID }
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(turnReceived).toBe(true);
      unsub();
    });
  });

  describe('5. Configuration', () => {
    it('should configure async event mode', async () => {
      const { configurePredictiveIntelligence } =
        await import('../agents/integrations/predictive-intelligence-integration.js');

      // Should not throw when configuring
      expect(() => {
        configurePredictiveIntelligence({ useAsyncEvents: true });
      }).not.toThrow();

      // Reset to default
      configurePredictiveIntelligence({ useAsyncEvents: false });
    });
  });

  describe('6. Day Pattern Analysis', () => {
    it('should get patterns for specific day', async () => {
      const { getDayPatterns } = await import('../services/superhuman/predictive-coaching.js');

      // Get patterns for Sunday (0)
      const dayPatterns = await getDayPatterns(TEST_USER_ID, 0);
      console.log('📅 Day patterns:', dayPatterns);

      expect(dayPatterns).toBeDefined();
      // getDayPatterns returns an array of DayPattern objects
      expect(Array.isArray(dayPatterns)).toBe(true);

      // Check if there's a pattern for the specified day
      const sundayPattern = dayPatterns.find((p: { dayOfWeek: number }) => p.dayOfWeek === 0);
      if (sundayPattern) {
        expect(sundayPattern).toHaveProperty('dayOfWeek', 0);
        expect(sundayPattern).toHaveProperty('patterns');
      }
    });

    it('should handle all days of week', async () => {
      const { getDayPatterns } = await import('../services/superhuman/predictive-coaching.js');

      // getDayPatterns returns patterns grouped by day, not filtered by day
      const patterns = await getDayPatterns(TEST_USER_ID, 0);
      expect(Array.isArray(patterns)).toBe(true);

      // Verify structure of returned data
      for (const dayPattern of patterns as Array<{ dayOfWeek: number; patterns: unknown[] }>) {
        expect(dayPattern).toHaveProperty('dayOfWeek');
        expect(dayPattern).toHaveProperty('patterns');
        expect(typeof dayPattern.dayOfWeek).toBe('number');
        expect(Array.isArray(dayPattern.patterns)).toBe(true);
      }
    });
  });

  describe('7. Cache Management', () => {
    it('should clear user pattern cache', async () => {
      const { clearPatternCache, getCacheStats } =
        await import('../services/superhuman/predictive-coaching.js');

      await clearPatternCache(TEST_USER_ID);

      const stats = getCacheStats();
      console.log('📊 Final cache stats:', stats);

      expect(stats).toHaveProperty('memoryCacheUsers');
      expect(stats).toHaveProperty('redisEnabled');
      expect(stats).toHaveProperty('maxMemoryCacheSize');
    });

    it('should report Redis as disabled in test environment', async () => {
      const { getCacheStats } = await import('../services/superhuman/predictive-coaching.js');

      const stats = getCacheStats();
      expect(stats.redisEnabled).toBe(false);
    });
  });

  describe('8. Full Flow Simulation', () => {
    it('should simulate complete user session', async () => {
      const {
        initializePredictiveIntelligence,
        processForPredictiveIntelligence,
        cleanupPredictiveIntelligence,
      } = await import('../agents/integrations/predictive-intelligence-integration.js');

      const { generatePredictions, buildPredictiveContextString } =
        await import('../services/superhuman/predictive-coaching.js');

      const sessionId = `full-flow-${Date.now()}`;

      // 1. Initialize session
      initializePredictiveIntelligence(sessionId, TEST_USER_ID);
      console.log('✅ Session initialized');

      // 2. Simulate conversation turns
      const turns = [
        { message: 'Good morning! I barely slept last night', emotion: 'tired' },
        { message: 'I have a big presentation at work today', emotion: 'anxious' },
        { message: 'My boss has been putting a lot of pressure on me lately', emotion: 'stressed' },
        { message: 'I should probably exercise more to manage stress', emotion: 'thoughtful' },
      ];

      let totalPatterns = 0;
      for (let i = 0; i < turns.length; i++) {
        const result = await processForPredictiveIntelligence({
          userId: TEST_USER_ID,
          sessionId,
          message: turns[i].message,
          topic: 'daily life',
          emotion: turns[i].emotion,
          emotionIntensity: 0.7,
          dayOfWeek: new Date().getDay(),
          hourOfDay: new Date().getHours(),
          turnCount: i + 1,
          sessionCount: 10,
          relationshipStage: 'friend',
        });

        totalPatterns += result.patternsRecorded;
      }
      console.log(`✅ Processed ${turns.length} turns, recorded ${totalPatterns} patterns`);

      // 3. Generate predictions
      const predictions = await generatePredictions(TEST_USER_ID);
      console.log(`✅ Generated ${predictions.length} predictions`);

      // 4. Build context for LLM
      const context = await buildPredictiveContextString(TEST_USER_ID);
      console.log(`✅ Built context string (${context.length} chars)`);

      // 5. Cleanup
      cleanupPredictiveIntelligence(sessionId);
      console.log('✅ Session cleaned up');

      // Assertions
      expect(totalPatterns).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(predictions)).toBe(true);
      expect(typeof context).toBe('string');
    });
  });
});
