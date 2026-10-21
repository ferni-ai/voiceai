/**
 * The values each STRING column of ferni_events may hold (bq-events.ts). A value off its
 * list is written as 'other', so an id, email or phone number that reaches a producer
 * (the persona comes from a /token query parameter) never reaches BigQuery. A column
 * with no producer yet allows nothing until its producer adds its own list.
 *
 * @module services/analytics/bq-fields
 */
import { FLAG_MANIFEST } from '../../config/flag-manifest.js';

export const OTHER = 'other';

export const BQ_ENUMS = {
  event_type: ['call_end', 'send', 'hold', 'skip', 'fail'],
  env: ['prod', 'dev', 'unknown'],
  end_reason: ['natural', 'disconnect', 'error'],
  // persona-ids.ts ALL_CANONICAL_IDS (a test keeps them equal; importing it here would load
  // the persona module into every process that writes a row)
  persona: [
    ...['ferni', 'peter-john', 'alex-chen', 'maya-santos', 'jordan-taylor', 'nayan-patel'],
    ...['joel-dickson', 'peter-lynch', 'john-bogle'],
  ],
  channel: ['in_app', 'sms', 'voice_call'],
  kind: [
    ...['promise', 'follow_up', 'planned_checkin', 'hard_news', 'world_due', 'reminder'],
    ...['checkin', 'follow-up', 'message', 'on-behalf', 'morning-brief', 'call-result'],
    'opt-in',
  ],
  outcome: [
    ...['pending', 'sent', 'replied', 'ignored', 'failed'],
    ...['answered', 'no_answer', 'busy', 'declined'],
  ],
  reason: [
    ...['no-hash-secret', 'no-verified-phone', 'recently-sent', 'sms-off', 'opted-out'],
    ...['send-failed', 'bad-number', 'quiet-hours', 'needs-consent'],
    ...['fallback_from_in_app', 'fallback_from_sms', 'fallback_from_voice_call'],
  ],
} as const;
export type BqEnum<F extends keyof typeof BQ_ENUMS> = (typeof BQ_ENUMS)[F][number];

/** Tool names a producer has registered (the runtime tool registry); none until turn_metrics ships. */
const toolNames = new Set<string>();
export function registerBqToolNames(names: Iterable<string>): void {
  for (const n of names) toolNames.add(n);
}

const MODEL =
  /^(gemini-\d+(\.\d+)?-(flash-lite|flash|pro)|claude-(haiku|sonnet|opus)(-\d+([.-]\d+)?)?|gpt-\d+(\.\d+)?(-mini)?)$/;

/** A model id (or a Vertex path ending in one) as a known family and version, else 'other'. */
export function modelFamily(raw: string): string {
  const id = raw.trim().toLowerCase().split('/').pop() ?? '';
  if (id === 'default') return id;
  const m = /^(.*?)(-preview.*|-\d{3}|@.*|-\d{8})?$/.exec(id);
  return m?.[1] && MODEL.test(m[1]) ? m[1] : OTHER;
}

const inSet = (values: readonly string[]) => {
  const set = new Set(values);
  return (v: string): string => (set.has(v) ? v : OTHER);
};

/** Per STRING column: the value to write. Every STRING column of every table must be here. */
export const FIELD_VALUE: Record<string, (v: string) => string> = {
  ...Object.fromEntries(Object.entries(BQ_ENUMS).map(([f, values]) => [f, inSet(values)])),
  model: modelFamily,
  // a short commit hash, with a letter so a phone number can't pass as one
  agent_version: (v) => (/^(?=.*[a-f])[0-9a-f]{7,12}$/.test(v) ? v : OTHER),
  flags: (v) => (Object.hasOwn(FLAG_MANIFEST, v) ? v : OTHER),
  tools_called: (v) => (toolNames.has(v) ? v : OTHER),
  // no producer yet: nothing allowed until one adds its list
  item_kind: () => OTHER,
  surfaced_via: () => OTHER,
  run_id: () => OTHER,
  scenario: () => OTHER,
  arm: () => OTHER,
  metric: () => OTHER,
};
