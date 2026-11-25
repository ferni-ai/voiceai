/**
 * Which definition wins when two domains register the same tool id: a test, not a guess.
 *
 * ToolRegistry.register keeps one definition per id and overwrites on re-registration
 * (index.ts, `this.tools.set`), so the domain that loads LAST wins. Domains load in parallel
 * (loader.ts loadToolDomainsLazy, Promise.allSettled), so "last" is whichever domain module
 * finishes importing last: the winner can change between processes.
 *
 * This loads every domain through the real loader, one at a time, and records which domains
 * hand the registry each id. It pins:
 * - the exact set of ids more than one domain registers, and which domains (a new duplicate
 *   fails here and has to be added on purpose);
 * - for each, whether the definitions differ (a different description, parameters or code);
 * - that the registry's winner for a differing duplicate depends on load order.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ToolRegistry, toolRegistry } from '../index.js';
import { autoRegisterAllDomains, loadToolDomain } from '../loader.js';
import { ALL_TOOL_DOMAINS, type ToolDefinition } from '../types.js';

/** id -> the domains whose loader hands it to the registry, in load order, with each definition. */
const owners = new Map<string, Array<{ domain: string; def: ToolDefinition }>>();

beforeAll(async () => {
  // Switchable tools count as registered (prompt-tool-names.test.ts does the same).
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
    for (const def of registerAll.mock.calls.flatMap(([defs]) => defs)) {
      owners.set(def.id, [...(owners.get(def.id) ?? []), { domain, def }]);
    }
  }
  registerAll.mockRestore();
}, 120_000);

const duplicates = (): Array<[string, Array<{ domain: string; def: ToolDefinition }>]> =>
  [...owners].filter(([, o]) => o.length > 1).sort(([a], [b]) => a.localeCompare(b));

/** The same tool, or two tools sharing a name: same object, or same description and code. */
const sameTool = (a: ToolDefinition, b: ToolDefinition): boolean =>
  a === b || (a.description === b.description && a.create === b.create);

describe('duplicate tool ids across domains', () => {
  it('loads enough tools to mean something', () => {
    expect(owners.size).toBeGreaterThan(300);
  });

  it('pins every id two domains register, and which domains', () => {
    const table = Object.fromEntries(duplicates().map(([id, o]) => [id, o.map((x) => x.domain)]));
    expect(table).toMatchInlineSnapshot(`
      {
        "activateScene": [
          "smart-home",
          "lifx-lights",
        ],
        "announceDinner": [
          "smart-home",
          "lifx-lights",
        ],
        "broadcastMessage": [
          "smart-home",
          "lifx-lights",
        ],
        "checkValuesAlignment": [
          "proactive",
          "decisions",
        ],
        "communicationStrategy": [
          "communication",
          "coaching-support",
        ],
        "controlLight": [
          "smart-home",
          "lifx-lights",
        ],
        "controlLock": [
          "smart-home",
          "lifx-lights",
        ],
        "findContractor": [
          "smart-home",
          "lifx-lights",
        ],
        "getCommuteTime": [
          "information",
          "transportation",
        ],
        "getMorningBriefing": [
          "information",
          "ceo-coaching",
        ],
        "getSavedTrips": [
          "productivity",
          "travel",
        ],
        "getUpcomingBirthdays": [
          "information",
          "social-events",
        ],
        "goodEnough": [
          "quiet-growth",
          "perfectionism",
        ],
        "homeMaintenanceReminder": [
          "smart-home",
          "lifx-lights",
        ],
        "homeProjectPlanner": [
          "smart-home",
          "lifx-lights",
        ],
        "homeRepairAdvice": [
          "smart-home",
          "lifx-lights",
        ],
        "intercomCall": [
          "smart-home",
          "lifx-lights",
        ],
        "listDevices": [
          "simple-utilities",
          "smart-home",
          "lifx-lights",
        ],
        "planTrip": [
          "productivity",
          "travel",
        ],
        "remindThesis": [
          "research",
          "life-thesis",
        ],
        "saveContactInfo": [
          "proactive",
          "scheduling",
        ],
        "searchFlights": [
          "productivity",
          "travel",
        ],
        "searchHotels": [
          "productivity",
          "travel",
        ],
        "searchRecipes": [
          "information",
          "meal-planning",
        ],
        "setThermostat": [
          "smart-home",
          "lifx-lights",
        ],
      }
    `);
  });

  it('pins which duplicates are different tools under one name', () => {
    const differing = duplicates()
      .filter(([, o]) => o.some((x) => !sameTool(x.def, o[0]!.def)))
      .map(([id]) => id);
    expect(differing).toMatchInlineSnapshot(`
      [
        "checkValuesAlignment",
        "communicationStrategy",
        "getCommuteTime",
        "getMorningBriefing",
        "getSavedTrips",
        "getUpcomingBirthdays",
        "goodEnough",
        "listDevices",
        "planTrip",
        "remindThesis",
        "saveContactInfo",
        "searchFlights",
        "searchHotels",
        "searchRecipes",
      ]
    `);
  });

  it('no domain hands the registry one id twice (getQuickStatus was the one, #4291)', () => {
    const sameDomain = duplicates().filter(([, o]) => new Set(o.map((x) => x.domain)).size === 1);
    expect(sameDomain.map(([id, o]) => `${id} (${o[0]!.domain})`)).toEqual([]);
  });

  it('across domains, the winner of a differing duplicate is whichever domain loaded last', () => {
    const across = duplicates().filter(
      ([, o]) => new Set(o.map((x) => x.domain)).size > 1 && !sameTool(o[0]!.def, o.at(-1)!.def)
    );
    expect(across).toHaveLength(14);
    for (const [id, o] of across) {
      const first = o[0]!.def;
      const last = o.at(-1)!.def;
      expect.soft(first.description, `${id}: told apart by description`).not.toBe(last.description);
      const forward = new ToolRegistry();
      forward.registerAll([first, last]);
      const reverse = new ToolRegistry();
      reverse.registerAll([last, first]);
      expect.soft(forward.get(id)?.description, id).toBe(last.description);
      expect.soft(reverse.get(id)?.description, id).toBe(first.description);
    }
  });
});
