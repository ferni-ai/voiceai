/**
 * The memory view's data: sections in reading order with Ferni's impressions
 * labelled as impressions, provenance on every item, readings that can only
 * be called wrong (never "corrected"), and the exact requests each action
 * sends. A failed load is null, never an empty memory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/i18n/index.js', () => ({
  t: (key: string) => key,
  formatDate: (d: Date, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { ...o, timeZone: 'UTC' }).format(d),
}));
const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock('../../../src/utils/api.js', () => api);

import {
  actionsFor,
  actOn,
  aboutLine,
  dayLabel,
  loadKnown,
  memoryViewEnabled,
  MEMORY_VIEW_STORAGE_KEY,
  provenance,
  sectionsOf,
  type KnownItem,
} from '../../../src/ui/memory/known.js';

const item = (over: Partial<KnownItem>): KnownItem => ({
  id: 'x',
  kind: 'fact',
  text: 'breed: golden retriever',
  source: 'told',
  ...over,
});

describe('sectionsOf', () => {
  it('keeps reading order, drops empty sections, and notes the impression sections', () => {
    const sections = sectionsOf({
      readsYou: [item({ kind: 'pattern', source: 'noticed' })],
      people: [item({ about: 'Biscuit' })],
      dates: [],
      thinkingAbout: [item({ kind: 'ponder', source: 'noticed' })],
    });
    expect(sections.map((s) => [s.id, s.title, s.note])).toEqual([
      ['people', 'ferniKnows.people', undefined],
      ['readsYou', 'memoryView.readsYou', 'memoryView.readsYouNote'],
      ['thinkingAbout', 'memoryView.thinkingAbout', 'memoryView.thinkingAboutNote'],
    ]);
  });

  it('is empty for an empty view (the empty state shows)', () => {
    expect(sectionsOf({})).toEqual([]);
  });
});

describe('provenance', () => {
  it('says who it came from and when', () => {
    expect(provenance(item({ at: '2026-10-09T18:00:00Z' }))).toBe(
      'ferniKnows.sourceExplicit · Oct 9'
    );
    expect(provenance(item({ source: 'noticed' }))).toBe('ferniKnows.sourceInferred');
    expect(provenance(item({ fromYou: true, at: '2026-10-11T18:00:00Z' }))).toBe(
      'memoryView.fixedByYou · Oct 11'
    );
    expect(provenance(item({ at: 'not a date' }))).toBe('ferniKnows.sourceExplicit');
  });

  it('names who an item is about, and a date as a calendar day', () => {
    expect(aboutLine(item({ about: 'Mindy', relation: 'sister' }))).toBe('Mindy · sister');
    expect(aboutLine(item({}))).toBeUndefined();
    expect(dayLabel('2026-10-12')).toBe('Mon, Oct 12');
  });
});

describe('actionsFor', () => {
  it('lets facts be corrected, readings only called wrong, and the rest forgotten', () => {
    expect(actionsFor(item({ kind: 'fact' }))).toEqual(['correct', 'forget']);
    expect(actionsFor(item({ kind: 'world' }))).toEqual(['correct', 'forget']);
    expect(actionsFor(item({ kind: 'pattern' }))).toEqual(['wrong', 'forget']);
    expect(actionsFor(item({ kind: 'sensitivity' }))).toEqual(['forget']);
    expect(actionsFor(item({ kind: 'ponder' }))).toEqual(['forget']);
  });
});

describe('requests', () => {
  beforeEach(() => {
    api.apiGet.mockReset();
    api.apiPost.mockReset();
  });

  it('a failed load is null, never an empty memory', async () => {
    api.apiGet.mockResolvedValue({ ok: false, status: 500 });
    expect(await loadKnown()).toBeNull();
    api.apiGet.mockResolvedValue({ ok: true, status: 200, data: { people: [] } });
    expect(await loadKnown()).toEqual({ people: [] });
    expect(api.apiGet).toHaveBeenCalledWith('/api/memories/known');
  });

  it('sends each action to the item’s own path, and reads 404 as already gone', async () => {
    api.apiPost.mockResolvedValue({ ok: true, status: 200 });
    expect(await actOn({ kind: 'world', id: 'w1' }, 'correct', 'hip surgery')).toBe('done');
    expect(api.apiPost).toHaveBeenCalledWith('/api/memories/known/world/w1', {
      action: 'correct',
      value: 'hip surgery',
    });
    await actOn({ kind: 'pattern', id: 'jokes-when-anxious' }, 'wrong');
    expect(api.apiPost).toHaveBeenLastCalledWith('/api/memories/known/pattern/jokes-when-anxious', {
      action: 'wrong',
    });
    api.apiPost.mockResolvedValue({ ok: false, status: 404 });
    expect(await actOn({ kind: 'fact', id: 'f1' }, 'forget')).toBe('gone');
    api.apiPost.mockResolvedValue({ ok: false, status: 500 });
    expect(await actOn({ kind: 'fact', id: 'f1' }, 'forget')).toBe('failed');
  });

  it('reads a correction the server did not keep (a code or password) as not-kept, not done', async () => {
    api.apiPost.mockResolvedValue({ ok: true, status: 200, data: { status: 'not-kept' } });
    expect(await actOn({ kind: 'fact', id: 'f1' }, 'correct', '5512')).toBe('not-kept');
  });
});

describe('memoryViewEnabled', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('is off by default, on with the build flag, and overridable per browser', () => {
    vi.stubEnv('VITE_MEMORY_VIEW', '');
    expect(memoryViewEnabled()).toBe(false);
    localStorage.setItem(MEMORY_VIEW_STORAGE_KEY, 'true');
    expect(memoryViewEnabled()).toBe(true);
    vi.stubEnv('VITE_MEMORY_VIEW', 'true');
    localStorage.setItem(MEMORY_VIEW_STORAGE_KEY, 'false');
    expect(memoryViewEnabled()).toBe(false);
    localStorage.clear();
    expect(memoryViewEnabled()).toBe(true);
  });
});
