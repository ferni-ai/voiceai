/**
 * "Work & places" tab of the memory panel: groups (current vs past jobs,
 * upcoming vs taken trips), colleagues, add, correct and forget, with the
 * service mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  list: vi.fn(),
  add: vi.fn(),
  edit: vi.fn(),
  del: vi.fn(),
  confirm: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('../../src/ui/whisper.ui.js', () => ({ toast: h.toast, whisper: h.toast }));
vi.mock('../../src/ui/memory-control/confirm-dialog.js', () => ({
  confirmAction: h.confirm,
  keepFocusInside: vi.fn(),
}));
vi.mock('../../src/services/work-places.service.js', () => ({
  listLifeArea: h.list,
  addLifeItem: h.add,
  editLifeItem: h.edit,
  deleteLifeItem: h.del,
}));

import { formatLifeDate, WorkPlacesTab } from '../../src/ui/memory-control/work-places-tab.js';
import type { LifeItem } from '../../src/services/work-places.service.js';

function item(partial: Partial<LifeItem> & Pick<LifeItem, 'id' | 'kind' | 'title'>): LifeItem {
  return {
    area: ['home', 'trip', 'favorite', 'meaningful', 'bucket_list'].includes(partial.kind)
      ? 'places'
      : 'work',
    status: 'current',
    source: 'stated',
    userEdited: false,
    sourceConversationIds: ['c1'],
    updatedAt: '2026-09-30T10:00:00Z',
    ...partial,
  } as LifeItem;
}

const WORK = [
  item({
    id: 'work_1',
    kind: 'job',
    title: 'Product manager at Globex',
    team: 'platform team',
    previousRoles: ['analyst'],
  }),
  item({
    id: 'work_2',
    kind: 'job',
    title: 'Acme',
    status: 'past',
    startDate: '2019-04',
    endDate: '2026-08',
  }),
  item({ id: 'work_3', kind: 'project', title: 'Q3 launch' }),
];
const PLACES = [
  item({
    id: 'place_1',
    kind: 'trip',
    title: 'Trip to Lisbon',
    status: 'planned',
    startDate: '2026-10-09',
    withPeople: [{ name: 'Sam', personId: 'p1' }],
  }),
  item({
    id: 'place_2',
    kind: 'home',
    title: 'Berlin',
    status: 'past',
    source: 'user',
    userEdited: true,
    sourceConversationIds: [],
  }),
];

function ok<T>(value: T) {
  return { ok: true as const, value };
}

let host: HTMLElement;
let tab: WorkPlacesTab;

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function click(selector: string): void {
  const el = host.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  el.click();
}

beforeEach(async () => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  h.list.mockImplementation(async (area: string) =>
    area === 'work'
      ? ok({ items: [...WORK], colleagues: [{ id: 'p9', name: 'Dana', relationship: 'manager' }] })
      : ok({ items: [...PLACES], colleagues: [] })
  );
  tab = new WorkPlacesTab(host);
  await tab.load();
});

describe('WorkPlacesTab', () => {
  it('groups work and places, keeps history apart and lists colleagues', () => {
    const groups = [...host.querySelectorAll('.memory-group__title')].map((e) => e.textContent);
    expect(groups).toEqual([
      'Your work now',
      'Projects',
      'Past jobs',
      'People you work with',
      'Trips coming up',
      "Places you've lived",
    ]);
    const job = host.querySelector('[data-item-id="work_1"]')!.textContent!;
    expect(job).toContain('platform team');
    expect(job).toContain('before: analyst');
    expect(host.querySelector('[data-item-id="place_1"]')!.textContent).toContain('with Sam');
    expect(host.querySelector('[data-item-id="place_2"]')!.textContent).toContain('You added this');
    expect(host.textContent).toContain('Dana (manager)');
  });

  it('shows a friendly error with retry', async () => {
    h.list.mockResolvedValueOnce({ ok: false, error: new Error('x') });
    await tab.load();
    expect(host.textContent).toContain("I couldn't reach that just now.");
    click('[data-action="retry"]');
    await flush();
    expect(host.querySelector('[data-item-id="work_1"]')).not.toBeNull();
  });

  it('adds a trip with a date', async () => {
    h.add.mockResolvedValue(
      ok(
        item({
          id: 'place_9',
          kind: 'trip',
          title: 'Trip to Rome',
          status: 'planned',
          startDate: '2026-11-02',
        })
      )
    );
    click('[data-action="start-add"][data-area="places"]');
    const form = host.querySelector<HTMLElement>('[data-role="add-form"]')!;
    form.querySelector<HTMLSelectElement>('[data-role="add-kind"]')!.value = 'trip';
    form.querySelector<HTMLInputElement>('[data-role="add-title"]')!.value = 'Rome';
    form.querySelector<HTMLInputElement>('[data-role="add-date"]')!.value = '2026-11-02';
    click('[data-action="save-add"]');
    await flush();
    expect(h.add).toHaveBeenCalledWith('places', {
      kind: 'trip',
      title: 'Rome',
      place: 'Rome',
      startDate: '2026-11-02',
    });
    expect(host.querySelector('[data-item-id="place_9"]')).not.toBeNull();
    expect(h.toast.success).toHaveBeenCalledWith("Added! I'll remember it.");
  });

  it('asks for a few words before adding', async () => {
    click('[data-action="start-add"][data-area="work"]');
    click('[data-action="save-add"]');
    await flush();
    expect(h.add).not.toHaveBeenCalled();
    expect(h.toast.warning).toHaveBeenCalledWith('Add a few words first');
  });

  it('corrects a job: title, status (current -> past) and notes', async () => {
    h.edit.mockImplementation(async (_area: string, id: string, edit: Record<string, unknown>) =>
      ok({
        ...WORK[0],
        id,
        title: edit.title as string,
        status: 'past',
        userEdited: true,
        notes: 'Left in Sept',
      })
    );
    click('[data-item-id="work_1"] [data-action="edit-item"]');
    const row = host.querySelector<HTMLElement>('[data-item-id="work_1"]')!;
    row.querySelector<HTMLInputElement>('[data-role="edit-title"]')!.value = 'PM at Globex';
    row.querySelector<HTMLSelectElement>('[data-role="edit-status"]')!.value = 'past';
    row.querySelector<HTMLTextAreaElement>('[data-role="edit-notes"]')!.value = 'Left in Sept';
    click('[data-action="save-edit"]');
    await flush();
    expect(h.edit).toHaveBeenCalledWith('work', 'work_1', {
      title: 'PM at Globex',
      notes: 'Left in Sept',
      status: 'past',
    });
    expect(host.querySelector('[data-item-id="work_1"]')!.textContent).toContain(
      'You corrected this'
    );
    expect(h.toast.success).toHaveBeenCalledWith("Got it. I'll remember it that way.");
  });

  it('keeps the edit open and says so when saving fails', async () => {
    h.edit.mockResolvedValue({ ok: false, error: new Error('x') });
    click('[data-item-id="work_3"] [data-action="edit-item"]');
    click('[data-action="save-edit"]');
    await flush();
    expect(host.querySelector('[data-role="edit-title"]')).not.toBeNull();
    expect(h.toast.error).toHaveBeenCalledWith("Couldn't save that. Try again?");
  });

  it('forgets after confirming, and puts it back if the server says no', async () => {
    h.confirm.mockResolvedValue(true);
    h.del.mockResolvedValueOnce(ok({ deleted: true }));
    click('[data-item-id="work_3"] [data-action="delete-item"]');
    await flush();
    expect(h.del).toHaveBeenCalledWith('work', 'work_3');
    expect(host.querySelector('[data-item-id="work_3"]')).toBeNull();
    expect(h.toast.success).toHaveBeenCalledWith('Forgotten.');

    h.del.mockResolvedValueOnce({ ok: false, error: new Error('x') });
    click('[data-item-id="place_1"] [data-action="delete-item"]');
    await flush();
    expect(host.querySelector('[data-item-id="place_1"]')).not.toBeNull();
    expect(h.toast.error).toHaveBeenCalledWith("Couldn't forget that. Try again?");
  });

  it('does nothing when forgetting is cancelled', async () => {
    h.confirm.mockResolvedValue(false);
    click('[data-item-id="work_1"] [data-action="delete-item"]');
    await flush();
    expect(h.del).not.toHaveBeenCalled();
  });

  it('formats month and day dates', () => {
    expect(formatLifeDate('2026-10')).toMatch(/Oct/);
    expect(formatLifeDate('2026-10-09')).toMatch(/October 9/);
    expect(formatLifeDate('nope')).toBe('');
  });
});
