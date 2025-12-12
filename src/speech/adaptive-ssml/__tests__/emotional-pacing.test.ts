/**
 * Tests for Emotional Pacing
 *
 * Verifies that emotional pacing adds appropriate pauses for heavy topics.
 */

import { describe, expect, it } from 'vitest';

import { applyEmotionalPacing, hasEmotionalPacing, isHeavyContent } from '../emotional-pacing.js';

describe('emotional-pacing', () => {
  describe('applyEmotionalPacing', () => {
    it('should add heavy pause for grief emotion', () => {
      const result = applyEmotionalPacing('I am so sorry for your loss', {
        userEmotion: 'grief',
      });

      expect(result.applied).toBe(true);
      expect(result.text).toContain('<break time="400ms"/>');
      expect(result.text).toContain('<volume ratio="0.85"/>');
      expect(result.pauseMs).toBe(400);
      expect(result.reason).toContain('heavy emotion');
    });

    it('should add moderate pause for sad emotion', () => {
      const result = applyEmotionalPacing('I understand how you feel', {
        userEmotion: 'sad',
      });

      expect(result.applied).toBe(true);
      expect(result.text).toContain('<break time="250ms"/>');
      expect(result.pauseMs).toBe(250);
      expect(result.reason).toContain('moderate emotion');
    });

    it('should detect heavy topics in user message', () => {
      const result = applyEmotionalPacing('I hear you', {
        userMessage: 'My grandmother passed away last week',
      });

      expect(result.applied).toBe(true);
      expect(result.reason).toBe('heavy topic detected');
      expect(result.pauseMs).toBe(400);
    });

    it('should detect death/loss topics', () => {
      const messages = [
        'My dog died yesterday',
        'She passed away in her sleep',
        'I lost my father last month',
        'The funeral is tomorrow',
      ];

      for (const msg of messages) {
        const result = applyEmotionalPacing('I am sorry', { userMessage: msg });
        expect(result.applied).toBe(true);
        expect(result.reason).toBe('heavy topic detected');
      }
    });

    it('should detect relationship crisis topics', () => {
      const messages = [
        'We are getting a divorce',
        'She cheated on me',
        'He left me for someone else',
      ];

      for (const msg of messages) {
        const result = applyEmotionalPacing('That must be hard', { userMessage: msg });
        expect(result.applied).toBe(true);
      }
    });

    it('should detect moderate topics', () => {
      const result = applyEmotionalPacing('Tell me more', {
        userMessage: 'I am so stressed about everything',
      });

      expect(result.applied).toBe(true);
      expect(result.reason).toBe('moderate topic detected');
      expect(result.pauseMs).toBe(250);
    });

    it('should add pause for vulnerable share', () => {
      const result = applyEmotionalPacing('Thank you for sharing that', {
        isVulnerableShare: true,
      });

      expect(result.applied).toBe(true);
      expect(result.reason).toBe('vulnerable share');
    });

    it('should not add pause for neutral content', () => {
      const result = applyEmotionalPacing('That sounds great!', {
        userEmotion: 'happy',
        userMessage: 'I had a great day at work',
      });

      expect(result.applied).toBe(false);
      expect(result.text).toBe('That sounds great!');
      expect(result.reason).toBe('no heavy content');
    });

    it('should skip if text already has leading break', () => {
      const result = applyEmotionalPacing('<break time="300ms"/>Already paused', {
        userEmotion: 'grief',
      });

      expect(result.applied).toBe(false);
      expect(result.reason).toBe('already has leading break');
    });

    it('should respect custom pause durations', () => {
      const result = applyEmotionalPacing(
        'I understand',
        {
          userEmotion: 'grief',
        },
        {
          heavyPauseMs: 600,
          moderatePauseMs: 350,
        }
      );

      expect(result.pauseMs).toBe(600);
      expect(result.text).toContain('<break time="600ms"/>');
    });

    it('should respect custom volume ratio', () => {
      const result = applyEmotionalPacing(
        'I am here for you',
        {
          userEmotion: 'grief',
        },
        {
          openingVolumeRatio: 0.7,
        }
      );

      expect(result.text).toContain('<volume ratio="0.7"/>');
    });

    it('should prioritize heavy over moderate emotions', () => {
      // Even with moderate emotion, heavy topic wins
      const result = applyEmotionalPacing('I am sorry', {
        userEmotion: 'sad', // moderate
        userMessage: 'My father died', // heavy topic
      });

      expect(result.pauseMs).toBe(400); // Heavy pause, not moderate
    });
  });

  describe('isHeavyContent', () => {
    it('should return true for heavy emotions', () => {
      expect(isHeavyContent('', 'grief')).toBe(true);
      expect(isHeavyContent('', 'devastated')).toBe(true);
      expect(isHeavyContent('', 'hopeless')).toBe(true);
    });

    it('should return true for heavy topic patterns', () => {
      expect(isHeavyContent('My mom died last week')).toBe(true);
      expect(isHeavyContent('I was diagnosed with cancer')).toBe(true);
      expect(isHeavyContent('We are getting a divorce')).toBe(true);
    });

    it('should return false for neutral content', () => {
      expect(isHeavyContent('I had a good day')).toBe(false);
      expect(isHeavyContent('Work was busy')).toBe(false);
    });

    it('should return false for moderate emotions', () => {
      expect(isHeavyContent('', 'sad')).toBe(false);
      expect(isHeavyContent('', 'anxious')).toBe(false);
    });
  });

  describe('hasEmotionalPacing', () => {
    it('should detect break tag >= 200ms at start', () => {
      expect(hasEmotionalPacing('<break time="400ms"/>Hello')).toBe(true);
      expect(hasEmotionalPacing('<break time="250ms"/>Hello')).toBe(true);
    });

    it('should return false for short breaks', () => {
      expect(hasEmotionalPacing('<break time="100ms"/>Hello')).toBe(false);
    });

    it('should return false for plain text', () => {
      expect(hasEmotionalPacing('Hello there')).toBe(false);
    });
  });
});
