/**
 * Only a tap in the app beats the tool's waiting handoff (toolHandoffSuperseded). The model's
 * own handoff to someone else, two in a row or both at once, is not the caller choosing: it
 * used to mark the waiting one "the caller chose Peter" (Opus re-check of #2937, 2026-10-29).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { takeEarlyGoodbye, toolHandoffSuperseded, withEarlyGoodbye } from '../early-goodbye.js';
import type { HandoffResult } from '../executor.js';

const sessionId = 's-tap-only';

beforeEach(() => vi.stubEnv('HANDOFF_EARLY_GOODBYE', 'on'));
afterEach(() => vi.unstubAllEnvs());

const joined: HandoffResult = {
  success: true,
  targetAgent: 'ferni',
  targetAgentName: 'Ferni',
  previousAgent: 'maya-santos',
  greeting: 'Hey!',
};

/** The tool's handoff to Ferni, waiting in its setup while `during` runs. */
async function whileFerniWaits(during: () => void): Promise<void> {
  await withEarlyGoodbye(sessionId, 'Ferni', async (onCleared) => {
    await onCleared('ferni');
    during();
    return joined;
  });
}

describe('toolHandoffSuperseded: a tap only', () => {
  it('a tap to Peter while the tool hands off to Ferni: the tap wins', async () => {
    let chosen: string | null = null;
    await whileFerniWaits(() => {
      takeEarlyGoodbye(sessionId, 'peter-john', { tap: true });
      chosen = toolHandoffSuperseded(sessionId, 'ferni');
    });
    expect(chosen).toBe('peter-john');
  });

  it("the model's own handoff to Peter is not the caller choosing", async () => {
    let chosen: string | null = 'unset';
    await whileFerniWaits(() => {
      takeEarlyGoodbye(sessionId, 'peter-john', { tap: false });
      chosen = toolHandoffSuperseded(sessionId, 'ferni');
    });
    expect(chosen).toBeNull();
  });

  it('a tap to the same teammate supersedes nothing', async () => {
    let chosen: string | null = 'unset';
    await whileFerniWaits(() => {
      takeEarlyGoodbye(sessionId, 'ferni', { tap: true });
      chosen = toolHandoffSuperseded(sessionId, 'ferni');
    });
    expect(chosen).toBeNull();
  });
});
