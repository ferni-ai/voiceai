/**
 * "Your story" tab of the memory panel: groups (roots, stories, turning
 * points, themes, values, how you decide), add, correct and forget, with the
 * service mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  get: vi.fn(),
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
vi.mock('../../src/services/life-story.service.js', () => ({
  getStory: h.get,
  addStoryItem: h.add,
  editStoryItem: h.edit,
  deleteStoryItem: h.del,
}));

import { LifeStoryTab } from '../../src/ui/memory-control/life-story-tab.js';
import type { StoryItem, ValueItem } from '../../src/services/life-story.service.js';

const story = (p: Partial<StoryItem> & Pick<StoryItem, 'id' | 'kind' | 'title'>): StoryItem => ({
  source: 'stated',
  userEdited: false,
  sourceConversationIds: ['c1'],
  updatedAt: '2026-09-30T10:00:00Z',
  ...p,
});

const ITEMS: StoryItem[] = [
  story({ id: 'story_origin', kind: 'origin', title: 'Grew up in Ohio' }),
  story({
    id: 'story_tree',
    kind: 'story',
    title: 'Building a treehouse with Sam',
    period: 'age 9',
    people: [{ name: 'Sam', personId: 'p1' }],
    sourceConversationIds: ['c1', 'c2'],
  }),
  story({ id: 'story_berlin', kind: 'chapter', title: 'My Berlin years', source: 'user' }),
  story({ id: 'story_decide', kind: 'decision', title: 'Sleep on big decisions' }),
];
const VALUES: ValueItem[] = [
  {
    id: 'value_family',
    label: 'family',
    category: 'family',
    statement: 'Family matters most to me',
    source: 'stated',
    userEdited: false,
    sourceConversationIds: ['c1'],
    updatedAt: '2026-09-30T10:00:00Z',
  },
];

let host: HTMLElement;
let tab: LifeStoryTab;
const flush = () => new Promise((r) => setTimeout(r, 0));
const click = async (el: Element | null) => {
  (el as HTMLElement).click();
  await flush();
};

beforeEach(async () => {
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="host"></div>';
  host = document.getElementById('host')!;
  h.get.mockResolvedValue({
    ok: true,
    value: { items: structuredClone(ITEMS), values: structuredClone(VALUES) },
  });
  tab = new LifeStoryTab(host);
  await tab.load();
});

describe('Your story tab', () => {
  it('groups the story and shows values and how they decide', () => {
    const groups = [...host.querySelectorAll('[data-group]')].map((g) =>
      g.getAttribute('data-group')
    );
    expect(groups).toEqual(['roots', 'stories', 'turns', 'values', 'decide']);
    const tree = host.querySelector('[data-story-id="story_tree"]')!;
    expect(tree.textContent).toContain('age 9 · with Sam');
    expect(tree.textContent).toContain('From 2 conversations');
    expect(host.querySelector('[data-story-id="story_berlin"]')!.textContent).toContain(
      'You added this'
    );
    expect(host.querySelector('[data-story-id="value_family"]')!.textContent).toContain(
      'Family matters most to me'
    );
  });

  it('shows a warm empty state', async () => {
    h.get.mockResolvedValue({ ok: true, value: { items: [], values: [] } });
    await tab.load();
    expect(host.textContent).toContain('Tell me where you grew up');
  });

  it('shows an error with retry when loading fails', async () => {
    h.get.mockResolvedValueOnce({ ok: false, error: new Error('x') });
    await tab.load();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    await click(host.querySelector('[data-action="retry"]'));
    expect(host.querySelector('[data-story-id="story_tree"]')).not.toBeNull();
  });

  it('adds a value', async () => {
    h.add.mockResolvedValue({
      ok: true,
      value: { ...VALUES[0], id: 'value_honesty', label: 'honesty', statement: 'honesty' },
    });
    await click(host.querySelector('[data-action="start-add"]'));
    (host.querySelector('[data-role="add-kind"]') as HTMLSelectElement).value = 'value';
    (host.querySelector('[data-role="add-title"]') as HTMLInputElement).value = 'honesty';
    await click(host.querySelector('[data-action="save-add"]'));
    expect(h.add).toHaveBeenCalledWith({ kind: 'value', title: 'honesty' });
    expect(host.querySelector('[data-story-id="value_honesty"]')).not.toBeNull();
    expect(h.toast.success).toHaveBeenCalledWith("Added! I'll remember it.");
  });

  it('asks for words before adding', async () => {
    await click(host.querySelector('[data-action="start-add"]'));
    await click(host.querySelector('[data-action="save-add"]'));
    expect(h.add).not.toHaveBeenCalled();
    expect(h.toast.warning).toHaveBeenCalled();
  });

  it('corrects a story (title, when, words)', async () => {
    h.edit.mockResolvedValue({
      ok: true,
      value: { ...ITEMS[1], title: 'The treehouse', period: 'summer 1998', userEdited: true },
    });
    await click(host.querySelector('[data-story-id="story_tree"] [data-action="edit-story"]'));
    (host.querySelector('[data-role="edit-title"]') as HTMLInputElement).value = 'The treehouse';
    (host.querySelector('[data-role="edit-period"]') as HTMLInputElement).value = 'summer 1998';
    await click(host.querySelector('[data-action="save-edit"]'));
    expect(h.edit).toHaveBeenCalledWith('story_tree', {
      title: 'The treehouse',
      detail: null,
      period: 'summer 1998',
    });
    const row = host.querySelector('[data-story-id="story_tree"]')!;
    expect(row.textContent).toContain('The treehouse');
    expect(row.textContent).toContain('You corrected this');
  });

  it('forgets after confirming, and restores on failure', async () => {
    h.confirm.mockResolvedValue(true);
    h.del.mockResolvedValueOnce({ ok: false, error: new Error('x') });
    await click(host.querySelector('[data-story-id="story_origin"] [data-action="delete-story"]'));
    expect(host.querySelector('[data-story-id="story_origin"]')).not.toBeNull();
    expect(h.toast.error).toHaveBeenCalledWith("Couldn't forget that. Try again?");

    h.del.mockResolvedValueOnce({ ok: true, value: { deleted: true } });
    await click(host.querySelector('[data-story-id="story_origin"] [data-action="delete-story"]'));
    expect(host.querySelector('[data-story-id="story_origin"]')).toBeNull();
    expect(h.toast.success).toHaveBeenCalledWith('Forgotten.');
  });

  it('does nothing when the user cancels forgetting', async () => {
    h.confirm.mockResolvedValue(false);
    await click(host.querySelector('[data-story-id="value_family"] [data-action="delete-story"]'));
    expect(h.del).not.toHaveBeenCalled();
  });
});
