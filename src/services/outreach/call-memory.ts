/**
 * Ferni remembers people it called for you.
 *
 * A friend who called your mom for you remembers how it went: "last time I
 * called your mom she was off to church". After an on-behalf call the owner
 * asked for, this keeps a few lines in the owner's memory under the name they
 * used for the person (or the business), each said as theirs:
 * - a one-line summary of the call, with its date;
 * - up to 3 short things they said ("Mom said: she goes to church Sunday mornings");
 * - what they asked to pass on, if anything.
 *
 * They go where the live pipeline keeps what Ferni knows about the people in
 * the owner's life, bogle_users/{owner}/dynamic_facts (entityName = the name),
 * so the per-turn recall already brings them up when the owner names that
 * person (memory-recall-hook.ts, session-recall.ts), "forget what my mom said"
 * marks them like any fact (memory/recall/forget.ts), and a light
 * dynamic_entities row says who they are (a person or a business). Each one
 * carries `expireAt` (180 days): recall leaves it out after that, and a
 * Firestore TTL policy on the field deletes it.
 *
 * Kept only when every one of these holds; otherwise nothing is written:
 * - the dispatch was signed by our server (completeOnBehalfCall's `trusted`);
 * - it says the verified owner asked for the call (ownerMemory, signed; set
 *   only with CONTACT_CALL_MEMORY on in the owner's call). Inbound calls and
 *   family check-ins never carry it;
 * - a person picked up and talked, and the call was read (an analysis);
 * - Ferni has a name for them: a number with no name keeps nothing, since
 *   nothing stored under a date could be recalled or forgotten by name;
 * - nobody on the line sounds under 18.
 * Every line goes through screenedCallerText; anything isRiskyCallerText or
 * isSensitiveCallText flags is dropped, never rewritten (call-memory-filter.ts).
 * A thing they "said" must share a word with what they actually said, so the
 * analysis can't put words in their mouth. The number is never stored.
 *
 * @module services/outreach/call-memory
 */

import { createHash } from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { isRiskyCallerText, screenedCallerText } from './caller-text.js';
import { isSensitiveCallText, soundsUnder18 } from './call-memory-filter.js';
import type { OnBehalfDispatch } from './on-behalf-dispatch.js';
import type { SuperhumanCallResult } from './call-transcript-intelligence.js';
import type { CallOutcome } from '../../tools/domains/telephony/types.js';

const log = createLogger({ module: 'call-memory' });

/** How long a remembered call is kept. */
export const CALL_MEMORY_TTL_MS = 180 * 24 * 60 * 60 * 1000;
/** What marks these rows in dynamic_facts (and lets a reader find them). */
export const CALL_MEMORY_SOURCE = 'on_behalf_call';
const MAX_SAID = 3;
const MAX_LINE = 200;
const CONFIDENCE = 0.8;

export type CallMemoryKind = 'person' | 'business';

export interface CallMemoryInput {
  call: OnBehalfDispatch;
  outcome: CallOutcome;
  analysis: SuperhumanCallResult | null;
  /** What the person on the line said, turn by turn. */
  heard: readonly string[];
  /** A person picked up and talked (not voicemail, not a quick hang-up). */
  answered: boolean;
  now?: Date;
}

export interface CallMemoryEntry {
  userId: string;
  name: string;
  kind: CallMemoryKind;
  lines: Array<{ key: string; value: string }>;
}

const NO_NAME =
  /^(?:them|him|her|someone|somebody|this number|that number|the number|a number|friend|unknown)$/i;
const BUSINESS =
  /\b(?:office|clinic|restaurant|cafe|shop|store|salon|company|pharmacy|dentist|doctor|vet|garage|bank|hotel|bakery|practice|services?|inc|llc)\b/i;

/**
 * The name to keep them under: the one the owner used ("my plumber" ->
 * "plumber") or the saved contact's. Null for a number or no real name.
 */
export function callMemoryName(raw: string | undefined): string | null {
  const name = (raw ?? '')
    .replace(/[^\p{L}\p{N}'’ .&-]/gu, ' ')
    .replace(/^\s*(?:my|our|the)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  if (name.length < 2 || /\d/.test(name) || NO_NAME.test(name)) return null;
  return name;
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
/** "She goes..." reads on after "Mom said:"; a name or a day keeps its capital. */
const lowerFirst = (s: string): string =>
  /^(?:She|He|They|The|Her|His|Their|It|We)\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;

/** Words of 4+ letters, plural "s" dropped: enough to tell a thing they said from one made up. */
function words(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z]{4,}/g) ?? []).map((w) =>
      /[^s]s$/.test(w) ? w.slice(0, -1) : w
    )
  );
}

/** A line fit to keep, screened, or undefined (risky or sensitive: dropped, never rewritten). */
function keep(text: string | undefined, name: string): string | undefined {
  if (!text?.trim() || isRiskyCallerText(text)) return undefined;
  const clean = screenedCallerText(text, name, MAX_LINE);
  if (!clean || isRiskyCallerText(clean) || isSensitiveCallText(clean)) return undefined;
  return clean;
}

function callDate(now: Date, timeZone: string): string {
  const fmt = (zone: string): string =>
    new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'long', day: 'numeric' }).format(now);
  try {
    return fmt(timeZone || 'UTC');
  } catch {
    return fmt('UTC');
  }
}

/** Whether anything at all may be kept from this call (see the module comment). */
function mayKeep(input: CallMemoryInput): input is CallMemoryInput & {
  analysis: SuperhumanCallResult;
} {
  const { call, outcome, analysis, heard } = input;
  return (
    call.ownerMemory === true &&
    input.answered &&
    outcome.status === 'completed' &&
    analysis !== null &&
    heard.length > 0 &&
    !soundsUnder18(heard)
  );
}

/** Up to MAX_SAID things they said: each sharing a word (not their name) with their own words. */
function theirPoints(
  input: CallMemoryInput,
  name: string,
  points: readonly string[] | undefined
): string[] {
  const theirs = words(input.heard.join(' '));
  for (const w of words(name)) theirs.delete(w);
  const purpose = input.call.purpose.trim().toLowerCase();
  const kept: string[] = [];
  for (const point of points ?? []) {
    // The fallback analysis's only point is the call's purpose: not something they said.
    if (kept.length >= MAX_SAID || !point || point.trim().toLowerCase() === purpose) continue;
    const clean = keep(point, capital(name));
    if (clean && [...words(clean)].some((w) => theirs.has(w))) kept.push(clean);
  }
  return kept;
}

/** What to keep from this call, or null when nothing may be kept (see the module comment). */
export function callMemoryEntry(input: CallMemoryInput): CallMemoryEntry | null {
  if (!mayKeep(input)) return null;
  const { call, analysis } = input;
  const name = callMemoryName(call.contact.name);
  if (!name) return null;
  const Name = capital(name);
  const business =
    call.callType === 'business' || BUSINESS.test(`${name} ${call.contact.relationship ?? ''}`);
  const date = callDate(input.now ?? new Date(), call.requester.timezone);
  const summary = keep(analysis.insights.summary, Name);
  const lines: CallMemoryEntry['lines'] = [
    ...(summary
      ? [{ key: 'call summary', value: `I called ${Name} for them on ${date}: ${summary}` }]
      : []),
    ...theirPoints(input, name, analysis.insights.keyPoints).map((p) => ({
      key: 'said on a call',
      value: `${Name} said: ${lowerFirst(p)}`,
    })),
    // The analysis's messagesForUser: what they wanted passed on (the same source
    // buildCallOutcome reports as "<name> said: ..."), held to the same grounding.
    ...theirPoints(input, name, analysis.insights.messagesForUser).map((m) => ({
      key: 'asked to pass on',
      value: `${Name} asked to pass on: "${m}"`,
    })),
  ];
  const kind: CallMemoryKind = business ? 'business' : 'person';
  return lines.length > 0 ? { userId: call.requester.userId, name, kind, lines } : null;
}

export interface CallMemoryDoc {
  id: string;
  data: Record<string, unknown>;
}

/** The writes for an entry: its dynamic_facts rows and its dynamic_entities row. */
export function callMemoryDocs(
  entry: CallMemoryEntry,
  call: Pick<OnBehalfDispatch, 'callId' | 'requester'>,
  now: Date = new Date()
): { facts: CallMemoryDoc[]; entity: CallMemoryDoc } {
  const hash = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 24);
  const base = {
    entityName: entry.name,
    source: CALL_MEMORY_SOURCE,
    factType: 'call_memory',
    callId: call.callId,
    confidence: CONFIDENCE,
    extractedAt: now.toISOString(),
    timeZone: call.requester.timezone,
    expireAt: new Date(now.getTime() + CALL_MEMORY_TTL_MS),
  };
  return {
    facts: entry.lines.map((line, i) => ({
      id: `cm_${hash(`${call.callId}|${line.key}|${i}`)}`,
      data: { ...base, key: line.key, value: line.value },
    })),
    entity: {
      id: `cm_${hash(entry.name.toLowerCase())}`,
      data: {
        name: entry.name,
        type: entry.kind === 'business' ? 'organization' : 'person',
        source: CALL_MEMORY_SOURCE,
        lastCalledAt: now.toISOString(),
        expireAt: base.expireAt,
      },
    },
  };
}

/** Where the rows go; injected so tests need no database. */
export interface CallMemoryStore {
  write: (userId: string, facts: CallMemoryDoc[], entity: CallMemoryDoc) => Promise<void>;
}

/**
 * bogle_users/{owner}/dynamic_facts and dynamic_entities. No syncedToSpanner
 * field, so the graph sync never copies a row that must expire.
 */
export const firestoreCallMemoryStore: CallMemoryStore = {
  async write(userId, facts, entity) {
    const db = getFirestoreDb();
    if (!db) return;
    const user = db.collection('bogle_users').doc(userId);
    const batch = db.batch();
    for (const f of facts) batch.set(user.collection('dynamic_facts').doc(f.id), f.data);
    batch.set(user.collection('dynamic_entities').doc(entity.id), entity.data, { merge: true });
    await batch.commit();
  },
};

/** Keep what may be kept from a finished call. Never throws; returns the lines written. */
export async function rememberCall(
  input: CallMemoryInput,
  store: CallMemoryStore = firestoreCallMemoryStore
): Promise<number> {
  const entry = callMemoryEntry(input);
  if (!entry) return 0;
  const { facts, entity } = callMemoryDocs(entry, input.call, input.now);
  try {
    await store.write(entry.userId, facts, entity);
    log.info({ callId: input.call.callId, lines: facts.length }, 'Call remembered for the owner');
    return facts.length;
  } catch (error) {
    log.warn({ callId: input.call.callId, error: String(error) }, 'Could not remember the call');
    return 0;
  }
}
