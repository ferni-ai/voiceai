/**
 * "Promises" in the Your Day hub: what Ferni is keeping an eye on for you, and
 * what happened, from GET /api/promises (src/api/routes/promises.ts).
 *
 * Each row says its state in plain words ("Coming up Thu", "I asked you
 * about this", "Done", "You let this go"). A failed load says so; it never
 * shows as "nothing open". Everything from the server is escaped before it
 * goes into the page: the text is the caller's own words.
 *
 * Off by default: build with VITE_PROMISES_PANEL=true, or set localStorage
 * `ferni:flag:promises-panel` to 'true' for one browser. The server answers
 * only with PROMISES_PANEL=on.
 *
 * @module ui/hub-promises
 */
import { t } from '../i18n/index.js';
import { apiGet } from '../utils/api.js';
import { escapeAttr } from './contact-settings-phone.js';
import { SECTION_ICONS } from './icons/hub-icons.js';
import { escapeHtml } from './trust-dashboard-data.js';

export const PROMISES_PANEL_STORAGE_KEY = 'ferni:flag:promises-panel';

export function promisesPanelEnabled(): boolean {
  try {
    const override = localStorage.getItem(PROMISES_PANEL_STORAGE_KEY);
    if (override === 'true') return true;
    if (override === 'false') return false;
  } catch {
    // Storage can throw in private mode; fall back to the build default.
  }
  return import.meta.env.VITE_PROMISES_PANEL === 'true';
}

/** One row of GET /api/promises. */
export interface PromiseRow {
  id: string;
  kind: string;
  text: string;
  status: string;
  dueAt: string | null;
  raisedVia: 'opener' | 'in-call' | 'text' | null;
  waitingOnYou: boolean;
  outcome: 'sent' | 'failed' | 'unknown' | null;
}

export interface Promises {
  open: PromiseRow[];
  recent: PromiseRow[];
}

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** The row's state, the way a friend would say it. */
export function stateWords(row: PromiseRow, now = new Date()): string {
  if (row.status === 'done') return t('promises.done', 'Done');
  if (row.status === 'released') return t('promises.released', 'You let this go');
  if (row.status === 'expired') return t('promises.expired', 'Let go after a while');
  if (row.waitingOnYou) return t('promises.waitingOnYou', 'Waiting for your yes');
  if (row.outcome === 'failed') return t('promises.failed', "Didn't go through");
  if (row.status === 'surfaced') {
    return row.raisedVia === 'text'
      ? t('promises.texted', 'I texted you about this')
      : t('promises.asked', 'I asked you about this');
  }
  if (!row.dueAt || Number.isNaN(Date.parse(row.dueAt)))
    return t('promises.whenever', 'Whenever it fits');
  if (Date.parse(row.dueAt) <= now.getTime()) return t('promises.dueNow', 'Due now');
  return `${t('promises.comingUp', 'Coming up')} ${day(row.dueAt)}`;
}

/** Attribute values: escaped for HTML, then for the quoted attribute. */
const attr = (value: unknown): string => escapeAttr(escapeHtml(value));

function rowHtml(row: PromiseRow, now: Date): string {
  return `
    <li class="ferni-hub-promise" data-promise-id="${attr(row.id)}" data-status="${attr(row.status)}">
      <span class="ferni-hub-promise-text">${escapeHtml(row.text)}</span>
      <span class="ferni-hub-promise-state">${escapeHtml(stateWords(row, now))}</span>
    </li>`;
}

/** The section's HTML: open first, then what happened; or why it couldn't load. */
export function renderPromisesSection(promises: Promises | null, now = new Date()): string {
  const rows = promises ? [...promises.open, ...promises.recent] : [];
  const body = !promises
    ? `<p class="ferni-hub-promises-note">${escapeHtml(t('promises.loadFailed', "I couldn't load these just now."))}</p>`
    : rows.length === 0
      ? `<p class="ferni-hub-promises-note">${escapeHtml(t('promises.none', 'Nothing open right now.'))}</p>`
      : `<ul class="ferni-hub-promises-list">${rows.map((r) => rowHtml(r, now)).join('')}</ul>`;
  return `
    <section class="ferni-hub-section ferni-hub-promises">
      <h2 class="ferni-hub-section-title">
        <span class="ferni-hub-section-icon">${SECTION_ICONS.clipboardList}</span>
        ${escapeHtml(t('promises.title', 'Promises'))}
      </h2>
      <p class="ferni-hub-section-subtitle">${escapeHtml(t('promises.subtitle', "What I'm keeping an eye on, and what happened"))}</p>
      ${body}
    </section>`;
}

const STYLES = `
  .ferni-hub-promises-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
  .ferni-hub-promise { display: flex; justify-content: space-between; gap: 0.75rem; padding: 0.75rem 1rem;
    border-radius: 12px; background: var(--color-surface-secondary); }
  .ferni-hub-promise-text { color: var(--color-text-primary); }
  .ferni-hub-promise-state { color: var(--color-text-secondary); font-size: 0.875rem; white-space: nowrap; }
  .ferni-hub-promise[data-status="done"] .ferni-hub-promise-text { color: var(--color-text-secondary); }
  .ferni-hub-promises-note { color: var(--color-text-secondary); margin: 0; }
`;

/** The caller's promises, or null when the read failed. */
export async function loadPromises(): Promise<Promises | null> {
  const res = await apiGet<Partial<Promises>>('/api/promises', undefined, {
    maxRetries: 0,
    timeout: 8000,
  });
  if (!res.ok || !Array.isArray(res.data?.open) || !Array.isArray(res.data?.recent)) return null;
  return { open: res.data.open, recent: res.data.recent };
}

/**
 * Adds the Promises section to the hub's content, above Quick Connections,
 * when the flag is on. Never throws; a hub closed meanwhile is left alone.
 */
export async function mountPromisesSection(content: Element): Promise<void> {
  if (!promisesPanelEnabled()) return;
  const promises = await loadPromises().catch(() => null);
  if (!content.isConnected) return;
  if (!document.getElementById('ferni-hub-promises-styles')) {
    const style = document.createElement('style');
    style.id = 'ferni-hub-promises-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
  }
  content.querySelector('.ferni-hub-promises')?.remove();
  const anchor = content.querySelector('.ferni-hub-section-connections');
  const html = renderPromisesSection(promises);
  if (anchor) anchor.insertAdjacentHTML('beforebegin', html);
  else content.insertAdjacentHTML('beforeend', html);
}
