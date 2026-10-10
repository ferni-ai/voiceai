import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildHeadsUpText, sendPreCallHeadsUp } from '../pre-call-heads-up.js';

const input = { contactName: 'Mindy Ford', contactPhone: '+18015550199', userName: 'Seth' };

afterEach(() => {
  delete process.env.HEADS_UP_TEXT;
});

describe('pre-call heads-up text', () => {
  it('says who is calling and why, by first name', () => {
    expect(buildHeadsUpText(input)).toBe(
      "Hi Mindy, it's Ferni, Seth's AI friend. Seth asked me to give you a call later today."
    );
  });

  it('sends nothing unless HEADS_UP_TEXT=on', async () => {
    const send = vi.fn(async () => ({ success: true }));
    expect(await sendPreCallHeadsUp(input, send)).toEqual({
      sent: false,
      reason: 'HEADS_UP_TEXT is off',
    });
    expect(send).not.toHaveBeenCalled();

    process.env.HEADS_UP_TEXT = 'on';
    expect(await sendPreCallHeadsUp(input, send)).toEqual({ sent: true });
    expect(send).toHaveBeenCalledWith('+18015550199', buildHeadsUpText(input));
  });
});
