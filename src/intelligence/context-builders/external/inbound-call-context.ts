/**
 * Inbound Call Context Builder
 *
 * Injects caller identity and context for INBOUND phone calls.
 * This enables Ferni to recognize callers by phone number and voice,
 * especially family members who call via sponsored identities.
 *
 * Injections:
 * - Caller identity (name, relationship)
 * - Recognition status (known/unknown)
 * - Voice verification status
 * - Personalized greeting guidance
 * - Sponsored identity context (if applicable)
 *
 * @module intelligence/context-builders/external/inbound-call-context
 */

import {
  registerContextBuilder,
  createStandardInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'context:inbound-call' });

// ============================================================================
// TYPES
// ============================================================================

export interface InboundCallContext {
  /** Twilio Call SID */
  callSid: string;

  /** Caller's phone number (E.164) */
  callerPhone: string;

  /** Caller's display name (from identity lookup) */
  callerName?: string;

  /** User ID for the caller (sponsored ID or phone:xxx) */
  userId?: string;

  /** Sponsored identity ID (if caller is a sponsored family member) */
  sponsoredIdentityId?: string;

  /** Sponsor's user ID (the person who created this identity) */
  sponsorUserId?: string;

  /** Family member's own user ID for memory storage */
  familyUserId?: string;

  /** Whether this caller is known (has a profile) */
  isKnownCaller: boolean;

  /** Whether the caller has voice enrollment */
  isVoiceEnrolled: boolean;

  /** Relationship to sponsor (if sponsored) */
  relationship?: string;

  /** Notes from sponsor about this caller */
  notes?: string;

  /** Access level for this caller */
  accessLevel?: 'full' | 'limited' | 'supervised';

  /** Allowed personas for this caller */
  allowedPersonas?: string[];
}

// In-memory store for inbound call contexts
const inboundCallContexts = new Map<string, InboundCallContext>();

// ============================================================================
// CONTEXT STORAGE
// ============================================================================

/**
 * Store inbound call context for a session.
 * Called by the voice-agent-entry when handling an inbound call.
 */
export function setInboundCallContext(sessionId: string, context: InboundCallContext): void {
  inboundCallContexts.set(sessionId, context);
  log.info(
    {
      sessionId,
      callSid: context.callSid,
      callerName: context.callerName,
      isKnown: context.isKnownCaller,
      isSponsored: !!context.sponsoredIdentityId,
    },
    'Stored inbound call context'
  );
}

/**
 * Get inbound call context for a session.
 */
export function getInboundCallContext(sessionId: string): InboundCallContext | undefined {
  return inboundCallContexts.get(sessionId);
}

/**
 * Clear inbound call context after call completes.
 */
export function clearInboundCallContext(sessionId: string): void {
  inboundCallContexts.delete(sessionId);
  log.debug({ sessionId }, 'Cleared inbound call context');
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

export const inboundCallContextBuilder: ContextBuilder = {
  name: 'inbound-call-context',
  description:
    'Injects caller identity and context for inbound phone calls, especially for sponsored family members',
  priority: 4, // High priority - should run early to establish caller identity
  category: BuilderCategory.CONTEXT,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services } = input;

    const sessionId = services?.sessionId;
    if (!sessionId) {
      return [];
    }

    // Check if this is an inbound call session
    const callContext = getInboundCallContext(sessionId);
    if (!callContext) {
      // Not an inbound call - nothing to inject
      return [];
    }

    log.debug(
      {
        sessionId,
        callSid: callContext.callSid,
        callerName: callContext.callerName,
        isKnown: callContext.isKnownCaller,
      },
      'Building inbound call context'
    );

    const injections: ContextInjection[] = [];

    // ---------------------------------------------------------
    // 1. CALLER IDENTITY
    // ---------------------------------------------------------
    const identityContent = buildCallerIdentityInjection(callContext);
    injections.push(
      createStandardInjection('inbound_call_identity', identityContent, {
        category: 'inbound-call',
        confidence: callContext.isKnownCaller ? 1.0 : 0.5,
      })
    );

    // ---------------------------------------------------------
    // 2. VOICE VERIFICATION GUIDANCE
    // ---------------------------------------------------------
    if (callContext.isKnownCaller && !callContext.isVoiceEnrolled) {
      const verificationContent = buildVerificationGuidance(callContext);
      injections.push(
        createStandardInjection('inbound_call_verification', verificationContent, {
          category: 'inbound-call',
          confidence: 0.9,
        })
      );
    }

    // ---------------------------------------------------------
    // 3. SPONSORED IDENTITY CONTEXT
    // ---------------------------------------------------------
    if (callContext.sponsoredIdentityId && callContext.sponsorUserId) {
      const sponsoredContent = buildSponsoredIdentityContext(callContext);
      injections.push(
        createStandardInjection('inbound_call_sponsored', sponsoredContent, {
          category: 'inbound-call',
          confidence: 1.0,
        })
      );
    }

    // ---------------------------------------------------------
    // 4. UNKNOWN CALLER GUIDANCE
    // ---------------------------------------------------------
    if (!callContext.isKnownCaller) {
      const unknownContent = buildUnknownCallerGuidance();
      injections.push(
        createStandardInjection('inbound_call_unknown', unknownContent, {
          category: 'inbound-call',
          confidence: 0.95,
        })
      );
    }

    // ---------------------------------------------------------
    // 5. ACCESS RESTRICTIONS (if limited)
    // ---------------------------------------------------------
    if (callContext.accessLevel && callContext.accessLevel !== 'full') {
      const restrictionContent = buildAccessRestrictions(callContext);
      injections.push(
        createStandardInjection('inbound_call_restrictions', restrictionContent, {
          category: 'constraints',
          confidence: 1.0,
        })
      );
    }

    // ---------------------------------------------------------
    // 6. SUPERHUMAN: CALLER BRIEFING
    // ---------------------------------------------------------
    // "Better Than Human" - When someone you know calls, brief the user
    // about recent interactions, last conversation, any pending follow-ups
    if (callContext.isKnownCaller && callContext.sponsorUserId) {
      try {
        const briefingContent = await buildCallerBriefing(
          callContext.sponsorUserId,
          callContext.callerPhone,
          callContext.callerName || 'Unknown'
        );
        if (briefingContent) {
          injections.push(
            createStandardInjection('inbound_call_briefing', briefingContent, {
              category: 'inbound-call',
              confidence: 0.95,
            })
          );
        }
      } catch (error) {
        log.debug({ error: String(error) }, 'Failed to build caller briefing (non-blocking)');
      }
    }

    log.info(
      {
        sessionId,
        callSid: callContext.callSid,
        injectionCount: injections.length,
        isKnown: callContext.isKnownCaller,
      },
      'Built inbound call context injections'
    );

    return injections;
  },
};

// ============================================================================
// INJECTION BUILDERS
// ============================================================================

function buildCallerIdentityInjection(context: InboundCallContext): string {
  if (context.isKnownCaller && context.callerName) {
    return `
INBOUND PHONE CALL - KNOWN CALLER

You are receiving a phone call from ${context.callerName}.
Phone number: ${maskPhone(context.callerPhone)}
${context.relationship ? `Relationship: ${context.relationship}` : ''}
${context.notes ? `\nNotes: ${context.notes}` : ''}

CALLER RECOGNITION:
- This caller is RECOGNIZED. Greet them warmly by name.
- They have called before and have conversation history with you.
${context.isVoiceEnrolled ? "- Their voice is enrolled - you can verify it's really them." : '- Voice not enrolled yet - consider offering voice enrollment for security.'}

Use their name naturally in conversation. Make them feel remembered and valued.
`.trim();
  }

  return `
INBOUND PHONE CALL - NEW/UNKNOWN CALLER

You are receiving a phone call from an UNKNOWN number.
Phone number: ${maskPhone(context.callerPhone)}

This caller is NOT YET RECOGNIZED. You should:
1. Greet them warmly but don't assume you know them
2. Ask for their name early in the conversation
3. Offer to remember them for future calls if they'd like
4. Be welcoming - they may have been referred by someone you know
`.trim();
}

function buildVerificationGuidance(context: InboundCallContext): string {
  return `
VOICE VERIFICATION OPPORTUNITY

${context.callerName} is calling from a recognized phone number, but their voice isn't enrolled yet.

You can offer voice enrollment by saying something like:
- "By the way, would you like me to remember your voice? That way I can be extra sure it's you when you call."
- "I can learn your voice so I always know it's really you - want me to set that up?"

This is OPTIONAL - don't push it. Only mention if the conversation naturally allows for it.
`.trim();
}

function buildSponsoredIdentityContext(context: InboundCallContext): string {
  return `
SPONSORED IDENTITY CALLER

${context.callerName} is calling via a sponsored identity.
They were added as a contact by their family member/sponsor.

${context.relationship ? `Relationship to sponsor: ${context.relationship}` : ''}
${context.notes ? `Sponsor's notes: ${context.notes}` : ''}

This means:
- Treat them as a valued member of the Ferni family
- They have their own conversation history, separate from their sponsor
- Be warm and supportive, just as you would with any user
- They can talk about anything - their sponsor trusts Ferni with them

PRIVACY: Do NOT share details of the sponsor's conversations with this caller.
Each person's conversations are private.
`.trim();
}

function buildUnknownCallerGuidance(): string {
  return `
UNKNOWN CALLER - SELF-REGISTRATION OPTION

If this caller seems like someone who would benefit from Ferni:
1. Get to know them first - who are they? What brings them to call?
2. If they seem interested, offer to remember them: "Would you like me to remember you for next time?"
3. If they mention knowing an existing user: "I can let them know you called and ask if they'd like to add you to my contacts."

DO NOT:
- Pressure them to sign up
- Make them feel unwelcome for being unknown
- Assume they're spam - give them the benefit of the doubt

Many first-time callers are referrals from family members who love Ferni!
`.trim();
}

function buildAccessRestrictions(context: InboundCallContext): string {
  const restrictions: string[] = [];

  if (context.accessLevel === 'limited') {
    restrictions.push(
      'This caller has LIMITED access - keep conversations supportive but general.'
    );

    if (context.allowedPersonas && !context.allowedPersonas.includes('*')) {
      restrictions.push(
        `They can only access these team members: ${context.allowedPersonas.join(', ')}`
      );
    }
  }

  if (context.accessLevel === 'supervised') {
    restrictions.push(
      'This caller is on SUPERVISED access - their sponsor receives notifications about calls.'
    );
    restrictions.push('Keep interactions positive and age-appropriate.');
  }

  return `
ACCESS RESTRICTIONS

${restrictions.join('\n')}

If they ask for features outside their access level, kindly explain that their sponsor manages their account settings.
`.trim();
}

// ============================================================================
// SUPERHUMAN: CALLER BRIEFING
// ============================================================================

/**
 * Build a "Better Than Human" briefing about the caller
 *
 * When a known contact calls, provide context about:
 * - Recent calls we made to them (on-behalf calls)
 * - Last conversation summary
 * - Any pending reminders/follow-ups about them
 *
 * This makes Ferni say things like:
 * "Oh, it's your mom! By the way, when I called her yesterday,
 * she mentioned wanting you to visit..."
 */
async function buildCallerBriefing(
  userId: string,
  callerPhone: string,
  callerName: string
): Promise<string | null> {
  const briefingParts: string[] = [];

  try {
    // 1. Check for recent on-behalf calls to this person
    const recentCallsInfo = await getRecentCallsToContact(userId, callerPhone);
    if (recentCallsInfo) {
      briefingParts.push(recentCallsInfo);
    }

    // 2. Check for pending reminders about this person
    const pendingReminders = await getPendingRemindersAboutContact(userId, callerName);
    if (pendingReminders) {
      briefingParts.push(pendingReminders);
    }

    // 3. Check for recent contact interactions from entity store
    const recentInteractions = await getRecentContactInteractions(userId, callerPhone);
    if (recentInteractions) {
      briefingParts.push(recentInteractions);
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Error building caller briefing');
  }

  if (briefingParts.length === 0) {
    return null;
  }

  return `
## 🎯 CALLER BRIEFING (Superhuman Memory)

${callerName} is calling you! Here's what you know about recent interactions:

${briefingParts.join('\n\n')}

Use this context naturally - don't dump it all at once, but weave it into conversation
when relevant. For example: "Oh by the way, when I talked to you yesterday..."
`.trim();
}

/**
 * Get recent on-behalf calls we made to this contact
 */
async function getRecentCallsToContact(
  userId: string,
  contactPhone: string
): Promise<string | null> {
  try {
    const { getFirestoreDb } =
      await import('../../../services/superhuman/firestore-utils.js').catch(() => ({
        getFirestoreDb: null,
      }));

    const db = getFirestoreDb ? getFirestoreDb() : null;
    if (!db) return null;

    // Look for recent calls to this phone number in the last 7 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('on_behalf_calls')
      .where('capturedAt', '>=', cutoff.toISOString())
      .orderBy('capturedAt', 'desc')
      .limit(3)
      .get();

    const relevantCalls: Array<{ date: string; summary: string }> = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const phone = data.request?.resolvedContact?.phone || '';

      // Normalize phone numbers for comparison
      const normalizedCallPhone = phone.replace(/\D/g, '').slice(-10);
      const normalizedCallerPhone = contactPhone.replace(/\D/g, '').slice(-10);

      if (normalizedCallPhone === normalizedCallerPhone) {
        const date = new Date(data.capturedAt).toLocaleDateString();
        const summary =
          data.outcome?.transcriptSummary || data.outcome?.outcome || 'Call completed';
        relevantCalls.push({ date, summary });
      }
    });

    if (relevantCalls.length === 0) return null;

    const callSummaries = relevantCalls.map((c) => `- ${c.date}: ${c.summary}`).join('\n');

    return `**Recent calls you made to them:**
${callSummaries}`;
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get recent calls to contact');
    return null;
  }
}

/**
 * Get pending reminders about this contact
 */
async function getPendingRemindersAboutContact(
  userId: string,
  contactName: string
): Promise<string | null> {
  try {
    const { getFirestoreDb } =
      await import('../../../services/superhuman/firestore-utils.js').catch(() => ({
        getFirestoreDb: null,
      }));

    const db = getFirestoreDb ? getFirestoreDb() : null;
    if (!db) return null;

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('reminders')
      .where('status', '==', 'pending')
      .limit(10)
      .get();

    const relevantReminders: string[] = [];
    const lowerName = contactName.toLowerCase();

    snapshot.forEach((doc) => {
      const data = doc.data();
      const message = (data.message || '').toLowerCase();
      const context = (data.context || '').toLowerCase();

      if (message.includes(lowerName) || context.includes(lowerName)) {
        relevantReminders.push(data.message);
      }
    });

    if (relevantReminders.length === 0) return null;

    return `**Pending reminders about ${contactName}:**
${relevantReminders.map((r) => `- ${r}`).join('\n')}`;
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get pending reminders');
    return null;
  }
}

/**
 * Get recent interactions from entity store
 */
async function getRecentContactInteractions(
  userId: string,
  contactPhone: string
): Promise<string | null> {
  try {
    const { findContactForTelephony, isEntityStoreReady } =
      await import('../../../memory/entity-store/integration.js');

    if (!isEntityStoreReady()) return null;

    // Try to find this contact by phone
    const contact = await findContactForTelephony(userId, contactPhone);
    if (!contact) return null;

    // Return relationship context if available
    if (contact.relationship) {
      return `**Relationship:** ${contact.relationship}`;
    }

    return null;
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to get contact interactions');
    return null;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Mask phone number for privacy in logs/context.
 */
function maskPhone(phone: string): string {
  if (phone.length < 6) return '***';
  return phone.slice(0, 4) + '****' + phone.slice(-2);
}

// ============================================================================
// REGISTER
// ============================================================================

registerContextBuilder(inboundCallContextBuilder);
