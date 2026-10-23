/**
 * A Focus hold (ENGAGEMENT-SPEC 3.3): the person added Ferni to an iOS Focus
 * (Sleep, Work, something else), so what Ferni starts waits until it ends.
 * Saved at bogle_users/{uid}.messagingPrefs.focus by focus-store.ts; this is
 * the pure half: the POST body, the safety cap in the person's own zone, every
 * device's say, and the policy's view (PolicyCtx.focus).
 *
 * Only "held", the kind they picked and times are kept: never the Focus's
 * name, nothing else about the phone, and devices only as a hash.
 *
 * @module services/messaging/focus
 */
import { createHash } from 'node:crypto';
import { isValidTimeZone, wallTimeIn, zonedWallTimeToUtc } from '../../utils/time-zone.js';
import type { FocusKind, PolicyCtx } from './types.js';

export const FOCUS_KINDS: readonly FocusKind[] = ['sleep', 'work', 'other'];
const HOUR_MS = 3_600_000;
/** If "off" never arrives: Sleep ends by 12 h or 10:00 their time, whichever is first; else 10 h. */
export const SLEEP_CAP_MS = 12 * HOUR_MS;
export const OTHER_CAP_MS = 10 * HOUR_MS;
export const SLEEP_WAKE_HOUR = 10;
/** More devices than anyone owns: past it, the ones not holding are forgotten first. */
export const MAX_DEVICES = 8;

export interface FocusPost {
  readonly held: boolean;
  readonly kind: FocusKind;
  readonly holdCheckIns: boolean; // the filter's "Hold my check-ins"; off, this device holds nothing
  readonly remindersThrough: boolean;
  readonly deviceId: string;
}

export interface FocusRecord {
  readonly held: boolean;
  readonly kind: FocusKind;
  readonly remindersThrough: boolean;
  readonly since?: string; // ISO; set while held
  readonly capUntil?: string; // ISO; set while held
  readonly byDevice: Readonly<Record<string, boolean>>; // device hash -> holding
  readonly updatedAt: string;
}

const bool = (v: unknown, fallback: boolean): boolean | undefined =>
  v === undefined ? fallback : typeof v === 'boolean' ? v : undefined;
const kindOf = (v: unknown): FocusKind | undefined => FOCUS_KINDS.find((k) => k === v);

/** The body from an untrusted client: every field must be valid, or nothing is saved. */
export function parseFocusPost(
  raw: unknown
): { ok: true; post: FocusPost } | { ok: false; error: string } {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const held = typeof r.held === 'boolean' ? r.held : undefined;
  const kind = r.kind === undefined ? 'other' : kindOf(r.kind);
  const holdCheckIns = bool(r.holdCheckIns, true);
  const remindersThrough = bool(r.remindersThrough, true);
  const id = typeof r.deviceId === 'string' ? r.deviceId.trim() : '';
  if (held === undefined) return { ok: false, error: 'held must be true or false' };
  if (!kind) return { ok: false, error: 'kind must be sleep, work or other' };
  if (holdCheckIns === undefined || remindersThrough === undefined)
    return { ok: false, error: 'holdCheckIns and remindersThrough must be true or false' };
  if (id.length < 1 || id.length > 200) return { ok: false, error: 'deviceId is required' };
  return { ok: true, post: { held, kind, holdCheckIns, remindersThrough, deviceId: id } };
}

/** When a hold that began at `since` ends on its own, in the person's zone (none: 12 h flat). */
export function focusCapUntil(since: Date, kind: FocusKind, zone: string | undefined): Date {
  if (kind !== 'sleep') return new Date(since.getTime() + OTHER_CAP_MS);
  const flat = new Date(since.getTime() + SLEEP_CAP_MS);
  if (!isValidTimeZone(zone)) return flat;
  const w = wallTimeIn(since, zone);
  const wakeOn = (dayOffset: number): Date => {
    const d = new Date(Date.UTC(w.year, w.month - 1, w.day + dayOffset));
    const [year, month, day] = [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
    return zonedWallTimeToUtc({ year, month, day, hour: SLEEP_WAKE_HOUR, minute: 0 }, zone);
  };
  const today = wakeOn(0);
  const wake = today.getTime() > since.getTime() ? today : wakeOn(1);
  return wake < flat ? wake : flat;
}

export const deviceKey = (deviceId: string): string =>
  createHash('sha256').update(deviceId).digest('hex').slice(0, 16);

const isLive = (r: FocusRecord | undefined, now: Date): r is FocusRecord =>
  r?.held === true && r.capUntil !== undefined && now.getTime() < Date.parse(r.capUntil);

/**
 * The record after one device's post. The hold is on while any device holds,
 * so one clearing while another still holds keeps it. A hold past its cap is
 * over: the next post starts fresh, forgetting devices that never said "off".
 */
export function nextFocus(
  current: FocusRecord | undefined,
  post: FocusPost,
  now: Date,
  zone: string | undefined
): FocusRecord | 'too-many-devices' {
  const live = isLive(current, now);
  let votes: Record<string, boolean> = { ...(live ? current.byDevice : {}) };
  votes[deviceKey(post.deviceId)] = post.held && post.holdCheckIns;
  if (Object.keys(votes).length > MAX_DEVICES)
    votes = Object.fromEntries(Object.entries(votes).filter(([, on]) => on));
  if (Object.keys(votes).length > MAX_DEVICES) return 'too-many-devices';
  const updatedAt = now.toISOString();
  const base = live ? current : undefined;
  const kind = post.held ? post.kind : (base?.kind ?? post.kind);
  const remindersThrough = post.held ? post.remindersThrough : (base?.remindersThrough ?? true);
  if (!Object.values(votes).some(Boolean))
    return { held: false, kind, remindersThrough, byDevice: votes, updatedAt };
  const since = base?.since ?? updatedAt;
  const capUntil = focusCapUntil(new Date(since), kind, zone).toISOString();
  return { held: true, kind, remindersThrough, since, capUntil, byDevice: votes, updatedAt };
}

const iso = (v: unknown): string | undefined =>
  typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : undefined;

/** The saved record, or undefined when there is none or it is unreadable. */
export function focusFromDoc(raw: unknown): FocusRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const kind = kindOf(r.kind);
  const updatedAt = iso(r.updatedAt);
  if (typeof r.held !== 'boolean' || !kind || !updatedAt) return undefined;
  const devices = typeof r.byDevice === 'object' && r.byDevice !== null ? r.byDevice : {};
  const byDevice = Object.fromEntries(
    Object.entries(devices).filter((e): e is [string, boolean] => typeof e[1] === 'boolean')
  );
  const [since, capUntil] = [iso(r.since), iso(r.capUntil)];
  const remindersThrough = r.remindersThrough !== false;
  return {
    ...{ held: r.held, kind, remindersThrough, byDevice, updatedAt },
    ...(since && { since }),
    ...(capUntil && { capUntil }),
  };
}

/** What the policy reads: the hold while it lasts, else nothing. */
export function focusHold(r: FocusRecord | undefined, now: Date): PolicyCtx['focus'] {
  if (!isLive(r, now) || r.capUntil === undefined) return undefined;
  const { kind, remindersThrough } = r;
  return { held: true, kind, remindersThrough, capUntil: new Date(r.capUntil) };
}
