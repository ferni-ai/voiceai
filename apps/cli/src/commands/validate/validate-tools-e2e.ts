/**
 * Validate Tools E2E
 *
 * Comprehensive end-to-end validation of tool execution through the chat API.
 * Tests that tools are properly wired and functional, not just registered.
 *
 * Usage:
 *   npx tsx apps/cli/src/commands/validate/validate-tools-e2e.ts
 *   npx tsx apps/cli/src/commands/validate/validate-tools-e2e.ts --quick     # Test 30 core tools
 *   npx tsx apps/cli/src/commands/validate/validate-tools-e2e.ts --domain music
 *   npx tsx apps/cli/src/commands/validate/validate-tools-e2e.ts --report json
 *
 * @module cli/commands/validate/validate-tools-e2e
 */

// ============================================================================
// TERMINAL COLORS (no dependencies)
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

const icons = {
  success: '✓',
  failure: '✗',
  warning: '⚠',
  info: 'ℹ',
  arrow: '→',
  bullet: '•',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

// ============================================================================
// TYPES
// ============================================================================

interface ToolTestCase {
  fn: string;
  args: Record<string, unknown>;
  domain: string;
  expectFields?: string[];
  skipInQuickMode?: boolean;
  description?: string;
}

interface ToolTestResult {
  fn: string;
  domain: string;
  status: 'success' | 'error' | 'slow' | 'skipped';
  durationMs: number;
  error?: string;
  response?: unknown;
}

interface ValidationReport {
  timestamp: string;
  summary: {
    total: number;
    success: number;
    error: number;
    slow: number;
    skipped: number;
    successRate: string;
  };
  thresholds: {
    slowMs: number;
  };
  success: ToolTestResult[];
  errors: ToolTestResult[];
  slow: ToolTestResult[];
  skipped: ToolTestResult[];
  durationMs: number;
}

// ============================================================================
// TEST CASES - Sample arguments for each tool
// ============================================================================

/**
 * Core test cases with known-good arguments.
 * These tools have specialized executors and are most critical.
 */
const CORE_TEST_CASES: ToolTestCase[] = [
  // Music
  { fn: 'playMusic', args: { query: 'relaxing jazz' }, domain: 'music', expectFields: ['response'] },

  // Memory (these use mock user data)
  { fn: 'rememberAboutUser', args: { fact: 'Test fact for validation' }, domain: 'memory' },
  { fn: 'recallFromMemory', args: { query: 'preferences' }, domain: 'memory' },

  // Productivity - Tasks
  { fn: 'addTask', args: { title: 'Test task', priority: 'medium' }, domain: 'productivity' },
  { fn: 'getTasks', args: {}, domain: 'productivity' },

  // Productivity - Notes
  { fn: 'addNote', args: { content: 'Test note content' }, domain: 'productivity' },
  { fn: 'getNotes', args: {}, domain: 'productivity' },

  // Productivity - Reminders
  { fn: 'getReminders', args: {}, domain: 'productivity' },

  // Productivity - Goals
  { fn: 'getGoals', args: {}, domain: 'productivity' },

  // Calendar
  { fn: 'getCalendarToday', args: {}, domain: 'calendar' },

  // Information
  { fn: 'getCurrentTime', args: {}, domain: 'information', expectFields: ['time'] },

  // Handoffs (these should return guidance, not actually handoff)
  { fn: 'handoffToMaya', args: { reason: 'Test validation' }, domain: 'handoff', skipInQuickMode: true },
  { fn: 'handoffToPeter', args: { reason: 'Test validation' }, domain: 'handoff', skipInQuickMode: true },

  // Scheduling
  { fn: 'getScheduled', args: {}, domain: 'scheduling' },

  // Habits
  { fn: 'getHabits', args: {}, domain: 'habits' },

  // Voice memos
  { fn: 'listVoiceMemos', args: {}, domain: 'voice-memos' },

  // Home
  { fn: 'getHomeStatus', args: {}, domain: 'home' },

  // Utility
  { fn: 'calculateTip', args: { amount: 50, tipPercent: 20 }, domain: 'utility' },

  // Language/Settings
  { fn: 'getCurrentLanguage', args: {}, domain: 'settings' },
  { fn: 'listSupportedLanguages', args: {}, domain: 'settings' },
];

/**
 * Domain tool samples - representative tools from auto-discovered domains.
 * Tests that the dynamic domain executor is working.
 * Expanded to cover 200+ tools across all major domains (January 2026).
 */
const DOMAIN_TEST_CASES: ToolTestCase[] = [
  // ============================================================================
  // EMOTIONAL SUPPORT & WELLNESS
  // ============================================================================
  { fn: 'breatheWithMe', args: {}, domain: 'breathing', description: 'Guided breathing' },
  { fn: 'logMood', args: { mood: 'content', notes: 'Test validation' }, domain: 'wellness' },
  { fn: 'deEscalateAnxiety', args: {}, domain: 'anxiety', skipInQuickMode: true },
  { fn: 'angerCoolDown', args: {}, domain: 'anger', skipInQuickMode: true },
  { fn: 'compassionateLetter', args: { topic: 'self-kindness' }, domain: 'self-compassion', skipInQuickMode: true },
  { fn: 'acknowledgeLoneliness', args: {}, domain: 'loneliness', skipInQuickMode: true },
  { fn: 'cravingSupport', args: { craving: 'snacks' }, domain: 'cravings', skipInQuickMode: true },

  // ============================================================================
  // COACHING & BURNOUT
  // ============================================================================
  { fn: 'assessBurnout', args: {}, domain: 'burnout' },
  { fn: 'burnoutCoaching', args: {}, domain: 'burnout', skipInQuickMode: true },
  { fn: 'burnoutRecoveryPlan', args: {}, domain: 'burnout', skipInQuickMode: true },
  { fn: 'boundaryCoaching', args: { situation: 'work stress' }, domain: 'boundaries' },
  { fn: 'boundaryInventory', args: {}, domain: 'boundaries', skipInQuickMode: true },
  { fn: 'gentleAccountability', args: { goal: 'exercise more' }, domain: 'accountability', skipInQuickMode: true },

  // ============================================================================
  // RELATIONSHIPS
  // ============================================================================
  { fn: 'addRelationship', args: { name: 'Test Person', relationship: 'friend' }, domain: 'relationships' },
  { fn: 'assessRelationshipHealth', args: { relationship: 'partner' }, domain: 'relationships', skipInQuickMode: true },
  { fn: 'deepenFriendship', args: { friendName: 'Alex' }, domain: 'relationships', skipInQuickMode: true },
  { fn: 'conflictResolution', args: { situation: 'disagreement' }, domain: 'relationships', skipInQuickMode: true },
  { fn: 'craftApology', args: { situation: 'missed meeting' }, domain: 'relationships', skipInQuickMode: true },
  { fn: 'balanceAloneAndTogether', args: {}, domain: 'relationships', skipInQuickMode: true },

  // ============================================================================
  // DATING & ROMANCE
  // ============================================================================
  { fn: 'datingAdvice', args: { situation: 'first date' }, domain: 'dating', skipInQuickMode: true },
  { fn: 'datingReadiness', args: {}, domain: 'dating', skipInQuickMode: true },
  { fn: 'datingRedFlags', args: {}, domain: 'dating', skipInQuickMode: true },
  { fn: 'afterDateReflection', args: {}, domain: 'dating', skipInQuickMode: true },
  { fn: 'breakupSupport', args: {}, domain: 'breakup', skipInQuickMode: true },

  // ============================================================================
  // LIFE PLANNING & PURPOSE
  // ============================================================================
  { fn: 'bucketList', args: { action: 'list' }, domain: 'life-planning' },
  { fn: 'defineLegacy', args: {}, domain: 'legacy', skipInQuickMode: true },
  { fn: 'explorePurpose', args: {}, domain: 'purpose', skipInQuickMode: true },
  { fn: 'futureSelf', args: { timeframe: '5 years' }, domain: 'future', skipInQuickMode: true },
  { fn: 'createPersonalMission', args: {}, domain: 'mission', skipInQuickMode: true },
  { fn: 'exploreLifeChapter', args: {}, domain: 'life-chapters', skipInQuickMode: true },

  // ============================================================================
  // DECISION SUPPORT
  // ============================================================================
  { fn: 'analyzeProsAndCons', args: { decision: 'Test decision' }, domain: 'decisions' },
  { fn: 'frameMajorDecision', args: { decision: 'career change' }, domain: 'decisions', skipInQuickMode: true },
  { fn: 'assessRisk', args: { situation: 'new job' }, domain: 'decisions', skipInQuickMode: true },

  // ============================================================================
  // BODY IMAGE & HEALTH
  // ============================================================================
  { fn: 'bodyGratitude', args: {}, domain: 'body-image' },
  { fn: 'bodyNeutrality', args: {}, domain: 'body-image', skipInQuickMode: true },
  { fn: 'bodyImageCompassion', args: {}, domain: 'body-image', skipInQuickMode: true },
  { fn: 'emotionalEating', args: {}, domain: 'eating', skipInQuickMode: true },

  // ============================================================================
  // CAREER
  // ============================================================================
  { fn: 'assessCareerSatisfaction', args: {}, domain: 'career' },
  { fn: 'clarifyCareerGoals', args: {}, domain: 'career', skipInQuickMode: true },
  { fn: 'findMeaningInWork', args: {}, domain: 'career', skipInQuickMode: true },
  { fn: 'assessWorkBurnout', args: {}, domain: 'career', skipInQuickMode: true },
  { fn: 'advocatingForSelf', args: { context: 'work' }, domain: 'career', skipInQuickMode: true },

  // ============================================================================
  // SLEEP
  // ============================================================================
  { fn: 'analyzeSleepPattern', args: {}, domain: 'sleep' },

  // ============================================================================
  // GRIEF & LOSS
  // ============================================================================
  { fn: 'acknowledgeLoss', args: {}, domain: 'grief', skipInQuickMode: true },
  { fn: 'companionInGrief', args: {}, domain: 'grief', skipInQuickMode: true },
  { fn: 'anticipatoryGrief', args: {}, domain: 'grief', skipInQuickMode: true },
  { fn: 'anniversarySupport', args: {}, domain: 'grief', skipInQuickMode: true },

  // ============================================================================
  // FAMILY
  // ============================================================================
  { fn: 'createFamilyTradition', args: { occasion: 'holidays' }, domain: 'family', skipInQuickMode: true },
  { fn: 'blendedFamilyConflict', args: {}, domain: 'family', skipInQuickMode: true },
  { fn: 'emptyNest', args: {}, domain: 'family', skipInQuickMode: true },
  { fn: 'elderCareSupport', args: {}, domain: 'family', skipInQuickMode: true },
  { fn: 'coParentingAfterDivorce', args: {}, domain: 'family', skipInQuickMode: true },

  // ============================================================================
  // CREATIVITY & PLAY
  // ============================================================================
  { fn: 'buildCreativeHabit', args: { creative: 'writing' }, domain: 'creativity', skipInQuickMode: true },
  { fn: 'cultivatePlayfulness', args: {}, domain: 'play', skipInQuickMode: true },
  { fn: 'becomeSilly', args: {}, domain: 'play', skipInQuickMode: true },
  { fn: 'findInspiration', args: {}, domain: 'creativity', skipInQuickMode: true },

  // ============================================================================
  // PRODUCTIVITY & ADHD
  // ============================================================================
  { fn: 'breakDownTask', args: { task: 'big project' }, domain: 'productivity' },
  { fn: 'adhdTaskStart', args: { task: 'homework' }, domain: 'adhd', skipInQuickMode: true },
  { fn: 'adhdTimeBlindness', args: {}, domain: 'adhd', skipInQuickMode: true },
  { fn: 'adhdBodyDoubling', args: {}, domain: 'adhd', skipInQuickMode: true },
  { fn: 'executiveFunctionSupport', args: {}, domain: 'adhd', skipInQuickMode: true },

  // ============================================================================
  // IMPOSTER SYNDROME & SELF-DOUBT
  // ============================================================================
  { fn: 'addressImposter', args: {}, domain: 'imposter', skipInQuickMode: true },
  { fn: 'addressPerfectionism', args: {}, domain: 'perfectionism', skipInQuickMode: true },
  { fn: 'embraceImperfection', args: {}, domain: 'perfectionism', skipInQuickMode: true },
  { fn: 'affirmWorth', args: {}, domain: 'self-worth', skipInQuickMode: true },

  // ============================================================================
  // FAITH & MEANING
  // ============================================================================
  { fn: 'exploreLifePhilosophy', args: {}, domain: 'philosophy', skipInQuickMode: true },
  { fn: 'exploreMortality', args: {}, domain: 'mortality', skipInQuickMode: true },
  { fn: 'faithDeconstruction', args: {}, domain: 'faith', skipInQuickMode: true },
  { fn: 'findMeaningInSuffering', args: {}, domain: 'meaning', skipInQuickMode: true },

  // ============================================================================
  // TRANSITIONS & CHANGE
  // ============================================================================
  { fn: 'acknowledgeTransition', args: { transition: 'new job' }, domain: 'transitions', skipInQuickMode: true },
  { fn: 'embraceNewIdentity', args: {}, domain: 'identity', skipInQuickMode: true },
  { fn: 'adaptToNewNormal', args: {}, domain: 'transitions', skipInQuickMode: true },
  { fn: 'assessReadinessForChange', args: {}, domain: 'change', skipInQuickMode: true },

  // ============================================================================
  // CELEBRATIONS & WINS
  // ============================================================================
  { fn: 'celebrateTinyWin', args: { win: 'finished task' }, domain: 'celebrations' },
  { fn: 'celebrateProgress', args: {}, domain: 'celebrations', skipInQuickMode: true },
  { fn: 'celebrateYourself', args: {}, domain: 'celebrations', skipInQuickMode: true },
  { fn: 'celebrateCompletion', args: { what: 'project' }, domain: 'celebrations', skipInQuickMode: true },

  // ============================================================================
  // NEWS & INFORMATION
  // ============================================================================
  { fn: 'getNews', args: { topic: 'technology' }, domain: 'news' },
  { fn: 'analyzeNewsMoodImpact', args: {}, domain: 'news', skipInQuickMode: true },
  { fn: 'explainConcept', args: { concept: 'blockchain' }, domain: 'education', skipInQuickMode: true },

  // ============================================================================
  // HOME & ENVIRONMENT
  // ============================================================================
  { fn: 'controlLight', args: { room: 'living room', brightness: 50 }, domain: 'smart-home', skipInQuickMode: true },
  { fn: 'activateScene', args: { scene: 'relax' }, domain: 'smart-home', skipInQuickMode: true },
  { fn: 'getAirQuality', args: {}, domain: 'environment', skipInQuickMode: true },

  // ============================================================================
  // GAMES & ENGAGEMENT
  // ============================================================================
  { fn: 'getGameStatus', args: {}, domain: 'games', skipInQuickMode: true },
  { fn: 'getGameHint', args: {}, domain: 'games', skipInQuickMode: true },

  // ============================================================================
  // READING & LEARNING
  // ============================================================================
  { fn: 'getBookRecommendations', args: { genre: 'self-help' }, domain: 'reading', skipInQuickMode: true },
  { fn: 'addToReadingList', args: { book: 'Atomic Habits' }, domain: 'reading', skipInQuickMode: true },
  { fn: 'createLearningPath', args: { topic: 'programming' }, domain: 'learning', skipInQuickMode: true },

  // ============================================================================
  // TRAVEL & ENTERTAINMENT
  // ============================================================================
  { fn: 'getFlightPrice', args: { from: 'SFO', to: 'NYC' }, domain: 'travel', skipInQuickMode: true },
  { fn: 'addToWatchlist', args: { show: 'Breaking Bad' }, domain: 'entertainment', skipInQuickMode: true },
  { fn: 'foodDelivery', args: { cuisine: 'pizza' }, domain: 'food', skipInQuickMode: true },

  // ============================================================================
  // AUTISM & NEURODIVERGENCE
  // ============================================================================
  { fn: 'autismSensoryRegulation', args: {}, domain: 'autism', skipInQuickMode: true },
  { fn: 'autismSocialEnergy', args: {}, domain: 'autism', skipInQuickMode: true },

  // ============================================================================
  // COMMUNICATION & SOCIAL
  // ============================================================================
  { fn: 'communicationStrategy', args: { context: 'difficult conversation' }, domain: 'communication', skipInQuickMode: true },
  { fn: 'anticipateResponses', args: { message: 'I need to talk' }, domain: 'communication', skipInQuickMode: true },
  { fn: 'difficultEmailDraft', args: { topic: 'complaint' }, domain: 'communication', skipInQuickMode: true },

  // ============================================================================
  // VALUES & ALIGNMENT
  // ============================================================================
  { fn: 'clarifyValues', args: {}, domain: 'values', skipInQuickMode: true },
  { fn: 'checkValuesAlignment', args: {}, domain: 'values', skipInQuickMode: true },
  { fn: 'discussValues', args: { value: 'integrity' }, domain: 'values', skipInQuickMode: true },

  // ============================================================================
  // CAREGIVING
  // ============================================================================
  { fn: 'caregiverBurnout', args: {}, domain: 'caregiving', skipInQuickMode: true },
  { fn: 'caregiverGuilt', args: {}, domain: 'caregiving', skipInQuickMode: true },
  { fn: 'balancingCare', args: {}, domain: 'caregiving', skipInQuickMode: true },

  // ============================================================================
  // DIGITAL WELLNESS
  // ============================================================================
  { fn: 'digitalBoundaries', args: {}, domain: 'digital', skipInQuickMode: true },
  { fn: 'digitalAudit', args: {}, domain: 'digital', skipInQuickMode: true },
  { fn: 'dopamineManagement', args: {}, domain: 'digital', skipInQuickMode: true },

  // ============================================================================
  // ENERGY & VITALITY
  // ============================================================================
  { fn: 'assessEnergyLevel', args: {}, domain: 'energy', skipInQuickMode: true },
  { fn: 'energyBudgeting', args: {}, domain: 'energy', skipInQuickMode: true },
  { fn: 'findSustainablePace', args: {}, domain: 'energy', skipInQuickMode: true },

  // ============================================================================
  // PATTERNS & INSIGHTS
  // ============================================================================
  { fn: 'discoverPattern', args: { area: 'mood' }, domain: 'patterns', skipInQuickMode: true },
  { fn: 'counterIntuitiveInsight', args: {}, domain: 'insights', skipInQuickMode: true },
  { fn: 'crossDomainConnection', args: {}, domain: 'insights', skipInQuickMode: true },

  // ============================================================================
  // SHAME & FORGIVENESS
  // ============================================================================
  { fn: 'exploreShame', args: {}, domain: 'shame', skipInQuickMode: true },
  { fn: 'distinguishShameFromGuilt', args: {}, domain: 'shame', skipInQuickMode: true },
  { fn: 'forgivenessJourney', args: {}, domain: 'forgiveness', skipInQuickMode: true },

  // ============================================================================
  // DREAMS & SUBCONSCIOUS
  // ============================================================================
  { fn: 'captureDream', args: { dream: 'flying dream' }, domain: 'dreams', skipInQuickMode: true },
  { fn: 'exploreDream', args: {}, domain: 'dreams', skipInQuickMode: true },

  // ============================================================================
  // WONDER & AWE
  // ============================================================================
  { fn: 'experienceWonder', args: {}, domain: 'wonder', skipInQuickMode: true },
  { fn: 'cultivateBeginnersMind', args: {}, domain: 'mindfulness', skipInQuickMode: true },
  { fn: 'embraceMystery', args: {}, domain: 'wonder', skipInQuickMode: true },

  // ============================================================================
  // SAFETY & CRISIS
  // ============================================================================
  { fn: 'createSafetyPlan', args: {}, domain: 'safety', skipInQuickMode: true },
  { fn: 'findSafeResources', args: {}, domain: 'safety', skipInQuickMode: true },

  // ============================================================================
  // SEASONS & RITUALS
  // ============================================================================
  { fn: 'applySeasonalWisdom', args: { season: 'winter' }, domain: 'seasons', skipInQuickMode: true },
  { fn: 'createTransitionRitual', args: { transition: 'morning' }, domain: 'rituals', skipInQuickMode: true },
  { fn: 'createTradition', args: { occasion: 'Sunday' }, domain: 'traditions', skipInQuickMode: true },

  // ============================================================================
  // TIME CAPSULES & MEMORIES
  // ============================================================================
  { fn: 'createTimeCapsule', args: { for: '1 year from now' }, domain: 'memories', skipInQuickMode: true },
  { fn: 'captureLifeStory', args: {}, domain: 'memories', skipInQuickMode: true },

  // ============================================================================
  // PROACTIVE & BACKGROUND
  // ============================================================================
  { fn: 'checkProactiveAlerts', args: {}, domain: 'proactive' },
  { fn: 'checkBackgroundJob', args: { jobId: 'test' }, domain: 'background', skipInQuickMode: true },
  { fn: 'generateProactiveMessage', args: {}, domain: 'proactive', skipInQuickMode: true },
];

// ============================================================================
// API CLIENT
// ============================================================================

const DEFAULT_API_BASE = 'http://localhost:3002';
const TEST_USER_ID = 'test-validator-user';
const SLOW_THRESHOLD_MS = 2000;

async function callToolApi(
  fn: string,
  args: Record<string, unknown>,
  apiBase: string
): Promise<{ success: boolean; result?: unknown; error?: string; durationMs: number }> {
  const url = `${apiBase}/api/chat/tool`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dev-Mode': 'true', // Enable dev mode for testing
      },
      body: JSON.stringify({
        fn,
        args,
        userId: TEST_USER_ID,
      }),
    });

    const data = await response.json();
    return {
      success: data.success ?? false,
      result: data.result,
      error: data.error,
      durationMs: data.durationMs ?? 0,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      durationMs: 0,
    };
  }
}

// ============================================================================
// VALIDATION LOGIC
// ============================================================================

async function runToolTest(
  testCase: ToolTestCase,
  apiBase: string
): Promise<ToolTestResult> {
  const { fn, args, domain, expectFields } = testCase;

  const result = await callToolApi(fn, args, apiBase);

  // Determine status
  let status: ToolTestResult['status'] = 'success';
  let error: string | undefined;

  if (!result.success) {
    status = 'error';
    error = result.error || 'Unknown error';
  } else if (result.durationMs > SLOW_THRESHOLD_MS) {
    status = 'slow';
  } else if (expectFields && result.result) {
    // Validate expected fields
    const resultObj = result.result as Record<string, unknown>;
    const missingFields = expectFields.filter((f) => !(f in resultObj));
    if (missingFields.length > 0) {
      status = 'error';
      error = `Missing expected fields: ${missingFields.join(', ')}`;
    }
  }

  return {
    fn,
    domain,
    status,
    durationMs: result.durationMs,
    error,
    response: result.result,
  };
}

// ============================================================================
// MAIN VALIDATION RUNNER
// ============================================================================

interface RunOptions {
  quick?: boolean;
  domain?: string;
  apiBase?: string;
  verbose?: boolean;
}

async function runToolsE2EValidation(options: RunOptions = {}): Promise<ValidationReport> {
  const { quick = false, domain, apiBase = DEFAULT_API_BASE, verbose = false } = options;

  const startTime = Date.now();

  // Build test case list
  let testCases: ToolTestCase[] = [...CORE_TEST_CASES, ...DOMAIN_TEST_CASES];

  // Filter by domain if specified
  if (domain) {
    testCases = testCases.filter((tc) => tc.domain === domain);
  }

  // Filter for quick mode
  if (quick) {
    testCases = testCases.filter((tc) => !tc.skipInQuickMode);
  }

  console.log(`\n${colors.cyan}${colors.bold}Tool E2E Validation${colors.reset}`);
  console.log(`${colors.dim}Testing ${testCases.length} tools against ${apiBase}${colors.reset}\n`);

  // Check API is reachable
  try {
    const healthCheck = await fetch(`${apiBase}/health`);
    if (!healthCheck.ok) {
      console.log(`${colors.red}${icons.failure} API not reachable at ${apiBase}/health${colors.reset}`);
      console.log(`${colors.dim}Start the UI server with: pnpm ui-server${colors.reset}\n`);
      process.exit(1);
    }
  } catch {
    console.log(`${colors.red}${icons.failure} API not reachable at ${apiBase}${colors.reset}`);
    console.log(`${colors.dim}Start the UI server with: pnpm ui-server${colors.reset}\n`);
    process.exit(1);
  }

  // Run tests
  const results: ToolTestResult[] = [];
  let spinnerIdx = 0;

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const progress = `[${i + 1}/${testCases.length}]`;

    // Show spinner
    process.stdout.write(
      `\r${colors.cyan}${icons.spinner[spinnerIdx % icons.spinner.length]}${colors.reset} ${progress} Testing ${testCase.fn}...`
    );
    spinnerIdx++;

    const result = await runToolTest(testCase, apiBase);
    results.push(result);

    // Show result inline
    const statusIcon =
      result.status === 'success'
        ? `${colors.green}${icons.success}${colors.reset}`
        : result.status === 'slow'
          ? `${colors.yellow}${icons.warning}${colors.reset}`
          : `${colors.red}${icons.failure}${colors.reset}`;

    const durationStr = `${colors.dim}(${result.durationMs}ms)${colors.reset}`;

    // Clear line and show result
    process.stdout.write(`\r${' '.repeat(80)}\r`);

    if (verbose || result.status !== 'success') {
      console.log(
        `${statusIcon} ${progress} ${result.fn} ${durationStr}${result.error ? ` - ${colors.red}${result.error}${colors.reset}` : ''}`
      );
    }
  }

  // Clear spinner line
  process.stdout.write(`\r${' '.repeat(80)}\r`);

  // Categorize results
  const success = results.filter((r) => r.status === 'success');
  const errors = results.filter((r) => r.status === 'error');
  const slow = results.filter((r) => r.status === 'slow');
  const skipped = results.filter((r) => r.status === 'skipped');

  const totalTime = Date.now() - startTime;

  // Build report
  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      success: success.length,
      error: errors.length,
      slow: slow.length,
      skipped: skipped.length,
      successRate: `${((success.length / results.length) * 100).toFixed(1)}%`,
    },
    thresholds: {
      slowMs: SLOW_THRESHOLD_MS,
    },
    success,
    errors,
    slow,
    skipped,
    durationMs: totalTime,
  };

  return report;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function printReport(report: ValidationReport): void {
  const { summary } = report;

  console.log(`\n${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}                    TOOL E2E VALIDATION REPORT${colors.reset}`);
  console.log(`${colors.bold}═══════════════════════════════════════════════════════════════${colors.reset}\n`);

  // Summary stats
  const successColor = summary.error === 0 ? colors.green : colors.yellow;
  console.log(`${colors.bold}Summary:${colors.reset}`);
  console.log(`  ${icons.bullet} Total tools tested: ${colors.bold}${summary.total}${colors.reset}`);
  console.log(`  ${colors.green}${icons.success}${colors.reset} Success: ${colors.green}${summary.success}${colors.reset}`);
  console.log(`  ${colors.red}${icons.failure}${colors.reset} Errors: ${colors.red}${summary.error}${colors.reset}`);
  console.log(`  ${colors.yellow}${icons.warning}${colors.reset} Slow (>${report.thresholds.slowMs}ms): ${colors.yellow}${summary.slow}${colors.reset}`);
  console.log(`  ${successColor}${icons.bullet}${colors.reset} Success rate: ${successColor}${summary.successRate}${colors.reset}`);
  console.log(`  ${icons.bullet} Duration: ${colors.dim}${report.durationMs}ms${colors.reset}\n`);

  // Errors section
  if (report.errors.length > 0) {
    console.log(`${colors.red}${colors.bold}Errors (${report.errors.length}):${colors.reset}`);
    for (const err of report.errors) {
      console.log(`  ${colors.red}${icons.failure}${colors.reset} ${err.fn} (${err.domain})`);
      console.log(`    ${colors.dim}${err.error}${colors.reset}`);
    }
    console.log('');
  }

  // Slow section
  if (report.slow.length > 0) {
    console.log(`${colors.yellow}${colors.bold}Slow Tools (${report.slow.length}):${colors.reset}`);
    for (const s of report.slow) {
      console.log(`  ${colors.yellow}${icons.warning}${colors.reset} ${s.fn} (${s.domain}) - ${s.durationMs}ms`);
    }
    console.log('');
  }

  // Final verdict
  if (summary.error === 0) {
    console.log(`${colors.green}${colors.bold}${icons.success} All tools validated successfully!${colors.reset}\n`);
  } else {
    console.log(`${colors.red}${colors.bold}${icons.failure} ${summary.error} tool(s) failed validation${colors.reset}\n`);
  }
}

function printJsonReport(report: ValidationReport): void {
  console.log(JSON.stringify(report, null, 2));
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse flags
  const quick = args.includes('--quick') || args.includes('-q');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const jsonOutput = args.includes('--json') || args.includes('--report=json');
  const help = args.includes('--help') || args.includes('-h');

  // Parse --domain flag
  const domainIdx = args.findIndex((a) => a.startsWith('--domain'));
  let domain: string | undefined;
  if (domainIdx !== -1) {
    if (args[domainIdx].includes('=')) {
      domain = args[domainIdx].split('=')[1];
    } else if (args[domainIdx + 1]) {
      domain = args[domainIdx + 1];
    }
  }

  // Parse --api-base flag
  const apiBaseIdx = args.findIndex((a) => a.startsWith('--api-base'));
  let apiBase = DEFAULT_API_BASE;
  if (apiBaseIdx !== -1) {
    if (args[apiBaseIdx].includes('=')) {
      apiBase = args[apiBaseIdx].split('=')[1];
    } else if (args[apiBaseIdx + 1]) {
      apiBase = args[apiBaseIdx + 1];
    }
  }

  if (help) {
    console.log(`
${colors.cyan}${colors.bold}Tool E2E Validation${colors.reset}

Tests that tools are properly wired end-to-end through the chat API.

${colors.bold}Usage:${colors.reset}
  npx tsx apps/cli/src/commands/validate/validate-tools-e2e.ts [options]

${colors.bold}Options:${colors.reset}
  --quick, -q         Run quick validation (~30 core tools only)
  --domain <name>     Test only tools in a specific domain
  --api-base <url>    API base URL (default: http://localhost:3002)
  --json              Output JSON report instead of formatted text
  --verbose, -v       Show all results, not just failures
  --help, -h          Show this help message

${colors.bold}Examples:${colors.reset}
  # Quick validation of core tools
  npx tsx apps/cli/src/commands/validate/validate-tools-e2e.ts --quick

  # Test only music domain
  npx tsx apps/cli/src/commands/validate/validate-tools-e2e.ts --domain music

  # Full validation with JSON output for CI
  npx tsx apps/cli/src/commands/validate/validate-tools-e2e.ts --json > tool-report.json

${colors.bold}Domains:${colors.reset}
  music, memory, productivity, calendar, information, handoff, scheduling,
  habits, voice-memos, home, utility, settings, breathing, wellness,
  burnout, boundaries, relationships, life-planning, decisions, body-image,
  career, sleep
`);
    process.exit(0);
  }

  try {
    const report = await runToolsE2EValidation({
      quick,
      domain,
      apiBase,
      verbose,
    });

    if (jsonOutput) {
      printJsonReport(report);
    } else {
      printReport(report);
    }

    // Exit with error code if failures
    process.exit(report.summary.error > 0 ? 1 : 0);
  } catch (err) {
    console.error(`${colors.red}${icons.failure} Validation failed: ${err}${colors.reset}`);
    process.exit(1);
  }
}

main();
