/**
 * HEAVY_MOMENT_WIDER (#3845): the heavy-moment check also reads a loss said
 * without a death word ("Buried my uncle last Friday."), word for word, never
 * on a substring. Wider heavy only ever holds laughs and play back: the rows
 * at the bottom drive the laughter lever and Ferni's playful turn. Off: as main.
 * All lines are invented.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withPlayful } from '../../../agents/personas/ferni-playful-turn.js';
import { regexSignals } from '../../../agents/personas/turn-extras.js';
import { callerMove } from '../../../agents/personas/turn-shape.js';
import type { LaughterInput } from '../../tts-gateway/director/laughter.js';
import { decideTeamLaughter, teamLaughStyle } from '../../tts-gateway/director/team-laughter.js';
import { resetLaughterSession } from '../contextual-laughter.js';
import { forgetCallerTurns, isHeavyMoment } from '../heavy-moment.js';

/** Loss with no death word: light on main, heavy with the flag on. */
const NEWLY_HEAVY = [
  'Buried my uncle last Friday.',
  'she passed in 2019',
  'he passed last spring',
  'my aunt has been gone since 2011',
  "Mom's been gone since '09.",
  'at the cemetery yesterday',
  'I have to write the eulogy',
];
/** Already heavy on main: the flag changes nothing here. */
const ALREADY_HEAVY = ['lost my mom in March', 'We buried my uncle last Friday.'];
/** Must stay light, flag on or off. */
const LIGHT = [
  "he's been gone since Monday on a work trip",
  'I lost my keys',
  'the pass rush was brutal',
  'buried in email all day',
  'the flight is gone',
  'she passed the salt',
  'he passed in the hallway',
  'my sister has been gone since Tuesday',
  "Mom's been gone since 9 this morning",
  'buried my face in a pillow',
  'the gravel road',
];

const on = (): void => void vi.stubEnv('HEAVY_MOMENT_WIDER', 'on');
afterEach(() => vi.unstubAllEnvs());

describe('isHeavyMoment, HEAVY_MOMENT_WIDER', () => {
  it('off: loss without a death word reads light, as on main', () => {
    for (const line of NEWLY_HEAVY) expect(isHeavyMoment([line]), line).toBe(false);
  });

  it('on: loss without a death word reads heavy', () => {
    on();
    for (const line of NEWLY_HEAVY) expect(isHeavyMoment([line]), line).toBe(true);
  });

  it('already-heavy lines stay heavy, flag on or off', () => {
    for (const line of ALREADY_HEAVY) expect(isHeavyMoment([line]), line).toBe(true);
    on();
    for (const line of ALREADY_HEAVY) expect(isHeavyMoment([line]), line).toBe(true);
  });

  it('light lines stay light with the flag on: whole words and a loss sign, never a substring', () => {
    for (const line of LIGHT) expect(isHeavyMoment([line]), line).toBe(false);
    on();
    for (const line of LIGHT) expect(isHeavyMoment([line]), line).toBe(false);
  });
});

describe('wider heavy only takes laughs and play away', () => {
  const SESSION = 'wider-laugh';
  const maya = teamLaughStyle('maya-santos');
  const always = (): number => 0;
  const laugh = (userText: string) => {
    if (!maya) throw new Error('no laugh style for maya-santos');
    const input: LaughterInput = {
      phrase: 'Okay, I hear that.',
      replyValence: 'neutral',
      alreadyLaughing: false,
      sessionId: SESSION,
      personaId: 'maya-santos',
      turn: 10,
      userText,
    };
    return decideTeamLaughter(input, maya, always);
  };
  beforeEach(() => {
    resetLaughterSession(SESSION);
    forgetCallerTurns(SESSION);
  });

  it('the laughter lever: a laugh at the loss with it off, none with it on', () => {
    const loss = 'Buried my uncle last Friday haha he would have loved the chaos';
    expect(laugh(loss)).toBe('before');
    on();
    resetLaughterSession(SESSION);
    forgetCallerTurns(SESSION);
    expect(laugh(loss)).toBeUndefined();
  });

  it('the laughter lever: a light laugh is untouched by the flag', () => {
    expect(laugh('I lost my keys again haha')).toBe('before');
    on();
    resetLaughterSession(SESSION);
    forgetCallerTurns(SESSION);
    expect(laugh('I lost my keys again haha')).toBe('before');
  });

  it('the playful turn: play after the loss with it off, none with it on; light turns still play', () => {
    const env = { FERNI_PLAYFUL: 'on' };
    const play = (said: string) =>
      withPlayful({}, said, regexSignals(said, callerMove(said)), env)?.playful;
    const loss = 'Buried my uncle last Friday.';
    expect(play(loss)).toBe(true);
    const light = 'We went to the lake this weekend';
    expect(play(light)).toBe(true);
    on();
    expect(play(loss)).toBeUndefined();
    expect(play(light)).toBe(true);
  });
});
