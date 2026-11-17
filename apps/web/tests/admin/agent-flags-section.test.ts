/**
 * The agent flags section against a faked dev server: the notice off dev, what Apply sends,
 * and Apply held while a dev room is in use. No request leaves the test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
vi.mock('../../src/admin/admin-fetch.js', () => ({
  adminFetch: (url: string, init?: RequestInit) => fetchMock(url, init),
}));

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status });

const FLAGS_BODY = {
  flags: [
    {
      name: 'SOUND_CONDUCTOR',
      kind: 'experiment',
      owner: 'voice',
      default: 'off',
      switchable: true,
      modes: ['off', 'shadow', 'on'],
    },
    {
      name: 'ATTUNE_LEDGER',
      kind: 'experiment',
      owner: 'voice',
      default: 'off',
      switchable: true,
      modes: ['off', 'on'],
    },
    {
      name: 'FLAG_SNAPSHOT',
      kind: 'config',
      owner: 'platform',
      default: 'off',
      switchable: true,
      modes: ['off', 'on'],
    },
  ],
  snapshot: {
    startedAt: '2026-11-17T09:00:00.000Z',
    buildSha: null,
    flags: {
      SOUND_CONDUCTOR: { raw: null, resolved: 'off' },
      ATTUNE_LEDGER: { raw: 'on', resolved: 'on' },
      FLAG_SNAPSHOT: { raw: 'on', resolved: 'on' },
    },
  },
  stale: true,
  pendingRestart: [],
  changes: [],
};

function serve(routes: Record<string, () => Response>): void {
  fetchMock.mockImplementation(async (url) => {
    const route = routes[url];
    if (!route) throw new Error(`unexpected request ${url}`);
    return route();
  });
}

async function mount(): Promise<HTMLElement> {
  const section = await import('../../src/admin/sections/AgentFlagsSection.js');
  document.body.innerHTML = await section.render();
  section.setupEvents();
  const root = document.getElementById('agentFlagsRoot');
  if (!root) throw new Error('section root not rendered');
  return root;
}

function choose(root: HTMLElement, flag: string, value: string): void {
  const select = root.querySelector<HTMLSelectElement>(`select[data-flag="${flag}"]`);
  if (!select) throw new Error(`no control for ${flag}`);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

const applyButton = (root: HTMLElement): HTMLButtonElement | null =>
  root.querySelector<HTMLButtonElement>('[data-af="apply"]');

/** The old worker: SOUND_CONDUCTOR set on, ATTUNE_LEDGER unset (its default, off). */
const OLD_WORKER = {
  ...FLAGS_BODY,
  stale: false,
  snapshot: {
    startedAt: '2026-11-17T09:00:00.000Z',
    buildSha: null,
    flags: {
      SOUND_CONDUCTOR: { raw: 'on', resolved: 'on' },
      ATTUNE_LEDGER: { raw: null, resolved: 'off' },
      FLAG_SNAPSHOT: { raw: 'on', resolved: 'on' },
    },
  },
};

const selectOf = (root: HTMLElement, flag: string): HTMLSelectElement | null =>
  root.querySelector<HTMLSelectElement>(`select[data-flag="${flag}"]`);

const rowOf = (root: HTMLElement, flag: string): Element | null | undefined =>
  root.querySelector(`select[data-flag="${flag}"]`)?.closest('.af-row');

describe('AgentFlagsSection', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('shows the dev-only notice when the server answers 404', async () => {
    serve({ '/api/v1/admin/agent-flags': () => json({ error: 'Not found' }, 404) });
    const root = await mount();
    expect(root.textContent).toContain('Agent flags can only be changed on the dev admin server.');
    expect(root.querySelector('select')).toBeNull();
  });

  it('shows the stale banner and no control for FLAG_SNAPSHOT', async () => {
    serve({
      '/api/v1/admin/agent-flags': () => json(FLAGS_BODY),
      '/api/v1/admin/agent-flags/rooms': () => json({ rooms: [] }),
    });
    const root = await mount();
    expect(root.textContent).toContain('Values may be out of date');
    expect(root.querySelector('select[data-flag="SOUND_CONDUCTOR"]')).not.toBeNull();
    expect(root.querySelector('select[data-flag="FLAG_SNAPSHOT"]')).toBeNull();
  });

  it('sends only the staged changes on Apply', async () => {
    const posts: unknown[] = [];
    serve({
      '/api/v1/admin/agent-flags': () => json(FLAGS_BODY),
      '/api/v1/admin/agent-flags/rooms': () => json({ rooms: [] }),
      '/api/v1/admin/agent-flags/apply': () => json({ appliedAt: '2026-11-17T10:00:00.000Z' }),
    });
    const root = await mount();
    expect(applyButton(root)?.disabled).toBe(true);

    choose(root, 'SOUND_CONDUCTOR', 'on');
    choose(root, 'ATTUNE_LEDGER', 'default');
    expect(root.textContent).toContain('2 changes staged');
    applyButton(root)?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Restarting dev agent…'));

    for (const [url, init] of fetchMock.mock.calls) {
      if (url === '/api/v1/admin/agent-flags/apply') posts.push(JSON.parse(String(init?.body)));
    }
    expect(posts).toEqual([{ set: { SOUND_CONDUCTOR: 'on' }, reset: ['ATTUNE_LEDGER'] }]);
  });

  it('holds Apply while a dev room is in use', async () => {
    serve({
      '/api/v1/admin/agent-flags': () => json(FLAGS_BODY),
      '/api/v1/admin/agent-flags/rooms': () =>
        json({ rooms: [{ name: 'room-a', participants: 2 }] }),
    });
    const root = await mount();
    choose(root, 'SOUND_CONDUCTOR', 'on');
    expect(root.textContent).toContain('Dev room in use: room-a');
    expect(applyButton(root)?.disabled).toBe(true);
  });

  it('stages any choice for a flag waiting for a restart', async () => {
    serve({
      '/api/v1/admin/agent-flags': () => json({ ...OLD_WORKER, pendingRestart: ['ATTUNE_LEDGER'] }),
      '/api/v1/admin/agent-flags/rooms': () => json({ rooms: [] }),
    });
    const root = await mount();
    expect(selectOf(root, 'ATTUNE_LEDGER')?.value).toBe('');
    choose(root, 'ATTUNE_LEDGER', 'off');
    expect(root.textContent).toContain('1 change staged');
    choose(root, 'ATTUNE_LEDGER', 'default');
    expect(root.textContent).toContain('1 change staged');
  });

  it('keeps a timed-out change marked and lets it be reverted', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-17T10:00:00.000Z'), toFake: ['setTimeout', 'Date'] });
    serve({
      '/api/v1/admin/agent-flags': () => json(OLD_WORKER),
      '/api/v1/admin/agent-flags/rooms': () => json({ rooms: [] }),
      '/api/v1/admin/agent-flags/apply': () => json({ appliedAt: '2026-11-17T10:00:00.000Z' }),
    });
    const root = await mount();
    choose(root, 'SOUND_CONDUCTOR', 'default');
    choose(root, 'ATTUNE_LEDGER', 'on');
    applyButton(root)?.click();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(root.textContent).toContain('Applied, not confirmed yet');

    expect(rowOf(root, 'SOUND_CONDUCTOR')?.classList.contains('af-row--unconfirmed')).toBe(true);
    expect(rowOf(root, 'ATTUNE_LEDGER')?.classList.contains('af-row--unconfirmed')).toBe(true);

    // Each select shows what was applied, so picking the old value fires a change.
    expect(selectOf(root, 'SOUND_CONDUCTOR')?.value).toBe('default');
    expect(selectOf(root, 'ATTUNE_LEDGER')?.value).toBe('on');
    // The old worker still runs on and off; reverting to them must stage, not vanish.
    choose(root, 'SOUND_CONDUCTOR', 'on');
    choose(root, 'ATTUNE_LEDGER', 'default');
    expect(root.textContent).toContain('2 changes staged');
  });

  it('keeps the mark across a reload while the agent still runs the old values', async () => {
    serve({
      '/api/v1/admin/agent-flags': () => json(OLD_WORKER),
      '/api/v1/admin/agent-flags/rooms': () => json({ rooms: [] }),
    });
    const root = await mount();
    expect(rowOf(root, 'SOUND_CONDUCTOR')?.classList.contains('af-row--unconfirmed')).toBe(true);
    expect(rowOf(root, 'ATTUNE_LEDGER')?.classList.contains('af-row--unconfirmed')).toBe(true);
  });

  it('clears the mark once a newer snapshot shows the applied values', async () => {
    const confirmed = {
      ...OLD_WORKER,
      snapshot: {
        startedAt: '2026-11-17T10:06:00.000Z',
        buildSha: null,
        flags: {
          SOUND_CONDUCTOR: { raw: null, resolved: 'off' },
          ATTUNE_LEDGER: { raw: 'on', resolved: 'on' },
          FLAG_SNAPSHOT: { raw: 'on', resolved: 'on' },
        },
      },
    };
    serve({
      '/api/v1/admin/agent-flags': () => json(confirmed),
      '/api/v1/admin/agent-flags/rooms': () => json({ rooms: [] }),
    });
    const root = await mount();
    expect(root.querySelector('.af-row--unconfirmed')).toBeNull();
    expect(rowOf(root, 'ATTUNE_LEDGER')).not.toBeNull();
  });

  it('holds Apply with the room message after a 409 whose body does not parse', async () => {
    serve({
      '/api/v1/admin/agent-flags': () => json(FLAGS_BODY),
      '/api/v1/admin/agent-flags/rooms': () => json({ rooms: [] }),
      '/api/v1/admin/agent-flags/apply': () => new Response('<html>busy</html>', { status: 409 }),
    });
    const root = await mount();
    choose(root, 'SOUND_CONDUCTOR', 'on');
    applyButton(root)?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Dev room in use'));
    expect(applyButton(root)?.disabled).toBe(true);
  });

  // Last: it ends in a timeout, which leaves its names unconfirmed in the module.
  it('times the 4 minutes by the browser clock, even when it runs 10 minutes ahead', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-17T10:10:00.000Z'), toFake: ['setTimeout', 'Date'] });
    serve({
      '/api/v1/admin/agent-flags': () => json(OLD_WORKER),
      '/api/v1/admin/agent-flags/rooms': () => json({ rooms: [] }),
      '/api/v1/admin/agent-flags/apply': () => json({ appliedAt: '2026-11-17T10:00:00.000Z' }),
    });
    const root = await mount();
    choose(root, 'ATTUNE_LEDGER', 'on');
    applyButton(root)?.click();
    await vi.advanceTimersByTimeAsync(5_000); // first poll
    expect(root.textContent).toContain('Restarting dev agent…');
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(root.textContent).toContain('Restarting dev agent…');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(root.textContent).toContain('Applied, not confirmed yet');
  });
});
