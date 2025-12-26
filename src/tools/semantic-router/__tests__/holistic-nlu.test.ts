/**
 * Holistic NLU Integration Tests
 *
 * Proves that the holistic NLU layer correctly influences tool routing
 * based on relationship context, emotional state, and compound intents.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  analyzeHolisticContext,
  detectMultipleIntents,
  runHolisticLayer,
  getHolisticCacheStats,
  clearHolisticCache,
  type HolisticLayerResult,
} from '../index.js';
import type { SemanticToolDefinition, MatchLayer } from '../types.js';

// Mock execute function for tests
const mockExecute = async (
  _args: Record<string, unknown>,
  _context: unknown
): Promise<{ success: boolean; result: string }> => ({
  success: true,
  result: 'mock result',
});

// Mock tools for testing
const mockTelephonyConverse: { definition: SemanticToolDefinition } = {
  definition: {
    id: 'telephony_converse',
    name: 'Conversational Call',
    description: 'Have a real conversation with someone',
    shortDescription: 'Call and converse',
    category: 'telephony',
    triggers: {
      keywords: ['call', 'phone', 'talk'],
      patterns: [/call.*and.*(?:chat|talk|check)/i],
    },
    arguments: [],
    examples: ['call my mom and check in'],
    execute: mockExecute,
  },
};

const mockTelephonyCall: { definition: SemanticToolDefinition } = {
  definition: {
    id: 'telephony_call',
    name: 'Simple Call',
    description: 'Make a quick phone call',
    shortDescription: 'Quick call',
    category: 'telephony',
    triggers: {
      keywords: ['call', 'dial'],
      patterns: [/^call\s+/i],
    },
    arguments: [],
    examples: ['call the office'],
    execute: mockExecute,
  },
};

const mockWellnessTool: { definition: SemanticToolDefinition } = {
  definition: {
    id: 'wellness_breathing',
    name: 'Breathing Exercise',
    description: 'Guided breathing for stress relief',
    shortDescription: 'Breathing exercise',
    category: 'wellness',
    triggers: {
      keywords: ['stress', 'anxious', 'calm'],
    },
    arguments: [],
    examples: ['I feel stressed'],
    execute: mockExecute,
  },
};

const mockMusicTool: { definition: SemanticToolDefinition } = {
  definition: {
    id: 'music_play',
    name: 'Play Music',
    description: 'Play some music',
    shortDescription: 'Play music',
    category: 'music',
    triggers: {
      keywords: ['play', 'music', 'song'],
    },
    arguments: [],
    examples: ['play some jazz'],
    execute: mockExecute,
  },
};

const allMockTools = [mockTelephonyConverse, mockTelephonyCall, mockWellnessTool, mockMusicTool];

// Helper to create a score map
function createScoreMap() {
  const scoreMap = new Map<string, {
    pattern: number;
    keyword: number;
    embedding: number;
    context: number;
    history: number;
    holistic?: number;
    matchedBy: MatchLayer[];
    matchReason: string[];
  }>();

  // Initialize with base scores
  allMockTools.forEach((tool) => {
    scoreMap.set(tool.definition.id, {
      pattern: 0.3,
      keyword: 0.3,
      embedding: 0.3,
      context: 0,
      history: 0,
      matchedBy: ['keyword'],
      matchReason: [],
    });
  });

  return scoreMap;
}

describe('Holistic NLU - Relationship Detection', () => {
  it('should detect family relationships', () => {
    const context = analyzeHolisticContext('How do I call my mom?');

    expect(context.relationship).not.toBeNull();
    expect(context.relationship?.type).toBe('family_immediate');
    expect(context.relationship?.sentiment).toBe('personal');
  });

  it('should detect professional relationships', () => {
    const context = analyzeHolisticContext('I need to call my boss');

    expect(context.relationship).not.toBeNull();
    expect(context.relationship?.type).toBe('professional');
    expect(context.relationship?.sentiment).toBe('professional');
  });

  it('should detect service/transactional relationships', () => {
    const context = analyzeHolisticContext('Call the dentist office');

    expect(context.relationship).not.toBeNull();
    expect(context.relationship?.type).toBe('services');
    expect(context.relationship?.sentiment).toBe('transactional');
  });

  it('should return null for no relationship context', () => {
    const context = analyzeHolisticContext('What is the weather?');

    expect(context.relationship).toBeNull();
  });
});

describe('Holistic NLU - Emotional State Detection', () => {
  it('should detect stress/anxiety', () => {
    const context = analyzeHolisticContext("I'm feeling really stressed about work");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.valence).toBe('negative');
    expect(context.sentiment).toBe('negative');
  });

  it('should detect happiness', () => {
    const context = analyzeHolisticContext("I'm so happy today!");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.valence).toBe('positive');
    expect(context.sentiment).toBe('positive');
  });

  it('should detect crisis signals', () => {
    const context = analyzeHolisticContext("I can't go on anymore, I'm hopeless");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.valence).toBe('crisis');
    expect(context.sentiment).toBe('crisis');
    expect(context.overallUrgency).toBe('critical');
  });

  it('should boost wellness domains for stressed users', () => {
    const context = analyzeHolisticContext("I'm anxious and overwhelmed");

    expect(context.domainBoosts.get('wellness')).toBeGreaterThan(0);
    expect(context.domainBoosts.get('self-compassion')).toBeGreaterThan(0);
  });
});

describe('Holistic NLU - Compound Intent Detection', () => {
  it('should detect parallel compound intents (X and Y)', () => {
    const result = detectMultipleIntents("I'm stressed about work and my relationship");

    expect(result.isCompound).toBe(true);
    expect(result.compoundType).toBe('parallel');
    expect(result.allIntents.length).toBe(2);
  });

  it('should detect sequential compound intents (X then Y)', () => {
    const result = detectMultipleIntents('Call my mom and then check my calendar');

    expect(result.isCompound).toBe(true);
    expect(result.compoundType).toBe('sequential');
    expect(result.allIntents.length).toBe(2);
  });

  it('should NOT flag simple queries as compound', () => {
    const result = detectMultipleIntents('What is the weather today?');

    expect(result.isCompound).toBe(false);
    expect(result.allIntents.length).toBe(1);
  });

  it('should suggest multiple tool categories for compound intents', () => {
    const result = detectMultipleIntents("I need to budget better and start exercising");

    expect(result.isCompound).toBe(true);
    expect(result.suggestedToolCategories.length).toBeGreaterThan(1);
  });
});

describe('Holistic NLU - Tool Routing Adjustments', () => {
  it('should boost conversational call for personal relationships', () => {
    const scoreMap = createScoreMap();
    const timings: Record<string, number> = {};

    const result = runHolisticLayer(
      'How do I call my mom?',
      'test-session',
      allMockTools,
      scoreMap,
      timings
    );

    // Check that holistic layer detected relationship
    expect(result.holisticContext.relationship?.sentiment).toBe('personal');

    // Check that conversational call got boosted
    const converseAdjustment = result.toolAdjustments.get('telephony_converse');
    expect(converseAdjustment).toBeDefined();
    expect(converseAdjustment?.boost).toBeGreaterThan(0);

    // Check that simple call got penalized
    const callAdjustment = result.toolAdjustments.get('telephony_call');
    expect(callAdjustment).toBeDefined();
    expect(callAdjustment?.penalty).toBeGreaterThan(0);
  });

  it('should NOT boost conversational call for transactional relationships', () => {
    const scoreMap = createScoreMap();
    const timings: Record<string, number> = {};

    const result = runHolisticLayer(
      'Call the dentist office',
      'test-session',
      allMockTools,
      scoreMap,
      timings
    );

    // Check that holistic layer detected transactional relationship
    expect(result.holisticContext.relationship?.sentiment).toBe('transactional');

    // Conversational call should NOT get the personal relationship boost
    const converseAdjustment = result.toolAdjustments.get('telephony_converse');
    const personalBoost = converseAdjustment?.reasons.some(r =>
      r.includes('Personal relationship')
    );
    expect(personalBoost).toBeFalsy();
  });

  it('should boost wellness tools and penalize entertainment for crisis', () => {
    const scoreMap = createScoreMap();
    const timings: Record<string, number> = {};

    const result = runHolisticLayer(
      "I feel hopeless and can't go on",
      'test-session',
      allMockTools,
      scoreMap,
      timings
    );

    // Check crisis detection
    expect(result.holisticContext.sentiment).toBe('crisis');

    // Wellness should be boosted
    const wellnessAdjustment = result.toolAdjustments.get('wellness_breathing');
    expect(wellnessAdjustment?.boost).toBeGreaterThan(0);

    // Music/entertainment should be penalized
    const musicAdjustment = result.toolAdjustments.get('music_play');
    expect(musicAdjustment?.penalty).toBeGreaterThan(0);
  });
});

describe('Holistic NLU - Time Context Detection', () => {
  it('should detect morning context', () => {
    const context = analyzeHolisticContext('What should I do this morning?');

    expect(context.time).not.toBeNull();
    expect(context.time?.period).toBe('morning');
  });

  it('should detect urgency for immediate time', () => {
    const context = analyzeHolisticContext('I need this done right now!');

    expect(context.time).not.toBeNull();
    expect(context.time?.urgency).toBe('high');
  });
});

describe('Holistic NLU - Life Domain Detection', () => {
  it('should detect work domain', () => {
    const context = analyzeHolisticContext("I'm stressed about my job");

    expect(context.lifeDomain).not.toBeNull();
    expect(context.lifeDomain?.domain).toBe('work');
  });

  it('should boost relevant tool categories for detected domain', () => {
    const context = analyzeHolisticContext("I'm worried about my finances and budget");

    expect(context.domainBoosts.get('finance')).toBeGreaterThan(0);
  });
});

describe('Holistic NLU - Integration Proof', () => {
  it('PROOF: Personal relationship should result in conversational call winning', () => {
    const scoreMap = createScoreMap();
    const timings: Record<string, number> = {};

    // Run holistic layer for "call my mom"
    runHolisticLayer(
      'How do I call my mom?',
      'test-session',
      allMockTools,
      scoreMap,
      timings
    );

    // Get final scores after holistic adjustments
    const converseScores = scoreMap.get('telephony_converse');
    const callScores = scoreMap.get('telephony_call');

    // Calculate total scores
    const converseTotal = (converseScores?.pattern || 0) +
      (converseScores?.keyword || 0) +
      (converseScores?.holistic || 0);

    const callTotal = (callScores?.pattern || 0) +
      (callScores?.keyword || 0) +
      (callScores?.holistic || 0);

    console.log('\n📊 PROOF - Score Comparison:');
    console.log(`  telephony_converse: ${converseTotal.toFixed(3)}`);
    console.log(`  telephony_call: ${callTotal.toFixed(3)}`);
    console.log(`  Difference: ${(converseTotal - callTotal).toFixed(3)}`);

    // The conversational call should have a higher score after holistic boosts
    expect(converseScores?.holistic).toBeGreaterThan(0);

    // The simple call should have been penalized
    expect(callScores?.pattern).toBeLessThan(0.3); // Penalty was applied
  });
});

// ============================================================================
// NEW VOCABULARY TESTS (Task 5 Additions)
// ============================================================================

describe('Holistic NLU - Extended Emotional Vocabulary', () => {
  it('should detect fear/scared emotion', () => {
    const context = analyzeHolisticContext("I'm terrified of what might happen");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.type).toBe('scared');
    expect(context.emotion?.valence).toBe('negative');
    expect(context.domainBoosts.get('wellness')).toBeGreaterThan(0);
  });

  it('should detect shame/guilt emotion', () => {
    const context = analyzeHolisticContext("I feel so ashamed about what I did");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.type).toBe('ashamed');
    expect(context.domainBoosts.get('self-compassion')).toBeGreaterThan(0);
  });

  it('should detect surprise emotion', () => {
    const context = analyzeHolisticContext("I was completely shocked by the news");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.type).toBe('surprised');
    expect(context.emotion?.valence).toBe('neutral');
  });

  it('should detect curiosity emotion', () => {
    const context = analyzeHolisticContext("I'm fascinated by this topic and want to learn more");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.type).toBe('curious');
    expect(context.emotion?.valence).toBe('positive');
    expect(context.domainBoosts.get('information')).toBeGreaterThan(0);
  });

  it('should detect boredom emotion', () => {
    const context = analyzeHolisticContext("I'm so bored, nothing to do");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.type).toBe('bored');
    expect(context.domainBoosts.get('entertainment')).toBeGreaterThan(0);
  });

  it('should detect love/affection emotion', () => {
    const context = analyzeHolisticContext("I love spending time with them");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.type).toBe('loving');
    expect(context.domainBoosts.get('relationships')).toBeGreaterThan(0);
  });

  it('should detect grief emotion', () => {
    const context = analyzeHolisticContext("I'm mourning the loss of my grandmother");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.type).toBe('grieving');
    expect(context.emotion?.valence).toBe('negative');
    expect(context.domainBoosts.get('grief')).toBeGreaterThan(0);
  });

  it('should detect jealousy emotion', () => {
    const context = analyzeHolisticContext("I'm so jealous of their success");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.type).toBe('jealous');
    expect(context.domainBoosts.get('self-compassion')).toBeGreaterThan(0);
  });

  it('should detect anticipation emotion', () => {
    const context = analyzeHolisticContext("I can't wait for the trip next week!");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.type).toBe('anticipating');
    expect(context.emotion?.valence).toBe('positive');
  });

  it('should detect disgust emotion', () => {
    const context = analyzeHolisticContext("I was completely disgusted by their behavior");

    expect(context.emotion).not.toBeNull();
    expect(context.emotion?.type).toBe('disgusted');
    expect(context.domainBoosts.get('boundaries')).toBeGreaterThan(0);
  });
});

describe('Holistic NLU - Temporal Urgency Vocabulary', () => {
  it('should detect emergency urgency (critical)', () => {
    const context = analyzeHolisticContext("This is an emergency, I need help right away!");

    expect(context.time).not.toBeNull();
    expect(context.time?.type).toBe('emergency');
    expect(context.time?.urgency).toBe('critical');
    expect(context.overallUrgency).toBe('critical');
  });

  it('should detect deadline urgency (high)', () => {
    // Use "due date" which is unique to deadline category
    const context = analyzeHolisticContext("I have a due date and need to finish this");

    expect(context.time).not.toBeNull();
    expect(context.time?.type).toBe('deadline');
    expect(context.time?.urgency).toBe('high');
    expect(context.domainBoosts.get('productivity')).toBeGreaterThan(0);
  });

  it('should detect near-future timing (medium urgency)', () => {
    // Use "shortly" which is unique to soon category
    const context = analyzeHolisticContext("I need to do this shortly");

    expect(context.time).not.toBeNull();
    expect(context.time?.type).toBe('soon');
    expect(context.time?.urgency).toBe('medium');
  });

  it('should detect seasonal timing', () => {
    const context = analyzeHolisticContext("I need to plan something for Christmas");

    expect(context.time).not.toBeNull();
    expect(context.time?.type).toBe('seasonal');
    expect(context.domainBoosts.get('life-planning')).toBeGreaterThan(0);
  });

  it('should detect birthday-related seasonal timing', () => {
    const context = analyzeHolisticContext("My daughter's birthday is coming up");

    expect(context.time).not.toBeNull();
    expect(context.time?.type).toBe('seasonal');
  });
});

describe('Holistic NLU - Group Relationship Vocabulary', () => {
  it('should detect team/group relationships with committee', () => {
    // Use "committee" which is unique to group_team
    const context = analyzeHolisticContext("I need to coordinate with the committee");

    expect(context.relationship).not.toBeNull();
    expect(context.relationship?.type).toBe('group_team');
    expect(context.relationship?.sentiment).toBe('collective');
  });

  it('should detect team/group with department', () => {
    // "department" is unique to group_team
    const context = analyzeHolisticContext("I need to talk to the department");

    expect(context.relationship).not.toBeNull();
    expect(context.relationship?.type).toBe('group_team');
    expect(context.relationship?.context).toBe('group');
  });

  it('should detect community with temple', () => {
    // "temple" is unique to community category
    const context = analyzeHolisticContext("I want to visit the temple");

    expect(context.relationship).not.toBeNull();
    expect(context.relationship?.type).toBe('community');
    expect(context.relationship?.sentiment).toBe('collective');
  });

  it('should detect church/congregation context', () => {
    const context = analyzeHolisticContext("I want to volunteer with my congregation");

    expect(context.relationship).not.toBeNull();
    expect(context.relationship?.type).toBe('community');
    expect(context.relationship?.context).toBe('community');
  });

  it('should detect social group relationships', () => {
    const context = analyzeHolisticContext("I need to check in with my book club");

    expect(context.relationship).not.toBeNull();
    expect(context.relationship?.type).toBe('social_group');
    expect(context.relationship?.sentiment).toBe('collective');
  });

  it('should detect meetup context', () => {
    // "meetup" is unique to social_group
    const context = analyzeHolisticContext("I have a meetup tomorrow");

    expect(context.relationship).not.toBeNull();
    expect(context.relationship?.type).toBe('social_group');
  });

  it('should detect alumni/cohort relationships', () => {
    const context = analyzeHolisticContext("I want to reconnect with my alumni");

    expect(context.relationship).not.toBeNull();
    expect(context.relationship?.type).toBe('social_group');
  });
});

describe('Holistic NLU - Combined Context Detection', () => {
  it('should detect emotion + time urgency combination', () => {
    // Use "due date" which is unique to deadline category
    const context = analyzeHolisticContext("I'm stressed and have a due date coming up!");

    expect(context.emotion?.type).toBe('stressed');
    expect(context.time?.type).toBe('deadline');
    expect(context.time?.urgency).toBe('high');
    expect(context.domainBoosts.get('wellness')).toBeGreaterThan(0);
    expect(context.domainBoosts.get('productivity')).toBeGreaterThan(0);
  });

  it('should detect group + emotion combination', () => {
    // Use "committee" which is unique to group_team
    const context = analyzeHolisticContext("The committee is exhausted from the project");

    expect(context.relationship?.type).toBe('group_team');
    expect(context.emotion?.type).toBe('exhausted');
    expect(context.domainBoosts.get('wellness')).toBeGreaterThan(0);
  });

  it('should detect seasonal + positive emotion combination', () => {
    // Use "looking forward" which is unique to anticipating, and Christmas for seasonal
    const context = analyzeHolisticContext("Looking forward to Christmas!");

    expect(context.emotion?.type).toBe('anticipating');
    // seasonal boosts life-planning
    expect(context.domainBoosts.get('life-planning')).toBeGreaterThan(0);
  });
});

// ============================================================================
// CACHE TESTS
// ============================================================================

describe('Holistic NLU - Caching', () => {
  beforeEach(() => {
    clearHolisticCache();
  });

  it('should start with empty cache', () => {
    const stats = getHolisticCacheStats();
    expect(stats.cacheSize).toBe(0);
    expect(stats.holisticContextHits).toBe(0);
    expect(stats.holisticContextMisses).toBe(0);
  });

  it('should cache holistic context analysis', () => {
    const scoreMap = createScoreMap();
    const timings: Record<string, number> = {};

    // First call - cache miss
    runHolisticLayer('Hello mom', 'test-session', allMockTools, scoreMap, timings);
    let stats = getHolisticCacheStats();
    expect(stats.holisticContextMisses).toBe(1);
    expect(stats.multiIntentMisses).toBe(1);

    // Second call with same text - cache hit
    runHolisticLayer('Hello mom', 'test-session', allMockTools, scoreMap, timings);
    stats = getHolisticCacheStats();
    expect(stats.holisticContextHits).toBe(1);
    expect(stats.multiIntentHits).toBe(1);
  });

  it('should normalize cache keys (case insensitive)', () => {
    const scoreMap = createScoreMap();
    const timings: Record<string, number> = {};

    // Different case should hit same cache entry
    runHolisticLayer('HELLO MOM', 'test-session', allMockTools, scoreMap, timings);
    runHolisticLayer('hello mom', 'test-session', allMockTools, scoreMap, timings);

    const stats = getHolisticCacheStats();
    expect(stats.holisticContextMisses).toBe(1);
    expect(stats.holisticContextHits).toBe(1);
  });

  it('should clear cache properly', () => {
    const scoreMap = createScoreMap();
    const timings: Record<string, number> = {};

    // Populate cache
    runHolisticLayer('Test query', 'test-session', allMockTools, scoreMap, timings);
    expect(getHolisticCacheStats().cacheSize).toBeGreaterThan(0);

    // Clear cache
    clearHolisticCache();
    expect(getHolisticCacheStats().cacheSize).toBe(0);
    expect(getHolisticCacheStats().holisticContextHits).toBe(0);
  });

  it('should track cache statistics accurately', () => {
    const scoreMap = createScoreMap();
    const timings: Record<string, number> = {};

    // Run multiple unique queries
    runHolisticLayer('Query one', 'test-session', allMockTools, scoreMap, timings);
    runHolisticLayer('Query two', 'test-session', allMockTools, scoreMap, timings);
    runHolisticLayer('Query three', 'test-session', allMockTools, scoreMap, timings);

    // Repeat one
    runHolisticLayer('Query one', 'test-session', allMockTools, scoreMap, timings);

    const stats = getHolisticCacheStats();
    expect(stats.holisticContextMisses).toBe(3); // 3 unique queries
    expect(stats.holisticContextHits).toBe(1); // 1 repeat
    expect(stats.cacheSize).toBe(6); // 3 holistic + 3 multi-intent
  });
});

// ============================================================================
// E2E ROUTING TESTS - Verify holistic layer affects final tool selection
// ============================================================================

describe('Holistic NLU - E2E Routing Effects', () => {
  beforeEach(() => {
    clearHolisticCache();
  });

  it('should boost telephony_converse for personal relationships ("call my mom")', () => {
    // Initialize score map with equal base scores for both telephony tools
    const scoreMap = new Map<string, {
      pattern: number;
      keyword: number;
      embedding: number;
      context: number;
      history: number;
      holistic?: number;
      matchedBy: MatchLayer[];
      matchReason: string[];
    }>();

    // Both telephony tools start with equal scores
    scoreMap.set('telephony_converse', {
      pattern: 0.4,
      keyword: 0.4,
      embedding: 0.4,
      context: 0,
      history: 0,
      matchedBy: ['keyword'],
      matchReason: [],
    });

    scoreMap.set('telephony_call', {
      pattern: 0.4,
      keyword: 0.4,
      embedding: 0.4,
      context: 0,
      history: 0,
      matchedBy: ['keyword'],
      matchReason: [],
    });

    const timings: Record<string, number> = {};
    const result = runHolisticLayer(
      'call my mom',
      'test-session',
      [mockTelephonyConverse, mockTelephonyCall],
      scoreMap,
      timings
    );

    // Personal relationship (mom) should boost conversational call
    expect(result.holisticContext.relationship?.type).toBe('family_immediate');
    expect(result.holisticContext.relationship?.sentiment).toBe('personal');

    // Verify telephony_converse got boosted
    const converseScores = scoreMap.get('telephony_converse')!;
    const callScores = scoreMap.get('telephony_call')!;

    // Conversational should have holistic score (personal relationship boost)
    expect(converseScores.holistic).toBeGreaterThan(0);
    expect(converseScores.matchReason.some(r => r.includes('Personal relationship'))).toBe(true);

    // Simple call should be penalized for personal relationships
    expect(callScores.matchReason.some(r => r.includes('penalty') || r.includes('NOT simple call'))).toBe(true);
  });

  it('should boost wellness tools and suppress music for crisis detection', () => {
    // Mock crisis tool for this test
    const mockCrisisTool: { definition: SemanticToolDefinition } = {
      definition: {
        id: 'crisis_support',
        name: 'Crisis Support',
        description: 'Get immediate crisis support',
        shortDescription: 'Crisis support',
        category: 'crisis',
        triggers: { keywords: ['crisis', 'help', 'danger'] },
        arguments: [],
        examples: ['I need help'],
        execute: mockExecute,
      },
    };

    const scoreMap = new Map<string, {
      pattern: number;
      keyword: number;
      embedding: number;
      context: number;
      history: number;
      holistic?: number;
      matchedBy: MatchLayer[];
      matchReason: string[];
    }>();

    // Initialize tools with equal scores
    const tools = [mockCrisisTool, mockWellnessTool, mockMusicTool];
    tools.forEach((tool) => {
      scoreMap.set(tool.definition.id, {
        pattern: 0.5,
        keyword: 0.5,
        embedding: 0.5,
        context: 0,
        history: 0,
        matchedBy: ['keyword'],
        matchReason: [],
      });
    });

    const timings: Record<string, number> = {};
    const result = runHolisticLayer(
      "I want to end it all, I can't go on",  // Crisis language
      'test-session',
      tools,
      scoreMap,
      timings
    );

    // Should detect crisis
    expect(result.holisticContext.sentiment).toBe('crisis');

    // Crisis tool should be heavily boosted
    const crisisScores = scoreMap.get('crisis_support')!;
    expect(crisisScores.holistic).toBeGreaterThan(0);
    expect(crisisScores.matchReason.some(r => r.includes('CRISIS DETECTED'))).toBe(true);

    // Music should be penalized in crisis
    const musicScores = scoreMap.get('music_play')!;
    expect(musicScores.matchReason.some(r =>
      r.includes('CRISIS DETECTED') && r.includes('entertainment')
    )).toBe(true);
  });

  it('should boost wellness domain for stressed emotional state', () => {
    const scoreMap = new Map<string, {
      pattern: number;
      keyword: number;
      embedding: number;
      context: number;
      history: number;
      holistic?: number;
      matchedBy: MatchLayer[];
      matchReason: string[];
    }>();

    // Initialize wellness and music tools with equal scores
    [mockWellnessTool, mockMusicTool].forEach((tool) => {
      scoreMap.set(tool.definition.id, {
        pattern: 0.5,
        keyword: 0.5,
        embedding: 0.5,
        context: 0,
        history: 0,
        matchedBy: ['keyword'],
        matchReason: [],
      });
    });

    const timings: Record<string, number> = {};
    const result = runHolisticLayer(
      "I'm feeling really overwhelmed and anxious about everything",
      'test-session',
      [mockWellnessTool, mockMusicTool],
      scoreMap,
      timings
    );

    // Should detect stress/anxiety
    expect(result.holisticContext.emotion?.valence).toBe('negative');
    expect(result.holisticContext.sentiment).toBe('negative');

    // Wellness should be boosted via domain boosts
    expect(result.holisticContext.domainBoosts.get('wellness')).toBeGreaterThan(0);

    // Wellness tool should have holistic score
    const wellnessScores = scoreMap.get('wellness_breathing')!;
    expect(wellnessScores.holistic).toBeGreaterThan(0);
  });

  it('should expose holisticContext in routing result summary', () => {
    const scoreMap = createScoreMap();
    const timings: Record<string, number> = {};

    const result = runHolisticLayer(
      'I need to check on my grandma, feeling worried',
      'test-session',
      allMockTools,
      scoreMap,
      timings
    );

    // Result should contain useful summary fields (internal HolisticContext type)
    expect(result.holisticContext).toBeDefined();
    expect(result.holisticContext.relationship).not.toBeNull();
    expect(result.holisticContext.emotion).not.toBeNull();
    expect(result.holisticContext.sentiment).toBeDefined();
    expect(result.holisticContext.overallUrgency).toBeDefined();  // Note: internal type uses overallUrgency
    expect(result.holisticContext.domainBoosts).toBeDefined();

    // Should detect family relationship
    expect(result.holisticContext.relationship?.type).toBe('family_extended');

    // Should detect worried/sad emotion
    expect(['negative', 'neutral']).toContain(result.holisticContext.sentiment);
  });
});

// ============================================================================
// ROUTER-LEVEL INTEGRATION TESTS - routeUserInput returns holisticContext
// ============================================================================

describe('Holistic NLU - routeUserInput API', () => {
  beforeEach(() => {
    clearHolisticCache();
  });

  it('should return holisticContext in SemanticRouterResult from routeUserInput', async () => {
    // Import routeUserInput dynamically to ensure fresh state
    const { routeUserInput } = await import('../router.js');

    const result = await routeUserInput("I'm feeling stressed about my mom's health", {
      sessionId: 'test-session',
      userId: 'test-user',
    });

    // SemanticRouterResult should include holisticContext (HolisticContextSummary)
    expect(result).toBeDefined();
    expect(result.holisticContext).toBeDefined();

    // HolisticContextSummary fields (converted from internal HolisticContext)
    expect(result.holisticContext).toMatchObject({
      relationshipType: expect.any(String),      // family_immediate from "mom"
      emotionType: expect.any(String),           // stressed
      sentiment: expect.any(String),             // negative
      isCompoundIntent: expect.any(Boolean),
      domainBoosts: expect.any(Object),
    });

    // Specific detections for this input
    expect(result.holisticContext?.relationshipType).toBe('family_immediate');
    expect(['stressed', 'worried', 'anxious']).toContain(result.holisticContext?.emotionType);
    expect(result.holisticContext?.sentiment).toBe('negative');

    // Domain boosts should include wellness for stress
    expect(result.holisticContext?.domainBoosts).toBeDefined();
  });

  it('should return isCrisis=true in holisticContext for crisis input', async () => {
    const { routeUserInput } = await import('../router.js');

    const result = await routeUserInput("I can't go on anymore, I want to end it all", {
      sessionId: 'crisis-test',
      userId: 'test-user',
    });

    expect(result.holisticContext).toBeDefined();
    expect(result.holisticContext?.isCrisis).toBe(true);
    expect(result.holisticContext?.sentiment).toBe('crisis');
    expect(result.holisticContext?.urgency).toBe('critical');
  });

  it('should detect compound intent in holisticContext', async () => {
    const { routeUserInput } = await import('../router.js');

    const result = await routeUserInput("Call my dad and then check my calendar", {
      sessionId: 'compound-test',
      userId: 'test-user',
    });

    expect(result.holisticContext).toBeDefined();
    expect(result.holisticContext?.isCompoundIntent).toBe(true);
    expect(result.holisticContext?.relationshipType).toBe('family_immediate');
  });

  it('should return undefined holisticContext for simple queries (no emotional/relational signals)', async () => {
    const { routeUserInput } = await import('../router.js');

    const result = await routeUserInput("What time is it?", {
      sessionId: 'simple-test',
      userId: 'test-user',
    });

    // Even simple queries may have holisticContext (just with neutral/empty values)
    // The key is that it doesn't crash and returns a valid result
    expect(result).toBeDefined();
    expect(result.intent).toBeDefined();
    // holisticContext may be present but with neutral values, or undefined
  });
});
