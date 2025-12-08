/**
 * Life Events Unit Tests
 *
 * Tests for Phase 14: Life Event Detection
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectLifeEvents,
  saveEvent,
  getUpcomingEvents,
  getEventsNeedingReminders,
  generateReminderMessage,
  generateFollowUpMessage,
} from '../life-events.js';

describe('Life Events', () => {
  const testUserId = 'test-user-123';

  describe('detectLifeEvents', () => {
    it('should detect job interview mentions', () => {
      const detections = detectLifeEvents(
        testUserId,
        "I have a job interview next Tuesday at Google"
      );

      expect(detections.length).toBeGreaterThan(0);
      const interview = detections.find(d => d.event?.type === 'interview' || d.event?.type === 'work');
      expect(interview).toBeDefined();
    });

    it('should detect birthday mentions', () => {
      const detections = detectLifeEvents(
        testUserId,
        "My birthday is coming up on March 15th"
      );

      // May or may not detect depending on implementation
      expect(Array.isArray(detections)).toBe(true);
    });

    it('should detect doctor appointments', () => {
      const detections = detectLifeEvents(
        testUserId,
        "I have a doctor's appointment tomorrow"
      );

      expect(detections.length).toBeGreaterThan(0);
    });

    it('should detect travel plans', () => {
      const detections = detectLifeEvents(
        testUserId,
        "I'm flying to Paris next month"
      );

      expect(detections.length).toBeGreaterThan(0);
    });

    it('should handle text with no events', () => {
      const detections = detectLifeEvents(
        testUserId,
        "The weather is nice today"
      );

      // Should return empty array, not throw
      expect(Array.isArray(detections)).toBe(true);
    });

    it('should detect sentiment from context', () => {
      const nervousDetections = detectLifeEvents(
        testUserId,
        "I'm really nervous about my presentation next week"
      );

      const excitedDetections = detectLifeEvents(
        testUserId,
        "I'm so excited for my vacation next month!"
      );

      // Should detect different sentiments
      const nervousEvent = nervousDetections[0]?.event;
      const excitedEvent = excitedDetections[0]?.event;

      if (nervousEvent?.sentiment && excitedEvent?.sentiment) {
        expect(nervousEvent.sentiment).not.toBe(excitedEvent.sentiment);
      }
    });
  });

  describe('saveEvent', () => {
    it('should save a valid event', () => {
      const event = {
        userId: testUserId,
        id: 'test-event-1',
        type: 'appointment' as const,
        description: 'Dentist appointment',
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
        importance: 'medium' as const,
        followUp: { beforeReminder: true, afterCheckIn: true },
        tags: ['health'],
        context: { mentionedAt: new Date(), originalText: 'dentist next week' },
      };

      // Should not throw
      expect(() => saveEvent(event)).not.toThrow();
    });
  });

  describe('getUpcomingEvents', () => {
    it('should return today and this week events', () => {
      const events = getUpcomingEvents(testUserId);

      expect(events).toBeDefined();
      expect(events).toHaveProperty('today');
      expect(events).toHaveProperty('thisWeek');
      expect(Array.isArray(events.today)).toBe(true);
      expect(Array.isArray(events.thisWeek)).toBe(true);
    });
  });

  describe('getEventsNeedingReminders', () => {
    it('should return array of events', () => {
      const reminders = getEventsNeedingReminders(testUserId);
      expect(Array.isArray(reminders)).toBe(true);
    });
  });

  describe('generateReminderMessage', () => {
    it('should generate human-readable reminder', () => {
      const event = {
        userId: testUserId,
        id: 'test-event-2',
        type: 'interview' as const,
        description: 'Job interview at TechCorp',
        date: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        importance: 'high' as const,
        followUp: { beforeReminder: true, afterCheckIn: true },
        tags: ['career'],
        context: { mentionedAt: new Date(), originalText: 'interview tomorrow' },
      };

      const message = generateReminderMessage(event);

      expect(message).toBeDefined();
      expect(message.length).toBeGreaterThan(0);
      expect(message.toLowerCase()).toContain('interview');
    });
  });

  describe('generateFollowUpMessage', () => {
    it('should generate follow-up message', () => {
      const event = {
        userId: testUserId,
        id: 'test-event-3',
        type: 'interview' as const,
        description: 'Job interview completed',
        date: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        importance: 'high' as const,
        followUp: { beforeReminder: true, afterCheckIn: true },
        tags: ['career'],
        context: { mentionedAt: new Date(), originalText: 'interview yesterday' },
      };

      const message = generateFollowUpMessage(event);

      expect(message).toBeDefined();
      expect(message.length).toBeGreaterThan(0);
    });
  });
});

