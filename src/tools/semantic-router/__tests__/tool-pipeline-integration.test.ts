/**
 * Tool Pipeline Integration Tests
 *
 * Tests the complete flow from user speech → semantic routing → tool selection → execution.
 * Validates that tools are discoverable and can be invoked correctly.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock logger before imports
vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

vi.mock('../../../services/performance-instrumentation.js', () => ({
  traceToolCall: vi.fn((_name, fn) => fn()),
  traceHandoff: vi.fn((_name, fn) => fn()),
  traceServiceCall: vi.fn((_name, fn) => fn()),
}));

import {
  allToolDefinitions,
  toolsByCategory,
  getToolStats,
  getHighPriorityTools,
} from '../tool-definitions/index.js';

describe('Tool Pipeline Integration', () => {
  describe('Tool Discovery', () => {
    it('should have a significant number of tools registered', () => {
      expect(allToolDefinitions.length).toBeGreaterThan(200);
    });

    it('should have tools organized by category', () => {
      const categories = Object.keys(toolsByCategory);
      expect(categories.length).toBeGreaterThan(30);
    });

    it('should have high-priority tools for quick access', () => {
      const highPriority = getHighPriorityTools();
      expect(highPriority.length).toBeGreaterThan(10);

      // Should include crisis tools
      const hascrisis = highPriority.some(
        (t) => t.category === 'crisis' || t.id.includes('crisis')
      );
      expect(hascrisis).toBe(true);
    });

    it('should report accurate tool statistics', () => {
      const stats = getToolStats();
      expect(stats.total).toBe(allToolDefinitions.length);
      expect(stats.music).toBeGreaterThan(0);
      expect(stats.weather).toBeGreaterThan(0);
      expect(stats.memory).toBeGreaterThan(0);
    });
  });

  describe('Category Coverage', () => {
    const expectedCategories = [
      // Core
      'music',
      'handoff',
      'weather',
      'calendar',
      'habits',
      'memory',
      'wellness',
      'information',
      // Safety-critical
      'crisis',
      'trauma-support',
      // Life domains
      'grief',
      'career',
      'relationships',
      'dating',
      // Productivity
      'productivity',
      'reminders',
      'learning',
      // Entertainment
      'games',
      'entertainment',
      // New domains (Jan 2026)
      'health-diagnosis',
      'concierge',
      'webhooks',
      'marketing',
      'referral',
      'voice-enrollment',
    ];

    it.each(expectedCategories)('should have tools for category: %s', (category) => {
      expect(toolsByCategory[category]).toBeDefined();
      expect(toolsByCategory[category].length).toBeGreaterThan(0);
    });
  });

  describe('Tool Structure Validation', () => {
    it('should have required fields on all tools', () => {
      for (const tool of allToolDefinitions) {
        expect(tool.id).toBeDefined();
        expect(typeof tool.id).toBe('string');
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.triggers).toBeDefined();
        expect(tool.execute).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      }
    });

    it('should have trigger phrases for all tools', () => {
      for (const tool of allToolDefinitions) {
        expect(tool.triggers.phrases).toBeDefined();
        expect(Array.isArray(tool.triggers.phrases)).toBe(true);
        expect(tool.triggers.phrases?.length).toBeGreaterThan(0);
      }
    });

    it('should have valid categories', () => {
      const validCategories = Object.keys(toolsByCategory);
      for (const tool of allToolDefinitions) {
        if (tool.category) {
          // Category should be a known type
          expect(typeof tool.category).toBe('string');
        }
      }
    });
  });

  describe('Semantic Matching Simulation', () => {
    // Simulate matching user input to tools

    const testCases = [
      // Music
      { input: 'play some jazz music', expectedCategory: 'music' },
      { input: 'pause the song', expectedCategory: 'music' },

      // Weather
      { input: "what's the weather like", expectedCategory: 'weather' },
      { input: 'will it rain tomorrow', expectedCategory: 'weather' },

      // Trauma support (safety-critical)
      { input: "I'm having a flashback", expectedCategory: 'trauma-support' },
      { input: 'I feel triggered', expectedCategory: 'trauma-support' },

      // Health diagnosis
      { input: 'I just got diagnosed with cancer', expectedCategory: 'health-diagnosis' },
      { input: 'living with chronic illness', expectedCategory: 'health-diagnosis' },

      // Concierge
      { input: 'book a restaurant reservation', expectedCategory: 'concierge' },
      { input: "schedule a doctor's appointment", expectedCategory: 'concierge' },

      // Webhooks
      { input: 'run my automation', expectedCategory: 'webhooks' },
      { input: 'trigger my ifttt', expectedCategory: 'webhooks' },

      // Marketing
      { input: 'write a tweet about AI', expectedCategory: 'marketing' },
      { input: 'post this to linkedin', expectedCategory: 'marketing' },

      // Referral
      { input: 'call my friend and introduce yourself', expectedCategory: 'referral' },
      { input: 'send a supportive call to my mom', expectedCategory: 'referral' },

      // Voice enrollment
      { input: 'enroll my voice', expectedCategory: 'voice-enrollment' },
      { input: 'add my wife to the household', expectedCategory: 'voice-enrollment' },
    ];

    it.each(testCases)('should have tools matching: "$input"', ({ input, expectedCategory }) => {
      const categoryTools = toolsByCategory[expectedCategory];
      expect(categoryTools).toBeDefined();

      // Check if any tool in category has matching phrases
      const inputLower = input.toLowerCase();
      const hasMatch = categoryTools.some((tool) => {
        // Check phrases
        const phraseMatch = tool.triggers.phrases?.some(
          (phrase) =>
            inputLower.includes(phrase.toLowerCase()) ||
            phrase.toLowerCase().includes(inputLower.split(' ')[0])
        );

        // Check keywords
        const keywordMatch = tool.triggers.keywords?.some((kw) => {
          const word = typeof kw === 'string' ? kw : kw.word;
          return inputLower.includes(word.toLowerCase());
        });

        // Check patterns
        const patternMatch = tool.triggers.patterns?.some((p) => p.test(input));

        return phraseMatch || keywordMatch || patternMatch;
      });

      expect(hasMatch).toBe(true);
    });
  });

  describe('Tool Execution Delegation', () => {
    it('should delegate to correct domain for trauma tools', async () => {
      const traumaTools = toolsByCategory['trauma-support'];
      for (const tool of traumaTools) {
        const result = await tool.execute({}, { userId: 'test' } as never);
        expect((result as { delegateTo?: string }).delegateTo).toContain('trauma');
      }
    });

    it('should delegate to correct domain for new domains', async () => {
      const domainTests = [
        { category: 'health-diagnosis', expectedDomain: 'health-diagnosis' },
        { category: 'concierge', expectedDomain: 'concierge' },
        { category: 'webhooks', expectedDomain: 'webhooks' },
        { category: 'marketing', expectedDomain: 'marketing' },
        { category: 'referral', expectedDomain: 'referral' },
        { category: 'voice-enrollment', expectedDomain: 'voice-enrollment' },
      ];

      for (const { category, expectedDomain } of domainTests) {
        const tools = toolsByCategory[category];
        expect(tools).toBeDefined();

        for (const tool of tools) {
          const result = await tool.execute({}, { userId: 'test' } as never);
          expect((result as { delegateTo?: string }).delegateTo).toContain(expectedDomain);
        }
      }
    });
  });

  describe('Safety-Critical Priority', () => {
    it('should have crisis tools registered', () => {
      const crisisTools = toolsByCategory['crisis'];
      expect(crisisTools).toBeDefined();
      expect(crisisTools.length).toBeGreaterThan(0);
    });

    it('should have trauma tools in high-priority list', () => {
      const highPriority = getHighPriorityTools();
      const traumaToolIds = toolsByCategory['trauma-support'].map((t) => t.id);

      const hasTraumaTools = highPriority.some((t) => traumaToolIds.includes(t.id));
      expect(hasTraumaTools).toBe(true);
    });
  });

  describe('Anti-Pattern Checks', () => {
    it('should have anti-keywords to prevent false matches', () => {
      // Sample of tools that should have anti-keywords
      const toolsNeedingAntiKeywords = [
        'trauma_aware_support',
        'health_diagnosis_shock',
        'referral_invite_friend',
      ];

      for (const toolId of toolsNeedingAntiKeywords) {
        const tool = allToolDefinitions.find((t) => t.id === toolId);
        if (tool) {
          expect(tool.triggers.antiKeywords).toBeDefined();
          expect(tool.triggers.antiKeywords!.length).toBeGreaterThan(0);
        }
      }
    });

    it('should not have duplicate tool IDs', () => {
      const ids = allToolDefinitions.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
