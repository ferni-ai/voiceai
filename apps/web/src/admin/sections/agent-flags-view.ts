/**
 * The agent flags section's markup: banners, the flag list grouped by owner, recent changes
 * and the sticky apply bar, each a pure function of the section's View. AgentFlagsSection.ts
 * owns the requests, polling and events. Everything from the server is escaped.
 *
 * @module AgentFlagsView
 */

import { escapeHtml } from '../../utils/escape-html.js';
import type {
  AgentFlagsBody,
  FlagChange,
  OccupiedRoom,
  Staged,
  SwitchableFlag,
  Unconfirmed,
} from './agent-flags-state.js';

/** The page reads the snapshot this flag turns on, so only lk changes it (the server refuses it). */
const SNAPSHOT_FLAG = 'FLAG_SNAPSHOT';
export const EMPTY: Staged = { set: {}, reset: [] };

const STALE =
  'Values may be out of date: a flag was changed outside this page since the agent started.';
const NO_SNAPSHOT = 'The dev agent has not reported its flags yet, so running values are unknown.';
const OLD_WORKER = 'The old worker may keep finishing calls for a while.';

export type Phase =
  | { kind: 'idle' | 'applying' | 'live' | 'timeout' }
  | { kind: 'confirming'; applied: Staged; appliedAt: string; receivedMs: number }
  | { kind: 'error'; message: string };

export interface View {
  body: AgentFlagsBody | null;
  staged: Staged;
  query: string;
  rooms: OccupiedRoom[];
  roomsUnknown: boolean;
  /** The server refused an apply with 409; held until the admin checks the rooms again. */
  roomBusy: boolean;
  phase: Phase;
  auditWarning: string;
  /** Applies that timed out, kept marked until a snapshot confirms them or they are re-applied. */
  unconfirmed: Unconfirmed;
}

export const freshView = (): View => ({
  body: null,
  staged: EMPTY,
  query: '',
  rooms: [],
  roomsUnknown: false,
  roomBusy: false,
  phase: { kind: 'idle' },
  auditWarning: '',
  unconfirmed: {},
});

export const stagedCount = (v: View): number =>
  Object.keys(v.staged.set).length + v.staged.reset.length;
export const locked = (v: View): boolean =>
  v.phase.kind === 'applying' || v.phase.kind === 'confirming';
export const isStaged = (v: View, name: string): boolean =>
  Object.hasOwn(v.staged.set, name) || v.staged.reset.includes(name);
export const runningValue = (v: View, f: SwitchableFlag): string | null =>
  v.body?.snapshot?.flags[f.name]?.resolved ?? null;

export function renderBanners(v: View): string {
  const b = v.body;
  if (!b) return '';
  const lines: string[] = [];
  if (b.warning) lines.push(b.warning);
  if (b.stale) lines.push(STALE);
  if (!b.snapshot) lines.push(NO_SNAPSHOT);
  if (b.pendingRestart.length > 0) {
    lines.push(`Waiting for a restart: ${b.pendingRestart.join(', ')}.`);
  }
  return lines.map((t) => `<p class="af-banner">${escapeHtml(t)}</p>`).join('');
}

function renderControl(v: View, f: SwitchableFlag, running: string | null): string {
  if (f.name === SNAPSHOT_FLAG) return '<span class="af-meta">set with lk</span>';
  if (!f.switchable) return '<span class="af-meta">read-only</span>';
  const unset = v.body?.snapshot?.flags[f.name]?.raw == null;
  const applied = v.unconfirmed[f.name];
  // An unconfirmed name shows what was applied, so picking the old value is a change.
  const current = applied
    ? (applied.value ?? 'default')
    : unset
      ? 'default'
      : (running ?? 'default');
  const staged = v.staged.reset.includes(f.name) ? 'default' : v.staged.set[f.name];
  // Waiting for a restart with no apply from this page: the next value is unknown.
  const unknown = !staged && !applied && (v.body?.pendingRestart.includes(f.name) ?? false);
  const chosen = staged ?? (unknown ? '' : current);
  const head = unknown ? '<option value="" disabled selected>pending restart</option>' : '';
  const options = ['default', ...f.modes]
    .map((opt) => {
      const label = opt === 'default' ? `default (${f.default})` : opt;
      const selected = opt === chosen ? ' selected' : '';
      return `<option value="${escapeHtml(opt)}"${selected}>${escapeHtml(label)}</option>`;
    })
    .join('');
  const name = escapeHtml(f.name);
  const disabled = locked(v) ? ' disabled' : '';
  return `<select class="af-select" data-flag="${name}" aria-label="${name} value"${disabled}>${head}${options}</select>`;
}

function renderRow(v: View, f: SwitchableFlag): string {
  const running = runningValue(v, f);
  const differs = running !== null && running !== f.default;
  const unconfirmed = Object.hasOwn(v.unconfirmed, f.name);
  const classes = `af-row${differs ? ' af-row--changed' : ''}${isStaged(v, f.name) ? ' af-row--staged' : ''}${unconfirmed ? ' af-row--unconfirmed' : ''}`;
  return `
    <li class="${classes}">
      <span class="af-name">${escapeHtml(f.name)}</span>
      <span class="af-badge">${escapeHtml(f.kind)}</span>
      <span class="af-meta">default ${escapeHtml(f.default)}</span>
      <span class="af-meta">running ${escapeHtml(running ?? 'unknown')}${differs ? ' (not default)' : ''}${unconfirmed ? '; applied, not confirmed' : ''}</span>
      ${renderControl(v, f, running)}
    </li>`;
}

export function renderList(v: View): string {
  const query = v.query.trim().toLowerCase();
  const shown = (v.body?.flags ?? []).filter((f) => f.name.toLowerCase().includes(query));
  if (shown.length === 0) return '<p class="af-meta">No flags match.</p>';
  const owners = [...new Set(shown.map((f) => f.owner))].sort();
  return owners
    .map((owner) => {
      const rows = shown.filter((f) => f.owner === owner).map((f) => renderRow(v, f));
      return `<section class="af-group"><h3>${escapeHtml(owner)}</h3><ul>${rows.join('')}</ul></section>`;
    })
    .join('');
}

function describeChange(c: FlagChange): string {
  const parts = [
    ...Object.entries(c.set).map(([name, value]) => `${name}=${value}`),
    ...c.reset.map((name) => `${name} reset`),
  ];
  const detail = c.detail ? ` (${c.detail})` : '';
  const when = new Date(c.at).toLocaleString();
  return `<li><span class="af-meta">${escapeHtml(when)}</span> ${escapeHtml(c.actor)}: ${escapeHtml(parts.join(', '))} <strong>${escapeHtml(c.result)}</strong>${escapeHtml(detail)}</li>`;
}

export function renderChanges(v: View): string {
  const changes = v.body?.changes ?? [];
  if (changes.length === 0) return '<p class="af-meta">No changes yet.</p>';
  return `<ul>${changes.map(describeChange).join('')}</ul>`;
}

function phaseText(v: View): string {
  const p = v.phase;
  if (p.kind === 'applying') return 'Applying…';
  if (p.kind === 'confirming') return `Restarting dev agent… ${OLD_WORKER}`;
  if (p.kind === 'live') return 'Live on dev.';
  if (p.kind === 'timeout') return `Applied, not confirmed yet. ${OLD_WORKER}`;
  if (p.kind === 'error') return p.message;
  return '';
}

export function renderBar(v: View): string {
  const n = stagedCount(v);
  const busy = v.rooms.length > 0 || v.roomBusy;
  const names = v.rooms.map((r) => r.name).join(', ');
  const rooms = busy
    ? `<span class="af-warn">Dev room in use${names ? `: ${escapeHtml(names)}` : ''}</span>
       <button class="admin-btn admin-btn--secondary" data-af="rooms">Check again</button>`
    : v.roomsUnknown
      ? '<span class="af-meta">Could not list the dev rooms; the server checks again on Apply.</span>'
      : '';
  const notes = [phaseText(v), v.auditWarning].filter(Boolean).join(' ');
  return `
    <span>${n} change${n === 1 ? '' : 's'} staged</span>
    ${notes ? `<span class="af-meta">${escapeHtml(notes)}</span>` : ''}
    ${rooms}
    <span class="af-spacer"></span>
    <button class="admin-btn admin-btn--secondary" data-af="discard"${n === 0 || locked(v) ? ' disabled' : ''}>Discard</button>
    <button class="admin-btn admin-btn--primary" data-af="apply"${n === 0 || busy || locked(v) ? ' disabled' : ''}>Apply</button>`;
}

export const STYLES = `
  <style>
    .af { display: flex; flex-direction: column; gap: var(--space-4); }
    .af-banner {
      margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md);
      background: var(--color-semantic-warning-bg); color: var(--color-semantic-warning-text);
    }
    .af-search {
      padding: var(--space-2) var(--space-3); border-radius: var(--radius-input);
      border: 1px solid var(--color-border-medium); background: var(--color-background-elevated);
      color: var(--color-text-primary);
    }
    .af-group h3 { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--color-text-muted); }
    .af-group ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
    .af-row {
      display: grid; grid-template-columns: 2fr auto 1fr 1.5fr auto; gap: var(--space-3);
      align-items: center; padding: var(--space-2) var(--space-3); border-radius: var(--radius-md);
      background: var(--color-background-elevated); border-left: 3px solid transparent;
    }
    .af-row--changed { border-left-color: var(--color-accent-primary); }
    .af-row--staged { background: var(--color-accent-subtle); }
    .af-row--unconfirmed { border-left: 3px dashed var(--color-semantic-warning-text); }
    .af-name { font-family: monospace; color: var(--color-text-primary); overflow-wrap: anywhere; }
    .af-badge {
      font-size: var(--text-xs); padding: var(--space-0) var(--space-2); border-radius: var(--radius-badge);
      background: var(--color-background-tertiary); color: var(--color-text-muted);
    }
    .af-meta { font-size: var(--text-sm); color: var(--color-text-muted); }
    .af-warn { font-size: var(--text-sm); color: var(--color-semantic-error); }
    .af-bar {
      position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center;
      gap: var(--space-3); padding: var(--space-3) var(--space-4); border-radius: var(--radius-lg);
      background: var(--color-background-elevated); box-shadow: var(--shadow-lg);
      color: var(--color-text-primary);
    }
    .af-spacer { flex: 1; }
  </style>`;
