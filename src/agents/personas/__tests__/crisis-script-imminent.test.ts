/**
 * CRISIS_SCRIPT_IMMINENT_READ through the real gatedReply → startCrisisGate → classifier path,
 * with only the classifier's model call stubbed. Every caller line here is written for this file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import type { ReadableStream } from 'node:stream/web';

const logInfo = vi.hoisted(() => vi.fn());
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const spyInfo = <T extends object>(logger: T): T =>
    new Proxy(logger, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        if (prop !== 'info' || typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          logInfo(...args);
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  return {
    ...real,
    createLogger: (...args: Parameters<typeof real.createLogger>) =>
      spyInfo(real.createLogger(...args)),
  };
});

import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { getCrisisResponse, LATE_911_LINE } from '../../../services/safety/crisis-guard-replies.js';
import { detectCrisis } from '../../safety/crisis-guard.js';
import { gatedReply, startCrisisGate } from '../crisis-gate.js';
import {
  FAST_MS_PER_WORD,
  scriptReply,
  VOICE_START_MS,
  type ScriptRead,
} from '../crisis-script-imminent.js';

const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const ON = { ...LIVE, CRISIS_SCRIPT_IMMINENT_READ: 'on' };
const SHADOW = { ...LIVE, CRISIS_SCRIPT_IMMINENT_READ: 'shadow' };
/** The classifier waits long enough that only the script's own clock can end the hold. */
const SLOW = { CRISIS_CLASSIFIER_TIMEOUT_MS: '20000' };

/** A whole supply plus intent, "right now": the patterns read explicit, not imminent. */
const SUPPLY_NOW = 'i have the whole bottle of pills and im going to take all of them right now';
const TONIGHT = 'i want to kill myself tonight';
const PATTERN_IMMINENT = 'i have a gun in my hand right now';
const SPANISH = 'quiero matarme esta noche';

const IMMINENT = '{"risk":"imminent","subject":"self"}';
const IMMINENT_THEM = '{"risk":"imminent","subject":"third_party"}';
const CRISIS = '{"risk":"crisis","subject":"self"}';
const NONE = '{"risk":"none","subject":"self"}';

const SEVERE = getCrisisResponse(0.9, 'self', 'en', false);
const OPENER = SEVERE.slice(0, SEVERE.indexOf('What you'));
const REST = SEVERE.slice(OPENER.length);
const IMMINENT_SCRIPT = getCrisisResponse(0.9, 'self', 'en', true);
/** #3748's line after 988 (CRISIS_SELF_HARM_911_LINE), in its words; in the rest when on. */
const SELF_HARM_911 = "If you've already hurt yourself or you're about to, call 911.";
const WITH_911 = SEVERE.replace('available 24/7.', `available 24/7. ${SELF_HARM_911}`);
const count911 = (text: string): number => text.match(/\b911\b/g)?.length ?? 0;
const SWAPPED = OPENER + IMMINENT_SCRIPT.slice(IMMINENT_SCRIPT.indexOf('Your safety'));
const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;
const OPENER_SAY_MS = words(OPENER) * FAST_MS_PER_WORD - VOICE_START_MS;
const REST_SAY_MS = words(REST) * FAST_MS_PER_WORD - VOICE_START_MS;

function request(text: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'user', content: text });
  return ctx;
}

/** The classifier's model call: `reply` after `ms`, never, or a throw. */
const answer =
  (reply: string | 'never' | 'throw', ms = 0): CrisisGenerateFn =>
  async () => {
    if (reply === 'throw') throw new Error('provider down');
    if (reply === 'never') return new Promise<string>(() => {});
    if (ms) {
      await new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    }
    return reply;
  };

interface Heard {
  text: string;
  chunks: Array<{ at: number; text: string }>;
  model: ReturnType<typeof vi.fn>;
}

/** One scripted turn through the real gate; chunks with the fake clock's time they arrived. */
async function turn(
  text: string,
  env: Record<string, string>,
  generate: CrisisGenerateFn
): Promise<Heard> {
  const model = vi.fn(async () => null);
  const startedAt = Date.now();
  const stream = (await gatedReply(
    request(text),
    { userData: undefined },
    model as never,
    { wrap: (s: unknown) => s } as never,
    { env, generate }
  )) as unknown as ReadableStream<string>;
  const chunks: Heard['chunks'] = [];
  const reading = (async () => {
    for await (const chunk of stream as unknown as AsyncIterable<string>)
      chunks.push({ at: Date.now() - startedAt, text: chunk });
  })();
  await vi.advanceTimersByTimeAsync(60_000);
  await reading;
  return { text: chunks.map((c) => c.text).join(''), chunks, model };
}

const scriptLogs = (): Array<Record<string, unknown>> =>
  logInfo.mock.calls.filter((c) => c[1] === 'CRISIS_SCRIPT_READ').map((c) => c[0]);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  resetCrisisClassifierCache();
  logInfo.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('the lines these rows use, as the patterns read them', () => {
  it('reads the supply and tonight lines as the 988 script, not imminent', () => {
    for (const line of [SUPPLY_NOW, TONIGHT]) {
      const found = detectCrisis(line);
      expect(found.indicators).not.toContain('imminent_danger');
      expect(found.suggestedResponse).toBe(SEVERE);
    }
    expect(detectCrisis(PATTERN_IMMINENT).indicators).toContain('imminent_danger');
    expect(detectCrisis(SPANISH).language).toBe('es');
  });
});

describe('flag on: an imminent read of a scripted turn makes it 911-first', () => {
  it.each([SUPPLY_NOW, TONIGHT])('swaps the rest for the imminent rest: %s', async (line) => {
    const heard = await turn(line, ON, answer(IMMINENT, 300));
    expect(heard.text).toBe(SWAPPED);
    expect(heard.chunks[0]).toEqual({ at: 0, text: OPENER });
    expect(heard.text.indexOf('call 911')).toBeLessThan(heard.text.indexOf('988'));
    expect(heard.model).not.toHaveBeenCalled();
    expect(scriptLogs()).toEqual([
      { mode: 'on', read: 'imminent', outcome: 'swapped', holdMs: 1000 },
    ]);
  });

  it('adds the 911 line when the read lands while the rest is still being said', async () => {
    const heard = await turn(SUPPLY_NOW, { ...ON, ...SLOW }, answer(IMMINENT, OPENER_SAY_MS + 500));
    expect(heard.text).toBe(`${SEVERE} ${LATE_911_LINE}`);
    expect(scriptLogs()[0]).toMatchObject({ read: 'imminent', outcome: 'added' });
  });

  it('leaves the script as it is when the read lands after the rest is said', async () => {
    const late = OPENER_SAY_MS + REST_SAY_MS + 500;
    const heard = await turn(SUPPLY_NOW, { ...ON, ...SLOW }, answer(IMMINENT, late));
    expect(heard.text).toBe(SEVERE);
    expect(scriptLogs()[0]).toMatchObject({ read: 'pending', outcome: 'late' });
  });
});

describe('flag on: every other read leaves the script byte-identical to main', () => {
  it.each([
    ['none', answer(NONE, 300)],
    ['a crisis read', answer(CRISIS, 300)],
    ['imminent about someone else', answer(IMMINENT_THEM, 300)],
    ['no answer (the classifier times out)', answer('never')],
    ['a provider error', answer('throw')],
    ['an unreadable reply', answer('not json', 300)],
  ] as const)('%s', async (_name, generate) => {
    const main = await turn(SUPPLY_NOW, LIVE, generate);
    resetCrisisClassifierCache();
    const head = await turn(SUPPLY_NOW, ON, generate);
    expect(main.text).toBe(SEVERE);
    expect(head.text).toBe(main.text);
    expect(head.text).not.toContain('911');
  });

  it('a pattern alone never sends 911: "tonight" and "right now" with a none read', async () => {
    for (const line of [SUPPLY_NOW, TONIGHT]) {
      resetCrisisClassifierCache();
      expect((await turn(line, ON, answer(NONE, 50))).text).not.toContain('911');
    }
  });
});

describe('no dead air: the hold never outlasts the first sentence', () => {
  it('releases the rest by the time the first sentence could end, however slow the read', async () => {
    const heard = await turn(SUPPLY_NOW, { ...ON, ...SLOW }, answer('never'));
    expect(heard.text).toBe(SEVERE);
    expect(heard.chunks.map((c) => c.text)).toEqual([OPENER, REST]);
    expect(heard.chunks[1]!.at).toBeLessThanOrEqual(OPENER_SAY_MS);
    expect(OPENER_SAY_MS).toBeGreaterThan(0);
  });

  it("releases the rest at the classifier's deadline when that comes first", async () => {
    const heard = await turn(SUPPLY_NOW, ON, answer('never'));
    expect(heard.chunks[1]!.at).toBeLessThanOrEqual(1000);
  });

  it('releases the rest the moment a read that changes nothing lands', async () => {
    const heard = await turn(SUPPLY_NOW, { ...ON, ...SLOW }, answer(NONE, 120));
    expect(heard.chunks[1]!.at).toBeLessThan(200);
  });
});

describe('what never asks', () => {
  const asked = async (line: string, env: Record<string, string>) => {
    const generate = vi.fn(answer(IMMINENT));
    const heard = await turn(line, env, generate);
    return { heard, calls: generate.mock.calls.length };
  };

  it('flag off: the classifier never reads a scripted turn, as on main', async () => {
    const { heard, calls } = await asked(SUPPLY_NOW, LIVE);
    expect(calls).toBe(0);
    expect(heard.text).toBe(SEVERE);
    expect(scriptLogs()).toEqual([]);
  });

  it('a script the patterns already made imminent', async () => {
    const off = await asked(PATTERN_IMMINENT, LIVE);
    resetCrisisClassifierCache();
    const on = await asked(PATTERN_IMMINENT, ON);
    expect(on.calls).toBe(0);
    expect(on.heard.text).toBe(off.heard.text);
  });

  it('the Spanish script (its own floor PR)', async () => {
    const off = await asked(SPANISH, LIVE);
    resetCrisisClassifierCache();
    const on = await asked(SPANISH, ON);
    expect(on.calls).toBe(0);
    expect(on.heard.text).toBe(off.heard.text);
  });

  it.each([
    ['a guided turn', "i hope i don't wake up tomorrow"],
    ['a turn the patterns pass', 'what should i cook tonight?'],
  ])('%s gets the same gate with the flag on', (_name, line) => {
    const off = startCrisisGate(request(line), undefined, { env: LIVE, generate: answer(NONE) });
    const on = startCrisisGate(request(line), undefined, { env: ON, generate: answer(NONE) });
    expect(on?.decision).toEqual(off?.decision);
    expect(on?.read).toBeUndefined();
  });
});

describe('shadow', () => {
  it('asks, logs what it would change in counts only, and says the script as it is', async () => {
    const heard = await turn(SUPPLY_NOW, SHADOW, answer(IMMINENT, 300));
    expect(heard.text).toBe(SEVERE);
    expect(heard.chunks).toHaveLength(1);
    expect(scriptLogs()).toEqual([
      { mode: 'shadow', read: 'imminent', outcome: 'would_swap', holdMs: 1000 },
    ]);
  });

  it('counts a none read as kept', async () => {
    await turn(SUPPLY_NOW, SHADOW, answer(NONE, 300));
    expect(scriptLogs()).toEqual([{ mode: 'shadow', read: 'none', outcome: 'kept', holdMs: 1000 }]);
  });
});

describe('with CRISIS_SELF_HARM_911_LINE on (#3748)', () => {
  it('still asks the classifier on the severe self-harm script, and goes 911-first', async () => {
    // Both sides of scriptAsks (the pattern's script and getCrisisResponse) read the flag from the
    // same env today; if one side ever reads another env, this row goes red instead of #19 going quiet.
    vi.stubEnv('CRISIS_SELF_HARM_911_LINE', 'on');
    const generate = vi.fn(answer(IMMINENT, 300));
    const heard = await turn(SUPPLY_NOW, { ...ON, CRISIS_SELF_HARM_911_LINE: 'on' }, generate);
    expect(generate).toHaveBeenCalled();
    expect(heard.text.indexOf('call 911')).toBeLessThan(heard.text.indexOf('988'));
    expect(count911(heard.text)).toBe(1);
  });

  it.todo('both flags on through gatedReply, a late read: one 911 sentence, 988 kept (#3748)');
});

describe('scriptReply', () => {
  const read = (found: ScriptRead): Promise<ScriptRead> => Promise.resolve(found);
  const collect = async (stream: ReadableStream<string>): Promise<string> => {
    let out = '';
    const reading = (async () => {
      for await (const chunk of stream as unknown as AsyncIterable<string>) out += chunk;
    })();
    await vi.advanceTimersByTimeAsync(60_000);
    await reading;
    return out;
  };

  it('keeps lines added after the script (a youth line) last in the 911-first script', async () => {
    const youth = (text: string): string => `${text}\n\nYOUTH LINE`;
    const found = { read: 'imminent', imminent: true, script: IMMINENT_SCRIPT } as const;
    const out = await collect(scriptReply(youth(SEVERE), read(found), youth, ON));
    expect(out).toBe(`${SWAPPED}\n\nYOUTH LINE`);
  });

  it('no double 911: a late read adds no line when the rest already says 911 (#3748)', async () => {
    const found = { read: 'imminent', imminent: true, script: IMMINENT_SCRIPT } as const;
    const late = new Promise<ScriptRead>((resolve) => {
      setTimeout(() => resolve(found), OPENER_SAY_MS + 500);
    });
    const out = await collect(scriptReply(WITH_911, late, (t) => t, { ...ON, ...SLOW }));
    expect(out).toBe(WITH_911);
    expect(count911(out)).toBe(1);
    expect(out).toContain('988');
  });

  it('swaps as before when the rest already says 911: the imminent rest, 911 once', async () => {
    const found = { read: 'imminent', imminent: true, script: IMMINENT_SCRIPT } as const;
    const out = await collect(scriptReply(WITH_911, read(found), (t) => t, ON));
    expect(out).toBe(SWAPPED);
    expect(count911(out)).toBe(1);
    expect(out).toContain('988');
  });

  it('keeps the whole imminent script when its first sentence names a line to call', async () => {
    const leads = 'Please call 911 now. I am staying right here with you.';
    const found = { read: 'imminent', imminent: true, script: leads } as const;
    const out = await collect(scriptReply(SEVERE, read(found), (t) => t, ON));
    expect(out).toBe(`${OPENER}${leads}`);
  });
});
