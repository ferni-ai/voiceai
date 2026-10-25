/**
 * Menu item 7, "When I'll Reach Out": the panel shows what was sent, and says so when
 * it can't load, instead of pretending nothing was sent.
 *
 * Before: both tabs turned any failed read into an empty list, so a 500 read as
 * "No outreach history yet", and the panel root had no state a probe could check.
 * Now the root carries data-state (loading, ready, empty, error), and error, signed
 * out and empty each have their own words (MENU-BRAND-RUBRIC §3).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Reply = { ok: boolean; status: number; data?: unknown; offline?: boolean };
const replies = vi.hoisted(() => new Map<string, Reply[]>());
const apiGet = vi.hoisted(() =>
  vi.fn(async (path: string): Promise<Reply> => {
    const queue = replies.get(path) ?? [];
    return queue.length > 1 ? queue.shift()! : (queue[0] ?? { ok: true, status: 200, data: {} });
  })
);
vi.mock('../../src/utils/api.js', () => ({ apiGet, apiPost: vi.fn(), apiDelete: vi.fn() }));

const HISTORY = '/api/outreach/history?limit=20';
const UPCOMING = '/api/outreach/upcoming';
const ok = (data: unknown): Reply => ({ ok: true, status: 200, data });

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  type: 'thinking_of_you',
  personaId: 'maya-santos',
  personaName: 'Maya',
  channel: 'push',
  sentAt: new Date(Date.now() - 3_600_000).toISOString(),
  status: 'delivered',
  ...over,
});

let root: HTMLElement;
const content = () => root.querySelector('.outreach-schedule-content') as HTMLElement;
const settled = async (state: string) => {
  await vi.waitFor(() => expect(root.dataset.state).toBe(state));
};

async function openOn(tab: 'upcoming' | 'history'): Promise<void> {
  const { openOutreachSchedule } = await import('../../src/ui/outreach-schedule.ui.js');
  await openOutreachSchedule();
  root = document.querySelector('.outreach-schedule-overlay') as HTMLElement;
  if (tab === 'history') {
    (root.querySelector('[data-tab="history"]') as HTMLElement).click();
  }
}

beforeEach(async () => {
  vi.resetModules();
  // A fresh panel module means a fresh i18n module: load the English strings again
  await (await import('../../src/i18n/index.js')).setLocale('en-US', { reload: false });
  document.body.innerHTML = '';
  replies.clear();
  apiGet.mockClear();
  replies.set(UPCOMING, [ok({ upcoming: [] })]);
});

describe('history tab', () => {
  it('shows what was sent, newest from the route, in the ready state', async () => {
    replies.set(HISTORY, [ok({ history: [entry({ message: 'How did the first week go?' })] })]);

    await openOn('history');
    await settled('ready');

    expect(content().textContent).toContain('Maya');
    expect(content().textContent).toContain('How did the first week go?');
    expect(content().textContent).toContain('Delivered');
    expect(apiGet).toHaveBeenCalledWith(
      HISTORY,
      undefined,
      expect.objectContaining({ maxRetries: 0 })
    );
  });

  it('names the kind of reach-out when the message was not kept, never the trigger code', async () => {
    replies.set(HISTORY, [ok({ history: [entry({ reason: 'burnout_approaching' })] })]);

    await openOn('history');
    await settled('ready');

    expect(content().textContent).toContain('Thinking of you');
    expect(content().textContent).not.toContain('burnout_approaching');
  });

  it('shows the error state with Try again on a 500, not the empty state', async () => {
    replies.set(HISTORY, [{ ok: false, status: 500 }, ok({ history: [] })]);

    await openOn('history');
    await settled('error');

    expect(content().textContent).toContain('Something unexpected happened.');
    expect(content().textContent).not.toContain('Nothing from me yet');
    (content().querySelector('[data-load-action]') as HTMLElement).click();
    await settled('empty');
    expect(content().textContent).toContain('Nothing from me yet');
  });

  it('treats a reply of the wrong shape as an error', async () => {
    replies.set(HISTORY, [ok({ items: [] })]);

    await openOn('history');
    await settled('error');
  });

  it('says how the space fills when nothing was sent, with one action', async () => {
    replies.set(HISTORY, [ok({ history: [] })]);

    await openOn('history');
    await settled('empty');

    expect(content().textContent).toContain(
      'When I text, call or send you a note, it shows up here.'
    );
    expect(content().querySelectorAll('button')).toHaveLength(1);
  });

  it('asks a signed-out person to sign in', async () => {
    replies.set(HISTORY, [{ ok: false, status: 401 }]);

    await openOn('history');
    await settled('error');

    expect(content().textContent).toContain('You need to sign in first.');
  });

  it('shows a sent message as text, never as markup', async () => {
    replies.set(HISTORY, [ok({ history: [entry({ message: '<img src=x onerror="alert(1)">' })] })]);

    await openOn('history');
    await settled('ready');

    expect(content().querySelector('img')).toBeNull();
    expect(content().textContent).toContain('<img src=x');
  });
});

describe('upcoming tab', () => {
  it('shows the error state when the read fails, not "no upcoming check-ins"', async () => {
    replies.set(UPCOMING, [{ ok: false, status: 500 }]);

    await openOn('upcoming');
    await settled('error');

    expect(content().textContent).toContain('Something unexpected happened.');
  });

  it('is empty, not an error, when the route answers with no items', async () => {
    await openOn('upcoming');
    await settled('empty');
  });

  // As GET /api/outreach/upcoming sends it (outreach-upcoming-route.ts)
  const followUp = (over: Record<string, unknown> = {}) => ({
    id: 'fu-7',
    type: 'follow_up',
    personaId: 'ferni',
    personaName: 'Ferni',
    channel: 'sms',
    scheduledFor: new Date(Date.now() + 26 * 3_600_000).toISOString(),
    preview: { body: 'How did the talk with your sister go?' },
    reason: 'Checking how it went',
    priority: 'medium',
    canReschedule: false,
    canCancel: false,
    ...over,
  });

  it('Preview opens the row it sits in, without asking another route', async () => {
    replies.set(UPCOMING, [ok({ upcoming: [followUp()] })]);
    await openOn('upcoming');
    await settled('ready');
    apiGet.mockClear();

    (content().querySelector('[data-action="preview"][data-id="fu-7"]') as HTMLElement).click();

    const preview = document.querySelector('.outreach-preview-overlay');
    expect(preview?.querySelector('.outreach-preview-message')?.textContent).toBe(
      'How did the talk with your sister go?'
    );
    expect(preview?.querySelector('.outreach-preview-title')?.textContent).toBe('Ferni');
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('shows planned words as text, never as markup, in the row and the preview', async () => {
    replies.set(UPCOMING, [ok({ upcoming: [followUp({ preview: { body: '<img src=x>' } })] })]);
    await openOn('upcoming');
    await settled('ready');
    (content().querySelector('[data-action="preview"]') as HTMLElement).click();

    expect(
      document.querySelector('.outreach-schedule-overlay img, .outreach-preview-overlay img')
    ).toBeNull();
    expect(document.querySelector('.outreach-preview-message')?.textContent).toBe('<img src=x>');
  });
});
