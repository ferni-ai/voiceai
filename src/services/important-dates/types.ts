/**
 * Important dates: canonical types.
 *
 * Stored at `bogle_users/{uid}/important_dates/{id}` where `id` is derived
 * from `key` (see identity.ts). Reminder settings live at
 * `bogle_users/{uid}/reminder_settings/default`; per-reminder delivery records
 * at `bogle_users/{uid}/important_date_deliveries/{reminderKey}`.
 *
 * @module services/important-dates/types
 */

export type ImportantDateKind = 'birthday' | 'anniversary' | 'event' | 'deadline' | 'other';
export type ImportantDateSource = 'detected' | 'user';

/** Channels a date reminder can go out on, in order of preference. */
export type ReminderChannel = 'conversation' | 'push' | 'sms' | 'email';

export const IMPORTANT_DATE_KINDS: readonly ImportantDateKind[] = [
  'birthday',
  'anniversary',
  'event',
  'deadline',
  'other',
];

export const REMINDER_CHANNELS: readonly ReminderChannel[] = [
  'conversation',
  'push',
  'sms',
  'email',
];

/** Days-before offsets used when the user hasn't customised a date. */
export const DEFAULT_REMINDER_OFFSETS: Readonly<Record<ImportantDateKind, readonly number[]>> = {
  birthday: [7, 1, 0],
  anniversary: [7, 1, 0],
  deadline: [1],
  event: [1],
  other: [0],
};

/** Longest lead time a reminder may have (one year). */
export const MAX_REMINDER_OFFSET_DAYS = 365;

/**
 * Input to upsertImportantDate (the contract other agents code against).
 * `date` is `YYYY-MM-DD` (a specific day, or the original day of a recurring
 * date when the year is known) or `--MM-DD` (recurring, year unknown).
 */
export interface ImportantDateInput {
  key: string;
  title: string;
  date: string;
  recurring: boolean;
  personId?: string;
  kind: ImportantDateKind;
  source: ImportantDateSource;
  sourceConversationIds: string[];
  confidence: number;
  /** Optional finer label kept for callers that had one (e.g. 'memorial', 'career'). */
  subtype?: string;
  /** Persona that captured the date; reminders speak in that persona's voice. */
  personaId?: string;
}

export interface DateReminderRule {
  enabled: boolean;
  /** Days before the date to remind (0 = on the day). */
  offsets: number[];
  /** True once the user chose these offsets (detected updates never reset them). */
  custom: boolean;
}

export interface ImportantDateRecord {
  id: string;
  key: string;
  title: string;
  date: string;
  recurring: boolean;
  personId?: string;
  kind: ImportantDateKind;
  subtype?: string;
  source: ImportantDateSource;
  sourceConversationIds: string[];
  confidence: number;
  personaId?: string;
  reminders: DateReminderRule;
  /** Per-date channel override; absent means "use my reminder settings". */
  channels?: ReminderChannel[];
  /** ISO instant the next reminder is due (null when none is left). */
  nextReminderAt: string | null;
  nextReminderKey: string | null;
  /** Reminder keys already handled (delivered or superseded), newest last. */
  sentReminderKeys: string[];
  createdAt: string;
  updatedAt: string;
  userEditedAt?: string;
}

/** Fields the user can change from the web page or by voice. */
export interface ImportantDatePatch {
  title?: string;
  date?: string;
  recurring?: boolean;
  kind?: ImportantDateKind;
  remindersEnabled?: boolean;
  reminderOffsets?: number[];
  /** null clears a per-date override. */
  channels?: ReminderChannel[] | null;
}

export interface QuietHours {
  /** 'HH:MM' local time quiet hours begin. */
  start: string;
  /** 'HH:MM' local time quiet hours end. */
  end: string;
}

export interface ReminderSettings {
  channels: Record<ReminderChannel, boolean>;
  quietHours: QuietHours;
  /** IANA time zone; absent means "use my profile's time zone". */
  timeZone?: string;
  /** 'HH:MM' local time reminders go out. */
  sendTime: string;
  updatedAt?: string;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  // Push only reaches devices where the user granted notification permission.
  // Texts and email stay off until the user turns them on.
  channels: { conversation: true, push: true, sms: false, email: false },
  quietHours: { start: '21:00', end: '08:00' },
  sendTime: '09:00',
};

export const DEFAULT_TIME_ZONE = 'America/New_York';

export interface UpcomingDate {
  record: ImportantDateRecord;
  /** The occurrence's local calendar day, YYYY-MM-DD. */
  occursOn: string;
  daysUntil: number;
  /** Years since the original date (age, years married) when the year is known. */
  yearsSince?: number;
}

export type UpsertStatus = 'created' | 'updated' | 'provenance_merged' | 'skipped_tombstoned';

export interface UpsertOutcome {
  id: string;
  status: UpsertStatus;
  record?: ImportantDateRecord;
}

export type ImportantDateErrorCode = 'invalid_input' | 'not_found' | 'storage_unavailable';

export class ImportantDateError extends Error {
  constructor(
    readonly code: ImportantDateErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ImportantDateError';
  }
}
