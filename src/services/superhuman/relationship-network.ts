/**
 * Relationship Network Map - Better Than Human Service
 *
 * What no human friend can do: Remember everyone in your life perfectly.
 *
 * Maps the user's social ecosystem: key people, relationship dynamics,
 * mention frequency, and opportunities for connection or boundary-setting.
 *
 * @module services/superhuman/relationship-network
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore, recordDegradation } from './firestore-utils.js';
import { onRelationshipNetworkChange } from '../data-layer/hooks/superhuman-hooks.js';

const log = createLogger({ module: 'relationship-network' });

// ============================================================================
// TYPES
// ============================================================================

export type RelationshipType =
  | 'family' // Blood or legal family
  | 'partner' // Romantic partner
  | 'friend' // Close friend
  | 'colleague' // Work relationship
  | 'acquaintance' // Casual relationship
  | 'mentor' // Guide/teacher
  | 'mentee' // Someone they guide
  | 'ex' // Former romantic partner
  | 'complicated'; // It's complicated

export type RelationshipSentiment =
  | 'very_positive'
  | 'positive'
  | 'neutral'
  | 'tense'
  | 'negative'
  | 'complicated'
  | 'healing';

export interface RelationshipPerson {
  id: string;
  userId: string;

  // Identity
  name: string;
  aliases: string[]; // "my mom", "mom", "mother"
  type: RelationshipType;

  // Relationship quality
  sentiment: RelationshipSentiment;
  importance: number; // 0-1, how much they come up

  // Tracking
  firstMentioned: number;
  lastMentioned: number;
  mentionCount: number;
  recentMentions: Array<{ date: number; context: string; sentiment: string }>;

  // Dynamics
  themes: string[]; // Common themes when discussing
  positiveAspects: string[];
  painPoints: string[];

  // Connection tracking
  lastPositiveMention?: number;
  lastNegativeMention?: number;
  mentionGapDays?: number; // Days since last mention

  // Notes
  contextNotes: string[];
}

export interface ConnectionOpportunity {
  personId: string;
  personName: string;
  type: 'reconnect' | 'boundary' | 'appreciation' | 'check_in' | 'healing';
  reason: string;
  suggestedAction: string;
  urgency: 'low' | 'normal' | 'high';
}

// ============================================================================
// PERSON EXTRACTION
// ============================================================================

const RELATIONSHIP_WORDS: Record<string, RelationshipType> = {
  mom: 'family',
  mother: 'family',
  dad: 'family',
  father: 'family',
  sister: 'family',
  brother: 'family',
  son: 'family',
  daughter: 'family',
  wife: 'partner',
  husband: 'partner',
  partner: 'partner',
  boyfriend: 'partner',
  girlfriend: 'partner',
  fiance: 'partner',
  fiancee: 'partner',
  ex: 'ex',
  boss: 'colleague',
  manager: 'colleague',
  coworker: 'colleague',
  colleague: 'colleague',
  friend: 'friend',
  'best friend': 'friend',
  mentor: 'mentor',
};

export function extractPerson(
  transcript: string
): { name: string; type: RelationshipType; context: string } | null {
  const lowerTranscript = transcript.toLowerCase();

  // Check for relationship words with "my"
  for (const [word, type] of Object.entries(RELATIONSHIP_WORDS)) {
    const patterns = [
      new RegExp(`\\bmy ${word}\\b`, 'i'),
      new RegExp(`\\bmy ${word}('s|,)\\b`, 'i'),
    ];

    for (const pattern of patterns) {
      if (pattern.test(lowerTranscript)) {
        // Try to extract a name after the relationship word
        // Use case-insensitive for "my word" but check result is actually capitalized
        const namePattern = new RegExp(`my\\s+${word}[,\\s]+([A-Za-z]+)`, 'i');
        const nameMatch = transcript.match(namePattern);

        // Only accept as a proper name if it starts with uppercase in original text
        if (nameMatch && /^[A-Z]/.test(nameMatch[1])) {
          return {
            name: nameMatch[1],
            type,
            context: transcript.slice(0, 150),
          };
        }

        // No proper name found, return the relationship word
        return {
          name: `my ${word}`,
          type,
          context: transcript.slice(0, 150),
        };
      }
    }
  }

  // Check for names with "talked to X" or "saw X" patterns
  // Pattern 1: "I talked to/saw/met X" - name is in group 2
  const talkToPattern = /\bi (?:talked to|spoke with|saw|met with|called|texted) ([A-Z][a-z]+)/i;
  const talkMatch = transcript.match(talkToPattern);
  if (talkMatch) {
    const name = talkMatch[1];
    if (!['I', 'The', 'A', 'An', 'This', 'That', 'It', 'My', 'We', 'They'].includes(name)) {
      return {
        name,
        type: 'acquaintance',
        context: transcript.slice(0, 150),
      };
    }
  }

  // Pattern 2: "X said/told me" - name is in group 1
  const saidPattern = /\b([A-Z][a-z]+) (?:said|told me|called me|texted me|asked me)/i;
  const saidMatch = transcript.match(saidPattern);
  if (saidMatch) {
    const name = saidMatch[1];
    if (!['I', 'The', 'A', 'An', 'This', 'That', 'It', 'My', 'We', 'They'].includes(name)) {
      return {
        name,
        type: 'acquaintance',
        context: transcript.slice(0, 150),
      };
    }
  }

  return null;
}

/**
 * Extract all names mentioned in a transcript
 *
 * Returns an array of names with their context. This is used by the turn processor
 * to record all person mentions during a conversation.
 */
export function extractNames(transcript: string): Array<{ name: string; context: string }> {
  const results: Array<{ name: string; context: string }> = [];
  const seen = new Set<string>();
  const contextSnippet = transcript.slice(0, 150);

  // 1. First, try extractPerson for relationship words
  const personResult = extractPerson(transcript);
  if (personResult && !seen.has(personResult.name.toLowerCase())) {
    results.push({ name: personResult.name, context: personResult.context });
    seen.add(personResult.name.toLowerCase());
  }

  // 2. Extract names after relationship words: "my friend Sarah"
  const relationshipNameRegex =
    /\bmy\s+(mom|mother|dad|father|sister|brother|wife|husband|partner|boyfriend|girlfriend|friend|boss|coworker|colleague|mentor|cousin|aunt|uncle)\s+([A-Z][a-z]+)/gi;
  let match;
  while ((match = relationshipNameRegex.exec(transcript)) !== null) {
    const name = match[2];
    if (!seen.has(name.toLowerCase())) {
      results.push({ name, context: contextSnippet });
      seen.add(name.toLowerCase());
    }
  }

  // Common words to skip (not names)
  const skipWords = new Set([
    'the',
    'a',
    'an',
    'this',
    'that',
    'it',
    'my',
    'we',
    'they',
    'he',
    'she',
    'you',
    'i',
    'with',
    'said',
    'told',
    'asked',
    'met',
    'saw',
    'called',
    'texted',
    'spoke',
    'today',
    'yesterday',
    'tomorrow',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'morning',
    'afternoon',
    'evening',
    'night',
    'week',
    'month',
    'year',
    'then',
    'when',
    'where',
    'what',
    'who',
    'how',
    'why',
    'but',
    'and',
    'or',
    'so',
    'just',
    'really',
    'very',
    'here',
    'there',
    'now',
    'later',
    'soon',
    'again',
    'next',
    'last',
    'first',
    'good',
    'great',
    'nice',
    'new',
    'old',
    'some',
    'many',
    'few',
  ]);

  // 3. Extract names in "talked to X" patterns (with or without "I" prefix)
  const talkPattern =
    /\b(?:i\s+)?(?:talked to|spoke with|saw|met with|called|texted)\s+([A-Z][a-z]+)/gi;
  while ((match = talkPattern.exec(transcript)) !== null) {
    const name = match[1];
    if (!skipWords.has(name.toLowerCase()) && !seen.has(name.toLowerCase())) {
      results.push({ name, context: contextSnippet });
      seen.add(name.toLowerCase());
    }
  }

  // 3b. Extract names from "X's name is Y" patterns: "My mom's name is Betty" (NOT "my name is X" - user intro)
  // Only match when there's a possessive before "name" to avoid extracting user's own name
  const nameIsPattern =
    /\b(?:mom|mother|dad|father|sister|brother|wife|husband|partner|friend|boss|colleague)'?s?\s+name\s+is\s+([A-Z][a-z]+)/gi;
  while ((match = nameIsPattern.exec(transcript)) !== null) {
    const name = match[1];
    if (!skipWords.has(name.toLowerCase()) && !seen.has(name.toLowerCase())) {
      results.push({ name, context: contextSnippet });
      seen.add(name.toLowerCase());
    }
  }

  // 3c. Extract names from "named X" patterns: "I have a sister named Jane"
  const namedPattern = /\b(?:named|called)\s+([A-Z][a-z]+)/gi;
  while ((match = namedPattern.exec(transcript)) !== null) {
    const name = match[1];
    if (!skipWords.has(name.toLowerCase()) && !seen.has(name.toLowerCase())) {
      results.push({ name, context: contextSnippet });
      seen.add(name.toLowerCase());
    }
  }

  // 3d. Extract names from "X, my Y" patterns: "Alex, my mentor, recommended"
  const xMyYPattern =
    /\b([A-Z][a-z]+),?\s+my\s+(?:friend|mentor|boss|colleague|sister|brother|mom|dad)/gi;
  while ((match = xMyYPattern.exec(transcript)) !== null) {
    const name = match[1];
    if (!skipWords.has(name.toLowerCase()) && !seen.has(name.toLowerCase())) {
      results.push({ name, context: contextSnippet });
      seen.add(name.toLowerCase());
    }
  }

  // 4. Extract names in "X said/told me" patterns
  const saidPattern =
    /\b([A-Z][a-z]+)\s+(?:said|told me|called me|texted me|asked me|thinks|thought|suggested|mentioned|wants|wanted)/gi;
  while ((match = saidPattern.exec(transcript)) !== null) {
    const name = match[1];
    if (!skipWords.has(name.toLowerCase()) && !seen.has(name.toLowerCase())) {
      results.push({ name, context: contextSnippet });
      seen.add(name.toLowerCase());
    }
  }

  // 5. Extract names in "X is my Y" patterns: "Sarah is my best friend"
  const isMyPattern =
    /\b([A-Z][a-z]+)\s+is\s+my\s+(?:best\s+)?(?:friend|mom|dad|sister|brother|boss|colleague|mentor|wife|husband|partner)/gi;
  while ((match = isMyPattern.exec(transcript)) !== null) {
    const name = match[1];
    if (!skipWords.has(name.toLowerCase()) && !seen.has(name.toLowerCase())) {
      results.push({ name, context: contextSnippet });
      seen.add(name.toLowerCase());
    }
  }

  // 6. Extract names in "with X" context: "I went with John", "meeting with Sarah"
  const withPattern =
    /\b(?:with|and)\s+([A-Z][a-z]+)(?:\s+(?:today|yesterday|tomorrow|at|to|for)|\b)/gi;
  while ((match = withPattern.exec(transcript)) !== null) {
    const name = match[1];
    if (!skipWords.has(name.toLowerCase()) && !seen.has(name.toLowerCase())) {
      results.push({ name, context: contextSnippet });
      seen.add(name.toLowerCase());
    }
  }

  // 7. Extract names after "Tell X" or "Ask X"
  const tellPattern = /\b(?:tell|ask|call|text|email|visit|meet)\s+([A-Z][a-z]+)/gi;
  while ((match = tellPattern.exec(transcript)) !== null) {
    const name = match[1];
    if (!skipWords.has(name.toLowerCase()) && !seen.has(name.toLowerCase())) {
      results.push({ name, context: contextSnippet });
      seen.add(name.toLowerCase());
    }
  }

  // 8. Extract names with titles: "Dr. Johnson", "Mr. Smith"
  const titlePattern = /\b(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)\s*([A-Z][a-z]+)/gi;
  while ((match = titlePattern.exec(transcript)) !== null) {
    const name = match[1];
    if (!skipWords.has(name.toLowerCase()) && !seen.has(name.toLowerCase())) {
      results.push({ name, context: contextSnippet });
      seen.add(name.toLowerCase());
    }
  }

  // 9. Extract names introduced with "introduced me to X"
  const introPattern = /\bintroduced\s+(?:me\s+)?to\s+([A-Z][a-z]+)/gi;
  while ((match = introPattern.exec(transcript)) !== null) {
    const name = match[1];
    if (!skipWords.has(name.toLowerCase()) && !seen.has(name.toLowerCase())) {
      results.push({ name, context: contextSnippet });
      seen.add(name.toLowerCase());
    }
  }

  return results;
}

// ============================================================================
// SENTIMENT ANALYSIS
// ============================================================================

const POSITIVE_INDICATORS = [
  'love',
  'happy',
  'proud',
  'grateful',
  'amazing',
  'wonderful',
  'supportive',
  'helped',
  'great',
  'best',
  'appreciate',
  'thankful',
];

const NEGATIVE_INDICATORS = [
  'frustrated',
  'angry',
  'hurt',
  'disappointed',
  'annoyed',
  'upset',
  'hate',
  'mad',
  'worst',
  'terrible',
  'awful',
];

const COMPLICATED_INDICATORS = [
  'complicated',
  'confusing',
  'mixed',
  'both',
  'sometimes',
  'used to',
  'but',
  'however',
  'although',
];

export function analyzeSentiment(context: string): RelationshipSentiment {
  const lower = context.toLowerCase();

  let positiveCount = 0;
  let negativeCount = 0;
  let complicatedCount = 0;

  for (const word of POSITIVE_INDICATORS) {
    if (lower.includes(word)) positiveCount++;
  }

  for (const word of NEGATIVE_INDICATORS) {
    if (lower.includes(word)) negativeCount++;
  }

  for (const word of COMPLICATED_INDICATORS) {
    if (lower.includes(word)) complicatedCount++;
  }

  if (complicatedCount >= 2) return 'complicated';
  if (positiveCount > negativeCount + 1) {
    return positiveCount >= 3 ? 'very_positive' : 'positive';
  }
  if (negativeCount > positiveCount + 1) return 'negative';
  if (negativeCount > 0 && positiveCount > 0) return 'complicated';
  if (negativeCount > 0) return 'tense';

  return 'neutral';
}

// ============================================================================
// STORAGE
// ============================================================================

const networkCache = new Map<string, RelationshipPerson[]>();

export async function loadNetwork(userId: string): Promise<RelationshipPerson[]> {
  if (networkCache.has(userId)) {
    return networkCache.get(userId) || [];
  }

  try {
    const db = getFirestoreDb();
    if (!db) {
      recordDegradation('relationship-network');
      return [];
    }

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('relationship_network')
      .orderBy('importance', 'desc')
      .limit(50)
      .get();

    const network = snapshot.docs.map((doc) => doc.data() as RelationshipPerson);
    networkCache.set(userId, network);
    return network;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load network');
    return [];
  }
}

export async function savePerson(person: RelationshipPerson): Promise<void> {
  const db = getFirestoreDb();
  if (db) {
    await db
      .collection('bogle_users')
      .doc(person.userId)
      .collection('relationship_network')
      .doc(person.id)
      .set(cleanForFirestore(person));
  }

  // Index to semantic memory for cross-domain correlation
  void onRelationshipNetworkChange(
    person.userId,
    person.id,
    {
      person: person.name,
      relationship: person.type,
      connectionStrength:
        person.mentionCount > 10 ? 'strong' : person.mentionCount > 5 ? 'moderate' : 'weak',
      lastContact: person.lastMentioned ? new Date(person.lastMentioned).toISOString() : undefined,
      notes: person.themes?.slice(0, 3).join('; '),
    },
    person.mentionCount === 1 ? 'create' : 'update'
  );

  // Update cache
  const network = networkCache.get(person.userId) || [];
  const idx = network.findIndex((p) => p.id === person.id);
  if (idx >= 0) {
    network[idx] = person;
  } else {
    network.push(person);
  }
  networkCache.set(person.userId, network);
}

export async function recordMention(
  userId: string,
  extracted: { name: string; type: RelationshipType; context: string }
): Promise<RelationshipPerson> {
  const network = await loadNetwork(userId);
  const sentiment = analyzeSentiment(extracted.context);

  // Find existing person (by name or alias)
  const existing = network.find(
    (p) =>
      p.name.toLowerCase() === extracted.name.toLowerCase() ||
      p.aliases.some((a) => a.toLowerCase() === extracted.name.toLowerCase())
  );

  if (existing) {
    existing.mentionCount++;
    existing.lastMentioned = Date.now();
    existing.importance = Math.min(1, existing.importance + 0.02);

    // Update sentiment (weighted average)
    if (sentiment !== existing.sentiment) {
      // Track sentiment history
      if (sentiment === 'positive' || sentiment === 'very_positive') {
        existing.lastPositiveMention = Date.now();
      } else if (sentiment === 'negative' || sentiment === 'tense') {
        existing.lastNegativeMention = Date.now();
      }
    }

    // Add recent mention
    existing.recentMentions.push({
      date: Date.now(),
      context: extracted.context.slice(0, 200),
      sentiment,
    });
    if (existing.recentMentions.length > 10) {
      existing.recentMentions.shift();
    }

    await savePerson(existing);
    return existing;
  }

  // Create new person
  const newPerson: RelationshipPerson = {
    id: `person_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    name: extracted.name,
    aliases: [extracted.name.toLowerCase()],
    type: extracted.type,
    sentiment,
    importance: 0.3,
    firstMentioned: Date.now(),
    lastMentioned: Date.now(),
    mentionCount: 1,
    recentMentions: [{ date: Date.now(), context: extracted.context, sentiment }],
    themes: [],
    positiveAspects: [],
    painPoints: [],
    contextNotes: [],
  };

  await savePerson(newPerson);
  log.info(
    { userId, personName: newPerson.name, type: newPerson.type },
    '👤 New person in network'
  );
  return newPerson;
}

// ============================================================================
// CONNECTION OPPORTUNITIES
// ============================================================================

export async function findConnectionOpportunities(
  userId: string
): Promise<ConnectionOpportunity[]> {
  const network = await loadNetwork(userId);
  const opportunities: ConnectionOpportunity[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (const person of network) {
    const daysSinceLastMention = Math.floor((now - person.lastMentioned) / dayMs);

    // Reconnect opportunity - hasn't been mentioned in a while but was important
    if (daysSinceLastMention > 14 && person.importance > 0.5) {
      opportunities.push({
        personId: person.id,
        personName: person.name,
        type: 'reconnect',
        reason: `You haven't mentioned ${person.name} in ${daysSinceLastMention} days.`,
        suggestedAction: `Check in with ${person.name}? Sometimes people are waiting for us to reach out.`,
        urgency: daysSinceLastMention > 30 ? 'high' : 'normal',
      });
    }

    // Boundary opportunity - frequently mentioned with negative sentiment
    if (person.sentiment === 'negative' || person.sentiment === 'tense') {
      if (person.mentionCount > 5) {
        opportunities.push({
          personId: person.id,
          personName: person.name,
          type: 'boundary',
          reason: `${person.name} keeps coming up, and it seems tense.`,
          suggestedAction: `Is there a boundary that needs setting with ${person.name}?`,
          urgency: 'normal',
        });
      }
    }

    // Appreciation opportunity - positive relationship, could use recognition
    if (
      (person.sentiment === 'positive' || person.sentiment === 'very_positive') &&
      person.mentionCount > 3
    ) {
      const daysSincePositive = person.lastPositiveMention
        ? Math.floor((now - person.lastPositiveMention) / dayMs)
        : 999;

      if (daysSincePositive > 7) {
        opportunities.push({
          personId: person.id,
          personName: person.name,
          type: 'appreciation',
          reason: `${person.name} sounds important to you.`,
          suggestedAction: `Have you told ${person.name} how much they mean to you lately?`,
          urgency: 'low',
        });
      }
    }

    // Healing opportunity - ex or complicated relationship
    if (
      (person.type === 'ex' || person.sentiment === 'complicated') &&
      person.lastMentioned > now - 7 * dayMs
    ) {
      opportunities.push({
        personId: person.id,
        personName: person.name,
        type: 'healing',
        reason: `Your relationship with ${person.name} seems to still be processing.`,
        suggestedAction: `Want to talk through what's unresolved with ${person.name}?`,
        urgency: 'low',
      });
    }
  }

  // Sort by urgency
  const urgencyOrder = { high: 0, normal: 1, low: 2 };
  opportunities.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return opportunities.slice(0, 5);
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildNetworkContext(userId: string): Promise<string> {
  const network = await loadNetwork(userId);
  const opportunities = await findConnectionOpportunities(userId);

  if (network.length === 0) {
    return '';
  }

  const sections: string[] = ['[RELATIONSHIP NETWORK - Better Than Human People Memory]'];
  sections.push('You remember everyone in their life. Use this knowledge wisely.');

  // Key people
  const keyPeople = network.filter((p) => p.importance > 0.4).slice(0, 7);
  if (keyPeople.length > 0) {
    sections.push('\n**Key People:**');
    for (const person of keyPeople) {
      const daysSince = Math.floor((Date.now() - person.lastMentioned) / (24 * 60 * 60 * 1000));
      const sentimentEmoji: Record<RelationshipSentiment, string> = {
        very_positive: '💚',
        positive: '🟢',
        neutral: '⚪',
        tense: '🟡',
        negative: '🔴',
        complicated: '🟣',
        healing: '💜',
      };
      sections.push(
        `• ${person.name} (${person.type}) ${sentimentEmoji[person.sentiment]} - last mentioned ${daysSince}d ago`
      );
    }
  }

  // Connection opportunities
  if (opportunities.length > 0) {
    sections.push('\n**Connection Opportunities:**');
    for (const opp of opportunities.slice(0, 3)) {
      sections.push(`• ${opp.suggestedAction}`);
    }
  }

  sections.push('\nBring up people naturally. "How\'s [name]?" shows you remember.');

  return sections.join('\n');
}

// ============================================================================
// GROUP OUTREACH INTEGRATION
// ============================================================================

/**
 * Check for reconnection opportunities and trigger group outreach for high-urgency ones.
 * Should be called periodically (e.g., daily) to proactively reach out.
 */
export async function checkAndTriggerReconnectionOutreach(userId: string): Promise<number> {
  const opportunities = await findConnectionOpportunities(userId);
  let triggeredCount = 0;

  // Only trigger for high-urgency reconnect opportunities
  const highUrgency = opportunities.filter((o) => o.type === 'reconnect' && o.urgency === 'high');

  if (highUrgency.length > 0) {
    try {
      const { onReconnectionOpportunity } =
        await import('../conversation-thread/group-outreach-triggers.js');

      // Trigger for the top 2 most urgent opportunities
      for (const opportunity of highUrgency.slice(0, 2)) {
        const result = await onReconnectionOpportunity(userId, {
          personName: opportunity.personName,
          daysSinceLastMention: 30, // High urgency = 30+ days
          suggestedAction: opportunity.suggestedAction,
        });

        if (result) {
          triggeredCount++;
          log.info(
            { userId, personName: opportunity.personName },
            '🎭 Triggered group outreach for reconnection'
          );
        }
      }
    } catch (error) {
      log.debug(
        { error: String(error), userId },
        'Failed to trigger reconnection outreach (non-fatal)'
      );
    }
  }

  return triggeredCount;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const relationshipNetwork = {
  extractPerson,
  analyzeSentiment,
  loadNetwork,
  recordMention,
  findOpportunities: findConnectionOpportunities,
  checkReconnectionOutreach: checkAndTriggerReconnectionOutreach,
  buildContext: buildNetworkContext,
};
