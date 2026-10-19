/**
 * FERNI_PLAYFUL on the turn reminder: for Ferni, on a turn that is not
 * careful, held or looked up, the reminder allows one natural reaction word to
 * open, and an easy neutral turn gets a playfulness and opinion line. Off, and
 * on every careful, crisis or grief turn, the reminder is what it was.
 */
import { ReadableStream } from 'node:stream/web';

import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  brightOpenerInvited,
  PLAYFUL_BRIGHT_OPEN,
  PLAYFUL_LINE,
  PLAYFUL_OPEN,
  SUBSTANCE_FIRST,
} from '../ferni-playful.js';
import { withPlayful } from '../ferni-playful-turn.js';
import { modelSignals, regexSignals, type TurnSignals } from '../turn-extras.js';
import { callerMove, rngFor, turnShapeFor } from '../turn-shape.js';
import { withTurnReminder } from '../turn-request.js';
import type { Understanding } from '../turn-understanding.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

const MODES = ['model', 'dice'] as const;
type Mode = (typeof MODES)[number];

const NEUTRAL = ['We went to the lake this weekend', 'My cat knocked water onto my keyboard.'];
const BRIGHT = ['I got the job!', 'We won the league final last night'];
const CAREFUL = [
  'I got the job but honestly I am so stressed about moving',
  'My dad passed away last week',
  "I'm exhausted, it's been a long day",
];

const understood = (over: Partial<Understanding> = {}): Understanding => ({
  move: 'share',
  needsTool: false,
  mood: 'neutral',
  laughed: false,
  laughFits: false,
  adviceFits: false,
  wantsToEnd: false,
  reaction: null,
  ...over,
});

const signals = (text: string): TurnSignals => regexSignals(text, callerMove(text));
const playful = (sig: TurnSignals): TurnSignals => ({ ...sig, playful: true });
const reminder = (text: string, mode: Mode, sig: TurnSignals = signals(text)): string =>
  turnShapeFor(text, rngFor(`playful:${text}`), mode, sig).reminder;

describe('FERNI_PLAYFUL turn reminder (turn-shape)', () => {
  it('without playful signals every reminder is as before', () => {
    for (const mode of MODES)
      for (const t of [...NEUTRAL, ...BRIGHT, ...CAREFUL]) {
        const r = reminder(t, mode);
        expect(r, `${mode}: ${t}`).toContain(SUBSTANCE_FIRST.trim());
        expect(r).not.toContain(PLAYFUL_LINE);
        expect(r).not.toContain(PLAYFUL_OPEN.trim());
      }
  });

  it('a neutral, easy turn allows one reaction word and carries the playful line', () => {
    for (const mode of MODES)
      for (const t of NEUTRAL) {
        const r = reminder(t, mode, playful(signals(t)));
        expect(r, `${mode}: ${t}`).toContain(PLAYFUL_OPEN.trim());
        expect(r).toContain(PLAYFUL_LINE);
        expect(r).not.toContain(SUBSTANCE_FIRST.trim());
        expect(r).toContain('no generic cheerleading or exclamation marks');
      }
  });

  it('a bright turn opens on a reaction word in its own words, without the playful line', () => {
    for (const mode of MODES)
      for (const t of BRIGHT) {
        const r = reminder(t, mode, playful(signals(t)));
        expect(r, `${mode}: ${t}`).toContain(PLAYFUL_BRIGHT_OPEN.trim());
        expect(r).not.toContain(PLAYFUL_LINE);
      }
  });

  it('a careful, grief, held or look-up turn is byte-identical to off', () => {
    for (const mode of MODES) {
      for (const t of CAREFUL) {
        const sig = withPlayful({}, t, signals(t), { FERNI_PLAYFUL: 'on' });
        expect(reminder(t, mode, sig), `${mode}: ${t}`).toBe(reminder(t, mode));
      }
      for (const mood of ['venting', 'tender', 'bad_news'] as const) {
        const sig = modelSignals(understood({ mood }));
        expect(reminder('We went to the lake', mode, playful(sig)), mood).toBe(
          reminder('We went to the lake', mode, sig)
        );
      }
      const held = { ...signals(NEUTRAL[0]), supportFirst: true };
      expect(reminder(NEUTRAL[0], mode, playful(held))).toBe(reminder(NEUTRAL[0], mode, held));
      const look = "What's the weather tomorrow?";
      expect(reminder(look, mode, playful(signals(look)))).toBe(reminder(look, mode));
    }
  });

  it('a request may open on a reaction word but gets no playful line', () => {
    const t = 'Can you walk me through how compound interest works?';
    const r = reminder(t, 'model', playful(signals(t)));
    expect(r).toContain(PLAYFUL_OPEN.trim());
    expect(r).not.toContain(PLAYFUL_LINE);
  });

  it('the playful line describes shapes, quotes no line and invents no life fact', () => {
    expect(PLAYFUL_LINE).toMatch(/The shapes, in your own words/);
    expect(PLAYFUL_LINE).toMatch(/never a new fact about yourself/);
    expect(PLAYFUL_LINE).not.toMatch(/"/);
    expect(PLAYFUL_LINE).not.toMatch(/Hot take|snake plant|Say it slower/i);
    expect(PLAYFUL_LINE).not.toMatch(/—|\.\.\.|…/);
  });
});

describe('FERNI_PLAYFUL signals (withPlayful)', () => {
  const said = NEUTRAL[0];
  const sig = signals(said);

  it('marks the turn only with the flag on and Ferni speaking', () => {
    expect(withPlayful({}, said, sig, {})).toBe(sig);
    expect(withPlayful({}, said, sig, { FERNI_PLAYFUL: 'off' })).toBe(sig);
    expect(withPlayful({}, said, sig, { FERNI_PLAYFUL: 'on' })?.playful).toBe(true);
    expect(
      withPlayful({ userData: { personaId: 'ferni' } }, said, sig, { FERNI_PLAYFUL: 'on' })?.playful
    ).toBe(true);
    expect(
      withPlayful({ userData: { personaId: 'maya-santos' } }, said, sig, { FERNI_PLAYFUL: 'on' })
    ).toBe(sig);
    const filled = withPlayful({}, said, undefined, { FERNI_PLAYFUL: 'on' });
    expect(filled).toEqual({ ...sig, playful: true, playfulLine: true });
    expect(withPlayful({}, said, undefined, {})).toBeUndefined();
  });
});

describe('FERNI_PLAYFUL on the request (turn-request)', () => {
  const ctxSaying = (text: string): llm.ChatContext => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: text });
    return ctx;
  };
  const last = (c: llm.ChatContext): string =>
    (c.items[c.items.length - 1] as { textContent?: string }).textContent ?? '';

  it('flag off: no playful line, no bright opener', () => {
    for (const t of [...NEUTRAL, ...BRIGHT]) {
      const sent = withTurnReminder(ctxSaying(t), {});
      expect(last(sent), t).not.toContain(PLAYFUL_LINE);
      expect(brightOpenerInvited(sent)).toBe(false);
    }
  });

  it('flag on: the playful line rides a neutral turn, and the bright opener a bright one', () => {
    vi.stubEnv('FERNI_PLAYFUL', 'on');
    expect(last(withTurnReminder(ctxSaying(NEUTRAL[0]), {}))).toContain(PLAYFUL_LINE);
    const bright = withTurnReminder(ctxSaying('I got the job!'), {});
    expect(last(bright)).toContain(PLAYFUL_BRIGHT_OPEN.trim());
    expect(brightOpenerInvited(bright)).toBe(true);
    expect(brightOpenerInvited(withTurnReminder(ctxSaying(NEUTRAL[0]), {}))).toBe(false);
  });

  it('flag on: never on a crisis reply, a careful turn or a teammate', () => {
    vi.stubEnv('FERNI_PLAYFUL', 'on');
    for (const t of [...NEUTRAL, ...BRIGHT]) {
      const crisis = withTurnReminder(ctxSaying(t), {}, { shape: false });
      expect(last(crisis), t).not.toContain(PLAYFUL_LINE);
      expect(brightOpenerInvited(crisis)).toBe(false);
    }
    for (const t of CAREFUL)
      expect(last(withTurnReminder(ctxSaying(t), {}))).not.toContain(PLAYFUL_LINE);
    const maya = { userData: { personaId: 'maya-santos' } };
    expect(last(withTurnReminder(ctxSaying(NEUTRAL[0]), maya))).not.toContain(PLAYFUL_LINE);
  });
});

describe('FERNI_PLAYFUL through the crisis gate (crisis-gate)', () => {
  const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
  const textStream = (text: string) =>
    new ReadableStream<string>({
      start(c) {
        c.enqueue(text);
        c.close();
      },
    });
  const brightSeen = async (said: string): Promise<boolean | undefined> => {
    const { gatedReply } = await import('../crisis-gate.js');
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: said });
    let seen: boolean | undefined;
    const opener = {
      wrap: (s: ReadableStream<string>, _o?: () => boolean, _b?: boolean, bright?: boolean) => {
        seen = bright;
        return s;
      },
    };
    await gatedReply(
      ctx,
      { userData: undefined },
      (async () => textStream('ok')) as never,
      opener as never,
      {
        env: PATTERNS_ONLY,
      }
    );
    return seen;
  };

  it('tells the opener gate a bright turn invited a reaction word, only with the flag', async () => {
    expect(await brightSeen('I got the job!')).toBe(false);
    vi.stubEnv('FERNI_PLAYFUL', 'on');
    expect(await brightSeen('I got the job!')).toBe(true);
    expect(await brightSeen(NEUTRAL[0])).toBe(false);
    expect(await brightSeen("I got the job but I hope I don't wake up tomorrow")).toBe(false);
  });
});
