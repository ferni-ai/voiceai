/**
 * Session cleanup handler tests.
 *
 * Verifies that handleSessionCleanup runs and correctly marks/clears
 * the session in the session-closing-tracker (P0 session lifecycle verification).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSessionCleanup, type CleanupContext } from '../cleanup-handler.js';
import { clearSessionClosing, isSessionClosing } from '../../shared/session-closing-tracker.js';
import type { SessionServices } from '../../../services/types.js';
import type { PersonaConfig } from '../../../personas/types.js';

// The real cleanup dynamically imports dozens of modules, which vitest
// transforms on first use: ~3 s on a fast idle Mac, and past 5 s on the loaded
// self-hosted CI runner (run 37171889352: "Session cleanup timeout", elapsedMs
// 5003), where the timeout won the race and endSession was never reached.
// This test checks completion, not the timeout path, so the budget must not
// race the work.
const CLEANUP_BUDGET_MS = 60_000;

describe('cleanup-handler', { timeout: CLEANUP_BUDGET_MS + 10_000 }, () => {
  const sessionId = `test-cleanup-${Date.now()}`;

  afterEach(() => {
    clearSessionClosing(sessionId);
  });

  it('exports handleSessionCleanup and CleanupContext', () => {
    expect(typeof handleSessionCleanup).toBe('function');
    expect(handleSessionCleanup.length).toBeGreaterThanOrEqual(1);
  });

  it('marks session closing at start and clears on completion', async () => {
    expect(isSessionClosing(sessionId)).toBe(false);

    // Record the flag from inside the cleanup, while the work is running.
    let closingDuringCleanup: boolean | undefined;
    const endSession = vi.fn().mockImplementation(async () => {
      closingDuringCleanup = isSessionClosing(sessionId);
    });
    const ctx: CleanupContext = {
      sessionId,
      services: {
        endSession,
        sessionStartTime: Date.now() - 60_000,
      } as unknown as SessionServices,
      sessionPersona: { id: 'ferni', name: 'Ferni' } as PersonaConfig,
      voiceHumanization: null,
      autoOptimizer: { endSession: vi.fn() },
    };

    const p = handleSessionCleanup(ctx, CLEANUP_BUDGET_MS);

    // The session is marked before the cleanup's first await, so the flag is
    // set by the time the call returns. No sleep: a fixed 50 ms wait failed on
    // the loaded CI runner (run 39576629948) because the timer fired only
    // after the whole ~1.4 s cleanup had finished and cleared the flag.
    expect(isSessionClosing(sessionId)).toBe(true);

    await p;

    // It stayed marked while the cleanup worked...
    expect(endSession).toHaveBeenCalled();
    expect(closingDuringCleanup).toBe(true);
    // ...and was cleared once the cleanup completed.
    expect(isSessionClosing(sessionId)).toBe(false);
  });
});
