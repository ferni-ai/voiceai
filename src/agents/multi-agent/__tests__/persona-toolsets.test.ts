/**
 * PERSONA_TOOLSETS invariants: every persona's set, as offered, holds 40 tools
 * or fewer, the full safety set, and the same safety tools in the same places
 * as every other persona. The pick lists name registered tools; mid-call offers
 * add nothing while the flag is on.
 */
import { llm, voice } from '@livekit/agents';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { STATIC_CORE_TOOLS, getEssentialTools } from '../../../config/tool-config.js';
import { LEAN_ALWAYS_ON_TOOLS } from '../../../config/same-turn-tools-config.js';
import { personaToolsetsEnabled } from '../../../config/persona-toolsets-flag.js';
import { toolRegistry } from '../../../tools/registry/index.js';
import { autoRegisterAllDomains, loadToolDomainsLazy } from '../../../tools/registry/loader.js';
import { getAgentToolNames, updateAgentTools } from '../../shared/tool-updater.js';
import { PERSONA_TOOL_PICKS } from '../persona-toolset-picks.js';
import {
  PERSONA_CORE_TOOLS,
  PERSONA_TOOLSET_MAX,
  SAFETY_TOOLS,
  personaToolset,
  toolDomains,
  toolPicksFor,
} from '../persona-toolsets.js';
import { SPECIALIST_CORE_TOOLS, SPECIALIST_TOOL_SETS } from '../specialist-tool-sets.js';

/** The safety set as of 2026-10-29. A change here is a crisis-lane change that Seth signs. */
const EXPECTED_SAFETY = [
  'provideCrisisResources',
  'quickCrisisResources',
  'createSafetyPlan',
  'deEscalateAnxiety',
  'evaluateHumanTransfer',
  'connectToHumanExpert',
  'groundingExercise',
  'breatheWithMe',
  'groundingForTrauma',
];
/** Registry domains whose every tool counts as a safety tool. */
const SAFETY_ONLY_DOMAINS = ['crisis', 'human-transfer', 'trauma-support'];
const PERSONAS = [...Object.keys(PERSONA_TOOL_PICKS), 'custom-agent-x'];
/** The most teammate tools a session builds: five handoffs plus the three team tools. */
const MAX_TEAM = [
  'handoffToMaya',
  'handoffToPeter',
  'handoffToAlex',
  'handoffToJordan',
  'handoffToNayan',
  'askForTeammate',
  'introduceMember',
  'meetTheTeam',
];
/** Appended past the cap by agent-setup.ts: live retrieval and on-behalf calls. */
const ADDED_AFTER = ['findTools', 'endCall'];

/** A call's tools before the persona set: everything it could hold, plus 120 others. */
function maximalInput(persona: string): Record<string, string> {
  const { beat, head } = toolPicksFor(persona);
  const others = Array.from({ length: 120 }, (_, i) => `topicTool${i}`);
  const names = [
    ...others.slice(0, 60),
    ...head,
    ...MAX_TEAM,
    ...PERSONA_CORE_TOOLS,
    ...others.slice(60),
    ...beat,
    'endCall',
    'journal',
    'addGratitude',
  ];
  return Object.fromEntries(names.map((name) => [name, name]));
}

/** What the agent is offered: the set, then what agent-setup.ts appends past it. */
function offered(persona: string): string[] {
  const set = Object.keys(personaToolset(maximalInput(persona), persona));
  return [...set, ...ADDED_AFTER.filter((name) => !set.includes(name))];
}

const registryDomain = (name: string): string | undefined => toolRegistry.get(name)?.domain;

beforeAll(async () => {
  await autoRegisterAllDomains();
  await loadToolDomainsLazy([...SAFETY_ONLY_DOMAINS, 'presence'] as never);
}, 60_000);
afterEach(() => vi.unstubAllEnvs());

describe('the safety set', () => {
  it('is the nine tools every essential list keeps', () => {
    expect(SAFETY_TOOLS).toEqual(EXPECTED_SAFETY);
    // Each list holds all nine (their order differs; the persona sets use this one).
    const safe = (names: readonly string[]) =>
      names.filter((n) => EXPECTED_SAFETY.includes(n)).sort();
    const nine = [...EXPECTED_SAFETY].sort();
    expect(safe(STATIC_CORE_TOOLS)).toEqual(nine);
    expect(safe(getEssentialTools())).toEqual(nine);
    expect(safe(Object.keys(SPECIALIST_CORE_TOOLS))).toEqual(nine);
    expect(safe(Object.keys(LEAN_ALWAYS_ON_TOOLS))).toEqual(nine);
  });

  it('leads the shared core', () => {
    expect(PERSONA_CORE_TOOLS.slice(0, SAFETY_TOOLS.length)).toEqual(SAFETY_TOOLS);
  });
});

describe('every persona set, as offered', () => {
  it.each(PERSONAS)('%s: 40 tools or fewer', (persona) => {
    expect(offered(persona).length).toBeLessThanOrEqual(PERSONA_TOOLSET_MAX);
  });

  it.each(PERSONAS)('%s: the full safety set, first, in order', (persona) => {
    const set = offered(persona);
    expect(set.slice(0, EXPECTED_SAFETY.length)).toEqual(EXPECTED_SAFETY);
  });

  it('the safety subset is identical on every persona, with no other crisis-domain tool', () => {
    const subsetOf = (persona: string) =>
      offered(persona).filter(
        (n) => EXPECTED_SAFETY.includes(n) || SAFETY_ONLY_DOMAINS.includes(registryDomain(n) ?? '')
      );
    const subsets = Object.fromEntries(PERSONAS.map((p) => [p, subsetOf(p)]));
    for (const persona of PERSONAS) expect(subsets[persona], persona).toEqual(EXPECTED_SAFETY);
  });

  it.each(PERSONAS)('%s: core and team tools are never trimmed; head goes first', (persona) => {
    const set = offered(persona);
    expect(set).toEqual(expect.arrayContaining([...PERSONA_CORE_TOOLS, ...MAX_TEAM]));
    expect(set.filter((n) => n.startsWith('topicTool'))).toEqual([]);
    const { beat } = toolPicksFor(persona);
    expect(set).toEqual(expect.arrayContaining([...beat])); // the whole beat fits a full team
  });
});

describe('the pick lists', () => {
  it.each(Object.keys(PERSONA_TOOL_PICKS))(
    '%s: every tool is registered, in the domain the lists give',
    async (persona) => {
      // getSleepSummary is picked by Ferni and Maya but registered only with its flag and the Oura app credentials
      vi.stubEnv('OURA_SLEEP_TOOL', 'on');
      vi.stubEnv('OURA_CLIENT_ID', 'test-oura-id');
      vi.stubEnv('OURA_CLIENT_SECRET', 'test-oura-secret');
      const { beat, head } = toolPicksFor(persona);
      const names = [...PERSONA_CORE_TOOLS, ...beat, ...head];
      const domains = toolDomains(names, persona);
      expect(names.filter((n) => !(n in domains))).toEqual([]);
      await loadToolDomainsLazy([...new Set(Object.values(domains))]);
      const wrong = names.filter((n) => registryDomain(n) !== domains[n]);
      expect(wrong).toEqual([]);
    },
    60_000
  );

  it.each(Object.keys(SPECIALIST_TOOL_SETS))(
    "%s: beat and head come from the persona's specialist list",
    (persona) => {
      const { beat, head } = toolPicksFor(persona);
      const list = Object.keys(SPECIALIST_TOOL_SETS[persona]);
      expect([...beat, ...head].filter((n) => !list.includes(n))).toEqual([]);
    }
  );

  it('a persona without picks gets Ferni’s', () => {
    expect(toolPicksFor('custom-agent-x')).toBe(PERSONA_TOOL_PICKS.ferni);
    expect(toolPicksFor('maya')).toBe(PERSONA_TOOL_PICKS['maya-santos']);
  });
});

describe('mid-call offers', () => {
  const tool = (name: string) =>
    llm.tool({ description: name, parameters: z.object({}), execute: async () => 'ok' });
  const tools = (names: string[]) => Object.fromEntries(names.map((n) => [n, tool(n)]));
  type Agent = Parameters<typeof updateAgentTools>[0];
  const agentWith = (names: string[]) =>
    new voice.Agent({ instructions: 'x', tools: tools(names) }) as unknown as Agent;

  it('add nothing with the flag on', async () => {
    vi.stubEnv('PERSONA_TOOLSETS', 'on');
    expect(personaToolsetsEnabled()).toBe(true);
    const agent = agentWith(['playMusic', 'getWeather']);
    expect(await updateAgentTools(agent, tools(['getNews', 'searchYouTube']))).toBe(true);
    expect(getAgentToolNames(agent)).toEqual(['playMusic', 'getWeather']);
  });

  it('still add the topic tools with the flag off', async () => {
    expect(personaToolsetsEnabled()).toBe(false);
    const agent = agentWith(['playMusic', 'getWeather']);
    await updateAgentTools(agent, tools(['getNews', 'searchYouTube']));
    expect(getAgentToolNames(agent)).toEqual(
      expect.arrayContaining(['playMusic', 'getWeather', 'getNews', 'searchYouTube'])
    );
  });
});
