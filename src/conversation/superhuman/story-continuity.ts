/**
 * Story Continuity System
 *
 * "How's Sarah doing with her new job?" - Remembering the cast of characters.
 *
 * Real friends remember the people in your life. This system tracks the
 * characters in the user's story and asks about them naturally.
 *
 * @module conversation/superhuman/story-continuity
 */

import { seededChance, seededPick, seededIndex } from '../utils/random-generator.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'StoryContinuity' });

// ============================================================================
// TYPES
// ============================================================================

export interface PersonInLife {
  id: string;
  userId: string;
  name: string;
  relationship: RelationshipType;
  // What we know about them
  details: PersonDetail[];
  lastMentioned: Date;
  mentionCount: number;
  // Sentiment
  sentiment: 'positive' | 'negative' | 'complicated' | 'neutral';
  // Current storylines
  activeStorylines: Storyline[];
  resolvedStorylines: Storyline[];
}

export type RelationshipType =
  | 'partner'
  | 'spouse'
  | 'parent'
  | 'child'
  | 'sibling'
  | 'friend'
  | 'coworker'
  | 'boss'
  | 'ex'
  | 'therapist'
  | 'doctor'
  | 'other';

export interface PersonDetail {
  type: 'job' | 'hobby' | 'personality' | 'issue' | 'achievement' | 'plan' | 'other';
  detail: string;
  addedAt: Date;
}

export interface Storyline {
  id: string;
  summary: string;
  startDate: Date;
  lastUpdate: Date;
  isResolved: boolean;
  updates: StorylineUpdate[];
}

export interface StorylineUpdate {
  timestamp: Date;
  update: string;
}

export interface PersonFollowUp {
  person: PersonInLife;
  question: string;
  reason: string;
  storyline?: Storyline;
}

// ============================================================================
// RELATIONSHIP PATTERNS
// ============================================================================

const RELATIONSHIP_PATTERNS: Record<RelationshipType, RegExp[]> = {
  partner: [
    /my (boyfriend|girlfriend|partner|significant other)/i,
    /(bf|gf)\b/i,
    /the (person|one) I('m| am) (dating|seeing|with)/i,
  ],
  spouse: [/my (wife|husband|spouse)/i, /my (better half)/i],
  parent: [/my (mom|mother|dad|father|parent)/i, /my (ma|pa|mama|papa|mum|daddy|mommy)/i],
  child: [/my (son|daughter|kid|child)/i, /my (boy|girl|little one|baby)/i],
  sibling: [/my (brother|sister|sibling)/i, /my (bro|sis)/i],
  friend: [/my (friend|best friend|bestie|buddy|pal)/i, /my (closest friend|good friend)/i],
  coworker: [/my (coworker|colleague|work friend)/i, /(someone|person) (at|from) work/i],
  boss: [/my (boss|manager|supervisor)/i, /my (lead|director)/i],
  ex: [/my ex/i, /my (former|previous) (partner|boyfriend|girlfriend|husband|wife)/i],
  therapist: [/my (therapist|counselor|psychologist)/i, /my (shrink)/i],
  doctor: [/my (doctor|physician|specialist)/i],
  other: [],
};

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const peopleStore = new Map<string, PersonInLife[]>();

// ============================================================================
// PERSON EXTRACTION
// ============================================================================

/**
 * Extract a person mentioned in a message
 */
export function extractPerson(userId: string, message: string): Partial<PersonInLife> | null {
  // First, check for relationship type
  let relationshipType: RelationshipType = 'other';
  for (const [type, patterns] of Object.entries(RELATIONSHIP_PATTERNS)) {
    if (patterns.some((p) => p.test(message))) {
      relationshipType = type as RelationshipType;
      break;
    }
  }

  // Try to extract a name
  // Pattern: "my [relationship] [Name]" or "[Name], my [relationship]"
  const namePatterns = [
    /my \w+ (\w+)/i, // "my friend Sarah"
    /(\w+),? my \w+/i, // "Sarah, my friend"
    /\b([A-Z][a-z]+)\b(?=.*\b(?:he|she|they|him|her|them)\b)/i, // Name followed by pronoun
  ];

  let name: string | undefined;
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      // Basic validation - proper noun, not common word
      const potentialName = match[1];
      if (
        potentialName.length >= 2 &&
        potentialName[0] === potentialName[0].toUpperCase() &&
        !['The', 'And', 'But', 'For', 'With', 'This', 'That'].includes(potentialName)
      ) {
        name = potentialName;
        break;
      }
    }
  }

  // Must have either a relationship type (not 'other') or a name
  if (relationshipType === 'other' && !name) {
    return null;
  }

  return {
    name: name || relationshipType, // Use relationship as name if no name given
    relationship: relationshipType,
    sentiment: 'neutral',
    details: [],
    activeStorylines: [],
    resolvedStorylines: [],
  };
}

/**
 * Get or create a person in the user's life
 */
export function getOrCreatePerson(userId: string, partial: Partial<PersonInLife>): PersonInLife {
  const people = peopleStore.get(userId) || [];

  // Check if this person already exists
  const existing = people.find(
    (p) =>
      (partial.name && p.name.toLowerCase() === partial.name.toLowerCase()) ||
      (partial.relationship && p.relationship === partial.relationship && !partial.name)
  );

  if (existing) {
    existing.lastMentioned = new Date();
    existing.mentionCount++;
    return existing;
  }

  // Create new person
  const person: PersonInLife = {
    id: `person_${Date.now()}_${Date.now().toString(36).slice(-6)}`,
    userId,
    name: partial.name || partial.relationship || 'Someone',
    relationship: partial.relationship || 'other',
    details: [],
    lastMentioned: new Date(),
    mentionCount: 1,
    sentiment: 'neutral',
    activeStorylines: [],
    resolvedStorylines: [],
  };

  people.push(person);
  peopleStore.set(userId, people);

  log.info(
    { userId, personId: person.id, name: person.name, relationship: person.relationship },
    "👥 New person in user's life tracked"
  );

  return person;
}

/**
 * Add a detail about a person
 */
export function addPersonDetail(
  userId: string,
  personId: string,
  detail: Omit<PersonDetail, 'addedAt'>
): void {
  const people = peopleStore.get(userId);
  if (!people) return;

  const person = people.find((p) => p.id === personId);
  if (!person) return;

  person.details.push({
    ...detail,
    addedAt: new Date(),
  });

  log.debug({ userId, personId, detail: detail.detail }, 'Added detail about person');
}

/**
 * Start or update a storyline
 */
export function updateStoryline(
  userId: string,
  personId: string,
  storylineSummary: string,
  update: string
): void {
  const people = peopleStore.get(userId);
  if (!people) return;

  const person = people.find((p) => p.id === personId);
  if (!person) return;

  // Find existing storyline or create new
  let storyline = person.activeStorylines.find((s) =>
    s.summary.toLowerCase().includes(storylineSummary.toLowerCase().slice(0, 30))
  );

  if (storyline) {
    storyline.updates.push({ timestamp: new Date(), update });
    storyline.lastUpdate = new Date();
  } else {
    storyline = {
      id: `story_${Date.now()}`,
      summary: storylineSummary,
      startDate: new Date(),
      lastUpdate: new Date(),
      isResolved: false,
      updates: [{ timestamp: new Date(), update }],
    };
    person.activeStorylines.push(storyline);
  }

  log.debug({ userId, personId, storyline: storylineSummary }, 'Storyline updated');
}

// ============================================================================
// FOLLOW-UP GENERATION
// ============================================================================

/**
 * Find people to ask about
 */
export function findPeopleToAskAbout(
  userId: string,
  context: {
    recentTopics?: string[];
    turnCount?: number;
  }
): PersonFollowUp | null {
  const people = peopleStore.get(userId);
  if (!people || people.length === 0) {
    return null;
  }

  // Don't ask about people in first few turns
  if ((context.turnCount || 0) < 4) {
    return null;
  }

  // Find people with active storylines we haven't heard about recently
  const candidates = people
    .filter((p) => {
      // Has active storylines
      if (p.activeStorylines.length === 0) return false;

      // Hasn't been mentioned recently
      const daysSince = (Date.now() - p.lastMentioned.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince >= 2; // At least 2 days since last mention
    })
    .map((person) => {
      // Find the most interesting storyline
      const storyline = person.activeStorylines.sort(
        (a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime()
      )[0];

      return { person, storyline };
    });

  if (candidates.length === 0) {
    return null;
  }

  // Pick the most relevant one
  const chosen = candidates[0];
  const question = generateFollowUpQuestion(chosen.person, chosen.storyline);

  return {
    person: chosen.person,
    question,
    reason: `Active storyline from ${Math.floor((Date.now() - chosen.storyline.lastUpdate.getTime()) / (1000 * 60 * 60 * 24))} days ago`,
    storyline: chosen.storyline,
  };
}

/**
 * Generate a natural follow-up question
 */
function generateFollowUpQuestion(person: PersonInLife, storyline: Storyline): string {
  const name = person.name;
  const summary = storyline.summary;

  // Relationship-specific questions
  const questions: Record<RelationshipType, string[]> = {
    partner: [
      `How are things going with ${name}?`,
      `Any updates on the ${name} situation?`,
      `How's ${name} doing these days?`,
    ],
    spouse: [`How's ${name} doing?`, `What's happening with ${name} and the ${summary}?`],
    parent: [`How's your ${person.relationship} doing?`, `Any news from ${name}?`],
    child: [`How's ${name} doing?`, `What's new with ${name}?`],
    sibling: [`How's ${name} doing?`, `Any updates from ${name}?`],
    friend: [`Hey, how's ${name} doing?`, `What's the latest with ${name}?`],
    coworker: [
      `How are things going with ${name} at work?`,
      `Any updates on the ${name} situation?`,
    ],
    boss: [`How are things with your ${person.relationship}?`, `Any developments with ${name}?`],
    ex: [`How are you feeling about the ${name} situation?`],
    therapist: [`How have your sessions been going?`],
    doctor: [`Any updates from ${name}?`],
    other: [`How's ${name} doing?`, `What's happening with ${name}?`],
  };

  const options = questions[person.relationship] || questions.other;
  return seededPick(`${Date.now()}:358`, options) ?? options[0];
}

/**
 * Format follow-up for prompt
 */
export function formatFollowUpForPrompt(followUp: PersonFollowUp): string {
  return [
    '[👥 STORY CONTINUITY - FOLLOW UP ON SOMEONE]',
    '',
    `Person: ${followUp.person.name} (${followUp.person.relationship})`,
    followUp.storyline ? `Last storyline: "${followUp.storyline.summary}"` : '',
    `Last mentioned: ${Math.floor((Date.now() - followUp.person.lastMentioned.getTime()) / (1000 * 60 * 60 * 24))} days ago`,
    '',
    `Suggested question: "${followUp.question}"`,
    '',
    "Ask naturally if there's an opening. Shows you remember the people in their life.",
  ]
    .filter(Boolean)
    .join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractPerson,
  getOrCreatePerson,
  addPersonDetail,
  updateStoryline,
  findPeopleToAskAbout,
  formatFollowUpForPrompt,
};
