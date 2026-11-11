/**
 * RIDE_LINKS: ride words offer openRideLink, and only it.
 *
 * Through a real session loader, the real domain loader and the real tool
 * registry. Ride words must never reach `transportation` (requestRide,
 * cancelRide and scheduleRide act on a linked Uber account), neither by loading
 * it nor by making it findable through findTools.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { autoRegisterAllDomains } from '../../registry/loader.js';
import { isFindableDomain, isFindableTool } from '../findable-domains.js';
import { createSessionToolLoader, rideTopicPatterns } from '../index.js';

async function offeredFor(said: string): Promise<string[]> {
  const loader = createSessionToolLoader({
    essentialDomains: [],
    essentialToolIds: [],
    domainOfTool: () => undefined,
    enableAutoUnload: false,
  });
  await loader.initialize({
    userId: 'caller-1',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    sessionId: 'session-caller-1',
    services: undefined,
  });
  const loaded = await loader.processMessage(said);
  return Object.keys(loader.getToolsForDomains(loaded));
}

beforeAll(async () => {
  await autoRegisterAllDomains(); // job startup
}, 180_000);

afterEach(() => {
  vi.unstubAllEnvs();
});

const ASKS = [
  'can you get me a ride to the airport',
  'call me an uber',
  'I need a lyft downtown',
  'get me a taxi',
  'can you call me a cab',
  'I need a car to the airport',
  'can I get a ride home',
];
const RIDE_ACCOUNT_TOOLS = ['requestRide', 'cancelRide', 'scheduleRide', 'getRideStatus'];

describe('ride words offer openRideLink (RIDE_LINKS)', () => {
  it.each(ASKS)('on: "%s" offers openRideLink and no account ride tool', async (ask) => {
    vi.stubEnv('RIDE_LINKS', 'on');
    const offered = await offeredFor(ask);
    expect(offered).toContain('openRideLink');
    for (const id of RIDE_ACCOUNT_TOOLS) expect(offered).not.toContain(id);
  });

  it.each(ASKS)('off: "%s" offers no ride tool', async (ask) => {
    vi.stubEnv('RIDE_LINKS', 'off');
    const offered = await offeredFor(ask);
    expect(offered).not.toContain('openRideLink');
    for (const id of RIDE_ACCOUNT_TOOLS) expect(offered).not.toContain(id);
  });

  it('off: there are no ride patterns at all', () => {
    expect(rideTopicPatterns({ RIDE_LINKS: 'off' })).toEqual([]);
    expect(rideTopicPatterns({ RIDE_LINKS: 'on' }).length).toBeGreaterThan(0);
  });

  it.each([
    'I love to ride a bike on weekends',
    'I was just along for the ride',
    'wow, what a ride that movie was',
    'I need to fix the kitchen cabinet',
    'I want a car for my birthday',
    'a glass of cab sav sounds nice',
    'that party was uber cool',
  ])('on: "%s" is not a ride request', async (said) => {
    vi.stubEnv('RIDE_LINKS', 'on');
    expect(await offeredFor(said)).not.toContain('openRideLink');
  });
});

describe('ride tools that act on an account stay unreachable', () => {
  it('ride words load only ride-links, never transportation', () => {
    for (const [, domains] of rideTopicPatterns({ RIDE_LINKS: 'on' })) {
      expect(domains).toEqual(['ride-links']);
    }
  });

  it.each(RIDE_ACCOUNT_TOOLS)('%s is not findable through findTools', (id) => {
    expect(isFindableDomain('transportation')).toBe(false);
    expect(isFindableTool(id, 'transportation')).toBe(false);
  });
});
