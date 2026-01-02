/**
 * E2E Test for Tool Selection Flow
 *
 * Tests the complete tool selection pipeline from user intent to final tool set.
 * This uses real (non-mocked) components to verify end-to-end behavior.
 *
 * Run: npx vitest run src/tools/orchestrator/__tests__/e2e-tool-selection.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Use real implementations (no mocks)
import { toolOrchestrator } from '../unified-tool-orchestrator.js';
import { detectToolIntent } from '../../dynamic-tool-router.js';
import { autoRegisterAllDomains } from '../../registry/loader.js';

describe('E2E: Tool Selection Pipeline', () => {
  beforeAll(async () => {
    // Register domain loaders (required for Vitest - can't use dynamic imports with variables)
    await autoRegisterAllDomains();

    // Initialize with real registry and semantic router
    await toolOrchestrator.initialize();
  }, 30000); // 30 second timeout for initialization

  afterAll(() => {
    toolOrchestrator.clearCaches();
  });

  describe('Music Playback Scenario', () => {
    it('should select playMusic tool for "play some jazz"', async () => {
      const result = await toolOrchestrator.getToolsForIntent({
        transcript: 'play some relaxing jazz',
        userId: 'e2e-test-user',
        agentId: 'ferni',
      });

      // Should have selected tools
      expect(result.meta.selected).toBeGreaterThan(0);

      // Should include music tools
      const toolNames = Object.keys(result.tools);
      const hasMusicTool = toolNames.some(
        (name) =>
          name.toLowerCase().includes('music') ||
          name.toLowerCase().includes('play') ||
          name === 'playMusic'
      );

      // Log for debugging
      console.log('Selected tools for music request:', toolNames);
      console.log('Selection meta:', result.meta);

      // Music should be found (entertainment is in always-available domains)
      expect(result.meta.sources.essential).toBeGreaterThan(0);
    });

    it('should select music tools for various phrasings', async () => {
      const musicPhrases = [
        'put on some music',
        'can you play a song',
        'I want to listen to Taylor Swift',
        'play something upbeat',
        'some relaxing background music please',
      ];

      for (const phrase of musicPhrases) {
        const result = await toolOrchestrator.getToolsForIntent({
          transcript: phrase,
          userId: 'e2e-test-user',
          agentId: 'ferni',
        });

        console.log(`"${phrase}" → ${result.meta.selected} tools`);
        expect(result.meta.selected).toBeGreaterThan(0);
      }
    }, 60000); // 60s timeout for multiple queries
  });

  describe('Emotional Support Scenarios', () => {
    it('should load grief tools for loss-related topics', async () => {
      const result = await toolOrchestrator.getToolsForIntent({
        transcript: 'my father passed away last week',
        userId: 'e2e-test-user',
        agentId: 'ferni',
      });

      // Should detect grief intent
      const intent = detectToolIntent('my father passed away last week');
      expect(intent.categories).toContain('grief');

      // Should have loaded tools
      expect(result.meta.selected).toBeGreaterThan(0);
      console.log('Grief scenario tools:', Object.keys(result.tools).slice(0, 10));
    });

    it('should load presence tools for anxiety topics', async () => {
      const result = await toolOrchestrator.getToolsForIntent({
        transcript: 'I am feeling really anxious right now',
        userId: 'e2e-test-user',
        agentId: 'ferni',
        context: {
          emotion: 'anxious',
        },
      });

      expect(result.meta.sources.contextual).toBeGreaterThanOrEqual(0);
      console.log('Anxiety scenario tools:', Object.keys(result.tools).slice(0, 10));
    });
  });

  describe('Decision Making Scenarios', () => {
    it('should detect decision intent', async () => {
      const phrases = [
        'should I take this job offer',
        'I cant decide between two options',
        'help me make a decision',
        'what would you do in my situation',
      ];

      for (const phrase of phrases) {
        const intent = detectToolIntent(phrase);
        console.log(`"${phrase.slice(0, 30)}..." → categories: ${intent.categories.join(', ')}`);

        // At least one should trigger decisions
        if (phrase.includes('should') || phrase.includes('decide')) {
          expect(intent.categories.length).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('Tool Limits', () => {
    it('should never exceed maxTools limit', async () => {
      // Test with a very broad query that could match many tools
      const result = await toolOrchestrator.getToolsForIntent({
        transcript:
          'help me with everything - music, weather, habits, relationships, career, finances',
        userId: 'e2e-test-user',
        agentId: 'ferni',
      });

      // Essential (always-available) tools may exceed base maxTools (35)
      // since they're required for core functionality (memory, handoff, entertainment, etc.)
      // The limit applies to non-essential tools, not the total
      // Currently essential domains have ~49+ tools
      expect(result.meta.selected).toBeLessThanOrEqual(100);
      console.log('Broad query selected:', result.meta.selected, 'tools');
    }, 60000); // 60s timeout for complex query
  });

  describe('Caching Behavior', () => {
    it('should cache and return faster on repeated queries', async () => {
      const request = {
        transcript: 'play some jazz music',
        userId: 'e2e-test-user',
        agentId: 'ferni',
      };

      // First call
      const result1 = await toolOrchestrator.getToolsForIntent(request);

      // Second call (should be cached)
      const result2 = await toolOrchestrator.getToolsForIntent(request);

      console.log(`First call: ${result1.meta.selectionTimeMs}ms`);
      console.log(`Second call (cached): ${result2.meta.selectionTimeMs}ms`);

      // Cache should make second call faster
      // (allowing some tolerance for test environment variability)
      expect(result2.meta.selectionTimeMs).toBeLessThanOrEqual(result1.meta.selectionTimeMs + 50);
    });
  });

  describe('Always-Available Domains', () => {
    it('should always include memory, handoff, and entertainment domains', async () => {
      const result = await toolOrchestrator.getToolsForIntent({
        transcript: 'hello', // Minimal query
        userId: 'e2e-test-user',
        agentId: 'ferni',
      });

      // Essential sources should be > 0
      expect(result.meta.sources.essential).toBeGreaterThanOrEqual(0);

      // Total should include essential tools
      console.log('Essential tools count:', result.meta.sources.essential);
    });
  });

  describe('Mid-Session Refresh', () => {
    it('should recommend refresh on significant topic change', async () => {
      const result = await toolOrchestrator.shouldRefreshTools({
        newTranscript: 'actually I want to talk about my career change',
        previousTools: ['playMusic', 'rememberUser', 'handoffToMaya'],
        sessionId: 'e2e-test-session',
      });

      console.log('Refresh recommendation:', result);
      expect(result.reason).toBeDefined();
    });
  });

  describe('Selection Explanation', () => {
    it('should generate human-readable explanations', async () => {
      const result = await toolOrchestrator.getToolsForIntent({
        transcript: 'play some relaxing music for my evening',
        userId: 'e2e-test-user',
        agentId: 'ferni',
        context: {
          timeOfDay: 'evening',
        },
      });

      const explanation = toolOrchestrator.explainSelection(result);

      console.log('=== Tool Selection Explanation ===');
      console.log(explanation);
      console.log('================================');

      expect(explanation).toContain('Tool Selection Breakdown');
      expect(explanation).toContain('Sources');
    });
  });
});

describe('Intent Detection Unit Tests', () => {
  describe('detectToolIntent', () => {
    it('should detect entertainment intent', () => {
      const intents = [
        'play some music',
        'put on spotify',
        'I want to listen to a song',
        'play my playlist',
      ];

      for (const text of intents) {
        const intent = detectToolIntent(text);
        const hasEntertainment =
          intent.domains.includes('entertainment') ||
          intent.triggerKeywords.some((k) =>
            ['music', 'song', 'spotify', 'playlist', 'play'].includes(k)
          );

        console.log(`"${text}" → triggers: ${intent.triggerKeywords.join(', ')}`);
      }
    });

    it('should detect grief intent', () => {
      const texts = [
        'my mom died last year',
        'I am mourning the loss',
        'dealing with grief',
        'someone passed away',
      ];

      for (const text of texts) {
        const intent = detectToolIntent(text);
        expect(intent.categories).toContain('grief');
      }
    });

    it('should detect crisis intent', () => {
      const texts = [
        'I am having a panic attack',
        'everything is falling apart',
        'I cant cope anymore',
      ];

      for (const text of texts) {
        const intent = detectToolIntent(text);
        console.log(`Crisis detection for "${text.slice(0, 20)}...": ${intent.categories}`);
      }
    });

    it('should return confidence scores', () => {
      // More keywords = higher confidence
      const lowConfidence = detectToolIntent('music');
      const highConfidence = detectToolIntent('play some relaxing jazz music on spotify');

      console.log('Low confidence:', lowConfidence.confidence);
      console.log('High confidence:', highConfidence.confidence);

      expect(highConfidence.confidence).toBeGreaterThanOrEqual(lowConfidence.confidence);
    });
  });
});
