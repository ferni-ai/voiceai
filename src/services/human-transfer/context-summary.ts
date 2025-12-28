/**
 * Context Summary Generator
 *
 * > "Better than human means a warm handoff, not a cold referral."
 *
 * Creates summaries for warm handoffs to human professionals.
 * The professional receives context so the user doesn't have to repeat themselves.
 *
 * @module services/human-transfer/context-summary
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { EscalationType, TransferSummary, TransferUrgency } from './types.js';

const log = createLogger({ module: 'context-summary' });

// ============================================================================
// TYPES
// ============================================================================

interface UserProfileData {
  preferredName?: string;
  pronouns?: string;
  age?: number;
  currentConcerns?: string[];
  relevantHistory?: string;
  boundaryTopics?: string[];
  communicationStyle?: string;
  triggers?: string[];
  whatHelps?: string[];
  alreadyTried?: string[];
  hasTherapist?: boolean;
  currentMedications?: boolean;
  supportSystem?: string[];
}

interface ConversationData {
  summaries: Array<{
    date: string;
    summary: string;
    topics: string[];
    mood?: string;
  }>;
  keyMoments?: string[];
  themes?: string[];
}

interface CrisisContextData {
  severity: number;
  signals: string[];
  urgency: TransferUrgency;
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

/**
 * Generate a warm handoff summary for human professionals
 */
export async function generateTransferSummary(
  escalationType: EscalationType,
  userProfile: UserProfileData,
  conversations: ConversationData,
  crisisContext?: CrisisContextData
): Promise<TransferSummary> {
  log.info({ escalationType }, 'Generating transfer summary');

  const sections: string[] = [];

  // Opening - warm introduction
  sections.push(generateOpeningSection(userProfile, escalationType));

  // Why we're connecting them
  sections.push(generateReasonSection(escalationType, crisisContext));

  // Key context the professional should know
  sections.push(generateContextSection(userProfile, conversations));

  // Preferences and sensitivities
  const preferencesSection = generatePreferencesSection(userProfile);
  if (preferencesSection) {
    sections.push(preferencesSection);
  }

  // What they've already tried
  const alreadyTriedSection = generateAlreadyTriedSection(userProfile);
  if (alreadyTriedSection) {
    sections.push(alreadyTriedSection);
  }

  const summary: TransferSummary = {
    summary: sections.join('\n\n'),
    urgency: crisisContext?.urgency || 'when_ready',
    keyTopics: extractKeyTopics(conversations, userProfile),
    doNotMention: userProfile.boundaryTopics || [],
    preferredName: userProfile.preferredName,
    communicationPreferences: {
      preferredPronouns: userProfile.pronouns,
      communicationStyle: userProfile.communicationStyle,
      triggers: userProfile.triggers,
    },
    relevantHistory: userProfile.relevantHistory,
    presentingConcerns: userProfile.currentConcerns || [],
    alreadyTried: userProfile.alreadyTried,
    whatHelps: userProfile.whatHelps,
    generatedAt: new Date().toISOString(),
  };

  return summary;
}

// ============================================================================
// SECTION GENERATORS
// ============================================================================

function generateOpeningSection(profile: UserProfileData, escalationType: EscalationType): string {
  const name = profile.preferredName || 'This person';
  const pronouns = profile.pronouns ? ` (${profile.pronouns})` : '';

  let opening = `**About ${name}${pronouns}**\n\n`;
  opening += `I've been supporting ${name} as their AI life coach. `;

  switch (escalationType) {
    case 'crisis_immediate':
    case 'crisis_support':
      opening += `They're reaching out during a difficult moment, and I want to make sure they have the best possible support.`;
      break;
    case 'therapy':
      opening += `Based on our conversations, I believe they would benefit from working with a licensed therapist.`;
      break;
    case 'psychiatry':
      opening += `Some of what they've shared suggests a psychiatric evaluation might be helpful.`;
      break;
    case 'coaching':
      opening += `They're ready for more intensive coaching support.`;
      break;
    case 'legal':
      opening += `They're dealing with a situation that requires legal expertise.`;
      break;
    case 'medical':
      opening += `They've described symptoms that warrant medical attention.`;
      break;
    case 'financial':
      opening += `They're navigating a financial situation that needs professional guidance.`;
      break;
    default:
      opening += `I'm connecting them with additional support.`;
  }

  return opening;
}

function generateReasonSection(
  escalationType: EscalationType,
  crisisContext?: CrisisContextData
): string {
  let reason = `**Why I'm Connecting You**\n\n`;

  if (crisisContext && crisisContext.severity >= 7) {
    reason += `⚠️ **Priority:** This person is experiencing significant distress.\n\n`;
  }

  switch (escalationType) {
    case 'crisis_immediate':
      reason += `They've expressed thoughts or described a situation that needs immediate professional crisis support. `;
      reason += `Your expertise in crisis intervention is exactly what they need right now.`;
      break;
    case 'crisis_support':
      reason += `They're going through a crisis moment and would benefit from speaking with trained crisis counselors. `;
      reason += `I've provided grounding and presence, but they need human connection.`;
      break;
    case 'therapy':
      reason += `The patterns in our conversations suggest they would benefit from ongoing therapeutic support. `;
      reason += `This goes beyond life coaching into territory where a licensed professional would be most helpful.`;
      break;
    case 'psychiatry':
      reason += `Some of what they've described - with their permission to share - suggests a psychiatric evaluation could be beneficial. `;
      reason += `I'm not qualified to assess this, but wanted to ensure they're connected with someone who is.`;
      break;
    default:
      reason += `Based on our conversations, connecting them with a professional in your area seems like the right next step.`;
  }

  return reason;
}

function generateContextSection(profile: UserProfileData, conversations: ConversationData): string {
  let context = `**What I Know**\n\n`;

  // Current concerns
  if (profile.currentConcerns && profile.currentConcerns.length > 0) {
    context += `**Main concerns:** ${profile.currentConcerns.join(', ')}\n\n`;
  }

  // Recent conversation themes
  if (conversations.themes && conversations.themes.length > 0) {
    context += `**Recurring themes:** ${conversations.themes.join(', ')}\n\n`;
  }

  // Key moments from conversations
  if (conversations.keyMoments && conversations.keyMoments.length > 0) {
    context += `**Key moments from our conversations:**\n`;
    for (const moment of conversations.keyMoments.slice(0, 3)) {
      context += `- ${moment}\n`;
    }
    context += '\n';
  }

  // Recent history
  if (profile.relevantHistory) {
    context += `**Relevant history:** ${profile.relevantHistory}\n\n`;
  }

  // Support system
  if (profile.supportSystem && profile.supportSystem.length > 0) {
    context += `**Support system:** ${profile.supportSystem.join(', ')}\n\n`;
  }

  // Current treatment
  if (profile.hasTherapist) {
    context += `**Note:** They currently have a therapist they're working with.\n\n`;
  }

  return context;
}

function generatePreferencesSection(profile: UserProfileData): string | null {
  const preferences: string[] = [];

  if (profile.pronouns) {
    preferences.push(`Pronouns: ${profile.pronouns}`);
  }

  if (profile.communicationStyle) {
    preferences.push(`Communication style: ${profile.communicationStyle}`);
  }

  if (profile.triggers && profile.triggers.length > 0) {
    preferences.push(`Topics that may be triggering: ${profile.triggers.join(', ')}`);
  }

  if (profile.boundaryTopics && profile.boundaryTopics.length > 0) {
    preferences.push(`Topics they prefer to avoid: ${profile.boundaryTopics.join(', ')}`);
  }

  if (profile.whatHelps && profile.whatHelps.length > 0) {
    preferences.push(`What helps them: ${profile.whatHelps.join(', ')}`);
  }

  if (preferences.length === 0) return null;

  let section = `**Preferences & Sensitivities**\n\n`;
  for (const pref of preferences) {
    section += `- ${pref}\n`;
  }

  return section;
}

function generateAlreadyTriedSection(profile: UserProfileData): string | null {
  if (!profile.alreadyTried || profile.alreadyTried.length === 0) return null;

  let section = `**What They've Already Tried**\n\n`;
  for (const item of profile.alreadyTried) {
    section += `- ${item}\n`;
  }

  return section;
}

function extractKeyTopics(conversations: ConversationData, profile: UserProfileData): string[] {
  const topics = new Set<string>();

  // From conversation themes
  if (conversations.themes) {
    for (const theme of conversations.themes) {
      topics.add(theme);
    }
  }

  // From current concerns
  if (profile.currentConcerns) {
    for (const concern of profile.currentConcerns) {
      topics.add(concern);
    }
  }

  // From recent summaries
  for (const summary of conversations.summaries.slice(0, 5)) {
    for (const topic of summary.topics) {
      topics.add(topic);
    }
  }

  return Array.from(topics).slice(0, 10);
}

// ============================================================================
// MINIMAL SUMMARY (for when user requests privacy)
// ============================================================================

/**
 * Generate a minimal summary when user wants less shared
 */
export function generateMinimalSummary(
  escalationType: EscalationType,
  urgency: TransferUrgency
): TransferSummary {
  let summary = '';

  switch (escalationType) {
    case 'crisis_immediate':
    case 'crisis_support':
      summary = 'This person is reaching out during a difficult time and could use support.';
      break;
    case 'therapy':
      summary = 'This person is interested in connecting with a therapist.';
      break;
    case 'psychiatry':
      summary = 'This person would like to schedule a psychiatric consultation.';
      break;
    default:
      summary = 'This person is seeking professional support.';
  }

  return {
    summary,
    urgency,
    keyTopics: [],
    doNotMention: [],
    presentingConcerns: [],
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// TOPICS-ONLY SUMMARY
// ============================================================================

/**
 * Generate a summary that only includes topic areas, no personal details
 */
export function generateTopicsOnlySummary(
  escalationType: EscalationType,
  urgency: TransferUrgency,
  topics: string[]
): TransferSummary {
  let summary = `**Areas of Focus**\n\n`;
  summary += `This person would like support with:\n`;

  for (const topic of topics.slice(0, 5)) {
    summary += `- ${topic}\n`;
  }

  return {
    summary,
    urgency,
    keyTopics: topics,
    doNotMention: [],
    presentingConcerns: topics,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const contextSummary = {
  generateTransferSummary,
  generateMinimalSummary,
  generateTopicsOnlySummary,
};
