/**
 * Crisis lane: a helpline is never blocked by the house facts guard (#3032 round 5
 * verification). Every contact in the crisis data module is spoken model-led, and the real
 * crisis and human-transfer tool output is read back, with the flag on. The data is
 * iterated, so a hotline added later is covered without touching this test.
 */
import { initializeLogger, llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import { definitions as crisisTools } from '../../../tools/domains/crisis/index.js';
import { CRISIS_RESOURCES } from '../../../tools/domains/crisis/crisis-resources.js';
import { definitions as transferTools } from '../../../tools/domains/human-transfer/index.js';
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
