/**
 * Call On Behalf Tool
 *
 * Enables agents to make phone calls ON BEHALF of users to third parties.
 * This is different from calling THE USER - here the agent calls a doctor,
 * restaurant, family member, etc. and handles the conversation autonomously.
 *
 * Flow:
 * 1. User says "Call my doctor to reschedule my appointment"
 * 2. Semantic router routes to this tool
 * 3. Tool resolves contact, builds script, initiates call
 * 4. Agent joins call with full context via outbound-call-context builder
 * 5. Agent handles conversation, captures outcome
 * 6. Original session notified of result
 *
 * @module tools/domains/telephony/call-on-behalf
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import type { ToolContext, Tool } from '../../registry/types.js';

const log = getLogger().child({ module: 'call-on-behalf' });

// ============================================================================
// TYPES
// ============================================================================

export type CallType = 'business' | 'personal' | 'emergency';

export type CallObjective =
  | 'reschedule'
  | 'cancel'
  | 'new_appointment'
  | 'inquiry'
  | 'reservation'
  | 'check_in'
  | 'deliver_message'
  | 'general';

export interface OnBehalfCallRequest {
  // Who to call
  contactQuery: string; // "my doctor", "mom", "Olive Garden"
  resolvedContact?: ResolvedContact;

  // Purpose
  purpose: string; // "reschedule appointment to next week"
  objective: CallObjective;
  callType: CallType;

  // Context from original conversation
  originalSessionId: string;
  userId: string;
  userTimezone: string;
  userName: string;
  userPreferences?: {
    preferredTimes?: string[];
    constraints?: string[];
    additionalContext?: string;
  };

  // Compliance
  recordingConsent: boolean;
  requiresHIPAA?: boolean;
}

export interface ResolvedContact {
  id?: string;
  name: string;
  phone: string;
  relationship?: string; // "doctor", "mom", "restaurant"
  company?: string;
  notes?: string;
}

export interface CallScriptTemplate {
  type: 'healthcare' | 'restaurant' | 'business' | 'personal';

  // Introduction
  greeting: string;
  identityDisclosure: string;

  // Recording consent (required in many jurisdictions)
  recordingConsentScript?: string;

  // Domain-specific
  hipaaNote?: string;

  // Objectives
  objectives: Record<string, string>;

  // Guardrails
  informationToGather: string[];
  mustConfirm: string[];
  mustNotDo: string[];
}

export interface CallOutcome {
  callId: string;
  status: 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed';

  // What happened
  objectiveAchieved: boolean;
  outcome: string;

  // Follow-ups
  callbackRequired?: boolean;
  callbackTime?: string;
  actionItems?: string[];

  // Recording (if consented)
  recordingUrl?: string;
  transcriptSummary?: string;
}

// ============================================================================
// CONTACT RESOLUTION
// ============================================================================

/**
 * Resolve a contact query to a phone number
 *
 * Resolution priority:
 * 1. Unified Entity Store (primary) - "Better Than Human" memory
 * 2. Legacy contact_relationships (fallback) - for backwards compatibility
 *
 * The entity store handles:
 * - "my brother" → finds entity with specificRelation="brother"
 * - "Mike" → finds entity with canonicalName/alias="Mike"
 * - Deduplication across all legacy collections
 */
async function resolveContact(
  contactQuery: string,
  userId: string
): Promise<ResolvedContact | null> {
  try {
    // =========================================================================
    // PRIMARY: Try unified entity store first
    // =========================================================================
    try {
      const { findContactForTelephony, isEntityStoreReady } =
        await import('../../../memory/entity-store/integration.js');

      if (isEntityStoreReady()) {
        const entityResult = await findContactForTelephony(userId, contactQuery);

        if (entityResult) {
          log.info(
            { contactQuery, name: entityResult.name, source: 'entity_store' },
            '📇 Contact resolved from unified entity store'
          );

          return {
            name: entityResult.name,
            phone: entityResult.phone,
            relationship: entityResult.relationship,
          };
        }
      }
    } catch (entityError) {
      log.debug(
        { error: String(entityError), contactQuery },
        'Entity store lookup failed, falling back to legacy'
      );
    }

    // =========================================================================
    // FALLBACK: Legacy contact_relationships collection
    // =========================================================================
    const { searchContacts } =
      await import('../../../services/contacts/contact-relationship-service.js');

    const results = await searchContacts(userId, contactQuery);

    if (results.length === 0) {
      log.debug({ contactQuery, userId }, 'No contact found in any store');
      return null;
    }

    // Take the first (best) match
    const contact = results[0];

    // ContactRelationship has phone as optional string
    if (!contact.phone) {
      log.debug({ contactQuery, contactName: contact.name }, 'Contact has no phone number');
      return null;
    }

    log.info(
      { contactQuery, name: contact.name, source: 'legacy_contact_relationships' },
      '📇 Contact resolved from legacy collection'
    );

    return {
      id: contact.id,
      name: contact.name || contactQuery,
      phone: contact.phone,
      relationship: contact.relationship,
      notes: contact.notes,
    };
  } catch (error) {
    log.error({ error: String(error), contactQuery }, 'Contact resolution failed');
    return null;
  }
}

/**
 * Infer call type from contact relationship
 */
function inferCallType(contact: ResolvedContact, purpose: string): CallType {
  const relationship = (contact.relationship || '').toLowerCase();
  const purposeLower = purpose.toLowerCase();

  // Emergency keywords
  if (purposeLower.includes('emergency') || purposeLower.includes('urgent')) {
    return 'emergency';
  }

  // Personal relationships
  const personalKeywords = [
    'mom',
    'mother',
    'dad',
    'father',
    'parent',
    'grandma',
    'grandmother',
    'grandpa',
    'grandfather',
    'sister',
    'brother',
    'sibling',
    'wife',
    'husband',
    'partner',
    'spouse',
    'son',
    'daughter',
    'child',
    'friend',
    'family',
  ];

  if (personalKeywords.some((kw) => relationship.includes(kw))) {
    return 'personal';
  }

  // Business relationships
  const businessKeywords = [
    'doctor',
    'dentist',
    'therapist',
    'lawyer',
    'accountant',
    'restaurant',
    'bank',
    'office',
    'company',
    'service',
    'pharmacy',
    'clinic',
    'hospital',
  ];

  if (businessKeywords.some((kw) => relationship.includes(kw))) {
    return 'business';
  }

  // Default to business if we have a company
  if (contact.company) {
    return 'business';
  }

  return 'personal';
}

/**
 * Infer call objective from purpose
 */
function inferObjective(purpose: string): CallObjective {
  const purposeLower = purpose.toLowerCase();

  if (purposeLower.includes('reschedule')) return 'reschedule';
  if (purposeLower.includes('cancel')) return 'cancel';
  if (purposeLower.includes('appointment') || purposeLower.includes('schedule'))
    return 'new_appointment';
  if (purposeLower.includes('reservation') || purposeLower.includes('book')) return 'reservation';
  if (purposeLower.includes('check') && purposeLower.includes('on')) return 'check_in';
  if (purposeLower.includes('tell') || purposeLower.includes('message')) return 'deliver_message';
  if (purposeLower.includes('ask') || purposeLower.includes('question')) return 'inquiry';

  return 'general';
}

// ============================================================================
// CALL INITIATION
// ============================================================================

/**
 * Initiate the call via the orchestrator
 */
async function initiateOnBehalfCall(request: OnBehalfCallRequest): Promise<string> {
  // Dynamic import to avoid circular dependencies
  const { getOnBehalfCallOrchestrator } =
    await import('../../../services/outreach/on-behalf-call-orchestrator.js');

  const orchestrator = getOnBehalfCallOrchestrator();
  return await orchestrator.initiateCall(request);
}

// ============================================================================
// CONTACT HELPERS
// ============================================================================

/**
 * Infer relationship type from the contact query
 * e.g., "my mom" → "mom", "doctor" → "doctor"
 */
function inferRelationshipFromQuery(query: string): string | undefined {
  const queryLower = query.toLowerCase();

  // Family relationships
  const familyWords = [
    'mom',
    'mother',
    'dad',
    'father',
    'brother',
    'sister',
    'grandma',
    'grandpa',
    'aunt',
    'uncle',
    'cousin',
  ];
  for (const word of familyWords) {
    if (queryLower.includes(word)) return word;
  }

  // Professional relationships
  const proWords = ['doctor', 'dentist', 'therapist', 'lawyer', 'accountant'];
  for (const word of proWords) {
    if (queryLower.includes(word)) return word;
  }

  return undefined;
}

/**
 * Save a contact for future use
 * This enables "remembering" phone numbers across sessions
 */
async function saveContactForFuture(
  userId: string,
  contactQuery: string,
  phone: string
): Promise<void> {
  try {
    const { upsertContact } =
      await import('../../../services/contacts/contact-relationship-service.js');

    // Extract a clean name from the query
    const cleanName = contactQuery
      .replace(/^(my\s+)/i, '') // Remove "my " prefix
      .replace(/\s+at\s+.*$/i, '') // Remove "at [phone]" suffix
      .trim();

    const relationship = inferRelationshipFromQuery(contactQuery);

    await upsertContact(userId, {
      name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1), // Capitalize
      contactId: `phone_${phone}`,
      phone,
      relationship: relationship ? 'family' : 'other',
      notes: relationship ? `User's ${relationship}` : undefined,
    });

    log.info({ userId, name: cleanName, relationship }, '📇 Contact saved for future calls');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to save contact');
    // Non-critical - don't throw
  }
}

// ============================================================================
// TOOL DEFINITION
// ============================================================================

/**
 * Parameter schema for the call on behalf tool
 */
const callOnBehalfSchema = z.object({
  contactQuery: z.string().describe('Who to call (e.g., "my doctor", "mom", "Olive Garden")'),
  phoneNumber: z
    .string()
    .optional()
    .describe(
      'Phone number if provided by user (e.g., "8018983303", "+1-801-898-3303"). Use this if the user explicitly provides a number.'
    ),
  purpose: z
    .string()
    .describe('Why you are calling (e.g., "reschedule my appointment to next week")'),
  additionalContext: z
    .string()
    .optional()
    .describe('Any additional context or preferences for the call'),
  preferredTimes: z
    .array(z.string())
    .optional()
    .describe('Preferred times if scheduling (e.g., ["morning", "after 2pm"])'),
  recordingConsent: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether the user consents to call recording'),
});

/**
 * Create the call on behalf tool
 */
export function createCallOnBehalfTool(ctx: ToolContext): Tool {
  return llm.tool({
    description:
      'Call a third party (doctor, restaurant, family member, etc.) on behalf of the user. ' +
      'Use this when the user asks you to make a call to someone else. ' +
      'IMPORTANT: If the user provides a phone number, extract it into the phoneNumber parameter. ' +
      'Example: "call my mom at 801-898-3303" → contactQuery: "my mom", phoneNumber: "8018983303". ' +
      'You will handle the entire conversation autonomously and report back the outcome.',

    parameters: callOnBehalfSchema,

    execute: async (params) => {
      const {
        contactQuery,
        phoneNumber,
        purpose,
        additionalContext,
        preferredTimes,
        recordingConsent,
      } = params;

      log.info(
        { userId: ctx.userId, contactQuery, phoneNumber: phoneNumber ? '***' : undefined, purpose },
        'Initiating call on behalf of user'
      );

      try {
        // Step 1: Resolve the contact (or create from provided phone number)
        let contact = await resolveContact(contactQuery, ctx.userId);

        // If user provided a phone number, use it (and optionally save the contact)
        if (phoneNumber) {
          const normalizedPhone = phoneNumber.replace(/\D/g, ''); // Strip non-digits

          if (contact) {
            // Update existing contact with new phone number
            contact.phone = normalizedPhone;
            log.info(
              { contactName: contact.name },
              'Using provided phone number for existing contact'
            );
          } else {
            // Create a temporary contact from the provided info
            contact = {
              name: contactQuery,
              phone: normalizedPhone,
              relationship: inferRelationshipFromQuery(contactQuery),
            };
            log.info({ contactQuery, phone: '***' }, 'Using provided phone number for new contact');

            // Save this contact for future use (async, don't wait)
            saveContactForFuture(ctx.userId, contactQuery, normalizedPhone).catch((err) => {
              log.warn({ error: String(err) }, 'Failed to save contact for future');
            });
          }
        }

        if (!contact) {
          return (
            `I couldn't find a contact matching "${contactQuery}". ` +
            `Could you tell me their phone number? For example, "call my mom at 555-123-4567"`
          );
        }

        if (!contact.phone) {
          return (
            `I found ${contact.name}, but I don't have a phone number for them. ` +
            `Could you provide their number?`
          );
        }

        // Step 2: Infer call type and objective
        const callType = inferCallType(contact, purpose);
        const objective = inferObjective(purpose);

        // Step 3: Get user profile for context
        let userTimezone = 'America/Los_Angeles';
        let userName = 'the user';
        try {
          // Use the global services to get user profile
          const { getGlobalServicesSync } = await import('../../../services/global-services.js');
          const global = getGlobalServicesSync();
          if (global?.store) {
            const profile = await global.store.getProfile(ctx.userId);
            if (profile) {
              userTimezone = profile.contactInfo?.timezone || 'America/Los_Angeles';
              userName = profile.preferredName || profile.name || 'the user';
            }
          }
        } catch {
          // Use defaults if profile load fails
        }

        // Step 4: Build the request
        const request: OnBehalfCallRequest = {
          contactQuery,
          resolvedContact: contact,
          purpose,
          objective,
          callType,
          originalSessionId: ctx.agentId, // Using agentId as session reference
          userId: ctx.userId,
          userTimezone,
          userName,
          userPreferences: {
            preferredTimes,
            additionalContext,
          },
          recordingConsent: recordingConsent ?? true,
          requiresHIPAA:
            callType === 'business' &&
            ['doctor', 'dentist', 'therapist', 'pharmacy', 'clinic', 'hospital'].some((kw) =>
              (contact.relationship || '').toLowerCase().includes(kw)
            ),
        };

        // Step 5: Check compliance
        const { checkCallCompliance } = await import('./compliance.js');
        const compliance = checkCallCompliance(request);

        if (!compliance.passed) {
          log.warn({ issues: compliance.issues }, 'Compliance check failed');
          return (
            `I can't make this call because: ${compliance.issues.join(', ')}. ` +
            `Could you help me resolve these issues?`
          );
        }

        // Step 6: Initiate the call
        const callId = await initiateOnBehalfCall(request);

        log.info({ callId, contactName: contact.name, purpose }, 'Call initiated successfully');

        // Step 7: Return confirmation
        const callTypeLabel = callType === 'personal' ? '' : ` (${callType})`;
        return (
          `Got it! I'm calling ${contact.name}${callTypeLabel} now to ${purpose}. ` +
          `I'll let you know how it goes once the call is complete.`
        );
      } catch (error) {
        log.error({ error: String(error), contactQuery, purpose }, 'Failed to initiate call');

        return (
          `Sorry, I ran into a problem trying to call ${contactQuery}. ` +
          `Would you like me to try again, or is there another way I can help?`
        );
      }
    },
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export { resolveContact, inferCallType, inferObjective, initiateOnBehalfCall, callOnBehalfSchema };
