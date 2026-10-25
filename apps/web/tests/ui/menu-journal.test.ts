/**
 * The Chronicle (journal panel), rendered for real with its one route mocked three
 * ways: rows, no rows, and a 500. Before (menu audit 2026-10-24) it showed an entry
 * count and the newest entry only, with no edit or delete, a server "N-Day Streak"
 * card under "Patterns I notice", and a stats row counting entries.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
  getUserId: vi.fn((): string | null => 'uid-ada'),
}));
vi.mock('../../src/utils/api.js', () => api);
vi.mock('../../src/ui/sound.ui.js', () => ({ soundUI: { play: vi.fn() } }));

const { openChronicle, close } = await import('../../src/ui/chronicle.ui.js');
const { t } = await import('../../src/i18n/index.js');

const ok = (data: unknown) => ({ ok: true, status: 200, data });
const chronicle = (recentEntries: unknown[], insights: unknown[] = []) =>
  ok({ recentEntries, insights, prompts: [], stats: { totalEntries: recentEntries.length } });
const row = (id: string, content: string, createdAt: string, editable = true) => ({
  id,
  content,
  type: 'text',
  createdAt,
  editable,
});
// What the server sent before: a streak card and a count card, in English
const OLD_STREAK = { icon: 'flame', title: '5-Day Streak', text: "You're showing up." };
const OLD_COUNT = { icon: 'book', title: 'Growing Archive', text: '12 entries captured.' };

const content = () => document.querySelector<HTMLElement>('#chronicle-content')!;
const texts = () =>
  [...document.querySelectorAll('.chronicle-entry-content')].map((e) => e.textContent);

async function open(): Promise<HTMLElement> {
  openChronicle();
  await vi.advanceTimersByTimeAsync(50);
  return content();
}

function click(selector: string, root: ParentNode = document) {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`nothing matches ${selector}`);
  el.click();
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const fn of Object.values(api)) fn.mockReset();
  api.getUserId.mockReturnValue('uid-ada');
});

afterEach(async () => {
  close();
  await vi.advanceTimersByTimeAsync(500);
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('The Chronicle: entries', () => {
  it('lists every entry newest first, from the exact chronicle route, and no streak or count', async () => {
    api.apiGet.mockResolvedValue(
      chronicle(
        [
          row('e2', 'Told my brother I was proud of him.', '2026-10-20T10:00:00Z'),
          row('e1', 'Slept badly again.', '2026-10-18T10:00:00Z'),
        ],
        [OLD_STREAK, OLD_COUNT, { kind: 'theme', icon: 'sparkles', theme: 'family' }]
      )
    );

    const panel = await open();

    expect(api.apiGet).toHaveBeenCalledWith('/api/journal/chronicle?userId=uid-ada');
    expect(panel.getAttribute('data-state')).toBe('ready');
    expect(texts()).toEqual(['Told my brother I was proud of him.', 'Slept badly again.']);
    expect(panel.textContent).toContain('family keeps coming up in what you write');
    expect(document.body.textContent).not.toMatch(
      /streak|in a row|growing archive|entries captured/i
    );
    expect(document.body.textContent).not.toContain(t('chronicle.dayStreak'));
    expect(document.querySelector('.chronicle-stats')).toBeNull();
  });

  it('pages a long journal ten at a time', async () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(`e${i}`, `entry ${i}`, `2026-10-${String(20 - i).padStart(2, '0')}T10:00:00Z`)
    );
    api.apiGet.mockResolvedValue(chronicle(rows));
    await open();

    expect(texts()).toHaveLength(10);
    click('[data-entry-action="more"]');
    expect(texts()).toHaveLength(12);
    expect(document.querySelector('[data-entry-action="more"]')).toBeNull();
  });

  it('delete asks first, then calls the delete route and drops the entry', async () => {
    api.apiGet.mockResolvedValue(
      chronicle([
        row('e2', 'Keep me.', '2026-10-20T10:00:00Z'),
        row('e1', 'Delete me.', '2026-10-18T10:00:00Z'),
      ])
    );
    api.apiDelete.mockResolvedValue(ok({ deleted: true, id: 'e1' }));
    await open();
    const entry = document.querySelector('[data-entry-id="e1"]')!;

    click('[data-entry-action="delete"]', entry);
    expect(api.apiDelete).not.toHaveBeenCalled();
    click('[data-entry-action="confirm-delete"]');
    await vi.advanceTimersByTimeAsync(0);

    expect(api.apiDelete).toHaveBeenCalledWith('/api/journal/chronicle/entry/e1');
    expect(texts()).toEqual(['Keep me.']);
  });

  it('a failed delete keeps the entry and says it did not work', async () => {
    api.apiGet.mockResolvedValue(chronicle([row('e1', 'Still here.', '2026-10-18T10:00:00Z')]));
    api.apiDelete.mockResolvedValue({ ok: false, status: 500 });
    await open();

    click('[data-entry-action="delete"]');
    click('[data-entry-action="confirm-delete"]');
    await vi.advanceTimersByTimeAsync(0);

    expect(texts()).toEqual(['Still here.']);
    expect(document.querySelector('.chronicle-entry-error')?.textContent).toBe(
      t('chronicle.list.deleteFailed')
    );
  });

  it('deleting the last entry shows the empty state', async () => {
    api.apiGet.mockResolvedValue(chronicle([row('e1', 'Only one.', '2026-10-18T10:00:00Z')]));
    api.apiDelete.mockResolvedValue(ok({ deleted: true, id: 'e1' }));
    const panel = await open();

    click('[data-entry-action="delete"]');
    click('[data-entry-action="confirm-delete"]');
    await vi.advanceTimersByTimeAsync(0);

    expect(panel.getAttribute('data-state')).toBe('empty');
  });

  it('edit saves through the edit route and shows the new words', async () => {
    api.apiGet.mockResolvedValue(chronicle([row('e1', 'Ran 3 miles.', '2026-10-18T10:00:00Z')]));
    api.apiPut.mockResolvedValue(ok({ entry: { id: 'e1', content: 'Ran 5 miles.' } }));
    await open();

    click('[data-entry-action="edit"]');
    document.querySelector<HTMLTextAreaElement>('.chronicle-entry-editor')!.value = 'Ran 5 miles.';
    click('[data-entry-action="save"]');
    await vi.advanceTimersByTimeAsync(0);

    expect(api.apiPut).toHaveBeenCalledWith('/api/journal/chronicle/entry/e1', {
      content: 'Ran 5 miles.',
    });
    expect(texts()).toEqual(['Ran 5 miles.']);
  });

  it('an entry only in an older store gets no edit or delete', async () => {
    api.apiGet.mockResolvedValue(
      chronicle([row('old', 'From last spring.', '2026-04-01T10:00:00Z', false)])
    );
    await open();

    expect(texts()).toEqual(['From last spring.']);
    expect(
      document.querySelector('[data-entry-action="edit"], [data-entry-action="delete"]')
    ).toBeNull();
  });
});

describe('The Chronicle: empty, error and loading', () => {
  it('no entries is the empty state, with copy on how it fills', async () => {
    api.apiGet.mockResolvedValue(chronicle([]));
    const panel = await open();

    expect(panel.getAttribute('data-state')).toBe('empty');
    expect(panel.textContent).toContain(
      "Nothing here yet. Write a thought here, or ask me in a call to put something in your journal, and I'll keep it for you."
    );
    expect(panel.querySelector('#action-capture')).not.toBeNull();
    expect(panel.querySelector('.chronicle-entry')).toBeNull();
  });

  it('a 500 is an error with a way to try again, never the empty state', async () => {
    api.apiGet.mockResolvedValue({ ok: false, status: 500, error: 'boom' });
    const panel = await open();

    expect(panel.getAttribute('data-state')).toBe('error');
    expect(panel.querySelector('[role="alert"]')?.textContent).toContain(t('chronicle.loadFailed'));
    expect(panel.textContent).not.toContain(t('chronicle.emptyHowItFills'));

    api.apiGet.mockResolvedValue(chronicle([row('e1', 'Back again.', '2026-10-18T10:00:00Z')]));
    click('#chronicle-retry');
    await vi.advanceTimersByTimeAsync(0);
    expect(panel.getAttribute('data-state')).toBe('ready');
  });

  it('a response of the wrong shape is an error, not an empty journal', async () => {
    api.apiGet.mockResolvedValue(ok({ entries: 'nope' }));
    expect((await open()).getAttribute('data-state')).toBe('error');
  });

  it('signed out says so', async () => {
    api.getUserId.mockReturnValue(null);
    const panel = await open();

    expect(panel.getAttribute('data-state')).toBe('error');
    expect(panel.textContent).toContain(t('chronicle.signedOut'));
    expect(api.apiGet).not.toHaveBeenCalled();
  });

  it('starts as loading, and nothing is still busy after 10 s even if the route never answers', async () => {
    api.apiGet.mockReturnValue(new Promise(() => {}));
    openChronicle();
    expect(content().getAttribute('data-state')).toBe('loading');
    expect(content().getAttribute('aria-busy')).toBe('true');

    await vi.advanceTimersByTimeAsync(10_000);

    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
    expect(content().getAttribute('data-state')).toBe('error');
  });
});
