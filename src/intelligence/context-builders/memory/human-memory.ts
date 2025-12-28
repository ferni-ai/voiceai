/**
 * Human Memory Context Builder
 *
 * Surfaces human-centric memory to the LLM so Ferni can:
 * - Remember birthdays and anniversaries
 * - Know what comforts vs. stresses the user
 * - Respect topics they avoid
 * - Acknowledge their growth
 * - Reference inside jokes naturally
 *
 * This is what makes someone feel truly known.
 *
 * @module intelligence/context-builders/human-memory
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  HumanMemory,
  ImportantDate,
  GrowthMarker,
  InsideJoke,
} from '../../../types/human-memory.js';
import {
  registerContextBuilder,
  createHintInjection,
  createStandardInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';

const log = createLogger({ module: 'human-memory-context' });

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Check if a date is within N days from today
 */
function isWithinDays(date: ImportantDate, days: number): boolean {
  const today = new Date();
  const thisYear = today.getFullYear();

  // Create date for this year
  const dateThisYear = new Date(thisYear, date.month - 1, date.day);

  // If date has passed this year, check next year
  if (dateThisYear < today) {
    dateThisYear.setFullYear(thisYear + 1);
  }

  const diffMs = dateThisYear.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return diffDays >= 0 && diffDays <= days;
}

/**
 * Get days until a date
 */
function getDaysUntil(date: ImportantDate): number {
  const today = new Date();
  const thisYear = today.getFullYear();

  const dateThisYear = new Date(thisYear, date.month - 1, date.day);

  if (dateThisYear < today) {
    dateThisYear.setFullYear(thisYear + 1);
  }

  const diffMs = dateThisYear.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Check if today is the date
 */
function isToday(date: ImportantDate): boolean {
  const today = new Date();
  return date.month === today.getMonth() + 1 && date.day === today.getDate();
}

/**
 * Format date for display
 */
function formatDate(date: ImportantDate): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${months[date.month - 1]} ${date.day}`;
}

// ============================================================================
// UPCOMING DATES CONTEXT
// ============================================================================

/**
 * Find important dates coming up soon
 */
function getUpcomingDates(
  humanMemory: Partial<HumanMemory>,
  lookAheadDays = 7
): { today: ImportantDate[]; upcoming: ImportantDate[] } {
  const dates = humanMemory.importantDates || [];

  const today: ImportantDate[] = [];
  const upcoming: ImportantDate[] = [];

  for (const date of dates) {
    if (isToday(date)) {
      today.push(date);
    } else if (isWithinDays(date, lookAheadDays)) {
      upcoming.push(date);
    }
  }

  // Sort upcoming by days until
  upcoming.sort((a, b) => getDaysUntil(a) - getDaysUntil(b));

  return { today, upcoming };
}

/**
 * Build date awareness injection
 */
function buildDateContext(humanMemory: Partial<HumanMemory>): ContextInjection | null {
  const { today, upcoming } = getUpcomingDates(humanMemory, 7);

  if (today.length === 0 && upcoming.length === 0) {
    return null;
  }

  const lines: string[] = [];

  // TODAY - High priority
  for (const date of today) {
    const typeLabel = date.type.replace('_', ' ');
    if (date.wantsAcknowledgment) {
      if (date.sentiment === 'celebratory') {
        lines.push(`🎉 TODAY is ${date.label}! Wish them a happy ${typeLabel}!`);
      } else if (date.sentiment === 'sensitive') {
        lines.push(`💙 Today marks ${date.label}. Acknowledge gently if they bring it up.`);
      } else {
        lines.push(`📅 Today: ${date.label}`);
      }
    }
  }

  // UPCOMING - Lower priority
  for (const date of upcoming.slice(0, 2)) {
    const days = getDaysUntil(date);
    const dayWord = days === 1 ? 'tomorrow' : `in ${days} days`;
    lines.push(`📆 ${date.label} is ${dayWord} (${formatDate(date)})`);
  }

  if (lines.length === 0) {
    return null;
  }

  return createStandardInjection(
    'human_memory_dates',
    `[IMPORTANT DATES - Remember these!]\n${lines.join('\n')}`
  );
}

// ============================================================================
// EMOTIONAL SIGNATURE CONTEXT
// ============================================================================

/**
 * Build context about what comforts/stresses the user
 */
function buildEmotionalSignatureContext(
  humanMemory: Partial<HumanMemory>,
  currentEmotion?: string
): ContextInjection | null {
  const sig = humanMemory.emotionalSignature;
  if (!sig) return null;

  const lines: string[] = [];

  // If user seems stressed, surface comfort patterns
  const isStressed =
    currentEmotion &&
    ['anxious', 'stressed', 'frustrated', 'sad', 'upset'].includes(currentEmotion);

  if (isStressed && sig.comfortPatterns?.length) {
    const comfortTypes = sig.comfortPatterns.map((p) => p.type).slice(0, 3);
    const comfortAdvice = comfortTypes
      .map((t) => {
        switch (t) {
          case 'validation':
            return 'validate their feelings';
          case 'problem_solving':
            return 'help find solutions';
          case 'distraction':
            return 'gently change subject';
          case 'presence':
            return 'just listen';
          case 'humor':
            return 'lighten the mood';
          case 'encouragement':
            return 'encourage them';
          default:
            return t;
        }
      })
      .join(', ');

    lines.push(`What helps this user: ${comfortAdvice}`);
  }

  // Surface stress triggers to avoid poking
  if (sig.stressTriggers?.length) {
    const triggerCategories = [...new Set(sig.stressTriggers.map((t) => t.category))].slice(0, 3);
    lines.push(`Sensitive areas: ${triggerCategories.join(', ')}`);
  }

  // Emotional tells (how we know something's off)
  if (sig.tells?.length && sig.tells.some((t) => t.confidence > 0.7)) {
    const strongTells = sig.tells.filter((t) => t.confidence > 0.7).slice(0, 2);
    for (const tell of strongTells) {
      lines.push(`Their tell: "${tell.signal}" often means ${tell.interpretation}`);
    }
  }

  // Humor preference
  if (sig.humor?.appreciates?.length) {
    const humorTypes = sig.humor.appreciates.slice(0, 3).join(', ');
    if (sig.humor.overallLevel === 'loves_it') {
      lines.push(`Humor: They love ${humorTypes} humor - use freely!`);
    } else if (sig.humor.overallLevel === 'prefers_serious') {
      lines.push(`Humor: Keep it minimal - they prefer serious conversations`);
    }
  }

  if (lines.length === 0) return null;

  return createHintInjection(
    'human_memory_emotional',
    `[USER'S EMOTIONAL SIGNATURE - How to support them]\n${lines.join('\n')}`
  );
}

// ============================================================================
// AVOIDANCE CONTEXT
// ============================================================================

/**
 * Build context about topics to avoid
 */
function buildAvoidanceContext(humanMemory: Partial<HumanMemory>): ContextInjection | null {
  const avoidances = humanMemory.unspoken?.avoidances;
  if (!avoidances?.length) return null;

  // Only surface strong avoidances (multiple observations)
  const strongAvoidances = avoidances.filter((a) => a.observations >= 2);
  if (strongAvoidances.length === 0) return null;

  const lines = strongAvoidances.slice(0, 3).map((a) => {
    const approachHint =
      a.approach === 'never_raise'
        ? '(never bring up)'
        : a.approach === 'only_if_they_do'
          ? '(only if they mention it)'
          : '(gentle check-in OK)';
    return `• ${a.topic} ${approachHint}`;
  });

  return createHintInjection(
    'human_memory_avoidances',
    `[TOPICS THIS USER AVOIDS - Respect their boundaries]\n${lines.join('\n')}`
  );
}

// ============================================================================
// GROWTH ACKNOWLEDGMENT CONTEXT
// ============================================================================

/**
 * Find growth that hasn't been acknowledged yet
 */
function getUnacknowledgedGrowth(humanMemory: Partial<HumanMemory>): GrowthMarker[] {
  const markers = humanMemory.growthArc?.markers || [];
  return markers.filter((m) => !m.acknowledged);
}

/**
 * Build context for celebrating growth
 */
function buildGrowthContext(humanMemory: Partial<HumanMemory>): ContextInjection | null {
  const unacknowledged = getUnacknowledgedGrowth(humanMemory);
  if (unacknowledged.length === 0) return null;

  // Take the most recent unacknowledged growth
  const growth = unacknowledged[unacknowledged.length - 1];

  const lines = [
    `Growth to acknowledge: "${growth.description}"`,
    `Before: ${growth.before}`,
    `Now: ${growth.after}`,
    `Example: "I remember when you ${growth.before}. Look how far you've come!"`,
  ];

  return createHintInjection(
    'human_memory_growth',
    `[GROWTH OPPORTUNITY - Celebrate their progress!]\n${lines.join('\n')}`
  );
}

// ============================================================================
// INSIDE JOKES CONTEXT
// ============================================================================

/**
 * Get active inside jokes (not retired)
 */
function getActiveInsideJokes(humanMemory: Partial<HumanMemory>): InsideJoke[] {
  const jokes = humanMemory.insideJokes || [];
  return jokes.filter((j) => j.status !== 'retired');
}

/**
 * Build context for inside jokes
 */
function buildInsideJokesContext(humanMemory: Partial<HumanMemory>): ContextInjection | null {
  const jokes = getActiveInsideJokes(humanMemory);
  if (jokes.length === 0) return null;

  // Pick 1-2 jokes to potentially reference
  const selectedJokes = jokes.slice(0, 2);

  const lines = selectedJokes.map((j) => {
    const freshness = j.status === 'fresh' ? '(recent)' : '(beloved)';
    return `• "${j.reference}" ${freshness} - from: ${j.origin.slice(0, 50)}...`;
  });

  return createHintInjection(
    'human_memory_jokes',
    `[INSIDE JOKES - Use naturally if relevant]\n${lines.join('\n')}\nDon't force it - only reference if it fits!`
  );
}

// ============================================================================
// VALUES & IDENTITY CONTEXT
// ============================================================================

/**
 * Build context about their values and identity
 */
function buildIdentityContext(humanMemory: Partial<HumanMemory>): ContextInjection | null {
  const identity = humanMemory.identity;
  if (!identity) return null;

  const lines: string[] = [];

  // Core values (only strong ones)
  const coreValues = identity.values?.filter((v) => v.strength === 'core_identity');
  if (coreValues?.length) {
    lines.push(`Core values: ${coreValues.map((v) => v.value).join(', ')}`);
  }

  // Active dreams
  const activeDreams = identity.dreams?.filter((d) => d.status === 'active_pursuit');
  if (activeDreams?.length) {
    const dreamDesc = activeDreams[0].description.slice(0, 100);
    lines.push(`Pursuing: ${dreamDesc}`);
  }

  // Fears (only if they've said we can discuss)
  const discussableFears = identity.fears?.filter((f) => f.sensitivity === 'can_discuss');
  if (discussableFears?.length) {
    const fear = discussableFears[0].fear.slice(0, 80);
    lines.push(`Worry they've shared: ${fear}`);
  }

  if (lines.length === 0) return null;

  return createHintInjection(
    'human_memory_identity',
    `[WHO THEY ARE - Values & aspirations]\n${lines.join('\n')}`
  );
}

// ============================================================================
// RUNNING THEMES CONTEXT
// ============================================================================

/**
 * Build context about ongoing themes in their life
 */
function buildRunningThemesContext(humanMemory: Partial<HumanMemory>): ContextInjection | null {
  const themes = humanMemory.runningThemes;
  if (!themes?.length) return null;

  // Get active themes (recently mentioned)
  const activeThemes = themes
    .filter((t) => t.frequency === 'every_session' || t.frequency === 'often')
    .slice(0, 3);

  if (activeThemes.length === 0) return null;

  const lines = activeThemes.map((t) => {
    const sentimentHint =
      t.sentiment === 'positive'
        ? '(going well)'
        : t.sentiment === 'challenging'
          ? '(struggling)'
          : t.sentiment === 'evolving'
            ? '(in flux)'
            : '';
    return `• ${t.theme} ${sentimentHint}`;
  });

  return createHintInjection(
    'human_memory_themes',
    `[ONGOING THEMES IN THEIR LIFE]\n${lines.join('\n')}\nAsk for updates naturally!`
  );
}

// ============================================================================
// CHALLENGES CONTEXT
// ============================================================================

/**
 * Build context about challenges they're working through
 */
function buildChallengesContext(humanMemory: Partial<HumanMemory>): ContextInjection | null {
  const challenges = humanMemory.growthArc?.challenges;
  if (!challenges?.length) return null;

  // Get active challenges
  const activeChallenges = challenges.filter(
    (c) => c.status !== 'resolved' && c.status !== 'breakthrough'
  );

  if (activeChallenges.length === 0) return null;

  const lines = activeChallenges.slice(0, 2).map((c) => {
    const statusHint =
      c.status === 'struggling'
        ? '(needs support)'
        : c.status === 'working_on_it'
          ? '(making effort)'
          : c.status === 'making_progress'
            ? '(improving!)'
            : '';
    return `• ${c.challenge} ${statusHint}`;
  });

  return createHintInjection(
    'human_memory_challenges',
    `[CHALLENGES THEY'RE WORKING THROUGH]\n${lines.join('\n')}`
  );
}

// ============================================================================
// TEMPORAL PATTERNS CONTEXT
// ============================================================================

/**
 * Build context about seasonal/temporal patterns
 */
function buildTemporalContext(humanMemory: Partial<HumanMemory>): ContextInjection | null {
  const temporal = humanMemory.temporal;
  if (!temporal?.seasonal?.length) return null;

  // Check if current season/time matches any pattern
  const now = new Date();
  const month = now.getMonth();

  // Map months to seasons
  const currentSeason =
    month >= 2 && month <= 4
      ? 'spring'
      : month >= 5 && month <= 7
        ? 'summer'
        : month >= 8 && month <= 10
          ? 'fall'
          : 'winter';

  // Check for tax season (Jan-April)
  const isTaxSeason = month >= 0 && month <= 3;

  // Check for holiday season (Nov-Dec)
  const isHolidaySeason = month >= 10;

  // Find matching patterns
  const matchingPatterns = temporal.seasonal.filter((p) => {
    if (p.timing === currentSeason) return true;
    if (p.timing === 'tax_season' && isTaxSeason) return true;
    if (p.timing === 'holidays' && isHolidaySeason) return true;
    return false;
  });

  if (matchingPatterns.length === 0) return null;

  const lines = matchingPatterns.slice(0, 2).map((p) => {
    const tone =
      p.emotionalTone === 'challenging' ? '⚠️' : p.emotionalTone === 'positive' ? '✨' : '';
    return `${tone} ${p.pattern} ${p.approach ? `- ${p.approach}` : ''}`;
  });

  return createHintInjection(
    'human_memory_temporal',
    `[SEASONAL PATTERN - This time of year...]\n${lines.join('\n')}`
  );
}

// ============================================================================
// MAIN CONTEXT BUILDER
// ============================================================================

/**
 * Build human memory context for the current turn
 */
async function buildHumanMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { userProfile, userData, analysis } = input;
  const turnCount = userData?.turnCount || 0;

  // Need a user profile with human memory
  if (!userProfile?.humanMemory) {
    return [];
  }

  const humanMemory = userProfile.humanMemory;
  const injections: ContextInjection[] = [];
  const currentEmotion = analysis?.emotion?.primary;

  // ========================================
  // SESSION START (Turn 0) - Full context
  // ========================================
  if (turnCount === 0) {
    // Important dates - ALWAYS check at session start
    const dateContext = buildDateContext(humanMemory);
    if (dateContext) injections.push(dateContext);

    // Emotional signature - know how to support them
    const emotionalContext = buildEmotionalSignatureContext(humanMemory, currentEmotion);
    if (emotionalContext) injections.push(emotionalContext);

    // Avoidances - know what NOT to bring up
    const avoidanceContext = buildAvoidanceContext(humanMemory);
    if (avoidanceContext) injections.push(avoidanceContext);

    // Running themes - what's going on in their life
    const themesContext = buildRunningThemesContext(humanMemory);
    if (themesContext) injections.push(themesContext);

    // Challenges they're working through
    const challengesContext = buildChallengesContext(humanMemory);
    if (challengesContext) injections.push(challengesContext);

    // Temporal/seasonal patterns
    const temporalContext = buildTemporalContext(humanMemory);
    if (temporalContext) injections.push(temporalContext);

    log.debug(
      { injectionCount: injections.length, turnCount },
      'Human memory context built for session start'
    );
  }

  // ========================================
  // MID-CONVERSATION - Selective context
  // ========================================
  else {
    // Growth acknowledgment - sprinkle throughout
    if (turnCount % 5 === 0) {
      const growthContext = buildGrowthContext(humanMemory);
      if (growthContext) injections.push(growthContext);
    }

    // Inside jokes - occasional opportunities
    if (turnCount % 4 === 0) {
      const jokesContext = buildInsideJokesContext(humanMemory);
      if (jokesContext) injections.push(jokesContext);
    }

    // Identity context - when discussing deeper topics
    if (turnCount % 6 === 0) {
      const identityContext = buildIdentityContext(humanMemory);
      if (identityContext) injections.push(identityContext);
    }

    // Always surface emotional support hints if user is distressed
    if (currentEmotion && ['anxious', 'stressed', 'sad', 'frustrated'].includes(currentEmotion)) {
      const emotionalContext = buildEmotionalSignatureContext(humanMemory, currentEmotion);
      if (emotionalContext) injections.push(emotionalContext);
    }
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'human_memory',
  description: 'Surfaces human-centric memory: dates, comfort patterns, growth, inside jokes',
  priority: 80, // High priority - this is core to "better than human"
  category: BuilderCategory.MEMORY,
  build: buildHumanMemoryContext,
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  buildHumanMemoryContext,
  buildDateContext,
  buildEmotionalSignatureContext,
  buildAvoidanceContext,
  buildGrowthContext,
  buildInsideJokesContext,
  buildIdentityContext,
  buildRunningThemesContext,
  buildChallengesContext,
  buildTemporalContext,
  getUpcomingDates,
  getUnacknowledgedGrowth,
  getActiveInsideJokes,
  isWithinDays,
  isToday,
  getDaysUntil,
};
