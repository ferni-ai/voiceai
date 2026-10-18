/**
 * Menu item 5, What's Ahead: every open of the calendar ends in a state the person can
 * read (menu rubric §3). Signed out says so with Sign in, a failed route is an error with
 * Try again (never an empty calendar), and the spinner never outlives 10 seconds.
 *
 * Only fetch is mocked: the panel, its loader and the real apiGet run. The bodies are the
 * shapes /api/calendar/today and /week send (src/api/calendar-routes/schedule-handlers.ts),
 * pinned against Firestore by src/api/__tests__/menu-calendar.emulator.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signInGate = vi.hoisted(() => ({ showSignInGate: vi.fn(async () => undefined) }));
vi.mock('../../src/ui/sign-in-gate.ui.js', () => signInGate);

type Reply = (signal?: AbortSignal | null) => Promise<Response>;
const replies = new Map<string, Reply>();
const json =
  (status: number, body: unknown): Reply =>
  async () =>
    new Response(JSON.stringify(body), { status });
const never: Reply = (signal) =>
  new Promise((_, reject) => {
    signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });

const event = {
  id: 'ev1',
  title: 'Coffee with Dana',
  startTime: new Date().toISOString(),
  endTime: new Date().toISOString(),
  location: null,
  isAllDay: false,
  status: 'confirmed',
};
const day = (events: unknown[]) => ({
  date: '2026-10-12',
  totalMeetings: events.length,
  totalMeetingMinutes: 0,
  freeTimeMinutes: 480,
  isOverloaded: false,
  hasBackToBack: false,
  events,
});
const week = (events: unknown[]) => ({
  days: [day(events)],
  totalMeetings: events.length,
  busiestDay: null,
  lightestDay: null,
});

function serve(today: Reply, weekReply: Reply = today): void {
  replies.set('/auth/google/status', json(200, { linked: false }));
  replies.set('/api/calendar/today', today);
  replies.set('/api/calendar/week', weekReply);
  // 404 is never retried, so no test's practice-view retries run on into the next test
  replies.set('/api/practice-view', json(404, { error: 'Not found' }));
}

const { calendarViewUI } = await import('../../src/ui/calendar-view.ui.js');
calendarViewUI.initialize();
// The panel is built once per page; the shared setup empties the body between tests
const view = calendarViewUI as unknown as {
  panel: HTMLElement;
  viewMode: string;
  practiceViewData: unknown;
};
const panelEl = view.panel;
const panel = () => panelEl;
const calls = (path: string) =>
  vi.mocked(globalThis.fetch).mock.calls.filter(([url]) => new URL(String(url)).pathname === path)
    .length;

beforeEach(() => {
  if (!panelEl.isConnected) document.body.appendChild(panelEl);
  view.viewMode = 'practice'; // the default tab, which loads /api/practice-view
  view.practiceViewData = null;
  replies.clear();
  localStorage.clear();
  localStorage.setItem('ferni_user_id', 'uid-1');
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const reply = replies.get(new URL(String(url)).pathname);
    return reply ? reply(init?.signal) : new Response('{}', { status: 404 });
  }) as typeof fetch;
});

afterEach(() => {
  calendarViewUI.hide();
  vi.useRealTimers();
});

describe('What’s Ahead states', () => {
  it('signed out: says so with Sign in, and the spinner is gone, without calling the API', async () => {
    localStorage.clear();
    serve(json(200, { overview: day([event]) }));
    await calendarViewUI.show();

    expect(panel().dataset.state).toBe('error');
    expect(panel().querySelector('[data-notice="signed-out"]')?.textContent).toContain(
      'You need to sign in first.'
    );
    expect(panel().querySelector('.calendar-view__loading')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(calls('/api/calendar/today')).toBe(0);

    localStorage.setItem('ferni_user_id', 'uid-1');
    panel().querySelector<HTMLElement>('[data-notice-action="sign-in"]')!.click();
    await vi.waitFor(() => expect(panel().dataset.state).toBe('ready'));
    expect(signInGate.showSignInGate).toHaveBeenCalledTimes(1);
  });

  it('a 401 from the calendar route is signed out, not an empty calendar', async () => {
    serve(json(401, { error: 'User ID required' }));
    await calendarViewUI.show();

    expect(panel().querySelector('[data-notice="signed-out"]')).not.toBeNull();
    expect(panel().textContent).not.toContain('Your calendar is open');
  });

  it('a 500 is an error with Try again, distinct from empty, and Try again loads it', async () => {
    serve(json(500, { error: 'Failed to fetch calendar data' }));
    await calendarViewUI.show();

    expect(panel().dataset.state).toBe('error');
    const notice = panel().querySelector('[data-notice="error"]');
    expect(notice?.textContent).toContain('Something unexpected happened. Want to try again?');
    expect(panel().textContent).not.toContain('No events today');

    serve(json(200, { overview: day([event]) }), json(200, { overview: week([event]) }));
    panel().querySelector<HTMLElement>('[data-notice-action="retry"]')!.click();
    await vi.waitFor(() => expect(panel().dataset.state).toBe('ready'));
  });

  it('a 200 without an overview is an error (wrong shape), not an empty day', async () => {
    serve(json(200, { connected: true }));
    await calendarViewUI.show();
    expect(panel().querySelector('[data-notice="error"]')).not.toBeNull();
  });

  it('no calendar connected with a null overview is empty, not the error state (#1694)', async () => {
    const notConnected = { connected: false, overview: null, ferniList: [] };
    serve(json(200, notConnected));
    await calendarViewUI.show();

    expect(panel().dataset.state).toBe('empty');
    expect(panel().querySelector('[data-notice]')).toBeNull();
  });

  it('events: ready, and the booked event is on the Today tab', async () => {
    serve(json(200, { overview: day([event]) }), json(200, { overview: week([event]) }));
    await calendarViewUI.show();

    expect(panel().dataset.state).toBe('ready');
    panel().querySelector<HTMLElement>('[data-view="today"]')!.click();
    expect(panel().textContent).toContain('Coffee with Dana');
  });

  it('no events anywhere: empty, still the calendar (not the error notice)', async () => {
    serve(json(200, { overview: day([]) }), json(200, { overview: week([]) }));
    await calendarViewUI.show();

    expect(panel().dataset.state).toBe('empty');
    expect(panel().querySelector('[data-notice]')).toBeNull();
  });

  it('a route that never answers: within 10 s the spinner ends in the error state', async () => {
    vi.useFakeTimers();
    serve(never);
    const shown = calendarViewUI.show();
    expect(panel().getAttribute('aria-busy')).toBe('true');

    await vi.advanceTimersByTimeAsync(10_000);
    await shown;
    expect(panel().dataset.state).toBe('error');
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('a failing practice view is asked once per open, not in a loop', async () => {
    serve(json(200, { overview: day([event]) }), json(200, { overview: week([event]) }));
    replies.set('/api/practice-view', json(500, { error: 'Failed' }));
    await calendarViewUI.show();
    const wait = () =>
      new Promise((r) => {
        setTimeout(r, 2000); // longer than apiGet's own retries on a 500 (~1.5 s)
      });
    await wait();
    const afterOneLoad = calls('/api/practice-view');
    await wait();

    expect(afterOneLoad).toBeGreaterThan(0);
    expect(calls('/api/practice-view')).toBe(afterOneLoad);
  }, 10_000);
});
