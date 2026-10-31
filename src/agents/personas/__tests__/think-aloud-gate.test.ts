/**
 * THINK_ALOUD ("hm, let me think") stays out of heavy, careful, troubled and
 * crisis moments, the same moments LAUGH_ALONG already keeps out of. The
 * 2026-10-19 prod call review heard it right after self-harm talk.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { extrasFor, regexSignals, type TurnSignals } from '../turn-extras.js';
import { withTurnReminder } from '../turn-request.js';
import { callerMove } from '../turn-shape.js';

const ENV = {};
const ASK = 'what should I do about the landlord';
const THINK_ALOUD_LINE = /Work it out aloud/;

const sig = (extra: Partial<TurnSignals> = {}): TurnSignals => ({
  ...regexSignals(ASK, 'request'),
  ...extra,
});
/** Only the thinking-aloud line: the other extras ride the same turn. */
const fired = (signals: TurnSignals, rng: () => number = () => 0, text = ASK): string[] =>
  extrasFor(text, 'request', 'answer', false, rng, ENV, signals).fired.filter(
    (f) => f === 'think_aloud'
  );
const laughOrThink = (f: string): boolean => f === 'laugh_along' || f === 'think_aloud';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetCrisisCallRisk();
});

describe('THINK_ALOUD gate', () => {
  it('an ordinary request turn still thinks aloud at its old rate (0.6)', () => {
    expect(fired(sig(), () => 0.59)).toEqual(['think_aloud']);
    expect(fired(sig(), () => 0.6)).toEqual([]);
    expect(extrasFor('my cat did it', 'share', 'answer', false, () => 0.19, ENV).fired).toContain(
      'think_aloud'
    );
  });

  it('never in a heavy moment, from the signals or the words themselves', () => {
    expect(fired(sig({ heavy: true }))).toEqual([]);
    const said = 'my dad died last week, what should I do now';
    expect(fired(regexSignals(said, 'request'), () => 0, said)).toEqual([]);
  });

  it('never while they are careful (venting, bad news, tender) or telling a trouble', () => {
    expect(fired(sig({ careful: true }))).toEqual([]);
    expect(fired(sig({ trouble: true }))).toEqual([]);
  });

  it('never on a call with crisis risk', () => {
    expect(fired(sig({ crisisRisk: true }))).toEqual([]);
  });

  it('draws from the random source the same either way, so later draws are unchanged', () => {
    let open = 0;
    let gated = 0;
    fired(sig(), () => (open++, 0.9));
    fired(sig({ heavy: true }), () => (gated++, 0.9));
    expect(gated).toBe(open);
  });

  it('leaves LAUGH_ALONG as it was', () => {
    const env = { LAUGH_ALONG: 'on' };
    const said = 'haha okay so what should I cook';
    const laughing = regexSignals(said, 'request');
    expect(
      extrasFor(said, 'request', 'answer', false, () => 0, env, laughing).fired.filter(laughOrThink)
    ).toEqual(['laugh_along', 'think_aloud']);
    // Careful alone never stopped the laugh along; heavy and trouble still do.
    const careful = { ...laughing, careful: true };
    expect(
      extrasFor(said, 'request', 'answer', false, () => 0, env, careful).fired.filter(laughOrThink)
    ).toEqual(['laugh_along']);
    for (const extra of [{ heavy: true }, { trouble: true }])
      expect(
        extrasFor(said, 'request', 'answer', false, () => 0, env, {
          ...laughing,
          ...extra,
        }).fired.filter(laughOrThink)
      ).toEqual([]);
  });
});

describe('on the reply path (withTurnReminder)', () => {
  const said = 'Can you help me figure out what to say to my landlord?';
  const call = (): llm.ChatContext => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'assistant', content: 'Hey, how is your week going?' });
    ctx.addMessage({ role: 'user', content: said });
    return ctx;
  };
  const asked = (session: object): string =>
    (withTurnReminder(call(), session).items.at(-1) as llm.ChatMessage).textContent ?? '';

  it('a request turn thinks aloud without crisis risk, and not once risk is noted on the call', () => {
    expect(callerMove(said)).toBe('request');
    // A fixed per-call seed, so both calls draw the same numbers.
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    expect(asked({ userData: { services: { sessionId: 'call-calm' } } })).toMatch(THINK_ALOUD_LINE);
    noteCrisisRisk('call-risk');
    expect(asked({ userData: { services: { sessionId: 'call-risk' } } })).not.toMatch(
      THINK_ALOUD_LINE
    );
  });
});
