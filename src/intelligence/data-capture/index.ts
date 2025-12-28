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
  DataCaptureDefinition,
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

  // Check for "my [relationship]" patterns
  for (const [keyword, relationship] of Object.entries(RELATIONSHIP_MAP)) {
    // Patterns: "my mom's", "my mom is", "my mom,", etc.
    const patterns = [
      new RegExp(`\\bmy\\s+${keyword}(?:'s|\\s|,|$)`, 'i'),
      new RegExp(`\\b${keyword}(?:'s)?\\s+(?:number|phone|email)`, 'i'),
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

function classifyIntent(text: string, hasContactInfo: boolean): DataIntent {
  const lowerText = text.toLowerCase();

  // Explicit save commands
  if (
    /\b(save|remember|add|store)\s+(my\s+)?/.test(lowerText) &&
    hasContactInfo
  ) {
    return 'explicit_save';
  }

  // Correction patterns
  if (
    /\b(actually|new|changed|updated|different)\s+/.test(lowerText) &&
    hasContactInfo
  ) {
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

  // Must have contact info to be actionable
  if (!phone && !email) {
    return null;
  }

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
    default:
      return undefined;
  }
}

// ============================================================================
// STORAGE ROUTING
// ============================================================================

async function routeToStorage(
  item: CapturedItem,
  context: DataCaptureContext
): Promise<void> {
  if (item.storage.action === 'skip') return;
  if (item.entity.type !== 'contact') return;

  const contact = item.entity as ContactEntity;

  // Import contacts service
  const { createContact, findContact, updateContact } = await import(
    '../../services/contacts.js'
  );

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

  // Create new contact
  createContact(context.userId, {
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
export async function processDataCapture(
  context: DataCaptureContext
): Promise<DataCaptureResult> {
  const { transcript, userId } = context;

  const captured: CapturedItem[] = [];

  // Extract contact entities
  const contactEntity = extractContactEntity(transcript);
  if (contactEntity) {
    const hasContactInfo = !!(contactEntity.phone || contactEntity.email);
    const intent = classifyIntent(transcript, hasContactInfo);

    // Determine storage action
    const shouldSave =
      intent === 'explicit_save' ||
      intent === 'implicit_share' ||
      intent === 'correction';

    const item: CapturedItem = {
      entity: contactEntity,
      intent,
      confidence: hasContactInfo ? 0.9 : 0.5,
      storage: {
        target: 'contacts',
        action: shouldSave ? 'create' : 'skip',
        reason: shouldSave
          ? `${intent}: saving contact info`
          : 'reference only, not saving',
      },
      acknowledged: shouldSave,
    };

    captured.push(item);

    // Route to storage (fire and forget for performance)
    if (shouldSave) {
      runBackground(
        routeToStorage(item, context),
        { task: 'data-capture-storage', userId }
      );
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
// DEFINITION-BASED DATA CAPTURE ROUTER
// ============================================================================

/**
 * Definition-based data capture router.
 * Uses DataCaptureDefinitions to detect and extract data patterns.
 * This extends the hardcoded approach above with configurable definitions.
 */
class DefinitionBasedRouter {
  private definitions: DataCaptureDefinition[] = [];
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { allDataCaptureDefinitions } = await import('./definitions/index.js');
      this.definitions = allDataCaptureDefinitions;
      this.initialized = true;
      log.info({ count: this.definitions.length }, '🧠 Definition-based data capture initialized');
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to load data capture definitions');
    }
  }

  async captureFromDefinitions(context: DataCaptureContext): Promise<string | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    for (const def of this.definitions) {
      const matchScore = this.calculateMatchScore(context.transcript, def);

      if (matchScore > def.confidence.baseScore) {
        const extractedArgs = this.extractArguments(context.transcript, def);

        // Check required arguments
        const missingRequired = def.arguments.some(
          (arg) => arg.required && extractedArgs[arg.name] === undefined
        );
        if (missingRequired) {
          log.debug(
            { defId: def.id, transcript: context.transcript.slice(0, 50), extractedArgs },
            'Skipping definition: missing required args'
          );
          continue;
        }

        try {
          const acknowledgment = await def.handler(extractedArgs, context);
          if (acknowledgment) {
            log.info(
              { defId: def.id, extractedArgs, userId: context.userId },
              '🧠 Definition-based data captured'
            );
            return acknowledgment;
          }
        } catch (error) {
          log.error(
            { defId: def.id, error: String(error) },
            'Error in definition handler'
          );
        }
      }
    }

    return null;
  }

  private calculateMatchScore(transcript: string, def: DataCaptureDefinition): number {
    let score = 0;
    const lowerTranscript = transcript.toLowerCase();

    // Phrase matching (strongest signal)
    if (def.triggers.phrases) {
      for (const phrase of def.triggers.phrases) {
        if (lowerTranscript.includes(phrase.toLowerCase())) {
          score += def.confidence.baseScore;
          break;
        }
      }
    }

    // Pattern matching
    if (def.triggers.patterns) {
      for (const pattern of def.triggers.patterns) {
        if (pattern.test(transcript)) {
          score += def.confidence.patternMatchBonus || 0;
          break;
        }
      }
    }

    // Keyword matching
    if (def.triggers.keywords) {
      let keywordCount = 0;
      for (const keyword of def.triggers.keywords) {
        if (lowerTranscript.includes(keyword.word.toLowerCase())) {
          keywordCount++;
          score += keyword.weight;
        }
      }
      if (keywordCount > 0) {
        score *= def.confidence.keywordDensityMultiplier || 1;
      }
    }

    // Anti-keyword penalty
    if (def.triggers.antiKeywords) {
      for (const antiKeyword of def.triggers.antiKeywords) {
        if (lowerTranscript.includes(antiKeyword.toLowerCase())) {
          score *= def.confidence.negativeKeywordPenalty || 1;
          break;
        }
      }
    }

    return score;
  }

  private extractArguments(transcript: string, def: DataCaptureDefinition): Record<string, unknown> {
    const extracted: Record<string, unknown> = {};
    for (const arg of def.arguments) {
      if (arg.extractionPatterns) {
        for (const pattern of arg.extractionPatterns) {
          const match = transcript.match(pattern);
          if (match && match[1]) {
            extracted[arg.name] = match[1];
            break;
          }
        }
      }
    }
    return extracted;
  }
}

// Singleton instance
let definitionRouter: DefinitionBasedRouter | null = null;

function getDefinitionRouter(): DefinitionBasedRouter {
  if (!definitionRouter) {
    definitionRouter = new DefinitionBasedRouter();
  }
  return definitionRouter;
}

/**
 * Enhanced data capture that combines hardcoded + definition-based capture.
 *
 * This is the main entry point for "Better than Human" passive learning.
 *
 * @param context - Capture context with transcript and user info
 * @returns Capture result with acknowledgment for LLM injection
 */
export async function captureDataBetterThanHuman(
  context: DataCaptureContext
): Promise<DataCaptureResult> {
  // First, try the fast hardcoded path for contacts
  const hardcodedResult = await processDataCapture(context);

  // If hardcoded captured something, use that
  if (hardcodedResult.captured.length > 0 && hardcodedResult.suggestedAcknowledgment) {
    return hardcodedResult;
  }

  // Try definition-based capture for commitments, dreams, relationships
  const router = getDefinitionRouter();
  const definitionAck = await router.captureFromDefinitions(context);

  if (definitionAck) {
    return {
      captured: [],
      suggestedAcknowledgment: definitionAck,
      contextForLLM: `[DATA CAPTURED: ${definitionAck}]`,
    };
  }

  // Nothing captured
  return {
    captured: [],
    suggestedAcknowledgment: undefined,
    contextForLLM: undefined,
  };
}

// Re-export types
export type * from './types.js';

