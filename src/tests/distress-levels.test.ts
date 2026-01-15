/**
 * Tests for distress-levels.ts
 *
 * Verifies the centralized distress level constants and utilities work correctly.
 */

import { describe, expect, it } from 'vitest';
import {
  DISTRESS,
  DISTRESS_GUIDANCE,
  formatDistressForPrompt,
  getDistressCategory,
  getDistressGuidance,
  getSuggestedTone,
  isCrisis,
  needsEmotionalSupport,
  shouldBeGentle,
  type DistressLevel,
} from '../intelligence/distress-levels.js';

describe('distress-levels', () => {
  describe('DISTRESS constants', () => {
    it('should have correct threshold values', () => {
      expect(DISTRESS.CRISIS).toBe(0.8);
      expect(DISTRESS.HIGH).toBe(0.7);
      expect(DISTRESS.MODERATE).toBe(0.5);
      expect(DISTRESS.ELEVATED).toBe(0.4);
      expect(DISTRESS.MILD).toBe(0.2);
      expect(DISTRESS.LOW).toBe(0.0);
    });

    it('should have thresholds in descending order', () => {
      expect(DISTRESS.CRISIS).toBeGreaterThan(DISTRESS.HIGH);
      expect(DISTRESS.HIGH).toBeGreaterThan(DISTRESS.MODERATE);
      expect(DISTRESS.MODERATE).toBeGreaterThan(DISTRESS.ELEVATED);
      expect(DISTRESS.ELEVATED).toBeGreaterThan(DISTRESS.MILD);
      expect(DISTRESS.MILD).toBeGreaterThan(DISTRESS.LOW);
    });
  });

  describe('getDistressCategory', () => {
    it('should return CRISIS for levels >= 0.8', () => {
      expect(getDistressCategory(0.8)).toBe('CRISIS');
      expect(getDistressCategory(0.9)).toBe('CRISIS');
      expect(getDistressCategory(1.0)).toBe('CRISIS');
    });

    it('should return HIGH for levels >= 0.7 and < 0.8', () => {
      expect(getDistressCategory(0.7)).toBe('HIGH');
      expect(getDistressCategory(0.75)).toBe('HIGH');
      expect(getDistressCategory(0.79)).toBe('HIGH');
    });

    it('should return MODERATE for levels >= 0.5 and < 0.7', () => {
      expect(getDistressCategory(0.5)).toBe('MODERATE');
      expect(getDistressCategory(0.6)).toBe('MODERATE');
      expect(getDistressCategory(0.69)).toBe('MODERATE');
    });

    it('should return ELEVATED for levels >= 0.4 and < 0.5', () => {
      expect(getDistressCategory(0.4)).toBe('ELEVATED');
      expect(getDistressCategory(0.45)).toBe('ELEVATED');
      expect(getDistressCategory(0.49)).toBe('ELEVATED');
    });

    it('should return MILD for levels >= 0.2 and < 0.4', () => {
      expect(getDistressCategory(0.2)).toBe('MILD');
      expect(getDistressCategory(0.3)).toBe('MILD');
      expect(getDistressCategory(0.39)).toBe('MILD');
    });

    it('should return LOW for levels < 0.2', () => {
      expect(getDistressCategory(0.0)).toBe('LOW');
      expect(getDistressCategory(0.1)).toBe('LOW');
      expect(getDistressCategory(0.19)).toBe('LOW');
    });
  });

  describe('getDistressGuidance', () => {
    it('should return guidance object for each level', () => {
      const crisisGuidance = getDistressGuidance(0.85);
      expect(crisisGuidance.level).toBe('CRISIS');
      expect(crisisGuidance.tone).toBe('gentle');
      expect(crisisGuidance.responseLength).toBe('very_short');
      expect(crisisGuidance.guidance.length).toBeGreaterThan(0);
      expect(crisisGuidance.doNot.length).toBeGreaterThan(0);
    });

    it('should return appropriate tone for each category', () => {
      expect(getDistressGuidance(0.85).tone).toBe('gentle');
      expect(getDistressGuidance(0.75).tone).toBe('gentle');
      expect(getDistressGuidance(0.55).tone).toBe('warm');
      expect(getDistressGuidance(0.45).tone).toBe('warm');
      expect(getDistressGuidance(0.25).tone).toBe('friendly');
      expect(getDistressGuidance(0.1).tone).toBe('friendly');
    });
  });

  describe('needsEmotionalSupport', () => {
    it('should return true for MODERATE or higher', () => {
      expect(needsEmotionalSupport(0.5)).toBe(true);
      expect(needsEmotionalSupport(0.7)).toBe(true);
      expect(needsEmotionalSupport(0.9)).toBe(true);
    });

    it('should return false for below MODERATE', () => {
      expect(needsEmotionalSupport(0.4)).toBe(false);
      expect(needsEmotionalSupport(0.2)).toBe(false);
      expect(needsEmotionalSupport(0.0)).toBe(false);
    });
  });

  describe('isCrisis', () => {
    it('should return true for CRISIS level', () => {
      expect(isCrisis(0.8)).toBe(true);
      expect(isCrisis(0.9)).toBe(true);
      expect(isCrisis(1.0)).toBe(true);
    });

    it('should return false for below CRISIS', () => {
      expect(isCrisis(0.79)).toBe(false);
      expect(isCrisis(0.5)).toBe(false);
      expect(isCrisis(0.0)).toBe(false);
    });
  });

  describe('shouldBeGentle', () => {
    it('should return true for HIGH or CRISIS', () => {
      expect(shouldBeGentle(0.7)).toBe(true);
      expect(shouldBeGentle(0.8)).toBe(true);
      expect(shouldBeGentle(0.9)).toBe(true);
    });

    it('should return false for below HIGH', () => {
      expect(shouldBeGentle(0.69)).toBe(false);
      expect(shouldBeGentle(0.5)).toBe(false);
      expect(shouldBeGentle(0.0)).toBe(false);
    });
  });

  describe('getSuggestedTone', () => {
    it('should return gentle for high distress', () => {
      expect(getSuggestedTone(0.85)).toBe('gentle');
      expect(getSuggestedTone(0.75)).toBe('gentle');
    });

    it('should return warm for moderate distress', () => {
      expect(getSuggestedTone(0.55)).toBe('warm');
      expect(getSuggestedTone(0.45)).toBe('warm');
    });

    it('should return friendly for low distress', () => {
      expect(getSuggestedTone(0.25)).toBe('friendly');
      expect(getSuggestedTone(0.1)).toBe('friendly');
    });
  });

  describe('formatDistressForPrompt', () => {
    it('should return empty string for LOW/MILD distress', () => {
      expect(formatDistressForPrompt(0.1)).toBe('');
      expect(formatDistressForPrompt(0.25)).toBe('');
    });

    it('should return formatted string for ELEVATED or higher', () => {
      const result = formatDistressForPrompt(0.45);
      expect(result).toContain('DISTRESS LEVEL: ELEVATED');
      expect(result).toContain('TONE:');
      expect(result).toContain('GUIDANCE:');
    });

    it('should include DO NOT section for high distress', () => {
      const result = formatDistressForPrompt(0.85);
      expect(result).toContain('DISTRESS LEVEL: CRISIS');
      expect(result).toContain('DO NOT:');
    });

    it('should include percentage in output', () => {
      const result = formatDistressForPrompt(0.75);
      expect(result).toContain('75%');
    });
  });

  describe('DISTRESS_GUIDANCE', () => {
    it('should have guidance for all levels', () => {
      const levels: DistressLevel[] = ['CRISIS', 'HIGH', 'MODERATE', 'ELEVATED', 'MILD', 'LOW'];
      for (const level of levels) {
        expect(DISTRESS_GUIDANCE[level]).toBeDefined();
        expect(DISTRESS_GUIDANCE[level].level).toBe(level);
      }
    });

    it('should have non-empty guidance arrays for high distress', () => {
      expect(DISTRESS_GUIDANCE.CRISIS.guidance.length).toBeGreaterThan(0);
      expect(DISTRESS_GUIDANCE.HIGH.guidance.length).toBeGreaterThan(0);
      expect(DISTRESS_GUIDANCE.MODERATE.guidance.length).toBeGreaterThan(0);
    });

    it('should have doNot arrays for high distress', () => {
      expect(DISTRESS_GUIDANCE.CRISIS.doNot.length).toBeGreaterThan(0);
      expect(DISTRESS_GUIDANCE.HIGH.doNot.length).toBeGreaterThan(0);
    });
  });
});
