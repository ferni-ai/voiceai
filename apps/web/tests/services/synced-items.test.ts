/**
 * Practices and marketplace installs follow the person to a new device: the web saves a
 * server copy as it changes them (/api/synced/:kind) and, on load, merges the server's
 * list with its own. The newer copy wins (the server on a tie), a deletion elsewhere
 * removes the local copy unless it changed after, and what only this browser has goes up.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  apiPost: vi.fn(),
  uid: 'alice' as string | null,
}));

vi.mock('../../src/utils/api.js', () => ({
  apiGet: mocks.apiGet,
  apiPut: mocks.apiPut,
  apiDelete: mocks.apiDelete,
  apiPost: mocks.apiPost,
  getUserId: () => mocks.uid,
}));
vi.mock('../../src/services/team-unlock.service.js', () => ({ isFullTeamUnlocked: () => true }));

const T = (day: number) => `2026-10-${String(day).padStart(2, '0')}T08:00:00.000Z`;

function ritual(id: string, updatedAt: string, name = id) {
  return {
    id,
    name,
    description: '',
    duration: '5 min',
    frequency: 'daily',
    preferredTime: 'morning',
    createdAt: T(1),
    updatedAt,
    streak: 0,
    lastCompletedAt: null,
    completedDates: [],
  };
}

function serverHas(items: unknown[], deleted: Array<{ id: string; deletedAt: string }> = []) {
  mocks.apiGet.mockResolvedValue({ ok: true, status: 200, data: { items, deleted } });
}

const puts = () => mocks.apiPut.mock.calls.map(([path]) => path as string);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.uid = 'alice';
  localStorage.clear();
  mocks.apiPut.mockResolvedValue({ ok: true, status: 200 });
  mocks.apiDelete.mockResolvedValue({ ok: true, status: 200 });
});

describe('rituals on a new device', () => {
  async function loadRituals() {
    const { ritualsService } = await import('../../src/services/rituals.service.js');
    return ritualsService;
  }

  it('an empty browser loads the practices saved on another device', async () => {
    serverHas([ritual('ritual_a', T(3), 'Morning pages')]);
    const rituals = await loadRituals();
    rituals.initialize();
    expect(rituals.getAllRituals()).toEqual([]);

    await rituals.pullFromServer();

    expect(rituals.getAllRituals().map((r) => r.name)).toEqual(['Morning pages']);
    expect(JSON.parse(localStorage.getItem('ferni_user_rituals')!)).toHaveLength(1);
    expect(mocks.apiPut).not.toHaveBeenCalled();
  });

  it('merges: server wins when newer, local wins (and goes up) when newer, local-only goes up', async () => {
    localStorage.setItem(
      'ferni_user_rituals',
      JSON.stringify([
        ritual('older_here', T(2), 'old name'),
        ritual('newer_here', T(9), 'edited here'),
        ritual('only_here', T(4)),
      ])
    );
    serverHas([
      ritual('older_here', T(5), 'edited elsewhere'),
      ritual('newer_here', T(6), 'stale'),
      ritual('only_there', T(5)),
    ]);
    const rituals = await loadRituals();

    rituals.initialize(); // loads this browser's list, then merges the server's in
    await vi.waitFor(() => expect(rituals.getAllRituals()).toHaveLength(4));

    const byId = new Map(rituals.getAllRituals().map((r) => [r.id, r.name]));
    expect(byId).toEqual(
      new Map([
        ['older_here', 'edited elsewhere'],
        ['newer_here', 'edited here'],
        ['only_here', 'only_here'],
        ['only_there', 'only_there'],
      ])
    );
    expect(puts().sort()).toEqual(['/api/synced/rituals/newer_here', '/api/synced/rituals/only_here']);
  });

  it('a practice deleted on another device is dropped here, unless edited here after', async () => {
    localStorage.setItem(
      'ferni_user_rituals',
      JSON.stringify([ritual('gone', T(2)), ritual('edited_after', T(9))])
    );
    serverHas([], [
      { id: 'gone', deletedAt: T(5) },
      { id: 'edited_after', deletedAt: T(5) },
    ]);
    const rituals = await loadRituals();

    rituals.initialize();
    await vi.waitFor(() => expect(rituals.getAllRituals()).toHaveLength(1));

    expect(rituals.getAllRituals().map((r) => r.id)).toEqual(['edited_after']);
    expect(puts()).toEqual(['/api/synced/rituals/edited_after']);
  });

  it('a server it can\'t reach leaves the local practices alone', async () => {
    localStorage.setItem('ferni_user_rituals', JSON.stringify([ritual('mine', T(2))]));
    mocks.apiGet.mockResolvedValue({ ok: false, status: 0, error: 'offline' });
    const rituals = await loadRituals();

    rituals.initialize();
    await rituals.pullFromServer();

    expect(rituals.getAllRituals().map((r) => r.id)).toEqual(['mine']);
    expect(mocks.apiPut).not.toHaveBeenCalled();
  });

  it('writes the ritual itself through, and deletes reach the server', async () => {
    serverHas([]);
    const rituals = await loadRituals();
    const created = await rituals.createRitual({
      name: 'Evening walk',
      description: '',
      duration: '10 min',
      frequency: 'daily',
      preferredTime: 'evening',
    } as Parameters<typeof rituals.createRitual>[0]);

    const [path, body] = mocks.apiPut.mock.calls.at(-1)!;
    expect(path).toBe(`/api/synced/rituals/${created.id}`);
    expect(body).toEqual({ item: created, updatedAt: created.updatedAt });
    // the old write-through registered a new engagement ritual on every call
    expect(mocks.apiPost.mock.calls.some(([p]) => p === '/api/rituals')).toBe(false);

    await rituals.deleteRitual(created.id);
    expect(mocks.apiDelete).toHaveBeenCalledWith(`/api/synced/rituals/${created.id}`);
  });
});

describe('marketplace installs on a new device', () => {
  const install = (id: string, at: string) => ({ id, installed_at: at, version: '1.0.0', manifest: null });

  it('agents installed on another device show as installed here', async () => {
    serverHas([install('joel-dickson', T(3))]);
    const market = await import('../../src/services/marketplace.service.js');
    expect(market.isAgentInstalled('joel-dickson')).toBe(false);

    await market.syncInstalledAgents();

    expect(market.isAgentInstalled('joel-dickson')).toBe(true);
    expect(JSON.parse(localStorage.getItem('voiceai-marketplace-installed')!)).toHaveProperty(
      'joel-dickson'
    );
  });

  it('a local install the server lacks goes up; an uninstall elsewhere removes it here', async () => {
    localStorage.setItem(
      'voiceai-marketplace-installed',
      JSON.stringify({ kept: install('kept', T(4)), removed: install('removed', T(2)) })
    );
    serverHas([], [{ id: 'removed', deletedAt: T(5) }]);
    const market = await import('../../src/services/marketplace.service.js');

    await market.syncInstalledAgents();

    expect([...market.getInstalledAgentIds()]).toEqual(['kept']);
    expect(puts()).toEqual(['/api/synced/marketplace-installs/kept']);
  });

  it('uninstalling here reaches the server', async () => {
    localStorage.setItem(
      'voiceai-marketplace-installed',
      JSON.stringify({ a: install('a', T(4)) })
    );
    const market = await import('../../src/services/marketplace.service.js');
    expect(market.uninstallAgent('a')).toBe(true);
    expect(mocks.apiDelete).toHaveBeenCalledWith('/api/synced/marketplace-installs/a');
  });

  it('signed out: nothing is read or sent', async () => {
    mocks.uid = null;
    const market = await import('../../src/services/marketplace.service.js');
    await market.syncInstalledAgents();
    expect(mocks.apiGet).not.toHaveBeenCalled();
  });
});
