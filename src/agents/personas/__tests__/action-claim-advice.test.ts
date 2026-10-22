/**
 * Advice, plans and hypotheticals are not action claims (action-claims.ts).
 *
 * Dev capability sweep 2026-10-21 (overlap-handoff): the caller planning a
 * fortieth asked "Cool. What should I do first?". Jordan's reply came out as
 * "It isn't booked yet, though. Should I go ahead and book it? I'd start by
 * asking her for a quick list of the must-have people." The guard logged
 * ACTION_CLAIM_DROPPED {kind: schedule, reason: uncalled, held: true}: it read
 * the reply's first sentence as a booking and dropped it. Logs carry no words,
 * so that sentence is not recorded; it was about four to six tokens, and the
 * only schedule patterns such a planning line can hit are "we're booking ..." /
 * "we've booked ..." (Jordan plans with the caller as "we": "if we're doing a
 * dance vibe, we should aim for..."). The rows below are those shapes.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { claimedAction, type ActionKind } from '../action-claims.js';
import { inPlace } from '../honest-line.js';

initializeLogger({ pretty: false, level: 'warn' });

/** The sentence the caller heard after the guard's line, word for word. */
const SWEEP_KEPT = "I'd start by asking her for a quick list of the must-have people.";

const CLAIMS: Array<[string, ActionKind]> = [
  ["I've booked it.", 'schedule'],
  ["I've booked the loft for Saturday.", 'schedule'],
  ['I just booked it.', 'schedule'],
  ["I've scheduled your dentist appointment for Tuesday.", 'schedule'],
  ["I've scheduled it for nine.", 'schedule'],
  ['Done, it’s on your calendar.', 'schedule'],
  ["All done, it's in your diary for Friday.", 'schedule'],
  ["I've put it on your calendar.", 'schedule'],
  ["I'm booking your table now.", 'schedule'],
  ["We've booked you a table for two.", 'schedule'],
  ['Okay, booked!', 'schedule'],
  ["I've reserved a table at Nobu for you.", 'schedule'],
  ["Hopefully that works, I've booked it for seven.", 'schedule'],
  ["If that works for you, I've booked it for seven.", 'schedule'],
  ["I've texted your sister.", 'send'],
  ["I'm calling her right now.", 'call'],
  ["I've set a reminder for nine.", 'reminder'],
];

const NOT_CLAIMS: string[] = [
  // The sweep reply, its kept sentence and the plans it could have opened with.
  SWEEP_KEPT,
  "First, we're booking the venue.",
  "We're booking the loft first.",
  "We're reserving a room at the lounge first.",
  "First things first, we're booking a venue.",
  "Okay, so step one, we're booking the space.",
  'Step one: we’re reserving the room.',
  "Then we're booking the caterer.",
  "We're booking a DJ.",
  "Okay, we're booking the venue first, then the music.",
  "Maybe we're booking a loft.",
  // Advice and hypotheticals.
  'If I were you, I’d book the venue first.',
  "If we've booked the loft, we can invite more.",
  "Let's say we've booked the loft.",
  "Let's say I've booked it for Friday, then what?",
  'Imagine we’ve booked the loft by Friday.',
  'Say I booked it tonight, would that help?',
  'Book the venue first, then the music.',
  "We've booked the date, right?",
  "Maybe I've booked it twice by mistake, let's check.",
  // Ferni's own life and habits.
  'I have booked a lot of parties, trust me.',
  'I just booked a venue like that for my sister.',
  // The caller's own actions.
  "You've booked the venue, nice.",
  "So you're booking the loft first.",
  'You just booked it, amazing.',
  // Words for someone else to say.
  'Just tell them we’ve booked the loft.',
  "Tell her that I've booked it.",
  'You could say: we’ve booked the room for eight.',
  'Text the group “we’ve booked the loft” once it’s paid.',
  'Write ‘I’ve booked the table’ in the group chat.',
];

describe('claimedAction: real reports only', () => {
  it.each(CLAIMS)('%j claims %s', (sentence, kind) => {
    expect(claimedAction(sentence)).toBe(kind);
  });

  it.each(NOT_CLAIMS)('%j is not a claim', (sentence) => {
    expect(claimedAction(sentence)).toBeNull();
  });
});

const chunk = (content: string): llm.ChatChunk => ({
  id: 'r',
  delta: { role: 'assistant', content },
});
function streamOf(...parts: string[]): ReadableStream<llm.ChatChunk> {
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(chunk(p));
      c.close();
    },
  });
}
/** The sweep call's last turns: party planning, no action asked for. */
const SWEEP_CTX = {
  items: [
    llm.ChatMessage.create({ role: 'user', content: 'Something she can dance to.' }),
    llm.ChatMessage.create({
      role: 'assistant',
      content:
        "Hmm, dancing is a must for a fortieth. I think if we're doing a dance vibe, we should aim for at least twenty or thirty people.",
    }),
    llm.ChatMessage.create({ role: 'user', content: 'Cool. What should I do first?' }),
  ],
};
/** Dev, 2026-10-21: the calendar create open, ACTION_CLAIM_GUARD on, every turn held. */
const DEV = { ACTION_CLAIM_GUARD: 'on', ACTION_CLAIM_STREAM: 'off' };
async function guarded(...parts: string[]): Promise<string> {
  const tools = { functionTools: { createCalendarEvent: {} } };
  const out = await withActionClaimCheck(
    streamOf(...parts),
    SWEEP_CTX,
    tools,
    'jordan-taylor',
    DEV
  );
  let text = '';
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>)
    text += c.delta?.content ?? '';
  return text;
}

describe('the guard on the sweep turn', () => {
  it.each(NOT_CLAIMS)('%j streams untouched', async (sentence) => {
    expect(await guarded(`${sentence} `, SWEEP_KEPT)).toBe(`${sentence} ${SWEEP_KEPT}`);
  });

  it.each(CLAIMS)('%j is held', async (sentence) => {
    const text = await guarded(`${sentence} `, SWEEP_KEPT);
    expect(text).not.toContain(sentence);
    expect(text).toContain(SWEEP_KEPT);
  });

  it('a real booking claim: the line takes its place, and the question ends the reply', async () => {
    const text = await guarded("I've booked the loft for Saturday. ", SWEEP_KEPT);
    expect(text).toBe(`It isn't booked yet. ${SWEEP_KEPT} Should I go ahead and book it?`);
  });

  it('after other words, the line keeps its "though"', async () => {
    const text = await guarded('Love it. ', "I've booked the loft for Saturday. ", SWEEP_KEPT);
    expect(text).toBe(
      `Love it. It isn't booked yet, though. ${SWEEP_KEPT} Should I go ahead and book it?`
    );
  });
});

describe('inPlace', () => {
  const NOT_YET = "It isn't booked yet, though. Should I go ahead and book it?";
  it('opening the reply, with words after: no "though", question last', () => {
    expect(inPlace(NOT_YET, false, ['Pick a date. '])).toEqual([
      "It isn't booked yet.",
      'Pick a date. ',
      'Should I go ahead and book it?',
    ]);
  });
  it('the reply already ends on a question: the line stays whole, in place', () => {
    expect(inPlace(NOT_YET, true, ['Anything else?'])).toEqual([
      "It isn't booked yet, though.",
      'Should I go ahead and book it?',
      'Anything else?',
    ]);
  });
  it('a line with no question (a failure) is left as it is', () => {
    const line = "That didn't go through, so it isn't booked.";
    expect(inPlace(line, false, ['Okay.'])).toEqual([line, 'Okay.']);
  });
});
