/**
 * Personalized Outreach Service
 *
 * "Better Than Human" batch messaging that sends deeply personalized
 * messages to contacts based on relationship context, recent conversations,
 * important dates, and seasonal awareness.
 *
 * @module services/contacts/personalized-outreach
 */

import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sendEmail, sendSMS } from '../communication-service.js';
import { callLLM } from '../llm-utils.js';
import { loadNetwork } from '../superhuman/relationship-network.js';
import { loadPersonalDates } from '../superhuman/seasonal-awareness.js';
import { getGroup, getGroups } from './contact-groups.js';
import { getContact, getContacts, recordInteraction } from './contact-relationship-service.js';
import type {
  BatchOutreachRequest,
  BatchOutreachResult,
  ContactChannel,
  ContactImportantDate,
  EnhancedContact,
  OutreachContext,
  OutreachOccasion,
  OutreachSuggestion,
  OutreachTone,
  PersonalizedMessage,
} from './types.js';

const log = createLogger({ module: 'personalized-outreach' });

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const OUTREACH_COLLECTION = 'outreach_history';

let db: FirestoreType | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for outreach history');
    return null;
  }
}

// ============================================================================
// OCCASION TEMPLATES
// ============================================================================

interface OccasionTemplate {
  /** Greeting variations */
  greetings: string[];

  /** How to reference the occasion */
  occasionPhrases: string[];

  /** Suggested closings */
  closings: string[];

  /** Whether to include personal touches */
  includePersonalContext: boolean;

  /** Whether to reference recent conversations */
  includeRecentTopics: boolean;

  /** Whether to ask about their life */
  includeQuestions: boolean;
}

const OCCASION_TEMPLATES: Record<OutreachOccasion, OccasionTemplate> = {
  christmas: {
    greetings: ['Merry Christmas', 'Happy Holidays', 'Wishing you a wonderful Christmas'],
    occasionPhrases: ['this holiday season', 'as the year winds down', 'during this festive time'],
    closings: [
      'Hope your holidays are filled with joy',
      'Wishing you warmth and happiness',
      "Here's to a magical holiday season",
    ],
    includePersonalContext: true,
    includeRecentTopics: true,
    includeQuestions: false,
  },

  new_year: {
    greetings: ['Happy New Year', 'Wishing you an amazing new year', "Here's to a fresh start"],
    occasionPhrases: [
      'as we step into the new year',
      'looking ahead to the new year',
      'as one year ends and another begins',
    ],
    closings: [
      "May this year bring you everything you're hoping for",
      'Excited to see what this year has in store for you',
      'Cheers to new beginnings',
    ],
    includePersonalContext: true,
    includeRecentTopics: true,
    includeQuestions: true,
  },

  thanksgiving: {
    greetings: ['Happy Thanksgiving', 'Wishing you a wonderful Thanksgiving'],
    occasionPhrases: ['this Thanksgiving', "as we reflect on what we're grateful for"],
    closings: ['Grateful to have you in my life', 'Hope you have a wonderful day with loved ones'],
    includePersonalContext: true,
    includeRecentTopics: false,
    includeQuestions: false,
  },

  birthday: {
    greetings: [
      'Happy Birthday',
      'Wishing you the happiest of birthdays',
      'Hope your birthday is as wonderful as you are',
    ],
    occasionPhrases: ['on your special day', 'as you celebrate another year'],
    closings: [
      'May this year bring you joy and adventure',
      "Can't wait to see what this year brings you",
      'Hope your day is filled with everything you love',
    ],
    includePersonalContext: true,
    includeRecentTopics: true,
    includeQuestions: false,
  },

  anniversary: {
    greetings: ['Happy Anniversary', 'Congratulations on another wonderful year'],
    occasionPhrases: ['on this special milestone', 'as you celebrate this beautiful journey'],
    closings: ["Here's to many more years of happiness", 'Your love is truly inspiring'],
    includePersonalContext: true,
    includeRecentTopics: false,
    includeQuestions: false,
  },

  memorial: {
    greetings: ['Thinking of you today', 'Holding you in my thoughts'],
    occasionPhrases: ['on this day', 'as you remember'],
    closings: ["I'm here if you need anything", 'Sending you love and strength'],
    includePersonalContext: false,
    includeRecentTopics: false,
    includeQuestions: false,
  },

  check_in: {
    greetings: ['Hey', 'Hi', 'Was just thinking about you'],
    occasionPhrases: ['and wanted to check in', "and thought I'd reach out", "it's been a while"],
    closings: ['Would love to catch up sometime', "Let me know how you're doing", 'Miss you!'],
    includePersonalContext: true,
    includeRecentTopics: true,
    includeQuestions: true,
  },

  thinking_of_you: {
    greetings: ['Hey', 'Just wanted you to know'],
    occasionPhrases: ['I was thinking about you', 'you crossed my mind today'],
    closings: ["Hope you're doing well", 'Sending good vibes your way'],
    includePersonalContext: true,
    includeRecentTopics: true,
    includeQuestions: true,
  },

  congratulations: {
    greetings: ['Congratulations', 'So proud of you', 'This is amazing news'],
    occasionPhrases: ['what an achievement', 'you deserve this'],
    closings: ["Can't wait to celebrate with you", 'So happy for you'],
    includePersonalContext: true,
    includeRecentTopics: true,
    includeQuestions: false,
  },

  sympathy: {
    greetings: [
      "I'm so sorry to hear",
      'My heart goes out to you',
      'Thinking of you during this difficult time',
    ],
    occasionPhrases: ["I can't imagine what you're going through", "please know that I'm here"],
    closings: [
      "I'm here for you, whatever you need",
      'Sending you all my love',
      'Take all the time you need',
    ],
    includePersonalContext: false,
    includeRecentTopics: false,
    includeQuestions: false,
  },

  custom: {
    greetings: ['Hey', 'Hi'],
    occasionPhrases: [''],
    closings: [''],
    includePersonalContext: true,
    includeRecentTopics: true,
    includeQuestions: true,
  },
};

// ============================================================================
// TONE ADJUSTMENTS
// ============================================================================

interface ToneStyle {
  useEmoji: boolean;
  exclamationLevel: 'none' | 'light' | 'enthusiastic';
  formality: 'casual' | 'semi-formal' | 'formal';
  lengthPreference: 'brief' | 'moderate' | 'detailed';
}

const TONE_STYLES: Record<OutreachTone, ToneStyle> = {
  casual: {
    useEmoji: true,
    exclamationLevel: 'light',
    formality: 'casual',
    lengthPreference: 'brief',
  },
  warm: {
    useEmoji: true,
    exclamationLevel: 'light',
    formality: 'casual',
    lengthPreference: 'moderate',
  },
  formal: {
    useEmoji: false,
    exclamationLevel: 'none',
    formality: 'formal',
    lengthPreference: 'moderate',
  },
  celebratory: {
    useEmoji: true,
    exclamationLevel: 'enthusiastic',
    formality: 'casual',
    lengthPreference: 'moderate',
  },
  supportive: {
    useEmoji: false,
    exclamationLevel: 'none',
    formality: 'semi-formal',
    lengthPreference: 'moderate',
  },
  reflective: {
    useEmoji: false,
    exclamationLevel: 'none',
    formality: 'semi-formal',
    lengthPreference: 'detailed',
  },
};

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build outreach context for a contact
 */
export async function buildOutreachContext(
  userId: string,
  contactId: string,
  occasion: OutreachOccasion,
  tone: OutreachTone = 'warm'
): Promise<OutreachContext | null> {
  // Get contact from relationship service
  const contact = await getContact(userId, contactId);
  if (!contact) {
    log.warn({ userId, contactId }, 'Contact not found for outreach');
    return null;
  }

  // Calculate days since last contact
  const now = new Date();
  const lastContactedDays = Math.floor(
    (now.getTime() - contact.lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Get additional context from relationship network
  const network = await loadNetwork(userId);
  const networkPerson = network.find(
    (p) =>
      p.name.toLowerCase() === contact.name.toLowerCase() ||
      p.aliases.some((a) => a.toLowerCase() === contact.name.toLowerCase())
  );

  // Get upcoming dates
  const personalDates = await loadPersonalDates(userId);
  const upcomingDates: ContactImportantDate[] = [];

  // Check for contact's dates
  const contactDates = personalDates.filter((d) =>
    d.name.toLowerCase().includes(contact.name.toLowerCase())
  );

  for (const pd of contactDates) {
    const targetDate = new Date(now.getFullYear(), pd.month - 1, pd.day);
    const daysUntil = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 1000));

    if (daysUntil >= 0 && daysUntil <= 30) {
      upcomingDates.push({
        date: `${String(pd.month).padStart(2, '0')}-${String(pd.day).padStart(2, '0')}`,
        type:
          pd.type === 'celebration' ? 'birthday' : pd.type === 'memorial' ? 'memorial' : 'custom',
        label: pd.name,
        sentiment:
          pd.sentiment === 'positive'
            ? 'celebratory'
            : pd.sentiment === 'negative'
              ? 'sensitive'
              : 'neutral',
      });
    }
  }

  // Build enhanced contact from existing data
  const enhancedContact: EnhancedContact = {
    id: contact.id,
    userId: contact.userId,
    name: contact.name,
    aliases: networkPerson?.aliases || [],
    channels: buildChannelsFromContact(contact),
    preferredChannel: contact.preferredChannel || 'email',
    relationship: contact.relationship || 'other',
    groups: [],
    importantDates: upcomingDates,
    interests: networkPerson?.themes || [],
    recentTopics: contact.recentContext || [],
    sharedMemories: [],
    sensitiveTopics: networkPerson?.painPoints || [],
    lastContactDate: contact.lastInteraction,
    lastContactMethod: contact.preferredChannel || null,
    avgResponseTimeHours: contact.avgResponseTimeHours,
    preferredTimes: contact.bestTimeToReach ? [contact.bestTimeToReach] : undefined,
    strengthScore: contact.strengthScore,
    sentiment: mapSentiment(networkPerson?.sentiment),
    needsAttention: lastContactedDays > 30,
    interactionCount: contact.interactionCount,
    firstInteractionDate: contact.firstInteraction,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    notes: contact.notes,
  };

  return {
    contact: enhancedContact,
    lastContactedDays,
    recentTopicsDiscussed: contact.topics?.map((t) => t.topic) || [],
    sharedExperiences: contact.recentContext || [],
    occasion,
    upcomingDates,
    theirInterests: networkPerson?.themes || [],
    theirChallenges: networkPerson?.painPoints || [],
    insideJokes: [],
    tone,
  };
}

function buildChannelsFromContact(contact: {
  email?: string;
  phone?: string;
  preferredChannel?: string;
}): ContactChannel[] {
  const channels: ContactChannel[] = [];

  if (contact.email) {
    channels.push({
      type: 'email',
      value: contact.email,
      label: 'primary',
      verified: true,
      preferenceRank: contact.preferredChannel === 'email' ? 1 : 2,
    });
  }

  if (contact.phone) {
    channels.push({
      type: 'sms',
      value: contact.phone,
      label: 'mobile',
      verified: true,
      preferenceRank:
        contact.preferredChannel === 'phone' || contact.preferredChannel === 'text' ? 1 : 2,
    });
  }

  return channels;
}

function mapSentiment(networkSentiment?: string): 'warm' | 'neutral' | 'strained' | 'complicated' {
  switch (networkSentiment) {
    case 'very_positive':
    case 'positive':
      return 'warm';
    case 'negative':
    case 'tense':
      return 'strained';
    case 'complicated':
      return 'complicated';
    default:
      return 'neutral';
  }
}

// ============================================================================
// MESSAGE GENERATION
// ============================================================================

/**
 * Generate a personalized message for a contact
 *
 * This creates a thoughtful, personalized message using:
 * - Occasion-appropriate templates
 * - Personal context (interests, recent topics)
 * - Relationship depth
 * - Tone preferences
 */
/**
 * Generate a personalized message using LLM
 *
 * This is the "Better Than Human" approach - uses AI to craft
 * genuinely personalized messages based on relationship context.
 * Falls back to template if LLM unavailable.
 */
export async function generatePersonalizedMessageLLM(context: OutreachContext): Promise<string> {
  const log = createLogger({ module: 'personalized-outreach' });

  // Build the LLM prompt with all available context
  const prompt = buildMessagePrompt(context);

  try {
    const llmResponse = await callLLM(prompt, {
      maxTokens: 300,
      temperature: 0.7,
      timeout: 5000,
    });

    if (llmResponse && llmResponse.length > 20) {
      log.debug({ contactName: context.contact.name }, 'Generated message via LLM');
      return cleanLLMMessage(llmResponse);
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'LLM message generation failed, using template');
  }

  // Fall back to template
  return generatePersonalizedMessage(context);
}

/**
 * Build the prompt for LLM message generation
 */
function buildMessagePrompt(context: OutreachContext): string {
  const relationshipContext = [];

  if (context.theirInterests.length > 0) {
    relationshipContext.push(`Their interests: ${context.theirInterests.slice(0, 3).join(', ')}`);
  }

  if (context.recentTopicsDiscussed.length > 0) {
    relationshipContext.push(
      `Recent topics you discussed: ${context.recentTopicsDiscussed.slice(0, 3).join(', ')}`
    );
  }

  if (context.sharedExperiences.length > 0) {
    relationshipContext.push(
      `Shared experiences: ${context.sharedExperiences.slice(0, 2).join(', ')}`
    );
  }

  if (context.lastContactedDays > 0) {
    relationshipContext.push(`Days since last contact: ${context.lastContactedDays}`);
  }

  if (context.contact.relationship) {
    relationshipContext.push(`Relationship: ${context.contact.relationship}`);
  }

  const occasionDescriptions: Record<OutreachOccasion, string> = {
    birthday: 'a warm, personal birthday message',
    christmas: 'a heartfelt Christmas greeting (no emojis)',
    new_year: 'a thoughtful New Year message with hopes for them',
    thanksgiving: 'a grateful Thanksgiving message',
    anniversary: 'a sincere anniversary congratulations',
    check_in: 'a genuine check-in to reconnect',
    thinking_of_you: 'a heartfelt "thinking of you" note',
    sympathy: 'a compassionate, supportive message',
    congratulations: 'an enthusiastic congratulations',
    memorial: 'a thoughtful, sensitive memorial message',
    custom: 'a personalized message',
  };

  return `Write ${occasionDescriptions[context.occasion]} for ${context.contact.name}.

CONTEXT:
${relationshipContext.length > 0 ? relationshipContext.join('\n') : 'First-time message, keep it warm but not too familiar.'}

TONE: ${context.tone} (${context.tone === 'warm' ? 'friendly, personal' : context.tone === 'casual' ? 'relaxed, conversational' : 'respectful, sincere'})

RULES:
- NO emojis (this is a Ferni brand requirement)
- Keep it genuine and personal, not generic
- 2-4 sentences max
- Reference their interests or recent topics if relevant
- Sound like a real person, not a template
- Don't be overly formal or stiff

Write the message directly, no quotes or labels:`;
}

/**
 * Clean LLM response - remove any artifacts
 */
function cleanLLMMessage(message: string): string {
  return message
    .replace(/^["']|["']$/g, '') // Remove surrounding quotes
    .replace(/^\*+|\*+$/g, '') // Remove markdown asterisks
    .replace(/^Subject:.*\n/i, '') // Remove any subject lines
    .replace(/^Message:\s*/i, '') // Remove "Message:" prefix
    .trim();
}

/**
 * Template-based message generation (fallback)
 *
 * Used when LLM is unavailable. Still personalizes based on context
 * but uses pre-written phrases.
 */
export function generatePersonalizedMessage(context: OutreachContext): string {
  const template = OCCASION_TEMPLATES[context.occasion];
  const style = TONE_STYLES[context.tone];

  const parts: string[] = [];

  // 1. Greeting with name
  const greeting = pickRandom(template.greetings);
  const nameGreeting =
    style.formality === 'formal'
      ? `Dear ${context.contact.name},`
      : `${greeting}, ${context.contact.name}!`;
  parts.push(nameGreeting);

  // 2. Occasion-specific opening
  if (context.occasion !== 'custom') {
    const occasionPhrase = pickRandom(template.occasionPhrases);
    if (occasionPhrase) {
      parts.push(occasionPhrase);
    }
  }

  // 3. Personal context (if appropriate for this occasion)
  if (template.includePersonalContext && context.theirInterests.length > 0) {
    const interest = pickRandom(context.theirInterests);
    if (interest && context.occasion === 'check_in') {
      parts.push(`Hope ${interest} is going well.`);
    }
  }

  // 4. Recent topics reference
  if (template.includeRecentTopics && context.recentTopicsDiscussed.length > 0) {
    const recentTopic = context.recentTopicsDiscussed[0];
    if (recentTopic && context.lastContactedDays > 14) {
      parts.push(`Still thinking about what you shared about ${recentTopic}.`);
    }
  }

  // 5. Recency acknowledgment (for check-ins)
  if (context.occasion === 'check_in' && context.lastContactedDays > 30) {
    parts.push(`It's been too long since we last connected!`);
  }

  // 6. Closing
  const closing = pickRandom(template.closings);
  parts.push(closing);

  // 7. Question (if appropriate)
  if (template.includeQuestions) {
    parts.push("Would love to hear how you've been.");
  }

  // Join and format (NO EMOJIS - brand requirement)
  return parts.join(' ');
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Preview batch messages before sending
 *
 * Generates personalized messages for all recipients without sending.
 */
export async function previewBatchMessages(
  request: BatchOutreachRequest
): Promise<BatchOutreachResult> {
  const requestId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Resolve recipients
  const contactIds = await resolveRecipients(request.userId, request.recipients);

  const messages: PersonalizedMessage[] = [];
  const skipped: BatchOutreachResult['skipped'] = [];

  for (const contactId of contactIds) {
    try {
      const context = await buildOutreachContext(
        request.userId,
        contactId,
        request.occasion,
        request.tone
      );

      if (!context) {
        skipped.push({
          contactId,
          contactName: 'Unknown',
          reason: 'Contact not found',
        });
        continue;
      }

      // Check for valid channel
      const channel = getBestChannel(context.contact);
      if (!channel) {
        skipped.push({
          contactId,
          contactName: context.contact.name,
          reason: 'No valid communication channel (no email or phone)',
        });
        continue;
      }

      // Generate message
      const message = request.baseMessage
        ? personalizeBaseMessage(request.baseMessage, context)
        : generatePersonalizedMessage(context);

      messages.push({
        contactId,
        contactName: context.contact.name,
        message,
        channel: channel.type,
        channelValue: channel.value,
        occasion: request.occasion,
        personalizationNotes: buildPersonalizationNotes(context),
        approved: !request.requireApproval,
        sent: false,
      });
    } catch (error) {
      log.warn({ error: String(error), contactId }, 'Failed to generate message');
      skipped.push({
        contactId,
        contactName: contactId,
        reason: `Error: ${String(error)}`,
      });
    }
  }

  log.info(
    {
      requestId,
      userId: request.userId,
      total: contactIds.length,
      generated: messages.length,
      skipped: skipped.length,
    },
    'Batch messages preview generated'
  );

  return {
    requestId,
    messages,
    skipped,
    stats: {
      total: contactIds.length,
      generated: messages.length,
      skipped: skipped.length,
      sent: 0,
    },
  };
}

/**
 * Send batch messages
 */
export async function sendBatchMessages(
  userId: string,
  messages: PersonalizedMessage[]
): Promise<BatchOutreachResult> {
  const requestId = `send_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  let sentCount = 0;
  const skipped: BatchOutreachResult['skipped'] = [];

  for (const msg of messages) {
    if (!msg.approved) {
      skipped.push({
        contactId: msg.contactId,
        contactName: msg.contactName,
        reason: 'Not approved',
      });
      continue;
    }

    try {
      // Send via appropriate channel
      if (msg.channel === 'email') {
        const subject = getSubjectForOccasion(msg.occasion, msg.contactName);
        await sendEmail(msg.channelValue, subject, msg.message);
      } else if (msg.channel === 'sms') {
        await sendSMS(msg.channelValue, msg.message);
      }

      msg.sent = true;
      msg.sentAt = new Date();
      sentCount++;

      // Record the interaction
      await recordInteraction(userId, {
        contactId: msg.contactId,
        userId,
        date: new Date(),
        type: msg.channel === 'email' ? 'email' : 'text',
        direction: 'outbound',
        summary: `${msg.occasion} message: ${msg.message.slice(0, 100)}...`,
      });

      log.info(
        { contactId: msg.contactId, contactName: msg.contactName, channel: msg.channel },
        'Message sent'
      );
    } catch (error) {
      log.error({ error: String(error), contactId: msg.contactId }, 'Failed to send message');
      skipped.push({
        contactId: msg.contactId,
        contactName: msg.contactName,
        reason: `Send failed: ${String(error)}`,
      });
    }
  }

  // Save outreach history
  await saveOutreachHistory(
    userId,
    requestId,
    messages.filter((m) => m.sent)
  );

  log.info({ requestId, userId, sent: sentCount, skipped: skipped.length }, 'Batch send completed');

  return {
    requestId,
    messages,
    skipped,
    stats: {
      total: messages.length,
      generated: messages.length,
      skipped: skipped.length,
      sent: sentCount,
    },
  };
}

function getSubjectForOccasion(occasion: OutreachOccasion, name: string): string {
  switch (occasion) {
    case 'christmas':
      return 'Merry Christmas! 🎄';
    case 'new_year':
      return 'Happy New Year! 🎉';
    case 'thanksgiving':
      return 'Happy Thanksgiving!';
    case 'birthday':
      return `Happy Birthday, ${name}! 🎂`;
    case 'anniversary':
      return 'Happy Anniversary!';
    case 'check_in':
      return 'Thinking of you';
    case 'thinking_of_you':
      return 'Just wanted to say hi';
    case 'congratulations':
      return 'Congratulations!';
    case 'sympathy':
      return 'Thinking of you';
    default:
      return 'A message for you';
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function resolveRecipients(userId: string, recipients: string | string[]): Promise<string[]> {
  // If it's a string, check if it's a group name
  if (typeof recipients === 'string') {
    const group = await getGroup(userId, recipients);
    if (group) {
      return group.members;
    }

    // Otherwise, treat it as a single contact ID
    return [recipients];
  }

  return recipients;
}

function getBestChannel(contact: EnhancedContact): ContactChannel | null {
  if (contact.channels.length === 0) {
    return null;
  }

  // Sort by preference rank
  const sorted = [...contact.channels].sort((a, b) => a.preferenceRank - b.preferenceRank);

  return sorted[0] || null;
}

function personalizeBaseMessage(baseMessage: string, context: OutreachContext): string {
  // Replace placeholders
  let message = baseMessage
    .replace(/{name}/gi, context.contact.name)
    .replace(/{first_name}/gi, context.contact.name.split(' ')[0]);

  // Add personal touch if there's room
  if (context.theirInterests.length > 0 && !message.includes(context.theirInterests[0])) {
    const interest = context.theirInterests[0];
    message += ` Hope ${interest} is going well!`;
  }

  return message;
}

function buildPersonalizationNotes(context: OutreachContext): string[] {
  const notes: string[] = [];

  if (context.lastContactedDays > 30) {
    notes.push(`Haven't connected in ${context.lastContactedDays} days`);
  }

  if (context.theirInterests.length > 0) {
    notes.push(`Interests: ${context.theirInterests.slice(0, 3).join(', ')}`);
  }

  if (context.recentTopicsDiscussed.length > 0) {
    notes.push(`Recent topics: ${context.recentTopicsDiscussed[0]}`);
  }

  if (context.upcomingDates.length > 0) {
    notes.push(`Upcoming: ${context.upcomingDates[0].label}`);
  }

  return notes;
}

// ============================================================================
// PROACTIVE SUGGESTIONS
// ============================================================================

/**
 * Get proactive outreach suggestions
 *
 * Returns contacts that might benefit from a message based on:
 * - Time since last contact
 * - Upcoming important dates
 * - Seasonal occasions
 */
export async function getOutreachSuggestions(
  userId: string,
  limit = 10
): Promise<OutreachSuggestion[]> {
  const contacts = await getContacts(userId);
  const personalDates = await loadPersonalDates(userId);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  const suggestions: OutreachSuggestion[] = [];

  for (const contact of contacts) {
    const daysSinceContact = Math.floor(
      (now.getTime() - contact.lastInteraction.getTime()) / (1000 * 60 * 60 * 24)
    );

    // 1. Overdue contacts (haven't talked in 30+ days)
    if (daysSinceContact > 30 && contact.relationship !== 'acquaintance') {
      const urgency = daysSinceContact > 90 ? 'high' : daysSinceContact > 60 ? 'medium' : 'low';

      // Build minimal enhanced contact for suggestion
      const enhancedContact: EnhancedContact = {
        id: contact.id,
        userId,
        name: contact.name,
        aliases: [],
        channels: buildChannelsFromContact(contact),
        preferredChannel: contact.preferredChannel || 'email',
        relationship: contact.relationship || 'other',
        groups: [],
        importantDates: [],
        interests: [],
        recentTopics: contact.recentContext || [],
        sharedMemories: [],
        sensitiveTopics: [],
        lastContactDate: contact.lastInteraction,
        lastContactMethod: contact.preferredChannel || null,
        strengthScore: contact.strengthScore,
        sentiment: 'neutral',
        needsAttention: true,
        interactionCount: contact.interactionCount,
        firstInteractionDate: contact.firstInteraction,
        createdAt: contact.createdAt,
        updatedAt: contact.updatedAt,
      };

      suggestions.push({
        type: 'overdue',
        contact: enhancedContact,
        reason: `It's been ${daysSinceContact} days since you last connected with ${contact.name}`,
        urgency,
        daysUntilStale: 14,
      });
    }

    // 2. Check for upcoming dates (birthdays, anniversaries)
    for (const pd of personalDates) {
      if (!pd.name.toLowerCase().includes(contact.name.toLowerCase())) continue;

      const targetDate = new Date(now.getFullYear(), pd.month - 1, pd.day);
      if (targetDate < now) {
        targetDate.setFullYear(now.getFullYear() + 1);
      }

      const daysUntil = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil <= 7 && daysUntil >= 0) {
        const enhancedContact: EnhancedContact = {
          id: contact.id,
          userId,
          name: contact.name,
          aliases: [],
          channels: buildChannelsFromContact(contact),
          preferredChannel: contact.preferredChannel || 'email',
          relationship: contact.relationship || 'other',
          groups: [],
          importantDates: [
            {
              date: `${String(pd.month).padStart(2, '0')}-${String(pd.day).padStart(2, '0')}`,
              type: pd.type === 'celebration' ? 'birthday' : 'custom',
              label: pd.name,
              sentiment: pd.sentiment === 'positive' ? 'celebratory' : 'neutral',
            },
          ],
          interests: [],
          recentTopics: [],
          sharedMemories: [],
          sensitiveTopics: [],
          lastContactDate: contact.lastInteraction,
          lastContactMethod: contact.preferredChannel || null,
          strengthScore: contact.strengthScore,
          sentiment: 'neutral',
          needsAttention: true,
          interactionCount: contact.interactionCount,
          firstInteractionDate: contact.firstInteraction,
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
        };

        suggestions.push({
          type: 'upcoming_date',
          contact: enhancedContact,
          reason:
            daysUntil === 0
              ? `Today is ${pd.name}!`
              : `${pd.name} is in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`,
          urgency: daysUntil === 0 ? 'high' : daysUntil <= 3 ? 'medium' : 'low',
          daysUntilStale: daysUntil,
        });
      }
    }
  }

  // 3. Seasonal suggestions (holidays)
  const upcomingHolidays = getUpcomingHolidays();
  if (upcomingHolidays.length > 0) {
    const groups = await getGroups(userId);

    for (const holiday of upcomingHolidays) {
      // Find groups that want greetings for this occasion
      const relevantGroups = groups.filter((g) => {
        const prefs = g.occasionPreferences;
        if (holiday.occasion === 'christmas' && prefs.christmas) return true;
        if (holiday.occasion === 'new_year' && prefs.newYear) return true;
        if (holiday.occasion === 'thanksgiving' && prefs.thanksgiving) return true;
        return false;
      });

      if (relevantGroups.length > 0) {
        // Get first contact from first group as representative
        const firstGroupWithMembers = relevantGroups.find((g) => g.members.length > 0);
        if (firstGroupWithMembers) {
          const contactId = firstGroupWithMembers.members[0];
          const contact = await getContact(userId, contactId);

          if (contact) {
            const enhancedContact: EnhancedContact = {
              id: contact.id,
              userId,
              name: `${relevantGroups.length} groups (${relevantGroups.map((g) => g.name).join(', ')})`,
              aliases: [],
              channels: [],
              preferredChannel: 'email',
              relationship: 'other',
              groups: relevantGroups.map((g) => g.id),
              importantDates: [],
              interests: [],
              recentTopics: [],
              sharedMemories: [],
              sensitiveTopics: [],
              lastContactDate: new Date(),
              lastContactMethod: null,
              strengthScore: 0,
              sentiment: 'neutral',
              needsAttention: false,
              interactionCount: 0,
              firstInteractionDate: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            };

            suggestions.push({
              type: 'seasonal',
              contact: enhancedContact,
              reason: `${holiday.name} is in ${holiday.daysUntil} days - send greetings to your groups?`,
              urgency: holiday.daysUntil <= 3 ? 'high' : 'medium',
              daysUntilStale: holiday.daysUntil,
            });
          }
        }
      }
    }
  }

  // Sort by urgency and limit
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return suggestions.slice(0, limit);
}

function getUpcomingHolidays(): Array<{
  name: string;
  occasion: OutreachOccasion;
  daysUntil: number;
}> {
  const now = new Date();
  const currentYear = now.getFullYear();
  const holidays: Array<{ name: string; occasion: OutreachOccasion; daysUntil: number }> = [];

  const HOLIDAYS: Array<{
    month: number;
    day: number;
    name: string;
    occasion: OutreachOccasion;
  }> = [
    { month: 1, day: 1, name: "New Year's Day", occasion: 'new_year' },
    { month: 11, day: 28, name: 'Thanksgiving', occasion: 'thanksgiving' },
    { month: 12, day: 25, name: 'Christmas', occasion: 'christmas' },
  ];

  for (const holiday of HOLIDAYS) {
    let targetDate = new Date(currentYear, holiday.month - 1, holiday.day);
    if (targetDate < now) {
      targetDate = new Date(currentYear + 1, holiday.month - 1, holiday.day);
    }

    const daysUntil = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil <= 14 && daysUntil >= 0) {
      holidays.push({
        name: holiday.name,
        occasion: holiday.occasion,
        daysUntil,
      });
    }
  }

  return holidays;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function saveOutreachHistory(
  userId: string,
  requestId: string,
  messages: PersonalizedMessage[]
): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore
      .collection(OUTREACH_COLLECTION)
      .doc(requestId)
      .set(
        cleanForFirestore({
          userId,
          requestId,
          messages: messages.map((m) => ({
            contactId: m.contactId,
            contactName: m.contactName,
            occasion: m.occasion,
            channel: m.channel,
            sentAt: m.sentAt,
          })),
          createdAt: new Date(),
        })
      );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to save outreach history');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  buildOutreachContext,
  generatePersonalizedMessage,
  previewBatchMessages,
  sendBatchMessages,
  getOutreachSuggestions,
};
