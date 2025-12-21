/**
 * Trigger Embedding Service Tests
 *
 * Tests for the semantic trigger embedding service.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TriggerEmbeddingService,
  getTriggerEmbeddingService,
  resetTriggerEmbeddingService,
  detectTriggerCategory,
} from '../trigger-embedding-service.js';
import type { PersonaTriggerSet } from '../types.js';

// Mock the embeddings module
vi.mock('../../../memory/embeddings.js', () => ({
  embed: vi.fn().mockResolvedValue(new Array(768).fill(0.1)),
  embedBatch: vi.fn().mockImplementation((texts: string[]) =>
    Promise.resolve(texts.map(() => new Array(768).fill(0.1)))
  ),
  getEmbeddingProvider: vi.fn().mockReturnValue({
    model: 'text-embedding-004',
    dimensions: 768,
  }),
  cosineSimilarity: vi.fn().mockReturnValue(0.85),
}));

describe('TriggerEmbeddingService', () => {
  let service: TriggerEmbeddingService;

  beforeEach(() => {
    resetTriggerEmbeddingService();
    service = new TriggerEmbeddingService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('detectTriggerCategory', () => {
    it('should detect emotional triggers', () => {
      expect(detectTriggerCategory('User shows distress or anxiety')).toBe('emotional');
      expect(detectTriggerCategory('Detect grief or mourning signals')).toBe('emotional');
      expect(detectTriggerCategory('User is sad and overwhelmed')).toBe('emotional');
    });

    it('should detect behavioral triggers', () => {
      expect(detectTriggerCategory('User deflects with "anyway"')).toBe('behavioral');
      expect(detectTriggerCategory('User says "I\'m fine" but voice suggests otherwise')).toBe('behavioral');
      expect(detectTriggerCategory('User tries to avoid and deny the issue')).toBe('behavioral');
    });

    it('should detect temporal triggers', () => {
      expect(detectTriggerCategory('Late night session after 10PM')).toBe('temporal');
      expect(detectTriggerCategory('User returning after extended absence')).toBe('temporal');
      expect(detectTriggerCategory('Anniversary of significant event')).toBe('temporal');
    });

    it('should detect domain triggers', () => {
      expect(detectTriggerCategory('User mentions broken habit streak')).toBe('domain');
      expect(detectTriggerCategory('Market concern and portfolio anxiety')).toBe('domain');
      expect(detectTriggerCategory('Calendar overload and meeting fatigue')).toBe('domain');
    });

    it('should detect relational triggers', () => {
      expect(detectTriggerCategory('User replaying relationship conversation')).toBe('relational');
      expect(detectTriggerCategory('Waiting for friend to respond to text')).toBe('relational');
      expect(detectTriggerCategory('Family conflict and boundary issues')).toBe('relational');
    });

    it('should detect existential triggers', () => {
      expect(detectTriggerCategory('User asks "what\'s the point of all this"')).toBe('existential');
      expect(detectTriggerCategory('Questions about meaning and purpose')).toBe('existential');
      expect(detectTriggerCategory('User contemplating life and legacy')).toBe('existential');
    });

    it('should detect growth triggers', () => {
      expect(detectTriggerCategory('User notices they\'ve changed')).toBe('growth');
      expect(detectTriggerCategory('User says "I used to think differently"')).toBe('growth');
      expect(detectTriggerCategory('Progress and development in their journey')).toBe('growth');
    });
  });

  describe('initializeForPersona', () => {
    it('should initialize embeddings for all triggers', async () => {
      const triggerSet: PersonaTriggerSet = {
        personaId: 'ferni',
        triggers: {
          false_fine: {
            trigger: 'User says "I\'m fine" but voice suggests distress',
            behavior: 'Gently acknowledge: "I hear you. And I\'m here if there\'s more."',
          },
          late_night_worry: {
            trigger: 'Late night session with work concerns',
            behavior: 'Acknowledge the hour: "Still thinking about work at this hour?"',
          },
        },
        sourceFile: 'emotional-intelligence.json',
        loadedAt: new Date(),
      };

      const count = await service.initializeForPersona(triggerSet);

      expect(count).toBe(2);
      expect(service.isInitialized()).toBe(true);
    });

    it('should handle empty trigger sets', async () => {
      const triggerSet: PersonaTriggerSet = {
        personaId: 'ferni',
        triggers: {},
        sourceFile: 'empty.json',
        loadedAt: new Date(),
      };

      const count = await service.initializeForPersona(triggerSet);

      expect(count).toBe(0);
    });
  });

  describe('findSimilarTriggers', () => {
    beforeEach(async () => {
      const triggerSet: PersonaTriggerSet = {
        personaId: 'ferni',
        triggers: {
          distress_detection: {
            trigger: 'User shows signs of distress or anxiety',
            behavior: 'Offer support',
          },
          grief_moment: {
            trigger: 'User mentions loss or grief anniversary',
            behavior: 'Hold space gently',
          },
          work_anxiety: {
            trigger: 'Late night work worries',
            behavior: 'Acknowledge late hour',
          },
        },
        sourceFile: 'test.json',
        loadedAt: new Date(),
      };
      await service.initializeForPersona(triggerSet);
    });

    it('should find semantically similar triggers', async () => {
      const results = await service.findSimilarTriggers('I\'m feeling really anxious about tomorrow', {
        personaId: 'ferni',
        topK: 3,
        minSimilarity: 0.5,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].similarity).toBeGreaterThanOrEqual(0.5);
    });

    it('should filter by persona', async () => {
      const results = await service.findSimilarTriggers('I\'m anxious', {
        personaId: 'maya', // Different persona
        topK: 3,
      });

      expect(results.length).toBe(0);
    });

    it('should filter by category', async () => {
      const results = await service.findSimilarTriggers('work stress', {
        personaId: 'ferni',
        category: 'temporal',
        topK: 3,
      });

      // Only temporal triggers should be returned
      results.forEach((r) => {
        expect(r.trigger.category).toBe('temporal');
      });
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const triggerSet: PersonaTriggerSet = {
        personaId: 'ferni',
        triggers: {
          trigger1: { trigger: 'Emotional distress detected', behavior: 'Respond' },
          trigger2: { trigger: 'Late night session', behavior: 'Respond' },
        },
        sourceFile: 'test.json',
        loadedAt: new Date(),
      };
      await service.initializeForPersona(triggerSet);

      const stats = service.getStats();

      expect(stats.totalTriggers).toBe(2);
      expect(stats.byPersona.ferni).toBe(2);
      expect(stats.model).toBe('text-embedding-004');
      expect(stats.embeddingDimensions).toBe(768);
    });
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = getTriggerEmbeddingService();
      const instance2 = getTriggerEmbeddingService();

      expect(instance1).toBe(instance2);
    });

    it('should reset correctly', () => {
      const instance1 = getTriggerEmbeddingService();
      resetTriggerEmbeddingService();
      const instance2 = getTriggerEmbeddingService();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('addTrigger', () => {
    it('should add a single trigger', async () => {
      const result = await service.addTrigger('ferni', 'new_trigger', {
        trigger: 'User shows new pattern',
        behavior: 'Respond appropriately',
      });

      expect(result.name).toBe('new_trigger');
      expect(result.personaId).toBe('ferni');
      expect(result.embedding.length).toBe(768);
    });
  });

  describe('removeTrigger', () => {
    it('should remove an existing trigger', async () => {
      await service.addTrigger('ferni', 'to_remove', {
        trigger: 'Test trigger',
        behavior: 'Test response',
      });

      const removed = service.removeTrigger('ferni', 'to_remove');
      expect(removed).toBe(true);

      const trigger = service.getTrigger('ferni', 'to_remove');
      expect(trigger).toBeUndefined();
    });

    it('should return false for non-existent trigger', () => {
      const removed = service.removeTrigger('ferni', 'nonexistent');
      expect(removed).toBe(false);
    });
  });
});
