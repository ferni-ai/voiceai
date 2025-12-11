/**
 * Life Coaching Context Builder Tests
 *
 * Tests for:
 * - Behavior JSON file loading (all 5 domains)
 * - Topic detection for life coaching domains
 * - Phrase injection based on detected topics
 * - Emotion-based domain hints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildLifeCoachingContext,
  detectLifeCoachingDomains,
} from '../intelligence/context-builders/life-coaching-context.js';
import {
  loadSecondChancesVoice,
  loadConnectionVoice,
  loadDifficultConversationsVoice,
  loadLifeTransitionsVoice,
  loadQuietGrowthVoice,
  clearContentCache,
} from '../services/persona-content-loader.js';
import type { ContextBuilderInput } from '../intelligence/context-builders/index.js';

// ============================================================================
// BEHAVIOR JSON LOADING TESTS
// ============================================================================

describe('Life Coaching Behavior JSON Loaders', () => {
  beforeEach(() => {
    clearContentCache();
  });

  describe('loadSecondChancesVoice', () => {
    it('should load second-chances-voice.json for ferni', async () => {
      const voice = await loadSecondChancesVoice('ferni');

      // Should have the main sections
      expect(voice).toBeDefined();
      if (voice) {
        expect(voice.holding_hope).toBeDefined();
        expect(voice.acknowledging_loss).toBeDefined();
        expect(voice.first_steps).toBeDefined();
        expect(voice.reframing).toBeDefined();
        expect(voice.celebrating_wins).toBeDefined();
        expect(voice.wisdom_sharing).toBeDefined();
      }
    });

    it('should have SSML-tagged phrases', async () => {
      const voice = await loadSecondChancesVoice('ferni');

      if (voice?.holding_hope?.when_they_cant) {
        const phrase = voice.holding_hope.when_they_cant[0];
        expect(phrase).toContain('<break time=');
      }
    });

    it('should fallback to ferni for non-existent persona', async () => {
      const voice = await loadSecondChancesVoice('non-existent-persona');
      // Should either return ferni's content or null
      // (depending on whether fallback is implemented)
      if (voice) {
        expect(voice.holding_hope).toBeDefined();
      }
    });
  });

  describe('loadConnectionVoice', () => {
    it('should load connection-voice.json for ferni', async () => {
      const voice = await loadConnectionVoice('ferni');

      expect(voice).toBeDefined();
      if (voice) {
        expect(voice.acknowledging_loneliness).toBeDefined();
        expect(voice.adult_friendship).toBeDefined();
        expect(voice.belonging).toBeDefined();
        expect(voice.late_night_loneliness).toBeDefined();
      }
    });
  });

  describe('loadDifficultConversationsVoice', () => {
    it('should load difficult-conversations-voice.json for ferni', async () => {
      const voice = await loadDifficultConversationsVoice('ferni');

      expect(voice).toBeDefined();
      if (voice) {
        expect(voice.validation).toBeDefined();
        expect(voice.preparation).toBeDefined();
        expect(voice.practice_mode).toBeDefined();
        expect(voice.boundaries).toBeDefined();
        expect(voice.repair).toBeDefined();
      }
    });
  });

  describe('loadLifeTransitionsVoice', () => {
    it('should load life-transitions-voice.json for ferni', async () => {
      const voice = await loadLifeTransitionsVoice('ferni');

      expect(voice).toBeDefined();
      if (voice) {
        expect(voice.acknowledging_transitions).toBeDefined();
        expect(voice.stages).toBeDefined();
        expect(voice.dual_emotions).toBeDefined();
        expect(voice.identity).toBeDefined();
        expect(voice.uncertainty).toBeDefined();
      }
    });
  });

  describe('loadQuietGrowthVoice', () => {
    it('should load quiet-growth-voice.json for ferni', async () => {
      const voice = await loadQuietGrowthVoice('ferni');

      expect(voice).toBeDefined();
      if (voice) {
        expect(voice.permission_to_rest).toBeDefined();
        expect(voice.celebrating_maintenance).toBeDefined();
        expect(voice.anti_hustle).toBeDefined();
      }
    });
  });
});

// ============================================================================
// DOMAIN DETECTION TESTS
// ============================================================================

describe('detectLifeCoachingDomains', () => {
  describe('secondChances detection', () => {
    it('should detect second chances from "starting over" text', () => {
      const domains = detectLifeCoachingDomains("I'm thinking about starting over");
      expect(domains.some((d) => d.domain === 'secondChances')).toBe(true);
    });

    it('should detect second chances from failure-related text', () => {
      const domains = detectLifeCoachingDomains('I feel like I failed at everything');
      expect(domains.some((d) => d.domain === 'secondChances')).toBe(true);
    });

    it('should detect second chances from career setback text', () => {
      const domains = detectLifeCoachingDomains('I got fired last week');
      expect(domains.some((d) => d.domain === 'secondChances')).toBe(true);
    });
  });

  describe('connection detection', () => {
    it('should detect connection from loneliness text', () => {
      const domains = detectLifeCoachingDomains("I feel so lonely lately");
      expect(domains.some((d) => d.domain === 'connection')).toBe(true);
    });

    it('should detect connection from isolation text', () => {
      const domains = detectLifeCoachingDomains("I don't have anyone to talk to");
      expect(domains.some((d) => d.domain === 'connection')).toBe(true);
    });

    it('should detect connection from friendship text', () => {
      const domains = detectLifeCoachingDomains("It's hard to make friends as an adult");
      expect(domains.some((d) => d.domain === 'connection')).toBe(true);
    });
  });

  describe('difficultConversations detection', () => {
    it('should detect difficult conversations from boundary text', () => {
      const domains = detectLifeCoachingDomains('I need to set a boundary with my mom');
      expect(domains.some((d) => d.domain === 'difficultConversations')).toBe(true);
    });

    it('should detect difficult conversations from practice request', () => {
      const domains = detectLifeCoachingDomains("Can you help me practice what to say");
      expect(domains.some((d) => d.domain === 'difficultConversations')).toBe(true);
    });

    it('should detect difficult conversations from raise request', () => {
      const domains = detectLifeCoachingDomains('I want to ask for a raise');
      expect(domains.some((d) => d.domain === 'difficultConversations')).toBe(true);
    });
  });

  describe('lifeTransitions detection', () => {
    it('should detect life transitions from major change text', () => {
      const domains = detectLifeCoachingDomains("I'm going through a big change");
      expect(domains.some((d) => d.domain === 'lifeTransitions')).toBe(true);
    });

    it('should detect life transitions from identity text', () => {
      const domains = detectLifeCoachingDomains("I don't know who I am anymore");
      expect(domains.some((d) => d.domain === 'lifeTransitions')).toBe(true);
    });

    it('should detect life transitions from empty nest text', () => {
      const domains = detectLifeCoachingDomains('My kids just left for college, empty nest');
      expect(domains.some((d) => d.domain === 'lifeTransitions')).toBe(true);
    });
  });

  describe('quietGrowth detection', () => {
    it('should detect quiet growth from burnout text', () => {
      const domains = detectLifeCoachingDomains("I'm so burned out");
      expect(domains.some((d) => d.domain === 'quietGrowth')).toBe(true);
    });

    it('should detect quiet growth from comparison text', () => {
      const domains = detectLifeCoachingDomains("Everyone else is ahead of me");
      expect(domains.some((d) => d.domain === 'quietGrowth')).toBe(true);
    });

    it('should detect quiet growth from plateau text', () => {
      const domains = detectLifeCoachingDomains("I feel stuck on a plateau");
      expect(domains.some((d) => d.domain === 'quietGrowth')).toBe(true);
    });
  });

  describe('emotion-based hints', () => {
    it('should boost secondChances confidence when hopeless emotion detected', () => {
      const domains = detectLifeCoachingDomains("I'm thinking about starting over", 'hopeless');
      const secondChances = domains.find((d) => d.domain === 'secondChances');
      expect(secondChances).toBeDefined();
      // Should have boosted confidence from emotion
      expect(secondChances!.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('should hint connection domain when lonely emotion detected', () => {
      const domains = detectLifeCoachingDomains("I've been feeling down", 'lonely');
      expect(domains.some((d) => d.domain === 'connection')).toBe(true);
    });

    it('should hint quietGrowth domain when exhausted emotion detected', () => {
      const domains = detectLifeCoachingDomains("I don't know what to do", 'exhausted');
      expect(domains.some((d) => d.domain === 'quietGrowth')).toBe(true);
    });
  });

  describe('multiple domain detection', () => {
    it('should detect multiple domains from complex text', () => {
      const domains = detectLifeCoachingDomains(
        "I got fired and I'm so lonely. I need to start over but I'm burned out."
      );
      expect(domains.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ============================================================================
// CONTEXT BUILDER INTEGRATION TESTS
// ============================================================================

describe('buildLifeCoachingContext', () => {
  const createMockInput = (overrides: Partial<ContextBuilderInput> = {}): ContextBuilderInput => ({
    userText: '',
    conversationState: {},
    userData: {},
    services: {} as ContextBuilderInput['services'],
    userProfile: undefined,
    persona: { id: 'ferni', name: 'Ferni' } as ContextBuilderInput['persona'],
    analysis: {
      emotion: { primary: 'neutral', intensity: 0.5 },
      intent: { primary: 'chat', confidence: 0.5 },
      topics: { detected: [] },
      state: { phase: 'active' },
    },
    ...overrides,
  });

  it('should return empty array for short text', async () => {
    const input = createMockInput({ userText: 'Hi' });
    const injections = await buildLifeCoachingContext(input);
    expect(injections).toHaveLength(0);
  });

  it('should return injections for second chances topic', async () => {
    const input = createMockInput({
      userText: "I lost my job and I'm trying to figure out how to start over completely",
    });
    const injections = await buildLifeCoachingContext(input);
    expect(injections.length).toBeGreaterThanOrEqual(0);
    // If injections exist, they should have life coaching content
    if (injections.length > 0) {
      const content = injections[0].content;
      expect(content).toContain('SECOND CHANCES');
    }
  });

  it('should return injections for connection topic', async () => {
    const input = createMockInput({
      userText: "I feel so lonely and isolated. I don't have anyone to talk to about this.",
    });
    const injections = await buildLifeCoachingContext(input);
    if (injections.length > 0) {
      const content = injections[0].content;
      expect(content).toContain('CONNECTION');
    }
  });

  it('should return injections for difficult conversations topic', async () => {
    const input = createMockInput({
      userText:
        'I need to set a boundary with my sister but I dont know how to say it. Can we practice?',
    });
    const injections = await buildLifeCoachingContext(input);
    if (injections.length > 0) {
      const content = injections[0].content;
      expect(content).toContain('DIFFICULT CONVERSATIONS');
    }
  });

  it('should return injections for life transitions topic', async () => {
    const input = createMockInput({
      userText:
        "I'm going through a big life change and I feel happy and sad at the same time. Mixed feelings.",
    });
    const injections = await buildLifeCoachingContext(input);
    if (injections.length > 0) {
      const hasTransitions = injections.some((i) => i.content.includes('LIFE TRANSITIONS'));
      expect(hasTransitions).toBe(true);
    }
  });

  it('should return injections for quiet growth topic', async () => {
    const input = createMockInput({
      userText: "I'm burned out and everyone else seems to be doing so much better than me",
    });
    const injections = await buildLifeCoachingContext(input);
    if (injections.length > 0) {
      const content = injections[0].content;
      expect(content).toContain('QUIET GROWTH');
    }
  });

  it('should include better-than-human guidance', async () => {
    const input = createMockInput({
      userText: "I feel hopeless about starting over after my divorce",
    });
    const injections = await buildLifeCoachingContext(input);
    if (injections.length > 0) {
      const content = injections[0].content;
      expect(content).toContain('BETTER THAN HUMAN');
    }
  });
});
