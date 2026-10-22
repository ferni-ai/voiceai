/**
 * What the model reads for its reply to the caller's first words on a return call
 * whose greeting already asked about a thread (dev capability sweep 2026-10-21, B2).
 *
 * The greeting asked "did you end up sending that resume to Dana?", the caller said
 * only "Hey Ferni, it's me.", and Ferni answered his own question as the caller:
 * "Yeah, I sent it over." Built here with the real pieces: the directed greeting and
 * its opener claim, the recall hook's first note, the per-turn reminder and the
 * patched google formatter, as on dev (DIRECTOR_ANSWER_TURN_GUARD, MID_CALL_NOTE_FRAME).
 */
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GREETING = 'Hey Sam, did you end up sending that resume to Dana?';
let actorLine = GREETING;
const directedText = vi.fn(async () => ({ text: actorLine, source: 'actor' as const, ms: 0 }));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

const { directedGreeting, rememberCallerHistory } = await import('../greeting-direction.js');
const { createMemoryRecall } = await import('../memory-recall-hook.js');
const { OPENER_FOLLOW_UP_LINE } = await import('../../../memory/recall/opener.js');
const { clearOpenerClaims, takeOpenerClaim } =
  await import('../../../memory/recall/opener-claim.js');
const { withTurnReminder } = await import('../../personas/turn-request.js');
const { TAKE_UP_ANSWER } = await import('../../personas/turn-shape.js');
const { MID_CALL_NOTE_FRAME_OPENING } = await import('../../../tools/utils/own-note.js');

const SAID = "Hey Ferni, it's me.";
const THREAD = 'Ask whether Sam sent the resume to Dana at Figma';
const store = {
  facts: async () => [{ entityName: 'Dana', key: 'employer', value: 'Figma', confidence: 1 }],
  summaries: async () => [{ callerProvenance: 1, followUpItems: [THREAD] }],
};

beforeEach(() => {
  actorLine = GREETING;
  clearOpenerClaims();
  vi.stubEnv('DIRECTOR_ANSWER_TURN_GUARD', 'on');
  vi.stubEnv('MID_CALL_NOTE_FRAME', 'on');
  vi.stubEnv('OPENER_FOLLOW_UP', 'on'); // the recall note would add its thread line
});
afterEach(() => vi.unstubAllEnvs());

/** The greeting (last call's topic, no check-in), then the recall hook's first note. */
async function greetAndRecall(userId: string): Promise<string> {
  rememberCallerHistory(`s-${userId}`, {
    calls: 2,
    lastTopic: 'Sam decided to send a resume to Dana at Figma by Thursday',
  });
  const greeting = await directedGreeting(`s-${userId}`, 'ferni', { userId, userName: 'Sam' });
  expect(greeting).toBe(GREETING);
  const recall = createMemoryRecall({
    userId,
    userName: 'Sam',
    store,
    ledgerStore: { save: async () => {}, recent: async () => [] },
    opener: true,
    bridge: false,
    semantic: false,
  });
  await recall.ready;
  const note = recall.noteFor(SAID, { final: true });
  if (!note) throw new Error('no recall note');
  return note;
}

/** The chat as the SDK holds it for this reply, with the turn reminder applied. */
function turnTwo(note: string): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  ctx.addMessage({ role: 'assistant', content: GREETING });
  ctx.addMessage({ role: 'system', content: note }); // addRecallNote, on the first interim
  ctx.addMessage({ role: 'user', content: SAID });
  return withTurnReminder(ctx, {});
}

describe('the reply to "it\'s me" after a greeting that asked a thread', () => {
  it('carries no OPENER_FOLLOW_UP_LINE: the greeting already asked', async () => {
    const note = await greetAndRecall('u-claim');
    expect(note).toContain(THREAD); // the thread is still there to know about
    expect(note).not.toContain(OPENER_FOLLOW_UP_LINE);
  });

  it('is not told the caller answered the question', async () => {
    const ctx = turnTwo(await greetAndRecall('u-answer'));
    const last = ctx.items.at(-1) as { role?: string; textContent?: string };
    expect(last.role).toBe('user');
    expect(last.textContent).toMatch(/^Hey Ferni, it's me\.\s+\(/); // the reminder rides along
    expect(last.textContent).not.toContain(TAKE_UP_ANSWER);
  });

  it("reaches Gemini with the recall note framed as Ferni's own, apart from their words", async () => {
    const [turns] = (await turnTwo(await greetAndRecall('u-frame')).toProviderFormat('google')) as [
      Array<{ role: string; parts: Array<{ text?: string }> }>,
      unknown,
    ];
    expect(turns.map((t) => t.role)).toEqual(['model', 'user']);
    const [note, said, reminder] = turns[1].parts.map((p) => p.text ?? '');
    expect(note.startsWith(MID_CALL_NOTE_FRAME_OPENING)).toBe(true);
    expect(note).toContain('not words the caller said');
    expect(note).not.toContain('New instructions received');
    expect(note).not.toContain(OPENER_FOLLOW_UP_LINE);
    expect(said).toBe(SAID);
    expect(reminder).not.toContain(TAKE_UP_ANSWER);
  });
});

describe("the greeting's claim on last call's topic (greeting-claim.ts)", () => {
  const TOPIC = 'Sam decided to send a resume to Dana at Figma by Thursday';
  async function greets(line: string, userId: string, topic = TOPIC): Promise<string | undefined> {
    actorLine = line;
    rememberCallerHistory(`s-${userId}`, { calls: 2, lastTopic: topic });
    await directedGreeting(`s-${userId}`, 'ferni', { userId, userName: 'Sam' });
    return takeOpenerClaim(userId);
  }

  it('claims when the line asks about the topic itself', async () => {
    expect(await greets(GREETING, 'c1')).toBe('greeting');
  });

  it('does not claim on their name, a persona name or small talk', async () => {
    for (const line of [
      "Hey Sam, how's your evening going?",
      'Hey Sam, how was your week?',
      "Hey Sam, it's Ferni. How are things today?",
    ])
      expect(await greets(line, `c-${line.length}`), line).toBeUndefined();
    // Their name anywhere in the line, not only after "Hey".
    expect(await greets('How are you holding up, Sam?', 'c-name')).toBeUndefined();
    // A persona's name: "Maya" in both the line and the topic is not the topic.
    const maya = 'Sam wants to talk to Maya about the budget';
    expect(await greets('Did you get to talk to Maya today?', 'c-maya', maya)).toBeUndefined();
    expect(await greets('Did you sort out the budget?', 'c-budget', maya)).toBe('greeting');
  });

  it('does not claim a line that asks nothing, or when no thread line could follow', async () => {
    expect(
      await greets('Hey Sam, good to hear from you. The resume for Dana.', 'c2')
    ).toBeUndefined();
    vi.stubEnv('OPENER_FOLLOW_UP', 'off');
    expect(await greets(GREETING, 'c3')).toBeUndefined();
    vi.stubEnv('FOLLOW_THROUGH_OPENER', 'on');
    expect(await greets(GREETING, 'c4')).toBe('greeting');
  });
});
