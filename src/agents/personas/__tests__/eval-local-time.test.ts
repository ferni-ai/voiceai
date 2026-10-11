import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { evalLocalTime } from '../eval-local-time.js';
import { withTurnReminder } from '../turn-request.js';

const EVAL = { VOICE_EVAL_CLOCK: 'on' };
const AT_147 = { eval_local_time: '01:47' };

describe('evalLocalTime: only an eval worker and an eval caller can set his clock', () => {
  it('ignores prod-shaped metadata: a real user, or a worker without VOICE_EVAL_CLOCK=on', () => {
    // A real caller asking for 01:47, even on an eval worker.
    expect(evalLocalTime('Hk2r9xUser', AT_147, EVAL)).toBeUndefined();
    expect(evalLocalTime(null, AT_147, EVAL)).toBeUndefined();
    expect(evalLocalTime('my-voice-eval-x', AT_147, EVAL)).toBeUndefined();
    // An eval caller on a worker without the flag (dev, prod).
    expect(evalLocalTime('voice-eval-x', AT_147, {})).toBeUndefined();
    expect(evalLocalTime('voice-eval-x', AT_147, { VOICE_EVAL_CLOCK: 'true' })).toBeUndefined();
  });

  it('reads HH:MM for an eval caller on an eval worker, and nothing malformed', () => {
    expect(evalLocalTime('voice-eval-x', AT_147, EVAL)).toEqual({ hour: 1, minute: 47 });
    expect(evalLocalTime('voice-eval-x', { eval_local_time: ' 23:05 ' }, EVAL)).toEqual({
      hour: 23,
      minute: 5,
    });
    for (const bad of ['24:00', '1:7', '01:60', '0147', 'late', 147, null, undefined]) {
      expect(evalLocalTime('voice-eval-x', { eval_local_time: bad }, EVAL)).toBeUndefined();
    }
    expect(evalLocalTime('voice-eval-x', {}, EVAL)).toBeUndefined();
  });
});

describe('the eval clock on the reply path', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.FERNI_STATE;
  });

  const request = () => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: 'Still up. Just thinking about the trip next week.' });
    return ctx;
  };
  const last = (c: llm.ChatContext) =>
    (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';
  const session = (evalTime?: { hour: number; minute: number }) => ({
    userData: {
      evalLocalTime: evalTime,
      services: {
        sessionId: `eval-clock-${Math.random()}`,
        sessionStartTime: Date.now() - 8 * 60_000,
      },
    },
  });

  it('at 2:10pm real time, an eval call set to 01:47 gets the late-night state; without it, none', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T20:10:00Z')); // 14:10 in Denver
    process.env.FERNI_STATE = 'on';
    const real = last(withTurnReminder(request(), session()));
    expect(real).not.toMatch(/where you are/);
    const shifted = last(withTurnReminder(request(), session({ hour: 1, minute: 47 })));
    expect(shifted).toContain("it's nearly 2am where you are");
  });
});
