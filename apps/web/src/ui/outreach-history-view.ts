/**
 * "When I'll Reach Out": loading, reading and drawing what the panel shows.
 *
 * The panel root carries `data-state` (loading, ready, empty or error), and every
 * load ends in one of them. A read that fails is an error with Try again, never an
 * empty list: the history tab used to swallow failures into "No outreach history
 * yet", which also hid that the route only ever read process memory.
 *
 * History comes from GET /api/outreach/history, which reads what was actually sent
 * (`outreach_attempts`) for the signed-in person.
 *
 * @module ui/outreach-history-view
 */
import { formatRelativeTime, t } from '../i18n/index.js';
import { apiGet, type ApiResponse } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';
import { escapeHtml as escape } from '../utils/escape-html.js';

const log = createLogger('OutreachHistoryView');

export type PanelState = 'loading' | 'ready' | 'empty' | 'error';

/** A load's outcome: the data, or why there is none. */
export type Loaded<T> =
  { kind: 'ok'; data: T } | { kind: 'signed-out' } | { kind: 'offline' } | { kind: 'error' };

export interface OutreachHistoryEntry {
  id: string;
  type: string;
  personaId: string;
  personaName: string;
  channel: string;
  sentAt: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  message?: string;
}

/** What the history tab borrows from the panel, so both tabs draw alike. */
export interface HistoryLook {
  historyIcon: string;
  clockIcon: string;
  channelIcon: (channel: string) => string;
  channelLabel: (channel: string) => string;
}

/** Fail fast enough that loading always ends within 10 s, auth wait included. */
export const PANEL_READ_OPTIONS = { timeout: 5000, maxRetries: 0 } as const;

export function setPanelState(root: HTMLElement, state: PanelState): void {
  root.dataset.state = state;
}

/** Sort an API response into data, signed out, offline or error (wrong shape counts). */
export function toLoaded<T>(
  res: ApiResponse<unknown>,
  pick: (data: unknown) => T | null
): Loaded<T> {
  if (res.offline) return { kind: 'offline' };
  if (res.status === 401) return { kind: 'signed-out' };
  const data = res.ok ? pick(res.data) : null;
  if (data === null) {
    log.warn('Outreach panel read failed', { status: res.status, error: res.error });
    return { kind: 'error' };
  }
  return { kind: 'ok', data };
}

export async function fetchOutreachHistory(): Promise<Loaded<OutreachHistoryEntry[]>> {
  const res = await apiGet('/api/outreach/history?limit=20', undefined, PANEL_READ_OPTIONS);
  return toLoaded(res, (data) => {
    const history = (data as { history?: unknown } | undefined)?.history;
    return Array.isArray(history) ? (history as OutreachHistoryEntry[]) : null;
  });
}

/** Signed out, offline or error: say which, with the one thing that helps. */
export function showLoadProblem(
  root: HTMLElement,
  content: Element,
  kind: Exclude<Loaded<unknown>['kind'], 'ok'>,
  retry: () => void
): void {
  setPanelState(root, 'error');
  const copy = {
    'signed-out': [t('outreachSchedule.signedOut'), '', t('outreachSchedule.signIn')],
    offline: [t('outreachSchedule.offline'), '', ''],
    error: [
      t('outreachSchedule.loadError'),
      t('outreachSchedule.loadErrorHint'),
      t('common.retry'),
    ],
  }[kind];
  content.innerHTML = `
    <div class="outreach-schedule-empty" role="alert">
      <div class="outreach-schedule-empty-text">${copy[0]}</div>
      ${copy[1] ? `<div class="outreach-schedule-empty-subtext">${copy[1]}</div>` : ''}
      ${copy[2] ? `<button class="outreach-item-btn outreach-item-btn--preview outreach-schedule-empty-action" data-load-action>${copy[2]}</button>` : ''}
    </div>`;
  content.querySelector('[data-load-action]')?.addEventListener('click', () => {
    if (kind === 'error') return retry();
    void import('./sign-in-gate.ui.js').then((m) => m.showSignInGate());
  });
}

function statusLabel(status: OutreachHistoryEntry['status']): string {
  return t(
    {
      pending: 'outreachSchedule.statusPending',
      sent: 'outreachSchedule.statusSent',
      delivered: 'outreachSchedule.statusDelivered',
      failed: 'outreachSchedule.statusFailed',
    }[status] ?? 'outreachSchedule.statusSent'
  );
}

/** What was sent, or, when the message wasn't kept, what kind of reach-out it was. */
function previewOf(item: OutreachHistoryEntry): string {
  return (
    item.message || t(`outreachSchedule.kind.${item.type}`, t('outreachSchedule.kind.check_in'))
  );
}

function renderItem(item: OutreachHistoryEntry, look: HistoryLook): string {
  const sentAt = new Date(item.sentAt);
  const when = Number.isNaN(sentAt.getTime()) ? '' : formatRelativeTime(sentAt);
  return `
    <div class="outreach-item" data-persona="${escape(item.personaId || 'ferni')}">
      <div class="outreach-item-header">
        <div class="outreach-item-persona">${escape(item.personaName.charAt(0))}</div>
        <div class="outreach-item-info">
          <p class="outreach-item-persona-name">${escape(item.personaName)}</p>
          <div class="outreach-item-meta">
            <span class="outreach-item-channel">${look.channelIcon(item.channel)} ${look.channelLabel(item.channel)}</span>
            ${when ? `<span class="outreach-item-time">${look.clockIcon} ${when}</span>` : ''}
          </div>
        </div>
        <span class="outreach-item-status ${escape(item.status)}">${statusLabel(item.status)}</span>
      </div>
      <p class="outreach-item-preview">${escape(previewOf(item))}</p>
    </div>`;
}

/** Draw the history tab for a finished load: ready, empty, or the problem. */
export function showHistory(
  root: HTMLElement,
  content: Element,
  loaded: Loaded<OutreachHistoryEntry[]>,
  look: HistoryLook,
  retry: () => void
): void {
  if (loaded.kind !== 'ok') return showLoadProblem(root, content, loaded.kind, retry);
  if (loaded.data.length === 0) {
    setPanelState(root, 'empty');
    content.innerHTML = `
      <div class="outreach-schedule-empty">
        <div class="outreach-schedule-empty-icon">${look.historyIcon}</div>
        <div class="outreach-schedule-empty-text">${t('outreachSchedule.emptyHistory')}</div>
        <div class="outreach-schedule-empty-subtext">${t('outreachSchedule.emptyHistoryHint')}</div>
        <button class="outreach-item-btn" data-empty-action>${t('outreachSchedule.chooseCheckIns')}</button>
      </div>`;
    content.querySelector('[data-empty-action]')?.addEventListener('click', () => {
      void import('./lazy-screens.js').then((m) => m.openNotificationSettings());
    });
    return;
  }
  setPanelState(root, 'ready');
  content.innerHTML = loaded.data.map((item) => renderItem(item, look)).join('');
}
