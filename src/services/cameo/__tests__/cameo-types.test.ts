/**
 * Team Cameo System Type Tests
 *
 * Tests for cameo types, events, state management, and configuration.
 */

import { describe, it, expect } from 'vitest';

import type {
  CameoPersonaId,
  CameoTriggerType,
  CameoRequest,
  CameoResult,
  CameoEventType,
  CameoEvent,
  CameoDataMessage,
  CameoSessionState,
  CameoHistoryEntry,
  PersonaCameoConfig,
  CameoConfig,
  CameoOpportunity,
  CameoDetectionContext,
} from '../types.js';

describe('CameoTypes', () => {
  describe('CameoTriggerType', () => {
    it('should have all trigger types', () => {
      const triggers: CameoTriggerType[] = [
        'data_insight',
        'scheduling',
        'habit_check',
        'planning',
        'wisdom',
        'celebration',
        'support',
        'expertise',
        'manual',
      ];

      expect(triggers).toHaveLength(9);
      triggers.forEach((trigger) => {
        expect(typeof trigger).toBe('string');
      });
    });
  });

  describe('CameoRequest interface', () => {
    it('should create valid cameo request', () => {
      const request: CameoRequest = {
        personaId: 'peter-john' as CameoPersonaId,
        insight: 'I noticed your spending pattern changed this week',
        triggerType: 'data_insight',
        context: 'User asked about budget',
        priority: 'normal',
      };

      expect(request.personaId).toBe('peter-john');
      expect(request.triggerType).toBe('data_insight');
    });

    it('should allow optional fields', () => {
      const request: CameoRequest = {
        personaId: 'maya-santos' as CameoPersonaId,
        triggerType: 'habit_check',
      };

      expect(request.insight).toBeUndefined();
      expect(request.context).toBeUndefined();
      expect(request.customGreeting).toBeUndefined();
      expect(request.customHandback).toBeUndefined();
      expect(request.priority).toBeUndefined();
    });

    it('should support all priority levels', () => {
      const priorities: CameoRequest['priority'][] = ['normal', 'high', 'celebration'];

      priorities.forEach((priority) => {
        const request: CameoRequest = {
          personaId: 'jordan-taylor' as CameoPersonaId,
          triggerType: 'planning',
          priority,
        };
        expect(request.priority).toBe(priority);
      });
    });

    it('should support custom greeting and handback', () => {
      const request: CameoRequest = {
        personaId: 'alex-chen' as CameoPersonaId,
        triggerType: 'scheduling',
        customGreeting: 'Hey! Quick thought on your calendar...',
        customHandback: 'Back to you, Ferni!',
      };

      expect(request.customGreeting).toContain('calendar');
      expect(request.customHandback).toContain('Ferni');
    });
  });

  describe('CameoResult interface', () => {
    it('should create successful result', () => {
      const result: CameoResult = {
        success: true,
        personaId: 'peter-john' as CameoPersonaId,
        greeting: 'Hey, Peter here!',
        insight: 'Great news about your savings',
        handback: 'Back to Ferni',
        duration: 5000,
        greetingSpoken: true,
        instructionsUpdated: true,
      };

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.duration).toBe(5000);
    });

    it('should create failed result', () => {
      const result: CameoResult = {
        success: false,
        error: 'Persona unavailable',
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe('Persona unavailable');
    });

    it('should handle cooldown blocking', () => {
      const result: CameoResult = {
        success: false,
        error: 'Cooldown active',
        blockedByCooldown: true,
        cooldownRemaining: 30000,
      };

      expect(result.blockedByCooldown).toBe(true);
      expect(result.cooldownRemaining).toBe(30000);
    });
  });

  describe('CameoEventType', () => {
    it('should have all event types', () => {
      const eventTypes: CameoEventType[] = [
        'cameo_requested',
        'cameo_starting',
        'cameo_started',
        'cameo_ending',
        'cameo_complete',
        'cameo_cancelled',
        'cameo_failed',
      ];

      expect(eventTypes).toHaveLength(7);
    });

    it('should have lifecycle order', () => {
      // Typical happy path: requested -> starting -> started -> ending -> complete
      const lifecycle: CameoEventType[] = [
        'cameo_requested',
        'cameo_starting',
        'cameo_started',
        'cameo_ending',
        'cameo_complete',
      ];

      expect(lifecycle[0]).toBe('cameo_requested');
      expect(lifecycle[4]).toBe('cameo_complete');
    });
  });

  describe('CameoEvent interface', () => {
    it('should create valid cameo event', () => {
      const event: CameoEvent = {
        type: 'cameo_started',
        personaId: 'nayan-patel' as CameoPersonaId,
        returnToPersonaId: 'ferni',
        cameoId: 'cameo-123',
        sessionId: 'session-456',
        timestamp: Date.now(),
        voiceId: 'voice-nayan',
        greeting: 'Greetings, friend',
        insight: 'Let me share some perspective',
        triggerType: 'wisdom',
      };

      expect(event.type).toBe('cameo_started');
      expect(event.personaId).toBe('nayan-patel');
      expect(event.returnToPersonaId).toBe('ferni');
    });

    it('should handle failed event', () => {
      const event: CameoEvent = {
        type: 'cameo_failed',
        personaId: 'maya-santos' as CameoPersonaId,
        returnToPersonaId: 'ferni',
        cameoId: 'cameo-failed',
        sessionId: 'session-789',
        timestamp: Date.now(),
        error: 'Voice synthesis failed',
      };

      expect(event.type).toBe('cameo_failed');
      expect(event.error).toBe('Voice synthesis failed');
    });

    it('should include duration on complete event', () => {
      const event: CameoEvent = {
        type: 'cameo_complete',
        personaId: 'jordan-taylor' as CameoPersonaId,
        returnToPersonaId: 'ferni',
        cameoId: 'cameo-done',
        sessionId: 'session-xyz',
        timestamp: Date.now(),
        duration: 8500,
        handback: 'Back to you, Ferni!',
      };

      expect(event.duration).toBe(8500);
      expect(event.handback).toContain('Ferni');
    });
  });

  describe('CameoDataMessage interface', () => {
    it('should create valid data message', () => {
      const message: CameoDataMessage = {
        type: 'cameo_start',
        personaId: 'peter-john' as CameoPersonaId,
        personaName: 'Peter',
        personaColor: '#4a7c59',
        greeting: 'Hey, Peter here!',
        isFirstCameo: true,
        voiceId: 'peter-voice',
        cameoId: 'cameo-abc',
        seq: 1,
      };

      expect(message.type).toBe('cameo_start');
      expect(message.personaName).toBe('Peter');
      expect(message.isFirstCameo).toBe(true);
    });

    it('should support all message types', () => {
      const types: CameoDataMessage['type'][] = [
        'cameo_starting',
        'cameo_start',
        'cameo_ending',
        'cameo_complete',
        'cameo_cancelled',
        'cameo_failed',
      ];

      types.forEach((type) => {
        const message: CameoDataMessage = {
          type,
          personaId: 'alex-chen' as CameoPersonaId,
          personaName: 'Alex',
          personaColor: '#6b8e75',
        };
        expect(message.type).toBe(type);
      });
    });
  });

  describe('CameoSessionState interface', () => {
    it('should create initial state', () => {
      const state: CameoSessionState = {
        isInCameo: false,
        currentCameoPersona: null,
        currentCameoId: null,
        cameoStartTime: null,
        lastCameoEndTime: 0,
        personasWhoCameoed: new Set(),
        totalCameosThisSession: 0,
        cameoHistory: [],
      };

      expect(state.isInCameo).toBe(false);
      expect(state.totalCameosThisSession).toBe(0);
      expect(state.personasWhoCameoed.size).toBe(0);
    });

    it('should create active cameo state', () => {
      const state: CameoSessionState = {
        isInCameo: true,
        currentCameoPersona: 'maya-santos' as CameoPersonaId,
        currentCameoId: 'active-cameo',
        cameoStartTime: Date.now(),
        lastCameoEndTime: Date.now() - 60000,
        personasWhoCameoed: new Set(['peter-john', 'maya-santos'] as CameoPersonaId[]),
        totalCameosThisSession: 2,
        cameoHistory: [],
      };

      expect(state.isInCameo).toBe(true);
      expect(state.currentCameoPersona).toBe('maya-santos');
      expect(state.personasWhoCameoed.size).toBe(2);
    });
  });

  describe('CameoHistoryEntry interface', () => {
    it('should create completed history entry', () => {
      const entry: CameoHistoryEntry = {
        cameoId: 'cameo-hist-1',
        personaId: 'jordan-taylor' as CameoPersonaId,
        triggerType: 'planning',
        startTime: 1703500000000,
        endTime: 1703500008000,
        duration: 8000,
        insight: 'Let me help you plan this out',
        wasFirstCameo: true,
      };

      expect(entry.duration).toBe(8000);
      expect(entry.wasFirstCameo).toBe(true);
    });

    it('should handle in-progress entry', () => {
      const entry: CameoHistoryEntry = {
        cameoId: 'cameo-in-progress',
        personaId: 'nayan-patel' as CameoPersonaId,
        triggerType: 'wisdom',
        startTime: Date.now(),
        wasFirstCameo: false,
      };

      expect(entry.endTime).toBeUndefined();
      expect(entry.duration).toBeUndefined();
    });
  });

  describe('PersonaCameoConfig interface', () => {
    it('should create valid persona config', () => {
      const config: PersonaCameoConfig = {
        introductions: ['Hey, Peter here!', 'Quick thought from Peter...'],
        handbacks: ['Back to you, Ferni', 'Ferni, your turn'],
        triggerTopics: ['budget', 'spending', 'savings', 'money'],
        typicalDuration: 8000,
        isEnergetic: false,
        color: '#4a7c59',
        glowColor: '#6b9e7a',
      };

      expect(config.introductions).toHaveLength(2);
      expect(config.triggerTopics).toContain('budget');
      expect(config.typicalDuration).toBe(8000);
    });

    it('should support energetic personas', () => {
      const config: PersonaCameoConfig = {
        introductions: ['Oh! I love this!', 'Exciting news!'],
        handbacks: ['Back to Ferni - so exciting!'],
        triggerTopics: ['celebration', 'achievement', 'milestone'],
        typicalDuration: 6000,
        isEnergetic: true,
        color: '#e8a855',
        glowColor: '#f4c278',
      };

      expect(config.isEnergetic).toBe(true);
    });
  });

  describe('CameoConfig interface', () => {
    it('should create valid global config', () => {
      const config: CameoConfig = {
        enabled: true,
        cooldownMs: 60000,
        maxCameosPerSession: 5,
        maxDurationMs: 15000,
        idealDurationMs: 8000,
        arrivalDelayMs: 500,
        returnDelayMs: 300,
        personas: {} as Record<CameoPersonaId, PersonaCameoConfig>,
      };

      expect(config.enabled).toBe(true);
      expect(config.cooldownMs).toBe(60000);
      expect(config.maxCameosPerSession).toBe(5);
    });

    it('should support disabled cameos', () => {
      const config: CameoConfig = {
        enabled: false,
        cooldownMs: 0,
        maxCameosPerSession: 0,
        maxDurationMs: 0,
        idealDurationMs: 0,
        arrivalDelayMs: 0,
        returnDelayMs: 0,
        personas: {} as Record<CameoPersonaId, PersonaCameoConfig>,
      };

      expect(config.enabled).toBe(false);
    });
  });

  describe('CameoOpportunity interface', () => {
    it('should create positive opportunity', () => {
      const opportunity: CameoOpportunity = {
        shouldCameo: true,
        personaId: 'peter-john' as CameoPersonaId,
        reason: 'User mentioned budget concerns',
        confidence: 0.85,
        suggestedInsight: 'I noticed some interesting patterns in your spending',
        triggerType: 'data_insight',
        triggerKeywords: ['budget', 'spending', 'money'],
      };

      expect(opportunity.shouldCameo).toBe(true);
      expect(opportunity.confidence).toBe(0.85);
      expect(opportunity.triggerKeywords).toContain('budget');
    });

    it('should create negative opportunity', () => {
      const opportunity: CameoOpportunity = {
        shouldCameo: false,
      };

      expect(opportunity.shouldCameo).toBe(false);
      expect(opportunity.personaId).toBeUndefined();
      expect(opportunity.reason).toBeUndefined();
    });
  });

  describe('CameoDetectionContext interface', () => {
    it('should create valid detection context', () => {
      const context: CameoDetectionContext = {
        userMessage: "I'm worried about my spending this month",
        conversationHistory: [
          { role: 'user', content: 'How am I doing financially?' },
          { role: 'assistant', content: "Let's look at your budget together" },
        ],
        currentPersona: 'ferni',
        emotionalState: 'concerned',
        currentTopic: 'finances',
        sessionId: 'session-123',
        userId: 'user-456',
      };

      expect(context.userMessage).toContain('spending');
      expect(context.conversationHistory).toHaveLength(2);
      expect(context.currentPersona).toBe('ferni');
    });

    it('should allow optional fields', () => {
      const context: CameoDetectionContext = {
        userMessage: 'Hello',
        conversationHistory: [],
        currentPersona: 'ferni',
        sessionId: 'session-789',
      };

      expect(context.emotionalState).toBeUndefined();
      expect(context.currentTopic).toBeUndefined();
      expect(context.userId).toBeUndefined();
    });
  });

  describe('Cameo lifecycle simulation', () => {
    it('should track state through cameo lifecycle', () => {
      // Initial state
      let state: CameoSessionState = {
        isInCameo: false,
        currentCameoPersona: null,
        currentCameoId: null,
        cameoStartTime: null,
        lastCameoEndTime: 0,
        personasWhoCameoed: new Set(),
        totalCameosThisSession: 0,
        cameoHistory: [],
      };

      // Start cameo
      state = {
        ...state,
        isInCameo: true,
        currentCameoPersona: 'peter-john' as CameoPersonaId,
        currentCameoId: 'cameo-1',
        cameoStartTime: Date.now(),
      };

      expect(state.isInCameo).toBe(true);
      expect(state.currentCameoPersona).toBe('peter-john');

      // End cameo
      const endTime = Date.now();
      state = {
        ...state,
        isInCameo: false,
        currentCameoPersona: null,
        currentCameoId: null,
        cameoStartTime: null,
        lastCameoEndTime: endTime,
        totalCameosThisSession: state.totalCameosThisSession + 1,
        personasWhoCameoed: new Set([...state.personasWhoCameoed, 'peter-john' as CameoPersonaId]),
      };

      expect(state.isInCameo).toBe(false);
      expect(state.totalCameosThisSession).toBe(1);
      expect(state.personasWhoCameoed.has('peter-john' as CameoPersonaId)).toBe(true);
    });

    it('should respect max cameos per session', () => {
      const config: CameoConfig = {
        enabled: true,
        cooldownMs: 60000,
        maxCameosPerSession: 3,
        maxDurationMs: 15000,
        idealDurationMs: 8000,
        arrivalDelayMs: 500,
        returnDelayMs: 300,
        personas: {} as Record<CameoPersonaId, PersonaCameoConfig>,
      };

      const state: CameoSessionState = {
        isInCameo: false,
        currentCameoPersona: null,
        currentCameoId: null,
        cameoStartTime: null,
        lastCameoEndTime: Date.now(),
        personasWhoCameoed: new Set(['peter-john', 'maya-santos', 'jordan-taylor'] as CameoPersonaId[]),
        totalCameosThisSession: 3,
        cameoHistory: [],
      };

      const canDoMoreCameos = state.totalCameosThisSession < config.maxCameosPerSession;
      expect(canDoMoreCameos).toBe(false);
    });

    it('should respect cooldown', () => {
      const config: CameoConfig = {
        enabled: true,
        cooldownMs: 60000, // 1 minute
        maxCameosPerSession: 5,
        maxDurationMs: 15000,
        idealDurationMs: 8000,
        arrivalDelayMs: 500,
        returnDelayMs: 300,
        personas: {} as Record<CameoPersonaId, PersonaCameoConfig>,
      };

      const now = Date.now();
      const state: CameoSessionState = {
        isInCameo: false,
        currentCameoPersona: null,
        currentCameoId: null,
        cameoStartTime: null,
        lastCameoEndTime: now - 30000, // 30 seconds ago
        personasWhoCameoed: new Set(),
        totalCameosThisSession: 1,
        cameoHistory: [],
      };

      const timeSinceLastCameo = now - state.lastCameoEndTime;
      const cooldownActive = timeSinceLastCameo < config.cooldownMs;

      expect(cooldownActive).toBe(true);
      expect(config.cooldownMs - timeSinceLastCameo).toBeCloseTo(30000, -2);
    });
  });
});
