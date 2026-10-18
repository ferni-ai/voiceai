/**
 * The shapes of Ferni's one messaging pipeline (DESIGN 2026-10-18): what a
 * sender asks for (Intent), what the policy knows about the person (PolicyCtx)
 * and what it decides (Decision). MESSAGE_KINDS is the one list of kinds from
 * now on: today 'reminder' means two things and 'follow-up' and 'follow_up'
 * both exist.
 *
 * @module services/messaging/types
 */

export const MESSAGE_KINDS = [
  ...['reminder', 'morning-brief', 'check-in', 'post-call-check-in', 'follow-up', 'proactive'],
  ...['on-behalf', 'commitment-nudge', 'reply', 'digest', 'transactional'],
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export type Channel = 'sms' | 'push' | 'in_app' | 'call';
export type Consent = 'in' | 'out' | 'unknown';
export type RequestedBy = 'user' | 'ferni';

/**
 * Why the policy decided what it did. Kebab-case like the outreach_events
 * reason codes (#1875, bq-fields.ts), and the same code where the meaning is
 * the same: 'no-verified-phone', 'sms-off', 'opted-out', 'quiet-hours',
 * 'recently-sent'.
 */
export const REASON_CODES = [
  ...['ok', 'requested-time', 'no-verified-phone', 'needs-consent', 'no-anchor', 'bad-channel'],
  ...['opted-out', 'sms-off', 'crisis-quiet', 'quiet-hours', 'outside-window', 'no-timezone'],
  ...['over-budget', 'duplicate', 'recently-sent'],
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export interface Intent {
  /** The recipient: the owner's uid, or the contact's key for a third party. */
  readonly personId: string;
  readonly recipient: 'owner' | 'third-party';
  readonly kind: MessageKind;
  /** The persona who signs it; a voice over the shared thread and cap. */
  readonly persona: string;
  /** Higher goes first when the day's budget is short (priorityOf). */
  readonly priority: number;
  /** What it is grounded in (a commitment, reminder, event or request). No anchor, no proactive send. */
  readonly anchor?: string;
  readonly requestedBy: RequestedBy;
  /** The time the user chose for it ("remind me at 6:30"); such a send goes in quiet hours. */
  readonly requestedAt?: Date;
  /** One per thing to say; the same key twice is a duplicate. */
  readonly intentKey: string;
  readonly channel: Channel;
  readonly text?: string;
  /** The keyed hash the ledger stores for this body (the sender hashes; the policy compares). */
  readonly bodyHash?: string;
  /** Set when re-deciding a message this policy held, so its own hold isn't a duplicate. */
  readonly redecide?: boolean;
}

export interface LedgerEntry {
  readonly kind: MessageKind;
  readonly channel: Channel;
  readonly status: 'sent' | 'held' | 'skipped' | 'failed';
  readonly at: Date;
  readonly intentKey: string;
  readonly priority: number;
  readonly bodyHash?: string;
  /** Who asked for it; a user-requested text doesn't use the day's budget. Ferni when unset. */
  readonly requestedBy?: RequestedBy;
}

/** A local-time window, minutes after midnight; end before start wraps midnight. */
export interface LocalWindow {
  readonly startMin: number;
  readonly endMin: number;
}

export interface PolicyCtx {
  readonly now: Date;
  /** The recipient's IANA zone. */
  readonly zone: string;
  readonly consent: { readonly sms: Consent; readonly call: Consent };
  readonly prefs: {
    readonly textsOff: boolean;
    /** Lowers the daily SMS budget ("fewer texts"); never raises it. */
    readonly maxPerDay?: number;
    /** When Ferni-initiated messages are welcome ("only mornings"); narrows, never widens. */
    readonly windows?: readonly LocalWindow[];
  };
  readonly crisis: { readonly lastCrisisAt?: Date };
  /** The person's last 7 days. */
  readonly ledger: readonly LedgerEntry[];
  /** The owner's number is verified as theirs (never one the model passed). */
  readonly verifiedRecipient: boolean;
  readonly isFirstContact: boolean;
}

export interface Decision {
  readonly action: 'send' | 'hold' | 'merge' | 'drop';
  readonly reason: ReasonCode;
  /** Re-decide then; unset on a hold means "until something changes" (consent, a zone). */
  readonly holdUntil?: Date;
  /** The digest it joins ("digest:2026-10-18", the recipient's local date). */
  readonly mergeInto?: string;
  /** A third party's first text from Ferni opens with who is writing and for whom. */
  readonly introRequired?: boolean;
}
