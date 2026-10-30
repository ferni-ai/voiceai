import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { cohortFlagValues } from '../../../services/platform/cohort-flags.js';
import { SUBSTANCE, lengthLearned, substanceWords } from '../turn-length.js';
import { withTurnReminder } from '../turn-request.js';
import { styleFor } from '../turn-request-style.js';
import { rngFor } from '../turn-shape.js';
import { substanceOf } from '../turn-substance.js';

const KEYS = ['TURN_LENGTH', 'TURN_TEXTURE', 'TURN_SHAPE', 'SCRIPT_FREE_REMINDER'];
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.TURN_SHAPE = 'model';
  delete process.env.SCRIPT_FREE_REMINDER;
  resetCrisisCallRisk();
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** A short, quiet call ending on the caller's words, plus whatever came after them. */
function call(said: string, after: llm.ChatItem[] = []): llm.ChatContext {
  const c = llm.ChatContext.empty();
  c.addMessage({ role: 'user', content: 'hey' });
  c.addMessage({ role: 'assistant', content: 'hey you' });
  c.addMessage({ role: 'user', content: said });
  c.insert(after);
  return c;
}
const toolRan = (name: string): llm.ChatItem[] => [
  llm.FunctionCall.create({ callId: 'c1', name, args: '{}' }),
  llm.FunctionCallOutput.create({ callId: 'c1', name, output: '{"ok":true}', isError: false }),
];
const lastText = (c: llm.ChatContext): string =>
  (c.items.filter((i) => i.type === 'message').at(-1) as llm.ChatMessage).textContent ?? '';

/** The reminder this mode gives, with the call's seed pinned so modes see the same draws. */
function reminder(
  mode: string | undefined,
  ctx: llm.ChatContext,
  session: object = {},
  shape?: boolean
): string {
  if (mode) process.env.TURN_LENGTH = mode;
  else delete process.env.TURN_LENGTH;
  vi.spyOn(Math, 'random').mockImplementation(rngFor('adaptive-seed'));
  const out = lastText(withTurnReminder(ctx, session, shape === false ? { shape } : {}));
  vi.restoreAllMocks();
  return out;
}
const SUBSTANCE_LINE = /THIS REPLY: they need a real answer here, so give it: .* about (\d+) words/;
const askedWords = (r: string): number => Number(r.match(SUBSTANCE_LINE)?.[1] ?? 0);

const QUESTION = 'my landlord wants to raise the rent again, should I just start looking?';
const SOCIAL = [
  'and then we just drove home',
  'my sister finally called me back about the house',
  'ugh the dog ate my sandwich again',
  'yeah',
];

describe('TURN_LENGTH=adaptive', () => {
  it('is a mode of the TURN_LENGTH flag, and draws a learned length like learned does', () => {
    expect(cohortFlagValues('TURN_LENGTH')).toContain('adaptive');
    expect(lengthLearned({ TURN_LENGTH: 'adaptive' })).toBe(true);
  });

  it('gives a real question room for a real answer, where learned gives chit-chat length', () => {
    const adaptive = reminder('adaptive', call(QUESTION));
    const learned = reminder('learned', call(QUESTION));
    expect(adaptive).toMatch(SUBSTANCE_LINE);
    expect(askedWords(adaptive)).toBeGreaterThanOrEqual(SUBSTANCE.min);
    expect(askedWords(adaptive)).toBeLessThanOrEqual(SUBSTANCE.max);
    expect(learned).not.toMatch(SUBSTANCE_LINE);
  });

  it('gives every social moment exactly what learned gives, from the same seed', () => {
    for (const said of SOCIAL) {
      const learned = reminder('learned', call(said));
      expect(learned).toMatch(/THIS REPLY: /);
      expect(reminder('adaptive', call(said))).toBe(learned);
    }
  });

  it('sizes the script-free reminder the same way', () => {
    process.env.SCRIPT_FREE_REMINDER = 'on';
    expect(reminder('adaptive', call(QUESTION))).toMatch(SUBSTANCE_LINE);
    expect(reminder('learned', call(QUESTION))).not.toMatch(SUBSTANCE_LINE);
    expect(reminder('adaptive', call(SOCIAL[0]))).toBe(reminder('learned', call(SOCIAL[0])));
  });

  it('leaves learned and off as they were: no substance line on any turn', () => {
    for (const said of [QUESTION, ...SOCIAL]) {
      expect(reminder('learned', call(said))).not.toMatch(SUBSTANCE_LINE);
      const off = reminder(undefined, call(said));
      expect(off).not.toMatch(SUBSTANCE_LINE);
      expect(reminder('off', call(said))).toBe(off);
    }
  });

  it('scales the room with what was asked, within the substance budget', () => {
    expect(substanceWords('why?', 4)).toBe(SUBSTANCE.min + 1);
    expect(substanceWords('why?', 40)).toBe(40);
    expect(substanceWords('word '.repeat(80), 4)).toBe(SUBSTANCE.max);
    // The question sizes it, not the story before it.
    expect(substanceWords(`${'and then we went home. '.repeat(8)}remember?`, 4)).toBe(
      SUBSTANCE.min + 1
    );
  });

  it('answers what a look-up tool found with substance, and a finished action briefly', () => {
    const wondering = 'I wonder what my week even looks like';
    const lookedUp = reminder('adaptive', call(wondering, toolRan('getCalendarWeek')));
    expect(lookedUp).toMatch(SUBSTANCE_LINE);
    const acted = call(wondering, toolRan('setReminder'));
    expect(reminder('adaptive', acted)).toBe(reminder('learned', acted));
  });

  it('gives a specialist asked about their own beat substance, and Ferni none for it', () => {
    const said = 'I keep failing at my morning routine';
    expect(substanceOf(said, 'share', { speaker: 'maya-santos' })).toBe('beat');
    expect(substanceOf(said, 'share', { speaker: 'ferni' })).toBeUndefined();
    process.env.TURN_LENGTH = 'adaptive';
    // The speaker is the persona on the call, read from the session as the handoff tools read it.
    const on = (personaId: string) => ({ userData: { personaId } });
    const maya = styleFor(call(said), on('maya-santos'), true);
    expect(maya.text).toMatch(SUBSTANCE_LINE);
    expect(maya.turn?.extras).toContain('substance_beat');
    expect(styleFor(call(said), on('ferni'), true).text).not.toMatch(SUBSTANCE_LINE);
    expect(reminder('adaptive', call(said), on('maya-santos'))).toMatch(SUBSTANCE_LINE);
  });

  it('never changes a crisis turn, or the length on a call with crisis risk', () => {
    const crisis = reminder('adaptive', call(QUESTION), {}, false);
    expect(crisis).not.toMatch(/THIS REPLY: /);
    expect(crisis).toBe(reminder('learned', call(QUESTION), {}, false));
    const risky = { userData: { services: { sessionId: 'call-risk' } } };
    noteCrisisRisk('call-risk');
    const atRisk = reminder('adaptive', call(QUESTION), risky);
    expect(atRisk).not.toMatch(SUBSTANCE_LINE);
    expect(atRisk).toBe(reminder('learned', call(QUESTION), risky));
  });

  it('lifts a turn that ends on its question, not one with a check in the middle', () => {
    expect(substanceOf('so is it bad to just say no this time?', 'share')).toBe('question');
    expect(
      substanceOf('remember? we went there last summer and it rained', 'share')
    ).toBeUndefined();
  });

  it('keeps requests, look-ups and questions about him on their own rules', () => {
    for (const [said, move] of [
      ['can you help me plan the trip?', 'request'],
      ["what's the weather tomorrow?", 'lookup'],
      ['how was your day?', 'about_ferni'],
      ['yeah?', 'ack'],
    ] as const) {
      expect(substanceOf(said, move)).toBeUndefined();
    }
    expect(substanceOf('how was your day?', 'share')).toBeUndefined();
  });
});
