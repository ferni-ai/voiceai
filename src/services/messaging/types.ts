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

/** Why it decided so: outreach_events' codes (#1875) where the meaning is the same. */
export const REASON_CODES = [
  ...['ok', 'requested-time', 'no-verified-phone', 'needs-consent', 'no-anchor', 'bad-channel'],
  ...['opted-out', 'sms-off', 'crisis-quiet', 'quiet-hours', 'outside-window', 'no-timezone'],
  ...['over-budget', 'duplicate', 'recently-sent', 'transactional-rate'],
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export interface Intent {
  /** The recipient: the owner's uid, or the contact's key for a third party. */
  readonly personId: string;
  readonly recipient: 'owner' | 'third-party';
  readonly kind: MessageKind;
  readonly persona: string;
  readonly priority: number; // priorityOf
  /** What it is grounded in (a commitment, reminder, event or request). No anchor, no proactive send. */
  readonly anchor?: string;
  readonly requestedBy: RequestedBy;
  /** The time the user chose for it ("remind me at 6:30"); such a send goes in quiet hours. */
  readonly requestedAt?: Date;
  readonly intentKey: string;
  readonly channel: Channel;
  readonly text?: string;
  /** The keyed hash the ledger stores for this body (the sender hashes; the policy compares). */
  readonly bodyHash?: string;
  /** A code to the number the user is verifying in this same request (not yet verified). */
  readonly verifyingNumber?: boolean;
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

export interface LocalWindow {
  readonly startMin: number; // minutes after local midnight; end before start wraps
  readonly endMin: number;
}

export interface PolicyCtx {
  readonly now: Date;
  readonly zone: string; // the recipient's
  readonly consent: { readonly sms: Consent; readonly call: Consent };
  readonly prefs: {
    readonly textsOff: boolean;
    /** Lowers the daily SMS budget ("fewer texts"); never raises it. */
    readonly maxPerDay?: number;
    /** When Ferni-initiated messages are welcome ("only mornings"); narrows, never widens. */
    readonly windows?: readonly LocalWindow[];
  };
  readonly crisis: { readonly lastCrisisAt?: Date };
  readonly ledger: readonly LedgerEntry[]; // the person's last 7 days
  /** The owner's verified number (never one the model passed). */
  readonly verifiedRecipient: boolean;
  readonly lastInboundAt?: Date; // their last text to us
  readonly isFirstContact: boolean;
}

export interface Decision {
  readonly action: 'send' | 'hold' | 'merge' | 'drop';
  readonly reason: ReasonCode;
  /** Re-decide then; unset on a hold means "until something changes" (consent, a zone). */
  readonly holdUntil?: Date;
  readonly mergeInto?: string; // the digest it joins: "digest:2026-10-18", their local date
  /** A third party's first text from Ferni opens with who is writing and for whom. */
  readonly introRequired?: boolean;
}
