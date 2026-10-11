/**
 * callUser / scheduleCallback must not claim a call that isn't placed.
 *
 * They used to answer "Calling you now at +1555…! Pick up, it's important!"
 * and "I'll give you a call tomorrow" while doing nothing.
 */

import { describe, it, expect } from 'vitest';
import {
  createTelephonyTools,
  CANT_CALL_NOW,
  CANT_SCHEDULE_CALL,
} from '../tools/domains/telephony/telephony.js';

const opts = { toolCallId: 'test-call-id', ctx: {} as never };

/** Phrases that tell the user a call happened or is booked. */
const CLAIMS_A_CALL = /calling you now|pick up|i'll (give you a )?call|ring ring|phone is ringing/i;

describe('telephony tools tell the truth about calls', () => {
  it('callUser says no call is coming, and does not echo a number', async () => {
    const result = await createTelephonyTools().callUser.execute({ reason: 'check in' }, opts);
    expect(result).toBe(CANT_CALL_NOW);
    expect(result).not.toMatch(CLAIMS_A_CALL);
    expect(result).not.toMatch(/\+?\d{10,}/);
  });

  it('scheduleCallback says nothing is booked', async () => {
    const result = await createTelephonyTools().scheduleCallback.execute(
      { when: 'tomorrow at 9am', reason: 'market update' },
      opts
    );
    expect(result).toBe(CANT_SCHEDULE_CALL);
    expect(result).not.toMatch(CLAIMS_A_CALL);
  });

  it('both offer a reminder instead, so the model has a real next step', () => {
    expect(CANT_CALL_NOW).toMatch(/reminder/);
    expect(CANT_SCHEDULE_CALL).toMatch(/reminder/);
  });
});
