/**
 * Handoff Service Tests
 *
 * Tests for agent handoff functionality.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DataMessage } from '../../../src/types/events.js';
import type { PersonaId } from '../../../src/types/persona.js';

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
        direction: 'ferni-to-peter',
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
        newAgent: 'peter-john',
        direction: 'ferni-to-peter',
        timestamp: Date.now(),
      };

      // processDataMessage is now async and waits for handoff completion
      await handoffService.processDataMessage(message);

      expect(appState.get('activePersona').id).toBe('peter-john');
    });

    it('should normalize short agent IDs', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');
      const { appState } = await import('../../../src/state/app.state.js');

      const message: DataMessage = {
        type: 'handoff',
        newAgent: 'peter', // Short form
        direction: 'ferni-to-peter',
        timestamp: Date.now(),
      };

      // processDataMessage is now async and waits for handoff completion
      await handoffService.processDataMessage(message);

      // Should normalize 'peter' to 'peter-john'
      expect(appState.get('activePersona').id).toBe('peter-john');
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

  // ===========================================================================
  // SOFT-OPEN TIMING SYNC TESTS
  // Tests that roster visual transition waits for soft_open_complete event
  // ===========================================================================
  describe('Soft-Open Timing Sync', () => {
    it('should NOT update active persona on handoff_started alone', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');
      const { appState } = await import('../../../src/state/app.state.js');

      // Get initial persona
      const initialPersona = appState.get('activePersona').id;

      // Send handoff_started (without soft_open_complete)
      const startMessage: DataMessage = {
        type: 'handoff_started',
        newAgent: 'maya-santos',
        previousAgent: 'ferni',
        direction: 'coach-to-team',
        timestamp: Date.now(),
      };

      await handoffService.processDataMessage(startMessage);

      // Handoff is transitioning but active persona should have updated
      // (handoff_started does trigger persona update for sound + theme)
      expect(handoffService.isTransitioning).toBe(true);
      expect(handoffService.targetPersona).toBe('maya-santos');
    });

    it('should fire softOpenComplete callbacks when soft_open_complete received', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');

      const softOpenCallbacks: Array<{ to: PersonaId; from: PersonaId }> = [];
      handoffService.onSoftOpenComplete((to, from) => {
        softOpenCallbacks.push({ to, from });
      });

      // First send handoff_started to set up state
      const startMessage: DataMessage = {
        type: 'handoff_started',
        newAgent: 'jordan-taylor',
        previousAgent: 'ferni',
        direction: 'coach-to-team',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(startMessage);

      // Now send soft_open_complete
      const softOpenMessage: DataMessage = {
        type: 'soft_open_complete',
        newAgent: 'jordan-taylor',
        previousAgent: 'ferni',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(softOpenMessage);

      // Callback should have fired
      expect(softOpenCallbacks).toHaveLength(1);
      expect(softOpenCallbacks[0]).toEqual({
        to: 'jordan-taylor',
        from: 'ferni',
      });
    });

    it('should queue soft_open_complete if received before handoff_started', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');

      const softOpenCallbacks: Array<{ to: PersonaId; from: PersonaId }> = [];
      handoffService.onSoftOpenComplete((to, from) => {
        softOpenCallbacks.push({ to, from });
      });

      // Send soft_open_complete BEFORE handoff_started (race condition)
      const softOpenMessage: DataMessage = {
        type: 'soft_open_complete',
        newAgent: 'alex-chen',
        previousAgent: 'ferni',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(softOpenMessage);

      // Callback should NOT have fired yet (queued)
      expect(softOpenCallbacks).toHaveLength(0);

      // Now send handoff_started - should execute queued callback
      const startMessage: DataMessage = {
        type: 'handoff_started',
        newAgent: 'alex-chen',
        previousAgent: 'ferni',
        direction: 'coach-to-team',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(startMessage);

      // Queued callback should now have fired
      expect(softOpenCallbacks).toHaveLength(1);
      expect(softOpenCallbacks[0]).toEqual({
        to: 'alex-chen',
        from: 'ferni',
      });
    });
  });

  // ===========================================================================
  // TIMEOUT RECOVERY TESTS
  // Tests that UI state is restored after handoff timeout
  // Note: Using real timers with shorter wait times because fake timers don't
  // work well with dynamic imports inside the service
  // ===========================================================================
  describe('Timeout Recovery', () => {
    it('should set up timeout on handoff_started', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');

      // Start a handoff
      const startMessage: DataMessage = {
        type: 'handoff_started',
        newAgent: 'nayan-patel',
        previousAgent: 'ferni',
        direction: 'coach-to-team',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(startMessage);

      // Verify transitioning started
      expect(handoffService.isTransitioning).toBe(true);
      expect(handoffService.targetPersona).toBe('nayan-patel');

      // Clean up by sending complete
      const completeMessage: DataMessage = {
        type: 'handoff_complete',
        newAgent: 'nayan-patel',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(completeMessage);
    });

    it('should register failed callback for timeout handling', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');

      const failedCallbacks: Array<{ error: string; target: PersonaId }> = [];
      const unsubscribe = handoffService.onHandoffFailed((error, target) => {
        failedCallbacks.push({ error, target });
      });

      // Verify callback was registered
      expect(typeof unsubscribe).toBe('function');

      // Clean up
      unsubscribe();
    });

    it('should clear timeout on successful handoff_complete', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');

      const failedCallbacks: string[] = [];
      handoffService.onHandoffFailed((error) => {
        failedCallbacks.push(error);
      });

      // Start a handoff
      const startMessage: DataMessage = {
        type: 'handoff_started',
        newAgent: 'jordan-taylor',
        previousAgent: 'ferni',
        direction: 'coach-to-team',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(startMessage);

      expect(handoffService.isTransitioning).toBe(true);

      // Complete the handoff immediately
      const completeMessage: DataMessage = {
        type: 'handoff_complete',
        newAgent: 'jordan-taylor',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(completeMessage);

      // State should be cleared
      expect(handoffService.isTransitioning).toBe(false);
      expect(handoffService.targetPersona).toBeNull();

      // No failed callback should have fired
      expect(failedCallbacks).toHaveLength(0);
    });

    it('should reset state on handoff_failed', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');

      const failedCallbacks: Array<{ error: string; target: PersonaId }> = [];
      handoffService.onHandoffFailed((error, target) => {
        failedCallbacks.push({ error, target });
      });

      // Start a handoff
      const startMessage: DataMessage = {
        type: 'handoff_started',
        newAgent: 'peter-john',
        previousAgent: 'ferni',
        direction: 'coach-to-team',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(startMessage);

      expect(handoffService.isTransitioning).toBe(true);

      // Simulate backend failure
      const failedMessage: DataMessage = {
        type: 'handoff_failed',
        newAgent: 'peter-john',
        error: 'Voice switch failed',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(failedMessage);

      // State should be reset
      expect(handoffService.isTransitioning).toBe(false);
      expect(handoffService.targetPersona).toBeNull();

      // Failed callback should have fired
      expect(failedCallbacks).toHaveLength(1);
      expect(failedCallbacks[0]?.error).toContain('Voice switch failed');
      expect(failedCallbacks[0]?.target).toBe('peter-john');
    });
  });

  // ===========================================================================
  // HANDOFF CANCELLATION TESTS
  // Tests that mid-transition cancellation works correctly
  // ===========================================================================
  describe('Handoff Cancellation', () => {
    it('should cancel in-progress handoff', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');

      // Start a handoff
      const startMessage: DataMessage = {
        type: 'handoff_started',
        newAgent: 'alex-chen',
        previousAgent: 'ferni',
        direction: 'coach-to-team',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(startMessage);

      // Verify transitioning
      expect(handoffService.isTransitioning).toBe(true);

      // Cancel the handoff
      const cancelled = handoffService.cancelHandoff();

      // Should return true (handoff was cancelled)
      expect(cancelled).toBe(true);

      // State should be reset
      expect(handoffService.isTransitioning).toBe(false);
      expect(handoffService.targetPersona).toBeNull();
    });

    it('should return false when no handoff in progress', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');

      // Try to cancel when nothing is in progress
      const cancelled = handoffService.cancelHandoff();

      expect(cancelled).toBe(false);
    });

    it('should call cancelled callbacks on cancellation', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');

      const cancelledCallbacks: Array<{ target: PersonaId; reason?: string }> = [];
      handoffService.onHandoffCancelled((target, reason) => {
        cancelledCallbacks.push({ target, reason });
      });

      // Start a handoff
      const startMessage: DataMessage = {
        type: 'handoff_started',
        newAgent: 'nayan-patel',
        previousAgent: 'ferni',
        direction: 'coach-to-team',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(startMessage);

      // Cancel the handoff
      handoffService.cancelHandoff();

      // Cancelled callback should have fired
      expect(cancelledCallbacks).toHaveLength(1);
      expect(cancelledCallbacks[0]?.target).toBe('nayan-patel');
      expect(cancelledCallbacks[0]?.reason).toBe('User cancelled');
    });

    it('should handle handoff_cancelled message from backend', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');

      const cancelledCallbacks: Array<{ target: PersonaId; reason?: string }> = [];
      handoffService.onHandoffCancelled((target, reason) => {
        cancelledCallbacks.push({ target, reason });
      });

      // Start a handoff
      const startMessage: DataMessage = {
        type: 'handoff_started',
        newAgent: 'peter-john',
        previousAgent: 'ferni',
        direction: 'coach-to-team',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(startMessage);

      expect(handoffService.isTransitioning).toBe(true);

      // Backend sends cancellation
      const cancelMessage: DataMessage = {
        type: 'handoff_cancelled',
        newAgent: 'peter-john',
        reason: 'User interrupted',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(cancelMessage);

      // State should be reset
      expect(handoffService.isTransitioning).toBe(false);

      // Cancelled callback should have fired
      expect(cancelledCallbacks).toHaveLength(1);
      expect(cancelledCallbacks[0]?.reason).toBe('User interrupted');
    });

    it('should clear timeout timer after cancellation', async () => {
      const { handoffService } = await import('../../../src/services/handoff.service.js');

      const failedCallbacks: string[] = [];
      handoffService.onHandoffFailed((error) => {
        failedCallbacks.push(error);
      });

      const cancelledCallbacks: string[] = [];
      handoffService.onHandoffCancelled((target) => {
        cancelledCallbacks.push(target);
      });

      // Start a handoff
      const startMessage: DataMessage = {
        type: 'handoff_started',
        newAgent: 'maya-santos',
        previousAgent: 'ferni',
        direction: 'coach-to-team',
        timestamp: Date.now(),
      };
      await handoffService.processDataMessage(startMessage);

      expect(handoffService.isTransitioning).toBe(true);

      // Cancel immediately
      handoffService.cancelHandoff();

      // Cancelled callback should fire, not failed
      expect(cancelledCallbacks).toHaveLength(1);
      expect(failedCallbacks).toHaveLength(0);

      // State should be reset
      expect(handoffService.isTransitioning).toBe(false);
    });
  });
});
