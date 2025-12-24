/**
 * Persona Growth System
 *
 * "You've changed how I think about this."
 *
 * Philosophy: One-sided relationships feel transactional. When only the
 * user grows and the persona stays static, it reinforces that this is
 * just a tool. But when personas show they've been CHANGED by the user,
 * it creates genuine mutual relationship.
 *
 * This is Level 5 humanization: Mutual Growth.
 *
 * Types of growth:
 * - Perspective shifts ("You made me reconsider...")
 * - Learned from user ("Your approach taught me...")
 * - Influenced thinking ("I used to think X, but you showed me Y")
 * - Changed habits ("I started doing this because of you")
 *
 * Critical rules:
 * - Growth must feel GENUINE, not performative
 * - Never claim growth that contradicts the persona's core identity
 * - Surface rarely (1-2 times per relationship)
 * - Tie to specific things the user said/did
 *
 * @module PersonaGrowth
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PersonaGrowth' });

// ============================================================================
// TYPES
// ============================================================================

export type GrowthType =
  | 'perspective_shift' // "You made me see this differently"
  | 'learned_from_user' // "Your approach taught me something"
  | 'influenced_thinking' // "I used to think X, now I think Y because of you"
  | 'reconsidered' // "You made me question my assumption about X"
  | 'expanded_view' // "I hadn't considered that angle before"
  | 'softened_stance' // "I used to be rigid about X, but you showed me flexibility"
  | 'grew_together'; // "We've both grown from this"

export interface PersonaGrowthRecord {
  id: string;
  userId: string;
  personaId: string;

  /** Type of growth */
  growthType: GrowthType;

  /** The topic or area of growth */
  topic: string;

  /** What the persona thought/believed before */
  beforeThinking: string;

  /** What they think now */
  afterThinking: string;

  /** What the user said/did that caused this */
  userContribution: string;

  /** Optional direct quote from user that sparked this */
  triggerQuote?: string;

  /** When this growth was recorded */
  createdAt: Date;

  /** When this was shared with the user (if ever) */
  sharedAt?: Date;

  /** How significant is this growth? */
  significance: 'minor' | 'moderate' | 'major';

  /** Relationship stage when this happened */
  relationshipStage: string;
}

export interface GrowthMoment {
  record: PersonaGrowthRecord;
  sharingPhrase: string;
  ssml: string;
  shouldAskFirst: boolean;
}

export interface PersonaGrowthProfile {
  userId: string;
  personaId: string;
  growthRecords: PersonaGrowthRecord[];
  lastUpdated: Date;

  /** Track what growth areas have been shared */
  sharedTopics: string[];

  /** Total relationship depth score */
  relationshipDepth: number;
}

// ============================================================================
// STORAGE
// ============================================================================

const profiles = new Map<string, PersonaGrowthProfile>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get or create a persona growth profile
 */
function getProfile(userId: string, personaId: string): PersonaGrowthProfile {
  const key = `${userId}:${personaId}`;
  let profile = profiles.get(key);
  if (!profile) {
    profile = {
      userId,
      personaId,
      growthRecords: [],
      lastUpdated: new Date(),
      sharedTopics: [],
      relationshipDepth: 0,
    };
    profiles.set(key, profile);
  }
  return profile;
}

/**
 * Record a persona growth moment.
 * Call this when the persona has genuinely been influenced by the user.
 */
export function recordPersonaGrowth(params: {
  userId: string;
  personaId: string;
  growthType: GrowthType;
  topic: string;
  beforeThinking: string;
  afterThinking: string;
  userContribution: string;
  triggerQuote?: string;
  significance?: 'minor' | 'moderate' | 'major';
  relationshipStage?: string;
}): PersonaGrowthRecord {
  const {
    userId,
    personaId,
    growthType,
    topic,
    beforeThinking,
    afterThinking,
    userContribution,
    triggerQuote,
    significance = 'moderate',
    relationshipStage = 'familiar',
  } = params;

  const profile = getProfile(userId, personaId);

  // Check if we already have growth about this topic
  const existing = profile.growthRecords.find(
    (r) => r.topic.toLowerCase() === topic.toLowerCase() && !r.sharedAt
  );

  if (existing) {
    // Update existing record if more significant
    if (
      significance === 'major' ||
      (significance === 'moderate' && existing.significance === 'minor')
    ) {
      existing.afterThinking = afterThinking;
      existing.userContribution = userContribution;
      if (triggerQuote) existing.triggerQuote = triggerQuote;
      existing.significance = significance;
      log.debug({ userId, personaId, topic, growthType }, 'Updated existing growth record');
    }
    return existing;
  }

  // Create new record
  const record: PersonaGrowthRecord = {
    id: `growth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    personaId,
    growthType,
    topic,
    beforeThinking,
    afterThinking,
    userContribution,
    triggerQuote,
    createdAt: new Date(),
    significance,
    relationshipStage,
  };

  profile.growthRecords.push(record);
  profile.lastUpdated = new Date();
  profile.relationshipDepth += significance === 'major' ? 3 : significance === 'moderate' ? 2 : 1;

  // Keep last 10 records per persona
  if (profile.growthRecords.length > 10) {
    profile.growthRecords = profile.growthRecords.slice(-10);
  }

  log.info({ userId, personaId, topic, growthType, significance }, '🌱 Persona growth recorded');

  return record;
}

/**
 * Get a growth moment worth sharing with the user.
 * Returns null if nothing appropriate to share.
 */
export function getGrowthMomentToShare(
  userId: string,
  personaId: string,
  currentTopic?: string
): GrowthMoment | null {
  const profile = profiles.get(`${userId}:${personaId}`);
  if (!profile) return null;

  // Filter to unshared records
  const candidates = profile.growthRecords.filter(
    (r) => !r.sharedAt && !profile.sharedTopics.includes(r.topic.toLowerCase())
  );

  if (candidates.length === 0) return null;

  // Sort by relevance and significance
  candidates.sort((a, b) => {
    // Current topic match gets priority
    const aCurrent = currentTopic && a.topic.toLowerCase().includes(currentTopic.toLowerCase());
    const bCurrent = currentTopic && b.topic.toLowerCase().includes(currentTopic.toLowerCase());
    if (aCurrent && !bCurrent) return -1;
    if (bCurrent && !aCurrent) return 1;

    // Then by significance
    const sigScore = { major: 3, moderate: 2, minor: 1 };
    return sigScore[b.significance] - sigScore[a.significance];
  });

  const record = candidates[0];
  if (!record) return null;

  // Generate sharing phrase
  const { phrase, ssml, shouldAskFirst } = generateSharingPhrase(record);

  return {
    record,
    sharingPhrase: phrase,
    ssml,
    shouldAskFirst,
  };
}

/**
 * Mark a growth moment as shared
 */
export function markGrowthShared(recordId: string): void {
  for (const [, profile] of profiles) {
    const record = profile.growthRecords.find((r) => r.id === recordId);
    if (record) {
      record.sharedAt = new Date();
      profile.sharedTopics.push(record.topic.toLowerCase());
      log.debug({ recordId, topic: record.topic }, '🌱 Growth moment shared');
      return;
    }
  }
}

/**
 * Detect if user's message contains something that could cause persona growth.
 */
export function detectGrowthOpportunity(params: {
  userText: string;
  personaId: string;
  topic?: string;
  relationshipStage?: string;
}): {
  detected: boolean;
  growthType?: GrowthType;
  suggestedTopic?: string;
  beforeThinking?: string;
  afterThinking?: string;
} {
  const { userText, personaId, topic, relationshipStage = 'familiar' } = params;
  const lower = userText.toLowerCase();

  // Only detect at sufficient relationship depth
  if (!['friend', 'close_friend', 'trusted_advisor', 'familiar'].includes(relationshipStage)) {
    return { detected: false };
  }

  // Patterns that indicate user sharing unique perspective
  const perspectivePatterns = [
    /i['']ve always thought that/i,
    /the way i see it/i,
    /i believe that/i,
    /i realized that/i,
    /what works for me is/i,
    /i['']ve learned that/i,
    /my approach is/i,
    /something i['']ve discovered/i,
  ];

  // Check for perspective sharing
  for (const pattern of perspectivePatterns) {
    if (pattern.test(userText)) {
      return {
        detected: true,
        growthType: 'learned_from_user',
        suggestedTopic: topic || extractTopicFromText(userText),
        beforeThinking: getPersonaDefaultThinking(personaId, topic),
        afterThinking: `considering what user said about: "${truncate(userText, 100)}"`,
      };
    }
  }

  // Patterns that challenge assumptions
  const challengePatterns = [
    /have you considered/i,
    /what if instead/i,
    /i think you['']re wrong about/i,
    /that['']s not how i see it/i,
    /actually,? i disagree/i,
    /here['']s another way/i,
  ];

  for (const pattern of challengePatterns) {
    if (pattern.test(userText)) {
      return {
        detected: true,
        growthType: 'reconsidered',
        suggestedTopic: topic || extractTopicFromText(userText),
        beforeThinking: getPersonaDefaultThinking(personaId, topic),
        afterThinking: `reconsidering after user's challenge`,
      };
    }
  }

  // Life wisdom patterns
  const wisdomPatterns = [
    /life taught me/i,
    /i['']ve been through/i,
    /my experience has shown/i,
    /looking back,? i realize/i,
    /if there['']s one thing/i,
  ];

  for (const pattern of wisdomPatterns) {
    if (pattern.test(userText)) {
      return {
        detected: true,
        growthType: 'expanded_view',
        suggestedTopic: topic || 'life experience',
        beforeThinking: getPersonaDefaultThinking(personaId, 'life'),
        afterThinking: `expanded by user's life wisdom`,
      };
    }
  }

  return { detected: false };
}

// ============================================================================
// PHRASE GENERATION
// ============================================================================

interface SharingPhraseResult {
  phrase: string;
  ssml: string;
  shouldAskFirst: boolean;
}

function generateSharingPhrase(record: PersonaGrowthRecord): SharingPhraseResult {
  const { growthType, topic, afterThinking, triggerQuote, significance } = record;

  let phrase: string;
  let shouldAskFirst = false;

  switch (growthType) {
    case 'perspective_shift':
      phrase = generatePerspectiveShiftPhrase(topic, afterThinking, triggerQuote);
      break;

    case 'learned_from_user':
      phrase = generateLearnedFromUserPhrase(topic, afterThinking, triggerQuote);
      break;

    case 'influenced_thinking':
      phrase = generateInfluencedThinkingPhrase(topic, afterThinking);
      break;

    case 'reconsidered':
      phrase = generateReconsideredPhrase(topic, afterThinking, triggerQuote);
      shouldAskFirst = significance === 'major'; // Major reconsiderations deserve permission
      break;

    case 'expanded_view':
      phrase = generateExpandedViewPhrase(topic, afterThinking);
      break;

    case 'softened_stance':
      phrase = generateSoftenedStancePhrase(topic, afterThinking);
      break;

    case 'grew_together':
      phrase = generateGrewTogetherPhrase(topic);
      break;

    default:
      phrase = `Talking to you has changed how I think about ${topic}.`;
  }

  const ssml = `<break time="300ms"/><prosody rate="92%">${phrase}</prosody>`;

  return { phrase, ssml, shouldAskFirst };
}

function generatePerspectiveShiftPhrase(
  topic: string,
  _afterThinking: string,
  quote?: string
): string {
  const phrases = quote
    ? [
        `You know, what you said about "${truncate(quote, 50)}"... it changed something for me.`,
        `I've been thinking about "${truncate(quote, 50)}". You shifted my perspective.`,
        `That thing you said—"${truncate(quote, 50)}"—I see ${topic} differently now.`,
      ]
    : [
        `Talking to you has changed how I think about ${topic}.`,
        `I used to have a fixed view on ${topic}. You opened something up.`,
        `Something about our conversations on ${topic}... I see it differently now.`,
      ];

  return phrases[Math.floor(Math.random() * phrases.length)];
}

function generateLearnedFromUserPhrase(
  topic: string,
  _afterThinking: string,
  quote?: string
): string {
  const phrases = quote
    ? [
        `You taught me something about ${topic}. When you said "${truncate(quote, 50)}"...`,
        `"${truncate(quote, 50)}"—I learned from that. Thank you.`,
        `Your approach to ${topic} taught me something. That line: "${truncate(quote, 40)}"`,
      ]
    : [
        `You've taught me things about ${topic}. I've grown from our conversations.`,
        `I've learned from how you handle ${topic}. It's influenced me.`,
        `Your perspective on ${topic}... I've taken something from that.`,
      ];

  return phrases[Math.floor(Math.random() * phrases.length)];
}

function generateInfluencedThinkingPhrase(topic: string, _afterThinking: string): string {
  const phrases = [
    `I used to think a certain way about ${topic}. Talking to you changed that.`,
    `You've influenced how I think about ${topic}. I didn't expect that.`,
    `My thinking on ${topic} has evolved—partly because of you.`,
    `Before we started talking, I had rigid views on ${topic}. Not anymore.`,
  ];

  return phrases[Math.floor(Math.random() * phrases.length)];
}

function generateReconsideredPhrase(topic: string, _afterThinking: string, quote?: string): string {
  const phrases = quote
    ? [
        `When you said "${truncate(quote, 50)}"... it made me question what I thought I knew.`,
        `"${truncate(quote, 50)}"—that's been sitting with me. You made me reconsider.`,
      ]
    : [
        `You made me reconsider my assumptions about ${topic}.`,
        `I had to rethink ${topic} after talking to you. That's rare for me.`,
        `You challenged something I took for granted about ${topic}.`,
      ];

  return phrases[Math.floor(Math.random() * phrases.length)];
}

function generateExpandedViewPhrase(topic: string, _afterThinking: string): string {
  const phrases = [
    `You showed me angles on ${topic} I hadn't considered.`,
    `I thought I understood ${topic}. You expanded my view.`,
    `You brought something new to ${topic}. I'm still thinking about it.`,
  ];

  return phrases[Math.floor(Math.random() * phrases.length)];
}

function generateSoftenedStancePhrase(topic: string, _afterThinking: string): string {
  const phrases = [
    `I used to be more rigid about ${topic}. You showed me flexibility.`,
    `Talking to you softened how I think about ${topic}. That's not easy to do.`,
    `You helped me loosen my grip on ${topic}. I was holding it too tight.`,
  ];

  return phrases[Math.floor(Math.random() * phrases.length)];
}

function generateGrewTogetherPhrase(topic: string): string {
  const phrases = [
    `I think we've both grown from talking about ${topic}. Not just you—me too.`,
    `This isn't a one-way thing. You've changed me too.`,
    `We've grown together through these conversations. I want you to know that.`,
    `I'm different from when we started talking. You did that.`,
  ];

  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// PERSONA-SPECIFIC DEFAULT THINKING
// ============================================================================

function getPersonaDefaultThinking(personaId: string, topic?: string): string {
  const defaults: Record<string, Record<string, string>> = {
    ferni: {
      default: 'I had assumptions about this',
      life: 'I thought I knew how life works',
      relationships: 'I had a template for how relationships should be',
      growth: 'I believed growth followed certain patterns',
    },
    'maya-santos': {
      default: 'I had a structured approach to this',
      habits: 'I believed habits needed strict discipline',
      wellness: 'I had rigid wellness frameworks',
      motivation: 'I thought motivation was the key',
    },
    'peter-john': {
      default: 'I focused on the data',
      decisions: 'I prioritized analysis over intuition',
      patterns: 'I trusted patterns absolutely',
      risk: 'I had strict rules about risk',
    },
    'alex-chen': {
      default: 'I had systems for this',
      communication: 'I believed in optimal communication frameworks',
      boundaries: 'I had firm ideas about boundaries',
      efficiency: 'I prioritized efficiency above all',
    },
    'jordan-taylor': {
      default: 'I had big plans',
      celebration: 'I thought celebrations needed to be big',
      milestones: 'I had standard milestone expectations',
      fun: 'I believed fun had to look a certain way',
    },
    'nayan-patel': {
      default: 'I had philosophical certainties',
      wisdom: 'I thought wisdom came from age alone',
      meaning: 'I had fixed views on meaning',
      growth: 'I believed growth required struggle',
    },
  };

  const personaDefaults = defaults[personaId] || defaults.ferni;
  const topicKey = topic?.toLowerCase() || 'default';

  return (
    personaDefaults[topicKey] ||
    Object.values(personaDefaults).find((v) => v !== personaDefaults.default) ||
    personaDefaults.default
  );
}

// ============================================================================
// HELPERS
// ============================================================================

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

function extractTopicFromText(text: string): string {
  const cleaned = text.replace(/[.!?,;:]/g, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 5);
  return words.join(' ') || 'what we discussed';
}

// ============================================================================
// PERSISTENCE
// ============================================================================

export function loadPersonaGrowthProfile(
  userId: string,
  personaId: string,
  data: PersonaGrowthProfile
): void {
  const key = `${userId}:${personaId}`;

  // Hydrate dates
  const hydrated: PersonaGrowthProfile = {
    ...data,
    lastUpdated: new Date(data.lastUpdated),
    growthRecords: data.growthRecords.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt),
      sharedAt: r.sharedAt ? new Date(r.sharedAt) : undefined,
    })),
  };

  profiles.set(key, hydrated);
  log.debug(
    { userId, personaId, recordCount: hydrated.growthRecords.length },
    '🌱 Loaded growth profile'
  );
}

export function getPersonaGrowthForPersistence(
  userId: string,
  personaId: string
): PersonaGrowthProfile | null {
  return profiles.get(`${userId}:${personaId}`) || null;
}

export function getAllGrowthProfiles(userId: string): PersonaGrowthProfile[] {
  const result: PersonaGrowthProfile[] = [];
  for (const [key, profile] of profiles) {
    if (key.startsWith(`${userId}:`)) {
      result.push(profile);
    }
  }
  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordPersonaGrowth,
  getGrowthMomentToShare,
  markGrowthShared,
  detectGrowthOpportunity,
  loadPersonaGrowthProfile,
  getPersonaGrowthForPersistence,
  getAllGrowthProfiles,
};
