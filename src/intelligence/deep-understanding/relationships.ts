/**
 * Relational Network Intelligence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Deep understanding of the PEOPLE in the user's life - not just names,
 * but dynamics, tensions, support networks, and relational patterns.
 *
 * "You mention your sister a lot, but it sounds like there's something unresolved there."
 *
 * This is superhuman because even close friends don't track all these
 * relationships with the clarity that Ferni can.
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RelationalNetwork' });

// ============================================================================
// TYPES
// ============================================================================

export type RelationshipType =
  | 'family' // Parent, sibling, child, extended
  | 'romantic' // Partner, spouse, ex
  | 'friend' // Close friend, acquaintance
  | 'professional' // Boss, colleague, mentor
  | 'other';

export type RelationshipQuality =
  | 'supportive' // Healthy, positive
  | 'complicated' // Mixed feelings
  | 'strained' // Difficulty, tension
  | 'distant' // Emotionally disconnected
  | 'unknown';

export type DynamicType =
  | 'competition' // Rivalry, comparison
  | 'alliance' // United front
  | 'conflict' // Active tension
  | 'avoidance' // Avoiding each other
  | 'enmeshment' // Too close, unhealthy
  | 'estrangement' // Cut off
  | 'healing'; // Working on repair

export interface PersonInLife {
  /** Unique identifier */
  id: string;

  /** Name as user refers to them */
  name: string;

  /** Alternative names/references */
  aliases: string[];

  /** Relationship to user */
  relationshipType: RelationshipType;

  /** Specific role (e.g., "mother", "boss", "best friend") */
  specificRole: string;

  /** Quality of relationship */
  quality: RelationshipQuality;

  /** Topics associated with this person */
  associatedTopics: string[];

  /** Emotional tone when discussed */
  emotionalTone: {
    typical: string;
    intensity: number;
    volatility: number; // How much it varies
  };

  /** What user wants from this relationship */
  desires: string[];

  /** What's difficult about this relationship */
  challenges: string[];

  /** Key events/history */
  significantEvents: Array<{
    description: string;
    date?: Date;
    emotionalImpact: 'positive' | 'negative' | 'mixed';
    resolved: boolean;
  }>;

  /** Last mentioned */
  lastMentioned: Date;

  /** Mention frequency (mentions per conversation) */
  mentionFrequency: number;

  /** Is this person currently a source of stress? */
  currentStressSource: boolean;

  /** Is this person a support source? */
  isSupportSource: boolean;
}

export interface Triangulation {
  /** First person in the dynamic */
  person1Id: string;

  /** Second person in the dynamic */
  person2Id: string;

  /** Nature of their dynamic */
  dynamic: DynamicType;

  /** How this affects the user */
  userImpact: string;

  /** Evidence/quotes */
  evidence: string[];

  /** Confidence */
  confidence: number;
}

export interface UnspokenTension {
  /** With whom */
  personId: string;

  /** About what */
  topic: string;

  /** Last mentioned (even indirectly) */
  lastMentioned: Date;

  /** How much they avoid it (0-1) */
  avoidanceLevel: number;

  /** Signs of readiness to address */
  readinessSignals: string[];

  /** Suggested approach when ready */
  approachSuggestion: string;
}

export interface SupportNetwork {
  /** Inner circle (1-3 people they truly lean on) */
  innerCircle: string[];

  /** Outer circle (5-10 people they have some support from) */
  outerCircle: string[];

  /** Acquaintances they mention but don't rely on */
  periphery: string[];

  /** Missing roles in their support network */
  gaps: Array<{
    role: string;
    impact: string;
    detected: Date;
  }>;

  /** Overall network health */
  health: {
    score: number; // 0-1
    strengths: string[];
    vulnerabilities: string[];
  };
}

export interface RelationalNetwork {
  userId: string;

  /** All people mentioned */
  people: Map<string, PersonInLife>;

  /** Dynamics between people */
  triangulations: Triangulation[];

  /** Things they're avoiding discussing */
  unspokenTensions: UnspokenTension[];

  /** Support network analysis */
  supportNetwork: SupportNetwork;

  /** Metadata */
  metadata: {
    totalPeopleMentioned: number;
    lastUpdated: Date;
    analysisConfidence: number;
  };
}

// ============================================================================
// NETWORK STORAGE
// ============================================================================

const networks = new Map<string, RelationalNetwork>();

/**
 * Get or create relational network for user
 */
export function getRelationalNetwork(userId: string): RelationalNetwork {
  let network = networks.get(userId);

  if (!network) {
    network = createEmptyNetwork(userId);
    networks.set(userId, network);
  }

  return network;
}

function createEmptyNetwork(userId: string): RelationalNetwork {
  return {
    userId,
    people: new Map(),
    triangulations: [],
    unspokenTensions: [],
    supportNetwork: {
      innerCircle: [],
      outerCircle: [],
      periphery: [],
      gaps: [],
      health: {
        score: 0.5,
        strengths: [],
        vulnerabilities: [],
      },
    },
    metadata: {
      totalPeopleMentioned: 0,
      lastUpdated: new Date(),
      analysisConfidence: 0,
    },
  };
}

// ============================================================================
// PERSON EXTRACTION & TRACKING
// ============================================================================

/**
 * Relationship indicators in text
 */
const RELATIONSHIP_PATTERNS: Array<{
  pattern: RegExp;
  type: RelationshipType;
  role: string;
}> = [
  // Family
  { pattern: /\b(my\s+)?mom\b/i, type: 'family', role: 'mother' },
  { pattern: /\b(my\s+)?mother\b/i, type: 'family', role: 'mother' },
  { pattern: /\b(my\s+)?dad\b/i, type: 'family', role: 'father' },
  { pattern: /\b(my\s+)?father\b/i, type: 'family', role: 'father' },
  { pattern: /\b(my\s+)?brother\b/i, type: 'family', role: 'brother' },
  { pattern: /\b(my\s+)?sister\b/i, type: 'family', role: 'sister' },
  { pattern: /\b(my\s+)?son\b/i, type: 'family', role: 'son' },
  { pattern: /\b(my\s+)?daughter\b/i, type: 'family', role: 'daughter' },
  { pattern: /\b(my\s+)?grandma\b/i, type: 'family', role: 'grandmother' },
  { pattern: /\b(my\s+)?grandpa\b/i, type: 'family', role: 'grandfather' },
  { pattern: /\b(my\s+)?aunt\b/i, type: 'family', role: 'aunt' },
  { pattern: /\b(my\s+)?uncle\b/i, type: 'family', role: 'uncle' },
  { pattern: /\b(my\s+)?cousin\b/i, type: 'family', role: 'cousin' },

  // Romantic
  { pattern: /\b(my\s+)?husband\b/i, type: 'romantic', role: 'husband' },
  { pattern: /\b(my\s+)?wife\b/i, type: 'romantic', role: 'wife' },
  { pattern: /\b(my\s+)?partner\b/i, type: 'romantic', role: 'partner' },
  { pattern: /\b(my\s+)?boyfriend\b/i, type: 'romantic', role: 'boyfriend' },
  { pattern: /\b(my\s+)?girlfriend\b/i, type: 'romantic', role: 'girlfriend' },
  { pattern: /\b(my\s+)?ex\b/i, type: 'romantic', role: 'ex' },
  { pattern: /\b(my\s+)?fianc[ée]/i, type: 'romantic', role: 'fiancé' },

  // Professional
  { pattern: /\b(my\s+)?boss\b/i, type: 'professional', role: 'boss' },
  { pattern: /\b(my\s+)?manager\b/i, type: 'professional', role: 'manager' },
  { pattern: /\b(my\s+)?coworker\b/i, type: 'professional', role: 'coworker' },
  { pattern: /\b(my\s+)?colleague\b/i, type: 'professional', role: 'colleague' },
  { pattern: /\b(my\s+)?mentor\b/i, type: 'professional', role: 'mentor' },
  { pattern: /\b(my\s+)?therapist\b/i, type: 'professional', role: 'therapist' },

  // Friends
  { pattern: /\b(my\s+)?best\s+friend\b/i, type: 'friend', role: 'best friend' },
  { pattern: /\b(my\s+)?friend\s+(\w+)\b/i, type: 'friend', role: 'friend' },
  { pattern: /\b(my\s+)?roommate\b/i, type: 'friend', role: 'roommate' },
];

/**
 * Extract person mentions from text
 */
export function extractPersonMentions(
  text: string,
  emotion: string,
  emotionIntensity: number
): Array<{
  name: string;
  type: RelationshipType;
  role: string;
  contextSnippet: string;
  emotionalTone: string;
}> {
  const mentions: Array<{
    name: string;
    type: RelationshipType;
    role: string;
    contextSnippet: string;
    emotionalTone: string;
  }> = [];

  for (const { pattern, type, role } of RELATIONSHIP_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Get surrounding context
      const start = Math.max(0, match.index! - 50);
      const end = Math.min(text.length, match.index! + match[0].length + 50);
      const contextSnippet = text.slice(start, end);

      mentions.push({
        name: role, // Use role as default name
        type,
        role,
        contextSnippet,
        emotionalTone: emotion,
      });
    }
  }

  // Also look for proper names with possessive context
  const namePattern = /\b(my|our)\s+([A-Z][a-z]+)\b/g;
  let nameMatch;
  while ((nameMatch = namePattern.exec(text)) !== null) {
    const name = nameMatch[2];
    // Skip if it's a common word
    if (['Monday', 'Tuesday', 'God', 'Lord'].includes(name)) continue;

    const start = Math.max(0, nameMatch.index - 50);
    const end = Math.min(text.length, nameMatch.index + nameMatch[0].length + 50);

    mentions.push({
      name,
      type: 'other',
      role: 'mentioned person',
      contextSnippet: text.slice(start, end),
      emotionalTone: emotion,
    });
  }

  return mentions;
}

/**
 * Update or create a person in the network
 */
export function recordPersonMention(
  userId: string,
  mention: {
    name: string;
    type: RelationshipType;
    role: string;
    contextSnippet: string;
    emotionalTone: string;
    emotionIntensity: number;
    topics: string[];
    wasPositive: boolean;
    wasStressed: boolean;
  }
): PersonInLife {
  const network = getRelationalNetwork(userId);

  // Find existing person or create new
  let person = findPersonByNameOrRole(network, mention.name, mention.role);

  if (!person) {
    const id = `person_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    person = {
      id,
      name: mention.name,
      aliases: [],
      relationshipType: mention.type,
      specificRole: mention.role,
      quality: 'unknown',
      associatedTopics: [],
      emotionalTone: {
        typical: mention.emotionalTone,
        intensity: mention.emotionIntensity,
        volatility: 0,
      },
      desires: [],
      challenges: [],
      significantEvents: [],
      lastMentioned: new Date(),
      mentionFrequency: 0,
      currentStressSource: false,
      isSupportSource: false,
    };
    network.people.set(id, person);
    network.metadata.totalPeopleMentioned++;
  }

  // Update person
  person.lastMentioned = new Date();
  person.mentionFrequency = person.mentionFrequency * 0.9 + 0.1;

  // Update emotional tone with moving average
  const alpha = 0.3;
  person.emotionalTone.intensity =
    alpha * mention.emotionIntensity + (1 - alpha) * person.emotionalTone.intensity;

  // Track volatility (how much emotional tone varies)
  const toneDiff = Math.abs(
    getEmotionValence(mention.emotionalTone) - getEmotionValence(person.emotionalTone.typical)
  );
  person.emotionalTone.volatility =
    alpha * toneDiff + (1 - alpha) * person.emotionalTone.volatility;
  person.emotionalTone.typical = mention.emotionalTone;

  // Update topics
  for (const topic of mention.topics) {
    if (!person.associatedTopics.includes(topic)) {
      person.associatedTopics.push(topic);
      if (person.associatedTopics.length > 10) {
        person.associatedTopics.shift();
      }
    }
  }

  // Update stress/support status
  if (mention.wasStressed && mention.emotionIntensity > 0.5) {
    person.currentStressSource = true;
  }
  if (mention.wasPositive && mention.emotionIntensity > 0.5) {
    person.isSupportSource = true;
  }

  // Update relationship quality based on patterns
  updateRelationshipQuality(person, mention);

  network.metadata.lastUpdated = new Date();

  log.debug(
    { userId, personName: person.name, role: person.specificRole },
    '👤 Person mention recorded'
  );

  return person;
}

/**
 * Find person by name or role
 */
function findPersonByNameOrRole(
  network: RelationalNetwork,
  name: string,
  role: string
): PersonInLife | undefined {
  for (const person of network.people.values()) {
    if (
      person.name.toLowerCase() === name.toLowerCase() ||
      person.specificRole.toLowerCase() === role.toLowerCase() ||
      person.aliases.some((a) => a.toLowerCase() === name.toLowerCase())
    ) {
      return person;
    }
  }
  return undefined;
}

/**
 * Get emotion valence (-1 to 1)
 */
function getEmotionValence(emotion: string): number {
  const valenceMap: Record<string, number> = {
    happy: 0.8,
    excited: 0.9,
    grateful: 0.7,
    love: 0.9,
    neutral: 0,
    sad: -0.6,
    angry: -0.7,
    anxious: -0.5,
    frustrated: -0.5,
    fearful: -0.7,
    guilty: -0.4,
    ashamed: -0.5,
  };
  return valenceMap[emotion.toLowerCase()] || 0;
}

/**
 * Update relationship quality based on mention patterns
 */
function updateRelationshipQuality(
  person: PersonInLife,
  mention: {
    emotionalTone: string;
    emotionIntensity: number;
    wasPositive: boolean;
    wasStressed: boolean;
  }
): void {
  // High volatility suggests complicated relationship
  if (person.emotionalTone.volatility > 0.4) {
    person.quality = 'complicated';
    return;
  }

  // Consistently negative suggests strained
  if (
    getEmotionValence(person.emotionalTone.typical) < -0.3 &&
    person.emotionalTone.intensity > 0.5
  ) {
    person.quality = 'strained';
    return;
  }

  // Consistently positive suggests supportive
  if (
    getEmotionValence(person.emotionalTone.typical) > 0.3 &&
    person.emotionalTone.intensity > 0.3
  ) {
    person.quality = 'supportive';
    return;
  }

  // Low intensity/frequency suggests distant
  if (person.mentionFrequency < 0.1 && person.emotionalTone.intensity < 0.3) {
    person.quality = 'distant';
    return;
  }
}

// ============================================================================
// TENSION & DYNAMIC DETECTION
// ============================================================================

/**
 * Detect unspoken tensions
 */
const TENSION_PATTERNS = [
  /i('ve)?\s+(never|haven't)\s+(told|talked\s+to)\s+(them|him|her|my)/i,
  /we\s+don't\s+(talk|discuss|mention)/i,
  /i\s+should\s+(probably|really)\s+(talk|tell)/i,
  /i('ve)?\s+been\s+(avoiding|putting\s+off)/i,
  /it's\s+(awkward|uncomfortable|difficult)/i,
  /i\s+don't\s+know\s+how\s+to\s+(bring|tell|talk)/i,
  /there's\s+something\s+i('ve)?\s+(never|haven't)/i,
];

/**
 * Detect unspoken tension in text
 */
export function detectUnspokenTension(
  userId: string,
  text: string,
  mentionedPerson: PersonInLife | null,
  topics: string[]
): UnspokenTension | null {
  const hasTensionPattern = TENSION_PATTERNS.some((p) => p.test(text));
  if (!hasTensionPattern || !mentionedPerson) return null;

  const network = getRelationalNetwork(userId);

  // Check if we already have this tension
  const existing = network.unspokenTensions.find(
    (t) => t.personId === mentionedPerson.id && topics.some((topic) => t.topic.includes(topic))
  );

  if (existing) {
    existing.lastMentioned = new Date();
    existing.avoidanceLevel = Math.min(1, existing.avoidanceLevel + 0.1);
    return existing;
  }

  // Create new tension
  const tension: UnspokenTension = {
    personId: mentionedPerson.id,
    topic: topics[0] || 'unspecified',
    lastMentioned: new Date(),
    avoidanceLevel: 0.5,
    readinessSignals: [],
    approachSuggestion: generateApproachSuggestion(mentionedPerson, topics[0]),
  };

  network.unspokenTensions.push(tension);

  log.info(
    { userId, personName: mentionedPerson.name, topic: tension.topic },
    '🔒 Unspoken tension detected'
  );

  return tension;
}

/**
 * Generate suggestion for approaching a tension
 */
function generateApproachSuggestion(person: PersonInLife, topic: string): string {
  if (person.quality === 'strained') {
    return `When ready, consider starting with your feelings rather than accusations. "I've been feeling..." is gentler than "You always..."`;
  }
  if (person.quality === 'distant') {
    return `Sometimes reaching out to reconnect first makes the harder conversation easier later.`;
  }
  return `There's no perfect time for difficult conversations. When you're ready, Ferni can help you think through what you want to say.`;
}

// ============================================================================
// SUPPORT NETWORK ANALYSIS
// ============================================================================

/**
 * Analyze and update support network
 */
export function analyzeSupportNetwork(userId: string): SupportNetwork {
  const network = getRelationalNetwork(userId);

  // Reset
  network.supportNetwork.innerCircle = [];
  network.supportNetwork.outerCircle = [];
  network.supportNetwork.periphery = [];
  network.supportNetwork.gaps = [];

  // Categorize people
  for (const person of network.people.values()) {
    if (person.isSupportSource && person.mentionFrequency > 0.3) {
      network.supportNetwork.innerCircle.push(person.id);
    } else if (person.isSupportSource || person.quality === 'supportive') {
      network.supportNetwork.outerCircle.push(person.id);
    } else if (person.mentionFrequency > 0.05) {
      network.supportNetwork.periphery.push(person.id);
    }
  }

  // Detect gaps
  const hasTherapist = [...network.people.values()].some((p) => p.specificRole === 'therapist');
  const hasMentor = [...network.people.values()].some((p) => p.specificRole === 'mentor');
  const hasCloseFamily =
    network.supportNetwork.innerCircle.some((id) => {
      const p = network.people.get(id);
      return p?.relationshipType === 'family';
    }) ||
    network.supportNetwork.outerCircle.some((id) => {
      const p = network.people.get(id);
      return p?.relationshipType === 'family' && p?.quality === 'supportive';
    });
  const hasCloseFriends = network.supportNetwork.innerCircle.length >= 1;

  if (!hasCloseFriends && !hasCloseFamily) {
    network.supportNetwork.gaps.push({
      role: 'close confidant',
      impact: 'No one to lean on during difficult times',
      detected: new Date(),
    });
  }

  if (!hasMentor) {
    network.supportNetwork.gaps.push({
      role: 'mentor/guide',
      impact: 'Missing wisdom and guidance from someone ahead on the path',
      detected: new Date(),
    });
  }

  // Calculate health score
  const innerCircleScore = Math.min(network.supportNetwork.innerCircle.length / 2, 1) * 0.4;
  const outerCircleScore = Math.min(network.supportNetwork.outerCircle.length / 5, 1) * 0.3;
  const gapPenalty = network.supportNetwork.gaps.length * 0.15;
  const qualityBonus =
    [...network.people.values()].filter((p) => p.quality === 'supportive').length * 0.05;

  network.supportNetwork.health.score = Math.max(
    0,
    Math.min(1, innerCircleScore + outerCircleScore - gapPenalty + qualityBonus)
  );

  // Identify strengths and vulnerabilities
  if (network.supportNetwork.innerCircle.length >= 2) {
    network.supportNetwork.health.strengths.push('Strong inner circle of support');
  }
  if (hasCloseFamily) {
    network.supportNetwork.health.strengths.push('Supportive family connections');
  }
  if (network.supportNetwork.gaps.length > 0) {
    network.supportNetwork.health.vulnerabilities.push(
      ...network.supportNetwork.gaps.map((g) => g.role)
    );
  }

  return network.supportNetwork;
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

export interface RelationalInsight {
  type: 'pattern' | 'tension' | 'support_gap' | 'dynamic';
  subject: string; // Person or relationship
  observation: string;
  suggestedApproach: string;
  confidence: number;
  shouldSurface: boolean;
  surfacePhrase?: string;
}

/**
 * Generate insights about relational patterns
 */
export function generateRelationalInsights(userId: string): RelationalInsight[] {
  const network = getRelationalNetwork(userId);
  const insights: RelationalInsight[] = [];

  // Pattern: Frequently mentioned but complicated
  for (const person of network.people.values()) {
    if (
      person.mentionFrequency > 0.3 &&
      (person.quality === 'complicated' || person.quality === 'strained')
    ) {
      insights.push({
        type: 'pattern',
        subject: person.name,
        observation: `${person.name} comes up often in conversation, and there seems to be some complexity there.`,
        suggestedApproach:
          "Acknowledge the complexity without pushing. Let them lead when they're ready.",
        confidence: 0.7,
        shouldSurface: person.emotionalTone.intensity > 0.5,
        surfacePhrase: `You mention ${person.specificRole === person.name ? 'them' : `your ${person.specificRole}`} a lot. It sounds like there's a lot going on there.`,
      });
    }
  }

  // Tension: Long-unaddressed
  for (const tension of network.unspokenTensions) {
    const daysSinceMention = (Date.now() - tension.lastMentioned.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceMention < 30 && tension.avoidanceLevel > 0.6) {
      const person = network.people.get(tension.personId);
      if (person) {
        insights.push({
          type: 'tension',
          subject: person.name,
          observation: `There's something unspoken with ${person.name} about ${tension.topic}.`,
          suggestedApproach: tension.approachSuggestion,
          confidence: tension.avoidanceLevel,
          shouldSurface: tension.readinessSignals.length > 0,
          surfacePhrase: `I've noticed you've been circling around something with ${person.specificRole}. No pressure, but I'm here when you're ready.`,
        });
      }
    }
  }

  // Support gap insights
  if (network.supportNetwork.gaps.length > 0) {
    for (const gap of network.supportNetwork.gaps) {
      insights.push({
        type: 'support_gap',
        subject: gap.role,
        observation: `Missing ${gap.role} in support network.`,
        suggestedApproach: `Gently explore - do they want this? Are there barriers?`,
        confidence: 0.6,
        shouldSurface: false, // Don't surface support gaps directly
      });
    }
  }

  return insights;
}

/**
 * Format insights for prompt injection
 */
export function formatRelationalInsightsForPrompt(
  userId: string,
  currentPersonMentioned?: string
): string | null {
  const insights = generateRelationalInsights(userId);
  const network = getRelationalNetwork(userId);

  if (insights.length === 0) return null;

  const lines = ['[RELATIONAL AWARENESS]'];

  // If someone specific was mentioned
  if (currentPersonMentioned) {
    const person = findPersonByNameOrRole(network, currentPersonMentioned, currentPersonMentioned);
    if (person) {
      lines.push(`This person (${person.specificRole}) is ${person.quality} in quality.`);
      if (person.currentStressSource) {
        lines.push('Currently a source of stress.');
      }
      if (person.emotionalTone.volatility > 0.4) {
        lines.push('Emotional tone varies - complicated relationship.');
      }
    }
  }

  // Add most relevant insight
  const relevantInsight = currentPersonMentioned
    ? insights.find((i) => i.subject.toLowerCase().includes(currentPersonMentioned.toLowerCase()))
    : insights[0];

  if (relevantInsight && relevantInsight.shouldSurface) {
    lines.push(`Insight: ${relevantInsight.observation}`);
    lines.push(`Approach: ${relevantInsight.suggestedApproach}`);
    if (relevantInsight.surfacePhrase) {
      lines.push(`Consider: "${relevantInsight.surfacePhrase}"`);
    }
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

// ============================================================================
// IMPORT/EXPORT (for persistence)
// ============================================================================

/**
 * Import a relational network into memory (for persistence)
 */
export function importRelationalNetwork(network: RelationalNetwork): void {
  // Convert people array back to Map if needed
  if (Array.isArray(network.people)) {
    const peopleMap = new Map<string, PersonInLife>();
    for (const person of network.people) {
      peopleMap.set(person.id, person);
    }
    network.people = peopleMap;
  }
  networks.set(network.userId, network);
}

// ============================================================================
// RESET (for testing)
// ============================================================================

/**
 * Reset all relational network state (for testing)
 */
export function resetRelationalNetwork(): void {
  networks.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getRelationalNetwork,
  extractPersonMentions,
  recordPersonMention,
  detectUnspokenTension,
  analyzeSupportNetwork,
  generateRelationalInsights,
  formatRelationalInsightsForPrompt,
  resetRelationalNetwork,
};
