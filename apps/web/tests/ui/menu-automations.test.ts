/**
 * Menu item 3, What I Do For You: a failed load is an error with Try again, never the
 * "Nothing set up yet" empty state (menu rubric §3). Only fetch is mocked: the panel, the
 * life-automation service and the real apiGet run. The 200 body is the shape
 * GET /api/life-automation/workflows sends (src/api/life-automation-routes.ts), pinned
 * against Firestore by src/api/__tests__/menu-automations.emulator.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signInGate = vi.hoisted(() => ({ showSignInGate: vi.fn(async () => undefined) }));
vi.mock('../../src/ui/sign-in-gate.ui.js', () => signInGate);

type Reply = (signal?: AbortSignal | null) => Promise<Response>;
let reply: Reply;
const json =
  (status: number, body: unknown): Reply =>
  async () =>
    new Response(JSON.stringify(body), { status });

// As the voice createRoutine saves it: paused, at 7:30 in the caller's zone
const routine = {
  id: 'wf_1',
  userId: 'uid-1',
  name: 'Morning stretch',
  status: 'paused',
  trigger: { type: 'time', schedule: '30 7 * * *', timezone: 'America/Chicago' },
  actions: [],
  conditions: [],
  tags: ['voice-created'],
  runCount: 0,
};

let showFerniCareDashboard: () => void;
const root = () => document.querySelector<HTMLElement>('.ferni-care')!;
const settled = () =>
  vi.waitFor(() => expect(root()?.getAttribute('aria-busy')).toBeNull(), { timeout: 5000 });
const workflowCalls = () =>
  vi
    .mocked(globalThis.fetch)
    .mock.calls.filter(([url]) => String(url).includes('/api/life-automation/workflows')).length;

beforeEach(async () => {
  vi.resetModules();
  ({ showFerniCareDashboard } = await import('../../src/ui/ferni-care/dashboard.ui.js'));
  await (await import('../../src/i18n/index.js')).setLocale('en-US', { reload: false });
  document.body.innerHTML = '';
  localStorage.clear();
  localStorage.setItem('ferni_user_id', 'uid-1');
  reply = json(200, { workflows: [], settings: {} });
  globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
    reply(init?.signal)
  ) as typeof fetch;
});

afterEach(() => vi.useRealTimers());

describe('What I Do For You states', () => {
  it('routines: ready, and the routine made in a call is listed', async () => {
    reply = json(200, { workflows: [routine], settings: {} });
    showFerniCareDashboard();
    await settled();

    expect(root().dataset.state).toBe('ready');
    expect(root().textContent).toContain('Morning stretch');
    expect(root().textContent).toContain('Every day at 7:30');
    expect(root().textContent).toContain('On hold');
    // Saved, and it says so: it never runs on its own yet
    expect(root().querySelector('[data-routines-note]')?.textContent).toBe(
      "I keep these here for you. They don't run on their own yet."
    );
  });

  it('asks the exact route the server serves (menu-automations.emulator.test.ts)', async () => {
    showFerniCareDashboard();
    await settled();

    const asked = vi.mocked(globalThis.fetch).mock.calls.map(([url]) => {
      const { pathname, search } = new URL(String(url), 'http://x');
      return pathname + search;
    });
    expect(asked).toEqual(['/api/life-automation/workflows?userId=uid-1']);
  });

  it('no routines: the empty state, with its one action', async () => {
    showFerniCareDashboard();
    await settled();

    expect(root().dataset.state).toBe('empty');
    expect(root().textContent).toContain('Nothing set up yet');
    expect(root().textContent).toContain("Tell me something you'd like to do regularly");
    expect(root().textContent).not.toMatch(/I can do that|remind you/i); // nothing runs them yet
    expect(root().querySelector('[data-notice]')).toBeNull();
  });

  it('a 500 is an error with Try again, not "Nothing set up yet", and Try again loads it', async () => {
    reply = json(500, { error: 'Failed to list workflows' });
    showFerniCareDashboard();
    await settled();

    expect(root().dataset.state).toBe('error');
    expect(root().querySelector('[data-notice="error"]')?.textContent).toContain(
      'Something unexpected happened. Want to try again?'
    );
    expect(root().textContent).not.toContain('Nothing set up yet');

    reply = json(200, { workflows: [routine], settings: {} });
    root().querySelector<HTMLElement>('[data-notice-action="retry"]')!.click();
    await vi.waitFor(() => expect(root().dataset.state).toBe('ready'));
    expect(root().textContent).toContain('Morning stretch');
  });

  it('a 200 of the wrong shape is an error, not empty', async () => {
    reply = json(200, { error: 'unexpected' });
    showFerniCareDashboard();
    await settled();
    expect(root().querySelector('[data-notice="error"]')).not.toBeNull();
  });

  it('a 401 is signed out, with Sign in', async () => {
    reply = json(401, { error: 'Sign in required' });
    showFerniCareDashboard();
    await settled();

    expect(root().querySelector('[data-notice="signed-out"]')?.textContent).toContain(
      'You need to sign in first.'
    );
    root().querySelector<HTMLElement>('[data-notice-action="sign-in"]')!.click();
    await vi.waitFor(() => expect(signInGate.showSignInGate).toHaveBeenCalled());
  });

  it('no user at all: signed out at once, without asking the server', async () => {
    localStorage.clear();
    showFerniCareDashboard();
    await settled();

    expect(root().querySelector('[data-notice="signed-out"]')).not.toBeNull();
    expect(workflowCalls()).toBe(0);
  });

  it('a route that never answers: within 10 s the spinner ends in the error state', async () => {
    vi.useFakeTimers();
    reply = (signal) =>
      new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    showFerniCareDashboard();
    await vi.advanceTimersByTimeAsync(100);
    expect(root().getAttribute('aria-busy')).toBe('true');

    await vi.advanceTimersByTimeAsync(10_000);
    expect(root().dataset.state).toBe('error');
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
});
