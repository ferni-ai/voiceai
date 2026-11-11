/**
 * TEAM_VOICES laughter: the lever's old score could never reach its own 0.3
 * threshold (0 laughs in 2,680 dev plans); teammates and legends now laugh at
 * a qualifying moment with their own frequency and style.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  decideLaughter,
  resetLaughterSession,
} from '../../../adaptive-ssml/contextual-laughter.js';
import { decideReplyLaughter, type LaughterInput } from '../laughter.js';
import { decideTeamLaughter, teamLaughStyle } from '../team-laughter.js';

const SESSION = 'laugh-test';
const always = () => 0;
const never = () => 0.999;

const base = (over: Partial<LaughterInput> = {}): LaughterInput => ({
  phrase: 'Okay, I hear that.',
  replyValence: 'neutral',
  alreadyLaughing: false,
  sessionId: SESSION,
  personaId: 'maya-santos',
  turn: 10,
  ...over,
});

beforeEach(() => resetLaughterSession(SESSION));

describe('the old score (why the lever never fired)', () => {
  it('cannot reach 0.3 at default rapport, even for the strongest pattern and persona', () => {
    // Jordan has the highest base (0.25); "just kidding" the strongest pattern (0.9).
    for (let i = 0; i < 50; i++) {
      resetLaughterSession(SESSION);
      const d = decideLaughter(
        {
          responseText: 'Just kidding!',
          personaId: 'jordan-taylor',
          turnCount: 10,
          userMessage: 'haha',
        },
        SESSION
      );
      expect(d.shouldLaugh).toBe(false);
    }
  });
});

describe('decideTeamLaughter', () => {
  const maya = teamLaughStyle('maya-santos')!;

  it('laughs along when the caller laughed, before the reply', () => {
    expect(decideTeamLaughter(base({ userText: 'haha okay fair' }), maya, always)).toBe('before');
  });

  it("laughs after the persona's own joke, if the persona does that", () => {
    const own = base({ phrase: "I'd eat cereal for dinner too, just kidding." });
    expect(decideTeamLaughter(own, maya, always)).toBe('after');
    expect(decideTeamLaughter(own, teamLaughStyle('peter-john')!, always)).toBeUndefined();
  });

  it('needs a moment: no laugh on an ordinary reply, however lucky the roll', () => {
    expect(decideTeamLaughter(base(), maya, always)).toBeUndefined();
  });

  it("rolls the persona's frequency, doubled when the caller laughed", () => {
    const at = (v: number) => () => v;
    const playful = base({ userText: 'lol' });
    expect(decideTeamLaughter(playful, maya, at(0.29))).toBe('before'); // p = 0.15 x 1 x 2
    resetLaughterSession(SESSION);
    expect(decideTeamLaughter(playful, maya, at(0.31))).toBeUndefined();
    const nayan = teamLaughStyle('nayan-patel')!;
    expect(decideTeamLaughter(playful, nayan, at(0.13))).toBeUndefined(); // p = 0.12
  });

  it('keeps the blocks: upset caller, supportive words, spacing, cap of 4', () => {
    const playful = base({ userText: 'haha' });
    expect(decideTeamLaughter({ ...playful, userEmotion: 'sad' }, maya, always)).toBeUndefined();
    expect(
      decideTeamLaughter({ ...playful, phrase: "I'm so sorry." }, maya, always)
    ).toBeUndefined();
    expect(decideTeamLaughter(playful, maya, always)).toBe('before');
    expect(decideTeamLaughter({ ...playful, turn: 12 }, maya, always)).toBeUndefined(); // min 5 turns
    for (const turn of [20, 30, 40])
      expect(decideTeamLaughter({ ...playful, turn }, maya, always)).toBe('before');
    expect(decideTeamLaughter({ ...playful, turn: 50 }, maya, always)).toBeUndefined(); // 4 a call
  });

  it('never rolls when it misses', () => {
    expect(decideTeamLaughter(base({ userText: 'haha' }), maya, never)).toBeUndefined();
  });
});

describe('styles', () => {
  it("give the legends their own style, not Ferni's, and leave Ferni alone", () => {
    expect(teamLaughStyle('ferni')).toBeUndefined();
    expect(teamLaughStyle('john-bogle')).toMatchObject({ ownJokes: false, frequency: 0.08 });
    expect(teamLaughStyle('peter-lynch')?.ownJokes).toBe(true);
    expect(teamLaughStyle('joel-dickson')?.frequency).toBe(0.2);
  });

  it("match each manifest's laughter_frequency", () => {
    for (const id of [
      'maya-santos',
      'jordan-taylor',
      'alex-chen',
      'peter-john',
      'nayan-patel',
      'joel-dickson',
    ]) {
      const manifest = JSON.parse(
        readFileSync(
          join(process.cwd(), 'src/personas/bundles', id, 'persona.manifest.json'),
          'utf8'
        )
      );
      expect(teamLaughStyle(id)?.frequency, id).toBe(manifest.voice.laughter_frequency);
    }
  });
});

describe('the lever with TEAM_VOICES', () => {
  it('uses the team rules for a teammate and the old ones without the flag', () => {
    const playful = base({ userText: 'hahaha you got me', comfortLevel: 1 });
    let laughed = 0;
    for (let i = 0; i < 200; i++) {
      resetLaughterSession(SESSION);
      if (decideReplyLaughter({ ...playful, teamVoices: true })) laughed++;
    }
    // p = 0.15 x 1.5 x 2 = 0.45 per qualifying reply.
    expect(laughed).toBeGreaterThan(50);
    expect(laughed).toBeLessThan(140);
    resetLaughterSession(SESSION);
    expect(decideReplyLaughter(playful)).toBeUndefined();
  });

  it("counts the LLM's own [laughter] toward the spacing", () => {
    const playful = base({ userText: 'haha', teamVoices: true });
    expect(decideReplyLaughter({ ...playful, alreadyLaughing: true })).toBeUndefined();
    expect(
      decideTeamLaughter({ ...playful, turn: 11 }, teamLaughStyle('maya-santos')!, always)
    ).toBeUndefined();
  });
});

describe('on the live gateway path', () => {
  it('puts [laughter] before a teammate reply to a laughing caller, only with the flag', async () => {
    const { ReadableStream } = await import('node:stream/web');
    const { vi } = await import('vitest');
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
          personaId: 'maya-santos',
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
    const roll = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      expect(await run({ SPEECH_DIRECTOR: 'live', TEAM_VOICES: 'on' })).toMatch(
        /^(?:<[^>]+>)*\[laughter\] Okay/
      );
      expect(await run({ SPEECH_DIRECTOR: 'live' })).not.toContain('[laughter]');
    } finally {
      roll.mockRestore();
    }
  });
});
