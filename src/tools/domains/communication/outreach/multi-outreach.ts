/**
 * Multi-Target Outreach Tool - "Better than Human" Batch Communication
 *
 * Enables compound requests like:
 * - "Call Mom, text Dad, email my boss"
 * - "Reach out to my whole family"
 * - "Text Sarah now, call Mom in an hour"
 *
 * "Better than Human" because:
 * 1. HANDLES MULTIPLE TARGETS - One request, multiple people
 * 2. MIXED CHANNELS - Call one, text another, email a third
 * 3. SCHEDULED DELIVERY - "in an hour", "tomorrow morning"
 * 4. PARALLEL EXECUTION - Fast, concurrent outreach
 * 5. GRACEFUL FAILURES - Partial success still works
 *
 * @module tools/domains/communication/outreach/multi-outreach
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createLogger } from '../../../../utils/safe-logger.js';
import type { ToolContext, ToolDefinition, Tool } from '../../../registry/types.js';

// Contact & relationship services
import {
  searchContacts,
  type ContactRelationship,
} from '../../../../services/contacts/contact-relationship-service.js';
import { getGroups } from '../../../../services/contacts/contact-groups.js';
import type { ContactGroup } from '../../../../types/contacts.js';

// Outreach services
import { sendSMS } from '../../../../services/outreach/delivery/sms-delivery.js';
import { sendEmail } from '../../../../services/outreach/delivery/email-delivery.js';
import { callWithPersonaVoice } from '../../../../services/voice/voice-call.js';
import { makeConversationalCall } from '../../../../services/outreach/conversational-calls.js';
import type { OutboundCallContext } from '../../../../services/outreach/conversational-calls.js';

// Message crafting
import { craftPersonalizedMessage, type MessageCraftingContext } from './message-crafting.js';
import type { OutreachIntent, Channel } from './unified-outreach.js';

// Date parsing
import { parseNaturalDate } from '../../../../services/calendar/natural-date-parser.js';

// Scheduled storage
import {
  scheduleOutreach,
  type ScheduledOutreachTarget,
} from '../../../../services/outreach/scheduled-multi-outreach.js';

// Scheduled executor registration
import { registerUserForScheduledOutreach } from '../../../../services/outreach/scheduled-outreach-executor.js';

const log = createLogger({ module: 'multi-outreach' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single target in a multi-outreach request
 */
export interface OutreachTarget {
  /** Contact name, relationship label, or group name */
  contact: string;
  /** Why reaching out (optional, uses defaultPurpose if not set) */
  purpose?: string;
  /** Preferred channel (auto-selects if not specified) */
  channel?: 'call' | 'text' | 'email' | 'conversation' | 'auto';
  /** Custom message (LLM-crafted if not provided) */
  message?: string;
  /** When to send: "now", "in 1 hour", "tomorrow 9am" */
  scheduledFor?: string;
}

/**
 * Result for a single target
 */
export interface TargetResult {
  contact: string;
  resolvedName?: string;
  success: boolean;
  channel?: Channel;
  message?: string;
  error?: string;
  scheduled?: boolean;
  scheduledFor?: Date;
}

/**
 * Aggregated result for multi-outreach
 */
export interface MultiOutreachResult {
  total: number;
  succeeded: number;
  failed: number;
  scheduled: number;
  results: TargetResult[];
  summary: string;
}

/**
 * Resolved contact with target info
 */
interface ResolvedTarget {
  original: OutreachTarget;
  contact: ContactRelationship | null;
  isGroup: boolean;
  groupMembers?: ContactRelationship[];
  error?: string;
}

// ============================================================================
// CONTACT RESOLUTION
// ============================================================================

/**
 * Resolve a single contact or group
 */
async function resolveContact(userId: string, target: OutreachTarget): Promise<ResolvedTarget> {
  const contactQuery = target.contact.toLowerCase().trim();

  // 1. Try as a group first
  try {
    const groups = await getGroups(userId);
    const matchedGroup = groups.find(
      (g: ContactGroup) =>
        g.name.toLowerCase() === contactQuery || g.id.toLowerCase() === contactQuery
    );

    if (matchedGroup && matchedGroup.members.length > 0) {
      // Resolve group members
      const memberContacts: ContactRelationship[] = [];
      for (const memberId of matchedGroup.members) {
        const matches = await searchContacts(userId, memberId);
        if (matches.length > 0) {
          memberContacts.push(matches[0]);
        }
      }

      if (memberContacts.length > 0) {
        return {
          original: target,
          contact: null,
          isGroup: true,
          groupMembers: memberContacts,
        };
      }
    }
  } catch (err) {
    log.debug({ error: String(err), contact: target.contact }, 'Group lookup failed');
  }

  // 2. Try as individual contact
  try {
    const matches = await searchContacts(userId, target.contact);
    if (matches.length > 0) {
      return {
        original: target,
        contact: matches[0],
        isGroup: false,
      };
    }
  } catch (err) {
    log.debug({ error: String(err), contact: target.contact }, 'Contact search failed');
  }

  // 3. Not found
  return {
    original: target,
    contact: null,
    isGroup: false,
    error: `Could not find "${target.contact}" in your contacts`,
  };
}

/**
 * Resolve all targets in parallel
 */
async function resolveAllContacts(
  userId: string,
  targets: OutreachTarget[]
): Promise<ResolvedTarget[]> {
  return Promise.all(targets.map((t) => resolveContact(userId, t)));
}

// ============================================================================
// CHANNEL SELECTION
// ============================================================================

/**
 * Select best channel for a contact and purpose
 */
function selectChannel(
  contact: ContactRelationship,
  preferredChannel: OutreachTarget['channel'],
  purpose: string
): Channel {
  // Explicit preference
  if (preferredChannel && preferredChannel !== 'auto') {
    return preferredChannel;
  }

  // Use contact's preferred channel if available
  if (contact.preferredChannel) {
    return contact.preferredChannel as Channel;
  }

  // Intent-based selection
  const purposeLower = purpose.toLowerCase();

  // Calls for conversations, check-ins, important stuff
  if (
    purposeLower.includes('check in') ||
    purposeLower.includes('talk') ||
    purposeLower.includes('important') ||
    purposeLower.includes('urgent') ||
    purposeLower.includes('conversation')
  ) {
    return contact.phone ? 'call' : 'email';
  }

  // Default: text if phone available, else email
  if (contact.phone) return 'text';
  if (contact.email) return 'email';

  return 'text'; // Will fail later if no contact info
}

// ============================================================================
// INTENT DETECTION
// ============================================================================

function detectIntent(purpose: string): OutreachIntent {
  const p = purpose.toLowerCase();

  if (/\b(happy birthday|birthday|congratulat|good morning|wish|best wishes|get well)\b/.test(p)) {
    return 'wish_well';
  }
  if (/\b(thank|grateful|appreciate)\b/.test(p)) return 'thank_you';
  if (/\b(sorry|apologize|apology)\b/.test(p)) return 'apology';
  if (/\b(urgent|important|emergency)\b/.test(p)) return 'important';
  if (/\b(ask|question|wondering)\b/.test(p)) return 'ask_question';
  if (/\b(follow up|following up|check back)\b/.test(p)) return 'follow_up';
  if (/\b(schedule|plan|meet|appointment)\b/.test(p)) return 'schedule';
  if (/\b(share|tell|let .* know|update)\b/.test(p)) return 'share_news';
  if (/\b(remind|reminder)\b/.test(p)) return 'reminder';
  if (/\b(check in|checking in|see how|how are)\b/.test(p)) return 'check_in';

  return 'just_because';
}

// ============================================================================
// MESSAGE EXECUTION
// ============================================================================

/**
 * Execute outreach to a single contact
 */
async function executeOutreach(
  userId: string,
  personaId: string,
  contact: ContactRelationship,
  target: OutreachTarget,
  defaultPurpose: string
): Promise<TargetResult> {
  const purpose = target.purpose || defaultPurpose;
  const channel = selectChannel(contact, target.channel, purpose);
  const outreachId = `multi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Craft message if not provided
  let message = target.message;
  if (!message) {
    const intent = detectIntent(purpose);
    const ctx: MessageCraftingContext = {
      contactName: contact.name,
      purpose,
      intent,
      recentTopics: contact.topics?.slice(0, 3).map((t) => t.topic) || [],
      daysSinceLastContact: Math.floor(
        (Date.now() - (contact.lastInteraction?.getTime() || Date.now())) / (1000 * 60 * 60 * 24)
      ),
      relationshipStrength: contact.strengthScore || 50,
      personaId,
      channel,
    };
    message = await craftPersonalizedMessage(ctx);
  }

  log.info(
    { userId, contact: contact.name, channel, purpose },
    '🤝 Executing multi-outreach target'
  );

  try {
    // Execute based on channel
    if (channel === 'call' || channel === 'conversation') {
      if (!contact.phone) {
        return {
          contact: target.contact,
          resolvedName: contact.name,
          success: false,
          channel,
          error: `No phone number for ${contact.name}`,
        };
      }

      if (channel === 'conversation') {
        const callContext: OutboundCallContext = {
          userId,
          phoneNumber: contact.phone,
          message,
          personaId,
          reason: purpose,
        };
        const result = await makeConversationalCall(callContext);

        return {
          contact: target.contact,
          resolvedName: contact.name,
          success: result.status === 'initiating' || result.status === 'ringing',
          channel,
          message: `Calling ${contact.name}...`,
          error: result.error,
        };
      } else {
        const result = await callWithPersonaVoice(contact.phone, message, personaId, {
          fallbackToTwilioVoice: true,
        });

        return {
          contact: target.contact,
          resolvedName: contact.name,
          success: result.success,
          channel,
          message: result.success ? `Called ${contact.name}` : undefined,
          error: result.success ? undefined : result.message,
        };
      }
    }

    if (channel === 'text') {
      if (!contact.phone) {
        return {
          contact: target.contact,
          resolvedName: contact.name,
          success: false,
          channel,
          error: `No phone number for ${contact.name}`,
        };
      }

      const result = await sendSMS({
        to: contact.phone,
        body: message,
        personaId,
        userId,
        outreachId,
      });

      return {
        contact: target.contact,
        resolvedName: contact.name,
        success: result.success,
        channel,
        message: result.success ? `Texted ${contact.name}: "${message}"` : undefined,
        error: result.success ? undefined : result.error,
      };
    }

    if (channel === 'email') {
      if (!contact.email) {
        return {
          contact: target.contact,
          resolvedName: contact.name,
          success: false,
          channel,
          error: `No email for ${contact.name}`,
        };
      }

      const subject = generateSubject(purpose, contact.name);
      const result = await sendEmail({
        to: contact.email,
        subject,
        body: message,
        personaId,
        userId,
        outreachId,
      });

      return {
        contact: target.contact,
        resolvedName: contact.name,
        success: result.success,
        channel,
        message: result.success ? `Emailed ${contact.name}` : undefined,
        error: result.success ? undefined : result.error,
      };
    }

    return {
      contact: target.contact,
      resolvedName: contact.name,
      success: false,
      channel,
      error: `Unknown channel: ${channel}`,
    };
  } catch (error) {
    log.error({ error: String(error), contact: contact.name, channel }, 'Outreach failed');
    return {
      contact: target.contact,
      resolvedName: contact.name,
      success: false,
      channel,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function generateSubject(purpose: string, name: string): string {
  const firstName = name.split(' ')[0];
  const intent = detectIntent(purpose);

  switch (intent) {
    case 'wish_well':
      if (purpose.toLowerCase().includes('birthday')) return `Happy Birthday, ${firstName}!`;
      return `Thinking of you, ${firstName}`;
    case 'check_in':
      return `Hey ${firstName} - how are you?`;
    case 'thank_you':
      return `Thank you, ${firstName}!`;
    case 'important':
      return `Important: ${purpose.slice(0, 40)}`;
    default:
      return `Hey ${firstName}`;
  }
}

// ============================================================================
// SCHEDULING
// ============================================================================

/**
 * Parse scheduling expression and determine if immediate or scheduled
 */
function parseSchedule(scheduledFor: string | undefined): { immediate: boolean; date?: Date } {
  if (!scheduledFor || scheduledFor.toLowerCase() === 'now') {
    return { immediate: true };
  }

  const parsed = parseNaturalDate(scheduledFor);
  if (parsed) {
    // If parsed date is very close to now (within 2 minutes), treat as immediate
    const diff = parsed.date.getTime() - Date.now();
    if (diff < 2 * 60 * 1000) {
      return { immediate: true };
    }
    return { immediate: false, date: parsed.date };
  }

  // Couldn't parse, execute immediately
  log.warn({ scheduledFor }, 'Could not parse schedule, executing immediately');
  return { immediate: true };
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

/**
 * Main orchestrator for multi-target outreach
 */
async function executeMultiOutreach(
  userId: string,
  personaId: string,
  targets: OutreachTarget[],
  defaultPurpose: string
): Promise<MultiOutreachResult> {
  const results: TargetResult[] = [];
  const batchId = `batch_${Date.now()}`;

  // 1. Resolve all contacts
  const resolved = await resolveAllContacts(userId, targets);

  // 2. Flatten groups into individual contacts
  const flattenedTargets: Array<{ target: OutreachTarget; contact: ContactRelationship }> = [];
  const failedResolutions: TargetResult[] = [];

  for (const r of resolved) {
    if (r.error) {
      failedResolutions.push({
        contact: r.original.contact,
        success: false,
        error: r.error,
      });
      continue;
    }

    if (r.isGroup && r.groupMembers) {
      for (const member of r.groupMembers) {
        flattenedTargets.push({ target: r.original, contact: member });
      }
    } else if (r.contact) {
      flattenedTargets.push({ target: r.original, contact: r.contact });
    }
  }

  // 3. Split into immediate vs scheduled
  const immediate: typeof flattenedTargets = [];
  const scheduled: Array<{ target: OutreachTarget; contact: ContactRelationship; date: Date }> = [];

  for (const { target, contact } of flattenedTargets) {
    const schedule = parseSchedule(target.scheduledFor);
    if (schedule.immediate) {
      immediate.push({ target, contact });
    } else if (schedule.date) {
      scheduled.push({ target, contact, date: schedule.date });
    }
  }

  // 4. Execute immediate outreach in parallel
  const immediateResults = await Promise.all(
    immediate.map(({ target, contact }) =>
      executeOutreach(userId, personaId, contact, target, defaultPurpose)
    )
  );
  results.push(...immediateResults);

  // 5. Store scheduled outreach
  for (const { target, contact, date } of scheduled) {
    try {
      const scheduledTarget: ScheduledOutreachTarget = {
        contact: target.contact,
        purpose: target.purpose || defaultPurpose,
        channel: target.channel || 'auto',
        message: target.message,
        resolvedContactId: contact.id,
        resolvedContactName: contact.name,
        resolvedPhone: contact.phone,
        resolvedEmail: contact.email,
      };

      await scheduleOutreach(userId, personaId, scheduledTarget, date, batchId);

      // Register user for scheduled outreach processing
      registerUserForScheduledOutreach(userId);

      results.push({
        contact: target.contact,
        resolvedName: contact.name,
        success: true,
        scheduled: true,
        scheduledFor: date,
        message: `Scheduled for ${date.toLocaleString()}`,
      });
    } catch (error) {
      results.push({
        contact: target.contact,
        resolvedName: contact.name,
        success: false,
        scheduled: true,
        error: `Failed to schedule: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  // 6. Add failed resolutions
  results.push(...failedResolutions);

  // 7. Generate summary
  const succeeded = results.filter((r) => r.success && !r.scheduled).length;
  const scheduledCount = results.filter((r) => r.success && r.scheduled).length;
  const failed = results.filter((r) => !r.success).length;

  const summary = generateSummary(results);

  return {
    total: results.length,
    succeeded,
    failed,
    scheduled: scheduledCount,
    results,
    summary,
  };
}

/**
 * Generate human-readable summary of results
 */
function generateSummary(results: TargetResult[]): string {
  const lines: string[] = [];

  for (const r of results) {
    const name = r.resolvedName || r.contact;
    if (r.success) {
      if (r.scheduled && r.scheduledFor) {
        const timeStr = r.scheduledFor.toLocaleString('en-US', {
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        });
        lines.push(`📅 ${name}: scheduled for ${timeStr}`);
      } else if (r.channel === 'call' || r.channel === 'conversation') {
        lines.push(`📞 ${name}: calling now`);
      } else if (r.channel === 'text') {
        lines.push(`📱 ${name}: texted`);
      } else if (r.channel === 'email') {
        lines.push(`📧 ${name}: emailed`);
      } else {
        lines.push(`✓ ${name}: done`);
      }
    } else {
      lines.push(`❌ ${name}: ${r.error || 'failed'}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// TOOL CREATOR
// ============================================================================

export function createMultiOutreachTool(ctx: ToolContext): Tool {
  return llm.tool({
    description: `Reach out to multiple people at once. I'll handle each target with the right channel
and timing. Use this when someone asks to contact several people, or to reach out to a group.

Examples:
- "Call Mom, text Dad, email my boss" → mixed channels
- "Reach out to my family" → resolves group
- "Text Sarah now, call Mom in an hour" → mixed timing`,

    parameters: z.object({
      targets: z
        .array(
          z.object({
            contact: z.string().describe('Contact name, relationship, or group name'),
            purpose: z.string().optional().describe('Why reaching out to this person'),
            channel: z
              .enum(['call', 'text', 'email', 'conversation', 'auto'])
              .optional()
              .describe('Channel to use (auto-selects if not specified)'),
            message: z.string().optional().describe('Custom message (LLM-crafted if not provided)'),
            scheduledFor: z
              .string()
              .optional()
              .describe('When to send: "now", "in 1 hour", "tomorrow 9am"'),
          })
        )
        .describe('Array of people to reach out to'),
      defaultPurpose: z
        .string()
        .optional()
        .describe("Default purpose for targets that don't specify one"),
    }),

    execute: async (params) => {
      const userId = ctx.userId;
      if (!userId) return 'I need to know who you are to reach out on your behalf.';

      const { targets, defaultPurpose = 'check in' } = params;
      const personaId = ctx.agentId || 'ferni';

      if (!targets || targets.length === 0) {
        return 'Who would you like me to reach out to?';
      }

      log.info(
        { userId, targetCount: targets.length, defaultPurpose },
        '🤝 Multi-outreach initiated'
      );

      const result = await executeMultiOutreach(userId, personaId, targets, defaultPurpose);

      // Return summary for the user
      if (result.failed === result.total) {
        return `I couldn't reach any of them:\n${result.summary}`;
      }

      return result.summary;
    },
  });
}

// ============================================================================
// TOOL DEFINITION EXPORT
// ============================================================================

export function getMultiOutreachDefinition(): ToolDefinition {
  return {
    id: 'multiOutreach',
    name: 'Multi-Person Outreach',
    description: 'Reach out to multiple people with mixed channels and optional scheduling',
    domain: 'communication',
    tags: ['outreach', 'batch', 'call', 'text', 'email', 'multi', 'group'],
    requiredServices: ['twilio', 'sendgrid'],
    create: createMultiOutreachTool,
  };
}

export default createMultiOutreachTool;
