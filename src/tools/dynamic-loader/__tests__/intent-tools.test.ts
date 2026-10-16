/**
 * The first agent holds the named places, travel and package tools, and no
 * other tool from those domains.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  productivity: ['trackPackage', 'checkPackageStatus', 'setReminder'],
};

/** Test switches: which intent domain's load hangs, and whether its build throws. */
const registryMode = vi.hoisted(() => ({
  hangDomain: null as string | null,
  throwDomain: null as string | null,
}));

vi.mock('../../registry/index.js', () => ({
  EnvironmentServiceRegistry: class {},
  toolRegistry: {
    buildToolSet: (opts: { domains: string[] }) => {
      if (registryMode.throwDomain && opts.domains.includes(registryMode.throwDomain)) {
        throw new Error('build failed');
      }
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
  loadToolDomainsLazy: async (domains: string[]) =>
    registryMode.hangDomain && domains.includes(registryMode.hangDomain)
      ? new Promise<number>(() => undefined)
      : 0,
}));

import { resolveCallerLocation } from '../../shared/caller-location.js';

async function freshLoader() {
  vi.resetModules();
  return import('../essential-domain-loader.js');
}

beforeEach(() => {
  registryMode.hangDomain = null;
  registryMode.throwDomain = null;
});

afterEach(() => vi.restoreAllMocks());

describe('the first agent holds the named intent tools', () => {
  it('holds the five named tools from travel and local-search, and not the rest of those domains', async () => {
    const { loadEssentialDomains } = await freshLoader();
    const tools = await loadEssentialDomains('u1', {});
    for (const name of [
      'searchFlights',
      'searchHotels',
      'getFlightPrice',
      'findRestaurants',
      'searchLocalBusinesses',
    ]) {
      expect(tools).toHaveProperty(name);
    }
    expect(tools).not.toHaveProperty('planTrip');
    expect(tools).not.toHaveProperty('checkLocalSearchStatus');
  });

  it('keeps the package tools, which come from the productivity domain', async () => {
    const { loadEssentialDomains } = await freshLoader();
    const tools = await loadEssentialDomains('u1', {});
    expect(tools).toHaveProperty('trackPackage');
    expect(tools).toHaveProperty('checkPackageStatus');
  });

  it('lists the named tools before the other tools, so a mid-session cap keeps them', async () => {
    const { loadEssentialDomains } = await freshLoader();
    const names = Object.keys(await loadEssentialDomains('u1', {}));
    const firstOther = names.findIndex((n) => n === 'rememberAboutUser');
    const lastNamed = Math.max(
      ...['searchFlights', 'findRestaurants', 'trackPackage'].map((n) => names.indexOf(n))
    );
    expect(lastNamed).toBeLessThan(firstOther);
  });

  it('does not hold the call up when an intent domain never finishes loading', async () => {
    registryMode.hangDomain = 'travel';
    const { loadEssentialDomains, INTENT_LOAD_WAIT_MS } = await freshLoader();
    const started = Date.now();
    const tools = await loadEssentialDomains('u1', {});
    expect(Date.now() - started).toBeLessThan(INTENT_LOAD_WAIT_MS + 2_000);
    expect(tools).toHaveProperty('rememberAboutUser');
  }, 20_000);

  it('still returns the essential tools when building the intent tools fails', async () => {
    registryMode.throwDomain = 'travel';
    const { loadEssentialDomains } = await freshLoader();
    const tools = await loadEssentialDomains('u1', {});
    expect(tools).toHaveProperty('rememberAboutUser');
    expect(tools).toHaveProperty('trackPackage');
    expect(tools).not.toHaveProperty('searchFlights');
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
