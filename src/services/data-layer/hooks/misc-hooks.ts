/**
 * Miscellaneous Domain Hooks
 *
 * Auto-indexing hooks for various data types that don't fit
 * cleanly into other domain categories.
 *
 * @module services/data-layer/hooks/misc-hooks
 */

import { createDomainHook, formatField, joinNonEmpty, formatDate } from '../hook-generator.js';
import type {
  ConversationThreadEntity,
  VisualMemoryEntity,
  ReminderEntity,
  CallResultEntity,
  FollowUpActionEntity,
  ScheduledOutreachEntity,
} from '../types.js';

// ============================================================================
// CONVERSATION THREADS
// ============================================================================

/**
 * Track conversation threads
 */
export const onConversationThreadChange = createDomainHook<ConversationThreadEntity>({
  storeType: 'conversation',
  entityType: 'conversation_thread',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Conversation about: ${c.topic}.`,
      `Participants: ${c.participantAgents.join(', ')}.`,
      `Messages: ${c.messageCount}.`,
      `Started: ${formatDate(c.startedAt)}.`,
      formatField('Emotional context', c.emotionalContext),
      `Status: ${c.status}.`,
    ]),
  metadataExtractor: (c) => ({
    topic: c.topic,
    messageCount: c.messageCount,
    status: c.status,
    participantAgents: c.participantAgents,
  }),
  shouldSkip: (c) => c.status === 'closed',
});

// ============================================================================
// VISUAL MEMORIES
// ============================================================================

/**
 * Track visual memories (images, photos shared)
 */
export const onVisualMemoryChange = createDomainHook<VisualMemoryEntity>({
  storeType: 'memory',
  entityType: 'visual_memory',
  contentBuilder: (v) =>
    joinNonEmpty([
      `Visual memory (${v.imageType}): ${v.description}.`,
      formatField('Context', v.context),
      v.emotions?.length ? `Emotions: ${v.emotions.join(', ')}.` : '',
      v.people?.length ? `People: ${v.people.join(', ')}.` : '',
      `Time: ${formatDate(v.timestamp)}.`,
    ]),
  metadataExtractor: (v) => ({
    imageType: v.imageType,
    timestamp: v.timestamp,
    hasEmotions: !!v.emotions?.length,
    hasPeople: !!v.people?.length,
  }),
});

// ============================================================================
// REMINDERS
// ============================================================================

/**
 * Track scheduled reminders
 */
export const onReminderChange = createDomainHook<ReminderEntity>({
  storeType: 'scheduling',
  entityType: 'reminder',
  contentBuilder: (r) =>
    joinNonEmpty([
      `Reminder: ${r.title}.`,
      formatField('Description', r.description),
      `Scheduled for: ${formatDate(r.scheduledFor)}.`,
      r.recurrence !== 'none' ? `Recurrence: ${r.recurrence}.` : '',
      formatField('Priority', r.priority),
      `Status: ${r.status}.`,
    ]),
  metadataExtractor: (r) => ({
    scheduledFor: r.scheduledFor,
    recurrence: r.recurrence,
    priority: r.priority,
    status: r.status,
  }),
  shouldSkip: (r) => r.status === 'completed' || r.status === 'cancelled',
});

// ============================================================================
// OUTREACH & ACTIONS
// ============================================================================

/**
 * Track call results from on-behalf calls
 */
export const onCallResultChange = createDomainHook<CallResultEntity>({
  storeType: 'outreach',
  entityType: 'call_result',
  contentBuilder: (c) =>
    joinNonEmpty([
      `Call to ${c.contactName}: ${c.outcome}.`,
      `Purpose: ${c.purpose}.`,
      formatField('Summary', c.summary),
      formatField('Next steps', c.nextSteps),
      c.duration ? `Duration: ${Math.round(c.duration / 60)} min.` : '',
      `Time: ${formatDate(c.capturedAt)}.`,
    ]),
  metadataExtractor: (c) => ({
    contactName: c.contactName,
    outcome: c.outcome,
    purpose: c.purpose,
    callId: c.callId,
  }),
});

/**
 * Track follow-up actions from calls
 */
export const onFollowUpActionChange = createDomainHook<FollowUpActionEntity>({
  storeType: 'outreach',
  entityType: 'follow_up_action',
  contentBuilder: (f) =>
    joinNonEmpty([
      `Follow-up (${f.actionType}): ${f.description}.`,
      f.scheduledFor ? `Scheduled: ${formatDate(f.scheduledFor)}.` : '',
      `Priority: ${f.priority}.`,
      `Status: ${f.status}.`,
    ]),
  metadataExtractor: (f) => ({
    actionType: f.actionType,
    priority: f.priority,
    status: f.status,
    relatedCallId: f.relatedCallId,
  }),
  shouldSkip: (f) => f.status === 'completed' || f.status === 'cancelled',
});

/**
 * Track scheduled proactive outreach
 */
export const onScheduledOutreachChange = createDomainHook<ScheduledOutreachEntity>({
  storeType: 'outreach',
  entityType: 'scheduled_outreach',
  contentBuilder: (s) =>
    joinNonEmpty([
      `Scheduled ${s.type} outreach via ${s.channel}.`,
      `Reason: ${s.reason}.`,
      `Scheduled for: ${formatDate(s.scheduledFor)}.`,
      `Priority: ${s.priority}.`,
      `Status: ${s.status}.`,
    ]),
  metadataExtractor: (s) => ({
    type: s.type,
    channel: s.channel,
    priority: s.priority,
    status: s.status,
  }),
  shouldSkip: (s) => s.status === 'sent' || s.status === 'cancelled',
});

// ============================================================================
// EXPORTS
// ============================================================================

export const miscHooks = {
  onConversationThreadChange,
  onVisualMemoryChange,
  onReminderChange,
  onCallResultChange,
  onFollowUpActionChange,
  onScheduledOutreachChange,
};

export default miscHooks;
