/**
 * CALL_KNOWS_RECENT_TEXTS=on: a call knows the texts Ferni sent this member
 * in the last six hours (recent-texts.ts), in the call-start awareness and in
 * the greeting's facts, so "I texted you earlier" is something he can say.
 *
 * One read per agent setup, bounded at READ_TIMEOUT_MS: on a slow store or an
 * error it logs and the call goes on without the facts. The greeting reads
 * what setup found and never the store itself. Off, nothing is read.
 *
 * @module agents/multi-agent/recent-texts-awareness
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import type { TextKind } from '../../services/outreach/checkin-replies.js';
import type { RecentText, RecentTextsStore } from '../../services/outreach/recent-texts.js';
import { callerTimeZoneFor } from '../../utils/caller-time-zone.js';
import { isValidTimeZone } from '../../utils/time-zone.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'recent-texts-awareness' });

export const RECENT_TEXTS_WINDOW_MS = 6 * 60 * 60 * 1000;
export const READ_TIMEOUT_MS = 300;
const KEEP_MS = 10 * 60 * 1000;

const KIND_LABEL: Record<TextKind, string> = {
  checkin: 'a check-in after your last call',
  'follow-up': 'a follow-up',
  reminder: 'a reminder',
  message: 'something they asked you to text them',
  'morning-brief': 'their morning brief',
  'on-behalf': 'a text',
  'call-result': 'how a call you made for them went',
  'opt-in': 'a note confirming they turned texts on',
  proactive: 'a note checking in on them',
  'coach-media': 'something to read, watch or listen to',
};

export interface RecentTextsDeps {
  env?: Env;
  store?: RecentTextsStore;
  now?: () => Date;
  timeoutMs?: number;
}

function localDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}

function localHour(at: Date, timeZone: string): number {
  const h = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone });
  return Number(h.format(at)) % 24;
}

/** "about 2 hours ago", with "this morning" or "last night" in their zone when it differs from now. */
export function sentWhen(sentAt: Date, now: Date, timeZone?: string): string {
  const minutes = Math.max(0, Math.round((now.getTime() - sentAt.getTime()) / 60_000));
  const hours = Math.round(minutes / 60);
  const ago =
    minutes < 2
      ? 'a minute ago'
      : minutes < 50
        ? `about ${minutes < 10 ? minutes : Math.round(minutes / 5) * 5} minutes ago`
        : hours <= 1
          ? 'about an hour ago'
          : `about ${hours} hours ago`;
  if (!isValidTimeZone(timeZone)) return ago;
  if (localDay(sentAt, timeZone) !== localDay(now, timeZone)) return `${ago}, last night`;
  const part = (h: number): string => (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening');
  const then = part(localHour(sentAt, timeZone));
  return then === part(localHour(now, timeZone)) ? ago : `${ago}, this ${then}`;
}

/** One awareness fact for one text. */
export function recentTextFact(text: RecentText, now: Date, timeZone?: string): string {
  const when = sentWhen(new Date(text.sentAt), now, timeZone);
  const reply = text.replied
    ? 'They replied. If it fits, you can bring it up'
    : "They haven't replied. If it fits, ask whether they saw it";
  return `You texted them ${when} (${KIND_LABEL[text.kind]}: "${text.snippet}"). ${reply}; don't read it back.`;
}

// The reader is loaded only with the flag on (its import chain is heavy), and
// early, so the first call's 300 ms goes on the read rather than the import.
type Reader = typeof import('../../services/outreach/recent-texts.js');
let reader: Promise<Reader> | undefined;
async function loadReader(): Promise<Reader> {
  reader ??= import('../../services/outreach/recent-texts.js').catch((error: unknown) => {
    reader = undefined; // the next call tries again
    throw error;
  });
  return reader;
}
if (flagOn('CALL_KNOWS_RECENT_TEXTS')) {
  loadReader().catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Recent-texts reader not preloaded');
  });
}

/**
 * Whether the account owner is proven to be on the line. The answer lives a
 * layer up (caller-recognition.ts ownerProvenOnLine), registered by
 * voice-agent-entry/recent-texts-owner-register.ts. Until it is, no one is.
 */
type OwnerCheck = (sessionId: string, phoneCall: boolean) => boolean;
let ownerOnLine: OwnerCheck = () => false;

export function registerRecentTextsOwnerCheck(check: OwnerCheck): void {
  ownerOnLine = check;
}

/** What each session's setup found, for its greeting. */
const found = new Map<string, { facts: string[]; at: number }>();

async function readInTime(
  userId: string,
  sessionId: string,
  deps: RecentTextsDeps
): Promise<{ texts: RecentText[]; now: Date }> {
  const now = (deps.now ?? (() => new Date()))();
  const timeoutMs = deps.timeoutMs ?? READ_TIMEOUT_MS;
  const read = loadReader()
    .then(async ({ recentTextsFor }) =>
      recentTextsFor(userId, now.getTime() - RECENT_TEXTS_WINDOW_MS, deps.store, deps.env)
    )
    .catch((error: unknown) => {
      log.warn({ sessionId, error: String(error) }, 'Recent texts not read; call goes on without');
      return [];
    });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'late'>((resolve) => {
    timer = setTimeout(() => resolve('late'), timeoutMs);
  });
  const texts = await Promise.race([read, late]);
  clearTimeout(timer);
  if (texts === 'late') {
    log.warn({ sessionId, timeoutMs }, 'Recent texts too slow; call goes on without');
    return { texts: [], now };
  }
  return { texts, now };
}

/**
 * The model-instructions block naming the texts sent lately, or '' (flag off,
 * no user, the owner not proven to be on the line, a call to someone else on
 * a member's behalf, none sent, or too slow). Nothing is read, and nothing is
 * kept for the greeting, unless the owner is proven (ownerOnLine).
 */
export async function recentTextsBlock(
  sessionId: string,
  userId: string | undefined,
  timeZone: string | undefined,
  phoneCall: boolean,
  deps: RecentTextsDeps = {}
): Promise<string> {
  if (!flagOn('CALL_KNOWS_RECENT_TEXTS', deps.env ?? process.env)) return '';
  if (!userId || userId === 'anonymous') return '';
  if (!ownerOnLine(sessionId, phoneCall)) return '';
  // Imported here so the greeting's import of this module stays light.
  const { outboundPartiesFor } = await import('../shared/outbound-opener.js');
  if (outboundPartiesFor(sessionId)) return ''; // a third party is on the line
  const { texts, now } = await readInTime(userId, sessionId, deps);
  const zone = timeZone ?? callerTimeZoneFor(sessionId);
  const facts = texts.map((t) => recentTextFact(t, now, zone));
  for (const [id, entry] of found) if (now.getTime() - entry.at > KEEP_MS) found.delete(id);
  found.set(sessionId, { facts, at: now.getTime() });
  if (facts.length === 0) return '';
  log.info({ sessionId, texts: facts.length }, 'Call knows the texts sent lately');
  return `\n---\n\n## Texts you sent them before this call\n\n${facts.join('\n')}\n`;
}

/** The greeting's facts from what setup found for this session (once). */
export function takeRecentTextFacts(sessionId: string): Record<string, string> {
  const entry = found.get(sessionId);
  found.delete(sessionId);
  const facts: Record<string, string> = {};
  entry?.facts.forEach((fact, i) => {
    const key = i === 0 ? 'a text you sent them before this call' : `an earlier text (${i + 1})`;
    facts[key] = fact;
  });
  return facts;
}
