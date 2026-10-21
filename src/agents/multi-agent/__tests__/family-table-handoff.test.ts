/**
 * FAMILY_TABLE through the live handoff path (orchestrator.ts): the departing persona says a
 * fond line about the teammate from canon, not a switchboard line ("Maya's perfect for
 * this. One moment.", prod 2026-10-18). Reads the content files directly, so it runs
 * against any orchestrator: before family-table.ts it fails.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { AgentOrchestrator } from '../orchestrator.js';
import { HANDOFF_BANTER } from '../../../services/team-engagement/banter.js';

type Phrases = {
  getGoodbyePhrase(agent: object, request: object): string | null;
  getGreetingPhrase(to: string, from: string, firstLine?: string): string | null;
};

const orchestrator = (sessionId: string): Phrases =>
  new AgentOrchestrator({
    ctx: {} as never,
    room: {} as never,
    userParticipant: {} as never,
    createPersonaAgent: async () => ({}) as never,
    sessionId,
  }) as unknown as Phrases;

const fondLines = (from: string, to: string): string[] =>
  (
    JSON.parse(
      readFileSync(
        join(process.cwd(), 'src/personas/bundles', from, 'identity', 'family-table.json'),
        'utf8'
      )
    ) as { fond: Record<string, string[]> }
  ).fond[to] ?? [];

const agent = (personaId: string) => ({ personaId, session: { history: { items: [] } } });

afterEach(() => {
  delete process.env.FAMILY_TABLE;
});

describe('FAMILY_TABLE on the live handoff path', () => {
  it("Ferni's goodbye to Maya is a fond line about her, not a stock one", () => {
    process.env.FAMILY_TABLE = 'on';
    const line = orchestrator('ft-headline').getGoodbyePhrase(agent('ferni'), {
      targetPersonaId: 'maya-santos',
    });
    expect(fondLines('ferni', 'maya-santos')).toContain(line);
    expect(line).toMatch(/half marathon|Compound|Interest|paintings/);
    expect(HANDOFF_BANTER.ferni['maya-santos']).not.toContain(line);
  });

  it('with the flag off the goodbye is still the written banter', () => {
    const line = orchestrator('ft-off').getGoodbyePhrase(agent('ferni'), {
      targetPersonaId: 'maya-santos',
    });
    expect(HANDOFF_BANTER.ferni['maya-santos']).toContain(line);
  });

  it("Maya answers Ferni's fond line, then gets on with the caller", () => {
    process.env.FAMILY_TABLE = 'on';
    const o = orchestrator('ft-arrival');
    o.getGoodbyePhrase(agent('ferni'), { targetPersonaId: 'maya-santos' });
    const hello = o.getGreetingPhrase(
      'maya-santos',
      'ferni',
      'Hi! Maya. Tell me where you are at.'
    );
    expect(hello).toBe(
      "Ferni's been bragging again, hasn't he? Hi! Maya. Tell me where you are at."
    );
  });
});
