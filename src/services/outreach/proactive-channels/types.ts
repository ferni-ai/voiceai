/**
 * Shared shapes for proactive check-ins: what prompted one and where it went.
 *
 * @module services/outreach/proactive-channels/types
 */

export type ProactiveChannel = 'in_app' | 'sms' | 'voice_call';

export type TriggerWeight = 'light' | 'meaningful';

export interface ProactiveTrigger {
  /** Unique per thing Ferni is following up on, so it goes out once. */
  sourceId: string;
  kind: 'promise' | 'follow_up' | 'planned_checkin' | 'hard_news' | 'world_due' | 'reminder';
  weight: TriggerWeight;
  /** Worth interrupting the user's day for (it is about now, not someday). */
  timely: boolean;
  /** Ferni said she would call about this. */
  promisedCall?: boolean;
  /** What Ferni says, in her words. */
  text: string;
  /** Why Ferni reached out, for the call opener and the log. */
  reason: string;
  /** After this the moment has passed (a missed promise, a stale follow-up). */
  expiresAt?: Date;
}
