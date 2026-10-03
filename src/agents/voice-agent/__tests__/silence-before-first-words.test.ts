/**
 * One greeting per call: no remark into the silence before the caller has
 * said anything.
 *
 * Evidence: in room probe-1791046904 (2026-10-03) Ferni said "Hey, what's up?"
 * and then, with no caller speech in between, the silence handler produced
 * "Mm? I'm here." That's two greetings.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../handoff/unified-state.js', () => ({ shouldSkipGenerateReply: () => false }));
vi.mock('../../../speech/coordination/sanitizer-integration.js', () => ({
  getStateMetrics: () => ({ activeToolCount: 0 }),
}));
vi.mock('../../shared/response-orchestrator.js', () => ({ canTriggerProactive: () => true }));
vi.mock('../../../services/diagnostic-logger.js', () => ({ diag: { state: vi.fn() } }));

const { silenceResponseBlocked } = await import('../silence-response-blockers.js');

const room = { remoteParticipants: new Map<string, unknown>([['caller', {}]]) };

afterEach(() => {
  delete process.env.FERNI_SILENCE_BEFORE_FIRST_WORDS;
});

describe('silence remarks before the caller speaks', () => {
  it('are blocked until the caller has said something', () => {
    expect(silenceResponseBlocked('s', room, 17, false)).toBe(true);
  });

  it('are allowed once the caller has spoken', () => {
    expect(silenceResponseBlocked('s', room, 17, true)).toBe(false);
  });

  it('FERNI_SILENCE_BEFORE_FIRST_WORDS=on restores them', () => {
    process.env.FERNI_SILENCE_BEFORE_FIRST_WORDS = 'on';
    expect(silenceResponseBlocked('s', room, 17, false)).toBe(false);
  });
});
