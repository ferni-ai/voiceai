import { afterEach, describe, expect, it, vi } from 'vitest';
import { getBargeInAcknowledgment } from '../speech-wrapper.js';

describe('getBargeInAcknowledgment', () => {
  afterEach(() => vi.restoreAllMocks());

  // Prod 2026-10-13: "Go ahead!Sure." / "Yeah?I'm Jordan." on most of Jordan's replies.
  it('adds no floor-yielding word before an answer unless BARGE_IN_ACK_WORDS=on', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // would always pick an ack
    expect(getBargeInAcknowledgment('jordan-taylor', 'soft', {})).toBe('');
    expect(getBargeInAcknowledgment('jordan-taylor', 'hard', { BARGE_IN_ACK_WORDS: 'off' })).toBe(
      ''
    );
  });

  it('when turned on, ends the ack with a space so it never runs into the reply', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const ack = getBargeInAcknowledgment('jordan-taylor', 'soft', { BARGE_IN_ACK_WORDS: 'on' });
    expect(ack).toContain('Oh');
    expect(ack.endsWith(' ')).toBe(true);
    expect(`${ack}Sure.`.replace(/<[^>]+>/g, '')).not.toMatch(/[?!.]\S/);
  });
});
