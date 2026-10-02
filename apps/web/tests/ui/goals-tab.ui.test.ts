/**
 * Goals & habits tab (memory panel) and its API client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/i18n/index.js', () => ({
  t: (_key: string, fallback?: string, vars?: Record<string, string | number>) =>
    (fallback ?? _key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? '')),
  getLocale: () => 'en-US',
}));
vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/config/personas.js', () => ({ getPersona: () => ({ name: 'Ferni' }) }));
vi.mock('../../src/config/animation-constants.js', () => ({
  DURATION: { FAST: 100, NORMAL: 200, SLOW: 300 },
}));
const { toast, confirmAction } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  confirmAction: vi.fn(async () => true),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast }));
vi.mock('../../src/ui/memory-control/confirm-dialog.js', () => ({ confirmAction }));
vi.mock('../../src/utils/api.js', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}));

import { apiDelete, apiGet, apiPatch, apiPost } from '../../src/utils/api.js';
import { checkInHabit, listAspirations } from '../../src/services/aspirations.service.js';
import { GoalsTab, formatDay } from '../../src/ui/memory-control/goals-tab.js';
import type { Aspiration } from '../../src/services/aspirations.service.js';

const base = {
  milestones: [],
  source: 'explicit' as const,
  confirmed: true,
  userEdited: false,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};
const ITEMS: Aspiration[] = [
  {
    ...base,
    id: 'a-sea',
    level: 'dream',
    title: 'Live by the sea',
    status: 'active',
    parentId: null,
  },
  {
    ...base,
    id: 'a-calm',
    level: 'goal',
    title: 'Feel calmer',
    status: 'active',
    parentId: 'a-sea',
    progress: 25,
    targetDate: '2026-10-04',
  },
  {
    ...base,
    id: 'a-med',
    level: 'habit',
    title: 'Meditate',
    status: 'active',
    parentId: 'a-calm',
    habit: {
      frequency: 'daily',
      timesPerDay: 1,
      streak: 2,
      longestStreak: 4,
      dueToday: true,
      recentCheckIns: [],
    },
  },
];

// jsdom has no CSS.escape
if (typeof globalThis.CSS === 'undefined' || !globalThis.CSS.escape) {
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/["\\]/g, '\\$&') });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('aspirations service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('unwraps the list and tolerates a malformed body', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { aspirations: ITEMS, timeZone: 'UTC' },
    });
    const ok = await listAspirations();
    expect(ok.ok && ok.value.aspirations).toHaveLength(3);
    vi.mocked(apiGet).mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    const empty = await listAspirations();
    expect(empty.ok && empty.value.aspirations).toEqual([]);
    vi.mocked(apiGet).mockResolvedValueOnce({ ok: false, status: 503, error: 'down' });
    const failed = await listAspirations();
    expect(!failed.ok && failed.error.status).toBe(503);
  });

  it('posts check-ins to the item path', async () => {
    vi.mocked(apiPost).mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { aspiration: ITEMS[2] },
    });
    await checkInHabit('a/med', 'done', 'easy');
    expect(apiPost).toHaveBeenCalledWith('/api/memory/me/aspirations/a%2Fmed/check-ins', {
      status: 'done',
      note: 'easy',
    });
  });
});

describe('GoalsTab', () => {
  let host: HTMLElement;
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="host"></div>';
    host = document.getElementById('host')!;
    vi.mocked(apiGet).mockResolvedValue({
      ok: true,
      status: 200,
      data: { aspirations: structuredClone(ITEMS) },
    });
  });

  it('groups by level and shows links, streaks and progress', async () => {
    await new GoalsTab(host).load();
    const headings = [...host.querySelectorAll('h3')].map((h) => h.textContent);
    expect(headings).toEqual(['Habits', 'Goals', 'Dreams']);
    const med = host.querySelector('[data-asp-id="a-med"]')!;
    expect(med.textContent).toContain('Part of Feel calmer');
    expect(med.textContent).toContain('2 in a row');
    expect(med.textContent).toContain('Due today');
    const calm = host.querySelector('[data-asp-id="a-calm"]')!;
    expect(calm.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('25');
    expect(calm.textContent).toContain(`By ${formatDay('2026-10-04')}`);
  });

  it('marks a habit done and announces the streak', async () => {
    await new GoalsTab(host).load();
    const updated = { ...ITEMS[2], habit: { ...ITEMS[2].habit!, streak: 3, dueToday: false } };
    vi.mocked(apiPost).mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { aspiration: updated },
    });
    host.querySelector<HTMLElement>('[data-asp-id="a-med"] [data-action="done"]')!.click();
    await flush();
    await flush();
    expect(host.querySelector('[data-asp-id="a-med"] [data-action="done"]')).toBeNull();
    expect(toast.success).toHaveBeenCalledWith("Nice! That's 3 in a row.");
  });

  it('only offers higher levels as parents and sends just what changed', async () => {
    await new GoalsTab(host).load();
    host.querySelector<HTMLElement>('[data-asp-id="a-med"] [data-action="edit"]')!.click();
    const parentOptions = [
      ...host.querySelectorAll<HTMLOptionElement>('[data-role="parent"] option'),
    ].map((o) => o.value);
    expect(parentOptions).toEqual(['', 'a-sea', 'a-calm']);
    host.querySelector<HTMLSelectElement>('[data-role="status"]')!.value = 'paused';
    vi.mocked(apiPatch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { aspiration: { ...ITEMS[2], status: 'paused' } },
    });
    host.querySelector<HTMLElement>('[data-action="save"]')!.click();
    await flush();
    expect(apiPatch).toHaveBeenCalledWith('/api/memory/me/aspirations/a-med', { status: 'paused' });
    expect(host.querySelector('[data-asp-id="a-med"]')!.textContent).toContain('Paused');
  });

  it('removes optimistically and restores on failure', async () => {
    await new GoalsTab(host).load();
    vi.mocked(apiDelete).mockResolvedValueOnce({ ok: false, status: 503, error: 'down' });
    host.querySelector<HTMLElement>('[data-asp-id="a-calm"] [data-action="delete"]')!.click();
    await flush();
    await flush();
    expect(host.querySelector('[data-asp-id="a-calm"]')).not.toBeNull();
    expect(toast.error).toHaveBeenCalledWith("Couldn't remove that. Try again?");
  });

  it('shows a warm empty state and a retry on errors', async () => {
    vi.mocked(apiGet).mockResolvedValueOnce({ ok: false, status: 500, error: 'boom' });
    const tab = new GoalsTab(host);
    await tab.load();
    expect(host.textContent).toContain("I couldn't reach your goals just now.");
    vi.mocked(apiGet).mockResolvedValueOnce({ ok: true, status: 200, data: { aspirations: [] } });
    host.querySelector<HTMLElement>('[data-action="retry"]')!.click();
    await flush();
    expect(host.textContent).toContain('No goals or habits yet');
  });
});
