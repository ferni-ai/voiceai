/**
 * The laughter lever never laughs along with something hard, for Ferni
 * (FERNI_LIGHT_TOUCH) or a teammate (TEAM_VOICES), whatever the caller's
 * "lol", "haha" or [laughter], and not on "??" alone. An unflagged harm fix:
 * before it, "kill myself lol" read as playful and got a laugh along.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetLaughterSession } from '../../../adaptive-ssml/contextual-laughter.js';
import { forgetCallerTurns } from '../../../adaptive-ssml/heavy-moment.js';
import { decideReplyLaughter, type LaughterInput } from '../laughter.js';

const SESSION = 'heavy-laughter';
const MUST_NOT_LAUGH = [
  'lol my grandma passed',
  "I can't do this anymore lol",
  'kill myself lol',
  "my dad's in the ICU haha",
  'what do I even do now??',
  "i'm suicidal lol",
  'kms lol',
  'I wish I was dead haha',
  'he hits me lol',
  'we lost the baby lol',
  'there is no point lol',
  "we're in the ER lol",
  'I cried all night haha',
];
const WHO: Array<[string, Partial<LaughterInput>]> = [
  ['ferni', { personaId: 'ferni', lightTouch: true }],
  ['maya', { personaId: 'maya-santos', teamVoices: true }],
];

const reply = (over: Partial<LaughterInput>): ReturnType<typeof decideReplyLaughter> =>
  decideReplyLaughter({
    phrase: 'Okay, tell me more.',
    replyValence: 'neutral',
    alreadyLaughing: false,
    sessionId: SESSION,
    turn: 10,
    ...over,
  });

let roll: ReturnType<typeof vi.spyOn>;
const fresh = (): void => {
  resetLaughterSession(SESSION);
  forgetCallerTurns(SESSION);
};
beforeEach(() => {
  fresh();
  roll = vi.spyOn(Math, 'random').mockReturnValue(0); // every roll would laugh
});
afterEach(() => roll.mockRestore());

describe('laughing along on a heavy moment', () => {
  it('still laughs along on a genuinely light turn', () => {
    for (const [name, who] of WHO) {
      fresh();
      expect(reply({ ...who, userText: "hahaha you're ridiculous" }), name).toBe('before');
    }
  });

  it('never laughs at hard words, however the caller laughed', () => {
    for (const [name, who] of WHO)
      for (const userText of MUST_NOT_LAUGH) {
        fresh();
        expect(reply({ ...who, userText }), `${name}: ${userText}`).toBeUndefined();
      }
  });

  it('never laughs at "haha anyway" right after grief, and does again two turns on', () => {
    for (const [name, who] of WHO) {
      fresh();
      expect(reply({ ...who, turn: 1, userText: 'my dad died last week' })).toBeUndefined();
      expect(reply({ ...who, turn: 10, userText: 'haha anyway' }), name).toBeUndefined();
      expect(reply({ ...who, turn: 20, userText: "hahaha you're ridiculous" }), name).toBe(
        'before'
      );
    }
  });

  it('remembers the grief when the reply to it was heavy, as a sympathetic reply is', () => {
    for (const [name, who] of WHO) {
      fresh();
      const grief = { ...who, turn: 1, userText: 'my dad died', replyValence: 'heavy' as const };
      expect(reply({ ...grief, phrase: "Oh no, I'm so sorry." })).toBeUndefined();
      expect(reply({ ...who, turn: 10, userText: 'haha anyway' }), name).toBeUndefined();
    }
  });

  it('keeps the old rules off a heavy moment too', () => {
    // A teammate without TEAM_VOICES, at full rapport, after its own joke: the old rules laugh.
    const old = {
      personaId: 'jordan-taylor',
      comfortLevel: 1,
      phrase: "I'd eat cereal for dinner too, just kidding.",
    };
    expect(reply({ ...old, turn: 10, userText: 'haha anyway' })).toBeDefined();
    fresh();
    expect(reply({ ...old, turn: 1, userText: 'my dad died last week' })).toBeUndefined();
    expect(reply({ ...old, turn: 10, userText: 'haha anyway' })).toBeUndefined();
  });

  it('remembers the grief even when that reply already laughed on its own', () => {
    const who = WHO[0][1];
    expect(
      reply({ ...who, turn: 1, userText: 'my grandma passed', alreadyLaughing: true })
    ).toBeUndefined();
    expect(reply({ ...who, turn: 10, userText: 'haha anyway' })).toBeUndefined();
  });

  it('does not read "?!" or "!!" as playful', () => {
    for (const [name, who] of WHO) {
      fresh();
      expect(reply({ ...who, userText: 'wait, seriously?!' }), name).toBeUndefined();
    }
  });
});

describe('when the call ends', () => {
  it("the director's session clear forgets the caller's turns", async () => {
    const { DirectorSessions } = await import('../session-state.js');
    const { noteCallerTurn, recentCallerTurns } =
      await import('../../../adaptive-ssml/heavy-moment.js');
    noteCallerTurn(SESSION, 'my dad died last week');
    new DirectorSessions().clear(SESSION);
    expect(recentCallerTurns(SESSION)).toEqual([]);
  });
});
