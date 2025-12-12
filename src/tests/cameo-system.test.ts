/**
 * Cameo System Integration Tests
 *
 * Tests the complete cameo flow from request to voice switch to return.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildCameoSpeech,
  getCameoGreeting,
  getCameoHandback,
} from '../services/cameo/cameo-content.js';
import {
  detectCameoOpportunity,
  generateCameoDetectionPrompt,
  parseCameoDetectionResponse,
} from '../services/cameo/cameo-triggers.js';
import {
  CAMEO_TIMING,
  cameoEvents,
  cancelCameo,
  endCameo,
  executeCameo,
  getCameoStats,
  getCurrentCameoPersona,
  hasPersonaCameoed,
  isInCameo,
  resetSessionState,
} from '../services/cameo/index.js';
import type {
  CameoDetectionContext,
  CameoEvent,
  CameoSessionState,
} from '../services/cameo/types.js';

// ============================================================================
// MOCK STATE
// ============================================================================

const createMockSessionState = (): CameoSessionState => ({
  isInCameo: false,
  currentCameoPersona: null,
  currentCameoId: null,
  cameoStartTime: null,
  lastCameoEndTime: 0,
  personasWhoCameoed: new Set(),
  totalCameosThisSession: 0,
  cameoHistory: [],
});

const createMockDetectionContext = (
  overrides: Partial<CameoDetectionContext> = {}
): CameoDetectionContext => ({
  userMessage: 'I was looking at my portfolio today',
  conversationHistory: [
    { role: 'user', content: 'Hi Ferni!' },
    { role: 'assistant', content: 'Hey! Great to see you!' },
  ],
  currentPersona: 'ferni',
  sessionId: 'test-session-123',
  ...overrides,
});

// ============================================================================
// ORCHESTRATOR TESTS
// ============================================================================

// Mock the timing module to use fast timers for tests
vi.mock('../services/cameo/cameo-timing.js', async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const timing = {
    ...(original.CAMEO_TIMING as Record<string, unknown>),
    ARRIVAL_DELAY: 10, // 10ms instead of 400ms
    RETURN_DELAY: 10, // 10ms instead of 300ms
    MAX_DURATION: 5000, // 5s instead of 15s for tests
    HANDLER_TIMEOUT: 30, // 30ms instead of 10s for tests
    COOLDOWN: 100, // 100ms instead of 30s
    CELEBRATION_COOLDOWN: 50, // 50ms instead of 20s
    HIGH_PRIORITY_COOLDOWN: 40, // 40ms instead of 30s
  };

  function getCooldownForPriority(priority: 'normal' | 'high' | 'celebration'): number {
    switch (priority) {
      case 'celebration':
        return (timing.CELEBRATION_COOLDOWN as number) || 0;
      case 'high':
        return (timing.HIGH_PRIORITY_COOLDOWN as number) || 0;
      default:
        return (timing.COOLDOWN as number) || 0;
    }
  }

  function isCooldownExpired(
    lastCameoEndTime: number,
    priority: 'normal' | 'high' | 'celebration' = 'normal'
  ): boolean {
    return Date.now() - lastCameoEndTime >= getCooldownForPriority(priority);
  }

  function getRemainingCooldown(
    lastCameoEndTime: number,
    priority: 'normal' | 'high' | 'celebration' = 'normal'
  ): number {
    const cooldown = getCooldownForPriority(priority);
    const elapsed = Date.now() - lastCameoEndTime;
    return Math.max(0, cooldown - elapsed);
  }

  return {
    ...original,
    CAMEO_TIMING: timing,
    getCooldownForPriority,
    isCooldownExpired,
    getRemainingCooldown,
  };
});

describe('Cameo Orchestrator', () => {
  const sessionId = `test-session-${Date.now()}`;

  beforeEach(() => {
    resetSessionState(sessionId);
  });

  afterEach(() => {
    resetSessionState(sessionId);
  });

  describe('executeCameo', () => {
    it('should execute a cameo successfully', async () => {
      const eventPromise = new Promise<CameoEvent>((resolve) => {
        cameoEvents.once('cameo_started', resolve);
      });

      // With mocked fast timers, just await the result directly
      const result = await executeCameo(
        {
          personaId: 'peter-john',
          triggerType: 'data_insight',
          insight: 'Your portfolio is up 5% this quarter!',
        },
        { sessionId }
      );

      expect(result.success).toBe(true);
      expect(result.personaId).toBe('peter-john');
      expect(result.greeting).toBeDefined();
      expect(result.handback).toBeDefined();

      const event = await eventPromise;
      expect(event.type).toBe('cameo_started');
      expect(event.personaId).toBe('peter-john');
    });

    it('should block concurrent cameos', async () => {
      // Start first cameo
      await executeCameo({ personaId: 'peter-john', triggerType: 'data_insight' }, { sessionId });

      // Try second cameo while first is active
      const result = await executeCameo(
        { personaId: 'alex-chen', triggerType: 'scheduling' },
        { sessionId }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('already in progress');
    });

    it('should enforce cooldown between cameos', async () => {
      // Execute and complete first cameo
      await executeCameo({ personaId: 'peter-john', triggerType: 'data_insight' }, { sessionId });
      await endCameo(sessionId);

      // Try second cameo immediately (should be blocked by cooldown)
      const result = await executeCameo(
        { personaId: 'alex-chen', triggerType: 'scheduling' },
        { sessionId }
      );

      expect(result.success).toBe(false);
      expect(result.blockedByCooldown).toBe(true);
      expect(result.cooldownRemaining).toBeGreaterThan(0);
    });

    it('should allow celebration cameos with shorter cooldown', async () => {
      // Execute and complete first cameo
      await executeCameo({ personaId: 'peter-john', triggerType: 'data_insight' }, { sessionId });
      await endCameo(sessionId);

      // With mocked timing constants, celebration cooldown is short but non-zero.
      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });

      const result = await executeCameo(
        {
          personaId: 'jordan-taylor',
          triggerType: 'celebration',
          priority: 'celebration',
        },
        { sessionId }
      );

      expect(result.success).toBe(true);
    });

    it('should track cameo history', async () => {
      await executeCameo({ personaId: 'peter-john', triggerType: 'data_insight' }, { sessionId });
      await endCameo(sessionId);

      const stats = getCameoStats(sessionId);
      expect(stats.totalCameos).toBe(1);
      expect(stats.personasCameoed).toContain('peter-john');
    });
  });

  describe('endCameo', () => {
    it('should end a cameo and emit complete event', async () => {
      await executeCameo({ personaId: 'peter-john', triggerType: 'data_insight' }, { sessionId });

      const eventPromise = new Promise<CameoEvent>((resolve) => {
        cameoEvents.once('cameo_complete', resolve);
      });

      const result = await endCameo(sessionId);

      expect(result.success).toBe(true);
      expect(isInCameo(sessionId)).toBe(false);

      const event = await eventPromise;
      expect(event.type).toBe('cameo_complete');
      expect(event.personaId).toBe('peter-john');
    });

    it('should return error if no cameo is active', async () => {
      const result = await endCameo(sessionId);
      expect(result.success).toBe(false);
      expect(result.error).toContain('No cameo in progress');
    });
  });

  describe('cancelCameo', () => {
    it('should cancel an active cameo', async () => {
      await executeCameo({ personaId: 'peter-john', triggerType: 'data_insight' }, { sessionId });

      const eventPromise = new Promise<CameoEvent>((resolve) => {
        cameoEvents.once('cameo_cancelled', resolve);
      });

      const result = await cancelCameo(sessionId, 'User interrupted');

      expect(result.success).toBe(true);
      expect(isInCameo(sessionId)).toBe(false);

      const event = await eventPromise;
      expect(event.type).toBe('cameo_cancelled');
      expect(event.error).toBe('User interrupted');
    });
  });

  describe('Query Functions', () => {
    it('should correctly report cameo state', async () => {
      expect(isInCameo(sessionId)).toBe(false);
      expect(getCurrentCameoPersona(sessionId)).toBe(null);

      await executeCameo({ personaId: 'maya-santos', triggerType: 'habit_check' }, { sessionId });

      expect(isInCameo(sessionId)).toBe(true);
      expect(getCurrentCameoPersona(sessionId)).toBe('maya-santos');
      expect(hasPersonaCameoed(sessionId, 'maya-santos')).toBe(true);
      expect(hasPersonaCameoed(sessionId, 'peter-john')).toBe(false);
    });
  });
});

// ============================================================================
// TRIGGER DETECTION TESTS
// ============================================================================

describe('Cameo Trigger Detection', () => {
  describe('detectCameoOpportunity', () => {
    it('should detect data-related cameo for Peter', () => {
      const result = detectCameoOpportunity(
        createMockDetectionContext({
          userMessage: 'I was looking at my stock portfolio returns today',
        }),
        createMockSessionState()
      );

      expect(result.shouldCameo).toBe(true);
      expect(result.personaId).toBe('peter-john');
      expect(result.triggerType).toBe('data_insight');
    });

    it('should detect scheduling-related cameo for Alex', () => {
      const result = detectCameoOpportunity(
        createMockDetectionContext({
          userMessage: 'My calendar is so busy this week with meetings',
        }),
        createMockSessionState()
      );

      expect(result.shouldCameo).toBe(true);
      expect(result.personaId).toBe('alex-chen');
      expect(result.triggerType).toBe('scheduling');
    });

    it('should detect habit-related cameo for Maya', () => {
      const result = detectCameoOpportunity(
        createMockDetectionContext({
          userMessage: 'I broke my morning routine streak',
        }),
        createMockSessionState()
      );

      expect(result.shouldCameo).toBe(true);
      expect(result.personaId).toBe('maya-santos');
      expect(result.triggerType).toBe('habit_check');
    });

    it('should detect planning-related cameo for Jordan', () => {
      const result = detectCameoOpportunity(
        createMockDetectionContext({
          userMessage: 'I want to plan a vacation trip for my birthday',
        }),
        createMockSessionState()
      );

      expect(result.shouldCameo).toBe(true);
      expect(result.personaId).toBe('jordan-taylor');
      expect(result.triggerType).toBe('planning');
    });

    it('should detect wisdom-related cameo for Nayan', () => {
      const result = detectCameoOpportunity(
        createMockDetectionContext({
          userMessage: 'I need some perspective on my long-term life purpose',
        }),
        createMockSessionState()
      );

      expect(result.shouldCameo).toBe(true);
      expect(result.personaId).toBe('nayan-patel');
      expect(result.triggerType).toBe('wisdom');
    });

    it('should not suggest cameo when already in cameo', () => {
      const state = createMockSessionState();
      state.isInCameo = true;
      state.currentCameoPersona = 'peter-john';

      const result = detectCameoOpportunity(
        createMockDetectionContext({
          userMessage: 'Let me check my calendar',
        }),
        state
      );

      expect(result.shouldCameo).toBe(false);
    });

    it('should not suggest cameo when not Ferni speaking', () => {
      const result = detectCameoOpportunity(
        createMockDetectionContext({
          currentPersona: 'peter-john',
          userMessage: 'My calendar is busy',
        }),
        createMockSessionState()
      );

      expect(result.shouldCameo).toBe(false);
    });

    it('should detect direct persona mentions', () => {
      const result = detectCameoOpportunity(
        createMockDetectionContext({
          userMessage: 'Can Peter look at this?',
        }),
        createMockSessionState()
      );

      expect(result.shouldCameo).toBe(true);
      expect(result.personaId).toBe('peter-john');
      expect(result.triggerType).toBe('manual');
    });
  });

  describe('generateCameoDetectionPrompt', () => {
    it('should generate a valid prompt', () => {
      const prompt = generateCameoDetectionPrompt(createMockDetectionContext());

      expect(prompt).toContain('analyzing a conversation');
      expect(prompt).toContain('Peter');
      expect(prompt).toContain('Alex');
      expect(prompt).toContain('Maya');
      expect(prompt).toContain('Jordan');
      expect(prompt).toContain('Nayan');
      expect(prompt).toContain('shouldCameo');
    });
  });

  describe('parseCameoDetectionResponse', () => {
    it('should parse valid JSON response', () => {
      const response = JSON.stringify({
        shouldCameo: true,
        personaId: 'peter-john',
        reason: 'Topic matches data analysis',
        confidence: 0.8,
      });

      const result = parseCameoDetectionResponse(response);

      expect(result.shouldCameo).toBe(true);
      expect(result.personaId).toBe('peter-john');
      expect(result.confidence).toBe(0.8);
    });

    it('should handle malformed responses', () => {
      const result = parseCameoDetectionResponse('not valid json');
      expect(result.shouldCameo).toBe(false);
    });
  });
});

// ============================================================================
// CONTENT GENERATION TESTS
// ============================================================================

describe('Cameo Content Generation', () => {
  describe('getCameoGreeting', () => {
    it('should return first-time greeting', () => {
      const greeting = getCameoGreeting('peter-john', {
        isFirstCameo: true,
        triggerType: 'data_insight',
      });

      expect(greeting).toBeDefined();
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should return returning greeting', () => {
      const greeting = getCameoGreeting('peter-john', {
        isFirstCameo: false,
        triggerType: 'data_insight',
      });

      expect(greeting).toBeDefined();
      expect(greeting.length).toBeGreaterThan(0);
    });

    it('should use custom greeting when provided', () => {
      const customGreeting = 'Hey, quick thing!';
      const greeting = getCameoGreeting('peter-john', {
        isFirstCameo: true,
        customGreeting,
      });

      expect(greeting).toBe(customGreeting);
    });
  });

  describe('getCameoHandback', () => {
    it('should return trigger-specific handback', () => {
      const handback = getCameoHandback('peter-john', {
        triggerType: 'data_insight',
      });

      expect(handback).toBeDefined();
      expect(handback).toContain('Ferni');
    });

    it('should use custom handback when provided', () => {
      const customHandback = 'Back to you, Ferni!';
      const handback = getCameoHandback('peter-john', {
        customHandback,
      });

      expect(handback).toBe(customHandback);
    });
  });

  describe('buildCameoSpeech', () => {
    it('should build complete cameo speech', () => {
      const speech = buildCameoSpeech('maya-santos', 'Your meditation streak is at 7 days!', {
        isFirstCameo: true,
        triggerType: 'habit_check',
      });

      expect(speech.greeting).toBeDefined();
      expect(speech.insight).toBe('Your meditation streak is at 7 days!');
      expect(speech.handback).toBeDefined();
      expect(speech.fullSpeech).toContain(speech.greeting);
      expect(speech.fullSpeech).toContain(speech.insight);
      expect(speech.fullSpeech).toContain(speech.handback);
    });
  });
});

// ============================================================================
// TIMING TESTS
// Note: These tests check production timing values, but the module is mocked
// for fast orchestrator tests. We skip these when mocked.
// ============================================================================

describe('Cameo Timing (production constants)', () => {
  it('should have reasonable timing constants', async () => {
    // cameo-timing is mocked in this test file for orchestrator speed.
    // For production constants, import the real module directly.
    const mod = (await vi.importActual('../services/cameo/cameo-timing.js')) as {
      CAMEO_TIMING: typeof CAMEO_TIMING;
    };
    const REAL = mod.CAMEO_TIMING;

    expect(REAL.ARRIVAL_DELAY).toBeGreaterThanOrEqual(100);
    expect(REAL.ARRIVAL_DELAY).toBeLessThanOrEqual(1000);

    expect(REAL.RETURN_DELAY).toBeGreaterThanOrEqual(100);
    expect(REAL.RETURN_DELAY).toBeLessThanOrEqual(1000);

    expect(REAL.MAX_DURATION).toBeGreaterThanOrEqual(10000);
    expect(REAL.MAX_DURATION).toBeLessThanOrEqual(30000);

    expect(REAL.COOLDOWN).toBeGreaterThanOrEqual(30000);
  });

  it('should have celebration cooldown shorter than normal', async () => {
    const mod = (await vi.importActual('../services/cameo/cameo-timing.js')) as {
      CAMEO_TIMING: typeof CAMEO_TIMING;
    };
    const REAL = mod.CAMEO_TIMING;
    expect(REAL.CELEBRATION_COOLDOWN).toBeLessThan(REAL.COOLDOWN);
  });

  it('should have high priority cooldown shorter than normal', async () => {
    const mod = (await vi.importActual('../services/cameo/cameo-timing.js')) as {
      CAMEO_TIMING: typeof CAMEO_TIMING;
    };
    const REAL = mod.CAMEO_TIMING;
    expect(REAL.HIGH_PRIORITY_COOLDOWN).toBeLessThan(REAL.COOLDOWN);
  });
});
