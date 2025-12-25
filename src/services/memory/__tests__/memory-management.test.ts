/**
 * Memory Management Service Tests
 *
 * Tests for phone cache, voice recognition greetings, and proactive memory.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCachedPhoneMapping,
  savePhoneMapping,
  deletePhoneMapping,
  compareVoiceSketches,
  generateVoiceRecognitionGreeting,
  shouldSurfaceMemory,
  type ProactiveMemory,
} from '../memory-management.js';
import type { VoiceSketch } from '../../../types/user-profile.js';

describe('MemoryManagement', () => {
  // ===========================================================================
  // Phone Cache (In-Memory)
  // ===========================================================================
  describe('PhoneCache', () => {
    it('should save phone mapping to cache', async () => {
      const phone = `+1555${Date.now()}`;
      const userId = `user-${Date.now()}`;

      await savePhoneMapping(phone, userId);

      const cached = getCachedPhoneMapping(phone);
      expect(cached).toBe(userId);
    });

    it('should return undefined for unknown phone', () => {
      const cached = getCachedPhoneMapping('+1555unknown');

      expect(cached).toBeUndefined();
    });

    it('should overwrite existing mapping', async () => {
      const phone = `+1555${Date.now()}a`;

      await savePhoneMapping(phone, 'user-1');
      await savePhoneMapping(phone, 'user-2');

      const cached = getCachedPhoneMapping(phone);
      expect(cached).toBe('user-2');
    });

    it('should delete phone mapping', async () => {
      const phone = `+1555${Date.now()}b`;

      await savePhoneMapping(phone, 'user-1');
      await deletePhoneMapping(phone);

      const cached = getCachedPhoneMapping(phone);
      expect(cached).toBeUndefined();
    });
  });

  // ===========================================================================
  // Voice Sketch Comparison
  // ===========================================================================
  describe('compareVoiceSketches', () => {
    const baseSketch: VoiceSketch = {
      pitchMean: 150,
      pitchMin: 120,
      pitchMax: 180,
      pitchStdDev: 15,
      speakingRateMean: 4.5,
      pauseFrequency: 8,
      avgPauseDuration: 300,
      spectralCentroidMean: 1500,
      spectralCentroidStdDev: 200,
      spectralRolloffMean: 4000,
      energyMean: 50,
      energyStdDev: 20,
      samplesAnalyzed: 100,
      totalDurationMs: 30000,
      confidence: 0.8,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return 1.0 for identical sketches', () => {
      const similarity = compareVoiceSketches(baseSketch, { ...baseSketch });

      expect(similarity).toBeCloseTo(1.0, 5);
    });

    it('should return high similarity for similar sketches', () => {
      const similar: VoiceSketch = {
        ...baseSketch,
        pitchMean: 155, // Slightly different
        speakingRateMean: 4.6,
      };

      const similarity = compareVoiceSketches(baseSketch, similar);

      expect(similarity).toBeGreaterThan(0.9);
    });

    it('should return lower similarity for different speakers', () => {
      const different: VoiceSketch = {
        ...baseSketch,
        pitchMean: 250, // Much higher pitch
        speakingRateMean: 8.0, // Much faster speaker
        spectralCentroidMean: 4000, // Much brighter voice
        spectralRolloffMean: 8000,
        pauseFrequency: 20,
        avgPauseDuration: 100,
      };

      const similarity = compareVoiceSketches(baseSketch, different);

      // The cosine similarity will still be relatively high due to normalization
      // but should be noticeably lower than identical sketches
      expect(similarity).toBeLessThan(0.99);
    });
  });

  // ===========================================================================
  // Voice Recognition Greetings
  // ===========================================================================
  describe('generateVoiceRecognitionGreeting', () => {
    it('should return null for low similarity', () => {
      const greeting = generateVoiceRecognitionGreeting(0.5);

      expect(greeting).toBeNull();
    });

    it('should return null for just below threshold', () => {
      const greeting = generateVoiceRecognitionGreeting(0.74);

      expect(greeting).toBeNull();
    });

    it('should return uncertain greeting for 75-85% similarity', () => {
      const greeting = generateVoiceRecognitionGreeting(0.80);

      expect(greeting).toContain('familiar');
    });

    it('should return familiar greeting for 85-90% similarity', () => {
      const greeting = generateVoiceRecognitionGreeting(0.88, 'Alice');

      expect(greeting).toContain('Alice');
      expect(greeting).toContain('familiar');
    });

    it('should return confident greeting for 90-95% similarity', () => {
      const greeting = generateVoiceRecognitionGreeting(0.92, 'Bob');

      expect(greeting).toContain('Bob');
      expect(greeting).toContain('familiar');
    });

    it('should return recognition greeting for >95% similarity', () => {
      const greeting = generateVoiceRecognitionGreeting(0.97, 'Charlie');

      expect(greeting).toContain('Charlie');
      expect(greeting).toContain('recognized');
    });

    it('should use "friend" as default name', () => {
      const greeting = generateVoiceRecognitionGreeting(0.98);

      expect(greeting).toContain('friend');
    });
  });

  // ===========================================================================
  // Proactive Memory Surfacing
  // ===========================================================================
  describe('shouldSurfaceMemory', () => {
    const createMemory = (priority: 'high' | 'medium' | 'low'): ProactiveMemory => ({
      type: 'follow_up',
      priority,
      content: 'Test memory',
      suggestedMention: 'Test mention',
      relevanceScore: 0.8,
    });

    it('should not surface any memory in first 2 turns', () => {
      const highPriority = createMemory('high');

      expect(shouldSurfaceMemory(highPriority, 0)).toBe(false);
      expect(shouldSurfaceMemory(highPriority, 1)).toBe(false);
      expect(shouldSurfaceMemory(highPriority, 2)).toBe(false);
    });

    it('should surface high priority memory at turn 3', () => {
      const highPriority = createMemory('high');

      const result = shouldSurfaceMemory(highPriority, 3);

      expect(result).toBe(true);
    });

    it('should not surface medium memory if recently surfaced', () => {
      const mediumPriority = createMemory('medium');

      // Last memory was surfaced at turn 5, now at turn 8
      // Only 3 turns since last, need 5 - medium priority respects this
      const result = shouldSurfaceMemory(mediumPriority, 8, 5);

      expect(result).toBe(false);
    });

    it('should allow surfacing after 5 turns gap', () => {
      const highPriority = createMemory('high');

      // Last memory was surfaced at turn 3, now at turn 8
      const result = shouldSurfaceMemory(highPriority, 8, 3);

      expect(result).toBe(true);
    });

    it('should not surface medium priority before turn 5', () => {
      const mediumPriority = createMemory('medium');

      expect(shouldSurfaceMemory(mediumPriority, 3)).toBe(false);
      expect(shouldSurfaceMemory(mediumPriority, 4)).toBe(false);
    });

    it('should not surface low priority before turn 8', () => {
      const lowPriority = createMemory('low');

      expect(shouldSurfaceMemory(lowPriority, 5)).toBe(false);
      expect(shouldSurfaceMemory(lowPriority, 7)).toBe(false);
    });

    // Note: Medium and low priority have random chance, so we test the conditions
    it('should have chance to surface medium priority at turn 5+', () => {
      const mediumPriority = createMemory('medium');

      // Run multiple times - at least some should return true (20% chance)
      let surfacedCount = 0;
      for (let i = 0; i < 100; i++) {
        if (shouldSurfaceMemory(mediumPriority, 10)) {
          surfacedCount++;
        }
      }

      // Should be roughly 20% (between 5% and 40% for statistical validity)
      expect(surfacedCount).toBeGreaterThan(5);
      expect(surfacedCount).toBeLessThan(40);
    });

    it('should have chance to surface low priority at turn 8+', () => {
      const lowPriority = createMemory('low');

      // Run multiple times - at least some should return true (10% chance)
      let surfacedCount = 0;
      for (let i = 0; i < 100; i++) {
        if (shouldSurfaceMemory(lowPriority, 15)) {
          surfacedCount++;
        }
      }

      // Should be roughly 10% (between 2% and 25% for statistical validity)
      expect(surfacedCount).toBeGreaterThan(2);
      expect(surfacedCount).toBeLessThan(25);
    });
  });
});
