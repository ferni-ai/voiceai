/**
 * Every handoff tool, built from the real persona bundles: names are unique,
 * each goes to the persona its name says, and no description is missing text.
 *
 * Peter John (Ferni's team) and Peter Lynch (Financial Legends) both produced
 * handoffToPeter, so whichever was built last took the name; Ferni's agent got
 * "Transfer conversation to Peter Lynch, who specializes in undefined." because
 * the two Financial Legends bundles had no role description.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildHandoffTools, createHandoffTools } from '../handoff-factory.js';

const BROKEN_TEXT = /undefined|null|\[object/i;

describe('the handoff tool catalog', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env['BYPASS_TEAM_UNLOCKS'];
    delete process.env['BYPASS_TEAM_UNLOCKS'];
  });
  afterEach(() => {
    if (saved !== undefined) process.env['BYPASS_TEAM_UNLOCKS'] = saved;
  });

  it('gives every persona its own tool name', async () => {
    const { tools } = await createHandoffTools();
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(tools.length).toBeGreaterThanOrEqual(9);
  }, 60_000);

  it("keeps handoffToPeter for Ferni's Peter and names Peter Lynch in full", async () => {
    const { toolsByName } = await createHandoffTools();
    expect(toolsByName.get('handofftopeter')?.agentId).toBe('peter-john');
    expect(toolsByName.get('handofftopeterlynch')?.agentId).toBe('peter-lynch');
  }, 60_000);

  it('describes every handoff tool with real text', async () => {
    const { tools: definitions } = await createHandoffTools();
    // Every LLM tool, as the dev-panel bypass builds them (no unlock filter).
    const { tools: built } = await buildHandoffTools({
      currentAgentId: 'ferni',
      userProfile: null,
      services: { devMode: { enabled: true, bypassUnlocks: true } },
    });
    const described = [
      ...definitions.map((d) => [d.name, d.description] as const),
      ...Object.entries(built).map(
        ([name, tool]) => [name, (tool as { description?: unknown }).description] as const
      ),
    ];
    expect(described.length).toBeGreaterThanOrEqual(definitions.length);
    for (const [name, description] of described) {
      expect(typeof description, name).toBe('string');
      expect(String(description), name).not.toMatch(BROKEN_TEXT);
      expect(String(description).trim().length, name).toBeGreaterThan(0);
    }
  }, 60_000);
});
