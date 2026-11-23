/**
 * TOOL_ID_OWNERS (#4291): an id two domains define as different tools has one owner, whatever
 * order the domains load in, and the other domain's tool keeps being offered under its own id.
 *
 * Every domain loads once through the real loader and the definitions each one hands the
 * registry are captured. They are then registered into fresh registries in load order and in
 * reverse, with the flag off (as on main: the winner follows the order) and on.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ToolRegistry, toolRegistry } from '../index.js';
import { autoRegisterAllDomains, loadToolDomain } from '../loader.js';
import { ownedDefinition } from '../tool-id-owners.js';
import { ALL_TOOL_DOMAINS, type ToolDefinition } from '../types.js';

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
