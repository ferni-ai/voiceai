/**
 * Relationship Engine Tests
 *
 * Tests for the relationship memory engine including:
 * - Stage progression
 * - Moment recording
 * - Callback opportunities
 * - Milestone tracking
 *
 * @module intelligence/relationship/__tests__/relationship-engine
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RelationshipEngine,
  initializeRelationship,
  getRelationshipEngine,
  clearAllRelationshipEngines,
} from '../engine.js';
import { createDefaultMemory } from '../persistence.js';
import type { RelationshipMemory, SessionMood } from '../types.js';

// Mock the persistence layer
vi.mock('../persistence.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../persistence.js')>();
  return {
    ...original,
    loadRelationshipMemory: vi.fn().mockResolvedValue(null),
    saveRelationshipMemory: vi.fn().mockResolvedValue(undefined),
  };
});

describe('RelationshipEngine', () => {
  beforeEach(() => {
    clearAllRelationshipEngines();
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create a new engine with default memory', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');

      expect(engine).toBeInstanceOf(RelationshipEngine);
      expect(engine.stage).toBe('stranger');
      expect(engine.trust).toBe(0);
      expect(engine.sessions).toBe(0);
    });

    it('should return cached engine on subsequent calls', async () => {
      const engine1 = await initializeRelationship('user-123', 'ferni');
      const engine2 = await initializeRelationship('user-123', 'ferni');

      expect(engine1).toBe(engine2);
    });

    it('should create separate engines for different personas', async () => {
      const ferniEngine = await initializeRelationship('user-123', 'ferni');
      const mayaEngine = await initializeRelationship('user-123', 'maya');

      expect(ferniEngine).not.toBe(mayaEngine);
    });
  });

  describe('session lifecycle', () => {
    it('should increment session count on startSession', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');

      const result = engine.startSession();

      expect(result.currentStage).toBe('stranger');
      expect(result.isReturningUser).toBe(false);
      expect(engine.sessions).toBe(1);
    });

    it('should return same state if startSession called twice', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');

      engine.startSession();
      const result2 = engine.startSession();

      expect(engine.sessions).toBe(1); // Should not double-increment
      expect(result2.stageAdvanced).toBe(false);
    });

    it('should mark returning user after first session', async () => {
      const memory = createDefaultMemory('user-123', 'ferni');
      memory.totalSessions = 1;
      memory.lastSessionAt = new Date(Date.now() - 86400000); // 1 day ago

      const engine = new RelationshipEngine('user-123', 'ferni', memory);
      const result = engine.startSession();

      expect(result.isReturningUser).toBe(true);
      expect(result.daysSinceLastSession).toBeGreaterThanOrEqual(0);
    });
  });

  describe('stage progression', () => {
    it('should advance from stranger to acquaintance at 3 sessions', async () => {
      const memory = createDefaultMemory('user-123', 'ferni');
      memory.totalSessions = 2;
      memory.trustScore = 0.2;

      const engine = new RelationshipEngine('user-123', 'ferni', memory);
      const result = engine.startSession();

      expect(result.stageAdvanced).toBe(true);
      expect(result.previousStage).toBe('stranger');
      expect(result.currentStage).toBe('acquaintance');
    });

    it('should advance from acquaintance to friend at 11 sessions', async () => {
      const memory = createDefaultMemory('user-123', 'ferni');
      memory.totalSessions = 10;
      memory.stage = 'acquaintance';
      memory.trustScore = 0.5;

      const engine = new RelationshipEngine('user-123', 'ferni', memory);
      const result = engine.startSession();

      expect(result.stageAdvanced).toBe(true);
      expect(result.currentStage).toBe('friend');
    });

    it('should not advance without sufficient trust score', async () => {
      const memory = createDefaultMemory('user-123', 'ferni');
      memory.totalSessions = 10;
      memory.stage = 'acquaintance';
      memory.trustScore = 0.3; // Below 0.5 threshold for friend

      const engine = new RelationshipEngine('user-123', 'ferni', memory);
      const result = engine.startSession();

      expect(result.stageAdvanced).toBe(false);
      expect(result.currentStage).toBe('acquaintance');
    });
  });

  describe('moment recording', () => {
    it('should record a breakthrough moment', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');
      engine.startSession();

      const moment = engine.recordMoment(
        'breakthrough',
        'User had a realization about their career',
        {
          userPhrase: 'I finally understand what I want',
          significance: 0.8,
          topic: 'career',
        }
      );

      expect(moment.id).toBeDefined();
      expect(moment.type).toBe('breakthrough');
      expect(moment.summary).toBe('User had a realization about their career');
      expect(moment.userPhrase).toBe('I finally understand what I want');
      expect(moment.significance).toBe(0.8);
    });

    it('should increase trust score for high-significance moments', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');
      engine.startSession();
      const initialTrust = engine.trust;

      engine.recordMoment('vulnerability', 'User opened up', { significance: 0.9 });

      expect(engine.trust).toBeGreaterThan(initialTrust);
    });

    it('should mark milestone on first vulnerability', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');
      engine.startSession();

      engine.recordMoment('vulnerability', 'User opened up');

      const memory = engine.getMemory();
      const milestone = memory.milestones.find((m) => m.type === 'first_vulnerability');
      expect(milestone?.reached).toBe(true);
    });
  });

  describe('milestone tracking', () => {
    it('should detect session 10 milestone', async () => {
      const memory = createDefaultMemory('user-123', 'ferni');
      memory.totalSessions = 9;

      const engine = new RelationshipEngine('user-123', 'ferni', memory);
      const result = engine.startSession();

      expect(result.milestone).toBeDefined();
      expect(result.milestone?.type).toBe('session_10');
    });

    it('should detect one month anniversary', async () => {
      const memory = createDefaultMemory('user-123', 'ferni');
      memory.firstSessionAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000); // 31 days ago

      const engine = new RelationshipEngine('user-123', 'ferni', memory);
      const result = engine.startSession();

      expect(result.milestone?.type).toBe('one_month');
    });

    it('should acknowledge milestones', async () => {
      const memory = createDefaultMemory('user-123', 'ferni');
      memory.totalSessions = 9;

      const engine = new RelationshipEngine('user-123', 'ferni', memory);
      engine.startSession(); // Triggers session_10 milestone

      engine.acknowledgeMilestone('session_10');

      const updated = engine.getMemory();
      const milestone = updated.milestones.find((m) => m.type === 'session_10');
      expect(milestone?.acknowledged).toBe(true);
    });
  });

  describe('callback opportunities', () => {
    it('should return null when no moments exist', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');
      engine.startSession();

      const callback = engine.getCallbackOpportunity('work');

      expect(callback).toBeNull();
    });

    it('should suggest callback for relevant topic', async () => {
      const memory = createDefaultMemory('user-123', 'ferni');
      memory.totalSessions = 5;
      memory.sharedMoments = [
        {
          id: 'moment-1',
          type: 'breakthrough',
          summary: 'User realized they want to change careers',
          sessionNumber: 2,
          timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1), // 8 days ago
          userPhrase: 'I need a change',
          significance: 0.8,
          topic: 'career',
          callbackCount: 0,
        },
      ];

      const engine = new RelationshipEngine('user-123', 'ferni', memory);
      const callback = engine.getCallbackOpportunity('career');

      expect(callback).not.toBeNull();
      expect(callback?.type).toBe('moment');
      expect(callback?.shouldSurface).toBe(true);
    });
  });

  describe('callback tracking', () => {
    it('should record callback attempts', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');
      engine.startSession();

      engine.recordCallbackAttempt('moment-1', 'moment', 'positive', true);

      const memory = engine.getMemory();
      expect(memory.callbackAttempts.length).toBe(1);
      expect(memory.callbackAttempts[0].userResponse).toBe('positive');
    });

    it('should increase trust on positive callback', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');
      engine.startSession();
      const initialTrust = engine.trust;

      engine.recordCallbackAttempt('moment-1', 'moment', 'positive', true);

      expect(engine.trust).toBeGreaterThan(initialTrust);
    });

    it('should mark first callback landed milestone', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');
      engine.startSession();

      engine.recordCallbackAttempt('moment-1', 'moment', 'engaged', true);

      const memory = engine.getMemory();
      const milestone = memory.milestones.find((m) => m.type === 'first_callback_landed');
      expect(milestone?.reached).toBe(true);
    });
  });

  describe('inside jokes', () => {
    it('should register an inside joke', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');
      engine.startSession();

      const joke = engine.registerInsideJoke(
        'spreadsheet guy',
        'Ah yes, the infamous spreadsheet guy',
        'User mentioned their dad loves spreadsheets'
      );

      expect(joke.id).toBeDefined();
      expect(joke.trigger).toBe('spreadsheet guy');
      expect(joke.status).toBe('emerging');
    });

    it('should mark first inside joke milestone', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');
      engine.startSession();

      engine.registerInsideJoke('test', 'reference', 'origin');

      const memory = engine.getMemory();
      const milestone = memory.milestones.find((m) => m.type === 'first_inside_joke');
      expect(milestone?.reached).toBe(true);
    });

    it('should update joke resonance on usage', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');
      engine.startSession();

      const joke = engine.registerInsideJoke('test', 'reference', 'origin');

      engine.recordJokeUsage(joke.id, true);

      const memory = engine.getMemory();
      const updated = memory.insideJokes.find((j) => j.id === joke.id);
      expect(updated?.usageCount).toBe(1);
      expect(updated?.resonanceScore).toBeGreaterThan(0.5);
    });
  });

  describe('emotional trajectory', () => {
    it('should add session to trajectory on endSession', async () => {
      const engine = await initializeRelationship('user-123', 'ferni');
      engine.startSession();

      await engine.endSession('positive', ['career', 'family']);

      const memory = engine.getMemory();
      expect(memory.emotionalTrajectory.recentSessions.length).toBe(1);
      expect(memory.emotionalTrajectory.recentSessions[0].mood).toBe('positive');
    });

    it('should limit trajectory to last 20 sessions', async () => {
      const memory = createDefaultMemory('user-123', 'ferni');
      memory.emotionalTrajectory.recentSessions = Array(20).fill({
        sessionNumber: 1,
        date: new Date(),
        mood: 'neutral' as SessionMood,
        topics: [],
      });

      const engine = new RelationshipEngine('user-123', 'ferni', memory);
      engine.startSession();
      await engine.endSession('positive', ['test']);

      const updated = engine.getMemory();
      expect(updated.emotionalTrajectory.recentSessions.length).toBe(20);
    });

    it('should detect improving trajectory', async () => {
      const memory = createDefaultMemory('user-123', 'ferni');
      memory.emotionalTrajectory.recentSessions = [
        { sessionNumber: 1, date: new Date(), mood: 'struggling', topics: [] },
        { sessionNumber: 2, date: new Date(), mood: 'struggling', topics: [] },
        { sessionNumber: 3, date: new Date(), mood: 'neutral', topics: [] },
        { sessionNumber: 4, date: new Date(), mood: 'neutral', topics: [] },
      ];

      const engine = new RelationshipEngine('user-123', 'ferni', memory);
      engine.startSession();
      await engine.endSession('positive', ['test']);

      const updated = engine.getMemory();
      expect(updated.emotionalTrajectory.trendDirection).toBe('improving');
    });
  });

  describe('context building', () => {
    it('should build relationship context', async () => {
      const memory = createDefaultMemory('user-123', 'ferni');
      memory.stage = 'friend';
      memory.trustScore = 0.6;
      memory.totalSessions = 15;
      memory.sharedMoments = [
        {
          id: 'moment-1',
          type: 'breakthrough',
          summary: 'Test moment',
          sessionNumber: 10,
          timestamp: new Date(),
          significance: 0.7,
          callbackCount: 0,
        },
      ];

      const engine = new RelationshipEngine('user-123', 'ferni', memory);
      const ctx = engine.buildRelationshipContext();

      expect(ctx.stage).toBe('friend');
      expect(ctx.trustScore).toBe(0.6);
      expect(ctx.totalSessions).toBe(15);
      expect(ctx.recentMoments.length).toBe(1);
      expect(ctx.unlockedContent.insideJokesEnabled).toBe(true);
      expect(ctx.unlockedContent.vulnerabilitySharing).toBe(true);
    });
  });
});
