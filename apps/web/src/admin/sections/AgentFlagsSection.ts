/**
 * Agent flags (dev): the dev voice agent's per-file flags, grouped by owner, with the value
 * the agent runs and a control to stage a change (docs/plans/2026-11-16-dev-flag-switchboard.md,
 * "3. Page"). Apply sends only what is staged to the dev server's
 * /api/v1/admin/agent-flags/apply, which restarts the dev agent; the section then polls until
 * the new worker reports the applied values. Off the dev server every route is a 404, so the
 * section shows a notice instead.
 *
 * @module AgentFlagsSection
 */

import { escapeHtml } from '../../utils/escape-html.js';
import { createLogger } from '../../utils/logger.js';
import { adminFetch } from '../admin-fetch.js';
import {
  confirmState,
  runningForStage,
  settle,
  stage,
  unconfirm,
  type AgentFlagsBody,
  type OccupiedRoom,
  type Staged,
} from './agent-flags-state.js';
import {
  EMPTY,
  STYLES,
  freshView,
  isStaged,
  locked,
  renderBanners,
  renderBar,
  renderChanges,
  renderList,
  runningValue,
  stagedCount,
} from './agent-flags-view.js';

const log = createLogger('AgentFlagsSection');

const BASE = '/api/v1/admin/agent-flags';
const POLL_MS = 5_000;
const CONFIRM_TIMEOUT_MS = 4 * 60_000;
const NOT_DEV = 'Agent flags can only be changed on the dev admin server.';

/** POST …/apply replies: 200, 400, 409 and 502 bodies in one shape. */
interface ApplyReply {
  appliedAt?: string;
  auditWarning?: string;
  errors?: string[];
  rooms?: OccupiedRoom[];
  error?: string;
}

let view = freshView();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let bound = false;

// ============================================================================
// API
// ============================================================================

type Loaded = { ok: true; body: AgentFlagsBody } | { ok: false; status: number };

async function loadFlags(): Promise<Loaded> {
  const res = await adminFetch(BASE);
  if (!res.ok) return { ok: false, status: res.status };
  return { ok: true, body: (await res.json()) as AgentFlagsBody };
}

async function refreshRooms(): Promise<void> {
  try {
    const res = await adminFetch(`${BASE}/rooms`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    view.rooms = ((await res.json()) as { rooms: OccupiedRoom[] }).rooms;
    view.roomsUnknown = false;
  } catch (error) {
    log.warn('Dev rooms not listed', error);
    view.rooms = [];
    view.roomsUnknown = true;
  }
}

async function readReply(res: Response): Promise<ApplyReply> {
  try {
    return (await res.json()) as ApplyReply;
  } catch (error) {
    log.warn('Agent flags apply reply was not JSON', { status: res.status, error });
    return {};
  }
}

// ============================================================================
// RENDER
// ============================================================================

function paint(id: string, html: string): void {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function repaint(): void {
  paint('afBanners', renderBanners(view));
  paint('afList', renderList(view));
  paint('afChanges', renderChanges(view));
  paint('afBar', renderBar(view));
}

function shell(inner: string): string {
  return `${STYLES}<div id="agentFlagsRoot" class="af">${inner}</div>`;
}

/** Loads the flags and the dev rooms, and returns the section. */
export async function render(): Promise<string> {
  stopPolling();
  const { unconfirmed } = view; // survives a reload of the section
  view = freshView();
  view.unconfirmed = unconfirmed;
  let loaded: Loaded;
  try {
    loaded = await loadFlags();
  } catch (error) {
    log.error('Agent flags not loaded', error);
    return shell('<p class="af-banner">Could not reach the server to load agent flags.</p>');
  }
  if (!loaded.ok) {
    const text =
      loaded.status === 404 ? NOT_DEV : `Could not load agent flags (HTTP ${loaded.status}).`;
    return shell(`<p class="af-banner">${escapeHtml(text)}</p>`);
  }
  view.body = loaded.body;
  view.unconfirmed = settle(view.unconfirmed, loaded.body.snapshot);
  await refreshRooms();
  return shell(`
    <div id="afBanners">${renderBanners(view)}</div>
    <input id="afSearch" class="af-search" type="search" placeholder="Search flags" aria-label="Search flags">
    <div id="afList">${renderList(view)}</div>
    <section class="af-group"><h3>Recent changes</h3><div id="afChanges">${renderChanges(view)}</div></section>
    <div id="afBar" class="af-bar" role="status" aria-live="polite">${renderBar(view)}</div>`);
}

// ============================================================================
// APPLY AND CONFIRM
// ============================================================================

const isStagedIn = (s: Staged, name: string): boolean =>
  Object.hasOwn(s.set, name) || s.reset.includes(name);

function stopPolling(): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

async function poll(): Promise<void> {
  pollTimer = null;
  const p = view.phase;
  if (p.kind !== 'confirming' || !document.getElementById('agentFlagsRoot')) return;
  try {
    const loaded = await loadFlags();
    if (loaded.ok) {
      view.body = loaded.body;
      view.unconfirmed = settle(view.unconfirmed, loaded.body.snapshot);
    } else log.warn('Agent flags poll failed', { status: loaded.status });
  } catch (error) {
    log.warn('Agent flags poll failed', error);
  }
  if (view.phase !== p) return; // the section was reloaded meanwhile
  const state = confirmState(
    view.body?.snapshot ?? null,
    p.applied,
    p.appliedAt,
    new Date(),
    CONFIRM_TIMEOUT_MS
  );
  if (state === 'waiting') {
    pollTimer = setTimeout(() => void poll(), POLL_MS);
    return;
  }
  if (state === 'timeout') view.unconfirmed = unconfirm(view.unconfirmed, p.applied, p.appliedAt);
  view.phase = { kind: state };
  view.staged = EMPTY;
  repaint();
}

async function apply(): Promise<void> {
  const applied = view.staged;
  view.phase = { kind: 'applying' };
  view.auditWarning = '';
  repaint();
  let res: Response;
  try {
    res = await adminFetch(`${BASE}/apply`, { method: 'POST', body: JSON.stringify(applied) });
  } catch (error) {
    log.error('Agent flags apply failed', error);
    view.phase = {
      kind: 'error',
      message: 'Could not reach the server. Reload to see what applied.',
    };
    repaint();
    return;
  }
  const reply = await readReply(res);
  if (res.ok) {
    // A 200 always carries appliedAt; if the reply was unreadable, time the wait from now.
    const appliedAt = reply.appliedAt ?? new Date().toISOString();
    view.auditWarning = reply.auditWarning ?? '';
    // Re-applied names are tracked by this apply now; a timeout records them again.
    view.unconfirmed = Object.fromEntries(
      Object.entries(view.unconfirmed).filter(([n]) => !isStagedIn(applied, n))
    );
    view.phase = { kind: 'confirming', applied, appliedAt };
    pollTimer = setTimeout(() => void poll(), POLL_MS);
  } else if (res.status === 409) {
    view.rooms = reply.rooms ?? [];
    view.phase = { kind: 'idle' };
  } else {
    const why = reply.errors?.join('; ') ?? reply.error ?? `HTTP ${res.status}`;
    log.warn('Agent flags not applied', { status: res.status });
    view.phase = { kind: 'error', message: `Apply failed: ${why}` };
  }
  repaint();
}

// ============================================================================
// EVENTS
// ============================================================================

function onSelect(select: HTMLSelectElement): void {
  const flag = view.body?.flags.find((f) => f.name === select.dataset.flag);
  if (!flag || locked(view)) return;
  const value = select.value === 'default' ? 'default' : flag.modes.find((m) => m === select.value);
  if (!value) return;
  const pending = view.body?.pendingRestart ?? [];
  const running = runningForStage(flag.name, runningValue(view, flag), pending, view.unconfirmed);
  view.staged = stage(view.staged, flag.name, value, running, flag.default);
  if (view.phase.kind !== 'idle') view.phase = { kind: 'idle' };
  select.closest('.af-row')?.classList.toggle('af-row--staged', isStaged(view, flag.name));
  paint('afBar', renderBar(view));
}

async function onAction(action: string | undefined): Promise<void> {
  if (action === 'apply' && stagedCount(view) > 0 && !locked(view)) {
    await apply();
  } else if (action === 'discard' && !locked(view)) {
    view.staged = EMPTY;
    view.phase = { kind: 'idle' };
    repaint();
  } else if (action === 'rooms') {
    await refreshRooms();
    paint('afBar', renderBar(view));
  }
}

/** Binds the section's events once; they act only inside the section's root. */
export function setupEvents(): void {
  if (bound) return;
  bound = true;
  document.addEventListener('change', (e) => {
    const target = e.target;
    if (target instanceof HTMLSelectElement && target.closest('#agentFlagsRoot')) onSelect(target);
  });
  document.addEventListener('input', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || target.id !== 'afSearch') return;
    view.query = target.value;
    paint('afList', renderList(view));
  });
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const button = target?.closest<HTMLElement>('#agentFlagsRoot [data-af]');
    if (button) void onAction(button.dataset.af);
  });
}
