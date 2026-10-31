/**
 * FERNI_LIGHT_TOUCH laughter: Ferni's old lever score (0.18 x (rapport + 0.5),
 * at most 0.27) could never reach its 0.3 threshold, so it added 0 laughs in
 * 415 prod plans. With the flag on he laughs at a qualifying moment by the
 * team rules, with a chance that never drops below 0.15, the same blocks, his
 * 6-turn spacing and the cap of 4 a call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetLaughterSession } from '../../../adaptive-ssml/contextual-laughter.js';
import { forgetCallerTurns } from '../../../adaptive-ssml/heavy-moment.js';
import { decideReplyLaughter, type LaughterInput } from '../laughter.js';
import {
  FERNI_LAUGH_FLOOR,
  decideTeamLaughter,
  ferniLightStyle,
  teamLaughStyle,
} from '../team-laughter.js';

const SESSION = 'ferni-light-touch';

/** A playful call: the caller laughs or teases on every turn. */
const PLAYFUL: Array<{ user: string; phrase: string }> = [
  { user: 'haha no way', phrase: "Okay, that's so you." },
  { user: 'lol okay fair', phrase: 'You did not just say that.' },
  { user: "hahaha you're ridiculous", phrase: "I'm just teasing you." },
  { user: 'that is so funny', phrase: 'Right? Who knew.' },
];

/** Heavy turns in the same call shape: nothing here should ever get a laugh. */
const HEAVY: Array<Partial<LaughterInput>> = [
  { userText: 'haha my dad died last week', replyValence: 'neutral' },
  { userText: 'lol I got laid off', replyValence: 'neutral' },
  { userText: 'haha whatever', replyValence: 'heavy' },
  { userText: 'hahaha', userEmotion: 'sad', replyValence: 'neutral' },
  { userText: 'haha', phrase: "I'm so sorry, that's really hard.", replyValence: 'neutral' },
];

const input = (over: Partial<LaughterInput> = {}): LaughterInput => ({
  phrase: "Okay, that's so you.",
  replyValence: 'bright',
  alreadyLaughing: false,
  sessionId: SESSION,
  personaId: 'ferni',
  turn: 10,
  ...over,
});

/** A small seeded generator so the rate checks are the same on every run. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Plays `calls` calls of `turns` turns and returns the turn numbers that laughed, per call. */
function playCalls(
  calls: number,
  turns: number,
  turn: (n: number) => Partial<LaughterInput>,
  lightTouch: boolean
): number[][] {
  const out: number[][] = [];
  for (let c = 0; c < calls; c++) {
    resetLaughterSession(SESSION);
    forgetCallerTurns(SESSION);
    const laughed: number[] = [];
    for (let n = 1; n <= turns; n++) {
      if (decideReplyLaughter(input({ turn: n, lightTouch, ...turn(n) }))) laughed.push(n);
    }
    out.push(laughed);
  }
  return out;
}

const playfulTurn = (n: number): Partial<LaughterInput> => {
  const t = PLAYFUL[n % PLAYFUL.length];
  return { userText: t.user, phrase: t.phrase };
};

let roll: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetLaughterSession(SESSION);
  forgetCallerTurns(SESSION);
  roll = vi.spyOn(Math, 'random').mockImplementation(seeded(1017));
});
afterEach(() => roll.mockRestore());

describe('flag off', () => {
  it('leaves Ferni on the old, unreachable rules: no laughs on a playful call', () => {
    const calls = playCalls(200, 24, playfulTurn, false);
    expect(calls.flat()).toHaveLength(0);
    expect(teamLaughStyle('ferni')).toBeUndefined();
  });
});

describe('flag on', () => {
  it('laughs about once every 6 to 8 turns on a playful call', () => {
    const calls = playCalls(500, 24, playfulTurn, true);
    const laughs = calls.flat().length;
    const turnsPerLaugh = (500 * 24) / laughs;
    expect(turnsPerLaugh).toBeGreaterThanOrEqual(6);
    expect(turnsPerLaugh).toBeLessThanOrEqual(9);
  });

  it('keeps the 6-turn spacing and the cap of 4 a call', () => {
    const calls = playCalls(500, 60, playfulTurn, true);
    for (const laughed of calls) {
      expect(laughed.length).toBeLessThanOrEqual(4);
      for (let i = 1; i < laughed.length; i++)
        expect(laughed[i] - laughed[i - 1]).toBeGreaterThanOrEqual(6);
    }
    // 60 turns is room for more than 4 at this rate: the cap is what stops it.
    expect(calls.filter((l) => l.length === 4).length).toBeGreaterThan(400);
  });

  it('never laughs on a heavy turn', () => {
    const calls = playCalls(200, 25, (n) => HEAVY[n % HEAVY.length], true);
    expect(calls.flat()).toHaveLength(0);
  });

  it('needs a moment: no laugh on an ordinary reply to an ordinary line', () => {
    const calls = playCalls(
      200,
      24,
      () => ({ userText: 'I went to the store today', phrase: 'What did you get?' }),
      true
    );
    expect(calls.flat()).toHaveLength(0);
  });

  it('never lets the chance at a qualifying moment drop below the 0.15 floor', () => {
    const ferni = ferniLightStyle('ferni')!;
    expect(ferni.floor).toBe(FERNI_LAUGH_FLOOR);
    // His own joke at rapport 0: 0.18 x 0.5 = 0.09 without the floor.
    const ownJoke = input({ phrase: 'Just kidding, I would never.', comfortLevel: 0 });
    expect(decideTeamLaughter(ownJoke, ferni, () => 0.14)).toBe('after');
    resetLaughterSession(SESSION);
    expect(decideTeamLaughter(ownJoke, ferni, () => 0.16)).toBeUndefined();
  });

  it("counts Ferni's own written [laughter] toward the spacing", () => {
    expect(decideReplyLaughter(input({ lightTouch: true, alreadyLaughing: true }))).toBeUndefined();
    const next = input({ turn: 12, userText: 'haha', lightTouch: true });
    expect(decideTeamLaughter(next, ferniLightStyle('ferni')!, () => 0)).toBeUndefined();
  });

  it('changes nothing for the team: the flag only gives Ferni a style', () => {
    expect(ferniLightStyle('maya-santos')).toBeUndefined();
    expect(ferniLightStyle(undefined)).toBeUndefined();
  });
});

describe('on the live gateway path', () => {
  it('puts [laughter] before a Ferni reply to a laughing caller, only with the flag', async () => {
    const { ReadableStream } = await import('node:stream/web');
    const { directSpeech } = await import('../reply-director.js');
    const { DirectorSessions } = await import('../session-state.js');
    const text = 'Okay, that is a great way to put it.';
    const run = async (env: Record<string, string>) => {
      resetLaughterSession(SESSION);
      const pushes: string[] = [];
      const directed = directSpeech(
        {
          push: (t: string) => pushes.push(t),
          end: () => {},
          cancel: () => {},
          async *[Symbol.asyncIterator]() {},
        },
        {
          textStream: new ReadableStream<string>({
            start(c) {
              c.enqueue(text);
              c.close();
            },
          }),
          voiceId: 'eef47c0d-cb49-4160-a4a0-6b97ed4c81e6',
          sessionId: SESSION,
          personaId: 'ferni',
          turnContext: { turnNumber: 10, userRequest: 'hahaha no way' },
          env,
          sessions: new DirectorSessions(),
          onPlan: () => {},
        }
      );
      for await (const _ of directed.textStream) {
        /* observe */
      }
      directed.reply.push(text);
      directed.reply.end();
      return pushes.join('');
    };
    roll.mockReturnValue(0);
    const live = { SPEECH_DIRECTOR: 'live' };
    expect(await run({ ...live, FERNI_LIGHT_TOUCH: 'on' })).toMatch(
      /^(?:<[^>]+>)*\[laughter\] Okay/
    );
    expect(await run(live)).not.toContain('[laughter]');
  });
});
