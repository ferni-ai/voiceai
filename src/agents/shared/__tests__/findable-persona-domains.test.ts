/**
 * #4328 FINDABLE_PERSONA_DOMAINS. With TOOL_CORE_STATIC off, a persona's manifest domains
 * build its tools on the legacy path (buildAgentTools, from getLegacyTools): Alex and Nayan
 * get decisions tools. Jordan's and Maya's life-thesis is not preloaded (initializeToolRegistry
 * loads HIGH_PRIORITY_DOMAINS only), so that path builds none for them. With TOOL_CORE_STATIC
 * on, every set is the static core and findTools reaches only the findable domains, which
 * leave out both decisions and life-thesis. The flag lets findTools for a persona also reach
 * those two domains when its manifest lists them, and no other manifest domain: manifests also
 * list domains that call, text, post or share for the caller (proactive, marketing, family).
 * These rows run the call's real installer (installToolPinner) and builder (buildToolsByName).
 */
import { llm, voice } from '@livekit/agents';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildAgentTools } from '../../../tools/builder.js';
import { discoverBundles } from '../../../personas/bundles/index.js';
import { isFindableTool } from '../../../tools/dynamic-loader/findable-domains.js';
import { DenseToolIndex, loadIntentManual } from '../../../tools/retrieval/dense-index.js';
import { fakeEmbedder } from '../../../tools/retrieval/__tests__/fake-embedder.js';
import { createFindToolsTool, type ToolPinner } from '../../../tools/retrieval/find-tools-tool.js';
import {
  setTurnToolRetrieval,
  TurnToolRetrieval,
} from '../../../tools/retrieval/turn-tool-retrieval.js';
import { autoRegisterAllDomains, initializeToolRegistry } from '../../../tools/registry/loader.js';
import { toolRegistry } from '../../../tools/registry/index.js';
import { createToolPinner, installToolPinner } from '../static-core-tools.js';

const DECIDE = 'walkThroughDecisionFramework';
const THESIS = 'saveGoalThesis';
const THERMOSTAT = 'setThermostat';
const RESERVE = 'makeRestaurantReservation';
const TIMER = 'setTimer';
const real = loadIntentManual().tools;
const manual = {
  tools: Object.fromEntries([DECIDE, THESIS, THERMOSTAT, RESERVE, TIMER].map((t) => [t, real[t]])),
};
const domainOf = (t: string): string | undefined => real[t]?.domain;
/** What the flag names, written out here so a wider PERSONA_FINDABLE_DOMAINS fails. */
const ALLOWED = ['decisions', 'life-thesis'];
/** Manifest tools that call, text, post or share for the caller (the #4341 r1 verify). */
const OUTREACH = [
  'sendImmediateOutreach',
  'backgroundCall',
  'generateProactiveMessage',
  'scheduleProactiveReminder',
  'scheduleFollowUp',
  'postToTwitter',
  'postToLinkedIn',
  'generateSocialContent',
  'requestFamilyCheckIn',
  'scheduleFamilyCheckin',
  'shareWithFamily',
  'leaveMessageForSponsor',
  'checkFamilyMessages',
];
const CTX = { userId: 'u1', sessionId: 's1', agentId: 'ferni', agentDisplayName: 'Ferni' };
const tool = (name: string) =>
  llm.tool({ description: `${name}.`, parameters: z.object({}), execute: async () => 'ok' });

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

/**
 * One call whose first persona is `first`. A handoff writes `userData.personaId`, as
 * persona-swap.ts does (`to.userData.personaId = to.personaId`). `sets` records the persona
 * set findTools hands the pinner on each search.
 */
async function call(first: string) {
  const embedder = fakeEmbedder();
  const index = await DenseToolIndex.build(manual, embedder);
  const retrieval = new TurnToolRetrieval({
    sessionId: 's1',
    embedder,
    index: async () => index,
    domainOf,
  });
  const agent = new voice.Agent({ instructions: 'x', tools: { playMusic: tool('playMusic') } });
  const session = {};
  const userData: { personaId?: string } = {};
  setTurnToolRetrieval(session, retrieval as never);
  const realPin = createToolPinner(() => agent, CTX); // as agent-setup builds it
  const sets: Array<ReadonlySet<string>> = [];
  const pinner: ToolPinner = (names, need, persona) => {
    if (persona) sets.push(persona);
    return realPin(names, need, persona);
  };
  const cleanup = installToolPinner(session, pinner, userData, { id: first });
  type Execute = (a: { need: string }, o: { ctx: { session: object } }) => Promise<string>;
  const findTools = (need: string) =>
    (createFindToolsTool() as unknown as { execute: Execute }).execute(
      { need },
      { ctx: { session } }
    );
  const has = () => Object.keys(agent.toolCtx.functionTools);
  const handOffTo = (to: { personaId: string; userData: typeof userData }) => {
    to.userData.personaId = to.personaId;
  };
  return { findTools, has, userData, handOffTo, sets, pin: realPin, cleanup };
}

describe('TOOL_CORE_STATIC off: the manifest domains build the persona its decisions tools', () => {
  beforeAll(async () => {
    await autoRegisterAllDomains();
    await initializeToolRegistry();
  }, 60_000);

  it.each([
    ['alex-chen', 'decisions', true],
    ['nayan-patel', 'decisions', true],
    ['ferni', 'decisions', false],
    ['peter-john', 'decisions', false],
  ])('%s builds a %s tool: %s', async (persona, domain, built) => {
    const tools = await buildAgentTools(persona, { skipRegistryInit: true });
    const domains = Object.keys(tools).map((t) => toolRegistry.get(t)?.domain);
    expect(domains.includes(domain as never)).toBe(built);
  });
});

describe('isFindableTool', () => {
  it('refuses every domain but decisions and life-thesis, even inside a hand-built set', () => {
    const set = new Set(['decisions', 'home', 'concierge', 'settings', 'proactive', 'marketing']);
    expect(isFindableTool(DECIDE, 'decisions', set)).toBe(true);
    expect(isFindableTool(DECIDE, 'decisions')).toBe(false); // no set: as on main
    for (const [name, d] of [
      [THERMOSTAT, 'home'],
      [RESERVE, 'concierge'],
      ['x', 'settings'],
      ['backgroundCall', 'proactive'],
      ['postToTwitter', 'marketing'],
    ]) {
      expect(isFindableTool(name, d, set)).toBe(false);
    }
  });
});

describe('findTools under TOOL_CORE_STATIC, per persona', () => {
  beforeEach(() => {
    process.env.TOOL_CORE_STATIC = 'on';
    process.env.FINDABLE_PERSONA_DOMAINS = 'on';
  });

  it.each([
    ['alex-chen', 'walk me through this decision framework', DECIDE],
    ['nayan-patel', 'walk me through this decision framework', DECIDE],
    ['jordan-taylor', 'save why I set this goal', THESIS],
    ['maya-santos', 'save why I set this goal', THESIS],
  ])(
    '%s finds and pins its own %s',
    async (persona, need, want) => {
      const { findTools, has, cleanup } = await call(persona);
      expect(await findTools(need)).toContain(want);
      expect(has()).toContain(want);
      cleanup();
    },
    60_000
  );

  it.each([
    ['ferni', 'walk me through this decision framework', DECIDE],
    ['peter-john', 'save why I set this goal', THESIS],
    ['alex-chen', 'save why I set this goal', THESIS],
  ])(
    '%s, without the domain, gets no %s',
    async (persona, need, want) => {
      const { findTools, has, cleanup } = await call(persona);
      expect(await findTools(need)).not.toContain(want);
      expect(has()).not.toContain(want);
      cleanup();
    },
    60_000
  );

  it('follows the persona on the call: after a handoff to Alex, decisions are findable', async () => {
    const { findTools, has, userData, handOffTo, cleanup } = await call('ferni');
    expect(await findTools('walk me through this decision framework')).not.toContain(DECIDE);
    handOffTo({ personaId: 'alex-chen', userData });
    expect(await findTools('walk me through this decision framework')).toContain(DECIDE);
    expect(has()).toContain(DECIDE);
    cleanup();
  }, 60_000);

  it('home and concierge stay unfindable with every flag on, for personas that list them', async () => {
    for (const [persona, need, never] of [
      ['jordan-taylor', 'set the thermostat temperature', THERMOSTAT],
      ['alex-chen', 'make a restaurant reservation', RESERVE],
      ['ferni', 'make a restaurant reservation', RESERVE],
    ]) {
      const { findTools, has, cleanup } = await call(persona);
      expect(await findTools(need)).not.toContain(never);
      expect(has()).not.toContain(never);
      cleanup();
    }
  }, 60_000);

  it('a handoff back to the first persona drops its domains again', async () => {
    const { findTools, userData, handOffTo, cleanup } = await call('alex-chen');
    expect(await findTools('walk me through this decision framework')).toContain(DECIDE);
    handOffTo({ personaId: 'ferni', userData });
    expect(await findTools('walk me through this decision framework')).not.toContain(DECIDE);
    cleanup();
  }, 60_000);

  it('no persona set holds a domain but decisions or life-thesis, or adds a tool outside them', async () => {
    const ids = await discoverBundles();
    expect(ids.length).toBeGreaterThan(8);
    const listed: string[] = [];
    for (const id of ids) {
      const { findTools, sets, cleanup } = await call(id);
      await findTools('set a timer for ten minutes'); // the timer is findable: the pin runs
      expect(sets.length, id).toBeGreaterThan(0);
      for (const set of sets) {
        listed.push(...set);
        expect(
          [...set].filter((d) => !ALLOWED.includes(d)),
          id
        ).toEqual([]);
        const added = Object.entries(real).filter(
          ([t, e]) => isFindableTool(t, e.domain, set) && !isFindableTool(t, e.domain)
        );
        expect(
          added.filter(([, e]) => !ALLOWED.includes(e.domain ?? '')),
          id
        ).toEqual([]);
      }
      cleanup();
    }
    // Not vacuous: the four personas whose manifests list them get both domains.
    expect(new Set(listed)).toEqual(new Set(ALLOWED));
  }, 120_000);

  it('no call, text, post or family-share tool is ever pinned, for every persona', async () => {
    for (const t of OUTREACH) expect(real[t], t).toBeDefined();
    for (const id of await discoverBundles()) {
      const { findTools, has, sets, pin, cleanup } = await call(id);
      await findTools('set a timer for ten minutes');
      for (const set of sets) await pin(OUTREACH, 'call my mom', set);
      expect(
        has().filter((t) => OUTREACH.includes(t)),
        id
      ).toEqual([]);
      cleanup();
    }
    // The same pin builds a persona's own tool, so the row above can fail.
    const { findTools, has, sets, pin, cleanup } = await call('alex-chen');
    await findTools('set a timer for ten minutes');
    await pin([DECIDE], 'weigh this decision', sets[0]);
    expect(has()).toContain(DECIDE);
    cleanup();
  }, 120_000);

  it('an unknown persona finds nothing extra', async () => {
    const { findTools, has, cleanup } = await call('no-such-persona');
    expect(await findTools('walk me through this decision framework')).not.toContain(DECIDE);
    expect(has()).not.toContain(DECIDE);
    cleanup();
  }, 60_000);

  it.each([
    ['nayan-patel', 'walk me through this decision framework', DECIDE],
    ['jordan-taylor', 'save why I set this goal', THESIS],
    ['maya-santos', 'save why I set this goal', THESIS],
  ])(
    'flag off == main: %s gets no %s',
    async (persona, need, want) => {
      process.env.FINDABLE_PERSONA_DOMAINS = 'off';
      const { findTools, has, cleanup } = await call(persona);
      expect(await findTools(need)).not.toContain(want);
      expect(has()).not.toContain(want);
      cleanup();
    },
    60_000
  );

  it('flag off == main: Alex finds the findable timer, not its decisions tool', async () => {
    process.env.FINDABLE_PERSONA_DOMAINS = 'off';
    const { findTools, has, cleanup } = await call('alex-chen');
    const reply = await findTools('walk me through this decision framework');
    expect(reply).toContain(TIMER); // the search still runs and pins what main finds
    expect(reply).not.toContain(DECIDE);
    expect(has()).not.toContain(DECIDE);
    cleanup();
  }, 60_000);
});
