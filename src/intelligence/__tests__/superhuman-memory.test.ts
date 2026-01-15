/**
 * Tests for Superhuman Memory Intelligence
 *
 * "Better than human" means remembering what matters at the right moment.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type {
  ComfortPattern,
  GrowthMarker,
  HumanMemory,
  ImportantDate,
  InsideJoke,
  RunningTheme,
} from '../../types/human-memory.js';
import {
  analyzeVoicePatterns,
  buildSuperhumanContext,
  checkUpcomingDates,
  cleanupDeliveryRecords,
  detectTopicAbsences,
  findCelebratableGrowth,
  findSurfaceableJokes,
  getComfortGuidance,
  getTemporalContext,
  markInsightDelivered,
  recordVoicePattern,
  wasRecentlyDelivered,
} from '../superhuman-memory/index.js';

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

function createTestDate(overrides: Partial<ImportantDate> = {}): ImportantDate {
  const now = new Date();
  return {
    id: 'test-date-1',
    type: 'birthday',
    label: "User's birthday",
    month: now.getMonth() + 1, // Current month
    day: now.getDate() + 1, // Tomorrow
    significance: 'meaningful',
    wantsAcknowledgment: true,
    sentiment: 'celebratory',
    discoveredAt: new Date(),
    ...overrides,
  };
}

function createTestComfortPattern(overrides: Partial<ComfortPattern> = {}): ComfortPattern {
  return {
    id: 'test-comfort-1',
    type: 'validation',
    effectiveFor: 'work stress',
    evidence: 'User responded well when feelings were validated',
    discoveredAt: new Date(),
    ...overrides,
  };
}

function createTestGrowthMarker(overrides: Partial<GrowthMarker> = {}): GrowthMarker {
  return {
    id: 'test-growth-1',
    description: 'Started speaking up in meetings',
    before: 'Afraid to voice opinions in meetings',
    after: 'Now regularly contributes ideas',
    observedAt: new Date(),
    acknowledged: false,
    ...overrides,
  };
}

function createTestInsideJoke(overrides: Partial<InsideJoke> = {}): InsideJoke {
  return {
    id: 'test-joke-1',
    reference: 'the spreadsheet incident',
    origin: 'When we joked about their love of spreadsheets',
    originatedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
    usageCount: 3,
    status: 'beloved',
    ...overrides,
  };
}

function createTestRunningTheme(overrides: Partial<RunningTheme> = {}): RunningTheme {
  return {
    id: 'test-theme-1',
    theme: 'learning Spanish',
    frequency: 'often',
    sentiment: 'positive',
    keyMoments: [{ summary: 'Started Duolingo streak', timestamp: new Date() }],
    startedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    lastMentioned: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
    ...overrides,
  };
}

function createTestHumanMemory(overrides: Partial<HumanMemory> = {}): HumanMemory {
  return {
    importantDates: [],
    insideJokes: [],
    runningThemes: [],
    userTeachings: [],
    updatedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// DATE AWARENESS TESTS
// ============================================================================

describe('Proactive Date Awareness', () => {
  it('should detect upcoming birthdays within window', () => {
    const now = new Date();
    const humanMemory = createTestHumanMemory({
      importantDates: [
        createTestDate({
          type: 'birthday',
          month: now.getMonth() + 1,
          day: now.getDate() + 3, // 3 days from now
        }),
      ],
    });

    const insights = checkUpcomingDates(humanMemory, 7);

    expect(insights.length).toBe(1);
    expect(insights[0].type).toBe('date_reminder');
    expect(insights[0].context.tone).toBe('celebratory');
  });

  it('should detect TODAY as high priority', () => {
    const now = new Date();
    const humanMemory = createTestHumanMemory({
      importantDates: [
        createTestDate({
          type: 'birthday',
          month: now.getMonth() + 1,
          day: now.getDate(), // TODAY
        }),
      ],
    });

    const insights = checkUpcomingDates(humanMemory, 7);

    expect(insights.length).toBe(1);
    expect(insights[0].priority).toBe('high');
    expect(insights[0].naturalPhrase).toContain('Happy birthday');
  });

  it('should handle loss anniversaries with care', () => {
    const now = new Date();
    const humanMemory = createTestHumanMemory({
      importantDates: [
        createTestDate({
          type: 'loss_anniversary',
          label: "Dad's passing",
          month: now.getMonth() + 1,
          day: now.getDate(), // TODAY
          sentiment: 'sensitive',
          wantsAcknowledgment: true,
          relatedPerson: 'Dad',
        }),
      ],
    });

    const insights = checkUpcomingDates(humanMemory, 7);

    expect(insights.length).toBe(1);
    expect(insights[0].context.tone).toBe('gentle');
    expect(insights[0].naturalPhrase).toContain("I'm here");
  });

  it('should not surface dates outside window', () => {
    const now = new Date();
    const humanMemory = createTestHumanMemory({
      importantDates: [
        createTestDate({
          month: now.getMonth() + 2, // Next month
          day: 15,
        }),
      ],
    });

    const insights = checkUpcomingDates(humanMemory, 7);

    expect(insights.length).toBe(0);
  });

  it('should return empty for no dates', () => {
    const insights = checkUpcomingDates(undefined);
    expect(insights.length).toBe(0);
  });
});

// ============================================================================
// COMFORT PATTERN TESTS
// ============================================================================

describe('Comfort Pattern Application', () => {
  it('should return validation guidance for high stress', () => {
    const humanMemory = createTestHumanMemory({
      emotionalSignature: {
        humor: {
          appreciates: [],
          avoids: [],
          successfulMoments: [],
          overallLevel: 'enjoys_moderately',
        },
        comfortPatterns: [createTestComfortPattern({ type: 'validation' })],
        tells: [],
        stressTriggers: [],
        updatedAt: new Date(),
      },
    });

    const guidance = getComfortGuidance(humanMemory, 'anxious', 0.8);

    expect(guidance.stressLevel).toBe('high');
    expect(guidance.supportType).toBe('validation');
    expect(guidance.promptInjection).toContain('validation');
  });

  it('should return problem_solving guidance when appropriate', () => {
    const humanMemory = createTestHumanMemory({
      emotionalSignature: {
        humor: {
          appreciates: [],
          avoids: [],
          successfulMoments: [],
          overallLevel: 'enjoys_moderately',
        },
        comfortPatterns: [createTestComfortPattern({ type: 'problem_solving' })],
        tells: [],
        stressTriggers: [],
        updatedAt: new Date(),
      },
    });

    const guidance = getComfortGuidance(humanMemory, 'frustrated', 0.5);

    expect(guidance.supportType).toBe('problem_solving');
    expect(guidance.promptInjection).toContain('actionable solutions');
  });

  it('should return no guidance for low stress', () => {
    const humanMemory = createTestHumanMemory({
      emotionalSignature: {
        humor: {
          appreciates: [],
          avoids: [],
          successfulMoments: [],
          overallLevel: 'enjoys_moderately',
        },
        comfortPatterns: [createTestComfortPattern()],
        tells: [],
        stressTriggers: [],
        updatedAt: new Date(),
      },
    });

    const guidance = getComfortGuidance(humanMemory, 'neutral', 0.1);

    expect(guidance.stressLevel).toBe('none');
    expect(guidance.supportType).toBeNull();
  });
});

// ============================================================================
// GROWTH CELEBRATION TESTS
// ============================================================================

describe('Growth Arc Celebration', () => {
  it('should find unacknowledged growth markers', () => {
    const humanMemory = createTestHumanMemory({
      growthArc: {
        markers: [createTestGrowthMarker({ acknowledged: false })],
        challenges: [],
        updatedAt: new Date(),
      },
    });

    const insights = findCelebratableGrowth(humanMemory);

    expect(insights.length).toBe(1);
    expect(insights[0].type).toBe('growth_celebration');
    expect(insights[0].context.tone).toBe('warm');
  });

  it('should prioritize topic-relevant growth', () => {
    const humanMemory = createTestHumanMemory({
      growthArc: {
        markers: [
          createTestGrowthMarker({
            description: 'Better at public speaking',
            before: 'Terrified of presentations',
            after: 'Gave a great talk',
          }),
        ],
        challenges: [],
        updatedAt: new Date(),
      },
    });

    const insights = findCelebratableGrowth(humanMemory, 'presentation');

    expect(insights.length).toBe(1);
    expect(insights[0].context.timing).toBe('when_relevant');
  });

  it('should skip already-acknowledged deflected growth', () => {
    const humanMemory = createTestHumanMemory({
      growthArc: {
        markers: [
          createTestGrowthMarker({
            acknowledged: true,
            reactionWhenAcknowledged: 'deflected',
          }),
        ],
        challenges: [],
        updatedAt: new Date(),
      },
    });

    const insights = findCelebratableGrowth(humanMemory);

    expect(insights.length).toBe(0);
  });
});

// ============================================================================
// TOPIC ABSENCE TESTS
// ============================================================================

describe('Topic Absence Detection', () => {
  it('should detect frequently-discussed topics that went quiet', () => {
    const humanMemory = createTestHumanMemory({
      runningThemes: [
        createTestRunningTheme({
          frequency: 'every_session',
          lastMentioned: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        }),
      ],
    });

    const absences = detectTopicAbsences(humanMemory, [], 10);

    expect(absences.length).toBe(1);
    expect(absences[0].topic).toBe('learning Spanish');
  });

  it('should not flag recently mentioned topics', () => {
    const humanMemory = createTestHumanMemory({
      runningThemes: [
        createTestRunningTheme({
          lastMentioned: new Date(), // Just now
        }),
      ],
    });

    const absences = detectTopicAbsences(humanMemory, ['learning Spanish'], 10);

    expect(absences.length).toBe(0);
  });

  it('should suggest appropriate approach based on sentiment', () => {
    const humanMemory = createTestHumanMemory({
      runningThemes: [
        createTestRunningTheme({
          sentiment: 'challenging',
          lastMentioned: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        }),
      ],
    });

    const absences = detectTopicAbsences(humanMemory, [], 10);

    expect(absences[0].suggestedApproach).toBe('gentle_check_in');
  });
});

// ============================================================================
// INSIDE JOKE TESTS
// ============================================================================

describe('Inside Joke Surfacing', () => {
  it('should find beloved jokes that havent been used recently', () => {
    const humanMemory = createTestHumanMemory({
      insideJokes: [createTestInsideJoke({ status: 'beloved' })],
    });

    const insights = findSurfaceableJokes(humanMemory);

    expect(insights.length).toBe(1);
    expect(insights[0].type).toBe('inside_joke');
  });

  it('should not surface retired jokes', () => {
    const humanMemory = createTestHumanMemory({
      insideJokes: [createTestInsideJoke({ status: 'retired' })],
    });

    const insights = findSurfaceableJokes(humanMemory);

    expect(insights.length).toBe(0);
  });

  it('should not overuse jokes (cooldown)', () => {
    const humanMemory = createTestHumanMemory({
      insideJokes: [
        createTestInsideJoke({
          lastUsed: new Date(), // Used today
        }),
      ],
    });

    const insights = findSurfaceableJokes(humanMemory);

    expect(insights.length).toBe(0);
  });

  it('should prioritize context-relevant jokes', () => {
    const humanMemory = createTestHumanMemory({
      insideJokes: [
        createTestInsideJoke({
          reference: 'the spreadsheet incident',
          origin: 'Love of spreadsheets',
        }),
      ],
    });

    const insights = findSurfaceableJokes(humanMemory, 'spreadsheet');

    expect(insights.length).toBe(1);
    expect(insights[0].priority).toBe('medium');
  });
});

// ============================================================================
// VOICE PATTERN TESTS
// ============================================================================

describe('Voice Tone Memory', () => {
  beforeEach(() => {
    // Clear any existing patterns
    // Note: In production we'd have a reset function
  });

  it('should record voice patterns', () => {
    recordVoicePattern('user-1', 'session-1', {
      patterns: {
        pace: 'normal',
        energy: 'normal',
        pauseFrequency: 'normal',
      },
    });

    // Record a few more for analysis
    for (let i = 0; i < 5; i++) {
      recordVoicePattern('user-1', `session-${i + 2}`, {
        patterns: {
          pace: 'normal',
          energy: 'normal',
          pauseFrequency: 'normal',
        },
      });
    }

    const analysis = analyzeVoicePatterns('user-1');
    expect(analysis.currentState).toBe('normal');
  });

  it('should detect lower energy patterns', () => {
    // Record baseline
    for (let i = 0; i < 5; i++) {
      recordVoicePattern('user-2', `session-baseline-${i}`, {
        patterns: {
          pace: 'normal',
          energy: 'normal',
          pauseFrequency: 'normal',
        },
      });
    }

    // Record recent lower energy
    for (let i = 0; i < 3; i++) {
      recordVoicePattern('user-2', `session-recent-${i}`, {
        patterns: {
          pace: 'slower_than_usual',
          energy: 'lower_than_usual',
          pauseFrequency: 'more_pauses',
        },
      });
    }

    const analysis = analyzeVoicePatterns('user-2');
    expect(analysis.currentState).toBe('lower_energy');
    expect(analysis.suggestion).toContain('lower energy');
  });
});

// ============================================================================
// DELIVERY TRACKING TESTS
// ============================================================================

describe('Insight Delivery Tracking', () => {
  it('should track delivered insights', () => {
    markInsightDelivered('insight-1');

    expect(wasRecentlyDelivered('insight-1')).toBe(true);
    expect(wasRecentlyDelivered('insight-2')).toBe(false);
  });

  it('should respect cooldown period', () => {
    markInsightDelivered('insight-3');

    // Should be recent with short cooldown
    expect(wasRecentlyDelivered('insight-3', 1)).toBe(true);

    // Manual cleanup test
    cleanupDeliveryRecords();
  });
});

// ============================================================================
// COMPLETE CONTEXT BUILDER TESTS
// ============================================================================

describe('buildSuperhumanContext', () => {
  it('should build complete context with all insights', () => {
    const now = new Date();
    const profile = {
      id: 'test-user',
      humanMemory: createTestHumanMemory({
        importantDates: [
          createTestDate({
            month: now.getMonth() + 1,
            day: now.getDate() + 1,
          }),
        ],
        growthArc: {
          markers: [createTestGrowthMarker()],
          challenges: [],
          updatedAt: new Date(),
        },
        insideJokes: [createTestInsideJoke()],
        emotionalSignature: {
          humor: {
            appreciates: [],
            avoids: [],
            successfulMoments: [],
            overallLevel: 'enjoys_moderately',
          },
          comfortPatterns: [createTestComfortPattern()],
          tells: [],
          stressTriggers: [],
          updatedAt: new Date(),
        },
      }),
      totalConversations: 10,
      preferredTopics: ['finance', 'productivity'],
    } as any;

    const context = buildSuperhumanContext(profile, {
      sessionCount: 10,
      recentTopics: ['finance'],
    });

    expect(context.insights.length).toBeGreaterThan(0);
    expect(context.promptInjection).toBeTruthy();
  });

  it('should handle null profile gracefully', () => {
    const context = buildSuperhumanContext(null, {});

    expect(context.insights.length).toBe(0);
    expect(context.comfortGuidance.stressLevel).toBe('none');
    expect(context.topicAbsences.length).toBe(0);
  });

  it('should apply comfort guidance when stress detected', () => {
    const profile = {
      id: 'test-user',
      humanMemory: createTestHumanMemory({
        emotionalSignature: {
          humor: {
            appreciates: [],
            avoids: [],
            successfulMoments: [],
            overallLevel: 'enjoys_moderately',
          },
          comfortPatterns: [createTestComfortPattern({ type: 'validation' })],
          tells: [],
          stressTriggers: [],
          updatedAt: new Date(),
        },
      }),
    } as any;

    const context = buildSuperhumanContext(profile, {
      detectedEmotion: 'anxious',
      detectedStressLevel: 0.8,
    });

    expect(context.comfortGuidance.stressLevel).toBe('high');
    expect(context.comfortGuidance.supportType).toBe('validation');
    expect(context.promptInjection).toContain('COMFORT');
  });

  it('should include high priority insights in prompt', () => {
    const now = new Date();
    const profile = {
      id: 'test-user',
      humanMemory: createTestHumanMemory({
        importantDates: [
          createTestDate({
            type: 'birthday',
            month: now.getMonth() + 1,
            day: now.getDate(), // TODAY - high priority
          }),
        ],
      }),
    } as any;

    const context = buildSuperhumanContext(profile, {});

    expect(context.insights.some((i) => i.priority === 'high')).toBe(true);
    expect(context.promptInjection).toContain('IMPORTANT');
  });
});

// ============================================================================
// TEMPORAL CONTEXT TESTS
// ============================================================================

describe('Temporal Context', () => {
  it('should detect seasonal patterns', () => {
    const currentMonth = new Date().getMonth() + 1;
    let testTiming: 'spring' | 'summer' | 'fall' | 'winter';

    if (currentMonth >= 3 && currentMonth <= 5) testTiming = 'spring';
    else if (currentMonth >= 6 && currentMonth <= 8) testTiming = 'summer';
    else if (currentMonth >= 9 && currentMonth <= 11) testTiming = 'fall';
    else testTiming = 'winter';

    const humanMemory = createTestHumanMemory({
      temporal: {
        seasonal: [
          {
            id: 'pattern-1',
            pattern: 'Tends to feel reflective',
            timing: testTiming,
            emotionalTone: 'mixed',
            confidence: 0.8,
            yearsObserved: 2,
          },
        ],
        timeOfDay: [],
        updatedAt: new Date(),
      },
    });

    const context = getTemporalContext(humanMemory);

    expect(context.seasonalPattern).toBe('Tends to feel reflective');
  });

  it('should detect special dates', () => {
    const now = new Date();
    const humanMemory = createTestHumanMemory({
      importantDates: [
        createTestDate({
          month: now.getMonth() + 1,
          day: now.getDate(), // TODAY
        }),
      ],
    });

    const context = getTemporalContext(humanMemory);

    expect(context.isSpecialDate).toBe(true);
    expect(context.specialDateInfo).toContain('birthday');
  });
});
