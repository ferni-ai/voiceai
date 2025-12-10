/**
 * Small Wins Celebrator
 *
 * Noticing effort, not just outcomes - celebrating the small
 * courage moments that often go unacknowledged.
 *
 * Philosophy: Big wins get celebrated by everyone. But the small
 * acts of courage - sending that email, making that call, showing
 * up when you didn't want to - those need a witness too.
 *
 * This system tracks:
 * - Things they said they'd do (and did)
 * - Small acts of courage mentioned
 * - Progress on difficult things
 * - Following through on intentions
 * - Effort regardless of outcome
 *
 * @module SmallWins
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SmallWins' });

// ============================================================================
// TYPES
// ============================================================================

export interface SmallWin {
  id: string;

  /** What type of win this is */
  type:
    | 'followed_through' // Did what they said they'd do
    | 'courage_moment' // Did something scary
    | 'self_care' // Took care of themselves
    | 'boundary_held' // Maintained a boundary
    | 'hard_conversation' // Had a difficult talk
    | 'showed_up' // Was present when it was hard
    | 'tried_new_thing' // Stepped outside comfort zone
    | 'asked_for_help' // Reached out
    | 'let_it_go' // Released something they were holding
    | 'effort_made'; // Tried, regardless of outcome

  /** Description of the win */
  description: string;

  /** What made this hard for them specifically */
  whatMadeItHard?: string;

  /** When this happened */
  timestamp: Date;

  /** Whether we've celebrated this */
  celebrated: boolean;

  /** How they responded to celebration */
  celebrationResponse?: 'appreciated' | 'dismissed' | 'emotional';
}

export interface PendingIntention {
  id: string;

  /** What they said they'd do */
  intention: string;

  /** When they stated this intention */
  statedAt: Date;

  /** When they said they'd do it by */
  targetTime?: Date;

  /** Keywords to detect completion */
  completionKeywords: string[];

  /** Status of this intention */
  status: 'pending' | 'completed' | 'abandoned' | 'struggled';

  /** If completed, the win that was created */
  linkedWinId?: string;
}

export interface SmallWinsProfile {
  userId: string;

  /** All recorded small wins */
  wins: SmallWin[];

  /** Stated intentions we're watching for */
  pendingIntentions: PendingIntention[];

  /** Things we know are hard for them */
  knownDifficulties: string[];

  /** Celebration style preferences */
  celebrationPreference: 'enthusiastic' | 'understated' | 'reflective';
}

export interface CelebrationOpportunity {
  win: SmallWin;
  celebration: string;
  ssml: string;
  intensity: 'big' | 'medium' | 'small';
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** Patterns indicating they did something they'd mentioned */
const FOLLOW_THROUGH_PATTERNS = [
  /i (finally |actually )?(did|made|sent|called|finished|completed)/i,
  /i went (ahead and|through with)/i,
  /i (talked to|told|asked|confronted)/i,
  /got it done/i,
  /checked (that|it) off/i,
];

/** Patterns indicating courage moments */
const COURAGE_PATTERNS = [
  /i was (scared|nervous|terrified|anxious) but/i,
  /even though (i|it) was (hard|scary|difficult)/i,
  /i pushed (through|myself)/i,
  /i (forced|made) myself/i,
  /i didn't want to but/i,
  /it was (hard|scary|difficult) but i/i,
];

/** Patterns indicating self-care */
const SELF_CARE_PATTERNS = [
  /i (took|gave myself) a (break|rest|day off|moment)/i,
  /i said no to/i,
  /i prioritized (myself|my health|my needs)/i,
  /i (went to bed early|got sleep|rested)/i,
  /i asked for (help|support)/i,
];

/** Patterns indicating effort (regardless of outcome) */
const EFFORT_PATTERNS = [
  /i tried/i,
  /i gave it (a shot|my best)/i,
  /i attempted/i,
  /it didn't work out but/i,
  /i showed up/i,
  /i made the effort/i,
];

/** Patterns indicating stated intentions */
const INTENTION_PATTERNS = [
  /i('m going to|'ll|need to|should|want to|have to) (.+?)( tomorrow| today| this week| soon| later)?$/i,
  /i('ve been meaning|'ve been wanting|keep meaning) to (.+)/i,
  /i really (need|should|have) to (.+)/i,
];

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const profiles = new Map<string, SmallWinsProfile>();

function getOrCreateProfile(userId: string): SmallWinsProfile {
  let profile = profiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      wins: [],
      pendingIntentions: [],
      knownDifficulties: [],
      celebrationPreference: 'understated',
    };
    profiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// WIN DETECTION
// ============================================================================

/**
 * Analyze a message for small wins
 */
export function detectSmallWin(
  userId: string,
  userMessage: string,
  context?: {
    topic?: string;
    emotion?: string;
    emotionIntensity?: number;
  }
): SmallWin | null {
  const profile = getOrCreateProfile(userId);
  const lower = userMessage.toLowerCase();

  // Check for follow-through on stated intentions
  const followThrough = checkIntentionCompletion(profile, lower, userMessage);
  if (followThrough) return followThrough;

  // Check for courage moments
  if (COURAGE_PATTERNS.some((p) => p.test(lower))) {
    return createWin(profile, 'courage_moment', userMessage, 'Doing something that was scary');
  }

  // Check for self-care
  if (SELF_CARE_PATTERNS.some((p) => p.test(lower))) {
    return createWin(profile, 'self_care', userMessage, 'Prioritizing themselves');
  }

  // Check for effort (even without success)
  if (EFFORT_PATTERNS.some((p) => p.test(lower))) {
    return createWin(profile, 'effort_made', userMessage, 'Making the effort to try');
  }

  // Check for follow-through patterns
  if (FOLLOW_THROUGH_PATTERNS.some((p) => p.test(lower))) {
    return createWin(profile, 'followed_through', userMessage, 'Following through');
  }

  return null;
}

/**
 * Check if message indicates completion of a stated intention
 */
function checkIntentionCompletion(
  profile: SmallWinsProfile,
  lower: string,
  original: string
): SmallWin | null {
  for (const intention of profile.pendingIntentions) {
    if (intention.status !== 'pending') continue;

    // Check if any completion keywords match
    const matches = intention.completionKeywords.some((kw) => lower.includes(kw));

    // Also check for explicit completion language
    const explicitComplete =
      lower.includes('did it') ||
      lower.includes('i did') ||
      lower.includes('finally') ||
      lower.includes('actually');

    if (matches || explicitComplete) {
      intention.status = 'completed';

      const win = createWin(
        profile,
        'followed_through',
        original,
        `Following through on: ${intention.intention}`
      );

      intention.linkedWinId = win.id;

      log.info(
        { userId: profile.userId, intention: intention.intention },
        '🎯 Intention completed!'
      );

      return win;
    }
  }

  return null;
}

/**
 * Create and store a small win
 */
function createWin(
  profile: SmallWinsProfile,
  type: SmallWin['type'],
  message: string,
  whatMadeItHard?: string
): SmallWin {
  const win: SmallWin = {
    id: `win_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    description: message.slice(0, 200),
    whatMadeItHard,
    timestamp: new Date(),
    celebrated: false,
  };

  profile.wins.push(win);

  // Keep only last 50 wins
  if (profile.wins.length > 50) {
    profile.wins = profile.wins.slice(-50);
  }

  log.debug(
    { userId: profile.userId, type, description: message.slice(0, 50) },
    '🏆 Small win detected'
  );

  return win;
}

// ============================================================================
// INTENTION TRACKING
// ============================================================================

/**
 * Detect and store stated intentions
 */
export function detectIntention(userId: string, userMessage: string): PendingIntention | null {
  const profile = getOrCreateProfile(userId);

  for (const pattern of INTENTION_PATTERNS) {
    const match = userMessage.match(pattern);
    if (match && match[2]) {
      const intentionText = match[2].trim();

      // Skip if too short or generic
      if (intentionText.length < 5) continue;

      // Extract completion keywords
      const keywords = extractCompletionKeywords(intentionText);

      const intention: PendingIntention = {
        id: `intent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        intention: intentionText,
        statedAt: new Date(),
        completionKeywords: keywords,
        status: 'pending',
      };

      // Check for time reference
      const timeMatch = userMessage.match(/(tomorrow|today|this week|soon|later)/i);
      if (timeMatch) {
        intention.targetTime = parseTargetTime(timeMatch[1]);
      }

      profile.pendingIntentions.push(intention);

      // Keep only last 20 intentions
      if (profile.pendingIntentions.length > 20) {
        profile.pendingIntentions = profile.pendingIntentions.slice(-20);
      }

      log.debug({ userId, intention: intentionText }, '📋 Intention recorded');

      return intention;
    }
  }

  return null;
}

/**
 * Extract keywords that would indicate completion
 */
function extractCompletionKeywords(intention: string): string[] {
  const keywords: string[] = [];
  const words = intention.toLowerCase().split(/\s+/);

  // Get meaningful words
  const meaningful = words.filter(
    (w) => w.length > 3 && !['that', 'this', 'with', 'them', 'about', 'just', 'really'].includes(w)
  );

  keywords.push(...meaningful.slice(0, 5));

  // Add verb completions
  const verbs = ['call', 'email', 'text', 'talk', 'ask', 'send', 'finish', 'start'];
  for (const verb of verbs) {
    if (intention.toLowerCase().includes(verb)) {
      keywords.push(
        `called`,
        `emailed`,
        `texted`,
        `talked`,
        `asked`,
        `sent`,
        `finished`,
        `started`
      );
    }
  }

  return [...new Set(keywords)];
}

/**
 * Parse target time from text
 */
function parseTargetTime(timeRef: string): Date {
  const now = new Date();
  const lower = timeRef.toLowerCase();

  if (lower === 'today') {
    return new Date(now.setHours(23, 59, 59));
  } else if (lower === 'tomorrow') {
    return new Date(now.setDate(now.getDate() + 1));
  } else if (lower === 'this week') {
    return new Date(now.setDate(now.getDate() + 7));
  } else {
    return new Date(now.setDate(now.getDate() + 3)); // "soon" or "later"
  }
}

// ============================================================================
// CELEBRATION GENERATION
// ============================================================================

/**
 * Generate a celebration for an uncelebrated win
 */
export function generateCelebration(userId: string, win?: SmallWin): CelebrationOpportunity | null {
  const profile = profiles.get(userId);
  if (!profile) return null;

  // If no win provided, find an uncelebrated one
  const targetWin = win || profile.wins.find((w) => !w.celebrated && isRecent(w.timestamp, 30));

  if (!targetWin) return null;

  // Generate based on win type and user preference
  const celebration = createCelebration(targetWin, profile.celebrationPreference);

  return {
    win: targetWin,
    celebration: celebration.text,
    ssml: celebration.ssml,
    intensity: getIntensity(targetWin.type),
  };
}

/**
 * Create celebration text based on win type
 */
function createCelebration(
  win: SmallWin,
  preference: SmallWinsProfile['celebrationPreference']
): { text: string; ssml: string } {
  const celebrations: Record<SmallWin['type'], Record<string, string[]>> = {
    followed_through: {
      enthusiastic: [
        "You did it! You actually did it! That's huge!",
        "Wait - you followed through on that? That's amazing!",
      ],
      understated: [
        'Hey, you did that thing. That matters.',
        "You followed through. That's not nothing.",
      ],
      reflective: [
        'You did what you said you would. That says something about who you are.',
        'Following through, even on small things, builds trust with yourself.',
      ],
    },
    courage_moment: {
      enthusiastic: [
        "That took guts! I'm genuinely impressed!",
        "You did the scary thing! That's brave!",
      ],
      understated: ["That wasn't easy. Good for you.", 'Doing scared is still doing. Well done.'],
      reflective: [
        "Courage isn't the absence of fear. It's doing it anyway. Like you just did.",
        "You chose discomfort over regret. That's growth.",
      ],
    },
    self_care: {
      enthusiastic: [
        'Yes! Taking care of yourself! I love to see it!',
        "Self-care for the win! That's what I'm talking about!",
      ],
      understated: [
        'Good. You needed that.',
        "Taking care of yourself isn't selfish. It's necessary.",
      ],
      reflective: [
        "Prioritizing yourself is a skill. You're getting better at it.",
        "You recognized what you needed and honored it. That's wisdom.",
      ],
    },
    boundary_held: {
      enthusiastic: ["You held that line! That's powerful!", 'Boundaries! Yes! So proud of you!'],
      understated: ["You held your ground. That's hard.", 'Boundaries protected. Well done.'],
      reflective: [
        'Every time you hold a boundary, you teach people how to treat you.',
        'That boundary is a gift you gave yourself.',
      ],
    },
    hard_conversation: {
      enthusiastic: [
        'You had THE conversation! That takes so much courage!',
        "Wow, you actually talked to them! That's huge!",
      ],
      understated: [
        'Hard conversations are hard. You had it anyway.',
        'You said what needed to be said. Respect.',
      ],
      reflective: [
        'Difficult conversations are bridges. You chose connection over comfort.',
        "Speaking your truth, even when it's hard, is how trust is built.",
      ],
    },
    showed_up: {
      enthusiastic: ["You showed up! Even when you didn't want to! That's everything!"],
      understated: ['Showing up is half the battle. You won it.', 'You were there. That counts.'],
      reflective: [
        "Showing up when it's hard is how you prove things to yourself.",
        'Presence is a gift. You gave it.',
      ],
    },
    tried_new_thing: {
      enthusiastic: [
        "You tried something new! That's amazing!",
        'Comfort zone? Expanded! Love it!',
      ],
      understated: [
        'New things are uncomfortable. You did it anyway.',
        "You tried. That's more than most.",
      ],
      reflective: [
        'Growth lives outside the comfort zone. You visited.',
        'Every new thing you try expands who you can become.',
      ],
    },
    asked_for_help: {
      enthusiastic: [
        "You asked for help! That's so strong!",
        'Reaching out takes courage! Proud of you!',
      ],
      understated: [
        'Asking for help is strength, not weakness.',
        "You reached out. That's hard for a lot of people.",
      ],
      reflective: [
        "The bravest thing you can do is admit you can't do it alone.",
        'Connection requires vulnerability. You chose it.',
      ],
    },
    let_it_go: {
      enthusiastic: ["You let it go! Freedom! That's beautiful!"],
      understated: ['Letting go is hard. You did it.', 'You released it. That takes strength.'],
      reflective: [
        'Holding on is easy. Letting go is the real work.',
        'Some things can only be solved by releasing them.',
      ],
    },
    effort_made: {
      enthusiastic: ["You tried! The outcome doesn't define the effort!"],
      understated: [
        "You made the effort. That's what matters.",
        'Trying is the win. Outcomes are just information.',
      ],
      reflective: [
        'Effort is the only thing fully in your control. You showed up for it.',
        'The attempt itself changes you. The result is secondary.',
      ],
    },
  };

  const options = celebrations[win.type]?.[preference] ||
    celebrations[win.type]?.understated || ["That's worth acknowledging."];

  const text = options[Math.floor(Math.random() * options.length)];

  // Create SSML with appropriate emotion and pacing
  const ssml = text
    .replace(/!/g, '! <break time="200ms"/>')
    .replace(/\. /g, '. <break time="300ms"/>');

  return { text, ssml };
}

/**
 * Get celebration intensity based on win type
 */
function getIntensity(type: SmallWin['type']): 'big' | 'medium' | 'small' {
  const bigWins: Array<SmallWin['type']> = ['courage_moment', 'hard_conversation', 'boundary_held'];
  const mediumWins: Array<SmallWin['type']> = ['followed_through', 'self_care', 'asked_for_help'];

  if (bigWins.includes(type)) return 'big';
  if (mediumWins.includes(type)) return 'medium';
  return 'small';
}

/**
 * Check if a timestamp is within the last N minutes
 */
function isRecent(timestamp: Date, minutes: number): boolean {
  const diff = Date.now() - timestamp.getTime();
  return diff < minutes * 60 * 1000;
}

/**
 * Record celebration response
 */
export function recordCelebrationResponse(
  userId: string,
  winId: string,
  response: 'appreciated' | 'dismissed' | 'emotional'
): void {
  const profile = profiles.get(userId);
  if (!profile) return;

  const win = profile.wins.find((w) => w.id === winId);
  if (win) {
    win.celebrated = true;
    win.celebrationResponse = response;

    // Update preference based on response
    if (response === 'dismissed') {
      profile.celebrationPreference = 'understated';
    } else if (response === 'emotional' || response === 'appreciated') {
      // Keep or slightly increase
    }

    log.debug({ userId, winId, response }, '🎉 Celebration response recorded');
  }
}

// ============================================================================
// PROFILE ACCESS
// ============================================================================

/**
 * Get pending intentions for a user
 */
export function getPendingIntentions(userId: string): PendingIntention[] {
  const profile = profiles.get(userId);
  return profile?.pendingIntentions.filter((i) => i.status === 'pending') || [];
}

/**
 * Get overdue intentions that need follow-up
 * Returns intentions where target time has passed or it's been a while since stated
 */
export function getOverdueIntentions(
  userId: string,
  options?: {
    maxDaysOld?: number; // Default 7 days
    includeNoTarget?: boolean; // Include intentions without target time
  }
): PendingIntention[] {
  const profile = profiles.get(userId);
  if (!profile) return [];

  const maxDays = options?.maxDaysOld ?? 7;
  const includeNoTarget = options?.includeNoTarget ?? true;
  const now = new Date();

  return profile.pendingIntentions.filter((intention) => {
    if (intention.status !== 'pending') return false;

    // Check if target time has passed
    if (intention.targetTime) {
      return intention.targetTime < now;
    }

    // For intentions without target, check if they're old enough to warrant follow-up
    if (includeNoTarget) {
      const daysSinceStated =
        (now.getTime() - intention.statedAt.getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceStated >= 2 && daysSinceStated <= maxDays;
    }

    return false;
  });
}

/**
 * Generate a follow-up question for an intention
 * These are warm, non-judgmental check-ins
 */
export function generateIntentionFollowUp(intention: PendingIntention): {
  question: string;
  ssml: string;
  tone: 'curious' | 'supportive' | 'celebratory';
} {
  const templates = {
    curious: [
      `Hey, I remembered you mentioned wanting to ${intention.intention}. How'd that go?`,
      `I've been thinking about that thing you said about ${intention.intention}. Did you get a chance to?`,
      `Last time we talked, you mentioned ${intention.intention}. What happened with that?`,
    ],
    supportive: [
      `No pressure, but I remembered you were going to ${intention.intention}. How are you feeling about it?`,
      `I know you mentioned ${intention.intention}. Just curious how it went, or if it's still on your radar.`,
      `That ${intention.intention} thing - still working on it? No judgment either way.`,
    ],
    celebratory: [
      `Wait - did you end up doing that ${intention.intention} thing? I want to hear about it!`,
      `Tell me about ${intention.intention}! Did it happen?`,
    ],
  };

  // Choose tone based on intention type and target time
  let tone: 'curious' | 'supportive' | 'celebratory' = 'curious';

  // If they had a deadline and missed it, be supportive not pushy
  if (intention.targetTime && intention.targetTime < new Date()) {
    tone = 'supportive';
  }

  // If it seems like a challenging thing, be supportive
  const hardKeywords = ['talk to', 'confront', 'tell', 'ask', 'finally'];
  if (hardKeywords.some((kw) => intention.intention.toLowerCase().includes(kw))) {
    tone = 'supportive';
  }

  const options = templates[tone];
  const question = options[Math.floor(Math.random() * options.length)];

  const ssml = question
    .replace(/\. /g, ". <break time='200ms'/> ")
    .replace(/\?/g, "? <break time='300ms'/>");

  return { question, ssml, tone };
}

/**
 * Check if we should follow up on intentions at session start
 * Returns the highest priority intention to follow up on
 */
export function getIntentionToFollowUp(userId: string): {
  intention: PendingIntention;
  followUp: ReturnType<typeof generateIntentionFollowUp>;
} | null {
  const overdue = getOverdueIntentions(userId);

  if (overdue.length === 0) return null;

  // Sort by target time (if exists) or stated time
  const sorted = overdue.sort((a, b) => {
    const aTime = a.targetTime?.getTime() || a.statedAt.getTime();
    const bTime = b.targetTime?.getTime() || b.statedAt.getTime();
    return aTime - bTime; // Oldest first
  });

  // Get the oldest one
  const intention = sorted[0];
  const followUp = generateIntentionFollowUp(intention);

  return { intention, followUp };
}

/**
 * Mark an intention as abandoned (user decided not to do it)
 */
export function markIntentionAbandoned(userId: string, intentionId: string): void {
  const profile = profiles.get(userId);
  if (!profile) return;

  const intention = profile.pendingIntentions.find((i) => i.id === intentionId);
  if (intention) {
    intention.status = 'abandoned';
    log.debug({ userId, intentionId }, 'Intention marked as abandoned');
  }
}

/**
 * Mark an intention as struggled (they tried but it didn't work out)
 * This is still worth celebrating the effort
 */
export function markIntentionStruggled(userId: string, intentionId: string): SmallWin | null {
  const profile = profiles.get(userId);
  if (!profile) return null;

  const intention = profile.pendingIntentions.find((i) => i.id === intentionId);
  if (intention) {
    intention.status = 'struggled';

    // Create an effort_made win - trying is worth celebrating
    const win: SmallWin = {
      id: `win_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'effort_made',
      description: `Tried to ${intention.intention}`,
      whatMadeItHard: 'Making the attempt when outcome was uncertain',
      timestamp: new Date(),
      celebrated: false,
    };

    profile.wins.push(win);
    intention.linkedWinId = win.id;

    log.info({ userId, intentionId }, '💪 Intention struggled but effort celebrated');

    return win;
  }

  return null;
}

/**
 * Get uncelebrated wins
 */
export function getUncelebratedWins(userId: string): SmallWin[] {
  const profile = profiles.get(userId);
  return profile?.wins.filter((w) => !w.celebrated) || [];
}

/**
 * Record a known difficulty for this user
 */
export function recordKnownDifficulty(userId: string, difficulty: string): void {
  const profile = getOrCreateProfile(userId);

  if (!profile.knownDifficulties.includes(difficulty.toLowerCase())) {
    profile.knownDifficulties.push(difficulty.toLowerCase());
  }
}

/**
 * Export profile for persistence
 */
export function exportSmallWinsProfile(userId: string): SmallWinsProfile | null {
  return profiles.get(userId) || null;
}

/**
 * Import profile from persistence
 */
export function importSmallWinsProfile(profile: SmallWinsProfile): void {
  profiles.set(profile.userId, profile);
  log.debug(
    { userId: profile.userId, winCount: profile.wins.length },
    'Imported small wins profile'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectSmallWin,
  detectIntention,
  generateCelebration,
  generateIntentionFollowUp,
  getIntentionToFollowUp,
  getOverdueIntentions,
  getPendingIntentions,
  getUncelebratedWins,
  markIntentionAbandoned,
  markIntentionStruggled,
  recordCelebrationResponse,
  recordKnownDifficulty,
  exportSmallWinsProfile,
  importSmallWinsProfile,
};
