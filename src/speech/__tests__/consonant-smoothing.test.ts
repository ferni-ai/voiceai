/**
 * Consonant Smoothing Tests
 *
 * Tests for the consonant cluster smoothing module that helps TTS
 * articulate difficult consonant combinations.
 */

import { describe, expect, it } from 'vitest';
import {
  applyConsonantSmoothing,
  detectDifficultClusters,
  getClusterStats,
} from '../consonant-smoothing.js';

describe('Consonant Smoothing', () => {
  describe('applyConsonantSmoothing', () => {
    it('should smooth -sts clusters (costs, tests)', () => {
      expect(applyConsonantSmoothing('The costs are high')).toBe('The cost-s are high');
      expect(applyConsonantSmoothing('Run the tests')).toBe('Run the test-s');
      expect(applyConsonantSmoothing('She invests wisely')).toBe('She invest-s wisely');
    });

    it('should smooth -sks clusters (tasks, risks)', () => {
      expect(applyConsonantSmoothing('Complete the tasks')).toBe('Complete the task-s');
      expect(applyConsonantSmoothing('Manage the risks')).toBe('Manage the risk-s');
      expect(applyConsonantSmoothing('Clear the desks')).toBe('Clear the desk-s');
    });

    it('should smooth -ngths clusters (strengths, lengths)', () => {
      expect(applyConsonantSmoothing('Your strengths are clear')).toBe('Your strength-s are clear');
      expect(applyConsonantSmoothing('The lengths vary')).toBe('The length-s vary');
    });

    it('should smooth ordinals (sixth, fifth)', () => {
      expect(applyConsonantSmoothing('The sixth item')).toBe('The siks-th item');
      expect(applyConsonantSmoothing('Her fifth attempt')).toBe('Her fif-th attempt');
      expect(applyConsonantSmoothing('The twelfth month')).toBe('The twelf-th month');
    });

    it('should smooth -nthl clusters (monthly)', () => {
      expect(applyConsonantSmoothing('Pay monthly')).toBe('Pay month-lee');
      expect(applyConsonantSmoothing('In two months')).toBe('In two month-s');
    });

    it("should smooth contractions (shouldn't, wouldn't)", () => {
      expect(applyConsonantSmoothing("You shouldn't worry")).toBe("You should-n't worry");
      expect(applyConsonantSmoothing("I wouldn't do that")).toBe("I would-n't do that");
      expect(applyConsonantSmoothing("They couldn't help")).toBe("They could-n't help");
    });

    it('should handle multiple clusters in one sentence', () => {
      const input = 'The costs and risks of these tasks vary by monthly strengths';
      const output = applyConsonantSmoothing(input);
      expect(output).toContain('cost-s');
      expect(output).toContain('risk-s');
      expect(output).toContain('task-s');
      expect(output).toContain('month-lee');
      expect(output).toContain('strength-s');
    });

    it('should preserve text without clusters', () => {
      const input = 'This is a simple sentence with no difficult sounds';
      expect(applyConsonantSmoothing(input)).toBe(input);
    });

    it('should match case-insensitively', () => {
      // The pattern matches case-insensitively, replacement is consistent
      expect(applyConsonantSmoothing('COSTS')).toContain('-s');
      expect(applyConsonantSmoothing('Monthly')).toContain('month');
      expect(applyConsonantSmoothing('SIXTH')).toContain('siks-th');
    });
  });

  describe('detectDifficultClusters', () => {
    it('should detect difficult clusters in text', () => {
      const clusters = detectDifficultClusters('The costs and risks are high');
      expect(clusters).toContain('costs - sts cluster');
      expect(clusters).toContain('risks - sks cluster');
    });

    it('should return empty array for text without clusters', () => {
      const clusters = detectDifficultClusters('Hello world');
      expect(clusters).toHaveLength(0);
    });

    it('should detect high-priority clusters', () => {
      const clusters = detectDifficultClusters('Build on your strengths');
      expect(clusters).toContain('strengths - ngths cluster');
    });
  });

  describe('getClusterStats', () => {
    it('should return statistics about clusters', () => {
      const stats = getClusterStats('The costs and risks of monthly tasks');
      expect(stats.totalClusters).toBeGreaterThan(0);
      expect(stats.clusterTypes.length).toBeGreaterThan(0);
    });

    it('should categorize by priority', () => {
      const stats = getClusterStats('Your strengths in the sixth month');
      expect(stats.byPriority[3]).toBeGreaterThan(0); // strengths
      expect(stats.byPriority[2]).toBeGreaterThan(0); // sixth
    });

    it('should return zero stats for clean text', () => {
      const stats = getClusterStats('Hello world');
      expect(stats.totalClusters).toBe(0);
    });
  });

  describe('SSML break mode', () => {
    it('should use SSML breaks when option is enabled', () => {
      const result = applyConsonantSmoothing('The costs are high', { useSSMLBreaks: true });
      expect(result).toContain('<break time="30ms"/>');
      expect(result).not.toContain('-s');
    });
  });
});
