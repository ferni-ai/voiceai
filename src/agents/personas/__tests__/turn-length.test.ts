import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEXT_TURN_WORDS, ROUGH_SHARE } from '../turn-length-table.generated.js';
import { lengthLine, recentTurns, targetWords, textureLine } from '../turn-length.js';
import { rngFor, turnShapeFor } from '../turn-shape.js';
import { regexSignals } from '../turn-extras.js';
import { withTurnReminder } from '../turn-request.js';

const KEYS = ['TURN_LENGTH', 'TURN_TEXTURE', 'TURN_SHAPE'];
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.TURN_SHAPE = 'model';
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const draws = (n: number, f: (rng: () => number) => number): number[] => {
  const rng = rngFor('turn-length');
  return Array.from({ length: n }, () => f(rng));
};
const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
/** The target a reminder asked for, in words. */
const asked = (reminder: string): number | null => {
  if (/two or three words/.test(reminder)) return 3;
  const m = reminder.match(/about (\d+)/);
  return m ? Number(m[1]) : null;
};

describe('learned reply length', () => {
  it('draws from friends in the same kind of moment: longer when Ferni holds a lively floor', () => {
    const quiet = { ferniLastWords: 2, energy: 4 };
    const lively = { ferniLastWords: 20, energy: 15 };
    const said = 'and then we just drove home';
    const q = draws(2000, (r) => targetWords(said, quiet, r));
    const l = draws(2000, (r) => targetWords(said, lively, r));
    expect(new Set(q).size).toBeGreaterThan(4); // it varies, like people do
    expect(mean(l)).toBeGreaterThan(mean(q) + 5);
    for (const x of q) expect(NEXT_TURN_WORDS['010']).toContain(x);
  });

  it('never gives news that matters, or a question about him, a two-word reply', () => {
    const recent = { ferniLastWords: 2, energy: 4 };
    const xs = draws(500, (r) => targetWords('so I got the job', recent, r, true));
    expect(Math.min(...xs)).toBe(NEXT_TURN_WORDS['010'][5]);
  });

  it('reads Ferni’s last turn and the pace from the conversation', () => {
    const r = recentTurns([
      { ferni: false, text: 'how was the trip' },
      { ferni: true, text: 'long but good we saw the whole coast' },
      { ferni: false, text: 'nice' },
    ]);
    expect(r.ferniLastWords).toBe(8);
    expect(r.energy).toBeCloseTo((4 + 8 + 1) / 3, 5);
  });

  it('says the target plainly, from a quick reaction to a few sentences', () => {
    expect(lengthLine(3)).toMatch(/two or three words/);
    expect(lengthLine(6)).toMatch(/about 6/);
    expect(lengthLine(40)).toMatch(/few spoken sentences, about 40/);
  });
});

describe('learned texture', () => {
  it('is rough at friends’ rate for the reply’s size, and clean otherwise', () => {
    for (const [size, target] of [
      [0, 4],
      [2, 30],
    ]) {
      const kinds = draws(4000, (r) => (textureLine(target, r).kind === 'clean' ? 0 : 1));
      expect(mean(kinds)).toBeCloseTo(ROUGH_SHARE[size], 1);
    }
    const rng = rngFor('x');
    const seen = new Set(Array.from({ length: 400 }, () => textureLine(30, rng).kind));
    expect(seen).toEqual(new Set(['clean', 'opener', 'pause', 'restart', 'hedge']));
  });
});

describe('turn shape with the learned levers', () => {
  const said = 'my sister finally called me back about the house';
  const sig = { ...regexSignals(said, 'share'), recent: { ferniLastWords: 3, energy: 6 } };

  it('off, draws nothing and changes nothing', () => {
    const a = turnShapeFor(said, rngFor('s'), 'model', sig);
    const b = turnShapeFor(said, rngFor('s'), 'model', regexSignals(said, 'share'));
    expect(a.reminder).toBe(b.reminder);
    expect(a.reminder).toMatch(/Most replies are a sentence or two/);
  });

  it('TURN_LENGTH=learned replaces the fixed length rule with a drawn target', () => {
    process.env.TURN_LENGTH = 'learned';
    const t = turnShapeFor(said, rngFor('s'), 'model', sig);
    expect(t.reminder).not.toMatch(/Most replies are a sentence or two/);
    expect(asked(t.reminder)).not.toBeNull();
    expect(t.extras.some((e) => e.startsWith('length_'))).toBe(true);
  });

  it('TURN_TEXTURE=learned drops the fixed filler and thinking-aloud lines on chit-chat', () => {
    process.env.TURN_TEXTURE = 'learned';
    const extras = Array.from(
      { length: 200 },
      (_, i) => turnShapeFor(said, rngFor(`t${i}`), 'model', sig).extras
    ).flat();
    expect(extras).not.toContain('filler');
    expect(extras).not.toContain('think_aloud');
    expect(extras.some((e) => e.startsWith('texture_'))).toBe(true);
  });
});

describe('live wiring (withTurnReminder)', () => {
  const call = (ferniLast: string, caller: string) => {
    const c = llm.ChatContext.empty();
    c.addMessage({ role: 'user', content: caller });
    c.addMessage({ role: 'assistant', content: ferniLast });
    c.addMessage({ role: 'user', content: 'and then we just drove home' });
    return c;
  };
  const target = (c: llm.ChatContext) =>
    asked((withTurnReminder(c, {}).items.at(-1) as llm.ChatMessage).textContent ?? '') as number;

  it('sizes the reply from the real conversation before it', () => {
    process.env.TURN_LENGTH = 'learned';
    // Each fresh session seeds its draws from Math.random (callSeed), so pin it: unseeded,
    // the two 300-call means landed under the 5-word gap about one run in six.
    vi.spyOn(Math, 'random').mockImplementation(rngFor('live-wiring'));
    const long =
      'oh we did the same thing last summer and honestly it was the best part of the whole trip, the drive back along the water with nobody else on the road at all';
    const quiet = Array.from({ length: 300 }, () => target(call('ha', 'yeah')));
    const lively = Array.from({ length: 300 }, () =>
      target(call(long, 'we stayed out there until it got really dark and cold, it was amazing'))
    );
    expect(quiet.every((x) => typeof x === 'number')).toBe(true);
    expect(mean(lively)).toBeGreaterThan(mean(quiet) + 5);
  });
});
