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

/** Renders the section (again, when called twice: a reload of the section) and binds it. */
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

/**
 * Stages SOUND_CONDUCTOR back to default and ATTUNE_LEDGER on against OLD_WORKER, applies at
 * 10:00 and lets the 4 minutes run out, so both names are left unconfirmed in this test's module.
 */
async function applyAndTimeOut(): Promise<HTMLElement> {
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
  return root;
}

describe('AgentFlagsSection', () => {
  // A fresh module per test, so no test sees another's staged, unconfirmed or polling state.
  // Fake timers drop any poll a test leaves armed when it ends.
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.useFakeTimers({
      now: new Date('2026-11-17T10:00:00.000Z'),
      toFake: ['setTimeout', 'clearTimeout', 'Date'],
    });
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
    const root = await applyAndTimeOut();
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
    await applyAndTimeOut();
    const root = await mount();
    expect(rowOf(root, 'SOUND_CONDUCTOR')?.classList.contains('af-row--unconfirmed')).toBe(true);
    expect(rowOf(root, 'ATTUNE_LEDGER')?.classList.contains('af-row--unconfirmed')).toBe(true);
  });

  it('clears the mark once a newer snapshot shows the applied values', async () => {
    const before = await applyAndTimeOut();
    expect(before.querySelectorAll('.af-row--unconfirmed')).toHaveLength(2);
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

  // Its rooms route used to answer no rooms. Since review finding r1-5b, a clean re-check
  // after a 409 releases the hold, so the re-check fails here to keep testing the hold.
  it('holds Apply with the room message after a 409 whose body does not parse', async () => {
    serve({
      '/api/v1/admin/agent-flags': () => json(FLAGS_BODY),
      '/api/v1/admin/agent-flags/rooms': () => json({ error: 'down' }, 502),
      '/api/v1/admin/agent-flags/apply': () => new Response('<html>busy</html>', { status: 409 }),
    });
    const root = await mount();
    choose(root, 'SOUND_CONDUCTOR', 'on');
    applyButton(root)?.click();
    await vi.waitFor(() => expect(root.textContent).toContain('Dev room in use'));
    expect(applyButton(root)?.disabled).toBe(true);
  });

  it('times the 4 minutes by the browser clock, even when it runs 10 minutes ahead', async () => {
    vi.setSystemTime(new Date('2026-11-17T10:10:00.000Z'));
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

  // ---- Final review fix wave (2026-11-17) ----------------------------------------------

  const APPLY = '/api/v1/admin/agent-flags/apply';
  const ROOMS = '/api/v1/admin/agent-flags/rooms';
  const GET = '/api/v1/admin/agent-flags';
  const gets = (): number => fetchMock.mock.calls.filter(([url]) => url === GET).length;

  /** OLD_WORKER's flags as a worker started at 10:01 reports them after SOUND_CONDUCTOR=default. */
  const NEW_WORKER = {
    ...OLD_WORKER,
    snapshot: {
      ...OLD_WORKER.snapshot,
      startedAt: '2026-11-17T10:01:00.000Z',
      flags: { ...OLD_WORKER.snapshot.flags, SOUND_CONDUCTOR: { raw: null, resolved: 'off' } },
    },
  };

  /** Serves `bodies` to successive GETs (the last one repeats) and an apply at 10:00. */
  async function applyResetWith(...bodies: unknown[]): Promise<HTMLElement> {
    serve({
      [GET]: () => json(bodies[Math.min(gets() - 1, bodies.length - 1)]),
      [ROOMS]: () => json({ rooms: [] }),
      [APPLY]: () => json({ appliedAt: '2026-11-17T10:00:00.000Z' }),
    });
    const root = await mount();
    choose(root, 'SOUND_CONDUCTOR', 'default');
    applyButton(root)?.click();
    await vi.advanceTimersByTimeAsync(0);
    return root;
  }

  it('reports Live on dev once a newer worker shows the applied value (T6-M5)', async () => {
    const root = await applyResetWith(OLD_WORKER, OLD_WORKER, NEW_WORKER);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(root.textContent).toContain('Restarting dev agent…');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(root.textContent).toContain('Live on dev.');
    expect(root.querySelector('.af-row--unconfirmed')).toBeNull();
    expect(root.textContent).toContain('0 changes staged');
  });

  it('does not mark the apply it is waiting on as not confirmed while restarting (T6-M6)', async () => {
    const recorded = {
      ...OLD_WORKER,
      changes: [
        {
          at: '2026-11-17T10:00:00.000Z',
          actor: 'admin@example.test',
          set: {},
          reset: ['SOUND_CONDUCTOR'],
          result: 'applied',
        },
      ],
    };
    await applyResetWith(OLD_WORKER, recorded);
    const root = await mount(); // a reload mid-wait reads the trail with this apply in it
    expect(root.textContent).toContain('Restarting dev agent…');
    expect(root.querySelector('.af-row--unconfirmed')).toBeNull();
    expect(root.textContent).not.toContain('applied, not confirmed');
  });

  it('stops fetching once the wait times out (T6-M5)', async () => {
    const root = await applyResetWith(OLD_WORKER);
    await vi.advanceTimersByTimeAsync(4 * 60_000 + 5_000);
    expect(root.textContent).toContain('Applied, not confirmed yet');
    const calls = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("keeps a 409's room names when the re-check fails (T6-M5, r1-2)", async () => {
    serve({
      [GET]: () => json(FLAGS_BODY),
      [ROOMS]: () => json({ error: 'down' }, 502),
      [APPLY]: () => json({ rooms: [{ name: 'room-b', participants: 1 }] }, 409),
    });
    const root = await mount();
    choose(root, 'SOUND_CONDUCTOR', 'on');
    applyButton(root)?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.textContent).toContain('Dev room in use: room-b');
    expect(applyButton(root)?.disabled).toBe(true);
  });

  it('releases Apply when the re-check after a 409 finds the rooms empty (r1-5b)', async () => {
    serve({
      [GET]: () => json(FLAGS_BODY),
      [ROOMS]: () => json({ rooms: [] }),
      [APPLY]: () => json({ rooms: [{ name: 'room-b', participants: 1 }] }, 409),
    });
    const root = await mount();
    choose(root, 'SOUND_CONDUCTOR', 'on');
    applyButton(root)?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock.mock.calls.filter(([url]) => url === ROOMS)).toHaveLength(2);
    expect(root.textContent).not.toContain('Dev room in use');
    expect(applyButton(root)?.disabled).toBe(false);
  });

  it("shows a 400's errors (T6-M5)", async () => {
    serve({
      [GET]: () => json(FLAGS_BODY),
      [ROOMS]: () => json({ rooms: [] }),
      [APPLY]: () => json({ errors: ['X is not a switchable agent flag'] }, 400),
    });
    const root = await mount();
    choose(root, 'SOUND_CONDUCTOR', 'on');
    applyButton(root)?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.textContent).toContain('Apply failed: X is not a switchable agent flag');
  });

  it('shows a refused 502 and lets Apply be tried again (T6-M5)', async () => {
    serve({
      [GET]: () => json(FLAGS_BODY),
      [ROOMS]: () => json({ rooms: [] }),
      [APPLY]: () =>
        json(
          { error: 'LiveKit refused the update; nothing changed', code: 'permission_denied' },
          502
        ),
    });
    const root = await mount();
    choose(root, 'SOUND_CONDUCTOR', 'on');
    applyButton(root)?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.textContent).toContain('LiveKit refused the update; nothing changed');
    expect(applyButton(root)?.disabled).toBe(false);
    expect(gets()).toBe(1);
  });

  it('reloads and holds Apply after a 502 that may have applied, until a selection changes (N1)', async () => {
    serve({
      [GET]: () => json(FLAGS_BODY),
      [ROOMS]: () => json({ rooms: [] }),
      [APPLY]: () =>
        json(
          { error: 'LiveKit did not confirm; the update may have applied and restarted the agent' },
          502
        ),
    });
    const root = await mount();
    choose(root, 'SOUND_CONDUCTOR', 'on');
    applyButton(root)?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.textContent).toContain('Check the banners above before applying again.');
    expect(gets()).toBe(2);
    expect(applyButton(root)?.disabled).toBe(true);
    choose(root, 'ATTUNE_LEDGER', 'off');
    expect(applyButton(root)?.disabled).toBe(false);
  });

  it("does not call this page's own wait a change from outside (T6-M2)", async () => {
    await applyAndTimeOut();
    // The server now finds ATTUNE_LEDGER's secret newer than the worker: stale.
    serve({
      [GET]: () => json({ ...OLD_WORKER, stale: true, pendingRestart: ['ATTUNE_LEDGER'] }),
      [ROOMS]: () => json({ rooms: [] }),
    });
    const root = await mount();
    expect(root.textContent).toContain('Waiting for a restart: ATTUNE_LEDGER.');
    expect(root.textContent).not.toContain('Values may be out of date');
    // A name this page did not apply still reads as stale.
    serve({
      [GET]: () => json({ ...OLD_WORKER, stale: true, pendingRestart: ['FLAG_SNAPSHOT'] }),
      [ROOMS]: () => json({ rooms: [] }),
    });
    expect((await mount()).textContent).toContain('Values may be out of date');
  });

  it('updates the bar in place and announces only its status (T6-M3)', async () => {
    serve({ [GET]: () => json(FLAGS_BODY), [ROOMS]: () => json({ rooms: [] }) });
    const root = await mount();
    const apply = applyButton(root);
    choose(root, 'SOUND_CONDUCTOR', 'on');
    expect(applyButton(root)).toBe(apply);
    expect(apply?.disabled).toBe(false);
    expect(root.querySelector('#afBar')?.hasAttribute('role')).toBe(false);
    expect(root.querySelector('[role="status"]')?.id).toBe('afBarStatus');
  });

  it('keeps waiting for the restart across a reload of the section (T6-M6)', async () => {
    await applyResetWith(OLD_WORKER, OLD_WORKER, NEW_WORKER);
    const root = await mount(); // reload mid-wait (GET 2: the old worker still)
    expect(root.textContent).toContain('Restarting dev agent…');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(root.textContent).toContain('Live on dev.');
  });

  it('keeps the change marked when the section is left mid-wait (T6-M6)', async () => {
    await applyResetWith(OLD_WORKER);
    document.body.innerHTML = ''; // the admin opened another section
    await vi.advanceTimersByTimeAsync(5_000);
    const section = await import('../../src/admin/sections/AgentFlagsSection.js');
    fetchMock.mockImplementationOnce(async () => json({ error: 'down' }, 500));
    document.body.innerHTML = await section.render(); // a failed reopen forgets the wait
    serve({ [GET]: () => json(OLD_WORKER), [ROOMS]: () => json({ rooms: [] }) });
    const root = await mount();
    expect(rowOf(root, 'SOUND_CONDUCTOR')?.classList.contains('af-row--unconfirmed')).toBe(true);
  });

  /** An apply at 10:00 recorded in the audit trail: SOUND_CONDUCTOR reset, ATTUNE_LEDGER on. */
  const TRAIL = [
    {
      at: '2026-11-17T10:00:00.000Z',
      actor: 'admin@example.test',
      set: { ATTUNE_LEDGER: 'on' },
      reset: ['SOUND_CONDUCTOR'],
      result: 'applied',
    },
  ];

  it('marks applies from the audit trail on a fresh load, then reports an override once (r1-5a, r1-1)', async () => {
    serve({
      [GET]: () => json({ ...OLD_WORKER, changes: TRAIL }),
      [ROOMS]: () => json({ rooms: [] }),
    });
    let root = await mount();
    expect(rowOf(root, 'SOUND_CONDUCTOR')?.classList.contains('af-row--unconfirmed')).toBe(true);
    expect(rowOf(root, 'ATTUNE_LEDGER')?.classList.contains('af-row--unconfirmed')).toBe(true);

    // A newer worker runs ATTUNE_LEDGER on as applied, but SOUND_CONDUCTOR still on.
    const newer = {
      ...OLD_WORKER,
      changes: TRAIL,
      snapshot: {
        ...OLD_WORKER.snapshot,
        startedAt: '2026-11-17T10:06:00.000Z',
        flags: { ...OLD_WORKER.snapshot.flags, ATTUNE_LEDGER: { raw: 'on', resolved: 'on' } },
      },
    };
    serve({ [GET]: () => json(newer), [ROOMS]: () => json({ rooms: [] }) });
    root = await mount();
    expect(root.querySelector('.af-row--unconfirmed')).toBeNull();
    const note = 'SOUND_CONDUCTOR: the agent runs on, not the default as applied.';
    expect(root.textContent).toContain(note);
    root = await mount();
    expect(root.textContent).not.toContain(note);
  });

  it("stages a reset when 'default' is picked for a flag pinned at its default (N2)", async () => {
    const pinned = {
      ...OLD_WORKER,
      snapshot: {
        ...OLD_WORKER.snapshot,
        flags: { ...OLD_WORKER.snapshot.flags, ATTUNE_LEDGER: { raw: 'off', resolved: 'off' } },
      },
    };
    serve({ [GET]: () => json(pinned), [ROOMS]: () => json({ rooms: [] }) });
    const root = await mount();
    choose(root, 'ATTUNE_LEDGER', 'off');
    choose(root, 'ATTUNE_LEDGER', 'default');
    expect(root.textContent).toContain('1 change staged');
  });
});
