/**
 * What Ferni knows about you: the data behind the memory view
 * (known-view.ui.ts), from /api/memories/known (src/api/routes/known.ts).
 *
 * A friend's memory is invisible; this one isn't. Every item says where it
 * came from ("You told me · Oct 9", "I noticed · Oct 8") so nothing reads as
 * more certain than it is, and every item can be forgotten. Facts about your
 * life can be corrected; Ferni's readings of you are inferences, so they can
 * only be called wrong, never "corrected" into a new inference.
 *
 * Off by default: build with VITE_MEMORY_VIEW=true, or set localStorage
 * `ferni:flag:memory-view` to 'true' for one browser. The server answers only
 * with MEMORY_VIEW=on.
 *
 * @module ui/memory/known
 */
import { formatDate, t } from '../../i18n/index.js';
import { apiGet, apiPost } from '../../utils/api.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('MemoryView');

export const MEMORY_VIEW_STORAGE_KEY = 'ferni:flag:memory-view';

export function memoryViewEnabled(): boolean {
  try {
    const override = localStorage.getItem(MEMORY_VIEW_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // Storage can throw in private mode; fall back to the build default.
  }
  return import.meta.env.VITE_MEMORY_VIEW === 'true';
}

export type KnownKind = 'fact' | 'world' | 'pattern' | 'sensitivity' | 'ponder';
export type KnownAction = 'correct' | 'wrong' | 'forget';

/** One item as the server sends it (intelligence/memory-view/known.ts). */
export interface KnownItem {
  id: string;
  kind: KnownKind;
  text: string;
  about?: string;
  relation?: string;
  source: 'told' | 'noticed';
  quote?: string;
  at?: string;
  day?: string;
  earlier?: boolean;
  fromYou?: boolean;
}

export type SectionId =
  'people' | 'lifeNow' | 'dates' | 'preferences' | 'readsYou' | 'thinkingAbout';

export type KnownView = Partial<Record<SectionId, KnownItem[]>>;

export interface Section {
  id: SectionId;
  title: string;
  /** A line under the title, for sections that are Ferni's impressions. */
  note?: string;
  items: KnownItem[];
}

const SECTIONS: ReadonlyArray<{ id: SectionId; title: string; note?: string }> = [
  { id: 'people', title: 'ferniKnows.people' },
  { id: 'lifeNow', title: 'memoryView.lifeNow' },
  { id: 'dates', title: 'memoryView.dates' },
  { id: 'preferences', title: 'ferniKnows.preferences' },
  { id: 'readsYou', title: 'memoryView.readsYou', note: 'memoryView.readsYouNote' },
  { id: 'thinkingAbout', title: 'memoryView.thinkingAbout', note: 'memoryView.thinkingAboutNote' },
];

/** The sections that have something in them, in reading order. */
export function sectionsOf(view: KnownView): Section[] {
  return SECTIONS.flatMap(({ id, title, note }) => {
    const items = view[id] ?? [];
    if (items.length === 0) return [];
    return [{ id, title: t(title), ...(note !== undefined && { note: t(note) }), items }];
  });
}

/** Who an item is about, as its row's lead: "Mindy · sister". */
export function aboutLine(item: KnownItem): string | undefined {
  if (item.about === undefined) return undefined;
  return item.relation !== undefined ? `${item.about} · ${item.relation}` : item.about;
}

/** Where it came from: "You told me · Oct 9", "I noticed", "You fixed this · Oct 11". */
export function provenance(item: KnownItem): string {
  const who = item.fromYou
    ? t('memoryView.fixedByYou')
    : t(item.source === 'told' ? 'ferniKnows.sourceExplicit' : 'ferniKnows.sourceInferred');
  const at = item.at !== undefined ? new Date(item.at) : null;
  const when =
    at && !Number.isNaN(at.getTime()) ? formatDate(at, { month: 'short', day: 'numeric' }) : '';
  return when ? `${who} · ${when}` : who;
}

/** A date that matters, as a short day: "Mon, Oct 12" (read as a calendar day, not a time). */
export function dayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** What the caller can do to an item. Readings and Ferni's own thoughts can't be "corrected". */
export function actionsFor(item: KnownItem): KnownAction[] {
  if (item.kind === 'fact' || item.kind === 'world') return ['correct', 'forget'];
  if (item.kind === 'pattern') return ['wrong', 'forget'];
  return ['forget'];
}

/** The view, or null when it couldn't be loaded (never an empty view standing in for a failure). */
export async function loadKnown(): Promise<KnownView | null> {
  const res = await apiGet<KnownView>('/api/memories/known');
  if (!res.ok || !res.data) {
    log.warn({ status: res.status }, 'Memory view not loaded');
    return null;
  }
  return res.data;
}

/** 'not-kept': a code or password typed as the fix; the fact was forgotten instead. */
export type ActOutcome = 'done' | 'not-kept' | 'gone' | 'failed';

/** Forget, reject or correct one item. 'gone': it was already gone. */
export async function actOn(
  item: Pick<KnownItem, 'kind' | 'id'>,
  action: KnownAction,
  value?: string
): Promise<ActOutcome> {
  // Ids are [A-Za-z0-9_-] (the server refuses anything else), so no encoding is needed.
  const res = await apiPost<{ status?: string }>(`/api/memories/known/${item.kind}/${item.id}`, {
    action,
    ...(value !== undefined && { value }),
  });
  if (res.ok) return res.data?.status === 'not-kept' ? 'not-kept' : 'done';
  return res.status === 404 ? 'gone' : 'failed';
}
