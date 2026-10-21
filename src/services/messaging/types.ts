/** What a sender asks (Intent), what the policy knows (PolicyCtx) and decides (Decision).
 * MESSAGE_KINDS is the one list of kinds. @module services/messaging/types */

/** Ferni-initiated texts per person per rolling window, every kind and persona (DESIGN decision 2). */
export const DAILY_TEXT_CAP = 3;
export const DAILY_TEXT_WINDOW_MS = 24 * 60 * 60 * 1000;

export const MESSAGE_KINDS = [
  ...['reminder', 'morning-brief', 'check-in', 'post-call-check-in', 'follow-up', 'proactive'],
  ...['on-behalf', 'commitment-nudge', 'reply', 'digest', 'transactional'],
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export type Channel = 'sms' | 'push' | 'in_app' | 'call';
export type Consent = 'in' | 'out' | 'unknown';
export type RequestedBy = 'user' | 'ferni';

/** Why it decided so: outreach_events' codes (PR 1875) where the meaning is the same. */
export const REASON_CODES = [
  ...['ok', 'requested-time', 'no-verified-phone', 'needs-consent', 'no-anchor', 'bad-channel'],
  ...['opted-out', 'sms-off', 'crisis-quiet', 'quiet-hours', 'outside-window', 'no-timezone'],
  ...['over-budget', 'duplicate', 'recently-sent', 'transactional-rate', 'reply-rate'],
  ...['requested-rate', 'too-many-destinations'],
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

/**
 * Provenance contract: the policy is pure and can't check where an intent came from. The
 * sender (M2) sets kind, requestedBy, requestedAt and verifyingNumber only from server-side
 * records (the reminder doc, the OTP request, the inbound text), never from model output.
 */
export interface Intent {
  readonly personId: string; // the owner's uid, or a third party's contact key
  readonly recipient: 'owner' | 'third-party';
  readonly kind: MessageKind;
  readonly persona: string;
  readonly priority: number; // priorityOf
  readonly anchor?: string; // what it's grounded in; no anchor, no proactive send
  readonly requestedBy: RequestedBy;
  readonly requestedAt?: Date; // the time the user chose ("remind me at 6:30")
  readonly intentKey: string;
  readonly channel: Channel;
  readonly text?: string;
  readonly bodyHash?: string; // keyed by the sender; the policy only compares
  readonly verifyingNumber?: boolean; // a code to the number this request is verifying
  readonly destination?: string; // the phone hash it goes to: code limits count per destination
  readonly redecide?: boolean; // re-deciding its own hold: not a duplicate or a rival
}

export interface LedgerEntry {
  readonly kind: MessageKind;
  readonly channel: Channel;
  readonly status: 'sent' | 'held' | 'skipped' | 'failed';
  readonly at: Date;
  readonly intentKey: string;
  readonly priority: number;
  readonly bodyHash?: string;
  readonly requestedBy?: RequestedBy; // Ferni when unset
  readonly destination?: string; // the phone hash it went to
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
    readonly maxPerDay?: number; // "fewer texts": lowers the SMS budget, never raises it
    readonly windows?: readonly LocalWindow[]; // "only mornings": narrows, never widens
    readonly quietStart?: string; // the owner's messagingPrefs (PR 2001), "HH:MM"
    readonly quietEnd?: string;
  };
  readonly crisis: { readonly lastCrisisAt?: Date };
  readonly ledger: readonly LedgerEntry[]; // the person's last 7 days
  readonly verifiedRecipient: boolean; // the owner's verified number, never one the model passed
  readonly lastInboundAt?: Date; // their last text to us
  readonly isFirstContact: boolean;
}

export interface Decision {
  readonly action: 'send' | 'hold' | 'merge' | 'drop';
  readonly reason: ReasonCode;
  readonly holdUntil?: Date; // re-decide then; unset: when something changes (consent, a zone)
  readonly mergeInto?: string; // the digest it joins: "digest:2026-10-18", their local date
  readonly recordAs?: MessageKind; // the kind the ledger records when it isn't the intent's
  readonly introRequired?: boolean; // a third party's first text says who is writing
}
