/**
 * Dynamic Tool Loader Tests
 *
 * Tests for the modular dynamic tool loading system.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  DynamicToolLoader,
  TOPIC_TO_DOMAINS,
  DOMAIN_PRIORITY,
  DEFAULT_ESSENTIAL_DOMAINS,
} from '../index.js';

const logger = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getLogger: () => logger,
}));

// Mock the tool registry
vi.mock('../../registry/index.js', () => ({
  toolRegistry: {
    getToolsForDomain: vi.fn(() => [{ name: 'mock-tool-1' }, { name: 'mock-tool-2' }]),
    // One tool per requested domain, plus the requested optional tool ids.
    buildToolSet: vi.fn((spec: { domains?: string[]; optional?: string[] }) => ({
      tools: Object.fromEntries(
        [...(spec.domains ?? []).map((d) => `${d}Tool`), ...(spec.optional ?? [])].map((n) => [
          n,
          {},
        ])
      ),
    })),
  },
}));

vi.mock('../../registry/loader.js', () => ({
  loadToolDomain: vi.fn(() => Promise.resolve(true)),
}));

describe('DynamicToolLoader', () => {
  let loader: DynamicToolLoader;

  beforeEach(() => {
    vi.useFakeTimers();
    // Create fresh instance for each test
    loader = new DynamicToolLoader({
      enableAutoUnload: false, // Disable auto-unload for predictable tests
      maxLoadedDomains: 5,
      unloadAfterMs: 60000,
      essentialDomains: ['memory', 'handoff'],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Topic Detection', () => {
    it('matches topic keywords as whole words, not inside other words', () => {
      // Each of these loaded a wrong domain with a substring match.
      expect(loader.detectTopics("I don't even know where to start").detectedTopics).not.toContain(
        'art'
      );
      expect(loader.detectTopics("I can't recall what she said").detectedTopics).not.toContain(
        'call'
      );
      expect(loader.detectTopics('Give me a moment to think').detectedTopics).not.toContain('mom');
      expect(loader.detectTopics('We had the funeral on Sunday').detectedTopics).not.toContain(
        'fun'
      );
    });

    it('still matches the whole word, and its plural', () => {
      expect(loader.detectTopics('Can you call my mom?').detectedTopics).toEqual(
        expect.arrayContaining(['call', 'mom'])
      );
      expect(loader.detectTopics('Tell me some jokes').detectedTopics).toContain('joke');
      expect(loader.detectTopics('I keep calling her').detectedTopics).toContain('call');
    });

    it('should detect finance topics', () => {
      const result = loader.detectTopics('I want to check my budget');

      expect(result.detectedTopics.length).toBeGreaterThan(0);
      expect(result.suggestedDomains).toContain('finance');
    });

    it('should detect calendar topics', () => {
      const result = loader.detectTopics('Schedule a meeting for tomorrow');

      expect(result.suggestedDomains).toContain('calendar');
    });

    it('should detect habit topics', () => {
      const result = loader.detectTopics('I want to build a new habit');

      expect(result.suggestedDomains).toContain('habits');
    });

    it('should handle multiple topics in one message', () => {
      const result = loader.detectTopics(
        'I need to budget for my vacation and set up exercise habits'
      );

      expect(result.suggestedDomains).toContain('finance');
      expect(result.suggestedDomains).toContain('habits');
    });

    it('should return empty arrays for irrelevant text', () => {
      const result = loader.detectTopics('Hello, how are you?');

      expect(result.detectedTopics.length).toBe(0);
      expect(result.suggestedDomains.length).toBe(0);
    });

    it('should calculate confidence based on matches', () => {
      // Single match
      const singleMatch = loader.detectTopics('budget');
      expect(singleMatch.confidence).toBeGreaterThan(0);
      expect(singleMatch.confidence).toBeLessThan(1);

      // Multiple matches
      const multiMatch = loader.detectTopics('budget money savings investing');
      expect(multiMatch.confidence).toBeGreaterThanOrEqual(singleMatch.confidence);
    });
  });

  describe('Domain Management', () => {
    it('should report status correctly', () => {
      const status = loader.getStatus();
      expect(status.loadedDomains).toBeDefined();
      expect(Array.isArray(status.loadedDomains)).toBe(true);
    });

    it('should have unloadDomain method', () => {
      expect(typeof loader.unloadDomain).toBe('function');
    });

    it('should have loadDomain method', () => {
      expect(typeof loader.loadDomain).toBe('function');
    });
  });

  describe('getToolsForDomains', () => {
    it("returns only the named domains' tools, not the essential ones", async () => {
      // A mid-session update merges these ahead of the agent's tools; the whole
      // catalog (essentials first) pushed the new domain past the 64-tool cap.
      loader = new DynamicToolLoader({
        enableAutoUnload: false,
        essentialDomains: ['memory', 'handoff'],
        essentialToolIds: ['quickTimer'],
        domainOfTool: () => undefined,
      });
      await loader.initialize({ userId: 'u1', agentId: 'ferni' } as never);
      await loader.loadDomain('information');

      expect(Object.keys(loader.getCurrentTools()).sort()).toEqual(
        ['handoffTool', 'informationTool', 'memoryTool', 'quickTimer'].sort()
      );
      expect(Object.keys(loader.getToolsForDomains(['information']))).toEqual(['informationTool']);
      // Names that aren't tool domains never reach the registry.
      expect(Object.keys(loader.getToolsForDomains(['information', 'not-a-domain']))).toEqual([
        'informationTool',
      ]);
      // ...and say so, so a misspelled domain doesn't quietly offer nothing.
      expect(logger.warn).toHaveBeenCalledWith(
        { unknownDomains: ['not-a-domain'] },
        expect.any(String)
      );
    });
  });

  describe('Topic Mappings', () => {
    it('should have finance topics mapped', () => {
      expect(TOPIC_TO_DOMAINS.money).toContain('finance');
      expect(TOPIC_TO_DOMAINS.budget).toContain('finance');
      expect(TOPIC_TO_DOMAINS.investing).toContain('finance');
    });

    it('should have wellness/exercise topics mapped', () => {
      // Exercise topics map to wellness + habits domains
      expect(TOPIC_TO_DOMAINS.exercise).toContain('wellness');
      expect(TOPIC_TO_DOMAINS.workout).toContain('wellness');
      expect(TOPIC_TO_DOMAINS.exercise).toContain('habits');
    });

    it('should have calendar topics mapped', () => {
      expect(TOPIC_TO_DOMAINS.meeting).toContain('calendar');
      expect(TOPIC_TO_DOMAINS.schedule).toContain('calendar');
      expect(TOPIC_TO_DOMAINS.appointment).toContain('calendar');
    });

    it('should have career/job topics mapped', () => {
      // Career topics map to life-planning domain
      expect(TOPIC_TO_DOMAINS.job).toContain('life-planning');
      expect(TOPIC_TO_DOMAINS.career).toContain('life-planning');
      expect(TOPIC_TO_DOMAINS.promotion).toContain('life-planning');
    });
  });

  describe('Domain Priorities', () => {
    it('should define priorities for all essential domains', () => {
      expect(DOMAIN_PRIORITY.memory).toBeDefined();
      expect(DOMAIN_PRIORITY.handoff).toBeDefined();
    });

    it('should have priorities defined for core domains', () => {
      // Higher priority = higher number in this system
      expect(DOMAIN_PRIORITY.memory).toBeDefined();
      expect(DOMAIN_PRIORITY.handoff).toBeDefined();
    });
  });

  describe('Status Reporting', () => {
    it('should report accurate status', async () => {
      const status = loader.getStatus();

      expect(status.loadedDomains).toBeDefined();
      expect(Array.isArray(status.loadedDomains)).toBe(true);
    });
  });

  describe('Essential Domains', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_ESSENTIAL_DOMAINS).toContain('memory');
      expect(DEFAULT_ESSENTIAL_DOMAINS).toContain('handoff');
    });
  });
});
