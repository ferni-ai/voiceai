/**
 * Crisis Context Builder
 *
 * Handles critical intervention scenarios:
 * - Market panic detection
 * - Grief and loss detection
 * - Life event crisis detection
 *
 * These are HIGH PRIORITY injections that override normal conversation flow.
 *
 * Uses centralized DISTRESS constants for consistent thresholds.
 *
 * Extracted from jack-bogle.ts lines 722-845
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { DISTRESS } from '../../distress-levels.js';
import { BuilderCategory } from '../core/categories.js';
import {
  createCriticalInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
// Crisis hooks for semantic indexing (E2E integration)
import { onCrisisEpisodeChange } from '../../../services/data-layer/hooks/crisis-hooks.js';

const log = createLogger({ module: 'context:crisis' });

// Map internal severity to CrisisEpisodeEntity severity
type InternalSeverity = 'low' | 'moderate' | 'high' | 'critical';
type EntitySeverity = 'minor' | 'moderate' | 'major' | 'severe';
const SEVERITY_MAP: Record<InternalSeverity, EntitySeverity> = {
  low: 'minor',
  moderate: 'moderate',
  high: 'major',
  critical: 'severe',
};

// Map crisis type to entity type
type CrisisType = 'emotional' | 'health' | 'financial' | 'relationship' | 'work' | 'family' | 'other';
function mapCrisisType(type: string): CrisisType {
  if (type.includes('market') || type.includes('financial')) return 'financial';
  if (type.includes('grief') || type.includes('loss')) return 'emotional';
  if (type.includes('health')) return 'health';
  if (type.includes('relationship')) return 'relationship';
  if (type.includes('work')) return 'work';
  if (type.includes('family')) return 'family';
  return 'other';
}

// Helper to record crisis episodes (fire-and-forget)
async function recordCrisisEpisode(
  userId: string | undefined,
  type: string,
  severity: InternalSeverity,
  description: string,
  _distressLevel: number
): Promise<void> {
  if (!userId) return;
  try {
    const episodeData = {
      type: mapCrisisType(type),
      severity: SEVERITY_MAP[severity],
      description,
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
      whatHelped: [], // Unknown at detection time
    };
    await onCrisisEpisodeChange(userId, `crisis_${Date.now()}`, episodeData, 'create');
    log.info({ userId, type, severity }, '🚨 Crisis episode recorded');
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to record crisis episode (non-fatal)');
  }
}

// ============================================================================
// CRISIS PATTERNS
// ============================================================================
/**
 * Market panic keywords and phrases
 */
const MARKET_PANIC_PATTERNS =
  /\b(sell everything|get out of the market|cash out|panic|market crash|losing everything|should i sell|pull out my money|move to cash|can't take it anymore|scared of market|market is tanking)\b/i;
/**
 * Grief patterns with loss type categorization
 */
const GRIEF_PATTERNS = [
  {
    pattern:
      /\b(passed away|died|death|funeral|lost my|mourning|grieving|miss them|miss him|miss her)\b/i,
    lossType: 'person',
  },
  { pattern: /\b(lost my job|fired|laid off|career over)\b/i, lossType: 'job' },
  { pattern: /\b(health scare|diagnosis|terminal|chronic)\b/i, lossType: 'health' },
  { pattern: /\b(divorce|breakup|ended|relationship over|left me)\b/i, lossType: 'relationship' },
  {
    pattern: /\b(gave up on|dream died|didn't work out|failed|never going to)\b/i,
    lossType: 'dream',
  },
];
/**
 * Life event patterns with specific guidance
 */
const LIFE_EVENT_PATTERNS = [
  {
    pattern: /\b(lost my job|got fired|laid off|let go|downsized|unemployed)\b/i,
    eventType: 'job_loss',
  },
  { pattern: /\b(new job|got hired|starting a new position|new role)\b/i, eventType: 'new_job' },
  { pattern: /\b(retiring|retired|retirement|leaving work|last day)\b/i, eventType: 'retirement' },
  {
    pattern: /\b(having a baby|pregnant|expecting|new baby|just had a baby|newborn|new parent)\b/i,
    eventType: 'new_baby',
  },
  {
    pattern: /\b(getting married|engaged|wedding|just married|newlywed)\b/i,
    eventType: 'marriage',
  },
  {
    pattern: /\b(getting divorced|divorce|separated|splitting up|ending marriage)\b/i,
    eventType: 'divorce',
  },
  {
    pattern:
      /\b(cancer|heart attack|diagnosis|sick|illness|hospital|surgery|medical|health crisis)\b/i,
    eventType: 'health_crisis',
  },
  {
    pattern: /\b(inherited|inheritance|estate|passed away.*money|left me money)\b/i,
    eventType: 'inheritance',
  },
  {
    pattern: /\b(buying a house|new home|first home|closing on|mortgage)\b/i,
    eventType: 'home_purchase',
  },
  { pattern: /\b(moving|relocating|new city|new state|leaving town)\b/i, eventType: 'relocation' },
  { pattern: /\b(got promoted|promotion|raise|new title|moving up)\b/i, eventType: 'promotion' },
  {
    pattern: /\b(starting a business|new business|entrepreneur|startup|going solo)\b/i,
    eventType: 'business_start',
  },
];
/**
 * Life event guidance by type
 */
const LIFE_EVENT_GUIDANCE: Record<string, string> = {
  job_loss: `[LIFE EVENT: JOB LOSS DETECTED]
This is huge. It's not just money—it's identity, purpose, routine.
FIRST: "Losing a job... that's one of life's hardest blows. How are YOU doing?"
DO NOT: Jump to financial advice or "silver linings."
ONLY after they share feelings: "When you're ready—no rush—we can talk practical steps."
This isn't one conversation. Offer to follow up.`,
  new_job: `[LIFE EVENT: NEW JOB]
Exciting AND scary. Acknowledge both.
"A new chapter! That's exciting—and probably a little nerve-wracking too."
Don't lecture about 401k setup unless they ask.`,
  retirement: `[LIFE EVENT: RETIREMENT]
This is emotional, not just financial. Identity shift.
"Retirement. After all those years... how does it feel?"
The money stuff can wait. Check on the person first.`,
  new_baby: `[LIFE EVENT: NEW BABY]
"A baby! Congratulations. Your life is about to change in the most wonderful, exhausting ways."
Don't talk 529 plans unless they bring it up. Celebrate first.`,
  marriage: `[LIFE EVENT: MARRIAGE]
"Marriage! That's beautiful. Two people deciding to build a life together."
Money is top argument for couples—but don't lead with that.`,
  divorce: `[LIFE EVENT: DIVORCE]
"I'm sorry to hear that. Divorce is... it's like a death in some ways."
The financial untangling will happen. Right now, check on THEM.
DO NOT: Rush to practical advice.`,
  health_crisis: `[LIFE EVENT: HEALTH CRISIS]
"Health scares put everything in perspective, don't they?"
Money seems unimportant when health is on the line. Be present.`,
  inheritance: `[LIFE EVENT: INHERITANCE]
"An inheritance... that's complicated, isn't it? Money mixed with loss."
No rush to invest it. Let them process. The money will wait.`,
  home_purchase: `[LIFE EVENT: HOME PURCHASE]
"Buying a home! That's a big milestone. Exciting and terrifying in equal measure."`,
  relocation: `[LIFE EVENT: RELOCATION]
"Moving. New place, new routines. That's a lot of change at once."`,
  promotion: `[LIFE EVENT: PROMOTION]
"A promotion! They recognized what you bring. How does it feel?"
More money is nice, but more responsibility is real.`,
  business_start: `[LIFE EVENT: STARTING A BUSINESS]
"Starting a business! That takes courage. Real courage."
Don't quote failure statistics. Support the dream.`,
};
// ============================================================================
// CRISIS CONTEXT BUILDER
// ============================================================================

/**
 * Build crisis-related context injections
 *
 * Uses centralized DISTRESS constants for consistent thresholds:
 * - DISTRESS.ELEVATED (0.4) for market panic trigger
 * - DISTRESS.MODERATE (0.5) for grief detection
 */
function buildCrisisContext(input: ContextBuilderInput): ContextInjection[] {
  const { userText, analysis } = input;
  const injections: ContextInjection[] = [];
  const distressLevel = analysis.emotion.distressLevel ?? 0;

  // -----------------------------------------------
  // MARKET PANIC DETECTION (CRITICAL)
  // Uses DISTRESS.ELEVATED threshold
  // -----------------------------------------------
  if (
    MARKET_PANIC_PATTERNS.test(userText) &&
    (distressLevel >= DISTRESS.ELEVATED || analysis.emotion.primary === 'fear')
  ) {
    log.warn({ distress: distressLevel }, 'MARKET PANIC DETECTED - Critical intervention needed');

    // Record crisis episode (fire-and-forget) for semantic indexing
    void recordCrisisEpisode(
      input.services?.userId,
      'market_panic',
      distressLevel >= DISTRESS.HIGH ? 'critical' : 'high',
      'Market panic detected - user expressing fear about selling investments',
      distressLevel
    );

    injections.push(
      createCriticalInjection(
        'market_panic',
        `[MARKET PANIC DETECTED - CRITICAL INTERVENTION]
DO NOT dismiss their fear. The fear is REAL.
STEP 1 - VALIDATE: "I hear the fear in your voice. Let's slow down."
STEP 2 - DON'T LET THEM ACT: "Before you do anything, let's just talk."
STEP 3 - HISTORICAL CONTEXT: "Every crash in history has been followed by recovery."
  - Panic sellers in March 2020 earned -2%; holders earned 21%
  - Black Monday 1987: 22% drop. Two years later? Fully recovered.
STEP 4 - SLOW THEM DOWN: "Promise me you won't do anything tonight. Sleep on it."
KEY PHRASES:
  - "Time is your friend; impulse is your enemy."
  - "The stock market is the only market where people run OUT of the store when things go on sale."
  - "Stay the course. No matter what happens."
DO NOT: Promise the market will go up. DO: Promise you'll be here to talk.`,
        { category: 'crisis' }
      )
    );
  }

  // -----------------------------------------------
  // GRIEF DETECTION
  // Uses DISTRESS.MODERATE threshold
  // -----------------------------------------------
  for (const { pattern, lossType } of GRIEF_PATTERNS) {
    if (pattern.test(userText) && distressLevel >= DISTRESS.MODERATE) {
      log.info({ lossType, distress: distressLevel }, 'Grief detected');

      // Record grief episode (fire-and-forget) for semantic indexing
      void recordCrisisEpisode(
        input.services?.userId,
        `grief_${lossType}`,
        distressLevel >= DISTRESS.HIGH ? 'high' : 'moderate',
        `Grief detected - ${lossType} loss`,
        distressLevel
      );

      injections.push(
        createCriticalInjection(
          'grief',
          `[GRIEF DETECTED - ${lossType.toUpperCase()}]
Grief is not a problem to solve. It's an experience to WITNESS.
YOUR ONLY JOB:
  1. BE PRESENT - "I'm here."
  2. ACKNOWLEDGE - "This is hard."
  3. MAKE SPACE - Let them talk (or not)
  4. DON'T FIX - Resist the urge to make it better
NEVER SAY:
  - "Everything happens for a reason"
  - "They're in a better place"
  - "At least..."
  - "Time heals..."
DO SAY:
  - "I'm so sorry."
  - "That's really hard."
  - "Tell me about them/it."
  - [Silence is okay. Even preferred.]`,
          { category: 'crisis' }
        )
      );
      break; // Only add one grief injection
    }
  }

  // -----------------------------------------------
  // LIFE EVENT DETECTION
  // -----------------------------------------------
  for (const { pattern, eventType } of LIFE_EVENT_PATTERNS) {
    if (pattern.test(userText)) {
      const guidance = LIFE_EVENT_GUIDANCE[eventType];
      if (guidance) {
        log.info({ eventType }, 'Life event detected');
        injections.push(createStandardInjection('life_event', guidance, { category: 'crisis' }));
      } else {
        injections.push(
          createStandardInjection(
            'life_event',
            `[LIFE EVENT: ${eventType}] Lead with empathy, not advice.`,
            { category: 'crisis' }
          )
        );
      }
      break; // Only add one life event injection
    }
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'crisis',
  description: 'Crisis detection: market panic, grief, life events',
  priority: 10, // Very high priority - runs first
  category: BuilderCategory.SAFETY,
  build: async (input) => buildCrisisContext(input),
});

export { buildCrisisContext, GRIEF_PATTERNS, LIFE_EVENT_PATTERNS, MARKET_PANIC_PATTERNS };
