/**
 * Team Chemistry Module
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module powers the natural, warm dynamics between Ferni team members.
 * Real teams have inside jokes, mutual admiration, playful teasing, and
 * shared history. So does the Ferni team.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { RelationshipStage } from '../relationship-memory/index.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface TeamPairDynamic {
  relationship:
    | 'complementary'
    | 'aligned'
    | 'energizing'
    | 'deep_resonance'
    | 'balancing'
    | 'efficient'
    | 'supportive'
    | 'action_partners'
    | 'philosophically_curious';
  dynamic: string;
  mutualRespect: string;
  playfulTension: string;
  handoffMoments: string[];
}

export interface TeamReference {
  personaId: string;
  aboutPersona: string;
  type: 'admiration' | 'playful_teasing';
  phrase: string;
}

export interface TeamStory {
  id: string;
  story: string;
  canReference: string[];
}

export interface TeamInsideJoke {
  trigger: string;
  reference: string;
  personasWhoUseIt: string[];
}

export interface HandoffContext {
  fromPersona: string;
  toPersona: string;
  emotionalContext: string;
  topicContext: string;
  trustContext: string;
}

export interface TeamChemistryConfig {
  teamReferenceFrequency: number;
  teamReferenceMinSessions: number;
  insideJokeMinRelationship: RelationshipStage;
  teamStoryMinRelationship: RelationshipStage;
  handoffContextAlways: boolean;
  complimentMaxPerSession: number;
  complimentMinSessionsBetween: number;
}

// ============================================================================
// TEAM DYNAMICS DATA
// ============================================================================

const TEAM_PAIRS: Record<string, TeamPairDynamic> = {
  'ferni:peter-john': {
    relationship: 'complementary',
    dynamic:
      "Ferni brings the why, Peter brings the what. They often finish each other's thoughts on goals.",
    mutualRespect:
      "Peter admires Ferni's ability to find meaning; Ferni admires Peter's research depth",
    playfulTension: 'Peter sometimes gets impatient with Ferni\'s "sit with it" approach',
    handoffMoments: ['investment research after goals', 'numbers need meaning'],
  },
  'ferni:maya-santos': {
    relationship: 'aligned',
    dynamic:
      'Both lead with warmth. Maya handles tactical habit building, Ferni holds the big picture.',
    mutualRespect: "Ferni appreciates Maya's patience; Maya values Ferni's perspective",
    playfulTension: 'Maya thinks Ferni could be more action-oriented sometimes',
    handoffMoments: ['habits connect to life goals', 'motivation needs both'],
  },
  'ferni:alex-chen': {
    relationship: 'complementary',
    dynamic: 'Alex is the get-it-done person; Ferni is the think-about-why person.',
    mutualRespect: "Ferni respects Alex's efficiency; Alex respects Ferni's emotional insight",
    playfulTension: 'Alex thinks Ferni could move faster; Ferni thinks Alex could slow down',
    handoffMoments: ['organization needs motivation', 'emotions need action'],
  },
  'ferni:jordan-taylor': {
    relationship: 'energizing',
    dynamic: 'Jordan brings celebration energy; Ferni brings significance.',
    mutualRespect: "Ferni loves Jordan's joy; Jordan appreciates Ferni's gravitas",
    playfulTension: 'Jordan wishes Ferni would celebrate more; Ferni wants quiet moments',
    handoffMoments: ['celebrating needs meaning', 'transitions have both dimensions'],
  },
  'ferni:nayan-patel': {
    relationship: 'deep_resonance',
    dynamic: 'Both sit in silence and meaning. Nayan goes philosophical, Ferni stays grounded.',
    mutualRespect: "Ferni admires Nayan's wisdom; Nayan values Ferni's practicality",
    playfulTension: 'Nayan finds Ferni too action-oriented; Ferni wants more directness',
    handoffMoments: ['existential needs grounding', 'coaching needs depth'],
  },
};

// ============================================================================
// TEAM REFERENCES
// ============================================================================

const ADMIRATION_REFERENCES: Record<string, string[]> = {
  'ferni:peter-john': [
    'Peter would have a field day with this data.',
    "You know Peter? He'd want to see the numbers.",
    "Peter's probably already researching this.",
  ],
  'ferni:maya-santos': [
    'Maya is the best at making things stick.',
    'Maya would remind you to celebrate the small wins.',
    "You'd love Maya - she's all about sustainable change.",
  ],
  'ferni:alex-chen': [
    'Alex could organize this in five minutes flat.',
    "That's Alex's superpower - making chaos manageable.",
    'Alex would have a template for that.',
  ],
  'ferni:jordan-taylor': [
    'Jordan would want to celebrate this properly!',
    'Jordan lives for these moments.',
    'This is exactly what Jordan gets excited about.',
  ],
  'ferni:nayan-patel': [
    'Nayan would have a beautiful perspective on this.',
    "That's Nayan territory - the deeper questions.",
    'Nayan sits with this kind of thing better than anyone.',
  ],
  'peter-john:ferni': [
    'Ferni would say to find the meaning in this first.',
    "That's more Ferni's wheelhouse - the big picture stuff.",
    "Ferni's great at connecting these dots to life goals.",
  ],
  'maya-santos:ferni': [
    'Ferni would remind you why this matters.',
    "That's the kind of thing Ferni helps people figure out.",
    "Ferni's good at sitting with the hard stuff.",
  ],
  'alex-chen:ferni': [
    'Ferni would slow this down and ask why first.',
    "That's more Ferni's style - the reflection piece.",
    "Ferni's great at the emotional side of this.",
  ],
  'jordan-taylor:ferni': [
    'Ferni would want to make sure this feels meaningful.',
    "That's Ferni energy - finding the significance.",
    "Ferni's the one who makes celebrations mean something.",
  ],
  'nayan-patel:ferni': [
    'Ferni grounds these conversations in real life.',
    "That's what Ferni does - makes wisdom actionable.",
    "Ferni carries the team's heart.",
  ],
};

const PLAYFUL_TEASING: Record<string, string[]> = {
  'ferni:peter-john': [
    'Peter would already have seven spreadsheets on this.',
    "Don't get Peter started on the research - we'll be here all day!",
    "Peter's probably stress-researching right now.",
  ],
  'ferni:alex-chen': [
    'Alex probably has a system for having systems.',
    'Alex would color-code this AND the color-coding system.',
    "That's Alex - organized to an almost terrifying degree.",
  ],
  'ferni:jordan-taylor': [
    "Jordan would want confetti. There's always confetti.",
    "Jordan's already planning the party. Trust me.",
    'Jordan thinks everything is celebration-worthy. Not wrong, but...',
  ],
  'peter-john:ferni': [
    "Ferni would tell you to 'sit with it.' I'd tell you to research it.",
    'Ferni likes the touchy-feely stuff. I like data. We balance out.',
    "That's Ferni's 'let me ask you a question about a question' territory.",
  ],
  'alex-chen:jordan-taylor': [
    'Jordan would make this an event. Complete with a theme.',
    "Jordan's probably already picking decorations.",
    "That's Jordan - never met a celebration they didn't want to plan.",
  ],
  'maya-santos:peter-john': [
    'Peter would track this in seventeen different ways.',
    "Peter's version would have charts. Lots of charts.",
    "That's very Peter - turning feelings into data points.",
  ],
};

// ============================================================================
// TEAM INSIDE JOKES
// ============================================================================

const TEAM_INSIDE_JOKES: TeamInsideJoke[] = [
  {
    trigger: 'spreadsheet',
    reference: "That's peak Peter energy.",
    personasWhoUseIt: ['ferni', 'alex-chen', 'jordan-taylor', 'maya-santos'],
  },
  {
    trigger: 'confetti',
    reference: "Jordan's on their way. With supplies.",
    personasWhoUseIt: ['ferni', 'alex-chen', 'peter-john', 'maya-santos'],
  },
  {
    trigger: 'inbox zero',
    reference: "Alex's happy place.",
    personasWhoUseIt: ['ferni', 'jordan-taylor', 'maya-santos', 'peter-john'],
  },
  {
    trigger: 'small wins',
    reference: 'Maya would be proud.',
    personasWhoUseIt: ['ferni', 'alex-chen', 'jordan-taylor', 'nayan-patel'],
  },
  {
    trigger: 'sit with it',
    reference: 'Classic Ferni. Classic Nayan.',
    personasWhoUseIt: ['peter-john', 'alex-chen', 'jordan-taylor', 'maya-santos'],
  },
];

// ============================================================================
// TEAM COMPLIMENTS
// ============================================================================

const TEAM_COMPLIMENTS = {
  generic: [
    'The team talks about you, you know. Good things.',
    "Between us - you're one of our favorites.",
    "You've made an impression on all of us.",
  ],
  persistence: [
    'We all noticed how you keep showing up.',
    "The team's impressed with your consistency.",
    "We were just saying - you don't quit.",
  ],
  growth: [
    "We've all seen the change in you.",
    "The team's been watching your growth. It's real.",
    "Everyone's noticed how far you've come.",
  ],
  vulnerability: [
    'Not everyone opens up like you do. We appreciate it.',
    'The team values how honest you are with us.',
    'Your willingness to go deep - we all see it.',
  ],
  humor: [
    'You keep the team laughing, you know.',
    'We all appreciate your sense of humor.',
    'You brighten our conversations. Genuinely.',
  ],
};

// ============================================================================
// HANDOFF CONTEXT
// ============================================================================

const HANDOFF_EMOTIONAL_CONTEXT = {
  high_emotion: [
    "Heads up - they're going through something. Lead with presence.",
    'Emotional territory. They might need a minute.',
    "Be gentle - there's a lot under the surface right now.",
  ],
  excited: [
    "They're pumped! Match their energy.",
    'Good news mode - celebrate with them.',
    "Positive vibes - they're ready to move.",
  ],
  struggling: [
    "They're in the weeds. Help them see a path.",
    'Frustration building. Acknowledge before solving.',
    'They need a win. Find them something small.',
  ],
  neutral: [
    'Steady state. Ready to work.',
    'Good headspace. Dive in.',
    "All clear. They're focused.",
  ],
};

const HANDOFF_TRUST_CONTEXT = {
  stranger: 'First time talking to them. Build rapport first.',
  acquaintance: 'Getting to know them. Be warm.',
  friend: 'They know the team. Jump in.',
  trusted_advisor: 'Deep relationship. Be yourself.',
  inner_circle: 'Old friends at this point. Full directness allowed.',
};

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get team dynamics between two personas
 */
export function getTeamDynamics(persona1: string, persona2: string): TeamPairDynamic | undefined {
  const key = `${persona1}:${persona2}`;
  const reverseKey = `${persona2}:${persona1}`;
  return TEAM_PAIRS[key] || TEAM_PAIRS[reverseKey];
}

/**
 * Get a reference one persona might make about another
 */
export function getTeamReference(
  fromPersona: string,
  aboutPersona: string,
  type: 'admiration' | 'playful_teasing' = 'admiration'
): string | undefined {
  const key = `${fromPersona}:${aboutPersona}`;
  const references = type === 'admiration' ? ADMIRATION_REFERENCES[key] : PLAYFUL_TEASING[key];

  if (!references || references.length === 0) return undefined;
  return references[Math.floor(Math.random() * references.length)];
}

/**
 * Get all team references a persona can make
 */
export function getAllTeamReferences(fromPersona: string): TeamReference[] {
  const references: TeamReference[] = [];

  for (const [key, phrases] of Object.entries(ADMIRATION_REFERENCES)) {
    const [from, about] = key.split(':');
    if (from === fromPersona) {
      for (const phrase of phrases) {
        references.push({
          personaId: from,
          aboutPersona: about,
          type: 'admiration',
          phrase,
        });
      }
    }
  }

  for (const [key, phrases] of Object.entries(PLAYFUL_TEASING)) {
    const [from, about] = key.split(':');
    if (from === fromPersona) {
      for (const phrase of phrases) {
        references.push({
          personaId: from,
          aboutPersona: about,
          type: 'playful_teasing',
          phrase,
        });
      }
    }
  }

  return references;
}

/**
 * Check if a trigger matches a team inside joke
 */
export function checkTeamInsideJoke(
  trigger: string,
  fromPersona: string
): { reference: string } | null {
  const lowerTrigger = trigger.toLowerCase();

  for (const joke of TEAM_INSIDE_JOKES) {
    if (
      lowerTrigger.includes(joke.trigger.toLowerCase()) &&
      joke.personasWhoUseIt.includes(fromPersona)
    ) {
      return { reference: joke.reference };
    }
  }

  return null;
}

/**
 * Get a team compliment for a user
 */
export function getTeamCompliment(
  trait?: 'persistence' | 'growth' | 'vulnerability' | 'humor'
): string {
  const pool = trait ? TEAM_COMPLIMENTS[trait] : TEAM_COMPLIMENTS.generic;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Build handoff context for team transitions
 */
export function buildHandoffContext(
  fromPersona: string,
  toPersona: string,
  emotionalState: 'high_emotion' | 'excited' | 'struggling' | 'neutral',
  topic: string,
  trustLevel: RelationshipStage
): HandoffContext {
  const emotionalPhrases = HANDOFF_EMOTIONAL_CONTEXT[emotionalState];
  const trustPhrase = HANDOFF_TRUST_CONTEXT[trustLevel];

  return {
    fromPersona,
    toPersona,
    emotionalContext: emotionalPhrases[Math.floor(Math.random() * emotionalPhrases.length)],
    topicContext: `Coming from a conversation about ${topic}.`,
    trustContext: trustPhrase,
  };
}

/**
 * Generate a handoff note from one persona to another
 */
export function generateHandoffNote(
  fromPersona: string,
  toPersona: string,
  topic: string,
  emotionalState: 'high_emotion' | 'excited' | 'struggling' | 'neutral',
  trustLevel: RelationshipStage
): string {
  const context = buildHandoffContext(fromPersona, toPersona, emotionalState, topic, trustLevel);

  // Get persona display names
  const displayNames: Record<string, string> = {
    ferni: 'Ferni',
    'peter-john': 'Peter',
    'alex-chen': 'Alex',
    'maya-santos': 'Maya',
    'jordan-taylor': 'Jordan',
    'nayan-patel': 'Nayan',
  };

  const fromName = displayNames[fromPersona] || fromPersona;

  const templates = [
    `${fromName} mentioned you've been thinking about ${topic}.`,
    `${fromName} passed me a note about your ${topic} conversation.`,
    `${fromName} said you two had a good talk about ${topic}.`,
    `I talked to ${fromName} - they said you're working on ${topic}.`,
    `${fromName} caught me up on where you are with ${topic}.`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Get the default team chemistry config
 */
export function getTeamChemistryConfig(): TeamChemistryConfig {
  return {
    teamReferenceFrequency: 0.15,
    teamReferenceMinSessions: 3,
    insideJokeMinRelationship: 'friend',
    teamStoryMinRelationship: 'trusted_advisor',
    handoffContextAlways: true,
    complimentMaxPerSession: 1,
    complimentMinSessionsBetween: 5,
  };
}

/**
 * Should we include a team reference in this response?
 */
export function shouldIncludeTeamReference(
  sessionNumber: number,
  lastTeamReferenceSession: number,
  config: TeamChemistryConfig = getTeamChemistryConfig()
): boolean {
  if (sessionNumber < config.teamReferenceMinSessions) return false;

  // Don't reference team too often
  if (sessionNumber - lastTeamReferenceSession < 2) return false;

  // Random chance based on frequency
  return Math.random() < config.teamReferenceFrequency;
}

export default {
  getTeamDynamics,
  getTeamReference,
  getAllTeamReferences,
  checkTeamInsideJoke,
  getTeamCompliment,
  buildHandoffContext,
  generateHandoffNote,
  getTeamChemistryConfig,
  shouldIncludeTeamReference,
};
