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

    // Held open so the test can look at the tracker mid-cleanup without guessing
    // how long cleanup takes (it is about 1 s on CI and 3-8 s on a loaded Mac).
    let finishEndSession!: () => void;
    const endSession = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishEndSession = resolve;
        })
    );
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

    // Marked before cleanup's first await, so nothing (a handoff, a reply) can
    // start on a call that is shutting down. A 50 ms sleep used to stand in for
    // "shortly after": on CI the event loop was busy loading modules, the timer
    // fired after cleanup had already finished, and the test failed on many PRs.
    expect(isSessionClosing(sessionId)).toBe(true);

    // Still marked while cleanup is in the middle of its work.
    await vi.waitFor(() => expect(endSession).toHaveBeenCalled(), {
      timeout: CLEANUP_BUDGET_MS,
      interval: 20,
    });
    expect(isSessionClosing(sessionId)).toBe(true);
    finishEndSession();

    await p;

    // After cleanup completes, session should be cleared
    expect(isSessionClosing(sessionId)).toBe(false);
    expect(endSession).toHaveBeenCalled();
  });
});
