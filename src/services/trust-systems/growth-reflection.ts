/**
 * Growth Reflection System
 *
 * Noticing and reflecting back someone's evolution over time.
 * "A year ago, you would have spiraled. Look at you now."
 *
 * Philosophy: One of the most validating things a friend can do is
 * notice your growth before you see it yourself. This system tracks
 * patterns over time and surfaces moments of meaningful change.
 *
 * This system tracks:
 * - How they respond to similar situations over time
 * - Changes in emotional regulation
 * - Shifts in perspective or values
 * - Progress on stated goals
 * - New coping strategies they've developed
 *
 * @module GrowthReflection
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GrowthReflection' });

// ============================================================================
// TYPES
// ============================================================================

export interface GrowthPattern {
  id: string;

  /** What kind of growth this represents */
  type:
    | 'emotional_regulation' // Better handling of difficult emotions
    | 'perspective_shift' // Changed how they see something
    | 'behavior_change' // Acting differently in similar situations
    | 'boundary_setting' // Better at setting/holding boundaries
    | 'self_awareness' // More aware of their patterns
    | 'coping_upgrade' // Better coping strategies
    | 'goal_progress'; // Movement on stated goals

  /** Description of the old pattern */
  before: {
    pattern: string;
    examples: string[];
    firstSeen: Date;
  };

  /** Description of the new pattern */
  after: {
    pattern: string;
    examples: string[];
    firstSeen: Date;
  };

  /** How significant is this change */
  significance: 'subtle' | 'notable' | 'transformative';

  /** Confidence that this is real growth (not just a good day) */
  confidence: number;

  /** Number of times new pattern has been observed */
  timesObserved: number;

  /** Whether we've reflected this back to them */
  reflectedBack: boolean;

  /** Their response when we reflected it */
  responseToReflection?: 'resonated' | 'dismissed' | 'surprised' | 'emotional';
}

export interface GrowthProfile {
  userId: string;

  /** Tracked growth patterns */
  patterns: GrowthPattern[];

  /** Historical snapshots of how they handled things */
  historicalResponses: Array<{
    situation: string;
    response: string;
    emotion: string;
    timestamp: Date;
    topic?: string;
  }>;

  /** Stated values and how they've shifted */
  valueEvolution: Array<{
    value: string;
    importance: number;
    firstMentioned: Date;
    lastMentioned: Date;
    trend: 'stable' | 'increasing' | 'decreasing';
  }>;

  /** Coping strategies they've mentioned or demonstrated */
  copingStrategies: Array<{
    strategy: string;
    firstUsed: Date;
    timesUsed: number;
    effectiveness: 'helpful' | 'mixed' | 'unhelpful';
  }>;
}

export interface GrowthReflection {
  pattern: GrowthPattern;

  /** The reflection to share */
  reflection: string;

  /** When to share this (immediately, later, organically) */
  timing: 'now' | 'next_relevant_moment' | 'milestone';

  /** SSML-enhanced version for voice */
  ssml: string;
}

// ============================================================================
// GROWTH DETECTION PATTERNS
// ============================================================================

/** Phrases indicating emotional regulation growth */
const REGULATION_GROWTH = {
  before: [
    'i always freak out',
    'i spiral',
    'i can\'t handle',
    'it destroys me',
    'i shut down',
    'i lash out',
  ],
  after: [
    'i noticed i was getting',
    'i took a breath',
    'i sat with it',
    'i didn\'t react',
    'i gave myself space',
    'i let it pass',
  ],
};

/** Phrases indicating perspective shifts */
const PERSPECTIVE_GROWTH = {
  before: [
    'it\'s always my fault',
    'everyone thinks',
    'i\'ll never',
    'it\'s impossible',
    'i can\'t',
    'they\'re all',
  ],
  after: [
    'i realize now',
    'i\'ve started to see',
    'maybe it\'s not',
    'i wonder if',
    'what if',
    'looking back',
  ],
};

/** Phrases indicating boundary growth */
const BOUNDARY_GROWTH = {
  before: [
    'i couldn\'t say no',
    'i let them',
    'i didn\'t want to upset',
    'i just went along',
    'i felt guilty saying',
  ],
  after: [
    'i told them no',
    'i set a boundary',
    'i said what i needed',
    'i didn\'t apologize for',
    'i stood my ground',
  ],
};

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const growthProfiles = new Map<string, GrowthProfile>();

function getOrCreateProfile(userId: string): GrowthProfile {
  let profile = growthProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      patterns: [],
      historicalResponses: [],
      valueEvolution: [],
      copingStrategies: [],
    };
    growthProfiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// GROWTH DETECTION
// ============================================================================

/**
 * Record a response to a situation for historical tracking
 */
export function recordResponse(
  userId: string,
  situation: string,
  response: string,
  emotion: string,
  topic?: string
): void {
  const profile = getOrCreateProfile(userId);

  profile.historicalResponses.push({
    situation,
    response,
    emotion,
    timestamp: new Date(),
    topic,
  });

  // Keep only last 100 responses
  if (profile.historicalResponses.length > 100) {
    profile.historicalResponses = profile.historicalResponses.slice(-100);
  }

  // Check for growth patterns
  detectGrowthPatterns(userId);
}

/**
 * Detect growth patterns by comparing recent vs historical responses
 */
function detectGrowthPatterns(userId: string): void {
  const profile = growthProfiles.get(userId);
  if (!profile || profile.historicalResponses.length < 5) return;

  const recent = profile.historicalResponses.slice(-5);
  const older = profile.historicalResponses.slice(0, -5);

  // Check emotional regulation growth
  checkEmotionalRegulationGrowth(profile, recent, older);

  // Check perspective growth
  checkPerspectiveGrowth(profile, recent, older);

  // Check boundary growth
  checkBoundaryGrowth(profile, recent, older);
}

/**
 * Check for emotional regulation improvement
 */
function checkEmotionalRegulationGrowth(
  profile: GrowthProfile,
  recent: GrowthProfile['historicalResponses'],
  older: GrowthProfile['historicalResponses']
): void {
  // Look for old patterns of dysregulation
  const oldDysregulation = older.filter((r) =>
    REGULATION_GROWTH.before.some((phrase) =>
      r.response.toLowerCase().includes(phrase)
    )
  );

  // Look for new patterns of regulation
  const newRegulation = recent.filter((r) =>
    REGULATION_GROWTH.after.some((phrase) =>
      r.response.toLowerCase().includes(phrase)
    )
  );

  if (oldDysregulation.length >= 2 && newRegulation.length >= 2) {
    const existingPattern = profile.patterns.find(
      (p) => p.type === 'emotional_regulation'
    );

    if (existingPattern) {
      existingPattern.timesObserved++;
      existingPattern.confidence = Math.min(existingPattern.confidence + 0.1, 0.95);
    } else {
      const pattern: GrowthPattern = {
        id: `growth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'emotional_regulation',
        before: {
          pattern: 'Struggled with emotional reactions',
          examples: oldDysregulation.map((r) => r.response.slice(0, 100)),
          firstSeen: oldDysregulation[0]?.timestamp || new Date(),
        },
        after: {
          pattern: 'Better at regulating emotional responses',
          examples: newRegulation.map((r) => r.response.slice(0, 100)),
          firstSeen: newRegulation[0]?.timestamp || new Date(),
        },
        significance: 'notable',
        confidence: 0.6,
        timesObserved: 1,
        reflectedBack: false,
      };

      profile.patterns.push(pattern);
      log.info(
        { userId: profile.userId, type: 'emotional_regulation' },
        '🌱 Growth pattern detected'
      );
    }
  }
}

/**
 * Check for perspective shifts
 */
function checkPerspectiveGrowth(
  profile: GrowthProfile,
  recent: GrowthProfile['historicalResponses'],
  older: GrowthProfile['historicalResponses']
): void {
  const oldRigid = older.filter((r) =>
    PERSPECTIVE_GROWTH.before.some((phrase) =>
      r.response.toLowerCase().includes(phrase)
    )
  );

  const newFlexible = recent.filter((r) =>
    PERSPECTIVE_GROWTH.after.some((phrase) =>
      r.response.toLowerCase().includes(phrase)
    )
  );

  if (oldRigid.length >= 2 && newFlexible.length >= 1) {
    const existingPattern = profile.patterns.find(
      (p) => p.type === 'perspective_shift'
    );

    if (!existingPattern) {
      const pattern: GrowthPattern = {
        id: `growth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'perspective_shift',
        before: {
          pattern: 'More rigid thinking patterns',
          examples: oldRigid.map((r) => r.response.slice(0, 100)),
          firstSeen: oldRigid[0]?.timestamp || new Date(),
        },
        after: {
          pattern: 'More flexible, curious perspective',
          examples: newFlexible.map((r) => r.response.slice(0, 100)),
          firstSeen: newFlexible[0]?.timestamp || new Date(),
        },
        significance: 'subtle',
        confidence: 0.5,
        timesObserved: 1,
        reflectedBack: false,
      };

      profile.patterns.push(pattern);
      log.info(
        { userId: profile.userId, type: 'perspective_shift' },
        '🌱 Growth pattern detected'
      );
    }
  }
}

/**
 * Check for boundary-setting growth
 */
function checkBoundaryGrowth(
  profile: GrowthProfile,
  recent: GrowthProfile['historicalResponses'],
  older: GrowthProfile['historicalResponses']
): void {
  const oldPoorBoundaries = older.filter((r) =>
    BOUNDARY_GROWTH.before.some((phrase) =>
      r.response.toLowerCase().includes(phrase)
    )
  );

  const newGoodBoundaries = recent.filter((r) =>
    BOUNDARY_GROWTH.after.some((phrase) =>
      r.response.toLowerCase().includes(phrase)
    )
  );

  if (oldPoorBoundaries.length >= 1 && newGoodBoundaries.length >= 1) {
    const existingPattern = profile.patterns.find(
      (p) => p.type === 'boundary_setting'
    );

    if (!existingPattern) {
      const pattern: GrowthPattern = {
        id: `growth_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'boundary_setting',
        before: {
          pattern: 'Difficulty setting/holding boundaries',
          examples: oldPoorBoundaries.map((r) => r.response.slice(0, 100)),
          firstSeen: oldPoorBoundaries[0]?.timestamp || new Date(),
        },
        after: {
          pattern: 'Asserting boundaries more clearly',
          examples: newGoodBoundaries.map((r) => r.response.slice(0, 100)),
          firstSeen: newGoodBoundaries[0]?.timestamp || new Date(),
        },
        significance: 'transformative',
        confidence: 0.65,
        timesObserved: 1,
        reflectedBack: false,
      };

      profile.patterns.push(pattern);
      log.info(
        { userId: profile.userId, type: 'boundary_setting' },
        '🌱 Growth pattern detected'
      );
    }
  }
}

// ============================================================================
// GROWTH REFLECTION GENERATION
// ============================================================================

/**
 * Generate a reflection to share with the user
 */
export function generateGrowthReflection(
  userId: string,
  context?: {
    currentTopic?: string;
    currentEmotion?: string;
    situation?: string;
  }
): GrowthReflection | null {
  const profile = growthProfiles.get(userId);
  if (!profile || profile.patterns.length === 0) return null;

  // Find a pattern that:
  // 1. Hasn't been reflected back yet
  // 2. Has high enough confidence
  // 3. Is relevant to current context (if provided)
  const eligiblePatterns = profile.patterns.filter(
    (p) => !p.reflectedBack && p.confidence >= 0.6 && p.timesObserved >= 2
  );

  if (eligiblePatterns.length === 0) return null;

  // Prefer patterns relevant to current context
  let pattern = eligiblePatterns[0];
  if (context?.currentTopic) {
    const relevant = eligiblePatterns.find(
      (p) =>
        p.before.examples.some((e) =>
          e.toLowerCase().includes(context.currentTopic!.toLowerCase())
        ) ||
        p.after.examples.some((e) =>
          e.toLowerCase().includes(context.currentTopic!.toLowerCase())
        )
    );
    if (relevant) pattern = relevant;
  }

  // Generate the reflection based on type
  const reflection = createReflection(pattern);

  return {
    pattern,
    reflection: reflection.text,
    timing: pattern.significance === 'transformative' ? 'now' : 'next_relevant_moment',
    ssml: reflection.ssml,
  };
}

/**
 * Create the actual reflection text
 */
function createReflection(pattern: GrowthPattern): { text: string; ssml: string } {
  const reflections: Record<GrowthPattern['type'], string[]> = {
    emotional_regulation: [
      "You know what I've noticed? The way you're handling this now is different from before. You're not spiraling - you're actually sitting with it.",
      "A while back, this kind of thing would've knocked you off balance. But look at you - you're processing it, not just reacting.",
      "I see growth here. The old you might have shut down. This version of you? You're present with it.",
    ],
    perspective_shift: [
      "I've noticed something shift in how you see things. You used to speak in absolutes - 'always' and 'never.' Now you're asking 'what if.'",
      "There's more curiosity in how you're approaching this than I've seen before. That's real growth.",
      "You're seeing shades of gray where you used to see black and white. That's not nothing.",
    ],
    boundary_setting: [
      "Can I tell you what I see? You're holding your ground now. That's different from before, when you'd bend to avoid conflict.",
      "You said no. You didn't apologize for it. That's huge growth from where you started.",
      "Remember when saying no felt impossible? Look at you now - setting boundaries like it's just... what you do.",
    ],
    behavior_change: [
      "You're responding differently than you used to. Same situation, but you - you're different.",
      "I've watched you grow in how you handle these moments. It's subtle but it's real.",
    ],
    self_awareness: [
      "You caught yourself. You saw your pattern in real time. That's not easy to do.",
      "The fact that you can name what's happening - that's growth. Before, you were just in it.",
    ],
    coping_upgrade: [
      "Your toolkit has expanded. The strategies you're using now? They're healthier than what you had before.",
      "You found something that actually helps. That's not nothing - that's real progress.",
    ],
    goal_progress: [
      "Look how far you've come from where you started. The progress might feel slow to you, but from here? It's visible.",
      "You're closer than you think. The steps you've taken - they add up.",
    ],
  };

  const options = reflections[pattern.type] || reflections.behavior_change;
  const text = options[Math.floor(Math.random() * options.length)];

  // Create SSML version with thoughtful pacing
  const ssml = text
    .replace(/\. /g, ". <break time='300ms'/> ")
    .replace(/\?/g, "? <break time='400ms'/> ")
    .replace(/ - /g, " <break time='200ms'/> ");

  return { text, ssml };
}

/**
 * Record that we reflected growth back and how they responded
 */
export function recordReflectionResponse(
  userId: string,
  patternId: string,
  response: 'resonated' | 'dismissed' | 'surprised' | 'emotional'
): void {
  const profile = growthProfiles.get(userId);
  if (!profile) return;

  const pattern = profile.patterns.find((p) => p.id === patternId);
  if (pattern) {
    pattern.reflectedBack = true;
    pattern.responseToReflection = response;

    // If it resonated, increase confidence
    if (response === 'resonated' || response === 'emotional') {
      pattern.confidence = Math.min(pattern.confidence + 0.15, 0.95);
    }

    log.info({ userId, patternId, response }, '🪞 Growth reflection recorded');
  }
}

// ============================================================================
// PROFILE ACCESS
// ============================================================================

/**
 * Get unreflected growth patterns
 */
export function getUnreflectedGrowth(userId: string): GrowthPattern[] {
  const profile = growthProfiles.get(userId);
  if (!profile) return [];

  return profile.patterns.filter(
    (p) => !p.reflectedBack && p.confidence >= 0.6 && p.timesObserved >= 2
  );
}

/**
 * Get all growth patterns for a user
 */
export function getGrowthPatterns(userId: string): GrowthPattern[] {
  const profile = growthProfiles.get(userId);
  return profile?.patterns || [];
}

/**
 * Export growth profile for persistence
 */
export function exportGrowthProfile(userId: string): GrowthProfile | null {
  return growthProfiles.get(userId) || null;
}

/**
 * Import growth profile from persistence
 */
export function importGrowthProfile(profile: GrowthProfile): void {
  growthProfiles.set(profile.userId, profile);
  log.debug(
    { userId: profile.userId, patternCount: profile.patterns.length },
    'Imported growth profile'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordResponse,
  generateGrowthReflection,
  recordReflectionResponse,
  getUnreflectedGrowth,
  getGrowthPatterns,
  exportGrowthProfile,
  importGrowthProfile,
};

