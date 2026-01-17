/**
 * Social Graph Intelligence Service
 *
 * Tracks relationships mentioned in conversations to provide superhuman
 * relationship awareness without accessing actual messages or contacts.
 *
 * Privacy-First Approach:
 * - Only tracks names mentioned IN CONVERSATION with Ferni
 * - Never accesses call logs, messages, or contacts directly
 * - User explicitly confirms relationship importance
 * - All data deletable on request
 *
 * Superhuman Capabilities:
 * - "You haven't mentioned Sarah in 3 weeks - everything okay?"
 * - "You always seem happier after talking to your brother"
 * - "Today's your mom's birthday - how are you feeling about it?"
 *
 * @module services/social-graph
 */

import { createLogger } from '../../utils/safe-logger.js';
import { onCorrelationInsightChange } from '../data-layer/hooks/better-than-human-hooks.js';
import { onRelationshipNetworkChange } from '../data-layer/hooks/superhuman-hooks.js';

const log = createLogger({ module: 'SocialGraph' });

// ============================================================================
// TYPES
// ============================================================================

export type RelationshipType =
  | 'family'
  | 'friend'
  | 'partner'
  | 'coworker'
  | 'acquaintance'
  | 'professional'
  | 'unknown';

export interface Person {
  id: string;
  name: string;
  aliases: string[]; // "mom", "mother", "mama" -> same person
  relationship: RelationshipType;
  importance: number; // 0-1 based on mention frequency and emotional weight
  /** Important dates (birthdays, anniversaries) */
  importantDates: Array<{
    date: string; // MM-DD format
    type: 'birthday' | 'anniversary' | 'memorial' | 'other';
    label?: string;
  }>;
  /** Last time this person was mentioned */
  lastMentioned: Date;
  /** Total mention count */
  mentionCount: number;
  /** Average sentiment when discussing this person */
  averageSentiment: number;
  /** Topics often discussed about this person */
  associatedTopics: string[];
  /** Notes about the relationship */
  notes: string[];
  /** User-confirmed important person */
  isConfirmedImportant: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Mention {
  personId: string;
  timestamp: Date;
  sentiment: number; // -1 to 1
  context: string; // Brief snippet
  topics: string[];
  emotionalWeight: number; // How emotionally significant
}

export interface RelationshipPattern {
  personId: string;
  personName: string;
  pattern: 'positive_correlation' | 'negative_correlation' | 'neutral';
  description: string;
  confidence: number;
}

export interface WithdrawalAlert {
  personId: string;
  personName: string;
  daysSinceLastMention: number;
  usualFrequencyDays: number;
  significance: 'low' | 'medium' | 'high';
  suggestion: string;
}

export interface ImportantDate {
  personId: string;
  personName: string;
  date: Date;
  type: 'birthday' | 'anniversary' | 'memorial' | 'other';
  label?: string;
  daysUntil: number;
}

export interface SocialInsight {
  type: 'withdrawal' | 'pattern' | 'date' | 'sentiment';
  insight: string;
  suggestion?: string;
  personName: string;
  urgency: 'low' | 'medium' | 'high';
}

// ============================================================================
// STATE
// ============================================================================

interface UserSocialGraph {
  userId: string;
  people: Map<string, Person>;
  mentions: Mention[];
  patterns: RelationshipPattern[];
  lastAnalysis: Date;
}

const userGraphs = new Map<string, UserSocialGraph>();

// Common relationship aliases
const RELATIONSHIP_ALIASES: Record<string, string[]> = {
  mother: ['mom', 'mama', 'mum', 'mommy', 'ma'],
  father: ['dad', 'papa', 'daddy', 'pa', 'pops'],
  sibling: ['brother', 'sister', 'bro', 'sis'],
  partner: ['husband', 'wife', 'boyfriend', 'girlfriend', 'spouse', 'partner', 'significant other'],
  child: ['son', 'daughter', 'kid', 'kiddo'],
  friend: ['bestie', 'best friend', 'buddy', 'pal'],
  boss: ['manager', 'supervisor', 'boss'],
  therapist: ['therapist', 'counselor', 'shrink', 'doctor'],
};

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record a person mention from conversation
 */
export function recordMention(
  userId: string,
  name: string,
  context: string,
  sentiment: number,
  topics: string[] = [],
  emotionalWeight = 0.5
): Person {
  const graph = getOrCreateGraph(userId);

  // Find or create person
  let person = findPersonByName(graph, name);

  if (!person) {
    person = createPerson(name);
    graph.people.set(person.id, person);
    log.debug({ userId, name }, 'New person added to social graph');
  }

  // Update person
  person.lastMentioned = new Date();
  person.mentionCount++;
  person.averageSentiment =
    (person.averageSentiment * (person.mentionCount - 1) + sentiment) / person.mentionCount;
  person.updatedAt = new Date();

  // Add associated topics
  for (const topic of topics) {
    if (!person.associatedTopics.includes(topic)) {
      person.associatedTopics.push(topic);
      if (person.associatedTopics.length > 10) {
        person.associatedTopics.shift();
      }
    }
  }

  // Record mention
  const mention: Mention = {
    personId: person.id,
    timestamp: new Date(),
    sentiment,
    context: context.slice(0, 200), // Limit context length
    topics,
    emotionalWeight,
  };
  graph.mentions.push(mention);

  // Keep last 1000 mentions
  if (graph.mentions.length > 1000) {
    graph.mentions = graph.mentions.slice(-1000);
  }

  // Update importance based on mention frequency and emotional weight
  updateImportance(graph, person.id);

  return person;
}

/**
 * Extract names from conversation text
 */
export function extractNames(text: string): Array<{ name: string; context: string }> {
  const results: Array<{ name: string; context: string }> = [];

  // Common patterns for name detection
  const patterns = [
    // "my [relationship] [name]" - e.g., "my friend Sarah"
    /my\s+(mom|dad|mother|father|brother|sister|friend|boss|partner|husband|wife|boyfriend|girlfriend|son|daughter|therapist)\s+(\w+)/gi,
    // "[name] is my [relationship]"
    /(\w+)\s+is\s+my\s+(mom|dad|mother|father|brother|sister|friend|boss|partner)/gi,
    // "talking to [name]"
    /talk(?:ing|ed)?\s+(?:to|with)\s+(\w+)/gi,
    // "called [name]"
    /called\s+(\w+)/gi,
    // "[name] said"
    /(\w+)\s+said/gi,
    // "with [name]" at word boundary
    /\bwith\s+([A-Z][a-z]+)\b/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[match.length - 1] || match[1];
      // ISSUE-006 FIX: Use stricter name validation to filter speech recognition errors
      if (name && isLikelyRealName(name)) {
        // Get surrounding context
        const start = Math.max(0, match.index - 30);
        const end = Math.min(text.length, match.index + match[0].length + 30);
        const context = text.slice(start, end);

        results.push({ name, context });
      }
    }
  }

  // Also check for relationship words that might indicate a person
  const relationshipMentions = text.match(
    /\b(my\s+)?(mom|dad|mother|father|brother|sister|boss|therapist|partner|husband|wife)\b/gi
  );
  if (relationshipMentions) {
    for (const mention of relationshipMentions) {
      const normalized = mention.replace(/^my\s+/i, '').toLowerCase();
      // Find parent alias group
      for (const [canonical, aliases] of Object.entries(RELATIONSHIP_ALIASES)) {
        if (aliases.includes(normalized) || normalized === canonical) {
          results.push({
            name: normalized.charAt(0).toUpperCase() + normalized.slice(1),
            context: text.slice(
              Math.max(0, text.indexOf(mention) - 30),
              Math.min(text.length, text.indexOf(mention) + mention.length + 30)
            ),
          });
          break;
        }
      }
    }
  }

  return results;
}

function isCommonWord(word: string): boolean {
  // Comprehensive list of words that should NOT be treated as names
  // Includes common words, speech recognition errors, and filler words
  const commonWords = new Set([
    // Pronouns
    'i',
    'me',
    'my',
    'mine',
    'myself',
    'you',
    'your',
    'yours',
    'yourself',
    'he',
    'him',
    'his',
    'she',
    'her',
    'hers',
    'we',
    'us',
    'our',
    'ours',
    'they',
    'them',
    'their',
    'theirs',
    'it',
    'its',
    // Demonstratives
    'this',
    'that',
    'these',
    'those',
    // Articles
    'the',
    'a',
    'an',
    // Conjunctions
    'and',
    'or',
    'but',
    'so',
    'yet',
    'for',
    'nor',
    // Common adverbs
    'just',
    'really',
    'very',
    'quite',
    'always',
    'never',
    'often',
    'sometimes',
    'usually',
    'actually',
    'basically',
    'literally',
    'probably',
    'maybe',
    'perhaps',
    // Time words
    'today',
    'yesterday',
    'tomorrow',
    'now',
    'then',
    'soon',
    'later',
    'always',
    'never',
    // Place words
    'here',
    'there',
    'where',
    'somewhere',
    'anywhere',
    'everywhere',
    'nowhere',
    // Question words
    'what',
    'when',
    'where',
    'why',
    'how',
    'which',
    'who',
    'whom',
    'whose',
    // COMMON SPEECH RECOGNITION ERRORS (ISSUE-006 fix)
    'bought',
    'brought',
    'thought',
    'got',
    'going',
    'gonna',
    'wanna',
    'gotta',
    'kinda',
    'sorta',
    'hear',
    'heard',
    // Common verbs often misrecognized as names
    'said',
    'says',
    'told',
    'asked',
    'called',
    'went',
    'came',
    'made',
    'took',
    'gave',
    'had',
    'has',
    'have',
    'been',
    'being',
    'was',
    'were',
    'are',
    'is',
    'will',
    'would',
    'could',
    'should',
    'might',
    'must',
    'shall',
    'can',
    'may',
    // Interjections
    'oh',
    'ah',
    'um',
    'uh',
    'hmm',
    'wow',
    'ooh',
    'oops',
    'yeah',
    'yep',
    'nope',
    'okay',
    'ok',
    'well',
    'like',
    // Generic nouns
    'thing',
    'things',
    'stuff',
    'something',
    'nothing',
    'everything',
    'someone',
    'anyone',
    'everyone',
    'nobody',
    'somebody',
    'anybody',
    'everybody',
    'people',
    'person',
    'way',
    'time',
    'day',
    'week',
    'month',
    'year',
  ]);
  return commonWords.has(word.toLowerCase());
}

/**
 * Additional validation for potential names
 * Catches edge cases that isCommonWord might miss
 */
function isLikelyRealName(word: string): boolean {
  if (!word || word.length < 2) return false;

  // Must start with a letter
  if (!/^[A-Za-z]/.test(word)) return false;

  // Names are typically 2-15 characters
  if (word.length > 15) return false;

  // Reject if all lowercase (names typically have first letter capitalized in proper context)
  // But allow this since transcription might lowercase everything

  // Reject if it looks like a verb ending (-ing, -ed, -tion)
  if (/(?:ing|ed|tion|ness|ment|able|ible|ous|ive|ful|less)$/i.test(word)) {
    return false;
  }

  return !isCommonWord(word);
}

// ============================================================================
// RELATIONSHIP ANALYSIS
// ============================================================================

/**
 * Detect withdrawal - when someone important hasn't been mentioned
 */
export function detectWithdrawal(userId: string): WithdrawalAlert[] {
  const graph = userGraphs.get(userId);
  if (!graph) return [];

  const alerts: WithdrawalAlert[] = [];
  const now = new Date();

  for (const person of graph.people.values()) {
    // Only check important or confirmed people
    if (!person.isConfirmedImportant && person.importance < 0.5) continue;

    const daysSinceLastMention = Math.floor(
      (now.getTime() - person.lastMentioned.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Calculate usual frequency from mentions
    const personMentions = graph.mentions.filter((m) => m.personId === person.id);
    const usualFrequencyDays = calculateUsualFrequency(personMentions);

    // Alert if significantly longer than usual
    if (daysSinceLastMention > usualFrequencyDays * 2 && daysSinceLastMention > 7) {
      alerts.push({
        personId: person.id,
        personName: person.name,
        daysSinceLastMention,
        usualFrequencyDays: Math.round(usualFrequencyDays),
        significance:
          person.importance > 0.8 || person.isConfirmedImportant
            ? 'high'
            : person.importance > 0.5
              ? 'medium'
              : 'low',
        suggestion: `You haven't mentioned ${person.name} in ${daysSinceLastMention} days - everything okay?`,
      });
    }
  }

  return alerts.sort((a, b) => {
    const sigOrder = { high: 0, medium: 1, low: 2 };
    return sigOrder[a.significance] - sigOrder[b.significance];
  });
}

function calculateUsualFrequency(mentions: Mention[]): number {
  if (mentions.length < 2) return 14; // Default 2 weeks

  // Calculate average gap between mentions
  const gaps: number[] = [];
  for (let i = 1; i < mentions.length; i++) {
    const gap =
      (mentions[i].timestamp.getTime() - mentions[i - 1].timestamp.getTime()) /
      (1000 * 60 * 60 * 24);
    gaps.push(gap);
  }

  return gaps.reduce((a, b) => a + b, 0) / gaps.length;
}

/**
 * Detect sentiment patterns - who makes the user happy/stressed
 */
export function detectSentimentPatterns(userId: string): RelationshipPattern[] {
  const graph = userGraphs.get(userId);
  if (!graph) return [];

  const patterns: RelationshipPattern[] = [];

  for (const person of graph.people.values()) {
    const personMentions = graph.mentions.filter((m) => m.personId === person.id);
    if (personMentions.length < 3) continue;

    const avgSentiment =
      personMentions.reduce((sum, m) => sum + m.sentiment, 0) / personMentions.length;

    if (avgSentiment > 0.3) {
      patterns.push({
        personId: person.id,
        personName: person.name,
        pattern: 'positive_correlation',
        description: `You always seem happier when talking about ${person.name}`,
        confidence: Math.min(0.9, 0.5 + personMentions.length * 0.1),
      });
    } else if (avgSentiment < -0.3) {
      patterns.push({
        personId: person.id,
        personName: person.name,
        pattern: 'negative_correlation',
        description: `Conversations about ${person.name} tend to be heavier`,
        confidence: Math.min(0.9, 0.5 + personMentions.length * 0.1),
      });
    }
  }

  graph.patterns = patterns;
  graph.lastAnalysis = new Date();

  return patterns;
}

/**
 * Get upcoming important dates
 */
export function getUpcomingDates(userId: string, daysAhead = 7): ImportantDate[] {
  const graph = userGraphs.get(userId);
  if (!graph) return [];

  const dates: ImportantDate[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();

  for (const person of graph.people.values()) {
    for (const dateInfo of person.importantDates) {
      const [month, day] = dateInfo.date.split('-').map(Number);
      const thisYearDate = new Date(currentYear, month - 1, day);

      // If date has passed this year, check next year
      if (thisYearDate < now) {
        thisYearDate.setFullYear(currentYear + 1);
      }

      const daysUntil = Math.ceil((thisYearDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil >= 0 && daysUntil <= daysAhead) {
        dates.push({
          personId: person.id,
          personName: person.name,
          date: thisYearDate,
          type: dateInfo.type,
          label: dateInfo.label,
          daysUntil,
        });
      }
    }
  }

  return dates.sort((a, b) => a.daysUntil - b.daysUntil);
}

/**
 * Add important date for a person
 */
export function addImportantDate(
  userId: string,
  personName: string,
  date: string, // MM-DD format
  type: 'birthday' | 'anniversary' | 'memorial' | 'other',
  label?: string
): boolean {
  const graph = userGraphs.get(userId);
  if (!graph) return false;

  const person = findPersonByName(graph, personName);
  if (!person) return false;

  // Check for duplicate
  const exists = person.importantDates.some((d) => d.date === date && d.type === type);
  if (exists) return false;

  person.importantDates.push({ date, type, label });
  person.updatedAt = new Date();

  log.info({ userId, personName, date, type }, 'Important date added');
  return true;
}

// ============================================================================
// INSIGHTS GENERATION
// ============================================================================

/**
 * Generate social insights for context injection
 */
export function generateSocialInsights(userId: string): SocialInsight[] {
  const insights: SocialInsight[] = [];

  // Check for withdrawal
  const withdrawals = detectWithdrawal(userId);
  for (const alert of withdrawals.slice(0, 2)) {
    insights.push({
      type: 'withdrawal',
      insight: alert.suggestion,
      personName: alert.personName,
      urgency: alert.significance,
    });
  }

  // Check upcoming dates
  const dates = getUpcomingDates(userId, 3);
  for (const date of dates) {
    const dayText =
      date.daysUntil === 0
        ? 'Today'
        : date.daysUntil === 1
          ? 'Tomorrow'
          : `In ${date.daysUntil} days`;
    insights.push({
      type: 'date',
      insight: `${dayText} is ${date.personName}'s ${date.type}${date.label ? ` (${date.label})` : ''}`,
      suggestion: `Want to talk about how you're feeling about it?`,
      personName: date.personName,
      urgency: date.daysUntil === 0 ? 'high' : date.daysUntil <= 1 ? 'medium' : 'low',
    });
  }

  // Include sentiment patterns
  const patterns = detectSentimentPatterns(userId);
  for (const pattern of patterns.slice(0, 1)) {
    if (pattern.pattern === 'positive_correlation') {
      insights.push({
        type: 'pattern',
        insight: pattern.description,
        personName: pattern.personName,
        urgency: 'low',
      });
    }
  }

  return insights;
}

/**
 * Generate superhuman social moment
 */
export function generateSuperhumanMoment(userId: string): string | null {
  const moments: string[] = [];

  // Withdrawal detection
  const withdrawals = detectWithdrawal(userId);
  for (const alert of withdrawals.filter((a) => a.significance === 'high')) {
    moments.push(alert.suggestion);
  }

  // Upcoming important dates
  const dates = getUpcomingDates(userId, 1);
  for (const date of dates) {
    if (date.type === 'birthday') {
      moments.push(
        `Today's ${date.personName}'s birthday - want to talk about how you're feeling?`
      );
    } else if (date.type === 'memorial') {
      moments.push(
        `I noticed today might be significant regarding ${date.personName}. I'm here if you want to talk.`
      );
    }
  }

  // Positive relationship pattern
  const patterns = detectSentimentPatterns(userId);
  const positivePattern = patterns.find((p) => p.pattern === 'positive_correlation');
  if (positivePattern && Math.random() < 0.3) {
    moments.push(positivePattern.description);
  }

  return moments.length > 0 ? moments[Math.floor(Math.random() * moments.length)] : null;
}

// ============================================================================
// HELPERS
// ============================================================================

function getOrCreateGraph(userId: string): UserSocialGraph {
  let graph = userGraphs.get(userId);
  if (!graph) {
    graph = {
      userId,
      people: new Map(),
      mentions: [],
      patterns: [],
      lastAnalysis: new Date(0),
    };
    userGraphs.set(userId, graph);
  }
  return graph;
}

function findPersonByName(graph: UserSocialGraph, name: string): Person | undefined {
  const normalized = name.toLowerCase();

  for (const person of graph.people.values()) {
    if (person.name.toLowerCase() === normalized) return person;
    if (person.aliases.some((a) => a.toLowerCase() === normalized)) return person;
  }

  // Check relationship aliases
  for (const [canonical, aliases] of Object.entries(RELATIONSHIP_ALIASES)) {
    if (aliases.includes(normalized) || normalized === canonical) {
      // Find person with this relationship type
      for (const person of graph.people.values()) {
        if (person.aliases.some((a) => aliases.includes(a.toLowerCase()))) {
          return person;
        }
      }
    }
  }

  return undefined;
}

function createPerson(name: string): Person {
  const id = `person_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const relationship = inferRelationship(name);

  return {
    id,
    name,
    aliases: generateAliases(name),
    relationship,
    importance: 0.3, // Start with moderate importance
    importantDates: [],
    lastMentioned: new Date(),
    mentionCount: 0,
    averageSentiment: 0,
    associatedTopics: [],
    notes: [],
    isConfirmedImportant: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function inferRelationship(name: string): RelationshipType {
  const lower = name.toLowerCase();

  for (const [type, aliases] of Object.entries(RELATIONSHIP_ALIASES)) {
    if (aliases.includes(lower) || lower === type) {
      if (['mother', 'father', 'sibling', 'child'].includes(type)) return 'family';
      if (type === 'partner') return 'partner';
      if (type === 'friend') return 'friend';
      if (['boss', 'therapist'].includes(type)) return 'professional';
    }
  }

  return 'unknown';
}

function generateAliases(name: string): string[] {
  const lower = name.toLowerCase();
  const aliases: string[] = [lower];

  // Add relationship aliases
  for (const [_canonical, aliasGroup] of Object.entries(RELATIONSHIP_ALIASES)) {
    if (aliasGroup.includes(lower)) {
      aliases.push(...aliasGroup);
      break;
    }
  }

  return [...new Set(aliases)];
}

function updateImportance(graph: UserSocialGraph, personId: string): void {
  const person = graph.people.get(personId);
  if (!person) return;

  // Calculate importance based on:
  // - Mention frequency (more mentions = more important)
  // - Recency (recent mentions = more important)
  // - Emotional weight (emotional discussions = more important)
  // - User confirmation

  const recentMentions = graph.mentions.filter(
    (m) => m.personId === personId && Date.now() - m.timestamp.getTime() < 30 * 24 * 60 * 60 * 1000 // Last 30 days
  );

  const frequencyScore = Math.min(1, recentMentions.length / 10);
  const recencyScore =
    recentMentions.length > 0
      ? Math.max(
          0,
          1 -
            (Date.now() - recentMentions[recentMentions.length - 1].timestamp.getTime()) /
              (14 * 24 * 60 * 60 * 1000)
        )
      : 0;
  const emotionalScore =
    recentMentions.length > 0
      ? recentMentions.reduce((sum, m) => sum + m.emotionalWeight, 0) / recentMentions.length
      : 0;

  person.importance = person.isConfirmedImportant
    ? Math.max(0.8, frequencyScore * 0.3 + recencyScore * 0.3 + emotionalScore * 0.4)
    : frequencyScore * 0.3 + recencyScore * 0.3 + emotionalScore * 0.4;
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function getImportantPeople(userId: string): Person[] {
  const graph = userGraphs.get(userId);
  if (!graph) return [];

  return [...graph.people.values()]
    .filter((p) => p.importance > 0.4 || p.isConfirmedImportant)
    .sort((a, b) => b.importance - a.importance);
}

export function getPerson(userId: string, personId: string): Person | undefined {
  return userGraphs.get(userId)?.people.get(personId);
}

export function confirmImportantPerson(userId: string, personId: string): boolean {
  const person = userGraphs.get(userId)?.people.get(personId);
  if (!person) return false;

  person.isConfirmedImportant = true;
  person.updatedAt = new Date();
  return true;
}

export function getMentionFrequency(userId: string, personName: string, days: number): number {
  const graph = userGraphs.get(userId);
  if (!graph) return 0;

  const person = findPersonByName(graph, personName);
  if (!person) return 0;

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return graph.mentions.filter((m) => m.personId === person.id && m.timestamp.getTime() > cutoff)
    .length;
}

export function clearSocialGraph(userId: string): void {
  userGraphs.delete(userId);
  log.info({ userId }, 'Social graph cleared');
}

// ============================================================================
// PERSISTENCE (for real-time saving)
// ============================================================================

/**
 * Get the in-memory graph for a user (for persistence)
 */
export function getUserGraph(userId: string): UserSocialGraph | undefined {
  return userGraphs.get(userId);
}

/**
 * Serialize graph for storage
 */
export function serializeGraph(graph: UserSocialGraph): object {
  return {
    userId: graph.userId,
    people: Array.from(graph.people.entries()).map(([id, person]) => ({
      ...person,
      lastMentioned: person.lastMentioned.toISOString(),
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString(),
    })),
    mentions: graph.mentions.slice(-100).map((m) => ({
      ...m,
      timestamp: m.timestamp.toISOString(),
    })),
    patterns: graph.patterns,
    lastAnalysis: graph.lastAnalysis.toISOString(),
  };
}

/**
 * Persist graph to Firestore
 */
export async function persistGraphToFirestore(
  userId: string,
  graph: UserSocialGraph
): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) {
      log.warn({ userId }, 'Cannot persist social graph - no Firestore connection');
      return;
    }

    const serialized = serializeGraph(graph);
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('social_graph')
      .doc('current')
      .set(
        {
          ...serialized,
          updatedAt: new Date(),
        },
        { merge: true }
      );

    // Index key relationships for "Better Than Human" recall
    // "We know who matters to you"
    const importantPeople = Array.from(graph.people.values()).filter(
      (p) => p.importance >= 0.5 || p.isConfirmedImportant
    );
    for (const person of importantPeople.slice(0, 10)) {
      void onRelationshipNetworkChange(
        userId,
        `person_${person.id}`,
        {
          person: person.name,
          relationship: person.relationship,
          connectionStrength:
            person.importance >= 0.8
              ? 'core'
              : person.importance >= 0.6
                ? 'strong'
                : person.importance >= 0.4
                  ? 'moderate'
                  : 'weak',
          lastContact: person.lastMentioned?.toISOString(),
          notes: person.notes?.join('. '),
        },
        'update'
      );
    }

    // Index relationship patterns as correlations
    for (const pattern of graph.patterns.filter((p) => p.confidence >= 0.7)) {
      void onCorrelationInsightChange(
        userId,
        `rel_pattern_${pattern.personId}`,
        {
          connection: pattern.description,
          domainA: 'relationships',
          domainB: 'emotional_state',
          strength: pattern.confidence >= 0.85 ? 'strong' : 'moderate',
          examples: [
            `${pattern.personName}: ${pattern.pattern === 'positive_correlation' ? 'positive' : 'negative'} effect on mood`,
          ],
          implications: pattern.description,
          discoveredAt: new Date().toISOString(),
        },
        'update'
      );
    }

    log.debug({ userId, peopleCount: graph.people.size }, 'Social graph persisted');
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to persist social graph');
  }
}

/**
 * Load graph from Firestore
 */
export async function loadGraphFromFirestore(userId: string): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return;

    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('social_graph')
      .doc('current')
      .get();

    if (!doc.exists) return;

    const data = doc.data();
    if (!data) return;

    // Reconstruct the graph
    const graph: UserSocialGraph = {
      userId,
      people: new Map(),
      mentions: [],
      patterns: data.patterns || [],
      lastAnalysis: new Date(data.lastAnalysis || 0),
    };

    // Reconstruct people
    for (const personData of data.people || []) {
      const person: Person = {
        ...personData,
        lastMentioned: new Date(personData.lastMentioned),
        createdAt: new Date(personData.createdAt),
        updatedAt: new Date(personData.updatedAt),
      };
      graph.people.set(person.id, person);
    }

    // Reconstruct mentions
    graph.mentions = (data.mentions || []).map((m: Record<string, unknown>) => ({
      ...m,
      timestamp: new Date(m.timestamp as string),
    }));

    userGraphs.set(userId, graph);
    log.info({ userId, peopleCount: graph.people.size }, 'Social graph loaded from Firestore');
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to load social graph from Firestore');
  }
}

// ============================================================================
// CACHE MANAGEMENT (for memory efficiency)
// ============================================================================

/**
 * Get all people from the social graph
 */
export function getAllPeople(userId: string): Person[] {
  const graph = userGraphs.get(userId);
  if (!graph) return [];
  return Array.from(graph.people.values());
}

/**
 * Get all social insights
 */
export function getSocialInsights(userId: string): SocialInsight[] {
  const graph = userGraphs.get(userId);
  if (!graph) return [];
  return generateSocialInsights(userId);
}

/**
 * Clear all cached social graphs (for memory management)
 * Call this on app shutdown or when memory pressure is high
 */
export function clearAllSocialGraphs(): void {
  const count = userGraphs.size;
  userGraphs.clear();
  log.info({ count }, 'All social graphs cleared from memory');
}

/**
 * Get count of cached graphs (for monitoring)
 */
export function getCachedGraphCount(): number {
  return userGraphs.size;
}

/**
 * Prune old mentions from a user's graph
 * Keeps only mentions from last N days
 */
export function pruneMentions(userId: string, retentionDays = 90): number {
  const graph = userGraphs.get(userId);
  if (!graph) return 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffTime = cutoffDate.getTime();

  const originalCount = graph.mentions.length;
  graph.mentions = graph.mentions.filter((m) => m.timestamp.getTime() > cutoffTime);

  const pruned = originalCount - graph.mentions.length;
  if (pruned > 0) {
    log.debug({ userId, pruned, remaining: graph.mentions.length }, 'Pruned old mentions');
  }

  return pruned;
}

/**
 * Cleanup graphs for inactive users (no mentions in last N days)
 * Call this periodically to prevent memory growth
 */
export function cleanupInactiveGraphs(inactiveDays = 7): number {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);
  const cutoffTime = cutoffDate.getTime();

  let cleaned = 0;
  for (const [userId, graph] of userGraphs) {
    // Check if last analysis is too old
    if (graph.lastAnalysis.getTime() < cutoffTime) {
      // Check if any recent mentions
      const hasRecentMentions = graph.mentions.some((m) => m.timestamp.getTime() > cutoffTime);
      if (!hasRecentMentions) {
        userGraphs.delete(userId);
        cleaned++;
      }
    }
  }

  if (cleaned > 0) {
    log.info({ cleaned, remaining: userGraphs.size }, 'Cleaned up inactive social graphs');
  }

  return cleaned;
}

export default {
  recordMention,
  extractNames,
  detectWithdrawal,
  detectSentimentPatterns,
  getUpcomingDates,
  addImportantDate,
  generateSocialInsights,
  generateSuperhumanMoment,
  getImportantPeople,
  getAllPeople,
  getSocialInsights,
  getPerson,
  confirmImportantPerson,
  getMentionFrequency,
  clearSocialGraph,
  clearAllSocialGraphs,
  getCachedGraphCount,
  pruneMentions,
  cleanupInactiveGraphs,
  getUserGraph,
  serializeGraph,
  persistGraphToFirestore,
  loadGraphFromFirestore,
};
