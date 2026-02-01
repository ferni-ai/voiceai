/**
 * Semantic Data Capture Router
 *
 * Real-time extraction and routing of personal data mentioned during conversation.
 * Bridges the gap between tool-based semantic routing and passive data storage.
 *
 * This system enables "Better than Human" by:
 * 1. Passively capturing contacts, commitments, dreams, relationships
 * 2. Feeding data into Superhuman Services (commitment-keeper, dream-keeper, etc.)
 * 3. Generating natural acknowledgments for the LLM to weave in
 *
 * Example: "My mom's number is 555-1234"
 * → Extracts: { name: "Mom", relationship: "mother", phone: "555-1234" }
 * → Routes to: Contacts service
 * → Returns: Acknowledgment for LLM context
 *
 * @module intelligence/data-capture
 */

import { createLogger } from '../../utils/safe-logger.js';
import { runBackground } from '../../utils/background-task.js';
import type {
  DataCaptureContext,
  DataCaptureResult,
  CapturedItem,
  ContactEntity,
  DataIntent,
} from './types.js';

const log = createLogger({ module: 'DataCapture' });

// ============================================================================
// RELATIONSHIP MAPPINGS
// ============================================================================

const RELATIONSHIP_MAP: Record<string, string> = {
  mom: 'mother',
  mommy: 'mother',
  mother: 'mother',
  dad: 'father',
  daddy: 'father',
  father: 'father',
  sis: 'sister',
  sister: 'sister',
  bro: 'brother',
  brother: 'brother',
  wife: 'wife',
  husband: 'husband',
  spouse: 'spouse',
  partner: 'partner',
  boyfriend: 'boyfriend',
  girlfriend: 'girlfriend',
  fiance: 'fiancé',
  fiancee: 'fiancée',
  son: 'son',
  daughter: 'daughter',
  grandma: 'grandmother',
  grandmother: 'grandmother',
  grandpa: 'grandfather',
  grandfather: 'grandfather',
  aunt: 'aunt',
  uncle: 'uncle',
  cousin: 'cousin',
  boss: 'boss',
  manager: 'manager',
  coworker: 'coworker',
  colleague: 'colleague',
  friend: 'friend',
  neighbor: 'neighbor',
  doctor: 'doctor',
  dentist: 'dentist',
  therapist: 'therapist',
};

// ============================================================================
// PHONE NUMBER EXTRACTION
// ============================================================================

const PHONE_PATTERNS = [
  // Standard formats: (555) 123-4567, 555-123-4567, 555.123.4567
  /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
  // With country code: +1 555 123 4567, 1-555-123-4567
  /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
  // 10 digits together
  /\b\d{10}\b/,
  // 7 digits (local)
  /\b\d{3}[-.\s]?\d{4}\b/,
];

function extractPhoneNumber(text: string): string | null {
  for (const pattern of PHONE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Normalize to digits only
      const digits = match[0].replace(/\D/g, '');
      // Ensure we have at least 7 digits
      if (digits.length >= 7) {
        return match[0]; // Return original format
      }
    }
  }
  return null;
}

// ============================================================================
// EMAIL EXTRACTION
// ============================================================================

function extractEmail(text: string): string | null {
  const pattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const match = text.match(pattern);
  return match ? match[0].toLowerCase() : null;
}

// ============================================================================
// RELATIONSHIP EXTRACTION
// ============================================================================

interface RelationshipMatch {
  relationship: string;
  displayName: string;
  position: number;
}

function extractRelationship(text: string): RelationshipMatch | null {
  const lowerText = text.toLowerCase();

  // Check for relationship patterns
  for (const [keyword, relationship] of Object.entries(RELATIONSHIP_MAP)) {
    // Patterns: "my mom's", "my mom is", "my mom,", "a sister", "have a brother"
    const patterns = [
      // "my mom", "my mom's", "my mom is"
      new RegExp(`\\bmy\\s+${keyword}(?:'s|\\s|,|$)`, 'i'),
      // "mom's number", "mom's phone"
      new RegExp(`\\b${keyword}(?:'s)?\\s+(?:number|phone|email)`, 'i'),
      // "have a sister", "got a brother" - for introduction patterns
      new RegExp(`\\b(?:have|got)\\s+a\\s+${keyword}\\b`, 'i'),
      // "a sister named", "a brother called" - named introductions
      new RegExp(`\\ba\\s+${keyword}\\s+(?:named|called)\\b`, 'i'),
    ];

    for (const pattern of patterns) {
      const match = lowerText.match(pattern);
      if (match) {
        // Capitalize for display name
        const displayName = keyword.charAt(0).toUpperCase() + keyword.slice(1);
        return {
          relationship,
          displayName,
          position: match.index ?? 0,
        };
      }
    }
  }

  return null;
}

// ============================================================================
// INTENT CLASSIFICATION
// ============================================================================

function classifyIntent(
  text: string,
  hasContactInfo: boolean,
  hasRelationship: boolean
): DataIntent {
  const lowerText = text.toLowerCase();

  // Explicit save commands
  if (/\b(save|remember|add|store)\s+(my\s+)?/.test(lowerText) && hasContactInfo) {
    return 'explicit_save';
  }

  // Correction patterns
  if (/\b(actually|new|changed|updated|different)\s+/.test(lowerText) && hasContactInfo) {
    return 'correction';
  }

  // Query patterns
  if (/\b(what('s|is)|do you know|remind me|tell me)\s+/.test(lowerText)) {
    return 'query';
  }

  // If sharing contact info without explicit command
  if (hasContactInfo && /\b(is|here('s)?)\s+/.test(lowerText)) {
    return 'implicit_share';
  }

  // Relationship mention with action intent (call, text, message, talk to)
  // e.g., "call my mom", "text my brother", "I need to talk to my sister"
  if (
    hasRelationship &&
    /\b(call|text|message|reach|contact|talk\s+to|speak\s+(to|with))\s+(my\s+)?/.test(lowerText)
  ) {
    return 'relationship_mention';
  }

  // Explicit relationship introduction (my X is, I have a X)
  // e.g., "my mom is coming over", "I have a brother named John"
  if (hasRelationship && /\b(my\s+\w+\s+(is|was|has|loves|likes|works|lives))\b/.test(lowerText)) {
    return 'relationship_mention';
  }

  // Naming a relationship (my X, her/his name is Y, my X named Y)
  // e.g., "my mom, her name is Betty", "my brother named John", "my mom's name is Sarah"
  if (hasRelationship && /\b(name\s+is|named|called)\b/i.test(lowerText)) {
    return 'relationship_mention';
  }

  // Emotional relationship mentions (miss, love, worried about, thinking of)
  // e.g., "I miss my mom", "I love my sister", "worried about my dad"
  if (
    hasRelationship &&
    /\b(miss|love|adore|worried\s+(about|for)|thinking\s+(of|about)|care\s+(for|about))\s+(my\s+)?/.test(
      lowerText
    )
  ) {
    return 'relationship_mention';
  }

  // First-time relationship introduction (I have a, I've got a, there's my)
  // e.g., "I have a sister", "I've got a brother in Seattle"
  if (
    hasRelationship &&
    /\b(i\s+(have|'ve\s+got|got)\s+a|there('s| is)\s+my)\s+/i.test(lowerText)
  ) {
    return 'relationship_mention';
  }

  // Reference only (mentioned but not sharing new info)
  return 'reference_only';
}

// ============================================================================
// MAIN EXTRACTION
// ============================================================================

function extractContactEntity(text: string): ContactEntity | null {
  const phone = extractPhoneNumber(text);
  const email = extractEmail(text);
  const relationshipMatch = extractRelationship(text);

  // Must have either contact info OR relationship context
  if (!phone && !email && !relationshipMatch) {
    return null;
  }

  // Return entity even if only relationship (no phone/email)
  // The intent classifier will decide if it should be saved
  return {
    type: 'contact',
    name: relationshipMatch?.displayName,
    relationship: relationshipMatch?.relationship,
    phone: phone ?? undefined,
    email: email ?? undefined,
  };
}

// ============================================================================
// ACKNOWLEDGMENT GENERATION
// ============================================================================

function generateAcknowledgment(items: CapturedItem[]): string | undefined {
  if (items.length === 0) return undefined;

  const contactItems = items.filter(
    (i) => i.entity.type === 'contact' && i.storage.action !== 'skip'
  );

  if (contactItems.length === 0) return undefined;

  const contact = contactItems[0].entity as ContactEntity;
  const name = contact.name || contact.relationship || 'that contact';

  const hasContactInfo = !!(contact.phone || contact.email);
  const parts: string[] = [];
  if (contact.phone) parts.push('number');
  if (contact.email) parts.push('email');

  const what = parts.join(' and ');

  // Different acknowledgments based on intent
  const intent = contactItems[0].intent;
  switch (intent) {
    case 'explicit_save':
      return `Got it! I've saved ${name}'s ${what}.`;
    case 'implicit_share':
      return `I've saved ${name}'s ${what} for you.`;
    case 'correction':
      return `Updated! I've got ${name}'s new ${what}.`;
    case 'relationship_mention':
      // Relationship-only save - acknowledge we're remembering them
      return hasContactInfo ? `I've noted ${name}'s ${what}.` : undefined; // Silent save for relationship-only - more natural
    default:
      return undefined;
  }
}

// ============================================================================
// STORAGE ROUTING
// ============================================================================

async function routeToStorage(item: CapturedItem, context: DataCaptureContext): Promise<void> {
  if (item.storage.action === 'skip') return;
  if (item.entity.type !== 'contact') return;

  const contact = item.entity as ContactEntity;

  // ═══════════════════════════════════════════════════════════════════════════
  // 🧠 ENTITY STORE: Unified entity capture (Better Than Human memory)
  // This is the PRIMARY storage - legacy collections below are for backwards compatibility
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const { capturePersonEntity, isEntityStoreReady } =
      await import('../../memory/entity-store/integration.js');

    if (isEntityStoreReady()) {
      await capturePersonEntity(
        context.userId,
        {
          name: contact.name,
          relationship: contact.relationship,
          phone: contact.phone,
          email: contact.email,
        },
        {
          conversationId: context.sessionId || 'unknown',
          sessionId: context.sessionId || 'unknown',
          personaId: context.personaId || 'ferni', // Use context persona or fallback to Ferni
          transcript: context.transcript,
        }
      );
      log.info(
        { userId: context.userId, name: contact.name || contact.relationship },
        '🧠 Captured to unified entity store'
      );
    }
  } catch (entityErr) {
    log.warn(
      { error: String(entityErr) },
      'Entity store capture failed (non-fatal, continuing to legacy)'
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY: Also write to old collections for backwards compatibility
  // TODO: Remove after migration is complete
  // ═══════════════════════════════════════════════════════════════════════════

  // Import contacts service
  const { createContact, findContact, updateContact } = await import('../../services/contacts.js');

  // Check if contact already exists
  if (contact.name) {
    const existing = await findContact(context.userId, contact.name);
    if (existing) {
      // Update existing
      updateContact(existing.id, {
        phones: contact.phone
          ? [{ number: contact.phone, type: 'mobile', primary: true }]
          : undefined,
        emails: contact.email
          ? [{ address: contact.email, type: 'personal', primary: true }]
          : undefined,
      });
      log.info(
        { userId: context.userId, name: contact.name },
        '📇 Updated existing contact via data capture'
      );
      return;
    }
  }

  // Create new contact in main contacts service
  const newContact = await createContact(context.userId, {
    displayName: contact.name || contact.relationship || 'Contact',
    phone: contact.phone,
    relationship: contact.relationship,
    nicknames: contact.relationship ? [contact.relationship] : undefined,
  });

  log.info(
    {
      userId: context.userId,
      name: contact.name,
      relationship: contact.relationship,
      hasPhone: !!contact.phone,
      hasEmail: !!contact.email,
    },
    '📇 Created contact via data capture'
  );

  // 🐛 FIX: Also add to contact_relationships for telephony/search
  // This ensures "call my brother" will find the contact
  try {
    const { upsertContact } =
      await import('../../services/contacts/contact-relationship-service.js');
    const relationshipType =
      contact.relationship === 'mother' ||
      contact.relationship === 'father' ||
      contact.relationship === 'brother' ||
      contact.relationship === 'sister' ||
      contact.relationship === 'wife' ||
      contact.relationship === 'husband' ||
      contact.relationship === 'son' ||
      contact.relationship === 'daughter'
        ? 'family'
        : contact.relationship === 'friend'
          ? 'friend'
          : contact.relationship === 'boss' ||
              contact.relationship === 'coworker' ||
              contact.relationship === 'colleague'
            ? 'colleague'
            : 'other';

    await upsertContact(context.userId, {
      contactId: newContact.id,
      name: contact.name || contact.relationship || 'Contact',
      phone: contact.phone,
      email: contact.email,
      relationship: relationshipType as
        | 'family'
        | 'friend'
        | 'colleague'
        | 'acquaintance'
        | 'professional'
        | 'other',
      notes: contact.relationship, // Store the specific relationship (mom, brother, etc.)
    });

    log.info(
      { userId: context.userId, name: contact.name, relationship: contact.relationship },
      '📇 Also synced to contact_relationships for telephony'
    );
  } catch (syncErr) {
    log.warn({ error: String(syncErr) }, 'Failed to sync contact to relationships (non-fatal)');
  }
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Process transcript for data capture
 *
 * Extracts entities, classifies intent, routes to storage,
 * and returns context for LLM acknowledgment.
 */
export async function processDataCapture(context: DataCaptureContext): Promise<DataCaptureResult> {
  const { transcript, userId } = context;

  const captured: CapturedItem[] = [];

  // Extract contact entities
  const contactEntity = extractContactEntity(transcript);
  if (contactEntity) {
    const hasContactInfo = !!(contactEntity.phone || contactEntity.email);
    const hasRelationship = !!(contactEntity.relationship || contactEntity.name);
    const intent = classifyIntent(transcript, hasContactInfo, hasRelationship);

    // Determine storage action - now includes relationship_mention for "call my mom" style phrases
    const shouldSave =
      intent === 'explicit_save' ||
      intent === 'implicit_share' ||
      intent === 'correction' ||
      intent === 'relationship_mention';

    // Determine storage target (contacts for contact info, relationships for relationship-only)
    const storageTarget = hasContactInfo ? 'contacts' : 'relationships';

    const item: CapturedItem = {
      entity: contactEntity,
      intent,
      confidence: hasContactInfo ? 0.9 : hasRelationship ? 0.7 : 0.5,
      storage: {
        target: storageTarget,
        action: shouldSave ? 'create' : 'skip',
        reason: shouldSave
          ? `${intent}: saving ${hasContactInfo ? 'contact info' : 'relationship'}`
          : 'reference only, not saving',
      },
      acknowledged: shouldSave,
    };

    captured.push(item);

    // Route to storage (fire and forget for performance)
    if (shouldSave) {
      runBackground(routeToStorage(item, context), { task: 'data-capture-storage', userId });
    }
  }

  // Generate acknowledgment
  const suggestedAcknowledgment = generateAcknowledgment(captured);

  // Generate context for LLM
  const contextForLLM =
    captured.length > 0 && suggestedAcknowledgment
      ? `[DATA CAPTURED: ${suggestedAcknowledgment}]`
      : undefined;

  if (captured.length > 0) {
    log.info(
      {
        userId,
        capturedCount: captured.length,
        types: captured.map((c) => c.entity.type),
        intents: captured.map((c) => c.intent),
      },
      '🎯 Data capture extracted entities'
    );
  }

  return {
    captured,
    suggestedAcknowledgment,
    contextForLLM,
  };
}

// ============================================================================
// LEGACY DEFINITION-BASED DATA CAPTURE (DEPRECATED)
// ============================================================================
//
// The definition-based data capture system has been replaced by the new
// dynamic memory extraction system in src/memory/dynamic/
//
// The new system uses:
// - Fast capture (< 50ms) for immediate entity detection
// - Deep extraction (async LLM-powered) for comprehensive extraction
// - Temporal decoupling to avoid conversation latency
//
// The legacy definitions have been moved to ./_deprecated/
//
// @deprecated Use src/memory/dynamic/fastCapture instead
// ============================================================================

/**
 * @deprecated Use fastCapture from src/memory/dynamic/index.js instead.
 * This function is kept for backwards compatibility only.
 */
export async function captureDataBetterThanHuman(
  context: DataCaptureContext
): Promise<DataCaptureResult> {
  // Forward to processDataCapture for basic contact extraction only
  // The new dynamic memory system handles everything else
  return processDataCapture(context);
}

// Re-export types
export type * from './types.js';
