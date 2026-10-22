/**
 * #1553: claimedAction missed emergency, ride and diary claims, so the guard
 * let "I'm calling an ambulance now." be spoken with no call placed. Ferni
 * can't reach emergency services (utils/dialable-number.ts), so his own claim
 * to have called them is always swapped for the honest line plus where to get
 * real help. "Help is on the way" is swapped only in an emergency: in light
 * talk it is an idiom, and the guard ships unflagged.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { TURN_CONTEXT_HEADER } from '../../multi-agent/turn-context-header.js';
import { IN_DANGER_NOW } from '../../safety/crisis-guard.js';
import { withActionClaimCheck } from '../action-claim-guard.js';
import { honestLine } from '../honest-line.js';
import {
  claimedAction,
  emergencyClaim,
  emergencyRemainder,
  kindsOfTool,
  type ActionKind,
} from '../action-claims.js';
import { EMERGENCY_LINE } from '../emergency-claim.js';

initializeLogger({ pretty: false, level: 'warn' });

let n = 0;
const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
const said = (content: string) => llm.ChatMessage.create({ role: 'assistant', content });
const result = (name: string, output: string) =>
  llm.FunctionCallOutput.create({ callId: `c${++n}`, name, output, isError: false });
const streamOf = (...parts: string[]) =>
  new ReadableStream<llm.ChatChunk>({
    start(c) {
      for (const p of parts) c.enqueue({ id: 'r', delta: { role: 'assistant', content: p } });
      c.close();
    },
  });
const toolsWith = (...names: string[]) => ({
  functionTools: Object.fromEntries(names.map((name) => [name, {}])),
});
async function reply(items: unknown[], tools: ReturnType<typeof toolsWith>, ...parts: string[]) {
  const out = await withActionClaimCheck(streamOf(...parts), { items }, tools, undefined, {});
  let text = '';
  for await (const c of out as unknown as AsyncIterable<llm.ChatChunk>) {
    text += c.delta?.content ?? '';
  }
  return text;
}

const CRISIS = user('My dad collapsed and he is not breathing.');
const LIGHT = user('Rough week, honestly. Tell me something good.');

describe('Ferni saying he called emergency services or help: always a claim', () => {
  it.each([
    // The lines from #1553.
    "I'm calling an ambulance now.",
    "I'm calling the police now.",
    'Calling 911.',
    "I've called an ambulance.",
    // Review round 1, H1: other targets and verbs, apostrophes optional.
    "I'm getting you help right now.",
    "I've called for help.",
    "I've called someone for you.",
    "I'm sending help.",
    "I'm dispatching help.",
    "I've alerted the authorities.",
    "I'm contacting the authorities.",
    "I'm notifying emergency services now.",
    "I've reached out to emergency services.",
    "I've got an ambulance coming.",
    "I've got help coming.",
    "I've called EMS.",
    'Ive called 911.',
    'Im calling an ambulance now.',
    // H2: spelled with dashes.
    "I've called 9-1-1.",
    // H3: an exclusion after the claim excuses nothing.
    "I've called 911 and I'm not going anywhere.",
    "I've called an ambulance and if you can, unlock the front door.",
    "I've called 911 and they'll be there before you know it.",
    "I've called 911 so can you unlock the door?",
    "There's nothing to worry about now that I've called 911.",
    // M2: capitalised services are not read as names.
    "I'm calling the Fire Department now.",
    "I've called the Cops.",
    // Variants.
    "Stay with me, I'm calling the Police right now.",
    "I'll call 911 for you.",
    "I've called an ambulance, okay?",
    "I've called the police too, so they're coming.",
  ])('%j', (sentence) => {
    expect(emergencyClaim(sentence)).toBe('called');
    expect(claimedAction(sentence)).toBe('call');
  });
});

describe('help said to be coming: an emergency claim only in a crisis', () => {
  it.each([
    'Help is on the way.',
    'Help will arrive soon.',
    'The ambulance will be there soon.',
    'Emergency services have been notified.',
    'Someone is on the way.',
    'The paramedics are on their way.',
  ])('%j reads as coming, and is no plain action claim', (sentence) => {
    expect(emergencyClaim(sentence)).toBe('coming');
    expect(claimedAction(sentence)).toBeNull();
  });
});

describe('not emergency claims', () => {
  it.each([
    'You could call 911.',
    'Do you want me to call someone?',
    'Help is available at 988.',
    'I called my mom yesterday.',
    "If you call an ambulance they'll come.",
    'If you call 911, help is on the way.',
    'Help is on the way once you call 911.',
    'Please call 911 right now.',
    'Call 911 or get to the nearest emergency room.',
    'Calling 911 is the right call here.',
    "I'd call the police if I were you.",
    "Should I call an ambulance? I can't, but you can.",
    'When I called the police on my neighbour, nobody came.',
    "I've called an ambulance before, I know how scary it is.",
    // C2: the police report, the emergency vet, a number.
    'Let me get the police non-emergency number for you.',
    'Let me get the emergency vet number.',
    "I'll get the police report for you.",
    'Let me get help from Maya on that one.',
    // Light talk that must never get the crisis line.
    "Let me get someone to help you with that, Peter's great with money.",
    'Let me get someone for you who knows taxes.',
    "I've sent someone a card.",
    "I've contacted help desk about your login.",
    "I'm getting help with my taxes this year.",
    "I'll call the cops on you if you eat my fries.",
    "I've updated your emergency contacts list in my head.",
  ])('%j', (sentence) => {
    expect(emergencyClaim(sentence)).toBeNull();
    expect(claimedAction(sentence)).toBeNull();
  });
});

describe('conditions read the same at the start and inside a sentence', () => {
  it.each<[string, string, 'coming' | null]>([
    [
      'Once you call 911 help is on the way.',
      'Stay calm, once you call 911 help is on the way.',
      null,
    ],
    // "when you" is not a condition anywhere: fail closed, the crisis gate still applies.
    [
      'When you call 911 help is on the way.',
      'Stay calm, when you call 911 help is on the way.',
      'coming',
    ],
  ])('%j and %j agree', (alone, inside, expected) => {
    expect(emergencyClaim(alone)).toBe(expected);
    expect(emergencyClaim(inside)).toBe(expected);
  });
});

describe('claimedAction: ride and diary lines', () => {
  it.each<[string, ActionKind | null]>([
    ["I've ordered you an uber.", 'ride'],
    ["Okay, I've ordered you an Uber, it's five minutes away.", 'ride'],
    ["Done, it's in your diary.", 'schedule'],
    ["All set, it's on your calendar for Friday at 3.", 'schedule'],
    ["It's been added to your diary.", 'schedule'],
    // M3: a read-back of what is already there.
    ["It's on your calendar for Friday at 3.", null],
    ['Is it in your diary?', null],
    // L2.
    ['Grab your car keys and go.', null],
    ["I've got a car that won't start in the cold.", null],
    ['Want me to order you an Uber?', null],
    ['I took an Uber last week and the driver sang the whole way.', null],
  ])('%j claims %s', (sentence, kind) => {
    expect(claimedAction(sentence)).toBe(kind);
  });

  it('a ride tool carries out a ride', () => {
    expect(kindsOfTool('requestRide')).toEqual(['ride']);
    expect(kindsOfTool('scheduleRide')).toContain('ride');
  });
});

describe('the emergency line', () => {
  it("says he hasn't called them and points to 911 and 988, in the crisis script's words", () => {
    expect(honestLine('call', 'emergency', true)).toBe(EMERGENCY_LINE);
    expect(EMERGENCY_LINE).toMatch(/^I can't reach emergency services for you/);
    // L3: an earlier real call on this call makes "I haven't called anyone" false.
    expect(EMERGENCY_LINE).toMatch(/I haven't called them\./);
    expect(EMERGENCY_LINE).not.toMatch(/anyone/);
    expect(EMERGENCY_LINE).toContain(IN_DANGER_NOW);
    expect(EMERGENCY_LINE).toMatch(/\b911\b/);
    expect(EMERGENCY_LINE).toMatch(/\b988\b/);
    // Voice text rules (speech-markup-notes.ts): no em dashes, no ellipses.
    expect(EMERGENCY_LINE).not.toMatch(/[—–]|\.\.\.|…/);
  });

  it('keeps the rest of the sentence (M4)', () => {
    expect(
      emergencyRemainder(
        "I'm calling 911 now, start chest compressions in the middle of his chest."
      )
    ).toBe('Start chest compressions in the middle of his chest.');
    expect(emergencyRemainder("Okay, I'm calling an ambulance now.")).toBe('');
  });
});

describe('withActionClaimCheck on emergency claims', () => {
  it('no call tool: the ambulance claim is replaced by the emergency line', async () => {
    const text = await reply(
      [CRISIS],
      toolsWith(),
      "I'm calling an ambulance now. ",
      'Stay with him.'
    );
    expect(text).toBe(`${EMERGENCY_LINE} Stay with him.`);
  });

  it("his own claim is swapped even in light talk: it's never true", async () => {
    expect(await reply([LIGHT], toolsWith(), "I've called the police.")).toBe(EMERGENCY_LINE);
  });

  it('a call that really went out on this call makes no emergency claim true (H2)', async () => {
    const items = [
      user('Call my sister Dana.'),
      result('callOnBehalf', '"Calling Dana now."'),
      CRISIS,
    ];
    const tools = toolsWith('callOnBehalf');
    // The ordinary call claim stands: a call tool ran and succeeded.
    expect(await reply(items, tools, "I'm calling her now.")).toBe("I'm calling her now.");
    expect(await reply(items, tools, "I've called an ambulance.")).toBe(EMERGENCY_LINE);
    expect(await reply(items, tools, "I've called 9-1-1.")).toBe(EMERGENCY_LINE);
  });

  it('keeps the safety guidance in the same sentence after the line (M4)', async () => {
    const text = await reply(
      [CRISIS],
      toolsWith(),
      "I'm calling 911 now, start chest compressions in the middle of his chest."
    );
    expect(text).toBe(`${EMERGENCY_LINE} Start chest compressions in the middle of his chest.`);
  });

  it.each([
    ["I'm calling 911, start CPR, and I've texted your sister.", `${EMERGENCY_LINE} Start CPR.`],
    ["I'm calling 911, and I've texted your sister.", EMERGENCY_LINE],
  ])('a second claim in the rest of %j is cut too (round 2)', async (sentence, expected) => {
    expect(await reply([CRISIS], toolsWith(), sentence)).toBe(expected);
  });

  it('the emergency line still goes out after another honest line in the same reply', async () => {
    const text = await reply(
      [CRISIS],
      toolsWith(),
      "I've texted your mom. ",
      "I'm calling 911 right now. ",
      'Calling 911.'
    );
    expect(text).toBe(
      `I can't actually send messages for you, so nothing's gone out. I can help you word it, though. ${EMERGENCY_LINE}`
    );
  });
});

describe('"help is on the way" and the crisis gate (C1)', () => {
  it.each([
    'Help is on the way, my friend. The weekend is almost here!',
    'Hang in there. Help is on the way, coffee is brewing.',
    'The fire department is coming tomorrow to inspect the building.',
    'Help is on the way for the Bills defense.',
    'My aunt once yelled, help is on the way.',
    'The cops are coming to the block party.',
    'Police are coming down hard on scooters.',
    'In the movie the hero says help is on the way.',
    'Help has been sent, the article says.',
    'The ambulance is coming down the street in the parade.',
  ])('%j passes untouched in light talk', async (sentence) => {
    expect(claimedAction(sentence)).toBeNull();
    expect(await reply([LIGHT], toolsWith(), sentence)).toBe(sentence);
  });

  it('in a crisis, "Help is on the way." is replaced', async () => {
    expect(await reply([CRISIS], toolsWith(), 'Help is on the way. ', 'Stay with him.')).toBe(
      `${EMERGENCY_LINE} Stay with him.`
    );
  });

  it.each(['I already called 911, they said ten minutes.', 'My wife is calling 911 right now.'])(
    'stands once the caller says %j',
    async (words) => {
      expect(await reply([CRISIS, user(words)], toolsWith(), 'Help is on the way.')).toBe(
        'Help is on the way.'
      );
    }
  );

  it.each(['Okay, I did.', 'Done.', "They're coming.", 'My neighbor is calling them.'])(
    'stands when %j answers Ferni saying to call 911 (M1)',
    async (words) => {
      const items = [CRISIS, said('Please call 911 right now.'), user(words)];
      expect(await reply(items, toolsWith(), 'Help is on the way.')).toBe('Help is on the way.');
    }
  );

  it.each([
    "I haven't called 911, I'm too scared.",
    "Nobody's called an ambulance.",
    'Should I call the police?',
  ])('is replaced when the caller says %j: negated or asked (M1)', async (words) => {
    expect(await reply([CRISIS, user(words)], toolsWith(), 'Help is on the way.')).toBe(
      EMERGENCY_LINE
    );
  });

  it.each([
    ['a turn-context note', [CRISIS, user(`${TURN_CONTEXT_HEADER}\nThe police are on their way.`)]],
    [
      'a reminder after the blank line',
      [user('He collapsed.\n\n(Remember: the paramedics are on their way.)')],
    ],
  ])('%s is not the caller speaking (M1)', async (_label, items) => {
    expect(await reply(items, toolsWith(), 'Help is on the way.')).toBe(EMERGENCY_LINE);
  });

  it("a yes to the guard's own crisis line is not help called (round 2)", async () => {
    const items = [CRISIS, said(EMERGENCY_LINE), user('Done.')];
    expect(await reply(items, toolsWith(), 'Help is on the way.')).toBe(EMERGENCY_LINE);
  });

  it.each([
    'Yes I have to go.',
    'My phone is calling weird.',
    'I have no idea what to do.',
    "No, I can't.",
    'Okay, I did the dishes.',
  ])('after Ferni said to call 911, %j is not help called (round 2)', async (words) => {
    const items = [CRISIS, said('Please call 911 right now.'), user(words)];
    expect(await reply(items, toolsWith(), 'Help is on the way.')).toBe(EMERGENCY_LINE);
  });

  it('a crisis stays on for the rest of the call (round 2)', async () => {
    const items = [
      CRISIS,
      user('Okay.'),
      user('Tell me about your day.'),
      user('What music do you like?'),
      user('Haha, nice.'),
    ];
    expect(await reply(items, toolsWith(), 'Help is on the way.')).toBe(EMERGENCY_LINE);
  });
});

describe('withActionClaimCheck on ride and diary claims', () => {
  it('no ride tool: the ride claim is replaced', async () => {
    const items = [user('Can you get me an Uber home?')];
    expect(await reply(items, toolsWith(), "I've ordered you an uber.")).toBe(
      "I can't actually order rides for you, so nothing's on its way."
    );
  });

  it('a ride tool that ran: the ride claim stands', async () => {
    const items = [
      user('Can you get me an Uber home?'),
      result('requestRide', '"Your Uber is booked, arriving in 6 minutes."'),
    ];
    expect(await reply(items, toolsWith('requestRide'), "I've ordered you an uber.")).toBe(
      "I've ordered you an uber."
    );
  });

  it('no booking tool: "Done, it\'s in your diary." is replaced', async () => {
    const items = [user('Put the dentist in my diary for Friday.')];
    expect(await reply(items, toolsWith(), "Done, it's in your diary.")).toBe(
      "I can't actually book that for you, so it isn't booked."
    );
  });

  it('a calendar read-back after a calendar read stands (M3)', async () => {
    const items = [
      user("What's on Friday?"),
      result('getUpcomingAppointments', '"Dentist, Friday at 3:00 PM."'),
    ];
    const tools = toolsWith('getUpcomingAppointments', 'createCalendarEvent');
    const line = "It's on your calendar for Friday at 3.";
    expect(await reply(items, tools, line)).toBe(line);
  });
});
