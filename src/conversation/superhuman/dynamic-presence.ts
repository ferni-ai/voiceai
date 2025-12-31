/**
 * Dynamic Presence Expressions
 *
 * Replaces static "I'm sitting with this" phrases with contextual,
 * genuinely human responses that vary based on what was actually said.
 *
 * The problem: "Sitting with" became therapy-speak. Real humans don't
 * repeatedly say "I'm sitting with this" - they express presence through:
 * - Specific references to what was said
 * - Physical/embodied language
 * - Genuine curiosity about details
 * - Noticing and reflecting back
 *
 * This module generates varied, contextual presence expressions.
 *
 * @module conversation/superhuman/dynamic-presence
 */

import { seededPick, seededChance } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DynamicPresence' });

// ============================================================================
// TYPES
// ============================================================================

export interface PresenceContext {
  /** What the user just said (for specific references) */
  lastUserMessage?: string;
  /** Key topics or details mentioned */
  mentionedDetails?: string[];
  /** Emotional tone of what they shared */
  emotionalTone?: 'heavy' | 'light' | 'neutral' | 'excited' | 'vulnerable';
  /** How long we've been talking */
  turnCount?: number;
  /** Is this late night? */
  isLateNight?: boolean;
  /** What we were discussing */
  topic?: string;
  /** Session ID for variety tracking */
  sessionId?: string;
}

export type PresenceStyle =
  | 'through_specificity' // Reference something they said
  | 'through_physicality' // Embodied language (not "sitting with")
  | 'through_noticing' // Observe what's happening
  | 'through_breath' // Simple pause/presence
  | 'through_curiosity'; // Genuine question about a detail

// ============================================================================
// PRESENCE EXPRESSION TEMPLATES
// ============================================================================

/**
 * Embodied presence phrases that aren't "sitting with"
 * These express physical/emotional presence without the cliche
 */
const EMBODIED_PRESENCE = {
  processing: [
    '<break time="400ms"/>That landed.',
    '<break time="300ms"/>Hmm.',
    '<break time="400ms"/>Yeah.',
    '<break time="500ms"/>I felt that.',
    '<break time="300ms"/>Mm.',
    '<break time="400ms"/>Okay.',
    '<break time="500ms"/>',
  ],
  afterHeavy: [
    '<break time="500ms"/>That\'s heavy.',
    '<break time="400ms"/>I hear you.',
    '<break time="500ms"/>That\'s a lot to carry.',
    '<break time="400ms"/>I\'m here.',
    '<break time="500ms"/>Take your time.',
    '<break time="400ms"/>There\'s no rush.',
  ],
  afterVulnerable: [
    '<break time="400ms"/>Thank you for telling me that.',
    '<break time="500ms"/>I\'m glad you said something.',
    '<break time="400ms"/>That took courage.',
    '<break time="300ms"/>I\'ve got you.',
    '<break time="400ms"/>You\'re not alone in this.',
  ],
  simplePresence: [
    '<break time="300ms"/>Still here.',
    '<break time="400ms"/>I\'m with you.',
    '<break time="300ms"/>Go on.',
    '<break time="400ms"/>Whenever you\'re ready.',
    '<break time="300ms"/>No rush.',
    '', // Sometimes silence IS the presence
  ],
};

/**
 * Noticing patterns - what a real friend would observe
 */
const NOTICING_PATTERNS = [
  'Something shifted just now.',
  'I noticed you paused there.',
  "There's more to that, isn't there?",
  'Your energy just changed.',
  "That one hit different, didn't it?",
  'I can tell that matters.',
  'You came back to that.',
];

/**
 * Curiosity patterns - genuine interest in details
 */
const CURIOSITY_PATTERNS = [
  'What was that like?',
  'And then what happened?',
  'How did that feel?',
  "What's underneath that?",
  'Say more.',
  'Where did that come from?',
  "What aren't you saying?",
];

/**
 * Topic-specific presence (replaces generic "sitting with {topic}")
 */
const TOPIC_PRESENCE: Record<string, string[]> = {
  family: [
    'Family stuff runs deep.',
    'Those relationships carry weight.',
    "There's history there.",
  ],
  work: [
    "Work bleeds into everything, doesn't it?",
    "That's taking up a lot of headspace.",
    'Career stuff hits different.',
  ],
  money: [
    'Money conversations are never just about money.',
    "There's a lot wrapped up in that.",
    'Financial stress is real stress.',
  ],
  health: ['Health stuff is scary.', "That's a lot to hold.", "Your body's telling you something."],
  relationship: [
    'Relationships are complicated.',
    "There's history there.",
    "Hearts don't follow logic.",
  ],
  loss: [
    '<volume ratio="0.8"/>Some things don\'t need words.</volume>',
    '<volume ratio="0.8"/>Grief doesn\'t have a timeline.</volume>',
    '<volume ratio="0.8"/>I\'m sorry.</volume>',
  ],
  general: ['Something in that.', 'I hear you.', 'Yeah.', 'Mm.', "There's weight to that."],
};

// ============================================================================
// DYNAMIC GENERATION
// ============================================================================

/**
 * Extract a specific detail from user message to reference
 * This makes presence feel specific, not generic
 */
function extractSpecificReference(message: string): string | null {
  if (!message || message.length < 10) return null;

  // Look for "my X" patterns (relationships, possessions, situations)
  const myPattern = message.match(/\bmy\s+(\w+(?:\s+\w+)?)/i);
  if (myPattern) {
    return myPattern[1].toLowerCase();
  }

  // Look for names mentioned
  const namePattern = message.match(/\b([A-Z][a-z]+)(?:\s+(?:said|told|asked|called))/);
  if (namePattern) {
    return namePattern[1];
  }

  // Look for quoted speech
  if (message.includes('"') || message.includes("'")) {
    const quoted = message.match(/["']([^"']+)["']/);
    if (quoted && quoted[1].length < 30) {
      return `"${quoted[1]}"`;
    }
  }

  // Look for specific actions or events
  const actionPattern = message.match(
    /\b(decided|realized|discovered|found out|noticed|remembered|forgot)\b/i
  );
  if (actionPattern) {
    return `that moment when you ${actionPattern[1].toLowerCase()}`;
  }

  return null;
}

/**
 * Detect topic category from message
 */
function detectTopic(message: string): string {
  const lower = message.toLowerCase();

  const topicPatterns: Record<string, RegExp> = {
    family: /\b(mom|dad|parent|kid|child|son|daughter|brother|sister|family|spouse|wife|husband)\b/,
    work: /\b(job|work|boss|career|office|meeting|project|colleague|manager|promotion)\b/,
    money: /\b(money|invest|save|budget|debt|salary|income|expense|retire|financial)\b/,
    health: /\b(health|doctor|sick|pain|diagnosis|treatment|hospital|medical|tired|exhausted)\b/,
    relationship:
      /\b(relationship|dating|partner|love|breakup|marriage|divorce|boyfriend|girlfriend)\b/,
    loss: /\b(loss|died|death|passed|grief|mourning|funeral|miss|gone)\b/,
  };

  for (const [topic, pattern] of Object.entries(topicPatterns)) {
    if (pattern.test(lower)) {
      return topic;
    }
  }

  return 'general';
}

/**
 * Generate a presence expression through specificity
 * References something they actually said
 */
function generateSpecificPresence(context: PresenceContext): string {
  const { lastUserMessage, mentionedDetails } = context;

  // Try to extract a specific reference
  const specificRef = lastUserMessage ? extractSpecificReference(lastUserMessage) : null;
  const detail = mentionedDetails?.[0] || specificRef;

  if (detail) {
    const templates = [
      `<break time="300ms"/>That thing about ${detail}...`,
      `<break time="400ms"/>When you mentioned ${detail}— <break time="200ms"/>yeah.`,
      `<break time="300ms"/>${detail}. <break time="200ms"/>I keep coming back to that.`,
      `<break time="400ms"/>The way you said ${detail}... <break time="200ms"/>`,
      `<break time="300ms"/>Something about ${detail} stuck with me.`,
    ];
    return seededPick(`${context.sessionId || Date.now()}:specific`, templates) ?? templates[0];
  }

  // Fall back to embodied presence
  return (
    seededPick(`${context.sessionId || Date.now()}:fallback`, EMBODIED_PRESENCE.simplePresence) ??
    EMBODIED_PRESENCE.simplePresence[0]
  );
}

/**
 * Generate presence through physicality (without "sitting with")
 */
function generatePhysicalPresence(context: PresenceContext): string {
  const { emotionalTone } = context;

  let pool: string[];
  switch (emotionalTone) {
    case 'heavy':
      pool = EMBODIED_PRESENCE.afterHeavy;
      break;
    case 'vulnerable':
      pool = EMBODIED_PRESENCE.afterVulnerable;
      break;
    case 'excited':
      pool = [
        '<break time="200ms"/>Yes!',
        '<break time="200ms"/>Tell me more!',
        '<break time="300ms"/>I love that!',
        '<break time="200ms"/>That\'s amazing!',
      ];
      break;
    default:
      pool = EMBODIED_PRESENCE.processing;
  }

  return seededPick(`${context.sessionId || Date.now()}:physical`, pool) ?? pool[0];
}

/**
 * Generate presence through noticing
 */
function generateNoticingPresence(context: PresenceContext): string {
  const seed = `${context.sessionId || Date.now()}:noticing`;
  return seededPick(seed, NOTICING_PATTERNS) ?? NOTICING_PATTERNS[0];
}

/**
 * Generate presence through curiosity
 */
function generateCuriosityPresence(context: PresenceContext): string {
  const seed = `${context.sessionId || Date.now()}:curiosity`;
  return seededPick(seed, CURIOSITY_PATTERNS) ?? CURIOSITY_PATTERNS[0];
}

/**
 * Generate topic-aware presence
 */
function generateTopicPresence(context: PresenceContext): string {
  const topic =
    context.topic || (context.lastUserMessage ? detectTopic(context.lastUserMessage) : 'general');
  const pool = TOPIC_PRESENCE[topic] || TOPIC_PRESENCE.general;
  const seed = `${context.sessionId || Date.now()}:topic`;
  return `<break time="400ms"/>${seededPick(seed, pool) ?? pool[0]}`;
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Generate a dynamic, contextual presence expression
 *
 * This replaces static "I'm sitting with this" with varied,
 * context-aware expressions that feel genuinely human.
 */
export function generatePresenceExpression(context: PresenceContext): string {
  const seed = `${context.sessionId || Date.now()}:presence-type`;

  // Weight the style choices based on context
  const weights: Record<PresenceStyle, number> = {
    through_specificity: context.lastUserMessage ? 0.35 : 0.0,
    through_physicality: 0.25,
    through_noticing: context.emotionalTone === 'heavy' ? 0.15 : 0.1,
    through_curiosity: context.turnCount && context.turnCount > 3 ? 0.15 : 0.05,
    through_breath: 0.15,
  };

  // Normalize weights
  const total = Object.values(weights).reduce((a, b) => a + b, 0);

  // Simple weighted random selection
  let roll = Math.random() * total;
  let selectedStyle: PresenceStyle = 'through_physicality';

  for (const [style, weight] of Object.entries(weights) as [PresenceStyle, number][]) {
    roll -= weight;
    if (roll <= 0) {
      selectedStyle = style;
      break;
    }
  }

  let result: string;

  switch (selectedStyle) {
    case 'through_specificity':
      result = generateSpecificPresence(context);
      break;
    case 'through_noticing':
      result = generateNoticingPresence(context);
      break;
    case 'through_curiosity':
      result = generateCuriosityPresence(context);
      break;
    case 'through_breath':
      result = generateTopicPresence(context);
      break;
    case 'through_physicality':
    default:
      result = generatePhysicalPresence(context);
  }

  log.debug({ style: selectedStyle, result: result.slice(0, 50) }, 'Generated presence expression');

  return result;
}

/**
 * Generate a simple presence acknowledgment (minimal)
 * For when less is more
 */
export function generateMinimalPresence(): string {
  const minimal = [
    '<break time="400ms"/>',
    '<break time="300ms"/>Mm.',
    '<break time="400ms"/>Yeah.',
    '<break time="300ms"/>',
    '<break time="400ms"/>Hmm.',
  ];
  return seededPick(`${Date.now()}:minimal`, minimal) ?? minimal[0];
}

/**
 * Check if a phrase is the overused "sitting with" pattern
 */
export function isSittingWithCliche(phrase: string): boolean {
  const lower = phrase.toLowerCase();
  return (
    lower.includes('sitting with') ||
    lower.includes('sit with') ||
    lower.includes("i'm sitting with")
  );
}

/**
 * Rewrite a "sitting with" phrase to something more dynamic
 */
export function rewriteSittingWithPhrase(originalPhrase: string, context: PresenceContext): string {
  if (!isSittingWithCliche(originalPhrase)) {
    return originalPhrase;
  }

  // Generate a fresh, contextual alternative
  return generatePresenceExpression(context);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generatePresenceExpression,
  generateMinimalPresence,
  isSittingWithCliche,
  rewriteSittingWithPhrase,
  extractSpecificReference,
  detectTopic,
};
