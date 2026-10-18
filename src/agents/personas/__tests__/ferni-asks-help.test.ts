import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';

import {
  askBeatFor,
  callerAskFor,
  CALLS_PER_ASK,
  followLine,
  FRIEND_AFTER_CALLS,
  HELP_ASKS,
  helpAskFor,
  helpAskLine,
  helpCall,
  MAX_OFFERS,
  newHelpAskState,
} from '../ferni-asks-help.js';
import { LIFE_THREADS, threadDetailFor } from '../ferni-life-threads.js';
import { ferniStateTurn } from '../ferni-state.js';

const ON = { FERNI_STATE: 'on', FERNI_THREADS: 'on', FERNI_ASKS_HELP: 'on' };
const THREADS_ONLY = { FERNI_STATE: 'on', FERNI_THREADS: 'on' };
const ASK = /ask them for a small hand with/;
const FOLLOW = /You just asked them for a hand/;
const DAY_MS = 86_400_000;
const START = Date.parse('2026-10-19T15:00:00Z'); // every thread's first beat

/** The thread a caller hears (the same every week). */
function threadOf(userId: string) {
  const first = threadDetailFor(userId, new Date(START));
  const thread = LIFE_THREADS.find((t) => t.beats[0] === first);
  if (!thread) throw new Error('no thread');
  return thread;
}

/** A day in the week of this caller's one ask beat on their thread. */
function askDay(userId: string): Date {
  const beat = askBeatFor(userId, threadOf(userId).id) ?? 0;
  return new Date(START + (beat * 7 + 1) * DAY_MS);
}

/** The prior-call count that lands on this caller's one-in-five slot. */
function slotFor(userId: string): number {
  for (let n = FRIEND_AFTER_CALLS; n < FRIEND_AFTER_CALLS + CALLS_PER_ASK; n++)
    if (helpCall(userId, n)) return n;
  throw new Error('no slot');
}

describe('helpCall', () => {
  it('lands on exactly one call in every five for a known caller', () => {
    for (const id of ['caller-a', 'caller-b', 'caller-c']) {
      const calls = Array.from({ length: 20 }, (_, i) => FRIEND_AFTER_CALLS + i);
      const hits = calls.filter((n) => helpCall(id, n));
      expect(hits).toHaveLength(20 / CALLS_PER_ASK);
      hits.slice(1).forEach((n, i) => expect(n - (hits[i] ?? 0)).toBe(CALLS_PER_ASK));
    }
  });

  it('never asks someone he barely knows or cannot remember', () => {
    for (let n = 0; n < FRIEND_AFTER_CALLS; n++) expect(helpCall('caller-a', n)).toBe(false);
    expect(helpCall('caller-a', undefined)).toBe(false);
    for (let n = 0; n < 20; n++) expect(helpCall('anonymous', n)).toBe(false);
    expect(helpCall(undefined, 10)).toBe(false);
  });
});

describe('the written asks', () => {
  it('belong to real threads and never run past their beats', () => {
    for (const [id, asks] of Object.entries(HELP_ASKS)) {
      const thread = LIFE_THREADS.find((t) => t.id === id);
      expect(thread, id).toBeDefined();
      expect(asks.length).toBeLessThanOrEqual(thread?.beats.length ?? 0);
    }
  });

  it('match a beat to its ask, and nothing to a fixed day detail', () => {
    const plant = LIFE_THREADS.find((t) => t.id === 'jade-plant');
    expect(helpAskFor(plant?.beats[0] ?? '')?.ask).toMatch(/name for the jade plant/);
    expect(helpAskFor(plant?.beats[4] ?? '')).toBeUndefined();
    expect(helpAskFor('you found a good parking spot')).toBeUndefined();
  });

  it('are small, with no em dash or ellipsis, and name only his own people', () => {
    const asks = Object.values(HELP_ASKS).flatMap((a) => a.filter((x) => x !== undefined));
    const canon = ['Scott', 'Ken', 'Dermot', 'Japan', 'Tokyo', 'Alps'];
    for (const { ask } of asks) {
      expect(ask).not.toMatch(/—|…|\.\.\./);
      expect(ask.split(/\s+/).length).toBeLessThanOrEqual(25);
      const names = ask.match(/\b[A-Z][a-z]+\b/g) ?? [];
      expect(names.filter((n) => !canon.includes(n))).toEqual([]);
    }
    for (const help of asks) expect(followLine(help)).not.toMatch(/—|…|\.\.\./);
  });

  it('no hint has a bracket inside it, since nothing strips brackets before speech', () => {
    const asks = Object.values(HELP_ASKS).flatMap((a) => a.filter((x) => x !== undefined));
    const inner = (note: string) => note.replace(/^\[/, '').replace(/\]$/, '');
    for (const help of asks) {
      expect(inner(followLine(help))).not.toMatch(/[[\]]/);
      expect(help.sayBack.toLowerCase()).toContain(help.heard.toLowerCase());
    }
    const userData = { services: { userProfile: { totalConversations: slotFor('caller-a') } } };
    const plant = LIFE_THREADS.find((t) => t.id === 'jade-plant');
    const beat = plant?.beats[askBeatFor('caller-a', 'jade-plant') ?? 0] ?? '';
    const line = helpAskLine(
      { detail: beat, replies: ['a', 'b'], ownStory: true, userId: 'caller-a', userData, env: ON },
      newHelpAskState()
    );
    expect(line).toMatch(ASK);
    expect(inner(line)).not.toMatch(/[[\]]/);
  });

  it('say an answer back in the words of their own ask', () => {
    const plant = HELP_ASKS['jade-plant']?.[0];
    const book = HELP_ASKS.book?.[0];
    expect(plant && followLine(plant)).toContain('the jade plant is Pickle now');
    expect(book && followLine(book)).toContain('The book is Third of Seven now');
    expect(book && followLine(book)).not.toMatch(/jade plant/);
  });
});

describe('one ask per thread per caller', () => {
  it('asks each caller on one beat of a thread only, a beat that has an ask', () => {
    const plant = LIFE_THREADS.find((t) => t.id === 'jade-plant');
    for (const id of ['caller-a', 'caller-b', 'caller-c', 'caller-d']) {
      const beat = askBeatFor(id, 'jade-plant') ?? -1;
      expect(HELP_ASKS['jade-plant']?.[beat]).toBeDefined();
      const asked = (plant?.beats ?? []).filter((b) => callerAskFor(id, b));
      expect(asked).toEqual([plant?.beats[beat]]);
    }
  });

  it('spreads callers over the beats', () => {
    const beats = new Set(Array.from({ length: 30 }, (_, i) => askBeatFor(`caller-${i}`, 'book')));
    expect(beats.size).toBeGreaterThan(1);
  });
});

describe('helpAskLine', () => {
  const userId = 'caller-a';
  const plantBeat =
    LIFE_THREADS.find((t) => t.id === 'jade-plant')?.beats[askBeatFor(userId, 'jade-plant') ?? 0] ??
    '';
  const userData = { services: { userProfile: { totalConversations: slotFor(userId) } } };
  const turn = (replies: string[], ownStory = true, env: Record<string, string> = ON) => ({
    detail: plantBeat,
    replies,
    ownStory,
    userId,
    userData,
    env,
  });

  it('offers the ask on a light turn, at most twice a call', () => {
    const state = newHelpAskState();
    expect(helpAskLine(turn(['a', 'b']), state)).toMatch(ASK);
    expect(helpAskLine(turn(['a', 'b', 'c']), state)).toMatch(ASK);
    expect(state.offeredAt).toHaveLength(MAX_OFFERS);
    expect(helpAskLine(turn(['a', 'b', 'c', 'd']), state)).toBe('');
  });

  it('waits when a story of his own may not ride the reply', () => {
    expect(helpAskLine(turn(['a', 'b'], false), newHelpAskState())).toBe('');
  });

  it('once he has asked, the next turn takes their answer, once', () => {
    const state = newHelpAskState();
    helpAskLine(turn(['a', 'b']), state);
    const asked = ['a', 'b', 'Can I ask you something? Help me name this plant?'];
    expect(helpAskLine(turn(asked, false), state)).toMatch(FOLLOW);
    expect(helpAskLine(turn([...asked, 'Pickle it is.'], true), state)).toBe('');
  });

  it('a plain request without a question mark is his ask too', () => {
    const state = newHelpAskState();
    helpAskLine(turn(['a', 'b']), state);
    const asked = ['a', 'b', 'Help me name this plant, I am out of ideas.'];
    expect(helpAskLine(turn(asked, false), state)).toMatch(FOLLOW);
  });

  it('a later question about their life with his topic word is not his ask', () => {
    const state = newHelpAskState();
    helpAskLine(turn(['a', 'b']), state);
    // He skipped the ask, then the caller mentions their own plants.
    const replies = ['a', 'b', 'Ha, that sounds like a good morning.'];
    expect(helpAskLine(turn(replies, false), state)).toBe('');
    const later = [...replies, 'How is the plant on your desk doing?'];
    expect(helpAskLine(turn(later, false), state)).toBe('');
    expect(state.followed).toBe(false);
  });

  it('a question about their own trip right after the offer is not his ask', () => {
    const japan = LIFE_THREADS.find((t) => t.id === 'japan-siblings');
    const id = Array.from({ length: 50 }, (_, i) => `caller-${i}`).find(
      (c) => askBeatFor(c, 'japan-siblings') !== undefined
    );
    const beat = japan?.beats[askBeatFor(id ?? '', 'japan-siblings') ?? 0] ?? '';
    const data = { services: { userProfile: { totalConversations: slotFor(id ?? '') } } };
    const t = (replies: string[]) => ({
      detail: beat,
      replies,
      ownStory: true,
      userId: id,
      userData: data,
      env: ON,
    });
    const state = newHelpAskState();
    expect(helpAskLine(t(['a', 'b']), state)).toMatch(ASK);
    expect(helpAskLine(t(['a', 'b', 'Oh nice, how was the trip you just took?']), state)).toMatch(
      ASK
    );
    expect(state.followed).toBe(false);
  });

  it('a reply that skipped the ask gets one more offer, then none', () => {
    const state = newHelpAskState();
    expect(helpAskLine(turn(['a', 'b']), state)).toMatch(ASK);
    const skipped = ['a', 'b', 'The plant has a new leaf. How was your day?'];
    expect(helpAskLine(turn(skipped), state)).toMatch(ASK);
    expect(helpAskLine(turn([...skipped, 'Nice.']), state)).toBe('');
    expect(state.followed).toBe(false);
  });

  it('a question before the offer is not his ask', () => {
    const state = newHelpAskState();
    const line = helpAskLine(turn(['How is your plant doing?', 'b']), state);
    expect(line).toMatch(ASK);
  });

  it('off (default), says nothing', () => {
    expect(helpAskLine(turn(['a', 'b'], true, THREADS_ONLY), newHelpAskState())).toBe('');
  });
});

/** A call where Ferni has already replied twice, plainly, and the caller is chatting lightly. */
function lightCall(...said: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'user', content: 'Hey Ferni.' });
  ctx.addMessage({ role: 'assistant', content: 'Hey, good to hear you. How was the morning?' });
  ctx.addMessage({ role: 'user', content: 'Pretty good.' });
  ctx.addMessage({ role: 'assistant', content: 'Good. What did you get up to?' });
  for (const s of said) ctx.addMessage({ role: 'user', content: s });
  return ctx;
}

describe('ferniStateTurn with FERNI_ASKS_HELP', () => {
  const sessionFor = (userId: string, totalConversations: number) => ({
    userData: {
      personaId: 'ferni',
      userId,
      services: { sessionId: `s-${Math.random()}`, userProfile: { totalConversations } },
    },
  });

  // Callers on each of the four threads, at their one-in-five call.
  const callers = Array.from({ length: 12 }, (_, i) => `friend-${i}`);

  it('on, a friend on their call hears the ask in the self-share slot', () => {
    const lines = callers.map(
      (id) =>
        ferniStateTurn(lightCall('Just a slow afternoon.'), sessionFor(id, slotFor(id)), {
          now: askDay(id),
          env: ON,
        }).last
    );
    expect(lines.every((l) => ASK.test(l))).toBe(true);
    expect(new Set(callers.map((id) => threadOf(id).id)).size).toBe(LIFE_THREADS.length);
  });

  it("on, a friend on another week of their thread isn't asked again", () => {
    const lines = callers.map((id) => {
      const other = new Date(
        askDay(id).getTime() + 7 * DAY_MS * (askBeatFor(id, threadOf(id).id) === 0 ? 1 : -1)
      );
      return ferniStateTurn(lightCall('Just a slow afternoon.'), sessionFor(id, slotFor(id)), {
        now: other,
        env: ON,
      }).last;
    });
    expect(lines.some((l) => ASK.test(l))).toBe(false);
  });

  it('on, takes the answer after he asked', () => {
    const id = 'friend-1';
    const session = sessionFor(id, slotFor(id));
    const first = lightCall('Just a slow afternoon.');
    const now = askDay(id);
    expect(ferniStateTurn(first, session, { now, env: ON }).last).toMatch(ASK);
    // Names every thread's topic, so it is his ask whichever thread this caller is on.
    first.addMessage({
      role: 'assistant',
      content: 'Can you help me out with the plant, the book, the trip or the ski week?',
    });
    first.addMessage({ role: 'user', content: 'Sure, go with Pickle.' });
    const help = callerAskFor(id, threadDetailFor(id, now) ?? '');
    expect(help).toBeDefined();
    expect(ferniStateTurn(first, session, { now, env: ON }).last).toContain(
      help ? followLine(help) : 'missing'
    );
  });

  it('on, a new caller or an off-slot call never hears it', () => {
    const id = 'friend-2';
    const off = slotFor(id) + 1;
    for (const total of [0, 2, off]) {
      const { last } = ferniStateTurn(lightCall('Just a slow afternoon.'), sessionFor(id, total), {
        now: askDay(id),
        env: ON,
      });
      expect(last).not.toMatch(ASK);
    }
  });

  it('on, never when the caller needs him', () => {
    const id = 'friend-3';
    const { last } = ferniStateTurn(
      lightCall('My dad just died this morning.'),
      sessionFor(id, slotFor(id)),
      { now: askDay(id), env: ON }
    );
    expect(last).not.toMatch(ASK);
  });

  it('off (default), the friend on their call hears no ask', () => {
    const id = 'friend-4';
    const { last } = ferniStateTurn(
      lightCall('Just a slow afternoon.'),
      sessionFor(id, slotFor(id)),
      {
        now: askDay(id),
        env: THREADS_ONLY,
      }
    );
    expect(last).not.toMatch(ASK);
  });
});
