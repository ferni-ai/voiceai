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
import {
  clearAfterCallTasks,
  pendingAfterCallTasks,
  registerAfterCallTask,
  runAfterCallTasks,
} from '../../../services/session/after-call-tasks.js';
import { drainBackground } from '../../gce/drain-background.js';

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

    const endSession = vi.fn().mockResolvedValue(undefined);
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

    // Shortly after start, session should be marked closing
    await new Promise<void>((r) => {
      setTimeout(r, 50);
    });
    expect(isSessionClosing(sessionId)).toBe(true);

    await p;

    // After cleanup completes, session should be cleared
    expect(isSessionClosing(sessionId)).toBe(false);
    expect(endSession).toHaveBeenCalled();
  });
  it('a summary still running when cleanup times out is counted until its after-call work is done', async () => {
    clearAfterCallTasks();
    let taskDone = false;
    registerAfterCallTask('slow-extract', async () => {
      await new Promise<void>((r) => {
        setTimeout(r, 300);
      });
      taskDone = true;
    });
    let endSessionDone = false;
    // A summary that outlasts the cleanup timeout, then starts the after-call tasks
    const endSession = vi.fn(async () => {
      await new Promise<void>((r) => {
        setTimeout(r, 400);
      });
      runAfterCallTasks({ userId: 'u', sessionId, turns: [], startedAt: new Date() });
      endSessionDone = true;
    });
    const ctx: CleanupContext = {
      sessionId,
      services: { endSession, sessionStartTime: Date.now() - 60_000 } as unknown as SessionServices,
      sessionPersona: { id: 'ferni', name: 'Ferni' } as PersonaConfig,
      voiceHumanization: null,
      autoOptimizer: { endSession: vi.fn() },
    };

    // The timeout wins: handleSessionCleanup returns while the cleanup runs on
    await handleSessionCleanup(ctx, 50);
    expect(endSessionDone).toBe(false);
    expect(pendingAfterCallTasks()).toBeGreaterThan(0);

    // What job-child does before the process exits
    const left = await drainBackground(pendingAfterCallTasks, CLEANUP_BUDGET_MS, 20);
    expect(left).toBe(0);
    expect(endSession).toHaveBeenCalled();
    expect(taskDone).toBe(true);
    clearAfterCallTasks();
  });
});
