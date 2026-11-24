/**
 * TOOL_ID_OWNERS (#4291): an id two domains define as different tools has one owner, whatever
 * order the domains load in, and the other domain's tool keeps being offered under its own id.
 *
 * Every domain loads once through the real loader and the definitions each one hands the
 * registry are captured. They are then registered into fresh registries in load order and in
 * reverse, with the flag off (as on main: the winner follows the order) and on.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { buildAgentTools } from '../../builder.js';
import { fakeEmbedder } from '../../retrieval/__tests__/fake-embedder.js';
import { DenseToolIndex, loadIntentManual } from '../../retrieval/dense-index.js';
import { TurnToolRetrieval } from '../../retrieval/turn-tool-retrieval.js';
import { ToolRegistry, toolRegistry } from '../index.js';
import { autoRegisterAllDomains, loadToolDomain } from '../loader.js';
import { ownedDefinition } from '../tool-id-owners.js';
import {
  ALL_TOOL_DOMAINS,
  type ToolDefinition,
  type ToolSetResult,
  type ToolSetSpec,
} from '../types.js';

/** Contested id -> its owner, and the id the other domain's tool takes. */
const OWNERS: Record<string, { owner: string; other: string; becomes: string }> = {
  checkValuesAlignment: { owner: 'decisions', other: 'proactive', becomes: 'flagValuesConflict' },
  communicationStrategy: {
    owner: 'communication',
    other: 'coaching-support',
    becomes: 'coachCommunication',
  },
  getCommuteTime: { owner: 'information', other: 'transportation', becomes: 'getDriveTime' },
  getMorningBriefing: { owner: 'ceo-coaching', other: 'information', becomes: 'getDailyRundown' },
  getUpcomingBirthdays: {
    owner: 'information',
    other: 'social-events',
    becomes: 'getBirthdayEvents',
  },
  goodEnough: { owner: 'perfectionism', other: 'quiet-growth', becomes: 'celebrateGoodEnough' },
  listDevices: {
    owner: 'home', // smart-home's tools (and its lifx-lights alias) say domain 'home'
    other: 'simple-utilities',
    becomes: 'listMyDevices',
  },
  remindThesis: { owner: 'life-thesis', other: 'research', becomes: 'remindStockThesis' },
  saveContactInfo: { owner: 'scheduling', other: 'proactive', becomes: 'saveOutreachContact' },
  searchRecipes: { owner: 'information', other: 'meal-planning', becomes: 'searchMyRecipes' },
};
/** Two domains, one tool: both definitions build the tool travel/travel.ts makes. */
const TRAVEL_COPIES = ['getSavedTrips', 'planTrip', 'searchFlights', 'searchHotels'];

const here = dirname(fileURLToPath(import.meta.url));
const manualOnDisk = (): Record<string, { domain: string }> =>
  JSON.parse(readFileSync(join(here, '../../retrieval/intent-manual.generated.json'), 'utf8'))
    .tools;
const defs: ToolDefinition[] = [];

beforeAll(async () => {
  vi.stubEnv('FERNI_DEVELOPER_TOOLS', 'on');
  vi.stubEnv('GMAIL_READ_TOOLS', 'on');
  vi.stubEnv('LINKEDIN_ENABLED', 'true');
  vi.stubEnv('LINKEDIN_CLIENT_ID', 'li-id');
  vi.stubEnv('LINKEDIN_CLIENT_SECRET', 'li-secret');
  vi.stubEnv('TMDB_API_KEY', 'tmdb');
  vi.stubEnv('SONOS_CLIENT_ID', 'sonos-id');
  vi.stubEnv('SONOS_CLIENT_SECRET', 'sonos-secret');
  await autoRegisterAllDomains();
  const registerAll = vi.spyOn(toolRegistry, 'registerAll');
  for (const domain of ALL_TOOL_DOMAINS) {
    registerAll.mockClear();
    await loadToolDomain(domain);
    defs.push(...registerAll.mock.calls.flatMap(([d]) => d));
  }
  registerAll.mockRestore();
}, 120_000);

afterEach(() => {
  delete process.env.TOOL_ID_OWNERS;
});

const registryOf = (order: ToolDefinition[]): ToolRegistry => {
  const registry = new ToolRegistry();
  registry.registerAll(order);
  return registry;
};
const both = (): [ToolRegistry, ToolRegistry] => [
  registryOf(defs),
  registryOf([...defs].reverse()),
];
const domainsOf = (id: string): Set<string> =>
  new Set(defs.filter((d) => d.id === id).map((d) => d.domain));

describe('TOOL_ID_OWNERS off (as main)', () => {
  it('every contested id is defined by its owner and the other domain', () => {
    for (const [id, o] of Object.entries(OWNERS)) {
      expect(domainsOf(id), id).toEqual(new Set([o.owner, o.other]));
    }
  });

  it('the winner of a contested id follows the load order, and no tool is renamed', () => {
    const [forward, reverse] = both();
    for (const id of Object.keys(OWNERS)) {
      expect.soft(forward.get(id)?.domain, id).not.toBe(reverse.get(id)?.domain);
    }
    for (const o of Object.values(OWNERS)) expect(forward.get(o.becomes)).toBeUndefined();
    const sample = defs.find((d) => d.id === 'getCommuteTime' && d.domain === 'transportation')!;
    expect(ownedDefinition(sample, new Map())).toBe(sample);
  });
});

describe('TOOL_ID_OWNERS on', () => {
  it('the owner holds each contested id in either load order', () => {
    process.env.TOOL_ID_OWNERS = 'on';
    for (const registry of both()) {
      for (const [id, o] of Object.entries(OWNERS)) {
        expect.soft(registry.get(id)?.domain, id).toBe(o.owner);
      }
    }
  });

  it("the other domain's tool is offered under its own id, with its own description", () => {
    process.env.TOOL_ID_OWNERS = 'on';
    for (const registry of both()) {
      for (const [id, o] of Object.entries(OWNERS)) {
        const theirs = defs.find((d) => d.id === id && d.domain === o.other)!;
        const renamed = registry.get(o.becomes);
        expect.soft(renamed?.domain, o.becomes).toBe(o.other);
        expect.soft(renamed?.description, o.becomes).toBe(theirs.description);
      }
    }
  });

  it('the new ids were free: each one is defined by no domain', () => {
    for (const o of Object.values(OWNERS))
      expect(domainsOf(o.becomes), o.becomes).toEqual(new Set());
  });

  it("productivity's travel tools are travel's own tool, so either winner is the same", () => {
    const ctx = { userId: 'uid-riley-test-owners' } as never;
    for (const id of TRAVEL_COPIES) {
      const [a, b] = defs.filter((d) => d.id === id);
      expect(new Set([a!.domain, b!.domain]), id).toEqual(new Set(['productivity', 'travel']));
      const built = [a!, b!].map((d) => (d.create(ctx) as { description?: string }).description);
      expect(built[0], id).toBeTruthy();
      expect(built[0], id).toBe(built[1]);
    }
  });
});

describe('getQuickStatus', () => {
  it('information defines it once: the enhanced briefing it always served', () => {
    const ours = defs.filter((d) => d.id === 'getQuickStatus');
    expect(ours.map((d) => d.domain)).toEqual(['information']);
    expect(ours[0]!.description).toMatch(/^Ultra-brief status check/);
  });
});

describe('by-name lists name the tool they mean', () => {
  const peter = JSON.parse(
    readFileSync(join(here, '../../../personas/bundles/peter-john/persona.manifest.json'), 'utf8')
  ) as { tools: { optional: string[] } };
  const NOTHING = { tools: {}, skipped: [], warnings: [] } as unknown as ToolSetResult;

  /** The spec buildAgentTools hands the registry for Peter's manifest. */
  const peterSpec = async (): Promise<ToolSetSpec> => {
    const build = vi.spyOn(toolRegistry, 'buildToolSet').mockReturnValue(NOTHING);
    try {
      await buildAgentTools('peter-john', { manifest: peter as never, skipRegistryInit: true });
      return build.mock.calls[0]![0];
    } finally {
      build.mockRestore();
    }
  };

  it("off: Peter's optional tools are main's list, remindThesis included", async () => {
    expect(peter.tools.optional).toContain('remindStockThesis');
    const { optional } = await peterSpec();
    expect(optional).toEqual(
      peter.tools.optional.map((n) => (n === 'remindStockThesis' ? 'remindThesis' : n))
    );
  });

  it("on: Peter is offered research's stock-thesis tool and no life-thesis tool", async () => {
    process.env.TOOL_ID_OWNERS = 'on';
    const { optional = [] } = await peterSpec();
    for (const registry of both()) {
      const offered = optional.flatMap((id) => registry.get(id) ?? []);
      expect(offered.find((d) => d.id === 'remindStockThesis')?.domain).toBe('research');
      expect(offered.filter((d) => d.domain === 'life-thesis').map((d) => d.id)).toEqual([]);
    }
  });

  it('off: the intent manual is the file as written', () => {
    expect(loadIntentManual().tools).toEqual(manualOnDisk());
  });

  it('on: each contested entry sits under the tool it is about, and the other tool gets its own', () => {
    process.env.TOOL_ID_OWNERS = 'on';
    const disk = manualOnDisk();
    const { tools } = loadIntentManual();
    const misfiled = Object.entries(OWNERS).filter(([id, o]) => disk[id]?.domain === o.other);
    expect(misfiled.map(([id]) => id)).toEqual([
      'checkValuesAlignment',
      'listDevices',
      'remindThesis',
    ]);
    // Read from each entry's text: the first two are about the owner's tool, the third research's.
    const about = {
      checkValuesAlignment: 'owner',
      listDevices: 'owner',
      remindThesis: 'other',
    } as const;
    for (const [id, o] of misfiled) {
      const [kept, made] =
        about[id as keyof typeof about] === 'owner' ? [id, o.becomes] : [o.becomes, id];
      expect(tools[kept], id).toEqual({ ...disk[id], domain: kept === id ? o.owner : o.other });
      // The other tool's entry is its definition's own description, not new prose.
      const def = defs.find((d) => d.id === id && d.domain === (made === id ? o.owner : o.other))!;
      expect(tools[made], id).toEqual({
        domain: def.domain,
        description: def.description,
        queries: [def.description],
      });
    }
    expect(Object.keys(tools).length).toBe(Object.keys(disk).length + 3);
    const [registry] = both();
    for (const [id, o] of Object.entries(OWNERS))
      for (const k of [id, o.becomes].filter((key) => tools[key]))
        expect(registry.get(k)?.domain, k).toBe(tools[k]!.domain);
  });
});

describe('findTools reaches each tool of a contested pair', () => {
  const PAIRS = ['checkValuesAlignment', 'listDevices', 'remindThesis'];
  const fn = (name: string) =>
    llm.tool({ name, description: name, parameters: z.object({}), execute: async () => 'ok' });
  /** Retrieval over a manual's entries for the 3 pairs, with both tools of each pair loaded. */
  async function retrieval(tools = loadIntentManual().tools): Promise<TurnToolRetrieval> {
    const ids = PAIRS.flatMap((id) => [id, OWNERS[id]!.becomes]);
    const manual = {
      tools: Object.fromEntries(ids.filter((id) => tools[id]).map((id) => [id, tools[id]!])),
    };
    const embedder = fakeEmbedder(4096);
    const index = await DenseToolIndex.build(manual, embedder);
    const r = new TurnToolRetrieval({
      sessionId: 's',
      embedder,
      index: async () => index,
      domainOf: (t) => manual.tools[t]?.domain,
    });
    r.withoutPick(new llm.ToolContext(ids.map(fn)));
    return r;
  }
  const first = async (r: TurnToolRetrieval, need: string): Promise<string | undefined> =>
    (await r.find(need, 1))[0]?.name;
  // Each request is worded from its tool's own description. The fake embedder matches words,
  // so these prove each tool is in the index under its own id and wins its own request, not
  // how well the live embedder ranks paraphrases.
  const NEEDS: Array<[need: string, want: string, domain: string]> = [
    ['evaluate how my options align with my core values', 'checkValuesAlignment', 'decisions'],
    [
      'gently surface it when my actions contradict my stated values',
      'flagValuesConflict',
      'proactive',
    ],
    ['list my smart home devices and their status', 'listDevices', 'home'],
    ['show all connected devices', 'listMyDevices', 'simple-utilities'],
    [
      "I'm struggling and doubting and want to quit: recall my original why",
      'remindThesis',
      'life-thesis',
    ],
    ['remind me why I bought this stock', 'remindStockThesis', 'research'],
  ];

  it.each(NEEDS)(
    'on: "%s" reaches %s, %s\'s tool, in both load orders',
    async (need, want, domain) => {
      process.env.TOOL_ID_OWNERS = 'on';
      const found = await first(await retrieval(), need);
      expect(found).toBe(want);
      // The name it returns is the one the agent loads and runs: that domain's definition.
      for (const registry of both()) expect(registry.get(found!)?.domain, need).toBe(domain);
    }
  );

  it('off: each request finds what it finds over the file as written', async () => {
    const [loaded, disk] = [await retrieval(), await retrieval(manualOnDisk() as never)];
    for (const [need] of NEEDS)
      expect(await first(loaded, need), need).toBe(await first(disk, need));
    for (const id of PAIRS) expect(loadIntentManual().tools[OWNERS[id]!.becomes]).toBeUndefined();
  });
});
