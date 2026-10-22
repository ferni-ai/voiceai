/**
 * Asked for an opinion on their own topic is not asked about him.
 *
 * Dev capability sweep 2026-10-21 (B3): "So, what do you think?" and "What
 * do you think her next move is?" matched ABOUT_FERNI's "do you think", so
 * the turn was about_ferni and FERNI_STATE + SELF_SHARE_WHEN_ASKED told him
 * to "answer from your day". Alex: "Oh, I'm just sitting here with a cold cup
 * of tea, honestly." Nayan: "I spend my mornings walking down by the
 * river..." Ferni: "My wife swears the new coffee grinder changed nothing...".
 */
import { describe, expect, it } from 'vitest';

import { DAY_DETAILS } from '../ferni-self-share.js';
import { selfShareFor } from '../ferni-state.js';
import { targetFor } from '../turn-attunement.js';
import { ABOUT_YOU, callerMove, opinionAsk, turnShapeFor, type CallerMove } from '../turn-shape.js';

const SWEEP = {
  alexNayan: 'So, what do you think?',
  ferni: 'What do you think her next move is?',
};

const TABLE: Array<[string, CallerMove]> = [
  // Their topic, his take: an answer, not his day.
  [SWEEP.alexNayan, 'request'],
  [SWEEP.ferni, 'request'],
  ['What do you think?', 'request'],
  ['do you think I should quit?', 'request'],
  ['what do you think about my plan?', 'request'],
  ['What would you do?', 'request'],
  ['What would you do if you were me?', 'request'],
  ["Do you think she'll say yes?", 'request'],
  ["Honestly I'm torn. What do you think I should do?", 'request'],
  ["Do you think it's too late to switch careers?", 'request'],
  ['what do you think of the name Biscuit?', 'request'],
  ['Do you think so?', 'request'],
  ['Walk me through it, what do you think?', 'request'],
  // About him: his tastes, his memory, his day.
  ['How are you?', 'about_ferni'],
  ['How was your day?', 'about_ferni'],
  ['What about you?', 'about_ferni'],
  ['Do you like hiking?', 'about_ferni'],
  ['Do you ever get lonely?', 'about_ferni'],
  ['Do you remember when we talked about Lisbon?', 'about_ferni'],
  ['What have you been up to?', 'about_ferni'],
  ["do you think you'd like hiking?", 'about_ferni'],
  ['Do you think you will ever retire?', 'about_ferni'],
  ['What do you think of yourself?', 'about_ferni'],
  ['What do you think about your new coffee grinder?', 'about_ferni'],
  // Neither: the other moves keep their own reads.
  ["Do you think it'll rain tomorrow?", 'lookup'],
  ["I think you'd love Lisbon.", 'share'],
  ["I don't know what to think about it.", 'share'],
  ['Do you have my number?', 'request'],
  ['Yeah.', 'ack'],
];

describe('an opinion ask on their topic is not a question about him', () => {
  it.each(TABLE)('"%s" -> %s', (said, move) => {
    expect(callerMove(said)).toBe(move);
  });

  it('opinionAsk is only the opinion branch, never his own tastes or a look-up', () => {
    expect(opinionAsk(SWEEP.alexNayan)).toBe(true);
    expect(opinionAsk('do you think I should quit?')).toBe(true);
    expect(opinionAsk("do you think you'd like hiking?")).toBe(false);
    expect(opinionAsk("Do you think it'll rain tomorrow?")).toBe(false);
    expect(opinionAsk('How was your day?')).toBe(false);
  });
});

describe('his day is not injected for an opinion ask (FERNI_STATE + SELF_SHARE_WHEN_ASKED)', () => {
  const detail = DAY_DETAILS[0];
  const askedOnly = { firstReply: false, nextDetail: () => detail };
  const turn = (said: string) => selfShareFor({ replies: ['Ha.', 'Mm.'], said, detail, askedOnly });

  it.each([SWEEP.alexNayan, SWEEP.ferni, 'do you think I should quit?', 'What would you do?'])(
    '"%s": no "answer from your day", no story of his own',
    (said) => {
      const t = turn(said);
      expect(t.line).not.toContain('answer from your day');
      expect(t.line).not.toContain(detail);
      expect(t.ownStory).toBe(false);
    }
  );

  it('a real ask about him still gets his day', () => {
    for (const said of ["do you think you'd like hiking?", 'How was your day?']) {
      const t = turn(said);
      expect(t.line).toContain(`answer from your day (${detail})`);
      expect(t.ownStory).toBe(true);
    }
  });

  it('the turn shape does not tell him to talk about himself', () => {
    for (const mode of ['model', 'dice'] as const) {
      expect(turnShapeFor(SWEEP.ferni, () => 0.1, mode).reminder).not.toContain(ABOUT_YOU);
      expect(turnShapeFor('How was your day?', () => 0.1, mode).reminder).toContain(ABOUT_YOU);
    }
  });

  it('a tired caller asking his take gets no stories of his own (ATTUNE)', () => {
    expect(targetFor('low', ['Hey.', 'Tired.', SWEEP.alexNayan], false).ownStories).toBe(false);
    expect(targetFor('low', ['Hey.', 'Tired.', 'Do you like hiking?'], false).ownStories).toBe(
      true
    );
  });
});
