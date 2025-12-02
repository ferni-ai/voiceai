/**
 * Event Types Tests
 * 
 * Tests for event type definitions and type guards.
 */

import { describe, it, expect } from 'vitest';
import { isHandoffMessage } from '../../../src/types/events.js';

describe('Event Types', () => {
  describe('isHandoffMessage', () => {
    it('should return true for valid handoff messages', () => {
      const validMessage = {
        type: 'handoff',
        newAgent: 'peter-lynch',
        direction: 'jack-to-peter',
        timestamp: Date.now(),
      };
      
      expect(isHandoffMessage(validMessage)).toBe(true);
    });

    it('should return false for non-handoff messages', () => {
      const statusMessage = { type: 'status', text: 'hello' };
      expect(isHandoffMessage(statusMessage)).toBe(false);

      const spotifyMessage = { type: 'spotify', action: 'play' };
      expect(isHandoffMessage(spotifyMessage)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isHandoffMessage(null)).toBe(false);
      expect(isHandoffMessage(undefined)).toBe(false);
    });

    it('should return false for non-objects', () => {
      expect(isHandoffMessage('handoff')).toBe(false);
      expect(isHandoffMessage(123)).toBe(false);
      expect(isHandoffMessage(true)).toBe(false);
    });

    it('should return false for objects without type', () => {
      const noType = { newAgent: 'peter', direction: 'jack-to-peter' };
      expect(isHandoffMessage(noType)).toBe(false);
    });

    it('should return false for objects with wrong type', () => {
      const wrongType = { type: 'not-handoff', newAgent: 'peter' };
      expect(isHandoffMessage(wrongType)).toBe(false);
    });
  });
});

