/**
 * A tap on a locked teammate is refused with a warm decline; the caller has to hear it
 * and see it. Dev 2026-10-11: taps on Nayan and Jordan were refused and the decline went
 * only into handoff_failed.error, read out to screen readers; nothing was said or shown.
 */
import { describe, expect, it } from 'vitest';

import { handoffFailedMessage } from '../handoff-messages.js';

const DECLINE = 'I know someone who can help you plan your whole life... but we need to build more trust first.';

describe('handoffFailedMessage', () => {
  it('a declined tap carries the decline as userMessage and as the line to say', () => {
    const out = handoffFailedMessage(
      'jordan-taylor',
      { error: DECLINE, declined: true },
      'ferni'
    );
    expect(out.say).toBe(DECLINE);
    expect(out.message).toMatchObject({
      type: 'handoff_failed',
      target: 'jordan-taylor',
      error: DECLINE,
      userMessage: DECLINE,
      rollbackTo: 'ferni',
    });
  });

  it('a technical failure is neither shown nor said', () => {
    const out = handoffFailedMessage('ferni', { error: 'Already with ferni' }, 'ferni');
    expect(out.say).toBeUndefined();
    expect(out.message).not.toHaveProperty('userMessage');
    expect(out.message).toMatchObject({ type: 'handoff_failed', error: 'Already with ferni' });
  });
});
