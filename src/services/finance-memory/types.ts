/**
 * Money memory: what the user has told Ferni about their finances. Stored only
 * when the user has switched the Money category on (services/memory-consent).
 *
 *   bogle_users/{uid}/finance_memory/{financeId}
 *   bogle_users/{uid}/memory_tombstones/{financeId}   (kind: 'finance')
 *
 * Savings goals live in aspirations (category 'financial'); a finance item only
 * keeps the money side and links to the goal (`aspirationId`). Bills with a due
 * day are reminded through important dates (`dateId`).
 *
 * Never stored: account, card or routing numbers, SSNs, passwords, PINs,
 * security answers (utils/financial-redaction runs before every write).
 *
 * @module services/finance-memory/types
 */

export const USERS_COLLECTION = 'bogle_users';
export const FINANCE_COLLECTION = 'finance_memory';
export const TOMBSTONE_COLLECTION = 'memory_tombstones';

export const FINANCE_KINDS = [
  'income',
  'budget',
  'savings',
  'debt',
  'purchase',
  'bill',
  'worry',
  'win',
  'feeling',
  'decision',
] as const;
export type FinanceKind = (typeof FINANCE_KINDS)[number];

/** active = ongoing / in progress; planned = not yet (a purchase); done = paid off, bought, decided. */
export const FINANCE_STATUSES = ['active', 'planned', 'done'] as const;
export type FinanceStatus = (typeof FINANCE_STATUSES)[number];

/** user = typed on the page; explicit = the user's own words; inferred = summary or extracted fact. */
export type FinanceSource = 'user' | 'explicit' | 'inferred';
export type FinanceTombstoneReason =
  | 'user_deleted'
  | 'voice_forget'
  | 'conversation_deleted'
  | 'fact_deleted';

export type Currency = 'USD' | 'GBP' | 'EUR';
export type AmountPeriod = 'week' | 'biweekly' | 'month' | 'year';

/** An amount exactly as the user said it. Never inferred. */
export interface FinanceAmount {
  readonly value: number;
  readonly currency: Currency;
  readonly period?: AmountPeriod;
  /** The words they used ("$2k a month"), for the page. */
  readonly said: string;
}

export interface FinanceItem {
  readonly id: string;
  readonly kind: FinanceKind;
  /** Normalised subject: "credit card", "house", "rent", "money". */
  readonly subject: string;
  /** Human-readable, amount-free: "Paying off credit card debt". */
  readonly text: string;
  readonly status: FinanceStatus;
  readonly amount?: FinanceAmount;
  /** Bills: day of the month it's due (1-31). */
  readonly dueDay?: number;
  /** Linked aspirations goal (savings goals). */
  readonly aspirationId?: string;
  /** True when money memory created that goal (so "delete my money memories" removes it too). */
  readonly aspirationCreated?: boolean;
  /** Important-date id of the next due date (bills). */
  readonly dateId?: string;
  readonly confidence: number;
  readonly source: FinanceSource;
  readonly sourceConversationIds: readonly string[];
  readonly sourceFactIds: readonly string[];
  /** Number of conversations it came up in. */
  readonly mentions: number;
  readonly userEdited: boolean;
  readonly firstMentionedAt: string;
  readonly lastMentionedAt: string;
  readonly updatedAt: string;
  readonly editedAt?: string;
}

export interface FinanceInput {
  readonly kind: FinanceKind;
  readonly subject: string;
  readonly text: string;
  readonly status?: FinanceStatus;
  /** Only from the user's own words (source 'explicit' or 'user'). */
  readonly amount?: FinanceAmount;
  readonly dueDay?: number;
  readonly confidence: number;
  readonly source: FinanceSource;
  readonly conversationId?: string;
  readonly factId?: string;
  readonly at?: Date;
}

export type FinanceUpsertOutcome =
  | 'created'
  | 'updated'
  | 'provenance_only'
  | 'tombstoned'
  | 'not_consented'
  | 'invalid'
  | 'failed';

export interface FinanceEdit {
  readonly text?: string;
  readonly status?: FinanceStatus;
  /** null clears the amount. */
  readonly amount?: { value: number; period?: AmountPeriod; currency?: Currency } | null;
  /** null clears the due day. */
  readonly dueDay?: number | null;
}
