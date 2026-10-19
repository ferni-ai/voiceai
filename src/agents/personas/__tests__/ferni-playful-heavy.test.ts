/**
 * FERNI_PLAYFUL (off by default) never plays near hard news: not on a heavy
 * or careful turn, not on the three turns after it, and its playful line at
 * most once in three turns of a call. Off, nothing changes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PLAYFUL_LINE } from '../ferni-playful.js';
import { CALM_TURNS, LINE_EVERY, withPlayful } from '../ferni-playful-turn.js';
import { OpenerGate } from '../opener-gate.js';
import { regexSignals, type TurnSignals } from '../turn-extras.js';
import { callerMove, rngFor, turnShapeFor } from '../turn-shape.js';

const ON = { FERNI_PLAYFUL: 'on' };
const sig = (t: string): TurnSignals => regexSignals(t, callerMove(t));
const play = (session: object, t: string, env: Record<string, string> = ON) =>
  withPlayful(session, t, sig(t), env);
const EASY = [
  'We went to the lake this weekend',
  'My cat knocked water onto my keyboard.',
  'We tried the new taco place on Fifth',
  'I finally cleaned out the garage',
  'My sister is visiting next month',
  'We watched that space movie again',
];

afterEach(() => vi.unstubAllEnvs());

describe('no play near hard news', () => {
  it('plays on an easy turn', () => {
    expect(play({}, EASY[0])?.playful).toBe(true);
  });

  it('reads grief more than 12 words from the end of the turn', () => {
    const t =
      'my grandma passed on Tuesday and then the whole family flew in and we ate way too much pie at the house';
    expect(t.split(' ').length).toBeGreaterThan(20);
    expect(play({}, t)?.playful).toBeUndefined();
  });

  it('holds off after grief: "yeah" and the next turns too, then plays again', () => {
    const s = {};
    expect(play(s, 'my dad died last week')?.playful).toBeUndefined();
    const after = ['yeah', 'it is what it is', 'anyway we went to the lake'];
    expect(after).toHaveLength(CALM_TURNS);
    for (const t of after) expect(play(s, t)?.playful, t).toBeUndefined();
    expect(play(s, 'My cat knocked water onto my keyboard.')?.playful).toBe(true);
  });

  it('a turn the signals call careful holds play off too, for the turns after it', () => {
    const s = {};
    const tender = { ...sig('we talked for hours'), careful: true };
    expect(withPlayful(s, 'we talked for hours', tender, ON)?.playful).toBeUndefined();
    expect(play(s, EASY[0])?.playful).toBeUndefined();
  });

  it('never on "she left me" or a careful turn', () => {
    expect(play({}, 'she left me')?.playful).toBeUndefined();
    expect(play({}, "I'm exhausted, it's been a long day")?.playful).toBeUndefined();
  });
});

describe('the playful line, at most once in three turns', () => {
  it('across 6 easy turns, on the 1st and 4th only, and a repeated request agrees', () => {
    const s = {};
    const lines = EASY.map((t, i) => {
      const first = play(s, t);
      const again = play(s, t); // the final request for the same words
      expect(again?.playfulLine).toBe(first?.playfulLine);
      expect(first?.playful, t).toBe(true);
      const reminder = turnShapeFor(t, rngFor(`line:${t}`), 'model', first).reminder;
      return reminder.includes(PLAYFUL_LINE) ? i + 1 : 0;
    });
    expect(LINE_EVERY).toBe(3);
    expect(lines.filter(Boolean)).toEqual([1, 4]);
  });
});

describe('every reaction word counts in the opener gate', () => {
  it('a "Man," after a kept "Dude," goes, with the flag on', () => {
    const gate = new OpenerGate(3, false, true);
    expect(gate.decide("Dude, that's wild.", false, undefined, true)).toBe("Dude, that's wild.");
    expect(gate.decide('Man, that is a lot of tacos.', false, undefined, true)).toBe(
      'That is a lot of tacos.'
    );
  });
});

describe('flag off', () => {
  it('is byte-identical: signals untouched, no line, the gate as before', () => {
    const s = {};
    for (const t of [...EASY, 'my dad died last week', 'yeah']) {
      const before = sig(t);
      expect(withPlayful(s, t, before, {})).toBe(before);
      const reminder = turnShapeFor(t, rngFor(`off:${t}`), 'model', before).reminder;
      expect(reminder).not.toContain(PLAYFUL_LINE);
    }
    const gate = new OpenerGate(3, false, false);
    expect(gate.decide("Dude, that's wild.")).toBe("Dude, that's wild.");
    expect(gate.decide('Man, that is a lot of tacos.')).toBe('Man, that is a lot of tacos.');
  });
});
