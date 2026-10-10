import { afterEach, describe, expect, it, vi } from 'vitest';

const configured = vi.hoisted(() => ({ kind: 'configured', getProfile: vi.fn(async () => 'cfg') }));
vi.mock('../storage/store-factory.js', () => ({ getStore: vi.fn(async () => configured) }));
const info = vi.hoisted(() => vi.fn());
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({ child: () => ({ info, debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { getDefaultStore } from '../storage/in-memory-store.js';
import { getProfileStore, isAgentProfilePersistenceOn } from '../profile-store.js';

afterEach(() => {
  delete process.env.PERSIST_AGENT_PROFILES;
  vi.restoreAllMocks();
});

describe('getProfileStore', () => {
  it('routes calls to the in-memory store when the flag is off (the default)', async () => {
    expect(isAgentProfilePersistenceOn()).toBe(false);
    const spy = vi.spyOn(getDefaultStore(), 'getProfile').mockResolvedValue(null);
    await (await getProfileStore()).getProfile('u1');
    expect(spy).toHaveBeenCalledWith('u1');
    expect(configured.getProfile).not.toHaveBeenCalled();
  });

  it('routes calls to the configured store (Firestore in production) when PERSIST_AGENT_PROFILES=true', async () => {
    process.env.PERSIST_AGENT_PROFILES = 'true';
    expect(await (await getProfileStore()).getProfile('u2')).toBe('cfg');
    expect(configured.getProfile).toHaveBeenCalledWith('u2');
  });

  it('treats anything but "true" as off', async () => {
    process.env.PERSIST_AGENT_PROFILES = '1';
    configured.getProfile.mockClear();
    const spy = vi.spyOn(getDefaultStore(), 'getProfile').mockResolvedValue(null);
    await (await getProfileStore()).getProfile('u3');
    expect(spy).toHaveBeenCalled();
    expect(configured.getProfile).not.toHaveBeenCalled();
  });
});

describe('first-use log', () => {
  const fresh = async (): Promise<typeof import('../profile-store.js')> => {
    vi.resetModules();
    info.mockClear();
    return import('../profile-store.js');
  };

  it('names the configured store once when the flag is on', async () => {
    process.env.PERSIST_AGENT_PROFILES = 'true';
    const { getProfileStore: get } = await fresh();
    await get();
    await get();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith({ store: 'configured' }, 'Agent profile store first used');
  });

  it('names the in-memory store when the flag is off', async () => {
    const { getProfileStore: get } = await fresh();
    await get();
    expect(info).toHaveBeenCalledWith({ store: 'in-memory' }, 'Agent profile store first used');
  });

  it('logs nothing until a caller uses the store', async () => {
    await fresh();
    expect(info).not.toHaveBeenCalled();
  });
});
