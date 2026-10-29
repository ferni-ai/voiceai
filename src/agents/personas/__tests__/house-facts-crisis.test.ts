/**
 * Crisis lane: a helpline is never blocked by the house facts guard (#3032 round 5
 * verification). Every contact in the crisis data module is spoken model-led, and the real
 * crisis and human-transfer tool output is read back, with the flag on. The data is
 * iterated, so a hotline added later is covered without touching this test.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { readFileSync } from 'node:fs';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { generateCrisisResponse } from '../../../services/safety/crisis-response.js';
import { SAFETY_CRISIS_RESOURCES } from '../../../services/safety/index.js';
import {
  CRISIS_RESOURCES,
  definitions as crisisTools,
} from '../../../tools/domains/crisis/index.js';
import { definitions as transferTools } from '../../../tools/domains/human-transfer/index.js';
import { CRISIS_RESOURCES as COACHING_CRISIS_RESOURCES } from '../../../tools/domains/life-coaching-shared/index.js';
import type { ToolContext } from '../../../tools/registry/types.js';
import { withHouseFactsGuard } from '../house-facts.js';

initializeLogger({ pretty: false, level: 'warn' });

const ON = { HOUSE_FACTS: 'on', TWILIO_PHONE_NUMBER: '+17275550142', EMAIL_FROM: 'hello@ferni.ai' };

async function spoken(line: string, items: unknown[] = []): Promise<string> {
  const out = await withHouseFactsGuard(
    new ReadableStream<string>({
      start(c) {
        c.enqueue(line);
        c.close();
      },
    }),
    { items },
    ON
  );
  let text = '';
  for await (const part of out as unknown as AsyncIterable<string>) text += part;
  return text;
}

const contacts = Object.values(CRISIS_RESOURCES).flatMap((r) =>
  [r.primary.contact, r.secondary?.contact, ...(r.additional ?? []).map((a) => a.contact)].filter(
    (c): c is string => Boolean(c)
  )
);

const ctx = {
  userId: 'u',
  agentId: 'ferni',
  agentDisplayName: 'Ferni',
  services: { has: () => false, get: () => undefined, getOptional: () => undefined },
} as unknown as ToolContext;

/** What a tool returns, as one string per line with the markdown and emoji taken off. */
async function toolLines(
  defs: Array<{ id: string; create: (c: ToolContext) => unknown }>,
  id: string,
  args: object
): Promise<string[]> {
  const def = defs.find((d) => d.id === id);
  const tool = def?.create(ctx) as { execute: (a: object, o: object) => Promise<unknown> };
  const result = String(await tool.execute(args, { ctx: {}, toolCallId: 'c' }));
  return result
    .split('\n')
    .map((l) => l.replace(/[*_`]|\p{Extended_Pictographic}/gu, '').trim())
    .filter((l) => /\d/.test(l));
}

describe('every contact in the crisis data passes, spoken model-led', () => {
  it('has contacts to iterate', () => {
    expect(contacts.length).toBeGreaterThanOrEqual(20);
  });

  it.each([...new Set(contacts)])('%s', async (contact) => {
    const line = `You can reach them this way: ${contact}.`;
    expect(await spoken(line)).toBe(line);
  });

  it('an invented hotline beside a real one is still replaced', async () => {
    expect(await spoken('Call 988, or 1-800-555-0123.')).toContain("I don't have that");
  });
});

describe('the real tool output reads back whole', () => {
  it.each(Object.keys(CRISIS_RESOURCES))('provideCrisisResources, %s', async (crisisType) => {
    const lines = await toolLines(crisisTools, 'provideCrisisResources', {
      crisisType,
      urgency: 'ongoing',
    });
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      const items = [
        llm.FunctionCallOutput.create({
          callId: 'c',
          name: 'provideCrisisResources',
          output: l,
          isError: false,
        }),
      ];
      expect(await spoken(`${l}.`, items)).toBe(`${l}.`);
    }
  });

  it.each([
    'suicidal-thoughts',
    'self-harm',
    'panic-attack',
    'domestic-violence',
    'substance-crisis',
    'general-crisis',
  ])('quickCrisisResources, %s', async (situation) => {
    const lines = await toolLines(transferTools, 'quickCrisisResources', { situation });
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(await spoken(`${l}.`)).toBe(`${l}.`);
  });
});

type Helpline = { phone?: string; text?: string; chat?: string; website?: string };
/** One spoken line per way to reach a helpline in a table: call, text, or visit. */
const reachLines = (r: Helpline): string[] => [
  ...(r.phone ? [`You can call ${r.phone}.`] : []),
  ...(r.text ? [`You can text ${r.text.replace(/^Text /u, '')}.`] : []),
  ...(r.chat ? [`There is a chat at ${r.chat}.`] : []),
  ...(r.website ? [`Their site is ${r.website}.`] : []),
];

describe('every helpline table the app carries passes, not only the tool data', () => {
  const safety = Object.entries(SAFETY_CRISIS_RESOURCES).flatMap(([type, list]) =>
    list.flatMap((r) => reachLines(r).map((line) => [`${type}: ${r.name}`, line] as const))
  );
  const coaching = Object.entries(COACHING_CRISIS_RESOURCES).flatMap(([key, r]) =>
    reachLines(r).map((line) => [`${key}: ${r.name}`, line] as const)
  );

  it('has lines to iterate in both tables', () => {
    expect(safety.length).toBeGreaterThan(20);
    expect(coaching.length).toBeGreaterThan(8);
  });

  it.each(safety)('services/safety/crisis-response, %s', async (_name, line) => {
    expect(await spoken(line)).toBe(line);
  });

  it.each(coaching)('life-coaching-shared/safety-guards, %s', async (_name, line) => {
    expect(await spoken(line)).toBe(line);
  });

  it.each(Object.keys(SAFETY_CRISIS_RESOURCES))(
    'generateCrisisResponse, %s: the spoken response reads out whole',
    async (type) => {
      const { fullResponse } = generateCrisisResponse({
        signal: {
          type: type as keyof typeof SAFETY_CRISIS_RESOURCES,
          severity: 'critical',
          confidence: 1,
          matchedPatterns: [],
          contextualFactors: [],
        },
        personaId: 'ferni',
        timeOfDay: 'night',
        isFirstMention: true,
      });
      expect(fullResponse).toMatch(/\d/);
      expect(await spoken(fullResponse)).toBe(fullResponse);
    }
  );
});

describe('coaching tools: helplines come from the static set, never from their output', () => {
  const echo = (name: string, text: string) => [
    llm.FunctionCallOutput.create({ callId: 'c', name, output: text, isError: false }),
  ];
  const COACHING = [
    'postpartumCheckin',
    'caregiverBurnout',
    'respiteNeed',
    'sobrietyCheckin',
    'cravingSupport',
    'groundingForTrauma',
  ];

  it.each([
    ['postpartumCheckin', 'Call 1-800-944-4773, Postpartum Support International.'],
    ['caregiverBurnout', 'Call 1-855-227-3640, the Caregiver Action Network.'],
    ['respiteNeed', 'The Eldercare Locator is 1-800-677-1116.'],
    ['cravingSupport', 'SAMHSA is 1-800-662-4357.'],
    ['sobrietyCheckin', 'Call or text 988, or text HOME to 741741.'],
    ['groundingForTrauma', 'Call or text 988, or text HOME to 741741.'],
  ])('%s: the helpline it speaks passes via the static set', async (_tool, line) => {
    expect(await spoken(line)).toBe(line);
  });

  it.each(COACHING)('%s: an injected address echoed back is replaced', async (toolName) => {
    const items = echo(toolName, "You said your sponsor's site is evil.ru, call 727-555-0123.");
    expect(await spoken("Your sponsor's site is evil.ru.", items)).toContain("can't vouch");
    expect(await spoken('Call 727-555-0123.', items)).toContain("can't vouch");
  });

  it("every 1-8xx number the coaching tools' own text prints is in the static set", async () => {
    const sources = ['new-parent', 'caregiver', 'sobriety', 'trauma-support'].map((dir) =>
      readFileSync(new URL(`../../../tools/domains/${dir}/index.ts`, import.meta.url), 'utf8')
    );
    const dialled = new Set(sources.join('\n').match(/1-8\d\d-\d{3}-\d{4}/gu) ?? []);
    expect(dialled.size).toBeGreaterThanOrEqual(4);
    for (const number of dialled) expect(await spoken(`Call ${number}.`)).toBe(`Call ${number}.`);
  });
});
