import { afterEach, describe, expect, it, vi } from 'vitest';

const configured = vi.hoisted(() => ({ kind: 'configured' }));
vi.mock('../storage/store-factory.js', () => ({ getStore: vi.fn(async () => configured) }));
const info = vi.hoisted(() => vi.fn());
vi.mock('../../utils/safe-logger.js', () => ({
  getLogger: () => ({ child: () => ({ info, debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
}));

import { getDefaultStore } from '../storage/in-memory-store.js';
import { getProfileStore, isAgentProfilePersistenceOn } from '../profile-store.js';

afterEach(() => {
  delete process.env.PERSIST_AGENT_PROFILES;
});

describe('getProfileStore', () => {
  it('is the same in-memory store as before when the flag is off (the default)', async () => {
    expect(isAgentProfilePersistenceOn()).toBe(false);
    expect(await getProfileStore()).toBe(getDefaultStore());
  });

  it('is the configured store (Firestore in production) when PERSIST_AGENT_PROFILES=true', async () => {
    process.env.PERSIST_AGENT_PROFILES = 'true';
    expect(await getProfileStore()).toBe(configured);
  });

  it('treats anything but "true" as off', async () => {
    process.env.PERSIST_AGENT_PROFILES = '1';
    expect(await getProfileStore()).toBe(getDefaultStore());
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
