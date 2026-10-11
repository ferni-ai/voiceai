import { afterEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { gatedReply } from '../crisis-gate.js';
import { OpenerGate } from '../opener-gate.js';
import { PLAIN_SIGNALS, type TurnSignals } from '../turn-extras.js';
import {
  BURST_EVERY,
  BURSTS,
  burstAllowed,
  burstLine,
  leadingBurst,
  noteSpokenReply,
  tapSpokenBursts,
  withoutBurst,
  withRenderedBurst,
} from '../vocal-bursts.js';

const ON = { VOCAL_BURSTS: 'on' };
const LIGHT: TurnSignals = { ...PLAIN_SIGNALS, careful: false };
const always = (): number => 0;

afterEach(() => vi.unstubAllEnvs());

describe('leadingBurst', () => {
  it('finds each written form at the start of a reply, past markup', () => {
    for (const b of BURSTS) {
      expect(leadingBurst(`${b.written} go on.`)?.burst.id).toBe(b.id);
    }
    expect(leadingBurst('<emotion value="sad"/>Ugh, I hate that.')?.lead).toBe(
      '<emotion value="sad"/>'
    );
  });

  it('only matches whole words', () => {
    expect(leadingBurst('Ohio was fun.')).toBeNull();
    expect(leadingBurst('Heather called.')).toBeNull();
    expect(leadingBurst('Tchaikovsky, really?')).toBeNull();
    expect(leadingBurst('Phewww')).toBeNull();
    expect(leadingBurst('I said hmm, then left.')).toBeNull();
  });

  it('marks the spellings Cartesia misrenders', () => {
    expect(leadingBurst('*sigh* okay.')).toMatchObject({ misrendered: true });
    expect(leadingBurst('Awww, sweet.')).toMatchObject({ misrendered: true });
    expect(leadingBurst("Tsk tsk, that's not fair.")).toMatchObject({ misrendered: true });
    expect(leadingBurst('[gasp] No way!')).toMatchObject({ misrendered: true });
    expect(leadingBurst('Aww, sweet.')).toMatchObject({ misrendered: false });
  });
});

describe('withRenderedBurst / withoutBurst', () => {
  const render = (text: string, env = {}) => withRenderedBurst(text, leadingBurst(text)!, env);

  it('rewrites a misrendering spelling to the written form, keeping markup', () => {
    expect(render('*yawn* sorry, long day.')).toBe('Aaahhh, sorry, long day.');
    expect(render('Awww, that is sweet.')).toBe('Aww, that is sweet.');
    expect(render("Tsk tsk, that's not fair.")).toBe("Tch, that's not fair.");
    expect(render('<emotion value="sad"/>[sigh] okay.')).toBe('<emotion value="sad"/>Haah, okay.');
  });

  it('leaves a spelling that renders, and a sigh cue the speech director renders', () => {
    expect(render('Oof, rough.')).toBe('Oof, rough.');
    const director = { SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_NONVERBAL: 'live' };
    expect(render('*sigh* okay.', director)).toBe('*sigh* okay.');
  });

  it('drops the burst, unless nothing would be left', () => {
    expect(withoutBurst('Eek, that is rough.', leadingBurst('Eek, that is rough.')!)).toBe(
      'that is rough.'
    );
    expect(withoutBurst('Hmm.', leadingBurst('Hmm.')!)).toBe('Hmm.');
  });
});

describe('burstLine', () => {
  it('is empty and draws nothing with the flag off', () => {
    const rng = vi.fn(always);
    expect(burstLine({}, LIGHT, rng, {})).toBe('');
    expect(rng).not.toHaveBeenCalled();
  });

  it('invites one, listing every written form, on a light turn', () => {
    const line = burstLine({}, LIGHT, always, ON);
    for (const b of BURSTS) expect(line).toContain(`"${b.written}"`);
  });

  it('never invites on a careful, support-first or look-up turn', () => {
    const rng = vi.fn(always);
    expect(burstLine({}, { ...LIGHT, careful: true }, rng, ON)).toBe('');
    expect(burstLine({}, { ...LIGHT, supportFirst: true }, rng, ON)).toBe('');
    expect(burstLine({}, { ...LIGHT, move: 'lookup' }, rng, ON)).toBe('');
    expect(rng).not.toHaveBeenCalled();
  });

  it('invites on only some turns', () => {
    expect(burstLine({}, LIGHT, () => 0.99, ON)).toBe('');
  });

  it('waits BURST_EVERY replies after one was spoken', () => {
    const session = {};
    noteSpokenReply(session, 'Ugh, I hate that.');
    const invited: boolean[] = [];
    for (let i = 0; i < BURST_EVERY; i++) {
      invited.push(burstLine(session, LIGHT, always, ON) !== '');
      noteSpokenReply(session, 'That makes sense.');
    }
    expect(invited).toEqual([...Array(BURST_EVERY - 1).fill(false), true]);
  });
});

describe('burstAllowed', () => {
  it('follows the invitation, never with crisis guidance, undefined with the flag off', () => {
    const session = {};
    expect(burstAllowed(session, false, {})).toBeUndefined();
    expect(burstAllowed(session, false, ON)).toBe(false);
    burstLine(session, LIGHT, always, ON);
    expect(burstAllowed(session, false, ON)).toBe(true);
    expect(burstAllowed(session, true, ON)).toBe(false);
  });
});

describe('OpenerGate with bursts', () => {
  it('keeps an invited burst in the spelling that renders', () => {
    const gate = new OpenerGate(3, false);
    expect(gate.decide('Awww, that is so sweet.', false, true)).toBe('Aww, that is so sweet.');
    // ...and it counts as the opener kept: the next stock word goes.
    expect(gate.decide('Oh, nice.')).toBe('Nice.');
  });

  it('drops a burst that was not invited, even one the stock list misses', () => {
    expect(new OpenerGate(3, false).decide("Eek, that's rough.", false, false)).toBe(
      "That's rough."
    );
  });

  it('drops an invited burst when a turn-opening clip already reacted', () => {
    expect(new OpenerGate(3, false).decide('Awww, that is so sweet.', true, true)).toBe(
      'That is so sweet.'
    );
  });

  it('is unchanged with the flag off', () => {
    expect(new OpenerGate(3, false).decide("Eek, that's rough.")).toBe("Eek, that's rough.");
  });
});

describe('tapSpokenBursts', () => {
  const played = async (session: object, chunks: string[], env = ON) => {
    const out: string[] = [];
    const stream = new ReadableStream<string>({
      start(c) {
        for (const chunk of chunks) c.enqueue(chunk);
        c.close();
      },
    });
    for await (const chunk of tapSpokenBursts(
      stream,
      session,
      undefined,
      env
    ) as AsyncIterable<string>)
      out.push(chunk);
    return out;
  };

  it('passes the text through and counts the burst the reply opened with', async () => {
    const session = {};
    const heard = vi.fn();
    const stream = new ReadableStream<string>({
      start(c) {
        c.enqueue('[laugh');
        c.enqueue('ter] okay, you got me.');
        c.close();
      },
    });
    const out: string[] = [];
    for await (const chunk of tapSpokenBursts(stream, session, heard, ON) as AsyncIterable<string>)
      out.push(chunk);
    expect(out.join('')).toBe('[laughter] okay, you got me.');
    expect(heard).toHaveBeenCalledWith(expect.objectContaining({ id: 'laugh' }), '[laughter]');
    // The cooldown started: no invitation on the next reply.
    expect(burstLine(session, LIGHT, always, ON)).toBe('');
  });

  it('notes a long reply once, from its opening', async () => {
    const heard = vi.fn();
    const session = {};
    const chunks = ['Hmm, that', "'s a tough one, let me think ", 'about it for a sec. Hmm, okay.'];
    const stream = new ReadableStream<string>({
      start(c) {
        for (const chunk of chunks) c.enqueue(chunk);
        c.close();
      },
    });
    for await (const _ of tapSpokenBursts(stream, session, heard, ON) as AsyncIterable<string>);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith(expect.objectContaining({ id: 'think' }), 'Hmm,');
  });

  it('counts plain replies toward the cooldown', async () => {
    const session = {};
    noteSpokenReply(session, 'Hmm, tough one.');
    for (let i = 0; i < BURST_EVERY - 1; i++) await played(session, ['That makes sense.']);
    expect(burstLine(session, LIGHT, always, ON)).not.toBe('');
  });

  it('is the same stream with the flag off', async () => {
    const stream = new ReadableStream<string>();
    expect(tapSpokenBursts(stream, {}, undefined, {})).toBe(stream);
  });
});

describe('gatedReply with VOCAL_BURSTS=on', () => {
  const streamOf = (text: string) =>
    new ReadableStream<unknown>({
      start(c) {
        c.enqueue(text);
        c.close();
      },
    });
  const ask = async (
    said: string,
    env: Record<string, string>,
    generate?: Parameters<typeof gatedReply>[4] extends infer O
      ? O extends { generate?: infer G }
        ? G
        : never
      : never
  ) => {
    const session = { userData: undefined };
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'user', content: said });
    const requests: string[] = [];
    const model = async (c: llm.ChatContext) => {
      requests.push(c.items.map((i) => (i as llm.ChatMessage).textContent ?? '').join(' '));
      return streamOf('Awww, that is so sweet.');
    };
    const out: string[] = [];
    const gate = new OpenerGate(3, false);
    const reply = await gatedReply(ctx, session, model as never, gate, { env, generate });
    for await (const chunk of reply as unknown as AsyncIterable<string>) out.push(chunk);
    return {
      invited: requests[0]?.includes('small sound a friend would make') ?? false,
      said: out.join(''),
      asked: requests.length,
    };
  };

  it('keeps the burst exactly when the request invited one', async () => {
    vi.stubEnv('VOCAL_BURSTS', 'on');
    const env = { ...ON, CRISIS_GUARD_MODE: 'off' };
    const runs = await Promise.all(
      Array.from({ length: 30 }, (_, i) => ask(`my daughter made me breakfast ${i}`, env))
    );
    const invited = runs.filter((r) => r.invited);
    expect(invited.length).toBeGreaterThan(0);
    expect(invited.length).toBeLessThan(runs.length);
    for (const r of runs) {
      expect(r.said).toBe(r.invited ? 'Aww, that is so sweet.' : 'That is so sweet.');
    }
  });

  it('drops an invited burst when the classifier escalates to crisis guidance', async () => {
    vi.stubEnv('VOCAL_BURSTS', 'on');
    const env = { ...ON, CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
    const crisis = async () => '{"risk":"crisis","subject":"self"}';
    const runs = await Promise.all(
      Array.from({ length: 30 }, (_, i) => ask(`my daughter made me breakfast ${i}`, env, crisis))
    );
    expect(runs.some((r) => r.invited)).toBe(true);
    for (const r of runs) expect(r).toMatchObject({ asked: 2, said: 'That is so sweet.' });
  });

  it('never invites or keeps one when the caller is venting', async () => {
    vi.stubEnv('VOCAL_BURSTS', 'on');
    const env = { ...ON, CRISIS_GUARD_MODE: 'off' };
    for (let i = 0; i < 10; i++) {
      expect(await ask(`I'm so stressed and exhausted ${i}`, env)).toMatchObject({
        invited: false,
        said: 'That is so sweet.',
      });
    }
  });
});
