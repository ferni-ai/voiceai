/**
 * A presence tune the caller named, and whether they asked Ferni to stop
 * whistling (NAMED_TUNE=on; personas/named-tune-note.ts). Kept per caller at
 * bogle_users/{uid}/preferences/presence (preferences is already exported);
 * per call, keyed by userData.services.sessionId and bounded like quirk-log.ts.
 *
 * @module services/session/tune-state
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TuneState' });

type Env = Record<string, string | undefined>;

export function namedTuneEnabled(env: Env = process.env): boolean {
  return env.NAMED_TUNE === 'on';
}

/** Kept per caller: the tune (presence-tune.ts id) and its name in their words; "stop whistling"; the call count at the last mention. */
export interface TuneRecord {
  tuneId?: string;
  name?: string;
  namedAt?: number;
  soundsOff?: boolean;
  mentionedAtCall?: number;
}

export interface TuneStore {
  load: (userId: string) => Promise<TuneRecord | null>;
  save: (userId: string, patch: TuneRecord) => Promise<void>;
}

export const firestoreTuneStore: TuneStore = {
  async load(userId) {
    const doc = await presenceDoc(userId);
    const snap = await doc?.get();
    return snap?.exists ? (snap.data() as TuneRecord) : null;
  },
  async save(userId, patch) {
    const doc = await presenceDoc(userId);
    await doc?.set({ ...patch, updatedAt: Date.now() }, { merge: true });
  },
};

interface PresenceDoc {
  get: () => Promise<{ exists: boolean; data: () => unknown }>;
  set: (data: object, options: { merge: boolean }) => Promise<unknown>;
}

async function presenceDoc(userId: string): Promise<PresenceDoc | undefined> {
  const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
  const db = getFirestoreDb();
  return db?.collection('bogle_users').doc(userId).collection('preferences').doc('presence');
}

export type TuneKind = 'whistle' | 'hum';

/** One call: `skip` until a verified caller's record is read; the last tune played; the open naming question; whether the name came up. */
export interface CallTune {
  state: 'skip' | 'loading' | 'ready';
  userId?: string;
  record: TuneRecord;
  played?: { tuneId: string; kind: TuneKind; at: number };
  asking?: { tuneId: string; at: number };
  spoken?: boolean;
}

const MAX_SESSIONS = 64;
const calls = new Map<string, CallTune>();

/** This call's state, created on first use. */
export function callTune(sessionId: string): CallTune {
  let call = calls.get(sessionId);
  if (!call) {
    if (calls.size >= MAX_SESSIONS) calls.delete(calls.keys().next().value as string);
    call = { state: 'skip', record: {} };
    calls.set(sessionId, call);
  }
  return call;
}

/** Read a verified caller's record once a call; the turn path calls this. Never throws. */
export function loadCallerTune(call: CallTune, userId: string, store: TuneStore): void {
  if (call.state !== 'skip') return;
  call.state = 'loading';
  call.userId = userId;
  const ready = (record: TuneRecord | null): void => {
    call.record = record ?? {};
    call.state = 'ready';
  };
  store.load(userId).then(ready, (error: unknown) => {
    log.warn({ error: String(error) }, 'Named tune not read; the call goes on without it');
    ready(null);
  });
}

/** Keep a change for the caller (named, sounds off, mentioned). Never throws. */
export function saveCallerTune(call: CallTune, patch: TuneRecord, store: TuneStore): void {
  Object.assign(call.record, patch);
  if (!call.userId) return;
  store.save(call.userId, patch).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Named tune not saved');
  });
}

/** A whistle or hum just played on this call (presence sounds call this). */
export function tunePlayed(
  sid: string | undefined,
  tuneId: string,
  kind: TuneKind,
  env: Env = process.env,
  now = Date.now()
): void {
  if (sid && namedTuneEnabled(env)) callTune(sid).played = { tuneId, kind, at: now };
}

/** True when this caller asked him to stop whistling and humming. */
export function presenceSoundsHeld(sid: string | undefined, env: Env = process.env): boolean {
  return !!sid && namedTuneEnabled(env) && calls.get(sid)?.record.soundsOff === true;
}

/** The tune this caller named, to play in the quiet, or null. */
export function namedTuneFor(sid: string | undefined, env: Env = process.env): string | null {
  const record = sid && namedTuneEnabled(env) ? calls.get(sid)?.record : undefined;
  return record?.tuneId && record.name && !record.soundsOff ? record.tuneId : null;
}

/** For tests. */
export function forgetTuneCalls(): void {
  calls.clear();
}
