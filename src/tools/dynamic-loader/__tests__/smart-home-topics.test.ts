/**
 * SMART_HOME_LIFX: light words reach the caller's light tools.
 *
 * Through a real session loader, the real domain loader and the real tool
 * registry: no topic named smart-home, and the domain's tools were filed under
 * 'home', so "dim the bedroom lamp" never offered controlLight.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { autoRegisterAllDomains, loadToolDomainsLazy } from '../../registry/loader.js';
import { createSessionToolLoader } from '../index.js';

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
  'can you dim the bedroom lamp',
  'turn off the kitchen lights',
  'set the brightness to 40 percent',
  'is the porch bulb on',
  'what is the thermostat at',
];

describe('light words load the smart-home tools (SMART_HOME_LIFX)', () => {
  it.each(ASKS)('on: "%s" offers controlLight and listSmartDevices', async (ask) => {
    vi.stubEnv('SMART_HOME_LIFX', 'on');
    const offered = await offeredFor(ask);
    expect(offered).toContain('controlLight');
    expect(offered).toContain('listSmartDevices');
  });

  it.each(ASKS)('off: "%s" offers no light tool', async (ask) => {
    const offered = await offeredFor(ask);
    expect(offered).not.toContain('controlLight');
    expect(offered).not.toContain('listSmartDevices');
  });

  it('on: with the vibe module loaded first, a light word offers exactly the two light tools', async () => {
    vi.stubEnv('SMART_HOME_LIFX', 'on');
    // Full-catalog and orchestrator paths load vibe, whose tools sit in 'smart-home',
    // run as any session id and set the thermostat: light words must not reach them.
    await loadToolDomainsLazy(['vibe', 'smart-home']);
    const offered = await offeredFor('can you dim the lights');
    expect(offered.sort()).toEqual(['controlLight', 'listSmartDevices']);
  });

  it.each(['in light of what happened', 'a light lunch', 'the future looks dim'])(
    'on: "%s" is not a light request',
    async (said) => {
      vi.stubEnv('SMART_HOME_LIFX', 'on');
      await loadToolDomainsLazy(['smart-home']);
      expect(await offeredFor(said)).not.toContain('controlLight');
    }
  );
});
