/**
 * SMS_REPLY: a verified member's text gets a reply from its routed persona, with what that
 * persona remembers (memory plan step 7). Not entered when off, after the route's screen read
 * a crisis or a call-me or keyword reply went, or for a maybe-"stop". First to decide wins:
 * 1. The text's crisis read, before any read of their data (readTypedMessageForCrisis):
 *    'replace' sends SMS_CRISIS_REPLY.
 * 2. Opt-out, pause, or a consent record that can't be read: silent.
 * 3. The messaging policy (decide, kind 'reply'): within 14 days of a crisis, the fixed warm
 *    reply (Seth, 2026-11-11); over the reply rate, silent. Quiet hours never hold a live reply.
 * 4. The model: on 'guide' the guidance ends the prompt and the sent text carries 988.
 * All of it within SMS_REPLY_BUDGET_MS, or nothing is sent and nothing kept. One SMS_REPLY
 * log line per text, counts only.
 *
 * @module services/outreach/sms-reply/sms-reply
 */
import type { TypedTurn } from '../../../agents/personas/crisis-gate-text.js';
import { flagModeOf, flagOn } from '../../../config/env-flag.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { decide, priorityOf } from '../../messaging/policy.js';
import type { LedgerEntry } from '../../messaging/types.js';
import { sharedHoldOn } from '../minor-care-shared-hold.js';
import { SMS_CRISIS_REPLY } from '../sms-crisis-screen.js';
import { defaultSmsReplyReads, type SmsReplyReads } from './sms-reply-reads.js';
import { SMS_AFTER_CRISIS_REPLY, smsReplyPrompt, smsReplyText } from './sms-reply-text.js';

const log = createLogger({ module: 'SmsReply' });

/** Twilio waits ~15 s for the webhook and the route's crisis screen may take 4 s of it. */
const SMS_REPLY_BUDGET_MS = 9_000;
/** Seth, 2026-11-11: a held minor's AI reminder comes back once this long has passed. */
const AI_REMINDER_EVERY_MS = 3 * 3_600_000;
const HOUR_MS = 3_600_000;
const PRIORITY = priorityOf('reply', 'ferni');

/** The routed text, as handleInboundSMS returns it. */
export interface RoutedText {
  routeDecision: { agentId: string };
  earlierTexts?: () => Promise<readonly TypedTurn[]>;
  /** Keeps Ferni's reply in the thread; absent when the sender is held. */
  recordReply?: (text: string) => Promise<void>;
}

export interface SmsReplyAsk {
  userId: string;
  phone: string;
  text: string;
  /** MINOR_CARE_SHARED_HOLD, as the webhook read it: the care note, no recall, nothing kept. */
  held: boolean;
  /** The route's screen read a crisis, or the text may mean "stop": not entered. */
  skip: boolean;
}

export interface SmsReplySent {
  reply: string;
  /** The text's own crisis read replaced the reply: the route records it as a crisis text. */
  crisis?: true;
}

/** `outcome`: why, for the log (a refusal or policy reason, or what was sent). */
interface Composed {
  outcome: string;
  sent?: SmsReplySent;
  recall?: number;
  reminded?: boolean;
}

// Per member, in-process: the last hour's replies (the reply rate) and a held minor's last AI
// reminder. A restart forgets both: more reminders, never fewer.
const sentReplies = new Map<string, LedgerEntry[]>();
const remindedAt = new Map<string, number>();

function ledgerOf(userId: string, now: number): LedgerEntry[] {
  const kept = (sentReplies.get(userId) ?? []).filter((e) => now - e.at.getTime() < HOUR_MS);
  sentReplies.set(userId, kept);
  return kept;
}

function remind(userId: string, now: number): boolean {
  for (const [id, at] of remindedAt) if (now - at >= AI_REMINDER_EVERY_MS) remindedAt.delete(id);
  return !remindedAt.has(userId);
}

async function compose(
  ask: SmsReplyAsk,
  route: RoutedText,
  reads: SmsReplyReads,
  now: Date,
  signal: AbortSignal
): Promise<Composed> {
  const { userId, text, held } = ask;
  const earlier = (await route.earlierTexts?.()) ?? [];
  const gate = await import('../../../agents/personas/crisis-gate-text.js');
  const read = await gate.readTypedMessageForCrisis(text, earlier);
  if (read.action === 'replace') {
    return { outcome: 'crisis-replace', sent: { reply: SMS_CRISIS_REPLY, crisis: true } };
  }
  const [refusal, lastCrisisAt] = await Promise.all([
    reads.refusal(ask.phone, now),
    reads.lastCrisisAt(userId, now),
  ]);
  if (refusal) return { outcome: refusal };
  const persona = route.routeDecision.agentId;
  const intentKey = `sms-reply:${now.getTime()}`;
  const intent = { personId: userId, recipient: 'owner', kind: 'reply', persona } as const;
  const decision = decide(
    { ...intent, priority: PRIORITY, requestedBy: 'ferni', intentKey, channel: 'sms' },
    {
      ...{ now, zone: '', consent: { sms: 'in', call: 'unknown' }, prefs: { textsOff: false } },
      ...{ crisis: { lastCrisisAt }, ledger: ledgerOf(userId, now.getTime()) },
      ...{ verifiedRecipient: true, lastInboundAt: now, isFirstContact: false },
    }
  );
  if (decision.reason === 'crisis-quiet') {
    return { outcome: 'after-crisis', sent: { reply: SMS_AFTER_CRISIS_REPLY } };
  }
  if (decision.action !== 'send') return { outcome: decision.reason };
  const [identity, recalled] = await Promise.all([
    reads.identity(persona),
    held ? { note: null, count: 0 } : reads.recall(userId, text),
  ]);
  const guidanceNote = read.action === 'guide' ? read.guidanceNote : undefined;
  const parts = { identity, minorCare: held, recall: recalled.note, earlier, message: text };
  const prompt = smsReplyPrompt({ ...parts, guidanceNote });
  const written = await reads.generate(prompt.system, prompt.contents, signal);
  const reminded = held && remind(userId, now.getTime());
  const reply = smsReplyText(written, { lifeline: guidanceNote !== undefined, reminder: reminded });
  const outcome = !reply ? 'no-words' : guidanceNote ? 'guided' : 'replied';
  return { outcome, ...(reply && { sent: { reply } }), recall: recalled.count, reminded };
}

/**
 * The reply to a member's text, or null for none. Never rejects. Writes only a reply decided
 * within the budget: the thread (unheld only) and the in-process reply state.
 */
export async function smsMemberReply(
  route: RoutedText,
  ask: SmsReplyAsk,
  reads: SmsReplyReads = defaultSmsReplyReads,
  budgetMs = SMS_REPLY_BUDGET_MS
): Promise<SmsReplySent | null> {
  if (!flagOn('SMS_REPLY') || ask.skip) return null;
  const started = Date.now();
  const timer = new AbortController();
  const late = setTimeout(() => timer.abort(), budgetMs);
  const expired = new Promise<Composed>((resolve) => {
    timer.signal.addEventListener('abort', () => resolve({ outcome: 'timeout' }));
  });
  const ready = flagModeOf('SMS_CRISIS_SCREEN') === 'on' && sharedHoldOn();
  const work = async (): Promise<Composed> =>
    compose(ask, route, reads, new Date(started), timer.signal).catch(() => ({ outcome: 'error' }));
  const done: Composed = ready
    ? await Promise.race([work(), expired])
    : { outcome: 'needs-screen' };
  clearTimeout(late);
  const { sent } = done;
  if (sent) {
    const at = new Date(started);
    const entry = { kind: 'reply', channel: 'sms', status: 'sent', priority: PRIORITY } as const;
    ledgerOf(ask.userId, started).push({ ...entry, at, intentKey: `${started}` });
    if (done.reminded) remindedAt.set(ask.userId, started);
    await route.recordReply?.(sent.reply).catch(() => undefined);
  }
  const chars = sent?.reply.length ?? 0;
  const counts = { outcome: done.outcome, recall: done.recall ?? 0, chars };
  log.info({ event: 'SMS_REPLY', ...counts, ms: Date.now() - started }, 'SMS reply');
  return sent ?? null;
}
