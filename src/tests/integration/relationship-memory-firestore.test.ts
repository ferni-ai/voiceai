/**
 * Relationship Memory Firestore Integration Test
 *
 * Tests the full persistence flow:
 * - Save/load relationship memory to/from Firestore
 * - Stage progression persistence
 * - Shared moments persistence
 * - Inside jokes persistence
 *
 * Run with Firestore emulator:
 * ```bash
 * firebase emulators:start --only firestore &
 * FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm vitest run src/tests/integration/relationship-memory-firestore.test.ts
 * ```
 *
 * @module tests/integration/relationship-memory-firestore
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Check if running with emulator
const isEmulatorRunning = !!process.env.FIRESTORE_EMULATOR_HOST;

// Skip all tests if emulator not running
const describeWithEmulator = isEmulatorRunning ? describe : describe.skip;

describeWithEmulator('Relationship Memory Firestore Integration', () => {
  const testUserId = `test-user-rel-${Date.now()}`;
  const testPersonaId = 'ferni';

  beforeAll(async () => {
    console.log(`🔥 Firestore emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      const { deleteRelationshipMemory } = await import(
        '../../intelligence/relationship/persistence.js'
      );
      await deleteRelationshipMemory(testUserId, testPersonaId);
    } catch {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Clear any existing test data
    const { clearAllRelationshipEngines } = await import(
      '../../intelligence/relationship/index.js'
    );
    clearAllRelationshipEngines();
  });

  describe('Basic Persistence', () => {
    it('should save and load relationship memory', async () => {
      const { initializeRelationship, clearAllRelationshipEngines } = await import(
        '../../intelligence/relationship/index.js'
      );

      // Create and initialize engine
      const engine1 = await initializeRelationship(testUserId, testPersonaId);
      engine1.startSession();

      // Record a moment
      engine1.recordMoment('breakthrough', 'User had a major insight', {
        significance: 0.9,
      });

      // End session to persist
      await engine1.endSession('positive', ['growth', 'insight']);

      // Verify it was saved
      expect(engine1.sessions).toBe(1);
      expect(engine1.getMemory().sharedMoments.length).toBe(1);

      // Clear engine cache
      clearAllRelationshipEngines();

      // Reload from Firestore
      const engine2 = await initializeRelationship(testUserId, testPersonaId);
      const result = engine2.startSession();

      // Should have loaded saved state
      expect(engine2.sessions).toBe(2); // Incremented for new session
      expect(engine2.getMemory().sharedMoments.length).toBe(1);
      expect(engine2.getMemory().sharedMoments[0].type).toBe('breakthrough');
      expect(result.isReturning).toBe(true);
    });

    it('should persist trust score increases', async () => {
      const { initializeRelationship, clearAllRelationshipEngines } = await import(
        '../../intelligence/relationship/index.js'
      );

      // First session
      const engine1 = await initializeRelationship(testUserId, testPersonaId);
      engine1.startSession();
      const initialTrust = engine1.trust;

      // Record high-significance moment (increases trust)
      engine1.recordMoment('vulnerability', 'User shared something deep', {
        significance: 0.9,
      });

      // Record positive callback (increases trust)
      engine1.recordCallbackAttempt('moment-1', 'moment', 'positive', true);

      await engine1.endSession('positive', ['connection']);
      const savedTrust = engine1.trust;
      expect(savedTrust).toBeGreaterThan(initialTrust);

      // Clear and reload
      clearAllRelationshipEngines();

      const engine2 = await initializeRelationship(testUserId, testPersonaId);
      engine2.startSession();

      // Trust should be persisted
      expect(engine2.trust).toBeCloseTo(savedTrust, 2);
    });

    it('should persist inside jokes', async () => {
      const { initializeRelationship, clearAllRelationshipEngines } = await import(
        '../../intelligence/relationship/index.js'
      );

      // Create and register an inside joke
      const engine1 = await initializeRelationship(testUserId, testPersonaId);
      engine1.startSession();

      engine1.registerInsideJoke('spicy tacos', "User's thing about Tuesday tacos", {
        topic: 'food',
        type: 'shared_reference',
      });

      await engine1.endSession('positive', ['food', 'humor']);

      // Clear and reload
      clearAllRelationshipEngines();

      const engine2 = await initializeRelationship(testUserId, testPersonaId);
      engine2.startSession();

      // Inside joke should be persisted
      const jokes = engine2.getMemory().insideJokes;
      expect(jokes.length).toBe(1);
      expect(jokes[0].trigger).toBe('spicy tacos');
    });
  });

  describe('Stage Progression Persistence', () => {
    it('should persist stage advancement', async () => {
      const { initializeRelationship, clearAllRelationshipEngines } = await import(
        '../../intelligence/relationship/index.js'
      );

      // Create engine and manually advance stage (simulating multiple sessions)
      const engine1 = await initializeRelationship(testUserId, testPersonaId);

      // Manually set session count to trigger stage advancement
      const memory = engine1.getMemory();
      (memory as { totalSessions: number }).totalSessions = 2;
      (memory as { trustScore: number }).trustScore = 0.25;

      // Start session should advance to acquaintance at session 3
      engine1.startSession();
      expect(engine1.stage).toBe('acquaintance');

      await engine1.endSession('positive', []);

      // Clear and reload
      clearAllRelationshipEngines();

      const engine2 = await initializeRelationship(testUserId, testPersonaId);
      engine2.startSession();

      // Stage should be persisted
      expect(engine2.stage).toBe('acquaintance');
    });
  });

  describe('Milestone Persistence', () => {
    it('should persist reached milestones', async () => {
      const { initializeRelationship, clearAllRelationshipEngines } = await import(
        '../../intelligence/relationship/index.js'
      );

      const engine1 = await initializeRelationship(testUserId, testPersonaId);
      engine1.startSession();

      // Record moment that triggers milestone
      engine1.recordMoment('laughter', 'First shared laugh', { significance: 0.7 });

      // Verify milestone was triggered
      const milestones1 = engine1.getMemory().milestones;
      const firstLaugh = milestones1.find((m) => m.type === 'first_laugh');
      expect(firstLaugh?.reached).toBe(true);

      await engine1.endSession('positive', []);

      // Clear and reload
      clearAllRelationshipEngines();

      const engine2 = await initializeRelationship(testUserId, testPersonaId);
      engine2.startSession();

      // Milestone should be persisted
      const milestones2 = engine2.getMemory().milestones;
      const firstLaughPersisted = milestones2.find((m) => m.type === 'first_laugh');
      expect(firstLaughPersisted?.reached).toBe(true);
    });
  });

  describe('Emotional Trajectory Persistence', () => {
    it('should persist emotional trajectory across sessions', async () => {
      const { initializeRelationship, clearAllRelationshipEngines } = await import(
        '../../intelligence/relationship/index.js'
      );

      // Session 1: positive
      const engine1 = await initializeRelationship(testUserId, testPersonaId);
      engine1.startSession();
      await engine1.endSession('positive', ['growth']);

      // Session 2: positive
      clearAllRelationshipEngines();
      const engine2 = await initializeRelationship(testUserId, testPersonaId);
      engine2.startSession();
      await engine2.endSession('positive', ['success']);

      // Session 3: positive
      clearAllRelationshipEngines();
      const engine3 = await initializeRelationship(testUserId, testPersonaId);
      engine3.startSession();
      await engine3.endSession('positive', ['joy']);

      // Verify trajectory
      clearAllRelationshipEngines();
      const engine4 = await initializeRelationship(testUserId, testPersonaId);
      engine4.startSession();

      const trajectory = engine4.getMemory().emotionalTrajectory;
      expect(trajectory.sessions.length).toBeGreaterThanOrEqual(3);
      expect(trajectory.trendDirection).toBe('improving');
    });
  });

  describe('Context Building with Persisted Data', () => {
    it('should build context from persisted relationship data', async () => {
      const { initializeRelationship, clearAllRelationshipEngines } = await import(
        '../../intelligence/relationship/index.js'
      );

      // Build up some relationship history
      const engine1 = await initializeRelationship(testUserId, testPersonaId);
      engine1.startSession();
      engine1.recordMoment('celebration', 'User got promoted!', { significance: 0.9 });
      engine1.registerInsideJoke('promotion dance', 'Silly celebration dance', {
        type: 'shared_reference',
      });
      await engine1.endSession('positive', ['career', 'success']);

      // Clear and reload
      clearAllRelationshipEngines();

      const engine2 = await initializeRelationship(testUserId, testPersonaId);
      engine2.startSession();

      // Build context
      const ctx = engine2.buildRelationshipContext();

      // Context should include persisted data
      expect(ctx.stage).toBe('stranger'); // Still early
      expect(ctx.totalSessions).toBe(2);
      expect(ctx.recentMoments.length).toBe(1);
      expect(ctx.activeInsideJokes.length).toBe(1);
    });
  });

  describe('Multi-Persona Isolation', () => {
    it('should keep relationship memory isolated per persona', async () => {
      const { initializeRelationship, clearAllRelationshipEngines } = await import(
        '../../intelligence/relationship/index.js'
      );

      // Build relationship with Ferni
      const ferniEngine = await initializeRelationship(testUserId, 'ferni');
      ferniEngine.startSession();
      ferniEngine.recordMoment('breakthrough', 'Insight with Ferni', { significance: 0.8 });
      await ferniEngine.endSession('positive', ['coaching']);

      // Build relationship with Maya
      const mayaEngine = await initializeRelationship(testUserId, 'maya-santos');
      mayaEngine.startSession();
      mayaEngine.recordMoment('celebration', 'Habit win with Maya', { significance: 0.7 });
      mayaEngine.recordMoment('laughter', 'Funny moment with Maya', { significance: 0.5 });
      await mayaEngine.endSession('positive', ['habits']);

      // Clear and verify isolation
      clearAllRelationshipEngines();

      const ferniEngine2 = await initializeRelationship(testUserId, 'ferni');
      ferniEngine2.startSession();
      expect(ferniEngine2.getMemory().sharedMoments.length).toBe(1);
      expect(ferniEngine2.getMemory().sharedMoments[0].type).toBe('breakthrough');

      const mayaEngine2 = await initializeRelationship(testUserId, 'maya-santos');
      mayaEngine2.startSession();
      expect(mayaEngine2.getMemory().sharedMoments.length).toBe(2);

      // Clean up maya's data
      const { deleteRelationshipMemory } = await import(
        '../../intelligence/relationship/persistence.js'
      );
      await deleteRelationshipMemory(testUserId, 'maya-santos');
    });
  });
});
