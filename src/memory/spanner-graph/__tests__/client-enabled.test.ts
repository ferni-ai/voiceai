/**
 * Spanner Graph is opt-in. Without SPANNER_ENABLED (or an emulator host) no
 * client may be created: opening a database starts a background session pool
 * whose failed gRPC calls surface as unhandled rejections.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spanner = vi.hoisted(() => ({
  constructed: 0,
  run: vi.fn(async () => [[{ ok: 1 }]]),
}));

vi.mock('@google-cloud/spanner', () => ({
  Spanner: class {
    constructor() {
      spanner.constructed++;
    }
    instance() {
      return { database: () => ({ run: spanner.run }) };
    }
  },
}));

async function loadClient() {
  vi.resetModules();
  return import('../client.js');
}

describe('initializeSpanner', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    spanner.constructed = 0;
    spanner.run.mockClear();
    delete process.env.SPANNER_ENABLED;
    delete process.env.SPANNER_EMULATOR_HOST;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('does not create a client when Spanner is not enabled', async () => {
    const client = await loadClient();
    await expect(client.initializeSpanner()).resolves.toBe(false);
    expect(spanner.constructed).toBe(0);
    expect(client.isSpannerConfigured()).toBe(false);
  });

  it('connects when SPANNER_ENABLED=true', async () => {
    process.env.SPANNER_ENABLED = 'true';
    const client = await loadClient();
    await expect(client.initializeSpanner()).resolves.toBe(true);
    expect(spanner.constructed).toBe(1);
    expect(spanner.run).toHaveBeenCalledWith({ sql: 'SELECT 1' });
  });

  it('connects to an emulator when SPANNER_EMULATOR_HOST is set', async () => {
    process.env.SPANNER_EMULATOR_HOST = 'localhost:9010';
    const client = await loadClient();
    expect(client.isSpannerConfigured()).toBe(true);
    await expect(client.initializeSpanner()).resolves.toBe(true);
  });
});
