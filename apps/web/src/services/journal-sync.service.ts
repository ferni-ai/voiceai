/**
 * Journal Sync Service
 *
 * Keeps an open voice journal current with entries written elsewhere: on
 * another device, or by the agent during a call.
 *
 * There is no push channel for journal entries (the server has no
 * /ws/journal-sync), so this re-reads them over the REST route the journal
 * already loads from, GET /api/custom-agents/:agentId/memories?type=journalEntry:
 * when the window regains focus or becomes visible, and once a minute while it
 * is visible. It compares what came back with what the journal is showing and
 * reports only real changes.
 *
 * @module JournalSyncService
 */

import { createLogger } from '../utils/logger.js';
import { listMemories, type CustomAgentMemory } from './custom-agent.service.js';

const log = createLogger('JournalSync');

/** How often to re-read while the journal is open and the page is visible. */
export const JOURNAL_REFRESH_INTERVAL_MS = 60_000;

export interface JournalSyncChange {
  /** The entries the server has now. */
  entries: CustomAgentMemory[];
  /** Entries the journal was not showing. */
  added: number;
  /** Entries the journal was showing that the server no longer has. */
  removed: number;
}

export type JournalSyncCallback = (change: JournalSyncChange) => void;

interface SyncSession {
  agentId: string;
  getShown: () => readonly { id: string }[];
  onChange: JournalSyncCallback;
  timer: ReturnType<typeof setInterval>;
  inFlight: boolean;
}

let session: SyncSession | null = null;

function checkIfVisible(): void {
  if (document.visibilityState === 'visible') void checkJournalForChanges();
}

/**
 * Re-read the journal entries and report a change if they differ from what
 * the journal shows. Returns the change, or null when nothing changed, sync
 * is stopped, or the read failed (the journal keeps what it has; the next
 * focus or tick tries again).
 */
export async function checkJournalForChanges(): Promise<JournalSyncChange | null> {
  const current = session;
  if (!current || current.inFlight) return null;
  current.inFlight = true;
  try {
    const entries = (await listMemories(current.agentId, 'journalEntry')) ?? [];
    if (session !== current) return null; // closed or switched agents meanwhile

    const shown = new Set(current.getShown().map((e) => e.id));
    const onServer = new Set(entries.map((e) => e.id));
    const added = entries.filter((e) => !shown.has(e.id)).length;
    const removed = [...shown].filter((id) => !onServer.has(id)).length;
    if (added === 0 && removed === 0) return null;

    const change: JournalSyncChange = { entries, added, removed };
    current.onChange(change);
    return change;
  } catch (err) {
    log.warn('Could not re-read journal entries:', err);
    return null;
  } finally {
    current.inFlight = false;
  }
}

/**
 * Start keeping the journal for `agentId` current. `getShown` returns the
 * entries the journal is showing right now (so the user's own saves and
 * deletes are not reported back as changes); `onChange` receives real changes.
 */
export function startJournalSync(
  agentId: string,
  getShown: () => readonly { id: string }[],
  onChange: JournalSyncCallback
): void {
  stopJournalSync();
  session = {
    agentId,
    getShown,
    onChange,
    inFlight: false,
    timer: setInterval(checkIfVisible, JOURNAL_REFRESH_INTERVAL_MS),
  };
  window.addEventListener('focus', checkIfVisible);
  document.addEventListener('visibilitychange', checkIfVisible);
  log.debug('Journal sync started', { agentId });
}

/** Stop re-reading. Safe to call when not started. */
export function stopJournalSync(): void {
  if (!session) return;
  clearInterval(session.timer);
  window.removeEventListener('focus', checkIfVisible);
  document.removeEventListener('visibilitychange', checkIfVisible);
  session = null;
  log.debug('Journal sync stopped');
}
