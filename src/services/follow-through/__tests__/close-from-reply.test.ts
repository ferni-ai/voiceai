import { describe, expect, it } from 'vitest';
import { closeFromReply } from '../close-from-reply.js';

describe('closeFromReply', () => {
  it.each([
    ['yeah I did, she was thrilled', 'done'],
    ['done!', 'done'],
    ['I already did it this morning', 'done'],
    ['yep, called her at lunch', 'done'],
    ['Yep, did it, no problem', 'done'],
  ])('reads "%s" as done', (reply, verdict) => {
    expect(closeFromReply(reply)).toBe(verdict);
  });

  it.each([
    ['not yet, maybe tomorrow', 'replan'],
    ["I haven't done it yet", 'replan'],
    ['later tonight', 'replan'],
    ['remind me on friday', 'replan'],
  ])('reads "%s" as not yet', (reply, verdict) => {
    expect(closeFromReply(reply)).toBe(verdict);
  });

  it.each([
    ['forget it, it does not matter anymore', 'release'],
    ['never mind that one', 'release'],
    ["nah, I'm not doing that", 'release'],
  ])('reads "%s" as let it go', (reply, verdict) => {
    expect(closeFromReply(reply)).toBe(verdict);
  });

  it.each([["I haven't done it"], ["didn't get to it"], ['hmm, what was that about?'], ['']])(
    'leaves "%s" unclear rather than guess',
    (reply) => {
      expect(closeFromReply(reply)).toBeNull();
    }
  );

  it('does not read a done word inside another word', () => {
    expect(closeFromReply('the abandoned house down the street')).toBeNull();
  });
});
