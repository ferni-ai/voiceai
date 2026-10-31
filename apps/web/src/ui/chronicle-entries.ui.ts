/**
 * The Chronicle's entries, newest first, with edit and delete (PUT and DELETE
 * /api/journal/chronicle/entry/:id, offered on entries the server marks `editable`).
 * Menu audit 2026-10-24: the panel showed a count and the newest entry only, and
 * nothing could be corrected or removed. Also here: the load deadline (loading
 * always ends) and the i18n words for insight kinds and load errors.
 *
 * @module ui/chronicle-entries
 */

import { apiDelete, apiPut } from '../utils/api.js';
import { escapeAttr, escapeHtml } from './engagement-components.js';
import { formatDate, t } from '../i18n/index.js';

export interface ChronicleEntry {
  id: string;
  content: string;
  createdAt: string;
  editable: boolean;
}

/** What the server noticed, as a kind; the words are chronicle.insights.<kind>. */
export interface ChronicleInsight {
  kind: 'rising' | 'heavy' | 'theme';
  icon: string;
  theme?: string;
}

export type LoadError = 'signedOut' | 'offline' | 'failed';

/** Loading ends by then: ready, empty or error, never a spinner left running. */
export const LOAD_DEADLINE_MS = 8_000;
/** Entries shown at first, and added by each "Show more". */
export const PAGE_SIZE = 10;

/** The path and query the panel calls (menu-journal.emulator.test.ts calls exactly this). */
export const chroniclePath = (uid: string) =>
  `/api/journal/chronicle?userId=${encodeURIComponent(uid)}`;
const entryPath = (id: string) => `/api/journal/chronicle/entry/${encodeURIComponent(id)}`;

/** `work`, or null once LOAD_DEADLINE_MS passes (apiGet's retries can outlast it). */
export function withDeadline<T>(work: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LOAD_DEADLINE_MS);
  });
  return Promise.race([work.catch(() => null), deadline]).finally(() => clearTimeout(timer));
}

/** Why a load answered nothing usable. */
export function loadErrorOf(result: { status?: number; offline?: boolean } | null): LoadError {
  if (result?.status === 401) return 'signedOut';
  return result?.offline ? 'offline' : 'failed';
}

/** Only the kinds this client words. */
export function knownInsights(list: unknown): ChronicleInsight[] {
  const kinds = new Set(['rising', 'heavy', 'theme']);
  const items: unknown[] = Array.isArray(list) ? list : [];
  return items.filter((i): i is ChronicleInsight =>
    kinds.has((i as ChronicleInsight | null)?.kind ?? '')
  );
}

/** An insight's title and text, from its kind. The theme is the person's own word. */
export function insightCopy(insight: ChronicleInsight): { title: string; text: string } {
  const theme = escapeHtml(insight.theme ?? '');
  return {
    title: t(`chronicle.insights.${insight.kind}.title`),
    text: t(`chronicle.insights.${insight.kind}.text`, { theme }),
  };
}

/** The copy for a load that didn't work. */
export function loadErrorCopy(reason: LoadError): string {
  if (reason === 'signedOut') return t('chronicle.signedOut');
  if (reason === 'offline') return t('chronicle.offline');
  return t('chronicle.loadFailed');
}

function entryDate(entry: ChronicleEntry): string {
  const date = new Date(entry.createdAt);
  if (Number.isNaN(date.getTime())) return '';
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return formatDate(date, {
    month: 'long',
    day: 'numeric',
    year: thisYear ? undefined : 'numeric',
  });
}

type Mode = { id: string; kind: 'edit' | 'confirm-delete'; failed?: boolean } | null;

function renderEntry(entry: ChronicleEntry, mode: Mode): string {
  const date = entryDate(entry);
  const id = escapeAttr(escapeHtml(entry.id));
  const mine = mode?.id === entry.id ? mode : null;
  const failed = mine?.failed
    ? `<p class="chronicle-entry-error" role="alert">${t(mine.kind === 'edit' ? 'chronicle.list.saveFailed' : 'chronicle.list.deleteFailed')}</p>`
    : '';
  let body = `<p class="chronicle-entry-content">${escapeHtml(entry.content)}</p>`;
  let actions = '';
  if (mine?.kind === 'edit') {
    body = `<textarea class="chronicle-entry-editor" aria-label="${escapeAttr(t('chronicle.list.editorLabel'))}">${escapeHtml(entry.content)}</textarea>`;
    actions = `<button type="button" data-entry-action="save">${t('chronicle.list.save')}</button>
      <button type="button" data-entry-action="cancel">${t('chronicle.list.cancel')}</button>`;
  } else if (mine?.kind === 'confirm-delete') {
    body += `<p class="chronicle-entry-confirm">${t('chronicle.list.deleteConfirm')}</p>`;
    actions = `<button type="button" data-entry-action="confirm-delete">${t('chronicle.list.confirmDelete')}</button>
      <button type="button" data-entry-action="cancel">${t('chronicle.list.keep')}</button>`;
  } else if (entry.editable) {
    const label = (key: string) => escapeAttr(t(key, { date }));
    actions = `<button type="button" data-entry-action="edit" aria-label="${label('chronicle.list.editLabel')}">${t('chronicle.list.edit')}</button>
      <button type="button" data-entry-action="delete" aria-label="${label('chronicle.list.deleteLabel')}">${t('chronicle.list.delete')}</button>`;
  }
  return `<li class="chronicle-entry" data-entry-id="${id}">
    <time class="chronicle-entry-date" datetime="${escapeAttr(escapeHtml(entry.createdAt))}">${date}</time>
    ${body}${failed}${actions ? `<div class="chronicle-entry-actions">${actions}</div>` : ''}
  </li>`;
}

const styles = `
  .chronicle-entry-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3, 12px); }
  .chronicle-entry { padding: var(--space-4, 16px); border-radius: var(--radius-lg, 12px); border: 1px solid var(--color-border-subtle); background: var(--color-background-subtle); }
  .chronicle-entry-date { display: block; font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: var(--space-1, 4px); }
  .chronicle-entry-content { margin: 0; color: var(--color-text-primary); line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
  .chronicle-entry-editor { width: 100%; min-height: 96px; box-sizing: border-box; font: inherit; color: var(--color-text-primary); background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius-md, 8px); padding: var(--space-2, 8px); }
  .chronicle-entry-confirm, .chronicle-entry-error { margin: var(--space-2, 8px) 0 0; font-size: 0.85rem; color: var(--color-text-secondary); }
  .chronicle-entry-error { color: var(--color-error); }
  .chronicle-entry-actions { display: flex; gap: var(--space-2, 8px); margin-top: var(--space-2, 8px); }
  .chronicle-entry-actions button, .chronicle-entry-more { min-height: 44px; min-width: 44px; padding: 0 var(--space-3, 12px); font: inherit; font-size: 0.85rem; color: var(--color-accent); background: transparent; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md, 8px); cursor: pointer; }
  .chronicle-entry-actions button:focus-visible, .chronicle-entry-more:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
  .chronicle-entry-more { margin-top: var(--space-3, 12px); width: 100%; }
`;

function injectStyles(): void {
  if (document.getElementById('chronicle-entries-styles')) return;
  const el = document.createElement('style');
  el.id = 'chronicle-entries-styles';
  el.textContent = styles;
  document.head.appendChild(el);
}

/**
 * Render the list into `host` and keep it live: show more, edit, delete. `entries`
 * is the panel's own array, changed in place. `onEmpty` runs once the last entry
 * is deleted, so the panel can show its empty state.
 */
export function mountEntries(host: Element, entries: ChronicleEntry[], onEmpty: () => void): void {
  injectStyles();
  let shown = PAGE_SIZE;
  let mode: Mode = null;
  let busy = false;

  const draw = () => {
    host.innerHTML = `<section class="chronicle-section chronicle-entries">
      <div class="chronicle-section-header"><h3 class="chronicle-section-title">${t('chronicle.list.title')}</h3></div>
      <ul class="chronicle-entry-list">${entries
        .slice(0, shown)
        .map((e) => renderEntry(e, mode))
        .join('')}</ul>
      ${entries.length > shown ? `<button type="button" class="chronicle-entry-more" data-entry-action="more">${t('chronicle.list.showMore')}</button>` : ''}
    </section>`;
  };

  async function change(entry: ChronicleEntry, kind: 'edit' | 'confirm-delete', li: Element) {
    busy = true;
    if (kind === 'edit') {
      const content =
        li.querySelector<HTMLTextAreaElement>('.chronicle-entry-editor')?.value.trim() ?? '';
      const result = content
        ? await apiPut(entryPath(entry.id), { content }).catch(() => null)
        : null;
      if (result?.ok) entry.content = content;
      mode = result?.ok ? null : { id: entry.id, kind, failed: true };
    } else {
      const result = await apiDelete(entryPath(entry.id)).catch(() => null);
      if (result?.ok) entries.splice(entries.indexOf(entry), 1);
      mode = result?.ok ? null : { id: entry.id, kind, failed: true };
    }
    busy = false;
    if (entries.length === 0) onEmpty();
    else draw();
  }

  host.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-entry-action]');
    const action = button?.dataset.entryAction;
    if (!button || !action || busy) return;
    if (action === 'more') {
      shown += PAGE_SIZE;
      return draw();
    }
    const li = button.closest('.chronicle-entry');
    const entry = entries.find((e) => e.id === li?.getAttribute('data-entry-id'));
    if (!entry || !li) return;
    if (action === 'edit' || action === 'delete') {
      mode = { id: entry.id, kind: action === 'edit' ? 'edit' : 'confirm-delete' };
      return draw();
    }
    if (action === 'cancel') {
      mode = null;
      return draw();
    }
    void change(entry, action === 'save' ? 'edit' : 'confirm-delete', li);
  });
  draw();
}
