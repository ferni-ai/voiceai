/**
 * Outreach History Domain Hooks
 *
 * Auto-indexing hooks for tracking all outreach attempts and responses.
 * Critical for learning optimal outreach patterns - what works, what doesn't.
 *
 * @module services/data-layer/hooks/outreach-history-hooks
 */

import { createDomainHook, formatField, joinNonEmpty } from '../hook-generator.js';
import type {
  OutreachAttemptEntity,
  OutreachResponseEntity,
  OutreachPreferenceEntity,
} from '../types.js';

// ============================================================================
// OUTREACH ATTEMPT HOOKS
// ============================================================================

/**
 * Called when any outreach is sent
 * Track every attempt so we can learn from patterns
 */
export const onOutreachAttemptChange = createDomainHook<OutreachAttemptEntity>({
  entityType: 'outreach_attempt',
  storeType: 'outreach',
  contentBuilder: (entity: OutreachAttemptEntity) =>
    joinNonEmpty([
      `Outreach: ${entity.type} via ${entity.channel}`,
      formatField('Reason', entity.reason),
      formatField('By', entity.personaId),
      `[${entity.status}]`,
      formatField('Triggered by', entity.triggeredBy),
    ]),
});

// ============================================================================
// OUTREACH RESPONSE HOOKS
// ============================================================================

/**
 * Called when user responds to outreach
 * This is how we learn what outreach works
 */
export const onOutreachResponseChange = createDomainHook<OutreachResponseEntity>({
  entityType: 'outreach_response',
  storeType: 'outreach',
  contentBuilder: (entity: OutreachResponseEntity) =>
    joinNonEmpty([
      `Outreach response: ${entity.responseType} (${entity.sentiment})`,
      entity.responseTime ? `in ${entity.responseTime}s` : undefined,
      entity.ledToSession ? '→ led to session' : undefined,
      entity.feedback ? `Feedback: "${entity.feedback}"` : undefined,
    ]),
});

// ============================================================================
// OUTREACH PREFERENCE HOOKS
// ============================================================================

/**
 * Called when user outreach preferences are updated
 */
export const onOutreachPreferenceChange = createDomainHook<OutreachPreferenceEntity>({
  entityType: 'outreach_preference',
  storeType: 'outreach',
  contentBuilder: (entity: OutreachPreferenceEntity) =>
    joinNonEmpty([
      'Outreach preferences:',
      entity.preferredChannels?.length
        ? `Channels: ${entity.preferredChannels.join(', ')}`
        : undefined,
      formatField('Frequency', entity.frequency),
      entity.preferredDays?.length ? `Days: ${entity.preferredDays.join(', ')}` : undefined,
      entity.doNotDisturb?.length
        ? `DND: ${entity.doNotDisturb.map((d) => `${d.start}-${d.end}`).join(', ')}`
        : undefined,
    ]),
});
