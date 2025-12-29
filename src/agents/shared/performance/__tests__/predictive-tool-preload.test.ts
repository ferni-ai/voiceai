/**
 * Predictive Tool Preload Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  predictTools,
  predictAndPreload,
  clearPreloadCache,
  getPreloadCacheStats,
} from '../predictive-tool-preload.js';

describe('predictive-tool-preload', () => {
  beforeEach(() => {
    clearPreloadCache();
  });

  describe('predictTools', () => {
    it('should return empty array for short input', () => {
      const result = predictTools('hi');
      expect(result).toEqual([]);
    });

    it('should detect weather patterns', () => {
      const result = predictTools("what's the weather like today?");
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((r) => r.toolId === 'getWeather' || r.toolId === 'weather_current')).toBe(
        true
      );
    });

    it('should detect music patterns', () => {
      const result = predictTools('play some jazz music');
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((r) => r.toolId === 'playMusic')).toBe(true);
    });

    it('should detect calendar patterns', () => {
      const result = predictTools("what's on my schedule today?");
      expect(result.length).toBeGreaterThan(0);
      expect(
        result.some((r) => r.toolId === 'getCalendarToday' || r.toolId === 'getUpcomingMeetings')
      ).toBe(true);
    });

    it('should detect timer patterns', () => {
      const result = predictTools('set a timer for 5 minutes');
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((r) => r.toolId === 'setTimer' || r.toolId === 'setReminder')).toBe(true);
    });

    it('should detect news patterns', () => {
      const result = predictTools("what's in the news?");
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((r) => r.toolId === 'getNews')).toBe(true);
    });

    it('should detect task patterns', () => {
      const result = predictTools('add a task to call mom');
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((r) => r.toolId === 'getTasks' || r.toolId === 'addTask')).toBe(true);
    });

    it('should detect habit patterns', () => {
      const result = predictTools('how am I doing with my habits?');
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((r) => r.toolId === 'getHabits')).toBe(true);
    });

    it('should detect home automation patterns', () => {
      const result = predictTools('turn on the lights');
      expect(result.length).toBeGreaterThan(0);
      expect(
        result.some((r) => r.toolId === 'getHomeStatus' || r.toolId === 'controlDevice')
      ).toBe(true);
    });

    it('should detect handoff patterns', () => {
      const result = predictTools('can I talk to maya?');
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((r) => r.toolId === 'handoff')).toBe(true);
    });

    it('should filter by confidence threshold', () => {
      const result = predictTools("what's the weather?", 0.95);
      // Weather has 0.9 confidence, so should be filtered
      expect(result.length).toBe(0);
    });

    it('should sort by confidence descending', () => {
      const result = predictTools('play some music please');
      if (result.length > 1) {
        for (let i = 1; i < result.length; i++) {
          expect(result[i - 1].confidence).toBeGreaterThanOrEqual(result[i].confidence);
        }
      }
    });
  });

  describe('predictAndPreload', () => {
    it('should return predictions', () => {
      const result = predictAndPreload("what's the weather?");
      expect(result.length).toBeGreaterThan(0);
    });

    it('should not throw on empty input', () => {
      expect(() => predictAndPreload('')).not.toThrow();
    });
  });

  describe('cache stats', () => {
    it('should start with empty cache', () => {
      const stats = getPreloadCacheStats();
      expect(stats.cacheSize).toBe(0);
      expect(stats.toolIds).toEqual([]);
    });
  });
});
