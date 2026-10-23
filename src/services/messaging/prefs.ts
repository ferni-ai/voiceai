/**
 * A person's messaging preferences: when Ferni may message them and how much.
 * One record, bogle_users/{uid}.messagingPrefs, and this module is its only
 * reader and writer (DESIGN 2026-10-18, M3b). Consent (whether we may text at
 * all, STOP) is separate. The panels used to save quiet hours to an in-memory
 * profile that never reached Firestore (menu re-audit 2026-10-18).
 * The one exception is messagingPrefs.focus, a Focus hold, which
 * focus-store.ts owns; the merge below leaves it alone.
 *
 * Reads never fail: a missing or invalid field reads as its default (quiet
 * 21:00 to 08:00, every channel on). Until a record is saved, quiet hours come
 * from the older outreachPreferences.quietHours when it holds a valid window.
 *
 * @module services/messaging/prefs
 */
import { createLogger } from '../../utils/safe-logger.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';

const log = createLogger({ module: 'messaging-prefs' });

export const PREFS_SOURCES = ['panel', 'text', 'voice'] as const;
export type PrefsSource = (typeof PREFS_SOURCES)[number];
export type PrefsChannel = 'sms' | 'email' | 'push';
const CHANNELS: readonly PrefsChannel[] = ['sms', 'email', 'push'];

/** Local "HH:MM" times in the person's zone; an end before the start wraps midnight. */
export interface LocalSpan {
  readonly start: string;
  readonly end: string;
}

export interface PrefsPatch {
  quietStart?: string;
  quietEnd?: string;
  /** Their IANA zone. Read back: the one saved here, else their profile's. */
  zone?: string;
  channels?: Partial<Record<PrefsChannel, boolean>>;
  /** Lowers the daily cap ("fewer texts"), 0 to MAX_PER_DAY; never raises it. */
  maxPerDay?: number;
  /** When Ferni-started check-ins are welcome ("only mornings"). */
  checkinWindow?: LocalSpan;
}

export type MessagingPrefs = Readonly<Omit<PrefsPatch, 'channels'>> & {
  readonly quietStart: string;
  readonly quietEnd: string;
  readonly channels: Readonly<Record<PrefsChannel, boolean>>;
  readonly updatedAt?: string;
  readonly updatedBy?: PrefsSource;
};

export const DEFAULT_PREFS: MessagingPrefs = {
  quietStart: '21:00',
  quietEnd: '08:00',
  channels: { sms: true, email: true, push: true },
};

/** The design's cap: 3 Ferni-started texts per person per day. */
export const MAX_PER_DAY = 3;

function toHhmm(v: unknown): string | undefined {
  const m = typeof v === 'string' ? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v.trim()) : null;
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined;
}

function spanOf(v: unknown): LocalSpan | undefined {
  const s = (v ?? {}) as { start?: unknown; end?: unknown };
  const [start, end] = [toHhmm(s.start), toHhmm(s.end)];
  return start && end && start !== end ? { start, end } : undefined;
}

const zoneOf = (v: unknown): string | undefined =>
  typeof v === 'string' && isValidTimeZone(v) ? v : undefined;
const capOf = (v: unknown): number | undefined =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_PER_DAY
    ? (v as number)
    : undefined;

function channelsOf(v: unknown): PrefsPatch['channels'] {
  if (typeof v !== 'object' || v === null) return undefined;
  const entries = Object.entries(v);
  const ok = entries.every(
    ([c, on]) => CHANNELS.includes(c as PrefsChannel) && typeof on === 'boolean'
  );
  return ok ? (Object.fromEntries(entries) as PrefsPatch['channels']) : undefined;
}

const PARSERS: Record<keyof PrefsPatch, (v: unknown) => unknown> = {
  quietStart: toHhmm,
  quietEnd: toHhmm,
  zone: zoneOf,
  channels: channelsOf,
  maxPerDay: capOf,
  checkinWindow: spanOf,
};

type Doc = Record<string, unknown> | undefined;
const field = (doc: Doc, key: string): Record<string, unknown> =>
  (doc?.[key] ?? {}) as Record<string, unknown>;

/** The prefs a bogle_users doc holds, every invalid or missing field at its default. */
export function prefsFromDoc(doc: Doc): MessagingPrefs {
  const saved = field(doc, 'messagingPrefs');
  const older = field(doc, 'outreachPreferences');
  const oldQuiet = older.quietHours as { enabled?: unknown } | undefined;
  const quiet =
    spanOf({ start: saved.quietStart, end: saved.quietEnd }) ??
    (oldQuiet?.enabled === false ? undefined : spanOf(oldQuiet));
  const ch = field(saved, 'channels');
  const channels = Object.fromEntries(
    CHANNELS.map((c) => [c, typeof ch[c] === 'boolean' ? ch[c] : true])
  ) as Record<PrefsChannel, boolean>;
  const zone =
    zoneOf(saved.zone) ?? zoneOf(older.timezone) ?? zoneOf(field(doc, 'contactInfo').timezone);
  const [maxPerDay, checkinWindow] = [capOf(saved.maxPerDay), spanOf(saved.checkinWindow)];
  const updatedBy = PREFS_SOURCES.find((s) => s === saved.updatedBy);
  return {
    quietStart: quiet?.start ?? DEFAULT_PREFS.quietStart,
    quietEnd: quiet?.end ?? DEFAULT_PREFS.quietEnd,
    channels,
    ...(zone && { zone }),
    ...(maxPerDay !== undefined && { maxPerDay }),
    ...(checkinWindow && { checkinWindow }),
    ...(typeof saved.updatedAt === 'string' && { updatedAt: saved.updatedAt }),
    ...(updatedBy && { updatedBy }),
  };
}

/** A patch from untrusted input: every field given must be valid, or nothing is saved. */
export function validatePatch(
  raw: unknown
): { ok: true; patch: PrefsPatch } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const [key, parse] of Object.entries(PARSERS)) {
    if (r[key] === undefined) continue;
    patch[key] = parse(r[key]);
    if (patch[key] === undefined) return { ok: false, error: `Invalid ${key}` };
  }
  return { ok: true, patch };
}

/** Their prefs; the defaults when there is no record or it can't be read. */
export async function readPrefs(userId: string): Promise<MessagingPrefs> {
  try {
    const doc = await getFirestoreDb()?.collection('bogle_users').doc(userId).get();
    return prefsFromDoc(doc?.exists ? doc.data() : undefined);
  } catch (error) {
    log.warn({ error: String(error), userId: userId.slice(0, 8) }, 'Prefs not read; defaults');
    return DEFAULT_PREFS;
  }
}

/** A value the caller sent that can't be saved (the route answers 400). */
export class PrefsError extends Error {
  override readonly name = 'PrefsError';
}

/**
 * Validates and saves `raw` over what is stored; returns the result. The whole
 * record is written, so a value read from the older store lives here from now
 * on (the zone excepted: a profile's zone can change). Throws when it can't
 * save: a setting that silently didn't stick is worse than an error.
 */
export async function writePrefs(
  userId: string,
  raw: unknown,
  source: PrefsSource
): Promise<MessagingPrefs> {
  const checked = validatePatch(raw);
  if (!checked.ok) throw new PrefsError(checked.error);
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const ref = db.collection('bogle_users').doc(userId);
  const snap = await ref.get();
  const doc = snap.exists ? snap.data() : undefined;
  const current = prefsFromDoc(doc);
  const { patch } = checked;
  const next: MessagingPrefs = {
    ...current,
    ...patch,
    channels: { ...current.channels, ...patch.channels },
    updatedAt: new Date().toISOString(),
    updatedBy: source,
  };
  if (next.quietStart === next.quietEnd)
    throw new PrefsError('Quiet hours need a different start and end');
  const zone = patch.zone ?? zoneOf(field(doc, 'messagingPrefs').zone);
  const { zone: _readZone, ...stored } = next;
  await ref.set({ messagingPrefs: { ...stored, ...(zone && { zone }) } }, { merge: true });
  log.info({ userId: userId.slice(0, 8), source, fields: Object.keys(patch) }, 'Prefs saved');
  return next;
}
