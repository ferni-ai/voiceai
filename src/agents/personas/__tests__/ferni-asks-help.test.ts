import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';

import {
  CALLS_PER_ASK,
  FOLLOW_LINE,
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
const NOW = new Date('2026-10-27T15:00:00Z'); // every thread's second beat, all with an ask
const ASK = /ask them for a small hand with/;

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
    expect(FOLLOW_LINE).not.toMatch(/—|…|\.\.\./);
  });
});

describe('helpAskLine', () => {
  const plantBeat = LIFE_THREADS.find((t) => t.id === 'jade-plant')?.beats[0] ?? '';
  const userId = 'caller-a';
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
    expect(state.offers).toBe(MAX_OFFERS);
    expect(helpAskLine(turn(['a', 'b', 'c', 'd']), state)).toBe('');
  });

  it('waits when a story of his own may not ride the reply', () => {
    expect(helpAskLine(turn(['a', 'b'], false), newHelpAskState())).toBe('');
  });

  it('once he has asked, the next turn takes their answer, once', () => {
    const state = newHelpAskState();
    helpAskLine(turn(['a', 'b']), state);
    const asked = ['a', 'b', 'Can I ask you something? Help me name this plant?'];
    expect(helpAskLine(turn(asked, false), state)).toBe(FOLLOW_LINE);
    expect(helpAskLine(turn([...asked, 'Pickle it is.'], true), state)).toBe('');
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
          now: NOW,
          env: ON,
        }).last
    );
    expect(lines.every((l) => ASK.test(l))).toBe(true);
  });

  it('on, takes the answer after he asked', () => {
    const id = 'friend-1';
    const session = sessionFor(id, slotFor(id));
    const first = lightCall('Just a slow afternoon.');
    expect(ferniStateTurn(first, session, { now: NOW, env: ON }).last).toMatch(ASK);
    expect(helpAskFor(threadDetailFor(id, NOW) ?? '')).toBeDefined();
    // Names every thread's topic, so it is his ask whichever thread this caller is on.
    first.addMessage({
      role: 'assistant',
      content: 'Can you help me out with the plant, the book, the trip or the ski week?',
    });
    first.addMessage({ role: 'user', content: 'Sure, go with Pickle.' });
    expect(ferniStateTurn(first, session, { now: NOW, env: ON }).last).toContain(FOLLOW_LINE);
  });

  it('on, a new caller or an off-slot call never hears it', () => {
    const id = 'friend-2';
    const off = slotFor(id) + 1;
    for (const total of [0, 2, off]) {
      const { last } = ferniStateTurn(lightCall('Just a slow afternoon.'), sessionFor(id, total), {
        now: NOW,
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
      { now: NOW, env: ON }
    );
    expect(last).not.toMatch(ASK);
  });

  it('off (default), the friend on their call hears no ask', () => {
    const id = 'friend-4';
    const { last } = ferniStateTurn(
      lightCall('Just a slow afternoon.'),
      sessionFor(id, slotFor(id)),
      {
        now: NOW,
        env: THREADS_ONLY,
      }
    );
    expect(last).not.toMatch(ASK);
  });
});
