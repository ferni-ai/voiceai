/**
 * Memory Intelligence Validation CLI
 *
 * Tests the Memory Intelligence system components:
 * - Timing rules (blocking and triggering conditions)
 * - Phrasing generation (persona voice, warmth)
 * - Response tracking and preference learning
 * - Full pipeline integration
 *
 * Usage:
 *   ferni validate memory-intelligence           # Full validation
 *   ferni validate memory-intelligence timing    # Test timing rules only
 *   ferni validate memory-intelligence phrasing  # Test phrasing generation
 *   ferni validate memory-intelligence learning  # Test preference learning
 *   ferni validate memory-intelligence e2e       # Full pipeline test
 *
 * @module cli/commands/validate/validate-memory-intelligence
 */

// ============================================================================
// COLORS & STYLING
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const icons = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  brain: '🧠',
  timing: '⏱️',
  voice: '🎙️',
  learning: '📚',
  test: '🧪',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}${icons.info}${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}${icons.success}${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}${icons.warning}${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}${icons.error}${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`  ${colors.dim}→${colors.reset} ${msg}`),
  header: (msg: string) =>
    console.log(`\n${colors.bold}${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
};

// ============================================================================
// TYPES
// ============================================================================

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

interface ValidationReport {
  section: string;
  results: ValidationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
}

// ============================================================================
// TIMING VALIDATION
// ============================================================================

async function validateTiming(): Promise<ValidationResult[]> {
  log.header(`${icons.timing} Timing Rules Validation`);

  const results: ValidationResult[] = [];

  try {
    // Import the timing engine
    const { TimingEngine } = await import(
      '../../../../../src/intelligence/memory-intelligence/timing/timing-engine.js'
    );

    const engine = new TimingEngine();

    // Test 1: Blocking rule - Crisis detected
    const crisisDecision = await engine.shouldSurface({
      userId: 'test-user',
      userText: 'I feel so hopeless',
      crisisDetected: true,
      emotionalIntensity: 0.9,
      turnCount: 5,
      turnsSinceLastMemory: 10,
      persona: 'ferni',
    });

    results.push({
      name: 'Blocking: Crisis detection',
      passed: !crisisDecision.shouldSurface,
      message: !crisisDecision.shouldSurface
        ? 'Correctly blocks during crisis'
        : 'Should block during crisis',
      details: `crisisDetected=true → blocked=${!crisisDecision.shouldSurface}`,
    });

    // Test 2: Blocking rule - First 2 turns
    const earlyDecision = await engine.shouldSurface({
      userId: 'test-user',
      userText: 'Hey how are you',
      crisisDetected: false,
      emotionalIntensity: 0.3,
      turnCount: 1,
      turnsSinceLastMemory: 100,
      persona: 'ferni',
    });

    results.push({
      name: 'Blocking: Early turns',
      passed: !earlyDecision.shouldSurface,
      message: !earlyDecision.shouldSurface
        ? 'Correctly blocks in first 2 turns'
        : 'Should block in first 2 turns',
      details: `turnCount=1 → blocked=${!earlyDecision.shouldSurface}`,
    });

    // Test 3: Blocking rule - High emotional intensity
    const highEmotionDecision = await engine.shouldSurface({
      userId: 'test-user',
      userText: 'I am SO frustrated right now!!!',
      crisisDetected: false,
      emotionalIntensity: 0.95,
      turnCount: 10,
      turnsSinceLastMemory: 5,
      persona: 'ferni',
    });

    results.push({
      name: 'Blocking: High emotional intensity',
      passed: !highEmotionDecision.shouldSurface,
      message: !highEmotionDecision.shouldSurface
        ? 'Correctly blocks during high emotion'
        : 'Should block during high emotion',
      details: `emotionalIntensity=0.95 → blocked=${!highEmotionDecision.shouldSurface}`,
    });

    // Test 4: Blocking rule - Recent memory surfaced
    const recentMemoryDecision = await engine.shouldSurface({
      userId: 'test-user',
      userText: 'Tell me more',
      crisisDetected: false,
      emotionalIntensity: 0.3,
      turnCount: 10,
      turnsSinceLastMemory: 1,
      persona: 'ferni',
    });

    results.push({
      name: 'Blocking: Recent memory surfaced',
      passed: !recentMemoryDecision.shouldSurface,
      message: !recentMemoryDecision.shouldSurface
        ? 'Correctly blocks when memory recently surfaced'
        : 'Should block when memory recently surfaced',
      details: `turnsSinceLastMemory=1 → blocked=${!recentMemoryDecision.shouldSurface}`,
    });

    // Test 5: Triggering - Topic relevance
    const topicDecision = await engine.shouldSurface({
      userId: 'test-user',
      userText: 'I want to talk about my career goals',
      crisisDetected: false,
      emotionalIntensity: 0.4,
      turnCount: 8,
      turnsSinceLastMemory: 5,
      persona: 'ferni',
      detectedTopics: ['career', 'goals'],
      availableMemoryRelevance: 0.9,
    });

    results.push({
      name: 'Triggering: Topic relevance',
      passed: topicDecision.confidence > 0.5,
      message: topicDecision.confidence > 0.5
        ? `High confidence (${topicDecision.confidence.toFixed(2)}) on topic match`
        : `Low confidence (${topicDecision.confidence.toFixed(2)}) on topic match`,
      details: `topics=['career', 'goals'] → confidence=${topicDecision.confidence.toFixed(2)}`,
    });

    // Log results
    for (const result of results) {
      if (result.passed) {
        log.success(`${result.name}: ${result.message}`);
      } else {
        log.error(`${result.name}: ${result.message}`);
      }
      if (result.details) {
        log.step(result.details);
      }
    }
  } catch (error) {
    results.push({
      name: 'Timing validation error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log.error(`Timing validation error: ${error}`);
  }

  return results;
}

// ============================================================================
// PHRASING VALIDATION
// ============================================================================

async function validatePhrasing(): Promise<ValidationResult[]> {
  log.header(`${icons.voice} Persona Phrasing Validation`);

  const results: ValidationResult[] = [];

  try {
    const { PhrasingGenerator } = await import(
      '../../../../../src/intelligence/memory-intelligence/phrasing/phrasing-generator.js'
    );

    const generator = new PhrasingGenerator();

    const testMemory = {
      id: 'test-1',
      content: 'User mentioned they are training for a marathon',
      topics: ['fitness', 'marathon'],
      emotionalWeight: 0.7,
      createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    };

    // Test each persona
    const personas: Array<'ferni' | 'peter' | 'maya' | 'alex' | 'jordan' | 'nayan'> = [
      'ferni',
      'peter',
      'maya',
      'alex',
      'jordan',
      'nayan',
    ];

    for (const personaId of personas) {
      try {
        const result = await generator.generatePhrasing({
          memory: testMemory as any,
          persona: personaId,
          conversationContext: {
            currentTopic: 'health',
            emotionalTone: 'positive',
            turnCount: 5,
          },
        });

        const hasContent = result.phrasing && result.phrasing.length > 10;
        const avoidsDatabaseSpeak =
          !result.phrasing?.includes('database') && !result.phrasing?.includes('retrieved');

        results.push({
          name: `Phrasing: ${personaId}`,
          passed: hasContent && avoidsDatabaseSpeak,
          message: hasContent
            ? avoidsDatabaseSpeak
              ? 'Natural phrasing generated'
              : 'Contains database terminology'
            : 'Empty or too short',
          details: result.phrasing ? `"${result.phrasing.slice(0, 80)}..."` : 'No output',
        });

        if (hasContent && avoidsDatabaseSpeak) {
          log.success(`${personaId}: Natural phrasing generated`);
        } else {
          log.error(`${personaId}: ${!hasContent ? 'Empty output' : 'Contains database speak'}`);
        }
        if (result.phrasing) {
          log.step(`"${result.phrasing.slice(0, 60)}..."`);
        }
      } catch (err) {
        results.push({
          name: `Phrasing: ${personaId}`,
          passed: false,
          message: `Error: ${err instanceof Error ? err.message : String(err)}`,
        });
        log.error(`${personaId}: Error - ${err}`);
      }
    }
  } catch (error) {
    results.push({
      name: 'Phrasing validation error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log.error(`Phrasing validation error: ${error}`);
  }

  return results;
}

// ============================================================================
// LEARNING VALIDATION
// ============================================================================

async function validateLearning(): Promise<ValidationResult[]> {
  log.header(`${icons.learning} Preference Learning Validation`);

  const results: ValidationResult[] = [];

  try {
    const { ResponseTracker } = await import(
      '../../../../../src/intelligence/memory-intelligence/learning/response-tracker.js'
    );
    const { ProfileBuilder } = await import(
      '../../../../../src/intelligence/memory-intelligence/learning/profile-builder.js'
    );
    const { PreferenceLearner } = await import(
      '../../../../../src/intelligence/memory-intelligence/learning/preference-learner.js'
    );

    // Test response tracker
    const tracker = new ResponseTracker();
    results.push({
      name: 'Response tracker instantiation',
      passed: tracker !== null && tracker !== undefined,
      message: tracker ? 'Available' : 'Failed to create tracker',
    });

    // Test recording surfacing
    tracker.recordSurfacing({
      userId: 'test-user',
      memoryId: 'mem-1',
      sessionId: 'session-1',
      timestamp: new Date(),
      confidence: 0.8,
    });

    tracker.recordResponse({
      userId: 'test-user',
      memoryId: 'mem-1',
      sessionId: 'session-1',
      response: 'engaged',
      timestamp: new Date(),
    });

    const record = tracker.getSessionRecord('test-user', 'session-1');
    const trackedCorrectly = record && record.surfacedMemories.length > 0;

    results.push({
      name: 'Response tracking',
      passed: !!trackedCorrectly,
      message: trackedCorrectly
        ? 'Correctly tracks surfacing and response'
        : 'Failed to track response',
      details: `Surfaced: ${record?.surfacedMemories.length || 0} memories`,
    });

    if (trackedCorrectly) {
      log.success('Response tracking: Working');
    } else {
      log.error('Response tracking: Failed');
    }

    // Test profile builder
    const builder = new ProfileBuilder();
    const mockRecords = [
      {
        sessionId: 'session-1',
        userId: 'test-user',
        startTime: new Date(),
        surfacedMemories: [
          {
            memoryId: 'mem-1',
            timestamp: new Date(),
            confidence: 0.8,
            topics: ['career'],
            response: 'engaged' as const,
            responseTime: 1500,
          },
        ],
      },
    ];

    const profile = builder.buildProfile('test-user', mockRecords);
    const hasProfile = profile && profile.responsePatterns;

    results.push({
      name: 'Profile building',
      passed: !!hasProfile,
      message: hasProfile ? 'Profile built successfully' : 'Failed to build profile',
    });

    if (hasProfile) {
      log.success('Profile building: Working');
    } else {
      log.error('Profile building: Failed');
    }

    // Test preference learner
    const learner = new PreferenceLearner();
    const mockProfile = {
      receptivityPatterns: {
        byTimeOfDay: new Map([[14, 0.8]]),
        byConversationDepth: new Map([[10, 0.9]]),
        byEmotionalState: new Map([['calm', 0.85]]),
      },
      responsePatterns: {
        topicsWelcomed: ['career', 'growth'],
        topicsDeflected: ['family'],
        preferredPhrasingStyle: 'warm' as const,
      },
      sensitiveTopics: new Set(['health']),
      idealRecallFrequency: 3,
    };

    const prediction = learner.predictReceptivity({
      profile: mockProfile,
      currentHour: 14,
      turnCount: 10,
      currentEmotion: 'calm',
      proposedTopics: ['career'],
    });

    const validPrediction = prediction && prediction.score >= 0 && prediction.score <= 1;

    results.push({
      name: 'Preference prediction',
      passed: !!validPrediction,
      message: validPrediction
        ? `Prediction score: ${prediction.score.toFixed(2)}`
        : 'Invalid prediction',
      details: prediction?.recommendation,
    });

    if (validPrediction) {
      log.success(`Preference prediction: Score ${prediction.score.toFixed(2)}`);
    } else {
      log.error('Preference prediction: Failed');
    }
  } catch (error) {
    results.push({
      name: 'Learning validation error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log.error(`Learning validation error: ${error}`);
  }

  return results;
}

// ============================================================================
// E2E VALIDATION
// ============================================================================

async function validateE2E(): Promise<ValidationResult[]> {
  log.header(`${icons.test} E2E Pipeline Validation`);

  const results: ValidationResult[] = [];

  try {
    const { getMemoryIntelligence } = await import(
      '../../../../../src/intelligence/memory-intelligence/core.js'
    );
    const { getMemoryInjection } = await import(
      '../../../../../src/intelligence/memory-intelligence/turn-processor-integration.js'
    );

    // Test Memory Intelligence initialization
    const mi = getMemoryIntelligence();
    await mi.initialize();

    results.push({
      name: 'Memory Intelligence initialization',
      passed: true,
      message: 'Initialized successfully',
    });
    log.success('Memory Intelligence: Initialized');

    // Test full injection pipeline
    const injection = await getMemoryInjection({
      userId: 'test-e2e-user',
      userText: 'I have been thinking about my career goals',
      sessionId: 'test-session',
      turnCount: 8,
      persona: 'ferni',
      detectedTopics: ['career', 'goals'],
      emotionalIntensity: 0.4,
      trustLevel: 'developing',
      turnsSinceLastMemory: 5,
    });

    results.push({
      name: 'Memory injection pipeline',
      passed: true, // Should not throw
      message: injection
        ? `Injection generated: ${injection.category}`
        : 'No injection (expected for test user)',
    });
    log.success('Memory injection pipeline: Working');
  } catch (error) {
    results.push({
      name: 'E2E validation error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log.error(`E2E validation error: ${error}`);
  }

  return results;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'all';

  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}${icons.brain} MEMORY INTELLIGENCE VALIDATION${colors.reset}                         ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  const reports: ValidationReport[] = [];

  // Run validations based on mode
  if (mode === 'all' || mode === 'timing') {
    const timingResults = await validateTiming();
    reports.push({
      section: 'Timing Rules',
      results: timingResults,
      summary: {
        total: timingResults.length,
        passed: timingResults.filter((r) => r.passed).length,
        failed: timingResults.filter((r) => !r.passed).length,
        passRate:
          timingResults.length > 0
            ? timingResults.filter((r) => r.passed).length / timingResults.length
            : 0,
      },
    });
  }

  if (mode === 'all' || mode === 'phrasing') {
    const phrasingResults = await validatePhrasing();
    reports.push({
      section: 'Persona Phrasing',
      results: phrasingResults,
      summary: {
        total: phrasingResults.length,
        passed: phrasingResults.filter((r) => r.passed).length,
        failed: phrasingResults.filter((r) => !r.passed).length,
        passRate:
          phrasingResults.length > 0
            ? phrasingResults.filter((r) => r.passed).length / phrasingResults.length
            : 0,
      },
    });
  }

  if (mode === 'all' || mode === 'learning') {
    const learningResults = await validateLearning();
    reports.push({
      section: 'Preference Learning',
      results: learningResults,
      summary: {
        total: learningResults.length,
        passed: learningResults.filter((r) => r.passed).length,
        failed: learningResults.filter((r) => !r.passed).length,
        passRate:
          learningResults.length > 0
            ? learningResults.filter((r) => r.passed).length / learningResults.length
            : 0,
      },
    });
  }

  if (mode === 'all' || mode === 'e2e') {
    const e2eResults = await validateE2E();
    reports.push({
      section: 'E2E Pipeline',
      results: e2eResults,
      summary: {
        total: e2eResults.length,
        passed: e2eResults.filter((r) => r.passed).length,
        failed: e2eResults.filter((r) => !r.passed).length,
        passRate:
          e2eResults.length > 0
            ? e2eResults.filter((r) => r.passed).length / e2eResults.length
            : 0,
      },
    });
  }

  // Print summary
  log.header('VALIDATION SUMMARY');

  let totalPassed = 0;
  let totalTests = 0;

  for (const report of reports) {
    totalPassed += report.summary.passed;
    totalTests += report.summary.total;

    const icon = report.summary.passRate >= 0.8 ? icons.success : icons.error;
    const color = report.summary.passRate >= 0.8 ? colors.green : colors.red;

    console.log(
      `  ${color}${icon}${colors.reset} ${report.section}: ${report.summary.passed}/${report.summary.total} (${(report.summary.passRate * 100).toFixed(0)}%)`
    );
  }

  const overallPassRate = totalTests > 0 ? totalPassed / totalTests : 0;
  console.log(`
${colors.bold}Overall:${colors.reset} ${totalPassed}/${totalTests} tests passed (${(overallPassRate * 100).toFixed(0)}%)
`);

  // Exit with appropriate code
  process.exit(overallPassRate >= 0.8 ? 0 : 1);
}

main().catch((error) => {
  log.error(`Validation failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
