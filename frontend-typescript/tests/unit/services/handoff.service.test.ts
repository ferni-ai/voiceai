/**
 * Handoff Service Tests
 * 
 * Tests for agent handoff functionality.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { DataMessage } from '../../../src/types/events.js';

// We need to reset modules between tests to avoid singleton state issues
describe('HandoffService', () => {
  // Reset modules before each test to get fresh singleton instances
  beforeEach(async () => {
    vi.resetModules();
    // Clear localStorage
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('processDataMessage', () => {
    it('should return false for non-handoff messages', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');
      
      const message: DataMessage = { type: 'status', text: 'hello' };
      const result = await handoffService.processDataMessage(message);
      expect(result).toBe(false);
    });

    it('should return true for handoff messages', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');
      
      const message: DataMessage = {
        type: 'handoff',
        newAgent: 'peter',
        direction: 'jack-to-peter',
        timestamp: Date.now(),
      };
      const result = await handoffService.processDataMessage(message);
      expect(result).toBe(true);
    });

    it('should update active persona on handoff', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');
      const { appState } = await import('../../../src/state/app.state.js');
      
      const message: DataMessage = {
        type: 'handoff',
        newAgent: 'peter-lynch',
        direction: 'jack-to-peter',
        timestamp: Date.now(),
      };
      
      // processDataMessage is now async and waits for handoff completion
      await handoffService.processDataMessage(message);
      
      expect(appState.get('activePersona').id).toBe('peter-lynch');
    });

    it('should normalize short agent IDs', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');
      const { appState } = await import('../../../src/state/app.state.js');
      
      const message: DataMessage = {
        type: 'handoff',
        newAgent: 'peter', // Short form
        direction: 'jack-to-peter',
        timestamp: Date.now(),
      };
      
      // processDataMessage is now async and waits for handoff completion
      await handoffService.processDataMessage(message);
      
      // Should normalize 'peter' to 'peter-lynch'
      expect(appState.get('activePersona').id).toBe('peter-lynch');
    });
  });

  describe('onHandoff', () => {
    it('should return unsubscribe function', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');
      
      const callback = vi.fn();
      const unsubscribe = handoffService.onHandoff(callback);
      
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  describe('getCurrentAgent', () => {
    it('should return current active persona ID', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');
      
      const currentAgent = handoffService.getCurrentAgent();
      expect(typeof currentAgent).toBe('string');
    });
  });
});
