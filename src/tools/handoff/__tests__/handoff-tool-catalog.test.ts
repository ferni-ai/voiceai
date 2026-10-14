/**
 * Every handoff tool, built from the real persona bundles: names are unique,
 * each goes to the persona its name says, and no description is missing text.
 *
 * Two personas that shared a first name both produced handoffToPeter, so
 * whichever was built last took the name; Ferni's agent got "Transfer
 * conversation to ..., who specializes in undefined." because the two Financial
 * Legends bundles had no role description.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildHandoffTools, createHandoffTools } from '../handoff-factory.js';
import { assignHandoffToolNames, type NameableAgent } from '../handoff-tool-naming.js';

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

  it("names each tool after the persona's first name", async () => {
    const { toolsByName } = await createHandoffTools();
    expect(toolsByName.get('handofftopeter')?.agentId).toBe('peter-john');
    expect(toolsByName.get('handofftotom')?.agentId).toBe('peter-lynch');
    expect(toolsByName.get('handofftohenry')?.agentId).toBe('john-bogle');
  }, 60_000);

  it("keeps a shared first name for the coordinator's team and names the other in full", () => {
    const team = (membership: string) => ({ team: { membership } });
    const coordinator: NameableAgent = { id: 'coach', name: 'Coach', manifest: team('home') };
    const agents: NameableAgent[] = [
      coordinator,
      { id: 'peter-smith', name: 'Peter Smith', manifest: team('away') },
      { id: 'peter-jones', name: 'Peter Jones', manifest: team('home') },
    ];
    const names = assignHandoffToolNames(agents, coordinator);
    expect(names.get('peter-jones')).toBe('handoffToPeter');
    expect(names.get('peter-smith')).toBe('handoffToPeterSmith');
    expect(names.get('coach')).toBe('handoffToCoach');
  });

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
