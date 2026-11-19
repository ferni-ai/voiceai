/**
 * Where the dev flag switchboard keeps its state (ports/flag-store.ts), in dev's Firestore
 * database (ferni-dev, for the dev agent and the dev UI server). It refuses to open on any
 * other database, prod's '(default)' included. It holds:
 * - ops/agent_flag_snapshot: the flag values the dev agent last booted with (one doc,
 *   replaced on every worker start);
 * - agent_flag_changes: one doc per apply request, who asked and what LiveKit said.
 *
 * Thin on purpose: what goes in is decided by domain/snapshot.ts and the routes. Reads parse
 * what they find, so a hand-edited or older doc reads as none rather than as a wrong value.
 *
 * @module config/agent-flags/adapters/flag-store
 */
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import type { Env } from '../../env-flag.js';
import { isKnownDevDatabase } from '../../firestore-database.js';
import { getAdminFirestore } from '../../../utils/firebase-admin-app.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import { safeSet } from '../../../utils/safe-firestore.js';
import { createLogger } from '../../../utils/safe-logger.js';
import type { FlagSnapshot } from '../domain/snapshot.js';
import type { FlagChange, FlagStore } from '../ports/flag-store.js';

const log = createLogger({ module: 'agent-flag-store' });

const SNAPSHOT_COLLECTION = 'ops';
const SNAPSHOT_DOC = 'agent_flag_snapshot';
const CHANGES_COLLECTION = 'agent_flag_changes';
const MAX_CHANGES_LISTED = 100;

const RESULTS: ReadonlySet<string> = new Set(['applied', 'refused', 'failed']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isStringRecord = (v: unknown): v is Record<string, string> =>
  isRecord(v) && Object.values(v).every((x) => typeof x === 'string');

function parseSnapshot(data: unknown): FlagSnapshot | null {
  if (!isRecord(data) || typeof data.startedAt !== 'string' || !isRecord(data.flags)) return null;
  const buildSha = data.buildSha ?? null;
  if (buildSha !== null && typeof buildSha !== 'string') return null;
  const flags: FlagSnapshot['flags'] = {};
  for (const [name, entry] of Object.entries(data.flags)) {
    if (!isRecord(entry) || typeof entry.resolved !== 'string') return null;
    const raw = entry.raw ?? null;
    if (raw !== null && typeof raw !== 'string') return null;
    flags[name] = { raw, resolved: entry.resolved };
  }
  return { startedAt: data.startedAt, buildSha, flags };
}

function parseChange(data: unknown): FlagChange | null {
  if (!isRecord(data)) return null;
  const { at, actor, set, reset, result, detail } = data;
  if (typeof at !== 'string' || typeof actor !== 'string' || !isStringRecord(set)) return null;
  if (!Array.isArray(reset) || !reset.every((r) => typeof r === 'string')) return null;
  if (typeof result !== 'string' || !RESULTS.has(result)) return null;
  const change: FlagChange = { at, actor, set, reset, result: result as FlagChange['result'] };
  if (typeof detail === 'string') change.detail = detail;
  return change;
}

/** Any limit to a whole number of changes in 1..MAX_CHANGES_LISTED (NaN lists one). */
function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 1;
  return Math.min(MAX_CHANGES_LISTED, Math.max(1, Math.trunc(limit)));
}

/**
 * The store on `db`, by default the process's database (getAdminFirestore binds to
 * FIRESTORE_DATABASE in process.env, the default `env`). Throws unless `env` names dev's
 * database exactly, before any Firestore is opened.
 */
export function firestoreFlagStore(db?: Firestore, env: Env = process.env): FlagStore {
  if (!isKnownDevDatabase(env)) {
    throw new Error('The agent flag store runs only on the ferni-dev Firestore database');
  }
  const firestore = db ?? getAdminFirestore();
  const snapshotRef = (): DocumentReference =>
    firestore.collection(SNAPSHOT_COLLECTION).doc(SNAPSHOT_DOC);
  return {
    async writeSnapshot(s) {
      await safeSet(snapshotRef(), { ...s }); // no merge: a removed flag file leaves no stale entry
    },
    async readSnapshot() {
      const snap = await snapshotRef().get();
      if (!snap.exists) return null;
      const parsed = parseSnapshot(snap.data());
      if (!parsed)
        log.warn({ doc: `${SNAPSHOT_COLLECTION}/${SNAPSHOT_DOC}` }, 'Flag snapshot unreadable');
      return parsed;
    },
    async appendChange(c) {
      await firestore.collection(CHANGES_COLLECTION).add(cleanForFirestore(c));
    },
    async recentChanges(limit) {
      const snap = await firestore
        .collection(CHANGES_COLLECTION)
        .orderBy('at', 'desc')
        .limit(clampLimit(limit))
        .get();
      const changes: FlagChange[] = [];
      for (const doc of snap.docs) {
        const change = parseChange(doc.data());
        if (change) changes.push(change);
        else
          log.warn({ doc: `${CHANGES_COLLECTION}/${doc.id}` }, 'Flag change unreadable, skipped');
      }
      return changes;
    },
  };
}
