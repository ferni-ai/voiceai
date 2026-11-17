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
import {
  loadFlags,
  postApply,
  readReply,
  refreshRooms,
  reload,
  track,
  type Loaded,
} from './agent-flags-api.js';
import {
  confirmState,
  nowOnServerClock,
  runningForStage,
  stage,
  unconfirm,
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
  stagedCount,
  updateBar,
} from './agent-flags-view.js';

const log = createLogger('AgentFlagsSection');

const POLL_MS = 5_000;
const CONFIRM_TIMEOUT_MS = 4 * 60_000;
const NOT_DEV = 'Agent flags can only be changed on the dev admin server.';

let view = freshView();
let pollTimer: ReturnType<typeof setTimeout> | null = null;

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
  updateBar(view);
}

function shell(inner: string): string {
  return `${STYLES}<div id="agentFlagsRoot" class="af">${inner}</div>`;
}

/** Loads the flags and the dev rooms, and returns the section. */
export async function render(): Promise<string> {
  stopPolling();
  const { unconfirmed, phase } = view; // both survive a reload of the section
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
  track(view, loaded.body);
  if (phase.kind === 'confirming') {
    // Still waiting on an apply: keep waiting. A copy, so a poll already in flight stops.
    view.phase = { ...phase };
    view.staged = phase.applied;
    pollTimer = setTimeout(() => void poll(), POLL_MS);
  }
  await refreshRooms(view);
  return shell(`
    <div id="afBanners">${renderBanners(view)}</div>
    <input id="afSearch" class="af-search" type="search" placeholder="Search flags" aria-label="Search flags">
    <div id="afList">${renderList(view)}</div>
    <section class="af-group"><h3>Recent changes</h3><div id="afChanges">${renderChanges(view)}</div></section>
    <div id="afBar" class="af-bar">${renderBar(view)}</div>`);
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
  if (p.kind !== 'confirming') return;
  if (!document.getElementById('agentFlagsRoot')) {
    // The section was left: keep the change marked in case it is never reopened here.
    view.unconfirmed = unconfirm(view.unconfirmed, p.applied, p.appliedAt);
    return;
  }
  await reload(view);
  if (view.phase !== p) return; // the section was reloaded meanwhile
  const now = nowOnServerClock(p.appliedAt, p.receivedMs, Date.now());
  const state = confirmState(
    view.body?.snapshot ?? null,
    p.applied,
    p.appliedAt,
    now,
    CONFIRM_TIMEOUT_MS
  );
  if (state === 'waiting') {
    pollTimer = setTimeout(() => void poll(), POLL_MS);
    return;
  }
  if (state === 'timeout') {
    view.unconfirmed = unconfirm(view.unconfirmed, p.applied, p.appliedAt);
    if (view.body) track(view, view.body);
  }
  view.phase = { kind: state };
  view.staged = EMPTY;
  repaint();
}

async function apply(): Promise<void> {
  const applied = view.staged;
  view.phase = { kind: 'applying' };
  view.auditWarning = '';
  view.superseded = [];
  repaint();
  let res: Response;
  try {
    res = await postApply(applied);
  } catch (error) {
    log.error('Agent flags apply failed', error);
    view.phase = {
      kind: 'error',
      message: 'Could not reach the server. Reload to see what applied.',
    };
    repaint();
    return;
  }
  const receivedMs = Date.now();
  const reply = await readReply(res);
  if (res.ok) {
    // A 200 always carries appliedAt; if the reply was unreadable, time the wait from now.
    const appliedAt = reply.appliedAt ?? new Date().toISOString();
    view.auditWarning = reply.auditWarning ?? '';
    // Re-applied names are tracked by this apply now; a timeout records them again.
    view.unconfirmed = Object.fromEntries(
      Object.entries(view.unconfirmed).filter(([n]) => !isStagedIn(applied, n))
    );
    view.phase = { kind: 'confirming', applied, appliedAt, receivedMs };
    pollTimer = setTimeout(() => void poll(), POLL_MS);
  } else if (res.status === 409) {
    // Held even when the body did not parse; the rooms check below fills in the names.
    view.roomBusy = true;
    view.rooms = reply.rooms ?? [];
    view.phase = { kind: 'idle' };
    repaint();
    // The server checks the rooms again on Apply, so a clean re-check releases the hold.
    if ((await refreshRooms(view)) && view.rooms.length === 0) view.roomBusy = false;
  } else {
    const why = reply.errors?.join('; ') ?? reply.error ?? `HTTP ${res.status}`;
    log.warn('Agent flags not applied', { status: res.status });
    // A 502 with no code may have applied (never retried): reload to show whether it landed,
    // and hold Apply until the admin changes a selection or discards.
    const unsure = res.status === 502 && !reply.code;
    const check = unsure ? ' Check the banners above before applying again.' : '';
    view.phase = { kind: 'error', message: `Apply failed: ${why.replace(/\.$/, '')}.${check}` };
    if (unsure) {
      view.maybeApplied = true;
      await reload(view);
    }
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
  const reported = view.body?.snapshot?.flags[flag.name];
  const running = runningForStage(
    flag.name,
    value,
    flag.default,
    reported,
    pending,
    view.unconfirmed
  );
  view.staged = stage(view.staged, flag.name, value, running, flag.default);
  view.maybeApplied = false;
  if (view.phase.kind !== 'idle') view.phase = { kind: 'idle' };
  select.closest('.af-row')?.classList.toggle('af-row--staged', isStaged(view, flag.name));
  updateBar(view);
}

async function onAction(action: string | undefined): Promise<void> {
  if (action === 'apply' && stagedCount(view) > 0 && !locked(view)) {
    await apply();
  } else if (action === 'discard' && !locked(view)) {
    view.staged = EMPTY;
    view.phase = { kind: 'idle' };
    view.maybeApplied = false;
    repaint();
  } else if (action === 'rooms') {
    view.roomBusy = false;
    await refreshRooms(view);
    updateBar(view);
  }
}

/**
 * Binds the section's events on its root, once per render: each render makes a new root, so
 * the listeners go with it and never outlive the section (or a test's module).
 */
export function setupEvents(): void {
  const root = document.getElementById('agentFlagsRoot');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = 'true';
  root.addEventListener('change', (e) => {
    if (e.target instanceof HTMLSelectElement) onSelect(e.target);
  });
  root.addEventListener('input', (e) => {
    if (!(e.target instanceof HTMLInputElement) || e.target.id !== 'afSearch') return;
    view.query = e.target.value;
    paint('afList', renderList(view));
  });
  root.addEventListener('click', (e) => {
    const button = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-af]') : null;
    if (button) void onAction(button.dataset.af);
  });
}
