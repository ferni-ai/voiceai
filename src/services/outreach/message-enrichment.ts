/**
 * Message Enrichment Service
 *
 * Transforms brief user requests into warm, natural, "better than human" messages.
 *
 * When a user says "call my mom and say good morning", we don't just pass
 * "say good morning" to the call - we enrich it into what a loving son would
 * actually say: a warm greeting with natural pauses, personal touches, and
 * genuine connection.
 *
 * Philosophy: Every message should feel like it came from someone who truly
 * cares, not a robot executing a template.
 *
 * @module services/outreach/message-enrichment
 */

import { getLogger } from '../../utils/safe-logger.js';
import { callLLM } from '../llm-utils.js';
import { TEMP_REASONING, MAX_TOKENS_SHORT, LLM_TIMEOUT_MS } from '../../config/gemini-config.js';
import type { RelationshipStage } from './persona-voice-generator.js';
import {
  classifyIntent,
  generateSemanticMessage,
  getTimeContext,
  inferRelationshipStage as inferRelationshipStageFromSemantic,
  type SemanticMessageContext,
  type MessageIntent,
} from './semantic-message-system.js';

const log = getLogger().child({ service: 'message-enrichment' });

// ============================================================================
// TYPES
// ============================================================================

export interface EnrichmentContext {
  // The user's original short request
  originalMessage: string;

  // Relationship info
  relationship: {
    contactName: string;
    relationship: string; // "mother", "friend", "colleague"
    stage?: RelationshipStage; // new, building, established, deep
  };

  // The user sending the message
  sender: {
    userName: string;
    preferredName?: string;
  };

  // Optional context for richer messages
  context?: {
    recentTopics?: string[];
    recentWins?: string[];
    currentStruggles?: string[];
    upcomingEvents?: string[];
    lastConversationSummary?: string;
    timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
    occasion?: string; // birthday, holiday, etc.
  };

  // Call-specific settings
  settings?: {
    isVoicemail: boolean;
    maxLength?: 'short' | 'medium' | 'long';
  };
}

export interface EnrichedMessage {
  // The expanded, natural message
  message: string;

  // SSML version with pauses (for TTS)
  ssmlMessage?: string;

  // Components for voicemail assembly
  components?: {
    opening: string;
    personalContext?: string;
    mainMessage: string;
    close: string;
  };

  // Metadata
  metadata: {
    originalMessage: string;
    enrichedAt: Date;
    enrichmentType: 'llm' | 'template' | 'passthrough';
  };
}

// ============================================================================
// RELATIONSHIP INFERENCE
// ============================================================================

/**
 * Infer relationship depth from relationship type
 */
function inferRelationshipStage(relationship: string): RelationshipStage {
  const lowerRel = relationship.toLowerCase();

  // Deep relationships
  if (
    ['mother', 'mom', 'father', 'dad', 'spouse', 'wife', 'husband', 'partner'].includes(lowerRel)
  ) {
    return 'deep';
  }

  // Established relationships
  if (
    ['brother', 'sister', 'sibling', 'grandparent', 'grandma', 'grandpa', 'best friend'].includes(
      lowerRel
    )
  ) {
    return 'established';
  }

  // Building relationships
  if (['friend', 'cousin', 'aunt', 'uncle', 'colleague'].includes(lowerRel)) {
    return 'building';
  }

  // New relationships
  return 'new';
}

/**
 * Infer time of day from current time
 */
function inferTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// ============================================================================
// ENRICHMENT PROMPTS
// ============================================================================

/**
 * Build the LLM prompt for message enrichment
 */
function buildEnrichmentPrompt(context: EnrichmentContext): string {
  const { originalMessage, relationship, sender, context: richContext, settings } = context;

  const stage = relationship.stage || inferRelationshipStage(relationship.relationship);
  const timeOfDay = richContext?.timeOfDay || inferTimeOfDay();
  const isVoicemail = settings?.isVoicemail ?? false;

  // Determine message length guidance
  let lengthGuidance = 'medium length (3-5 sentences)';
  if (settings?.maxLength === 'short') {
    lengthGuidance = 'brief (2-3 sentences)';
  } else if (settings?.maxLength === 'long') {
    lengthGuidance = 'warm and thoughtful (4-6 sentences)';
  }

  // Build context description
  let contextDetails = '';
  if (richContext) {
    if (richContext.recentTopics?.length) {
      contextDetails += `\nRecent topics we've discussed: ${richContext.recentTopics.join(', ')}`;
    }
    if (richContext.recentWins?.length) {
      contextDetails += `\nRecent wins for them: ${richContext.recentWins.join(', ')}`;
    }
    if (richContext.upcomingEvents?.length) {
      contextDetails += `\nUpcoming events: ${richContext.upcomingEvents.join(', ')}`;
    }
    if (richContext.occasion) {
      contextDetails += `\nSpecial occasion: ${richContext.occasion}`;
    }
  }

  return `You are helping ${sender.preferredName || sender.userName} leave a ${isVoicemail ? 'voicemail' : 'phone message'} for ${relationship.contactName}, their ${relationship.relationship}.

ORIGINAL REQUEST: "${originalMessage}"

RELATIONSHIP DEPTH: ${stage} (${stage === 'deep' ? 'very close, intimate' : stage === 'established' ? 'comfortable, familiar' : stage === 'building' ? 'friendly, developing' : 'polite, new'})
TIME OF DAY: ${timeOfDay}
${contextDetails}

TASK: Transform this simple request into a warm, natural message that sounds like a real ${relationship.relationship === 'mother' || relationship.relationship === 'mom' ? 'loving child calling their mom' : `person calling their ${relationship.relationship}`}.

IMPORTANT GUIDELINES:
- Be ${lengthGuidance}
- Include natural pauses (use "..." for brief pauses)
- Sound genuine and warm, not robotic or scripted
- ${stage === 'deep' ? 'Be casual and intimate - they know each other well' : stage === 'established' ? 'Be warm and familiar' : 'Be friendly but respectful'}
- ${isVoicemail ? "End with a warm closing that doesn't require a callback" : 'End naturally, leave space for conversation'}
- Don't be overly sappy or fake - keep it authentic
- Reference time of day naturally if it fits ("I know it's early but...")
- ${originalMessage.toLowerCase().includes('morning') ? 'This is a morning check-in, keep it warm but not overly long' : ''}

OUTPUT FORMAT:
Return ONLY the message text. No quotes, no labels, no explanation. Just the message itself with "..." for natural pauses.

Example of what we want (if request was "say hi"):
"Hey Mom, it's me... just thinking about you this ${timeOfDay}. Hope you're having a good day... Give me a call when you get a chance. Love you."

Now transform "${originalMessage}" into a natural, warm message:`;
}

/**
 * Build prompt for voicemail-specific enrichment
 */
function buildVoicemailComponentsPrompt(context: EnrichmentContext): string {
  const { originalMessage, relationship, sender, context: richContext } = context;

  const stage = relationship.stage || inferRelationshipStage(relationship.relationship);

  return `You are helping ${sender.preferredName || sender.userName} leave a voicemail for ${relationship.contactName}, their ${relationship.relationship}.

ORIGINAL REQUEST: "${originalMessage}"
RELATIONSHIP DEPTH: ${stage}

Create a voicemail message broken into these components:
1. OPENING: A warm greeting (e.g., "Hey Mom, it's me")
2. PERSONAL_CONTEXT: ${richContext?.lastConversationSummary ? `Reference this recent topic: "${richContext.lastConversationSummary}"` : 'Optional - a brief personal touch'}
3. MAIN_MESSAGE: The expanded version of "${originalMessage}"
4. CLOSE: A warm sign-off that doesn't pressure for a callback

OUTPUT as JSON:
{
  "opening": "...",
  "personalContext": "..." or null,
  "mainMessage": "...",
  "close": "..."
}`;
}

// ============================================================================
// CORE ENRICHMENT
// ============================================================================

/**
 * Enrich a brief message request into a warm, natural message
 *
 * Strategy:
 * 1. Classify the semantic intent
 * 2. If known intent → use semantic templates (fast, free, consistent)
 * 3. If custom intent → use LLM (slower, but handles edge cases)
 *
 * This gives us the best of both worlds: human warmth at scale.
 */
export async function enrichMessage(context: EnrichmentContext): Promise<EnrichedMessage> {
  const startTime = Date.now();

  log.info(
    {
      originalMessage: context.originalMessage,
      contactName: context.relationship.contactName,
      relationship: context.relationship.relationship,
    },
    'Enriching message'
  );

  try {
    // Check if message is already rich enough (skip enrichment)
    if (isAlreadyRich(context.originalMessage)) {
      log.debug('Message is already rich, passing through');
      return {
        message: context.originalMessage,
        metadata: {
          originalMessage: context.originalMessage,
          enrichedAt: new Date(),
          enrichmentType: 'passthrough',
        },
      };
    }

    // Step 1: Classify the intent
    const intent = classifyIntent(context.originalMessage);
    log.debug({ originalMessage: context.originalMessage, intent }, 'Intent classified');

    // Step 2: If known intent, use semantic templates (fast path)
    if (intent !== 'custom') {
      return generateFromSemantic(context, intent, startTime);
    }

    // Step 3: Custom intent - use LLM (slow path)
    log.info({ intent }, 'Using LLM for custom intent');
    return await generateFromLLM(context, startTime);
  } catch (error) {
    log.error({ error: String(error) }, 'Message enrichment failed');
    return fallbackEnrichment(context);
  }
}

/**
 * Generate message using semantic template system
 */
function generateFromSemantic(
  context: EnrichmentContext,
  intent: MessageIntent,
  startTime: number
): EnrichedMessage {
  const stage =
    context.relationship.stage ||
    inferRelationshipStageFromSemantic(context.relationship.relationship);

  // Map 'short' to 'brief' for semantic system compatibility
  const targetLength =
    context.settings?.maxLength === 'short' ? 'brief' : context.settings?.maxLength;

  // Build semantic context
  const semanticContext: SemanticMessageContext = {
    originalRequest: context.originalMessage,
    intent,
    sender: {
      userId: 'enrichment',
      userName: context.sender.userName,
      preferredName: context.sender.preferredName,
    },
    recipient: {
      contactName: context.relationship.contactName,
      relationship: context.relationship.relationship,
      stage,
    },
    time: getTimeContext(),
    memory: context.context
      ? {
          recentTopics: context.context.recentTopics,
          recentWins: context.context.recentWins,
          currentStruggles: context.context.currentStruggles,
          upcomingEvents: context.context.upcomingEvents,
          lastConversationSummary: context.context.lastConversationSummary,
        }
      : undefined,
    isVoicemail: context.settings?.isVoicemail ?? false,
    targetLength,
  };

  // Generate using semantic system
  const semanticMessage = generateSemanticMessage(semanticContext);

  log.info(
    {
      intent,
      stage,
      componentsUsed: semanticMessage.metadata.componentsUsed,
      durationMs: Date.now() - startTime,
    },
    'Semantic message generated'
  );

  return {
    message: semanticMessage.message,
    ssmlMessage: semanticMessage.ssmlMessage,
    components: semanticMessage.components,
    metadata: {
      originalMessage: context.originalMessage,
      enrichedAt: new Date(),
      enrichmentType: 'template', // Semantic templates
    },
  };
}

/**
 * Generate message using LLM for complex/custom intents
 */
async function generateFromLLM(
  context: EnrichmentContext,
  startTime: number
): Promise<EnrichedMessage> {
  const prompt = buildEnrichmentPrompt(context);
  const enrichedText = await callLLM(prompt, {
    maxTokens: MAX_TOKENS_SHORT,
    temperature: TEMP_REASONING,
    timeout: LLM_TIMEOUT_MS,
  });

  if (!enrichedText) {
    log.warn('LLM enrichment failed, falling back to template');
    return fallbackEnrichment(context);
  }

  const cleanedMessage = cleanLLMResponse(enrichedText);
  const ssmlMessage = convertPausesToSSML(cleanedMessage);

  log.info(
    {
      originalLength: context.originalMessage.length,
      enrichedLength: cleanedMessage.length,
      durationMs: Date.now() - startTime,
    },
    'LLM message enriched successfully'
  );

  return {
    message: cleanedMessage,
    ssmlMessage,
    metadata: {
      originalMessage: context.originalMessage,
      enrichedAt: new Date(),
      enrichmentType: 'llm',
    },
  };
}

/**
 * Enrich specifically for voicemail with component structure
 */
export async function enrichVoicemailMessage(context: EnrichmentContext): Promise<EnrichedMessage> {
  const startTime = Date.now();

  log.info(
    {
      originalMessage: context.originalMessage,
      contactName: context.relationship.contactName,
    },
    'Enriching voicemail message'
  );

  try {
    // First get the simple enriched message
    const enrichedContext = { ...context, settings: { ...context.settings, isVoicemail: true } };
    const basicEnrichment = await enrichMessage(enrichedContext);

    // Try to get structured components
    const componentsPrompt = buildVoicemailComponentsPrompt(context);
    const componentsResponse = await callLLM(componentsPrompt, {
      maxTokens: MAX_TOKENS_SHORT,
      temperature: TEMP_REASONING,
      timeout: LLM_TIMEOUT_MS,
    });

    if (componentsResponse) {
      try {
        const parsed = JSON.parse(componentsResponse);
        if (parsed.opening && parsed.mainMessage && parsed.close) {
          log.debug('Parsed voicemail components successfully');
          return {
            ...basicEnrichment,
            components: {
              opening: parsed.opening,
              personalContext: parsed.personalContext || undefined,
              mainMessage: parsed.mainMessage,
              close: parsed.close,
            },
          };
        }
      } catch {
        log.debug('Could not parse voicemail components, using enriched message');
      }
    }

    log.info({ durationMs: Date.now() - startTime }, 'Voicemail enrichment complete');

    return basicEnrichment;
  } catch (error) {
    log.error({ error: String(error) }, 'Voicemail enrichment failed');
    return fallbackEnrichment(context);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if a message is already rich enough to skip enrichment
 */
function isAlreadyRich(message: string): boolean {
  // If it's more than 50 words, probably already rich
  const wordCount = message.split(/\s+/).length;
  if (wordCount > 50) return true;

  // If it contains multiple sentences, probably rich enough
  const sentenceCount = (message.match(/[.!?]+/g) || []).length;
  if (sentenceCount >= 3) return true;

  return false;
}

/**
 * Clean up LLM response (remove quotes, trim, etc.)
 */
function cleanLLMResponse(response: string): string {
  return response
    .replace(/^["']|["']$/g, '') // Remove surrounding quotes
    .replace(/^Message:\s*/i, '') // Remove "Message:" prefix
    .trim();
}

/**
 * Convert pause markers to SSML break tags
 */
function convertPausesToSSML(text: string): string {
  return text
    .replace(/\.\.\./g, '<break time="0.5s"/>') // Short pause
    .replace(/\s{2,}/g, ' '); // Normalize spaces
}

/**
 * Fallback enrichment using templates when LLM is unavailable
 */
function fallbackEnrichment(context: EnrichmentContext): EnrichedMessage {
  const { originalMessage, relationship, sender } = context;
  const stage = relationship.stage || inferRelationshipStage(relationship.relationship);
  const timeOfDay = inferTimeOfDay();

  // Build a template-based enrichment
  let opening: string;
  let close: string;

  switch (stage) {
    case 'deep':
      opening = `Hey ${relationship.contactName}, it's me.`;
      close = `Love you. Talk soon.`;
      break;
    case 'established':
      opening = `Hey ${relationship.contactName}! It's ${sender.preferredName || sender.userName}.`;
      close = `Anyway, that's it. Take care of yourself.`;
      break;
    default:
      opening = `Hi ${relationship.contactName}, this is ${sender.preferredName || sender.userName}.`;
      close = `Hope to talk soon. Bye.`;
  }

  // Expand the message slightly
  let mainMessage = originalMessage;

  // Morning greeting special handling
  if (originalMessage.toLowerCase().includes('good morning')) {
    mainMessage = `Just wanted to wish you a good ${timeOfDay === 'morning' ? 'morning' : 'day'}... I was thinking of you.`;
  } else if (
    originalMessage.toLowerCase().includes('hi') ||
    originalMessage.toLowerCase().includes('hello')
  ) {
    mainMessage = `Just wanted to say hi... You've been on my mind.`;
  } else if (originalMessage.toLowerCase().includes('thinking')) {
    mainMessage = `I've been thinking about you... wanted you to know.`;
  }

  const fullMessage = `${opening} ${mainMessage} ${close}`;

  return {
    message: fullMessage,
    ssmlMessage: convertPausesToSSML(fullMessage),
    components: {
      opening,
      mainMessage,
      close,
    },
    metadata: {
      originalMessage: context.originalMessage,
      enrichedAt: new Date(),
      enrichmentType: 'template',
    },
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  enrichMessage,
  enrichVoicemailMessage,
};
