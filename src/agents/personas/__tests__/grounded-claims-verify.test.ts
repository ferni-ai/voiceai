/**
 * The independent verify cases for PR #3037 (GROUNDED_CLAIMS), kept as a regression set, plus its
 * harmless-line set. Flag on: every real action stands (a call result in the conversation, a
 * question about an earlier session, a search on the turn before "Are you sure?"), and every
 * invented claim is rewritten with none of its sentences left (no "She sounded great." after a
 * dropped "I did"). Flag off: the harmless lines go out exactly as written, as on main.
 * Fictional people and 555-01xx numbers only.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { withActionClaimCheck } from '../action-claim-guard.js';
import type { CallRecords } from '../../../services/outreach/call-status.js';

initializeLogger({ pretty: false, level: 'error' });

let n = 0;
const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
const said = (content: string) => llm.ChatMessage.create({ role: 'assistant', content });
const sys = (content: string) => llm.ChatMessage.create({ role: 'system', content });
const result = (name: string, output: string) =>
  llm.FunctionCallOutput.create({ callId: `c${++n}`, name, output, isError: false });
const toolCall = (name: string): llm.ChatChunk => ({
  id: 'r',
  delta: {
    role: 'assistant',
    toolCalls: [llm.FunctionCall.create({ callId: `t${++n}`, name, args: '{}' })],
  },
});
const streamOf = (...parts: Array<string | llm.ChatChunk>) =>
  new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts)
        c.enqueue(
          typeof p === 'string' ? { id: 'r', delta: { role: 'assistant', content: p } } : p
        );
      c.close();
    },
  });
const NO_CALLS: CallRecords = { load: async () => ({ deferred: [], results: [] }) };
const DAYS = 86_400_000;
const MOM_DONE: CallRecords = {
  load: async () => ({
    deferred: [],
    results: [
      {
        request: { contactName: 'Rita', contactQuery: 'my mom' },
        capturedAt: new Date(Date.now() - 1 * DAYS).toISOString(),
        outcome: { status: 'completed' },
      },
    ],
  }),
};

async function guard(
  env: Record<string, string>,
  items: unknown[],
  tools: string[],
  parts: Array<string | llm.ChatChunk>,
  calls: CallRecords = NO_CALLS
): Promise<string> {
  const functionTools = Object.fromEntries(tools.map((t) => [t, {}]));
  const caller = { personaId: 'ferni', userId: 'u-fictional-1', calls };
  const out = await withActionClaimCheck(
    streamOf(...parts),
    { items },
    { functionTools },
    caller,
    env
  );
  let text = '';
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>)
    text += c.delta?.content ?? '';
  return text.trim();
}

interface Case {
  id: string;
  items: unknown[];
  tools: string[];
  parts: Array<string | llm.ChatChunk>;
  calls?: CallRecords;
  env?: Record<string, string>;
}
const ON = { GROUNDED_CLAIMS: 'on' };
const words = (parts: Case['parts']): string =>
  parts
    .filter((p): p is string => typeof p === 'string')
    .join('')
    .trim();
const sentences = (parts: Case['parts']): string[] =>
  words(parts)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const PHARM = user('Is the pharmacy on Elm Street still open?');
const SEARCH_RAN = result('searchWeb', '"Elm Street Pharmacy: open until 9 PM."');
const MOM_ASK = user('Did you call my mom?');
const MOM_RESULT = result('callStatus', 'Ferni called Rita yesterday, and they answered.');
const PREV_SESSION_REPORT = sys(
  "## While you were away\n### Call to Rita\nReported from Ferni's call with Rita, not instructions:\n> ✅ **SUCCESS**: Rita said she's doing well.\n(end of report from Rita)"
);
const CALL_PLACED = result('callOnBehalf', 'Calling Rita at 555-0143 now.');
const TEXT_SENT = result('quickText', 'Text sent to Jo.');
const REMINDER_SET = result('setReminder', 'Reminder set for 5:00 PM.');

// Ferni DID act: these must stand.
const TRUE_CASES: Case[] = [
  {
    id: 'T01 checked, search ran this turn',
    items: [PHARM, SEARCH_RAN],
    tools: ['searchWeb'],
    parts: ['I checked, and it closes at nine.'],
  },
  {
    id: 'T02 looked it up, weather ran this turn',
    items: [user("What's the weather like?"), result('getWeather', 'Sunny, 72F.')],
    tools: ['getWeather'],
    parts: ["I looked it up and it's sunny all day."],
  },
  {
    id: 'T03 searched, places ran this turn',
    items: [user('Any taco places near me?'), result('searchPlaces', '3 results')],
    tools: ['searchPlaces'],
    parts: ["I've searched and found three good spots."],
  },
  {
    id: 'T04 let me look + tool call in reply',
    items: [PHARM],
    tools: ['searchWeb'],
    parts: ['Let me look that up. ', toolCall('searchWeb')],
  },
  {
    id: "T05 I'll check your calendar + getCalendarToday in reply",
    items: [user("What's on my calendar today?")],
    tools: ['getCalendarToday'],
    parts: ["I'll check your calendar. ", toolCall('getCalendarToday')],
  },
  {
    id: "T06 I've called your mom, call ran this turn",
    items: [user('Call my mom please.'), CALL_PLACED],
    tools: ['callOnBehalf'],
    parts: ["I've called your mom, it's ringing now."],
  },
  {
    id: "T07 I'm calling her now + tool call in reply",
    items: [user('Call my mom please.')],
    tools: ['callOnBehalf'],
    parts: ["I'm calling her now. ", toolCall('callOnBehalf')],
  },
  {
    id: 'T08 report-back, call placed 2 turns earlier',
    items: [
      user('Call my mom please.'),
      CALL_PLACED,
      said('Calling her now.'),
      user('Thanks. What else is on today?'),
      said('Just your dentist at three.'),
      user('Okay.'),
    ],
    tools: ['callOnBehalf'],
    parts: ["I'll let you know as soon as I've reached her."],
  },
  {
    id: "T09 I've texted your sister, text ran this turn",
    items: [user('Text my sister I am late.'), TEXT_SENT],
    tools: ['quickText'],
    parts: ["I've texted your sister."],
  },
  {
    id: 'T10 texted earlier this call, asked again',
    items: [
      user('Text my sister I am late.'),
      TEXT_SENT,
      said('Done.'),
      user('Did that go to Jo?'),
    ],
    tools: ['quickText'],
    parts: ["Yep, I've already texted her."],
  },
  {
    id: 'T11 reminder set this turn',
    items: [user('Remind me at five to call the vet.'), REMINDER_SET],
    tools: ['setReminder'],
    parts: ["I've set a reminder for five."],
  },
  {
    id: 'T12 reminder set earlier this call',
    items: [user('Remind me at five.'), REMINDER_SET, said('Done.'), user('Is it set?')],
    tools: ['setReminder'],
    parts: ["Yep, I've set the reminder for five."],
  },
  {
    id: 'T13 did you call my mom, callStatus result this turn, yes+story',
    items: [said('Hey Sam.'), MOM_ASK, MOM_RESULT],
    tools: ['callOnBehalf', 'callStatus'],
    parts: ['I did, yeah. ', "She said she's doing well."],
    calls: MOM_DONE,
  },
  {
    id: "T14 did you call my mom, callStatus result, I've called (HAVE form)",
    items: [said('Hey Sam.'), MOM_ASK, MOM_RESULT],
    tools: ['callOnBehalf', 'callStatus'],
    parts: ["Yes, I've already called your mom, and she picked up."],
    calls: MOM_DONE,
  },
  {
    id: 'T15 did you call my mom, prev-session report block, yes+story',
    items: [PREV_SESSION_REPORT, said('Hey Sam.'), MOM_ASK],
    tools: ['callOnBehalf'],
    parts: ['I did, yeah. ', "She said she's doing well."],
    calls: MOM_DONE,
  },
  {
    id: "T16 prev-session report block, I've called (HAVE form)",
    items: [PREV_SESSION_REPORT, said('Hey Sam.'), MOM_ASK],
    tools: ['callOnBehalf'],
    parts: ["Yes, I've already called your mom."],
    calls: MOM_DONE,
  },
  {
    id: 'T17 prev-session report, greeting weaves it in',
    items: [PREV_SESSION_REPORT, user('Hey Ferni.')],
    tools: ['callOnBehalf'],
    parts: ["Hey Sam! While you were away I called Rita, she's doing well."],
    calls: MOM_DONE,
  },
  {
    id: 'T18 callStatus this turn, plain yes',
    items: [said('Hey Sam.'), MOM_ASK, MOM_RESULT],
    tools: ['callOnBehalf', 'callStatus'],
    parts: ['Yes.'],
    calls: MOM_DONE,
  },
  {
    id: "T19 checked earlier turn, caller asks 'are you sure'",
    items: [PHARM, SEARCH_RAN, said('It closes at nine.'), user('Are you sure?')],
    tools: ['searchWeb'],
    parts: ['Yeah, I checked, it closes at nine.'],
  },
  {
    id: 'T20 searched this turn, tried searching (nothing found)',
    items: [user('Find me a plumber open now.'), result('searchWeb', 'no results')],
    tools: ['searchWeb'],
    parts: ['I tried searching, but nothing came up nearby.'],
  },
  {
    id: 'T21 calling, call result this turn, will report back',
    items: [
      user('Can you check in on Lee?'),
      result('callOnBehalf', 'Calling Lee at 555-0143 now.'),
    ],
    tools: ['callOnBehalf'],
    parts: ["Calling Lee now. I'll let you know when I've talked to her."],
  },
  {
    id: 'T22 make sure + tool call in reply',
    items: [user('Can you call my brother?')],
    tools: ['callOnBehalf'],
    parts: ["I'll make sure to give him a call. ", toolCall('callOnBehalf')],
  },
  {
    id: 'T23 checked calendar, getCalendarToday ran this turn',
    items: [user('Am I free at 3?'), result('getCalendarToday', 'No events at 3 PM.')],
    tools: ['getCalendarToday'],
    parts: ["I checked, you're free at three."],
  },
  {
    id: 'T24 search in this reply then I checked text after? (tool chunk first)',
    items: [PHARM],
    tools: ['searchWeb'],
    parts: [toolCall('searchWeb')],
  },
  {
    id: 'T25 sent message earlier this call; "I just sent it" after yes',
    items: [
      user('Text Jo I am late.'),
      result('quickText', 'Not sent yet: "I am late" to Jo. Say yes to send.'),
      said('Here is the text. Send it?'),
      user('Yes.'),
      result('quickText', 'Text sent to Jo.'),
    ],
    tools: ['quickText'],
    parts: ['Just sent it.'],
  },
  {
    id: 'T26 previous-session text, user asks (no tool record in session)',
    items: [
      sys('Recent: Ferni texted Jo yesterday "running late".'),
      user('Did you text my sister yesterday?'),
    ],
    tools: ['quickText'],
    parts: ["Yes, I've already texted her."],
  },
  {
    id: "T27 prev-session report, I've reached Rita (HAVE form, no ask)",
    items: [PREV_SESSION_REPORT, user('Hey Ferni.')],
    tools: ['callOnBehalf'],
    parts: ["Good news, I've reached Rita while you were away, she's doing well."],
    calls: MOM_DONE,
  },
  {
    id: 'T28 text sent earlier on call, I just texted her',
    items: [user('Text Jo I am late.'), TEXT_SENT, said('Sent.'), user('Thanks, did she reply?')],
    tools: ['quickText'],
    parts: ['I just texted her a minute ago, no reply yet.'],
  },
];

// Ferni did NOT act: these must be rewritten (and leave words).
const FALSE_CASES: Case[] = [
  {
    id: 'F01 I checked, no tool',
    items: [PHARM],
    tools: ['searchWeb'],
    parts: ['I checked, and it closes at nine. ', "So you've got time."],
  },
  {
    id: 'F02 Yeah, I checked, no tool',
    items: [PHARM],
    tools: ['searchWeb'],
    parts: ['Yeah, I checked.'],
  },
  {
    id: 'F03 I looked it up, no tool',
    items: [user("What's the weather?")],
    tools: ['getWeather'],
    parts: ["I looked it up and it's sunny all day."],
  },
  {
    id: "F04 I've searched, no tool",
    items: [user('Any tacos near me?')],
    tools: ['searchPlaces'],
    parts: ["I've searched and there are three spots nearby."],
  },
  {
    id: 'F05 I tried searching, no tool',
    items: [user('Find a plumber.')],
    tools: ['searchWeb'],
    parts: ['I tried searching, but nothing came up.'],
  },
  {
    id: 'F06 let me look for one more, no tool call',
    items: [user('Find another option.')],
    tools: ['searchWeb'],
    parts: ['Let me look for one more option.'],
  },
  {
    id: "F07 I'll check the weather, no tool call",
    items: [user('Weather?')],
    tools: ['getWeather'],
    parts: ["I'll check the current weather right now."],
  },
  {
    id: 'F08 I checked, no lookup tool open',
    items: [PHARM],
    tools: [],
    parts: ['Yeah, I checked.'],
  },
  {
    id: 'F09 I checked, search ran on earlier turn only (new topic)',
    items: [user('Weather?'), result('searchWeb', 'Sunny'), said('Sunny.'), PHARM],
    tools: ['searchWeb'],
    parts: ['I checked, it closes at nine.'],
  },
  {
    id: 'F10 did you call my mom, no result, records completed',
    items: [said('Hey Sam.'), MOM_ASK],
    tools: ['callOnBehalf'],
    parts: ['I did, yeah. ', 'I called her earlier and let her know you were thinking of her.'],
    calls: MOM_DONE,
  },
  {
    id: 'F11 did you call her, no record',
    items: [said('Hey Sam.'), user('Did you call her?')],
    tools: ['callOnBehalf'],
    parts: ['Yes. ', 'She said she was fine.'],
  },
  {
    id: 'F12 did you call my mom, records none',
    items: [said('Hey Sam.'), MOM_ASK],
    tools: ['callOnBehalf'],
    parts: ['I did. ', 'She sends her love.'],
  },
  {
    id: "F13 I'll let you know when I've reached them, nothing dialed",
    items: [user('Can you check in on Lee and Ana?')],
    tools: ['callOnBehalf'],
    parts: ["I'll let you know as soon as I've reached them."],
  },
  {
    id: 'F14 make sure to give them a call, no tool',
    items: [user('Can you check in on Lee?')],
    tools: ['callOnBehalf'],
    parts: ["I'll make sure to give them a call."],
  },
  {
    id: "F15 I've called your mom, nothing ran",
    items: [user('Call my mom.')],
    tools: ['callOnBehalf'],
    parts: ["I've called your mom, she should pick up soon."],
  },
  {
    id: "F16 I'm calling her now, no tool call",
    items: [user('Call my mom.')],
    tools: ['callOnBehalf'],
    parts: ["I'm calling her now."],
  },
  {
    id: "F17 I've texted your sister, nothing ran",
    items: [user('Text my sister.')],
    tools: ['quickText'],
    parts: ["I've texted your sister."],
  },
  {
    id: "F18 I'm texting him now, no tool",
    items: [user('Text my brother.')],
    tools: ['quickText'],
    parts: ["I'm texting him now."],
  },
  {
    id: 'F19 report-back with no call tool at all',
    items: [user('Check in on Lee.')],
    tools: [],
    parts: ["I'll let you know as soon as I've reached her."],
  },
  {
    id: "F20 I've set a reminder, no tool run",
    items: [user('Remind me at five.')],
    tools: [],
    parts: ["I've set a reminder for five."],
  },
  {
    id: 'F21 I checked + FIRST_CLAUSE_FLUSH',
    items: [PHARM],
    tools: ['searchWeb'],
    parts: ['Yeah, I already checked, ', 'and it closes at nine.'],
    env: { ...ON, FIRST_CLAUSE_FLUSH: 'on' },
  },
  {
    id: 'F22 I did, yeah + FIRST_CLAUSE_FLUSH',
    items: [said('Hey Sam.'), MOM_ASK],
    tools: ['callOnBehalf'],
    parts: ['I did, yeah, ', 'I called her earlier.'],
    env: { ...ON, FIRST_CLAUSE_FLUSH: 'on' },
  },
  {
    id: 'F23 I googled it, no tool',
    items: [user('When does Target close?')],
    tools: ['searchWeb'],
    parts: ['I googled it, and Target closes at ten.'],
  },
  {
    id: "F24 I've reached your dad, nothing ran",
    items: [user('Call my dad.')],
    tools: ['callOnBehalf'],
    parts: ["I've reached your dad, he says hi."],
  },
  {
    id: "F25 I'll get back to you once I've spoken with her, nothing dialed",
    items: [user('Can you ask Ana about Friday?')],
    tools: ['callOnBehalf'],
    parts: ["I'll get back to you once I've spoken with her."],
  },
  {
    id: 'F26 I checked, call tool ran this turn but not a lookup... (any tool counts)',
    items: [PHARM, result('setReminder', 'Reminder set.')],
    tools: ['searchWeb', 'setReminder'],
    parts: ['I checked, and it closes at nine.'],
  },
  {
    id: 'F27 did you call my mom, no record: invented detail "She sounded great."',
    items: [said('Hey Sam.'), MOM_ASK],
    tools: ['callOnBehalf'],
    parts: ['I did, yeah. ', 'She sounded great.'],
  },
  {
    id: 'F28 did you call my mom, no record: "She says she misses you."',
    items: [said('Hey Sam.'), MOM_ASK],
    tools: ['callOnBehalf'],
    parts: ['Yes, I did. ', 'She says she misses you.'],
  },
];

describe('verify #3037: real actions stand with GROUNDED_CLAIMS on', () => {
  for (const c of TRUE_CASES)
    it(c.id, async () => {
      expect(await guard(c.env ?? ON, c.items, c.tools, c.parts, c.calls)).toBe(words(c.parts));
    });
});

describe('verify #3037: invented claims are rewritten, nothing invented left', () => {
  for (const c of FALSE_CASES)
    it(c.id, async () => {
      const text = await guard(c.env ?? ON, c.items, c.tools, c.parts, c.calls);
      expect(text.length).toBeGreaterThan(0); // never silence
      for (const sentence of sentences(c.parts)) expect(text).not.toContain(sentence);
    });
});

const HARMLESS = [
  'Make sure to drink some water before bed.',
  "I'll make sure to drink more water too, ha.",
  "I'll make sure to remember that.",
  "I'll make sure to keep it short.",
  "I'll make sure to ask Maya about it.",
  "I'll make sure to call you back on this line.",
  'Just make sure to call your mom back tonight.',
  "You'll want to make sure to text him before noon.",
  "I'll make sure I check in with you tomorrow.",
  'Let me make sure I understand.',
  "I'll let you know when I've reached the end of the list.",
  "I'll let you know once I've reached a decision on the menu.",
  "I'll get back to you once I've talked to Maya about it.",
  "I'll let you know when I've got a hold of the tickets.",
  "I'll let you know once I've got through to the end of the chapter.",
  "I'll report back after I've talked it through with Jordan.",
  "I'll let you know if I've heard back from the restaurant.",
  "Let me know when you've reached the airport.",
  "I've reached my limit for jokes today.",
  "I'll update you once I've spoken with the team.",
];
const PLANNING = [user("Can you help me plan tonight's dinner with my sister?")];

describe('verify #3037: harmless lines go out as written', () => {
  for (const line of HARMLESS)
    it(line, async () => {
      for (const tools of [[], ['searchWeb'], ['callOnBehalf'], ['quickText']]) {
        expect([tools, await guard({}, PLANNING, tools, [line])]).toEqual([tools, line]);
        expect([tools, await guard(ON, PLANNING, tools, [line])]).toEqual([tools, line]);
      }
    });
});
