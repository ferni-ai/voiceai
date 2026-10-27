/**
 * AI_NOTICE_SPOKEN (off by default): Ferni says, out loud, that he is an AI and
 * not a person, as New York's AI-companion law asks (General Business Law
 * Article 47, in force 2025-11-05): at the start of an interaction, at most
 * once a day per person, and again at least every 3 hours of a continuing one.
 * Seth's call, 2026-10-26.
 *
 * - Spoken only, in the voice of whoever is speaking (Ferni or a teammate). No
 *   banner and no "AI" label anywhere on screen (Seth's standing rule).
 * - Fixed words, spoken as written. The model never writes or rephrases them.
 * - Opening: woven into the call's first line (resume-after-drop.ts
 *   greetingOrResume), unless this person heard it in the last 24 hours.
 * - Repeat: after one of Ferni's replies, 3 hours after the last notice (or the
 *   call's start), never on a crisis turn (multi-agent/ai-notice-wiring.ts).
 * - Every notice is logged and, for a member, recorded under
 *   bogle_users/{uid}/ai_notices: when, channel, opening or repeat, the call and
 *   persona ids. Never any words from the call. Account deletion erases it with
 *   the user record. A non-member id (anon:, anonymous) has no record, so it
 *   hears the notice on every call; a call Ferni places for someone else
 *   (onbehalf:) never reaches this: outbound-opener.ts introduces Ferni there.
 *
 * @module agents/shared/ai-notice
 */

import { flagOn, type Env } from '../../config/env-flag.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { writeHeld } from '../../utils/minor-care.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ai-notice' });

/** Said once per person per day, at the start of a call. */
export const OPENING_NOTICE = "Just so you know, I'm an AI, not a person.";
/** Said in a call that has gone on 3 hours since the last notice. */
export const REPEAT_NOTICE =
  "We've been talking a while, so a quick reminder, I'm an AI, not a person.";

export const NOTICE_DAY_MS = 24 * 60 * 60 * 1000;
export const NOTICE_REPEAT_MS = 3 * 60 * 60 * 1000;
/** How long the first line waits for when this person last heard it; past that, it says it. */
export const LOOKUP_WAIT_MS = 400;

export type NoticeChannel = 'app' | 'phone' | 'unknown';
export type NoticeKind = 'opening' | 'repeat';

export function aiNoticeEnabled(env: Env = process.env): boolean {
  return flagOn('AI_NOTICE_SPOKEN', env);
}

export interface NoticeRecord {
  at: Date;
  kind: NoticeKind;
  channel: NoticeChannel;
  sessionId: string;
  personaId?: string;
}

export interface NoticeStore {
  /** When this person last heard a notice, or null if never. */
  lastNoticeAt: (userId: string) => Promise<Date | null>;
  record: (userId: string, notice: NoticeRecord) => Promise<void>;
}

type NoticeCollection = FirebaseFirestore.CollectionReference | undefined;
const notices = (userId: string): NoticeCollection =>
  getFirestoreDb()?.collection('bogle_users').doc(userId).collection('ai_notices');

export const firestoreNoticeStore: NoticeStore = {
  async lastNoticeAt(userId) {
    const col = notices(userId);
    if (!col) throw new Error('no Firestore');
    const snap = await col.orderBy('at', 'desc').limit(1).get();
    const at: unknown = snap.docs[0]?.get('at');
    if (at instanceof Date) return at;
    const toDate = (at as { toDate?: () => Date } | undefined)?.toDate;
    return typeof toDate === 'function' ? toDate.call(at) : null;
  },
  async record(userId, notice) {
    const col = notices(userId);
    if (!col) throw new Error('no Firestore');
    await col.add({ ...notice, personaId: notice.personaId ?? null });
  },
};

export interface NoticeDeps {
  store?: NoticeStore;
  now?: () => number;
  env?: Env;
  waitMs?: number;
}

/** One call's notice state, by session id (the call outlives a persona's AgentSession). */
interface CallNotice {
  userId?: string;
  personaId?: string;
  /** The last notice on this call, or the call's start when the opening was skipped. */
  since: number;
  /** A repeat is playing: no second one until it finishes. */
  speaking: boolean;
}

const MAX_CALLS = 5000;
const calls = new Map<string, CallNotice>();
const channels = new Map<string, NoticeChannel>();

function remember<V>(map: Map<string, V>, key: string, value: V): void {
  map.delete(key);
  map.set(key, value);
  const oldest = map.keys().next();
  if (map.size > MAX_CALLS && !oldest.done) map.delete(oldest.value);
}

/** The call's channel, known when its first persona agent is set up (persona-agent-factory.ts). */
export function noteNoticeChannel(sessionId: string, phone: boolean): void {
  remember(channels, sessionId, phone ? 'phone' : 'app');
}

/** Log every notice; store it for a member whose writes aren't held (MINOR_CARE). Never throws. */
function recordNotice(
  sessionId: string,
  call: CallNotice,
  kind: NoticeKind,
  deps: NoticeDeps
): void {
  const channel = channels.get(sessionId) ?? 'unknown';
  const at = new Date((deps.now ?? Date.now)());
  log.info({ sessionId, kind, channel, personaId: call.personaId }, 'AI notice spoken');
  const { userId } = call;
  if (!isMemberIdentity(userId) || writeHeld(userId, sessionId)) return;
  const record: NoticeRecord = { at, kind, channel, sessionId, personaId: call.personaId };
  (deps.store ?? firestoreNoticeStore)
    .record(userId, record)
    .catch((error: unknown) =>
      log.warn({ sessionId, kind, error: String(error) }, 'AI notice not recorded')
    );
}

/** Whether this person heard a notice in the last 24 h. Unknown (no record, slow, failed) is no. */
async function toldToday(userId: string | undefined, deps: NoticeDeps): Promise<boolean> {
  if (!isMemberIdentity(userId)) return false;
  const now = (deps.now ?? Date.now)();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), deps.waitMs ?? LOOKUP_WAIT_MS);
  });
  try {
    const last = await Promise.race([
      (deps.store ?? firestoreNoticeStore).lastNoticeAt(userId),
      timeout,
    ]);
    return last !== null && now - last.getTime() < NOTICE_DAY_MS;
  } catch (error) {
    log.warn({ error: String(error) }, 'AI notice lookup failed, saying it');
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const SALUTATION =
  /^((?:hey|hi|hello|morning|afternoon|evening|good (?:morning|afternoon|evening))\b[^,.!?]{0,30}), (\S)/i;

/**
 * The notice inside the first line, after its hello: "Hey Sam, how was the hike?" becomes
 * "Hey Sam. Just so you know, I'm an AI, not a person. How was the hike?". A line of two or
 * more sentences takes it after the first; any other line, at the end.
 */
export function weaveNotice(line: string, notice: string = OPENING_NOTICE): string {
  const text = line.trim();
  if (!text) return notice;
  const [hello, greeting, next] = SALUTATION.exec(text) ?? [];
  if (hello && greeting && next)
    return `${greeting}. ${notice} ${next.toUpperCase()}${text.slice(hello.length)}`;
  const firstEnd = /[.!?]\s+(?=\S)/.exec(text);
  if (firstEnd) {
    const cut = firstEnd.index + 1;
    return `${text.slice(0, cut)} ${notice} ${text.slice(firstEnd.index + firstEnd[0].length)}`;
  }
  return `${text} ${notice}`;
}

/**
 * Start a call's notice: looks up, in parallel with the greeting, whether this person heard
 * one today. Resolves to what the first line becomes (unchanged with the flag off).
 */
export async function openingNotice(
  sessionId: string,
  ids: { userId?: string; personaId?: string },
  deps: NoticeDeps = {}
): Promise<(line: string) => string> {
  if (!aiNoticeEnabled(deps.env)) return (line) => line;
  const told = await toldToday(ids.userId, deps);
  return (line) => {
    const call: CallNotice = { ...ids, since: (deps.now ?? Date.now)(), speaking: false };
    remember(calls, sessionId, call);
    if (told) {
      log.info({ sessionId }, 'AI notice heard in the last 24 h, not in this opening');
      return line;
    }
    recordNotice(sessionId, call, 'opening', deps);
    return weaveNotice(line);
  };
}

/**
 * The repeat, if one is due on this call: 3 h since the last notice, the flag on, a call whose
 * opening ran here, and no repeat already playing. Null otherwise.
 */
export function repeatDue(sessionId: string, deps: NoticeDeps = {}): string | null {
  if (!aiNoticeEnabled(deps.env)) return null;
  const call = calls.get(sessionId);
  if (!call || call.speaking) return null;
  return (deps.now ?? Date.now)() - call.since >= NOTICE_REPEAT_MS ? REPEAT_NOTICE : null;
}

/** A repeat started (true) or finished playing in full or not (false). Records only a full one. */
export function repeatSpeaking(
  sessionId: string,
  speaking: boolean,
  played = false,
  deps: NoticeDeps = {}
): void {
  const call = calls.get(sessionId);
  if (!call) return;
  call.speaking = speaking;
  if (speaking || !played) return;
  call.since = (deps.now ?? Date.now)();
  recordNotice(sessionId, call, 'repeat', deps);
}

/** For tests. */
export function resetAiNotices(): void {
  calls.clear();
  channels.clear();
}
