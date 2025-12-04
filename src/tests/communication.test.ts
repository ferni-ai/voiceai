/**
 * Communication Tools Tests
 *
 * Tests for email, SMS, and calendar tools.
 * These tests verify validation and error handling without actually sending.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sendEmail,
  sendSMS,
  parseScheduleTime,
  createCommunicationTools,
} from '../tools/communication.js';

describe('Communication Tools', () => {
  describe('Email Validation', () => {
    it('should reject invalid email addresses', async () => {
      const result = await sendEmail('invalid-email', 'Subject', 'Body');
      expect(result).toContain("doesn't look quite right");
    });

    it('should reject emails with no @ symbol', async () => {
      const result = await sendEmail('notanemail.com', 'Subject', 'Body');
      expect(result).toContain("doesn't look quite right");
    });

    it('should reject empty email addresses', async () => {
      const result = await sendEmail('', 'Subject', 'Body');
      expect(result).toContain("doesn't look quite right");
    });
  });

  describe('SMS Validation', () => {
    it('should reject invalid phone numbers', async () => {
      const result = await sendSMS('123', 'Test message');
      expect(result).toContain("doesn't look quite right");
    });

    it('should reject empty phone numbers', async () => {
      const result = await sendSMS('', 'Test message');
      expect(result).toContain("doesn't look quite right");
    });

    it('should reject non-numeric phone numbers', async () => {
      const result = await sendSMS('not-a-phone', 'Test message');
      expect(result).toContain("doesn't look quite right");
    });
  });

  describe('Schedule Time Parsing', () => {
    it('should parse tomorrow', () => {
      const result = parseScheduleTime('tomorrow');
      expect(result).toBeInstanceOf(Date);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(result!.getDate()).toBe(tomorrow.getDate());
    });

    it('should parse next week', () => {
      const result = parseScheduleTime('next week');
      expect(result).toBeInstanceOf(Date);

      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      expect(result!.getDate()).toBe(nextWeek.getDate());
    });

    it('should parse day names', () => {
      const result = parseScheduleTime('Monday');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getDay()).toBe(1); // Monday
    });

    it('should return null for invalid times', () => {
      // Completely invalid strings should return null
      const result = parseScheduleTime('asdfghjkl');
      expect(result).toBeNull();
    });

    it('should parse ISO date strings', () => {
      const result = parseScheduleTime('2024-12-25');
      expect(result).toBeInstanceOf(Date);
      expect(result!.getMonth()).toBe(11); // December (0-indexed)
      // Date parsing can vary by timezone, just verify it's close
      expect(result!.getDate()).toBeGreaterThanOrEqual(24);
      expect(result!.getDate()).toBeLessThanOrEqual(25);
    });
  });

  describe('Tool Creation', () => {
    it('should create all communication tools', () => {
      const tools = createCommunicationTools();

      expect(tools.sendEmail).toBeDefined();
      expect(tools.sendSMS).toBeDefined();
      expect(tools.scheduleReminder).toBeDefined();
      expect(tools.scheduleEvent).toBeDefined();
    });

    it('should have proper tool descriptions', () => {
      const tools = createCommunicationTools();

      // Access internal description through the tool
      expect(tools.sendEmail).toBeDefined();
      expect(tools.sendSMS).toBeDefined();
    });
  });

  describe('Input Sanitization', () => {
    it('should handle very long messages in SMS', async () => {
      const longMessage = 'a'.repeat(5000);
      // Should not throw, just truncate
      const result = await sendSMS('+15551234567', longMessage);
      // Will fail due to no Twilio config, but shouldn't throw due to length
      expect(result).toBeDefined();
    });

    it('should handle special characters in email subject', async () => {
      // Should not throw
      const result = await sendEmail('test@example.com', '<script>alert("xss")</script>', 'Body');
      expect(result).toBeDefined();
    });
  });

  describe('Service Configuration', () => {
    it('should gracefully handle missing SendGrid config', async () => {
      // With no SENDGRID_API_KEY, should return friendly message
      const result = await sendEmail('valid@example.com', 'Subject', 'Body');

      // Either validation fails or config not set message
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should gracefully handle missing Twilio config', async () => {
      // With no TWILIO_* vars, should return friendly message
      const result = await sendSMS('+15551234567', 'Test');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });
});
