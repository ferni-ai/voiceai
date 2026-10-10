import { afterEach, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';

import { gatedReply } from '../crisis-gate.js';
import {
  carriesWeight,
  Deliberator,
  EXPIRY_TURNS,
  estimateTokens,
  formatThought,
  JUST_SAID_FIRST,
  MAX_NOTE_TOKENS,
  parseThought,
  setDeliberator,
  SPACING_TURNS,
  type ThinkFn,
  type Thought,
} from '../deliberation.js';
import { Director, DIRECTOR_SYSTEM, setDirector, type Line } from '../director-notes.js';
import type { Understanding } from '../turn-understanding.js';

const WEIGHTY =
  "I got the offer in Denver, it's more money and the job I always said I wanted, but my mom just moved in with us and I keep putting off telling her.";
const SMALL_TALK = 'Yeah, ha, totally.';
const NOTE = 'He keeps saying "putting off" about his mom, never about the job itself.';

const THOUGHT_JSON = JSON.stringify({
  kind: 'connection',
  note: NOTE,
  confidence: 0.8,
  whyNow: 'the decision hangs on her',
  doNotUseIf: 'they are venting about work',
});

const exchange = (said: string, reply = 'Huh, Denver.'): Line[] => [
  { speaker: 'user', text: said },
  { speaker: 'ferni', text: reply },
];

const thinking = (reply = THOUGHT_JSON): ReturnType<typeof vi.fn<ThinkFn>> =>
  vi.fn<ThinkFn>(async () => ({ text: reply, usage: { promptTokenCount: 900 } }));

/** A deliberator holding one ready thought. */
async function withThought(think = thinking()): Promise<Deliberator> {
  const d = new Deliberator({ sessionId: 's', think });
  await d.observe(exchange(WEIGHTY), null);
  return d;
}

describe('parseThought', () => {
  it('keeps one confident, grounded thought', () => {
    expect(parseThought(THOUGHT_JSON)).toMatchObject({ kind: 'connection', note: NOTE });
  });

  it('drops none, unsure, labels, overlong and malformed replies', () => {
    const t = (o: object) =>
      JSON.stringify({ kind: 'insight', note: 'x y', confidence: 0.9, ...o });
    expect(parseThought('{"kind":"none"}')).toBeNull();
    expect(parseThought(t({ confidence: 0.4 }))).toBeNull();
    expect(parseThought(t({ note: 'Sounds like classic burnout, maybe depression.' }))).toBeNull();
    expect(parseThought(t({ note: 'word '.repeat(40) }))).toBeNull();
    expect(parseThought(t({ kind: 'advice' }))).toBeNull();
    expect(parseThought('not json')).toBeNull();
    expect(parseThought(t({}))).not.toBeNull();
  });
});

describe('formatThought', () => {
  it('stays within the token budget, and says never to announce the background thinking', () => {
    const long: Thought = {
      kind: 'reframe',
      note: 'a'.repeat(150),
      confidence: 0.9,
      whyNow: '',
      doNotUseIf: 'b'.repeat(200),
    };
    for (const t of [long, parseThought(THOUGHT_JSON)!]) {
      const line = formatThought(t);
      expect(estimateTokens(line)).toBeLessThanOrEqual(MAX_NOTE_TOKENS);
      expect(line).toContain(t.note);
      expect(line).toMatch(/never say you thought it over in the background/);
    }
    expect(formatThought(parseThought(THOUGHT_JSON)!)).toContain('Not if they are venting');
  });
});

describe('carriesWeight', () => {
  const u = (o: Partial<Understanding>): Understanding => ({
    move: 'share',
    needsTool: false,
    mood: 'neutral',
    laughed: false,
    laughFits: false,
    adviceFits: false,
    wantsToEnd: false,
    reaction: null,
    ...o,
  });

  it('fires on a real share or a decision, not small talk, look-ups or hard news', () => {
    expect(carriesWeight(WEIGHTY, null)).toBe(true);
    expect(carriesWeight('Should I tell my sister I saw her ex last night?', null)).toBe(true);
    expect(carriesWeight(SMALL_TALK, null)).toBe(false);
    expect(carriesWeight('Not much, just got home from the store.', null)).toBe(false);
    expect(carriesWeight("What's the weather going to be like tomorrow in Denver?", null)).toBe(
      false
    );
    expect(carriesWeight('My dad is in the hospital, they think it was a stroke.', null)).toBe(
      false
    );
  });

  it("follows the model's reading when there is one", () => {
    expect(carriesWeight(WEIGHTY, u({ needsTool: true }))).toBe(false);
    expect(carriesWeight(WEIGHTY, u({ mood: 'bad_news' }))).toBe(false);
    expect(carriesWeight(WEIGHTY, u({ move: 'ack' }))).toBe(false);
    expect(
      carriesWeight('I keep thinking about what she said last night.', u({ mood: 'tender' }))
    ).toBe(true);
  });
});

describe('Deliberator', () => {
  it('thinks only after a weighty turn, and sends the call and what Ferni remembers', async () => {
    const think = thinking();
    const d = new Deliberator({ sessionId: 's', think });
    await d.observe(exchange(SMALL_TALK), null);
    expect(think).not.toHaveBeenCalled();
    await d.observe(exchange(WEIGHTY), null, 'Mom moved in last month.');
    expect(think).toHaveBeenCalledTimes(1);
    const prompt = think.mock.calls[0]![1];
    expect(prompt).toContain('Mom moved in last month.');
    expect(prompt).toContain('Denver');
  });

  it('offers a thought once: the same turn asked again gets it, the next turn never does', async () => {
    const d = await withThought();
    const line = d.noteFor('So anyway, I', false);
    expect(line).toContain(NOTE);
    // The final request for the same turn extends the preemptive one's words.
    expect(d.noteFor('So anyway, I told my boss today.', false)).toBe(line);
    void d.observe(exchange('So anyway, I told my boss today.'), null);
    expect(d.noteFor('What do you think?', false)).toBe('');
    await d.observe(exchange(SMALL_TALK), null);
    // An offered thought is spent, not left to count as expired.
    expect(d.summary()).toMatchObject({ offered: 1, expired: 0 });
  });

  it('expires a thought left unused for two turns', async () => {
    const d = await withThought();
    for (let i = 0; i < EXPIRY_TURNS; i++) {
      expect(d.noteFor(`busy turn ${i}`, true)).toBe(''); // held (they were venting)
      await d.observe(exchange(SMALL_TALK), null);
    }
    expect(d.noteFor('ok, calmer now', false)).toBe('');
    expect(d.summary()).toMatchObject({ offered: 0, expired: 1 });
  });

  it(`offers at most one thought every ${SPACING_TURNS} turns`, async () => {
    const d = await withThought();
    expect(d.noteFor('turn one', false)).not.toBe('');
    const offered: string[] = [];
    for (let i = 2; i <= 6; i++) {
      await d.observe(exchange(WEIGHTY), null); // a fresh thought is ready whenever allowed
      if (d.noteFor(`turn ${i}`, false)) offered.push(`turn ${i}`);
    }
    expect(offered).toEqual(['turn 4']);
  });

  it('a slow deliberation offers nothing and holds nothing up', async () => {
    const never = vi.fn<ThinkFn>(async () => new Promise(() => {}));
    const d = new Deliberator({ sessionId: 's', think: never });
    const work = d.observe(exchange(WEIGHTY), null);
    expect(d.noteFor('next turn', false)).toBe('');
    const settled = await Promise.race([work.then(() => 'done'), Promise.resolve('pending')]);
    expect(settled).toBe('pending');
  });

  it('gives up on a deliberation past its time budget', async () => {
    const never = vi.fn<ThinkFn>(async () => new Promise(() => {}));
    const d = new Deliberator({ sessionId: 's', think: never, timeoutMs: 20 });
    await d.observe(exchange(WEIGHTY), null);
    expect(d.summary()).toMatchObject({ runs: 1, failed: 1 });
    expect(d.noteFor('next turn', false)).toBe('');
  });

  it('a crisis drops the thought, and one that lands during the hold is never offered', async () => {
    const d = await withThought();
    d.hold();
    expect(d.noteFor('next turn', false)).toBe('');

    let finish: (r: { text: string }) => void = () => undefined;
    const late = new Deliberator({
      sessionId: 's',
      think: async () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const work = late.observe(exchange(WEIGHTY), null);
    late.hold();
    finish({ text: THOUGHT_JSON });
    await work;
    expect(late.noteFor('during the hold', false)).toBe('');
    for (let i = 0; i < 4; i++) await late.observe(exchange(SMALL_TALK), null);
    expect(late.noteFor('much later', false)).toBe('');
  });
});

describe('on the live reply path (gatedReply)', () => {
  const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
  const sessions: object[] = [];
  afterEach(() => sessions.splice(0).forEach((s) => setDeliberator(s, null)));

  const sessionWith = (d: Deliberator) => {
    const session = { userData: undefined };
    setDeliberator(session, d);
    sessions.push(session);
    return session;
  };
  const request = (said: string): llm.ChatContext => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    ctx.addMessage({ role: 'user', content: WEIGHTY });
    ctx.addMessage({ role: 'assistant', content: 'Huh, Denver.' });
    ctx.addMessage({ role: 'user', content: said });
    return ctx;
  };
  const model = () =>
    vi.fn(
      async (_ctx: llm.ChatContext) =>
        new ReadableStream<unknown>({
          start(c) {
            c.enqueue('ok');
            c.close();
          },
        })
    );
  const sent = (m: ReturnType<typeof model>): string =>
    m.mock.calls
      .map((call) => call[0].items.map((i) => (i as llm.ChatMessage).textContent ?? '').join('\n'))
      .join('\n');
  const opener = { wrap: (s: ReadableStream<unknown>) => s };
  const reply = (said: string, session: object, m: ReturnType<typeof model>) =>
    gatedReply(request(said), session as never, m as never, opener as never, {
      env: PATTERNS_ONLY,
    });

  it("carries a ready thought in the next reply's request, once", async () => {
    const session = sessionWith(await withThought());
    const first = model();
    await reply('Anyway, how was your weekend?', session, first);
    expect(sent(first)).toContain(NOTE);
    const second = model();
    await reply('Ha, nice. What did you cook?', session, second);
    expect(sent(second)).not.toContain(NOTE);
  });

  it("agrees with the director: Ferni never gets the director's no-going-back rule, and both put their new words first", async () => {
    const session = sessionWith(await withThought());
    const director = new Director({
      sessionId: 's',
      writer: async () => 'Denver came up fast; he sounds proud of the offer.',
    });
    await director.observe(exchange(WEIGHTY));
    setDirector(session, director);
    const m = model();
    await reply('Anyway, how was your weekend?', session, m);
    setDirector(session, null);
    const text = sent(m);
    // Both notes reach the same request...
    expect(text).toContain('[Director: Denver came up fast');
    expect(text).toContain(NOTE);
    // ...the director's rule is for the director, not for Ferni...
    expect(DIRECTOR_SYSTEM).toContain('never send him back to an earlier line');
    expect(text).not.toMatch(/never send him back|earlier line/);
    // ...and a connection to an earlier line keeps the director's precedence.
    expect(DIRECTOR_SYSTEM).toContain('what they say next comes first');
    expect(text).toContain(JUST_SAID_FIRST);
  });

  it('never waits for a deliberation still running', async () => {
    const d = new Deliberator({ sessionId: 's', think: async () => new Promise(() => {}) });
    void d.observe(exchange(WEIGHTY), null);
    const session = sessionWith(d);
    const m = model();
    const out = await Promise.race([
      reply('Anyway, how was your weekend?', session, m).then(() => 'replied'),
      new Promise((resolve) => {
        setTimeout(() => resolve('waited'), 200);
      }),
    ]);
    expect(out).toBe('replied');
    expect(m).toHaveBeenCalledTimes(1);
    expect(sent(m)).not.toContain('On your mind');
  });

  it('gives a crisis turn no thought, and drops the one it held', async () => {
    const session = sessionWith(await withThought());
    const crisis = model();
    await reply("I hope I don't wake up tomorrow", session, crisis);
    expect(sent(crisis)).not.toContain(NOTE);
    const after = model();
    await reply('Okay. Thanks for listening.', session, after);
    expect(sent(after)).not.toContain(NOTE);
  });

  it('gives no thought while they are venting or after hard news', async () => {
    const venting = model();
    await reply(
      "Ugh, I'm so stressed and exhausted, everything went wrong today.",
      sessionWith(await withThought()),
      venting
    );
    expect(sent(venting)).not.toContain(NOTE);

    const session = sessionWith(await withThought());
    const news = model();
    await reply('My dad is in the hospital, they think it was a stroke.', session, news);
    expect(sent(news)).not.toContain(NOTE);
    const next = model();
    await reply('Can you just tell me something funny?', session, next);
    expect(sent(next)).not.toContain(NOTE);
  });
});
