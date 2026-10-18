/**
 * #1553: claimedAction missed emergency, ride and diary claims, so the guard
 * let "I'm calling an ambulance now." be spoken with no call placed. Ferni
 * can't reach emergency services (utils/dialable-number.ts), so an emergency
 * claim is always swapped for the honest line plus where to get real help.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { IN_DANGER_NOW } from '../../safety/crisis-guard.js';
import { honestLine, withActionClaimCheck } from '../action-claim-guard.js';
import { claimedAction, emergencyClaim, kindsOfTool, type ActionKind } from '../action-claims.js';
import { EMERGENCY_LINE } from '../emergency-claim.js';

initializeLogger({ pretty: false, level: 'warn' });

let n = 0;
const user = (content: string) => llm.ChatMessage.create({ role: 'user', content });
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

describe('claimedAction: the lines from #1553', () => {
  it.each<[string, ActionKind, 'called' | 'coming' | null]>([
    ["I'm calling an ambulance now.", 'call', 'called'],
    ["I'm calling the police now.", 'call', 'called'],
    ['Calling 911.', 'call', 'called'],
    ['Help is on the way.', 'call', 'coming'],
    ["I've called an ambulance.", 'call', 'called'],
    ["I've ordered you an uber.", 'ride', null],
    ["Done, it's in your diary.", 'schedule', null],
    // Variants the same patterns must keep catching.
    ["Okay, I've ordered you an Uber, it's five minutes away.", 'ride', null],
    ["Stay with me, I'm calling the Police right now.", 'call', 'called'],
    ["I'll call 911 for you.", 'call', 'called'],
    ['The paramedics are on their way.', 'call', 'coming'],
    ["I've called an ambulance, okay?", 'call', 'called'],
  ])('%j claims %s', (sentence, kind, emergency) => {
    expect(claimedAction(sentence)).toBe(kind);
    expect(emergencyClaim(sentence)).toBe(emergency);
  });

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
    'Want me to order you an Uber?',
    'I took an Uber last week and the driver sang the whole way.',
    "I've got a car that won't start in the cold.",
    'Is it in your diary?',
    "I've updated your emergency contacts list in my head.",
  ])('%j is not a claim', (sentence) => {
    expect(claimedAction(sentence)).toBeNull();
    expect(emergencyClaim(sentence)).toBeNull();
  });

  it('a ride tool carries out a ride', () => {
    expect(kindsOfTool('requestRide')).toEqual(['ride']);
    expect(kindsOfTool('scheduleRide')).toContain('ride');
  });
});

describe('the emergency line', () => {
  it('says nobody was called and points to 911 and 988, in the crisis script words', () => {
    expect(honestLine('call', 'emergency', true)).toBe(EMERGENCY_LINE);
    expect(EMERGENCY_LINE).toMatch(/^I can't call emergency services for you/);
    expect(EMERGENCY_LINE).toMatch(/haven't called anyone/);
    expect(EMERGENCY_LINE).toContain(IN_DANGER_NOW);
    expect(EMERGENCY_LINE).toMatch(/\b911\b/);
    expect(EMERGENCY_LINE).toMatch(/\b988\b/);
    // Voice text rules (speech-markup-notes.ts): no em dashes, no ellipses.
    expect(EMERGENCY_LINE).not.toMatch(/[—–]|\.\.\.|…/);
  });
});

describe('withActionClaimCheck on emergency claims', () => {
  const CRISIS = user('My dad collapsed and he is not breathing.');

  it('no call tool: the ambulance claim is replaced by the emergency line', async () => {
    const text = await reply(
      [CRISIS],
      toolsWith(),
      "I'm calling an ambulance now. ",
      'Stay with him.'
    );
    expect(text).toBe(`${EMERGENCY_LINE} Stay with him.`);
  });

  it('a call that really went out on this call does not make an emergency claim true', async () => {
    const items = [
      user('Call my sister Dana.'),
      result('callOnBehalf', '"Calling Dana now."'),
      CRISIS,
    ];
    const tools = toolsWith('callOnBehalf');
    // The ordinary call claim stands: a call tool ran and succeeded.
    expect(await reply(items, tools, "I'm calling her now.")).toBe("I'm calling her now.");
    // The emergency one never stands: no tool can reach 911.
    expect(await reply(items, tools, "I've called an ambulance.")).toBe(EMERGENCY_LINE);
  });

  it('"help is on the way" is replaced unless the caller said they called for help', async () => {
    expect(await reply([CRISIS], toolsWith(), 'Help is on the way.')).toBe(EMERGENCY_LINE);
    const called = [CRISIS, user('I already called 911, they said ten minutes.')];
    expect(await reply(called, toolsWith(), 'Help is on the way. ', 'Stay with him.')).toBe(
      'Help is on the way. Stay with him.'
    );
    // His own claim to have called is still false, whatever the caller did.
    expect(await reply(called, toolsWith(), "I've called the police too, so they're coming.")).toBe(
      EMERGENCY_LINE
    );
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
});
