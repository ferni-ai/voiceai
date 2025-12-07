/**
 * API Error Messages Tests
 *
 * Tests for human-friendly error message constants:
 * - API_ERRORS: User-facing error messages
 * - DEV_ERRORS: Developer-facing error messages
 */

import { describe, it, expect } from 'vitest';
import { API_ERRORS, DEV_ERRORS } from '../api/error-messages.js';

describe('API Error Messages', () => {
  describe('API_ERRORS (User-Facing)', () => {
    describe('Authentication Errors', () => {
      it('should have user-friendly auth errors', () => {
        expect(API_ERRORS.USER_ID_REQUIRED).toBeDefined();
        expect(API_ERRORS.AUTH_REQUIRED).toBeDefined();
      });

      it('should have warm, helpful authentication messages', () => {
        expect(API_ERRORS.USER_ID_REQUIRED).toContain('sign in');
        expect(API_ERRORS.AUTH_REQUIRED).toContain('sign in');
      });
    });

    describe('Conversation Errors', () => {
      it('should have conversation fetch error', () => {
        expect(API_ERRORS.CONVERSATIONS_FETCH_FAILED).toBeDefined();
        expect(API_ERRORS.CONVERSATIONS_FETCH_FAILED).toContain('conversations');
      });
    });

    describe('Data Management Errors', () => {
      it('should have data export/delete errors', () => {
        expect(API_ERRORS.DATA_EXPORT_FAILED).toBeDefined();
        expect(API_ERRORS.DATA_DELETE_FAILED).toBeDefined();
        expect(API_ERRORS.DATA_DELETE_CONFIRMATION).toBeDefined();
      });

      it('should have encouraging retry messages', () => {
        expect(API_ERRORS.DATA_EXPORT_FAILED).toContain('try');
        expect(API_ERRORS.DATA_DELETE_FAILED).toContain('Try');
      });

      it('should have validation error', () => {
        expect(API_ERRORS.INVALID_REQUEST).toBeDefined();
      });
    });

    describe('Ritual Errors', () => {
      it('should have all ritual-related errors', () => {
        expect(API_ERRORS.RITUALS_FETCH_FAILED).toBeDefined();
        expect(API_ERRORS.RITUAL_CREATE_FAILED).toBeDefined();
        expect(API_ERRORS.RITUAL_DELETE_FAILED).toBeDefined();
        expect(API_ERRORS.RITUAL_COMPLETE_FAILED).toBeDefined();
        expect(API_ERRORS.RITUAL_NOT_FOUND).toBeDefined();
      });

      it('should have helpful ritual messages', () => {
        expect(API_ERRORS.RITUAL_NOT_FOUND).toContain('may have been removed');
      });
    });

    describe('Prediction Errors', () => {
      it('should have all prediction-related errors', () => {
        expect(API_ERRORS.PREDICTIONS_FETCH_FAILED).toBeDefined();
        expect(API_ERRORS.PREDICTION_NOT_FOUND).toBeDefined();
        expect(API_ERRORS.PREDICTION_ALREADY_COMPLETED).toBeDefined();
        expect(API_ERRORS.PREDICTION_UPDATE_FAILED).toBeDefined();
      });

      it('should explain prediction not found', () => {
        expect(API_ERRORS.PREDICTION_NOT_FOUND).toContain('expired');
      });
    });

    describe('Memory Errors', () => {
      it('should have memory not found error', () => {
        expect(API_ERRORS.MEMORY_NOT_FOUND).toBeDefined();
        expect(API_ERRORS.MEMORY_NOT_FOUND).toContain('removed');
      });
    });

    describe('Profile/Settings Errors', () => {
      it('should have profile and settings errors', () => {
        expect(API_ERRORS.PROFILE_UPDATE_FAILED).toBeDefined();
        expect(API_ERRORS.SETTINGS_SAVE_FAILED).toBeDefined();
        expect(API_ERRORS.RELATIONSHIP_SYNC_FAILED).toBeDefined();
      });
    });

    describe('Generic Errors', () => {
      it('should have generic fallback errors', () => {
        expect(API_ERRORS.INTERNAL_ERROR).toBeDefined();
        expect(API_ERRORS.NOT_FOUND).toBeDefined();
        expect(API_ERRORS.OPERATION_FAILED).toBeDefined();
      });

      it('should have warm internal error message', () => {
        expect(API_ERRORS.INTERNAL_ERROR).toContain('looking into it');
      });
    });

    describe('Message Quality', () => {
      it('should NOT contain technical jargon', () => {
        Object.values(API_ERRORS).forEach((message) => {
          if (typeof message === 'string') {
            expect(message.toLowerCase()).not.toContain('error code');
            expect(message.toLowerCase()).not.toContain('exception');
            expect(message.toLowerCase()).not.toContain('stack trace');
            expect(message.toLowerCase()).not.toContain('500');
            expect(message.toLowerCase()).not.toContain('404');
          }
        });
      });

      it('should use friendly language', () => {
        Object.values(API_ERRORS).forEach((message) => {
          if (typeof message === 'string') {
            // Should have question marks, encouraging language, or explanations
            const lowerMessage = message.toLowerCase();
            const isFriendly =
              message.includes('?') ||
              lowerMessage.includes('try') ||
              lowerMessage.includes('please') ||
              lowerMessage.includes('may') ||
              lowerMessage.includes("we're") ||
              lowerMessage.includes('looks like') ||
              lowerMessage.includes('step') ||
              lowerMessage.includes('confirm') ||
              lowerMessage.includes("couldn't");
            expect(isFriendly).toBe(true);
          }
        });
      });

      it('should be sentence case or start with capital', () => {
        Object.values(API_ERRORS).forEach((message) => {
          if (typeof message === 'string') {
            expect(message[0]).toBe(message[0].toUpperCase());
          }
        });
      });
    });
  });

  describe('DEV_ERRORS (Developer-Facing)', () => {
    describe('Static Messages', () => {
      it('should have deployment errors', () => {
        expect(DEV_ERRORS.MISSING_DEPLOYMENT_ID).toBeDefined();
        expect(DEV_ERRORS.DEPLOYMENT_NOT_FOUND).toBeDefined();
      });

      it('should have incident error', () => {
        expect(DEV_ERRORS.INCIDENT_NOT_FOUND).toBeDefined();
      });

      it('should have production restriction error', () => {
        expect(DEV_ERRORS.NOT_AVAILABLE_IN_PROD).toBeDefined();
      });

      it('should have generic server error', () => {
        expect(DEV_ERRORS.INTERNAL_SERVER_ERROR).toBeDefined();
        expect(DEV_ERRORS.UNKNOWN_ENDPOINT).toBeDefined();
      });
    });

    describe('Dynamic Messages (Functions)', () => {
      it('should have FLAG_NOT_FOUND function', () => {
        expect(typeof DEV_ERRORS.FLAG_NOT_FOUND).toBe('function');
        expect(DEV_ERRORS.FLAG_NOT_FOUND('test-flag')).toBe('Flag "test-flag" not found');
      });

      it('should have ROLLOUT_NOT_FOUND function', () => {
        expect(typeof DEV_ERRORS.ROLLOUT_NOT_FOUND).toBe('function');
        expect(DEV_ERRORS.ROLLOUT_NOT_FOUND('feature-x')).toBe('Rollout "feature-x" not found');
      });

      it('should have TRACE_NOT_FOUND function', () => {
        expect(typeof DEV_ERRORS.TRACE_NOT_FOUND).toBe('function');
        expect(DEV_ERRORS.TRACE_NOT_FOUND('abc123')).toBe('Trace abc123 not found');
      });
    });

    describe('Message Style', () => {
      it('should be concise and technical', () => {
        // Dev errors should be short and to the point
        expect(DEV_ERRORS.MISSING_DEPLOYMENT_ID).toBe('Missing deployment ID');
        expect(DEV_ERRORS.DEPLOYMENT_NOT_FOUND).toBe('Deployment not found');
        expect(DEV_ERRORS.INCIDENT_NOT_FOUND).toBe('Incident not found');
      });

      it('should NOT have user-friendly language', () => {
        // Dev errors should be direct, not friendly
        Object.entries(DEV_ERRORS).forEach(([, value]) => {
          if (typeof value === 'string') {
            expect(value).not.toContain('please');
            expect(value).not.toContain("We're");
            expect(value).not.toContain('Mind');
          }
        });
      });
    });
  });

  describe('Type Safety', () => {
    it('API_ERRORS should be readonly', () => {
      // TypeScript const assertion makes it readonly
      // We verify the object has the expected shape
      expect(typeof API_ERRORS).toBe('object');
      expect(Object.keys(API_ERRORS).length).toBeGreaterThan(0);
    });

    it('DEV_ERRORS should be readonly', () => {
      expect(typeof DEV_ERRORS).toBe('object');
      expect(Object.keys(DEV_ERRORS).length).toBeGreaterThan(0);
    });

    it('should have consistent key naming (SCREAMING_SNAKE_CASE)', () => {
      const apiKeys = Object.keys(API_ERRORS);
      const devKeys = Object.keys(DEV_ERRORS);

      [...apiKeys, ...devKeys].forEach((key) => {
        expect(key).toMatch(/^[A-Z][A-Z0-9_]*$/);
      });
    });
  });
});
