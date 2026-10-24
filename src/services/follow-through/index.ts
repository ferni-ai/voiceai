/**
 * Follow-through (growth context): what Ferni should follow through on for a
 * person, when to bring it up, and how it closes. Other contexts import from
 * here only. Plan: docs/plans/2026-10-12-follow-through.md.
 *
 * @module services/follow-through
 */

export {
  apply,
  ask,
  isClosed,
  nextOccurrence,
  ASK_ANSWERS,
  ASK_TYPES,
  CLOSE_REASONS,
  EVENT_PRECISIONS,
  VALENCES,
  type Ask,
  type AskInput,
  type CloseReason,
  type FollowUp,
  type FollowUpAction,
  type FollowUpEvent,
  type FollowUpKind,
  type FollowUpStatus,
  type Repeat,
  type Salience,
  type SurfacedVia,
} from './follow-up.js';
export type { FollowUpAsker } from './ports.js';
export { isQuietHour, rightMoment, type Moment } from './right-moment.js';
export { closeFromReply, type ReplyVerdict } from './close-from-reply.js';
export type { FollowUpSources, FollowUpStore, NewFollowUp, SourceItem } from './ports.js';
export { importFollowUps, type ImportResult } from './import-follow-ups.js';
export {
  deferredCallOutcome,
  followUpTextOutcome,
  logCallResultOutcome,
  logPromiseJobRun,
  logPromiseOutcome,
  noteCallRefinement,
  reminderOutcome,
  scheduledOutreachOutcome,
  type OutreachEnd,
  type PromiseJobCounts,
} from './promise-outcomes.js';
export { releaseForgotten } from './release-forgotten.js';
export { closeFromSource } from './close-from-source.js';
export {
  toHeldItem,
  whatFerniHolds,
  withoutContactDetails,
  MAX_HELD,
  type HeldItem,
  type HeldKind,
  type HeldSource,
  type HoldingView,
} from './holding.js';
