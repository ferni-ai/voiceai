/**
 * Plain past claims of actions Ferni never took (ACTION_CLAIM_PAST, off by default).
 *
 * "I booked it." / "I sent it." / "I called her." passed the guard: plain past
 * is also how Ferni tells his own life ("so I called her"), so action-claims.ts
 * never read it as a claim. With the flag on, pastClaim reads it, and the guard
 * holds it only when a tool of that kind was open and none ran: not in this
 * reply, not since the caller last spoke, and not on the call so far.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import { actionClaimPastEnabled, withActionClaimCheck } from '../action-claim-guard.js';
import { claimedAction, pastClaim, type ActionKind } from '../action-claims.js';

initializeLogger({ pretty: false, level: 'warn' });

const PAST_CLAIMS: Array<[string, ActionKind]> = [
  ['I booked it.', 'schedule'],
  ['Okay, I booked it for Friday at noon.', 'schedule'],
  ['I booked your table at seven.', 'schedule'],
  ['I scheduled the appointment for Tuesday.', 'schedule'],
  ['I reserved the room for eight.', 'schedule'],
  ['I added it to your calendar.', 'schedule'],
  ['I put the lunch on your calendar.', 'schedule'],
  ['I sent it.', 'send'],
  ['I sent the text to Sam.', 'send'],
  ['Done, I texted him.', 'send'],
  ['I emailed your landlord.', 'send'],
  ['I messaged her just now.', 'send'],
  ['I called her.', 'call'],
  ['I called your mom and left the message.', 'call'],
  ['I rang him.', 'call'],
  ['I set the reminder.', 'reminder'],
  ['I set a reminder for nine.', 'reminder'],
  ['I set a ten minute timer.', 'reminder'],
  ['I saved it.', 'save'],
  ['I called you a cab.', 'ride'],
  ['I booked you an Uber.', 'ride'],
  // Real claims next to the look-alikes below, so they cannot over-loosen.
  ['Sure thing — I booked the table for 7, see you there.', 'schedule'],
  ['Done, I called her.', 'call'],
  ['I sent it to her just now.', 'send'],
  ['Okay, I booked it for Friday.', 'schedule'],
  ['I called him back.', 'call'],
  ['I called her up.', 'call'],
  ['As you said, I booked it.', 'schedule'],
  ['I sent it to your brother.', 'send'],
];

const LOOK_ALIKES: string[] = [
  // Ferni's own life and habits.
  'I booked a trip for myself last year.',
  'I sent it back to the kitchen once.',
  'I sent it back to the kitchen.',
  'My sister was struggling, so I called her.',
  'I called my mom every Sunday.',
  'I always set an alarm, honestly.',
  'I set an alarm every night.',
  'When I booked my first apartment, I cried.',
  'I texted her years ago and regretted it.',
  // Idioms.
  'I called it early.',
  'I called it, they won.',
  'I booked it out of there.',
  // Hypotheticals and questions.
  'If I booked it tonight, would you still go?',
  'Say I booked it, then what?',
  'Maybe I sent it to the wrong number.',
  'Did I send it already?',
  // The caller's actions.
  'You booked it, nice.',
  'So you called her, how did it go?',
  'Sounds like you texted him already.',
  'She sent it back.',
  // Quotes and words for someone else.
  'Text her "I booked it" once it’s paid.',
  'Tell her that I sent it.',
  'Just say: I called her.',
  'Write ‘I booked the table’ in the chat.',
  // Offers and negations.
  "I didn't send it yet.",
  "I can't say I sent it, honestly.",
  'Should I book it?',
  // Adversarial review, round 2: must stream untouched.
  'I booked it for us last summer and loved it.',
  'I called her out on that once.',
  "I'd have booked it if you asked.",
  'Yesterday I sent my brother a postcard.',
  'Remember when I booked that cabin and it rained?',
  'I never called her.',
  "I don't think I sent it.",
  'Back in college I texted him every day.',
  'Do you want me to tell her I booked it?',
  // "mine": Ferni's own people.
  'I sent that joke to a friend of mine.',
  'I booked it for a buddy of mine.',
  'I called her, an old friend of mine.',
  'I texted him for a coworker of mine.',
  'I sent it to a cousin of mine, she loved it.',
  'I reserved the room for a pal of mine.',
  'I emailed her for a neighbor of mine.',
  // Dated past: a year, "back in", "when we went".
  'I booked it in 2019 when we went to Paris.',
  'I booked the room in 2021.',
  'I sent it in 2018 and never heard back.',
  'I scheduled the session back in June.',
  'Back in March I booked the room.',
  'I booked that place when we went to Rome.',
  'I called her when I was in college.',
  // Call idioms: "called her out", "called it off", "called dibs".
  'Honestly, I called her out on it.',
  'I called him out for it.',
  'Honestly, I called them out.',
  'I called your landlord out on the rent.',
  'I called him off.',
  'I called dibs on the window seat.',
  'I called it off.',
  'I called him a genius.',
  // Reported speech, and a later "but I did not".
  'You said I called her, but I did not.',
  'You think I sent it.',
  'They said I booked it.',
  'She said I called her.',
  'He thinks I texted him.',
  'You told me I booked it.',
  'I called her, but I did not.',
  'I booked it, but I didn’t.',
];

describe('pastClaim', () => {
  it.each(PAST_CLAIMS)('%j reports %s', (sentence, kind) => {
    expect(pastClaim(sentence)).toBe(kind);
  });

  it.each(LOOK_ALIKES)('%j is not a past claim', (sentence) => {
    expect(pastClaim(sentence)).toBeNull();
  });

  it('is not read without the flag: claimedAction leaves plain past alone', () => {
    expect(claimedAction('I booked it.')).toBeNull();
    expect(claimedAction('I sent it.')).toBeNull();
    expect(actionClaimPastEnabled({})).toBe(false);
  });
});

const chunk = (content: string): llm.ChatChunk => ({
  id: 'r',
  delta: { role: 'assistant', content },
});
const toolCall = (name: string): llm.ChatChunk => ({
  id: 'r',
  delta: {
    role: 'assistant',
    toolCalls: [llm.FunctionCall.create({ callId: 'x', name, args: '{}' })],
  },
});
const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
let n = 0;
const result = (name: string, output: string) =>
  llm.FunctionCallOutput.create({ callId: `c${++n}`, name, output, isError: false });

const ASK = user('Can you book lunch with Sam, text her, and set a reminder?');
const ALL_TOOLS = [
  'createCalendarEvent',
  'quickText',
  'callOnBehalf',
  'setReminder',
  'saveNote',
  'requestRide',
];
const ON: Record<string, string> = {
  ACTION_CLAIM_GUARD: 'on',
  ACTION_CLAIM_STREAM: 'off',
  ACTION_CLAIM_PAST: 'on',
};

async function guarded(
  parts: Array<string | llm.ChatChunk>,
  { items = [ASK] as unknown[], tools = ALL_TOOLS, env = ON } = {}
): Promise<string> {
  const stream = new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts) c.enqueue(typeof p === 'string' ? chunk(p) : p);
      c.close();
    },
  });
  const functionTools = Object.fromEntries(tools.map((t) => [t, {}]));
  const out = await withActionClaimCheck(stream, { items }, { functionTools }, 'ferni', env);
  let text = '';
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>)
    text += c.delta?.content ?? '';
  return text;
}

describe('the guard with ACTION_CLAIM_PAST on', () => {
  it.each(PAST_CLAIMS)('%j is held when its tool was open and none ran', async (sentence) => {
    const text = await guarded([`${sentence} `, 'Anything else?']);
    expect(text).not.toContain(sentence);
    expect(text).toMatch(/\byet\b/);
    expect(text).toContain('Anything else?');
  });

  it.each(LOOK_ALIKES)('%j streams untouched', async (sentence) => {
    expect(await guarded([`${sentence} `, 'Anything else?'])).toBe(`${sentence} Anything else?`);
  });

  it('the line for a held booking reads in place', async () => {
    expect(await guarded(['I booked it. ', 'Anything else?'])).toBe(
      "It isn't booked yet. Should I go ahead and book it? Anything else?"
    );
  });

  it('flag off: plain past streams untouched', async () => {
    const env = { ACTION_CLAIM_GUARD: 'on', ACTION_CLAIM_STREAM: 'off' };
    expect(await guarded(['I sent it. ', 'Anything else?'], { env })).toBe(
      'I sent it. Anything else?'
    );
  });

  it('no tool of the kind open: it stands (it may be his own story)', async () => {
    const text = await guarded(['I called her. ', 'Anything else?'], { tools: ['quickText'] });
    expect(text).toBe('I called her. Anything else?');
  });

  it('the tool is called in this reply: it stands', async () => {
    const text = await guarded(['I sent it. ', toolCall('quickText'), 'Anything else?']);
    expect(text).toContain('I sent it.');
    expect(text).not.toMatch(/\byet\b/);
  });

  it('the tool is called before the words in this reply: it stands', async () => {
    expect(await guarded([toolCall('quickText'), 'I sent it. '])).toBe('I sent it. ');
  });

  it('the tool ran and went out since the caller last spoke: it stands', async () => {
    const items = [ASK, result('quickText', '"Sent."')];
    expect(await guarded(['I sent it. '], { items })).toBe('I sent it. ');
  });

  it('the tool ran earlier on the call: "yes, I sent it" stands', async () => {
    const items = [ASK, result('quickText', '"Sent."'), user('Did you send it?')];
    expect(await guarded(['Yes, I sent it. '], { items })).toBe('Yes, I sent it. ');
  });

  it.each(['Yes, I booked it.', 'Yes, I sent it.'])(
    '%j is held when nothing ran on the call',
    async (sentence) => {
      const items = [ASK, user('Did you do it?')];
      const text = await guarded([`${sentence} `], { items });
      expect(text).not.toContain(sentence);
      expect(text).toMatch(/\byet\b/);
    }
  );

  it('the booking ran earlier on the call: "yes, I booked it" stands', async () => {
    const items = [
      ASK,
      result('createCalendarEvent', '"Booked: lunch with Sam, Friday noon."'),
      user('Did you book it?'),
    ];
    expect(await guarded(['Yes, I booked it. '], { items })).toBe('Yes, I booked it. ');
  });

  it('the tool failed earlier: the claim is held and says so', async () => {
    const items = [ASK, result('quickText', '"Nothing was sent: no number."')];
    const text = await guarded(['I sent it. '], { items });
    expect(text).not.toContain('I sent it.');
    expect(text).toContain("That didn't go through");
  });
});
