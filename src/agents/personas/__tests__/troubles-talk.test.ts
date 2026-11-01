/**
 * TROUBLES_TALK=on: each behaviour checked against the same turn with the flag
 * off, so every assertion fails if the flag stops changing the prompt.
 * Off-is-unchanged is pinned in troubles-talk-off.test.ts.
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRecall } from '../../multi-agent/memory-recall-hook.js';
import type { LedgerStore } from '../life-ledger.js';
import { loadSystemPrompt } from '../prompt-loader.js';
import { REFLECT, SHARE_LINES, troubleOpening, troubleWords } from '../troubles-talk.js';
import { withTurnReminder } from '../turn-request.js';
import { rngFor, turnShapeFor, type TurnShapeMode } from '../turn-shape.js';

const FLAGS = [
  'TROUBLES_TALK',
  'LISTEN_FIRST',
  'LAUGH_ALONG',
  'ASK_ADVICE',
  'TURN_SHAPE',
  'TURN_LENGTH',
  'CANDOR',
  'PROMPT_MODE',
  'RECALL_BRIDGE',
];
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of FLAGS) saved[k] = process.env[k];
  for (const k of FLAGS) delete process.env[k];
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of FLAGS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** The reminder for `text` with TROUBLES_TALK off, then on, same draw. */
function offOn(text: string, mode: TurnShapeMode, seed = 0): [string, string] {
  const off = turnShapeFor(text, rngFor(`${seed}:${text}`), mode).reminder;
  process.env.TROUBLES_TALK = 'on';
  const on = turnShapeFor(text, rngFor(`${seed}:${text}`), mode).reminder;
  delete process.env.TROUBLES_TALK;
  return [off, on];
}

const PEAK = SHARE_LINES[0];
const ADVICE_ORDER = SHARE_LINES[2];
const SECOND_STORY = /share a small piece of it/;
const ASK_ADVICE = /ask their take on something small in your own life/;
const LAUGH = /They laughed: laugh with them/;
const MODES: TurnShapeMode[] = ['model', 'dice'];

describe('TROUBLES_TALK peaks, reflections and advice order', () => {
  it.each(MODES)('adds them to something shared (%s), not to a request', (mode) => {
    const [off, on] = offOn("My dad's back in the hospital.", mode);
    for (const line of [PEAK, REFLECT, ADVICE_ORDER]) {
      expect(off).not.toContain(line);
      expect(on).toContain(line);
    }
    const [, request] = offOn('What should I do about my sister?', mode);
    expect(request).not.toContain(ADVICE_ORDER);
  });
});

describe('TROUBLES_TALK: no shift to his own life during a trouble', () => {
  const draws = (text: string, re: RegExp, on: boolean) => {
    if (on) process.env.TROUBLES_TALK = 'on';
    const n = Array.from({ length: 60 }, (_, i) =>
      turnShapeFor(text, rngFor(`${i}:${text}`), 'model')
    ).filter((t) => re.test(t.reminder)).length;
    delete process.env.TROUBLES_TALK;
    return n;
  };
  // Hard news the venting words miss: off, a second story rides some replies.
  const SCAN = 'They found something on her scan and we go back Thursday.';

  it('drops the second story on hard news and keeps it on light news', () => {
    expect(draws(SCAN, SECOND_STORY, false)).toBeGreaterThan(0);
    expect(draws(SCAN, SECOND_STORY, true)).toBe(0);
    const light = 'I finally finished painting the fence today.';
    expect(draws(light, SECOND_STORY, true)).toBeGreaterThan(0);
  });

  it('drops asking his advice (ASK_ADVICE) on hard news', () => {
    process.env.ASK_ADVICE = 'on';
    expect(draws(SCAN, ASK_ADVICE, false)).toBeGreaterThan(0);
    expect(draws(SCAN, ASK_ADVICE, true)).toBe(0);
  });

  it('reads "do you have a minute?" as their trouble coming, not a question about him', () => {
    expect(troubleOpening('Hey, do you have a minute to talk?')).toBe(true);
    expect(troubleOpening('Can I talk to you about something?')).toBe(true);
    expect(troubleOpening('Do you have a dog?')).toBe(false);
    const [off, on] = offOn('Do you have a minute to talk?', 'model');
    expect(off).toMatch(/answer about yourself/);
    expect(on).not.toMatch(/answer about yourself/);
    expect(on).not.toMatch(/something of your own/);
  });

  it('quiets the life ledger thread invite on a trouble, not on a light first turn', async () => {
    const ledgerStore: LedgerStore = {
      save: async () => undefined,
      recent: async () => [
        { personaId: 'ferni', fact: "Ferni's goat got out", saidAt: new Date().toISOString() },
      ],
    };
    const first = async (text: string) => {
      const recall = createMemoryRecall({
        userId: 'u1',
        store: { facts: async () => [], summaries: async () => [] },
        ledgerStore,
        bridge: false,
      });
      await recall.ready;
      return recall.noteFor(text) ?? '';
    };
    expect(await first('Do you have a minute to talk?')).toMatch(/pick a thread back up/);
    process.env.TROUBLES_TALK = 'on';
    const quiet = await first('Do you have a minute to talk?');
    expect(quiet).toContain("Ferni's goat got out");
    expect(quiet).not.toMatch(/pick a thread back up/);
    expect(quiet).toMatch(/not things to bring up/);
    expect(await first('I finally finished painting the fence today.')).toMatch(
      /pick a thread back up/
    );
  });

  it('holds for the turns after hard news ("thanks for listening")', () => {
    const shifts = (on: boolean) => {
      if (on) process.env.TROUBLES_TALK = 'on';
      let n = 0;
      for (let i = 0; i < 40; i++) {
        // withTurnReminder seeds each call with Math.random: one value per call.
        vi.spyOn(Math, 'random').mockReturnValue((i + 0.5) / 40);
        const session = { userData: { services: { sessionId: 'troubles' } } };
        const first = llm.ChatContext.empty();
        first.addMessage({ role: 'user', content: 'My mom has cancer.' });
        withTurnReminder(first, session);
        const c = first.copy();
        c.addMessage({ role: 'assistant', content: 'Oh, Sam. Your mom.' });
        c.addMessage({ role: 'user', content: 'Yeah. Anyway, thanks for listening, really.' });
        const out = withTurnReminder(c, session);
        const text = (out.items[out.items.length - 1] as { textContent?: string }).textContent;
        if (/something of your own/.test(text ?? '') || SECOND_STORY.test(text ?? '')) n++;
        vi.restoreAllMocks();
      }
      delete process.env.TROUBLES_TALK;
      return n;
    };
    expect(shifts(false)).toBeGreaterThan(0);
    expect(shifts(true)).toBe(0);
  });
});

describe('TROUBLES_TALK length', () => {
  it.each(MODES)('caps a reply to what they told at their word count (%s)', (mode) => {
    const told = 'I finally finished painting the fence today, took me all weekend.';
    const [off, on] = offOn(told, mode);
    expect(off).not.toMatch(/words at most\.$|\d+ words at most/);
    expect(on).toContain('say no more than they just did, 11 words at most');
    // A short telling gets the floor; a question to him gets no cap.
    expect(offOn('My dad died.', mode)[1]).toContain('8 words at most');
    expect(offOn('Is that weird of me?', mode)[1]).not.toMatch(/\d+ words at most/);
  });

  it('with TURN_LENGTH=learned, the learned line carries the cap instead of a second line', () => {
    process.env.TURN_LENGTH = 'learned';
    const told =
      'So my sister called last night and told me she is moving across the country next month for a new job, and I have not stopped thinking about it since.';
    const [off, on] = offOn(told, 'model');
    expect(on).not.toContain('say no more than they just did');
    const words = (s: string) => Number(s.match(/(\d+) words/)?.[1] ?? NaN);
    expect(words(on)).toBeLessThanOrEqual(Math.max(8, told.split(/\s+/).length));
    expect(words(off)).toBeGreaterThan(0);
  });
});

describe('TROUBLES_TALK reflections in the character sheet', () => {
  it('swaps the feelings ban for saying back the meaning, for Ferni and the coaches', async () => {
    process.env.PROMPT_MODE = 'character';
    for (const persona of ['ferni', 'peter-john', 'jordan-taylor', 'alex-chen']) {
      const off = await loadSystemPrompt(persona);
      process.env.TROUBLES_TALK = 'on';
      const on = await loadSystemPrompt(persona);
      delete process.env.TROUBLES_TALK;
      expect(off, persona).toMatch(/name their feelings for them/);
      expect(on, persona).not.toMatch(/name their feelings/);
      expect(on, persona).toContain(
        'you let them lead. You say back the meaning under what they said'
      );
    }
  });

  it('words Nayan\'s line without "meaning", since he doesn\'t rush to make meaning', async () => {
    process.env.PROMPT_MODE = 'character';
    const off = await loadSystemPrompt('nayan-patel');
    process.env.TROUBLES_TALK = 'on';
    const on = await loadSystemPrompt('nayan-patel');
    expect(off).toMatch(/name their feelings for them/);
    expect(on).not.toMatch(/name their feelings/);
    expect(on).toContain("don't rush to make meaning of it;");
    expect(on).toContain('you let them lead. You say back what you heard underneath it');
    const both = on.includes("don't rush to make meaning") && on.includes('say back the meaning');
    expect(both).toBe(false);
  });

  it("leaves Maya's sheet, which has no such line, as it is", async () => {
    process.env.PROMPT_MODE = 'character';
    const off = await loadSystemPrompt('maya-santos');
    process.env.TROUBLES_TALK = 'on';
    expect(await loadSystemPrompt('maya-santos')).toBe(off);
  });
});

describe('TROUBLES_TALK and LAUGH_ALONG', () => {
  it('does not laugh along with a trouble, still laughs with a funny story', () => {
    process.env.LAUGH_ALONG = 'on';
    // A vent laughs along only with the flag off. Hard news never does, flag or not (heavy-turn.ts).
    const vent = "haha my roommate keeps leaving dirty dishes everywhere and I'm so annoyed";
    expect(troubleWords(vent)).toBe(true);
    const [off, on] = offOn(vent, 'model');
    expect(off).toMatch(LAUGH);
    expect(on).not.toMatch(LAUGH);
    expect(troubleWords('haha I got fired today')).toBe(true);
    const [hardOff, hardOn] = offOn('haha I got fired today, I mean what even is my life', 'model');
    expect(hardOff).not.toMatch(LAUGH);
    expect(hardOn).not.toMatch(LAUGH);
    expect(offOn('haha my dog stole a whole pizza off the counter', 'model')[1]).toMatch(LAUGH);
  });
});

describe('TROUBLES_TALK with LISTEN_FIRST', () => {
  it('lets the listening reply win for a caller low on energy, with no second length rule', () => {
    process.env.LISTEN_FIRST = 'on';
    process.env.TROUBLES_TALK = 'on';
    const c = llm.ChatContext.empty();
    for (const [role, content] of [
      ['user', 'yeah'],
      ['assistant', 'Long one, huh.'],
      ['user', "that's true"],
      ['assistant', 'Mm.'],
      ['user', 'really'],
      ['assistant', 'Yeah.'],
      ['user', 'My dad is in the hospital again tonight.'],
    ] as const)
      c.addMessage({ role, content });
    const out = withTurnReminder(c, { userData: { services: { sessionId: 'troubles' } } });
    const text = (out.items[out.items.length - 1] as { textContent?: string }).textContent ?? '';
    expect(text).toMatch(/Listen more than you talk: a few words or one short sentence/);
    expect(text).not.toMatch(/\d+ words at most/);
    expect(text).not.toContain(ADVICE_ORDER);
  });
});
