/**
 * Session cleanup handler tests.
 *
 * Verifies that handleSessionCleanup runs and correctly marks/clears
 * the session in the session-closing-tracker (P0 session lifecycle verification).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSessionCleanup, type CleanupContext } from '../cleanup-handler.js';
import {
  clearSessionClosing,
  isSessionClosing,
} from '../../shared/session-closing-tracker.js';
import type { SessionServices } from '../../../services/types.js';
import type { PersonaConfig } from '../../../personas/types.js';

describe('cleanup-handler', () => {
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

    const p = handleSessionCleanup(ctx, 5000);

    // Shortly after start, session should be marked closing
    await new Promise((r) => setTimeout(r, 50));
    expect(isSessionClosing(sessionId)).toBe(true);

    await p;

    // After cleanup completes, session should be cleared
    expect(isSessionClosing(sessionId)).toBe(false);
    expect(endSession).toHaveBeenCalled();
  });
});
