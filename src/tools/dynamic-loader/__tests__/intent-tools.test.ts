/**
 * Places, flights, hotels and packages: the intent tools the first agent holds,
 * and the phrases that point at them.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => logger,
    createLogger: () => logger,
    safeLog: () => logger,
  };
});

const FAKE_DOMAIN_TOOLS: Record<string, string[]> = {
  memory: ['rememberAboutUser'],
  travel: ['searchFlights', 'searchHotels', 'getFlightPrice', 'planTrip'],
  'local-search': ['findRestaurants', 'searchLocalBusinesses', 'checkLocalSearchStatus'],
  productivity: ['trackPackage', 'checkPackageStatus'],
};

vi.mock('../../registry/index.js', () => ({
  EnvironmentServiceRegistry: class {},
  toolRegistry: {
    buildToolSet: (opts: { domains: string[] }) => {
      const tools: Record<string, unknown> = {};
      for (const domain of opts.domains) {
        for (const name of FAKE_DOMAIN_TOOLS[domain] ?? []) tools[name] = { id: name };
      }
      return { tools, stats: { total: Object.keys(tools).length }, skipped: [] };
    },
  },
}));

vi.mock('../../registry/loader.js', () => ({
  autoRegisterAllDomains: async () => undefined,
  loadToolDomainsLazy: async () => 0,
}));

import { dynamicToolLoader } from '../../dynamic-loader.js';
import { getEssentialTools, capToolsToLimit } from '../../../config/tool-config.js';
import { loadEssentialDomains } from '../essential-domain-loader.js';
import { INTENT_TOOL_DOMAINS, INTENT_TOOL_IDS } from '../essential-domains.js';
import { resolveCallerLocation } from '../../shared/caller-location.js';

const INTENT = [
  'findRestaurants',
  'searchLocalBusinesses',
  'searchFlights',
  'searchHotels',
  'getFlightPrice',
  'trackPackage',
  'checkPackageStatus',
];

afterEach(() => vi.restoreAllMocks());

describe('intent phrases route to their domains', () => {
  it.each([
    ['coffee shop near me open now', 'local-search'],
    ['flights Boston to Denver next Friday', 'travel'],
    ['check this tracking number', 'productivity'],
  ])('"%s" loads %s', (phrase, domain) => {
    const { suggestedDomains } = dynamicToolLoader.detectTopics(phrase);
    expect(suggestedDomains).toContain(domain);
  });
});

describe('the first agent holds the intent tools', () => {
  it('lists them as essential, so the tool cap keeps them', () => {
    for (const name of INTENT) expect(getEssentialTools()).toContain(name);
  });

  it('keeps them when the cap is far below the essential count', () => {
    const tools = Object.fromEntries(
      [...INTENT, 'planTrip', 'memoryOnlyTool', 'anotherTool'].map((name) => [name, { name }])
    );
    const capped = capToolsToLimit(tools, 2);
    for (const name of INTENT) expect(capped).toHaveProperty(name);
  });

  it('adds only the named tools from the intent domains', async () => {
    const tools = await loadEssentialDomains('u1', {});
    expect(tools).toHaveProperty('searchFlights');
    expect(tools).toHaveProperty('findRestaurants');
    expect(tools).toHaveProperty('trackPackage');
    expect(tools).not.toHaveProperty('planTrip');
    expect(tools).not.toHaveProperty('checkLocalSearchStatus');
    expect(INTENT_TOOL_DOMAINS).toEqual(['travel', 'local-search']);
    for (const name of INTENT_TOOL_IDS) expect(tools).toHaveProperty(name);
  });
});

describe('the places tool finds the caller without a city in the request', () => {
  it('uses the caller city and region from the call', () => {
    const opts = { ctx: { userData: { userLocation: { city: 'Boston', regionCode: 'MA' } } } };
    expect(resolveCallerLocation(undefined, opts)).toBe('Boston, MA');
  });

  it('still uses an explicit location the model gave', () => {
    const opts = { ctx: { userData: { userLocation: { city: 'Boston', regionCode: 'MA' } } } };
    expect(resolveCallerLocation('Denver, CO', opts)).toBe('Denver, CO');
  });
});
