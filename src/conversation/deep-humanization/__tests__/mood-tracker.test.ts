/**
 * Mood Tracker Tests
 *
 * Unit tests for the conversation mood tracking system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  MoodTracker,
  getMoodTracker,
  resetMoodTracker,
  resetAllMoodTrackers,
} from '../mood-tracker.js';

// ============================================================================
// MOOD TRACKER TESTS
// ============================================================================

describe('MoodTracker', () => {
  let tracker: MoodTracker;

  beforeEach(() => {
    tracker = new MoodTracker();
  });

  afterEach(() => {
    resetAllMoodTrackers();
  });

  describe('initialization', () => {
    it('should start with default mood values', () => {
      const mood = tracker.getMood();
      expect(mood.energy).toBe(0.75);
      expect(mood.engagement).toBe(0.7);
      expect(mood.emotionalLoad).toBe(0);
      expect(mood.heavyTopicCount).toBe(0);
      expect(mood.inEmotionalMoment).toBe(false);
    });
  });

  describe('mood updates', () => {
    it('should decrease energy for heavy topics', () => {
      const initialMood = tracker.getMood();

      tracker.update({
        topicWeight: 'heavy',
        turnCount: 1,
      });

      const updatedMood = tracker.getMood();
      expect(updatedMood.energy).toBeLessThan(initialMood.energy);
      expect(updatedMood.emotionalLoad).toBeGreaterThan(0);
      expect(updatedMood.heavyTopicCount).toBe(1);
    });

    it('should increase energy for light topics', () => {
      // First decrease with heavy topic
      tracker.update({ topicWeight: 'heavy', turnCount: 1 });
      const afterHeavy = tracker.getMood();

      // Then increase with light topic
      tracker.update({ topicWeight: 'light', turnCount: 2 });
      const afterLight = tracker.getMood();

      expect(afterLight.energy).toBeGreaterThan(afterHeavy.energy);
      expect(afterLight.emotionalLoad).toBeLessThan(afterHeavy.emotionalLoad);
    });

    it('should track emotional moments for sadness', () => {
      tracker.update({
        userEmotion: 'sadness',
        turnCount: 1,
      });

      expect(tracker.getMood().inEmotionalMoment).toBe(true);
    });

    it('should track emotional moments for fear', () => {
      tracker.update({
        userEmotion: 'fear',
        turnCount: 1,
      });

      expect(tracker.getMood().inEmotionalMoment).toBe(true);
    });

    it('should track emotional moments for vulnerability', () => {
      tracker.update({
        userEmotion: 'vulnerable',
        turnCount: 1,
      });

      expect(tracker.getMood().inEmotionalMoment).toBe(true);
    });

    it('should increase engagement for high user engagement', () => {
      const initial = tracker.getMood();

      tracker.update({
        userEngagement: 'high',
        turnCount: 1,
      });

      expect(tracker.getMood().engagement).toBeGreaterThan(initial.engagement);
    });

    it('should decrease engagement for low user engagement', () => {
      const initial = tracker.getMood();

      tracker.update({
        userEngagement: 'low',
        turnCount: 1,
      });

      expect(tracker.getMood().engagement).toBeLessThan(initial.engagement);
    });

    it('should decay energy in long sessions', () => {
      for (let i = 1; i <= 20; i++) {
        tracker.update({ turnCount: i });
      }

      const mood = tracker.getMood();
      expect(mood.energy).toBeLessThan(0.75);
    });

    it('should accumulate heavy topic count', () => {
      tracker.update({ topicWeight: 'heavy', turnCount: 1 });
      tracker.update({ topicWeight: 'heavy', turnCount: 2 });
      tracker.update({ topicWeight: 'heavy', turnCount: 3 });

      expect(tracker.getMood().heavyTopicCount).toBe(3);
    });
  });

  describe('helper methods', () => {
    it('canBePlayful should return false during high emotional load', () => {
      tracker.update({ topicWeight: 'heavy', turnCount: 1 });
      tracker.update({ topicWeight: 'heavy', turnCount: 2 });
      tracker.update({ topicWeight: 'heavy', turnCount: 3 });

      expect(tracker.canBePlayful()).toBe(false);
    });

    it('canBePlayful should return true when emotionally light', () => {
      tracker.update({ topicWeight: 'light', turnCount: 1 });

      expect(tracker.canBePlayful()).toBe(true);
    });

    it('needsSupport should return true during emotional moments', () => {
      tracker.update({ userEmotion: 'sadness', turnCount: 1 });

      expect(tracker.needsSupport()).toBe(true);
    });

    it('hasHighEnergy should return true when both energy and engagement are high', () => {
      // Update to high values (>0.7 for both)
      tracker.update({ userEngagement: 'high', turnCount: 1 });
      tracker.update({ userEngagement: 'high', turnCount: 2 });
      expect(tracker.hasHighEnergy()).toBe(true);
    });

    it('hasHighEnergy should return false with default values', () => {
      // Default engagement is exactly 0.7, which fails > 0.7 check
      expect(tracker.hasHighEnergy()).toBe(false);
    });

    it('isLateSession should return true after many turns with low energy', () => {
      for (let i = 1; i <= 20; i++) {
        tracker.update({ topicWeight: 'heavy', turnCount: i });
      }

      expect(tracker.isLateSession()).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset mood to default values', () => {
      // Modify mood
      tracker.update({
        topicWeight: 'heavy',
        userEngagement: 'high',
        userEmotion: 'sadness',
        turnCount: 10,
      });

      // Reset
      tracker.reset();

      // Check defaults
      const mood = tracker.getMood();
      expect(mood.energy).toBe(0.75);
      expect(mood.engagement).toBe(0.7);
      expect(mood.emotionalLoad).toBe(0);
      expect(mood.heavyTopicCount).toBe(0);
      expect(mood.inEmotionalMoment).toBe(false);
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('getMoodTracker factory', () => {
  afterEach(() => {
    resetAllMoodTrackers();
  });

  it('should create singleton instance per persona', () => {
    const tracker1 = getMoodTracker('ferni');
    const tracker2 = getMoodTracker('ferni');
    expect(tracker1).toBe(tracker2);
  });

  it('should create different instances for different personas', () => {
    const ferniTracker = getMoodTracker('ferni');
    const peterTracker = getMoodTracker('peter-john');
    expect(ferniTracker).not.toBe(peterTracker);
  });

  it('should reset specific persona tracker', () => {
    const tracker = getMoodTracker('reset-test');
    tracker.update({ topicWeight: 'heavy', turnCount: 1 });

    resetMoodTracker('reset-test');

    // Get new instance - should have default mood
    const newTracker = getMoodTracker('reset-test');
    const mood = newTracker.getMood();
    expect(mood.energy).toBe(0.75);
  });

  it('should reset all trackers', () => {
    getMoodTracker('persona1').update({ topicWeight: 'heavy', turnCount: 1 });
    getMoodTracker('persona2').update({ topicWeight: 'heavy', turnCount: 1 });

    resetAllMoodTrackers();

    // Both should have default moods
    expect(getMoodTracker('persona1').getMood().energy).toBe(0.75);
    expect(getMoodTracker('persona2').getMood().energy).toBe(0.75);
  });
});
