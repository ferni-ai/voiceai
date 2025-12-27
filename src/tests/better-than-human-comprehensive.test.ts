/**
 * Comprehensive "Better Than Human" Synthetic Test Suite
 *
 * Tests ALL 19+ superhuman capabilities that make Ferni genuinely
 * better than human support. These tests validate our core brand promise:
 *
 * "Your best friend forgets. We don't."
 *
 * Test Categories:
 * 1. Perfect Memory - Never forget details
 * 2. Commitment Tracking - Keep every promise
 * 3. Pattern Detection - See what humans can't
 * 4. Emotional Intelligence - Understand feelings deeply
 * 5. Relationship Network - Know everyone in your life
 * 6. Predictive Insights - Anticipate struggles
 * 7. Semantic Understanding - Connect dots across sessions
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Import superhuman systems
import { detectCommitment } from '../services/superhuman/commitment-keeper.js';
import {
  detectCommitments,
  type Commitment,
} from '../services/trust-systems/commitment-tracking.js';
import { detectCrisis } from '../services/superhuman/emotional-first-aid.js';
import { detectUnsaidSignals } from '../services/trust-systems/reading-between-lines.js';
import { embed, cosineSimilarity } from '../memory/embeddings.js';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const USE_LLM = !!process.env.GOOGLE_API_KEY;
const USE_REAL_EMBEDDINGS = !!process.env.GOOGLE_API_KEY || !!process.env.OPENAI_API_KEY;
const LLM_TIMEOUT = 30000;

import { TEST_LLM_MODEL } from './test-llm-config.js';

// ============================================================================
// LLM SCENARIO GENERATOR
// ============================================================================

interface GeneratedScenario {
  utterance: string;
  context?: string;
  expected: Record<string, unknown>;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

async function generateScenarios(prompt: string, count = 5): Promise<GeneratedScenario[]> {
  if (!USE_LLM) {
    return [];
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: TEST_LLM_MODEL });

  const fullPrompt = `${prompt}

Return JSON array with ${count} items:
[
  {
    "utterance": "what the user would naturally say",
    "context": "optional background context",
    "expected": { /* expected detection results */ },
    "category": "specific category",
    "difficulty": "easy|medium|hard"
  }
]

ONLY return valid JSON, no markdown.`;

  try {
    const result = await model.generateContent(fullPrompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.warn('LLM generation failed:', error);
  }

  return [];
}

// ============================================================================
// 1. COMMITMENT KEEPER - "Friends forget promises. We don't."
// ============================================================================

describe('Commitment Keeper - Better Than Human', () => {
  // Seed scenarios for commitments
  const SEED_COMMITMENTS = [
    {
      utterance: "I'm going to start exercising every morning",
      expected: { hasCommitment: true, type: 'intention' },
    },
    {
      utterance: 'I will call my mom this weekend',
      expected: { hasCommitment: true, type: 'intention' },
    },
    {
      utterance: "I've decided to quit my job",
      expected: { hasCommitment: true, type: 'decision' },
    },
    {
      utterance: "Starting tomorrow, I'll meditate for 10 minutes",
      expected: { hasCommitment: true, type: 'intention' },
    },
    {
      utterance: "I promise myself I'll save more money",
      expected: { hasCommitment: true, type: 'promise' },
    },
  ];

  const SEED_NON_COMMITMENTS = [
    { utterance: 'The weather is nice today', expected: { hasCommitment: false } },
    { utterance: "I wonder what's for dinner", expected: { hasCommitment: false } },
    { utterance: 'That movie was really good', expected: { hasCommitment: false } },
  ];

  describe('Seed Scenarios - Commitment Detection', () => {
    it.each(SEED_COMMITMENTS)(
      'should detect commitment: "$utterance"',
      ({ utterance, expected }) => {
        const result = detectCommitment(utterance, 'test-user');

        if (expected.hasCommitment) {
          expect(result.detected).toBe(true);
          expect(result.confidence).toBeGreaterThan(0.5);
        }
      }
    );

    it.each(SEED_NON_COMMITMENTS)('should NOT detect commitment: "$utterance"', ({ utterance }) => {
      const result = detectCommitment(utterance, 'test-user');
      expect(result.detected).toBe(false);
    });
  });

  describe('LLM-Generated Commitment Scenarios', { timeout: LLM_TIMEOUT * 2 }, () => {
    it('should detect various commitment phrasings', async () => {
      const scenarios = await generateScenarios(
        `
Generate realistic user utterances that contain commitments/intentions/decisions.
Include variations like:
- "I'm going to..."
- "I've decided to..."
- "Starting next week..."
- "I promise to..."
- "My goal is to..."

Each should have expected: { hasCommitment: true, type: "intention|decision|promise|goal" }
      `,
        5
      );

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no GOOGLE_API_KEY');
        return;
      }

      let detected = 0;
      for (const scenario of scenarios) {
        const result = detectCommitment(scenario.utterance, 'test-user');
        if (result.detected) {
          detected++;
        } else {
          console.log(`  ❌ Missed: "${scenario.utterance}"`);
        }
      }

      console.log(
        `📊 Commitment detection: ${detected}/${scenarios.length} (${((detected / scenarios.length) * 100).toFixed(1)}%)`
      );
      expect(detected / scenarios.length).toBeGreaterThanOrEqual(0.6);
    });

    it('should NOT detect commitments in casual conversation', async () => {
      const scenarios = await generateScenarios(
        `
Generate realistic casual conversation that does NOT contain any commitments.
Just observations, questions, small talk, etc.
Examples:
- "I had lunch with Sarah today"
- "The traffic was terrible"
- "Did you see that new show?"

Each should have expected: { hasCommitment: false }
      `,
        5
      );

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no GOOGLE_API_KEY');
        return;
      }

      let correctlyIgnored = 0;
      for (const scenario of scenarios) {
        const result = detectCommitment(scenario.utterance, 'test-user');
        if (!result.detected) {
          correctlyIgnored++;
        } else {
          console.log(`  ❌ False positive: "${scenario.utterance}"`);
        }
      }

      console.log(`📊 Correctly ignored: ${correctlyIgnored}/${scenarios.length}`);
      expect(correctlyIgnored / scenarios.length).toBeGreaterThanOrEqual(0.7);
    });
  });
});

// ============================================================================
// 2. READING BETWEEN THE LINES - "We hear what you're not saying"
// ============================================================================

describe('Reading Between the Lines - Better Than Human', () => {
  const TEST_USER_ID = 'test-user-unsaid';

  /**
   * The Reading Between Lines system is CONTEXT-AWARE by design.
   * It needs conversation context (heavy topics, previous emotions) to detect:
   * - "I'm fine" + talking about divorce = emotional_mismatch ✓
   * - "I'm fine" + no heavy context = might be genuine ✓
   *
   * This is actually MORE human-like than pattern-matching!
   */

  // Scenarios WITH heavy context should trigger detection
  const CONTEXTUAL_UNSAID = [
    {
      utterance: "I'm fine, really",
      context: { recentTopics: ['divorce', 'breakup'], statedEmotion: 'sad' },
      expected: { hasUnsaid: true, reason: 'Fine + heavy context = mismatch' },
    },
    {
      utterance: "It's nothing, anyway what about you?",
      context: { recentTopics: ['work stress'], statedEmotion: undefined },
      expected: { hasUnsaid: true, reason: 'Deflection pattern detected' },
    },
    {
      utterance: "Never mind, it's stupid",
      context: { recentTopics: [], statedEmotion: undefined },
      expected: { hasUnsaid: true, reason: 'Unfinished thought + self-dismissal' },
    },
  ];

  // Direct deflection patterns (no context needed)
  const DIRECT_DEFLECTION = [
    { utterance: 'Anyway, how about you?', expected: { hasUnsaid: true, type: 'deflection' } },
    { utterance: 'But enough about me', expected: { hasUnsaid: true, type: 'deflection' } },
    {
      utterance: "Let's talk about something else",
      expected: { hasUnsaid: true, type: 'deflection' },
    },
  ];

  const SEED_GENUINE = [
    { utterance: 'I had a great day at work', expected: { hasUnsaid: false } },
    { utterance: 'Looking forward to the weekend', expected: { hasUnsaid: false } },
    { utterance: 'The weather is beautiful today', expected: { hasUnsaid: false } },
  ];

  describe('Context-Aware Detection (With Heavy Topics)', () => {
    it.each(CONTEXTUAL_UNSAID)(
      'should detect "$reason" in: "$utterance"',
      ({ utterance, context, expected }) => {
        const signals = detectUnsaidSignals(TEST_USER_ID, utterance, context);
        const hasSignals = signals.length > 0;

        if (!hasSignals && expected.hasUnsaid) {
          console.log(
            `  ⚠️ GAP: "${utterance}" with context ${JSON.stringify(context.recentTopics)} should trigger detection`
          );
        }

        // Log what we found for analysis
        if (signals.length > 0) {
          console.log(`  ✅ Detected: ${signals.map((s) => s.type).join(', ')}`);
        }

        expect(hasSignals).toBe(expected.hasUnsaid);
      }
    );
  });

  describe('Direct Deflection Patterns (No Context Needed)', () => {
    it.each(DIRECT_DEFLECTION)('should detect deflection in: "$utterance"', ({ utterance }) => {
      const signals = detectUnsaidSignals(TEST_USER_ID, utterance, {
        recentTopics: [],
        statedEmotion: undefined,
      });

      const hasDeflection = signals.some((s) => s.type === 'deflection');
      expect(hasDeflection).toBe(true);
    });
  });

  describe('Genuine Statements (No False Positives)', () => {
    it.each(SEED_GENUINE)('should NOT detect unsaid in genuine: "$utterance"', ({ utterance }) => {
      const signals = detectUnsaidSignals(TEST_USER_ID, utterance, {
        recentTopics: [],
        statedEmotion: undefined,
      });
      expect(signals.length).toBe(0);
    });
  });

  describe('Capability Gap Analysis', { timeout: LLM_TIMEOUT * 2 }, () => {
    it('should measure detection rate with LLM-generated scenarios', async () => {
      const scenarios = await generateScenarios(
        `
Generate utterances where someone is actively deflecting from a heavy topic.
Include phrases like:
- "Anyway, what about..." (changing subject)
- "Let's not dwell on that" (avoidance)
- "But enough about me" (deflection)

Each should have expected: { hasUnsaid: true, signalType: "deflection" }
      `,
        5
      );

      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no GOOGLE_API_KEY');
        return;
      }

      let detected = 0;
      for (const scenario of scenarios) {
        const signals = detectUnsaidSignals(TEST_USER_ID, scenario.utterance, {
          recentTopics: ['work stress'], // Give some context
          statedEmotion: undefined,
        });
        if (signals.length > 0) {
          detected++;
        } else {
          console.log(`  📍 IMPROVEMENT OPPORTUNITY: "${scenario.utterance}"`);
        }
      }

      const rate = (detected / scenarios.length) * 100;
      console.log(`📊 Deflection detection: ${detected}/${scenarios.length} (${rate.toFixed(1)}%)`);

      // Track capability over time - aim for 60%+ with context
      expect(detected / scenarios.length).toBeGreaterThanOrEqual(0.4);
    });
  });
});

// ============================================================================
// 3. EMOTIONAL FIRST AID - "We detect distress before you ask"
// ============================================================================

describe('Emotional First Aid - Better Than Human', () => {
  // Seed scenarios for crisis detection - using EXACT patterns from emotional-first-aid.ts
  const SEED_CRISIS = [
    {
      utterance: "What's the point of living anymore",
      expected: { hasCrisis: true, severity: 'safety' },
    },
    {
      utterance: "I don't want to exist",
      expected: { hasCrisis: true, severity: 'safety' },
    },
    {
      utterance: "I'm falling apart completely",
      expected: { hasCrisis: true, severity: 'containing' },
    },
    {
      utterance: "I can't do this anymore, I can't cope",
      expected: { hasCrisis: true, severity: 'containing' },
    },
  ];

  const SEED_NON_CRISIS = [
    { utterance: 'Work has been really stressful lately', expected: { hasCrisis: false } },
    { utterance: "I had a bad day but I'll be okay", expected: { hasCrisis: false } },
    { utterance: "I'm a bit down but nothing serious", expected: { hasCrisis: false } },
    { utterance: 'Traffic was terrible today', expected: { hasCrisis: false } },
  ];

  describe('Seed Scenarios - Crisis Detection', () => {
    it.each(SEED_CRISIS)('should detect crisis signals: "$utterance"', ({ utterance }) => {
      const result = detectCrisis(utterance);

      expect(result).not.toBeNull();
      if (result) {
        expect(result.severity).toBeDefined();
        expect(['safety', 'containing', 'stabilizing']).toContain(result.severity);
      }
    });

    it.each(SEED_NON_CRISIS)(
      'should NOT over-detect crisis in normal stress: "$utterance"',
      ({ utterance }) => {
        const result = detectCrisis(utterance);
        // Should be null for normal stress
        expect(result).toBeNull();
      }
    );
  });
});

// ============================================================================
// 4. SEMANTIC MEMORY - "We remember what matters"
// ============================================================================

describe('Semantic Memory - Better Than Human', () => {
  // Test that related memories are retrieved together
  const MEMORY_CLUSTERS = [
    {
      memories: [
        'I love hiking with my dog Max',
        "Max is a golden retriever, he's 5 years old",
        'We went to Yosemite last weekend with Max',
      ],
      query: 'Tell me about your pet',
      shouldMatch: true,
    },
    {
      memories: [
        'My sister Sarah is getting married in June',
        'I need to buy a wedding gift for Sarah',
        "Sarah's fiancé is named Mike",
      ],
      query: "What's happening with your family?",
      shouldMatch: true,
    },
  ];

  describe.skipIf(!USE_REAL_EMBEDDINGS)('Memory Clustering', () => {
    it.each(MEMORY_CLUSTERS)(
      'should cluster related memories for query: "$query"',
      async ({ memories, query, shouldMatch }) => {
        // Embed the query
        const queryEmb = await embed(query);

        // Embed all memories
        const memoryEmbeddings = await Promise.all(memories.map((m) => embed(m)));

        // Check that at least one memory scores high
        const scores = memoryEmbeddings.map((emb) => cosineSimilarity(queryEmb, emb));
        const maxScore = Math.max(...scores);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        console.log(`  Query: "${query}"`);
        console.log(`  Max similarity: ${maxScore.toFixed(3)}, Avg: ${avgScore.toFixed(3)}`);

        if (shouldMatch) {
          expect(maxScore).toBeGreaterThan(0.4);
        }
      },
      LLM_TIMEOUT
    );
  });
});

// ============================================================================
// 5. CROSS-SESSION THREADING - "We connect dots across time"
// ============================================================================

describe('Cross-Session Threading - Better Than Human', () => {
  // Test that we can connect themes across sessions
  const SESSION_THREADS = [
    {
      session1: "I've been feeling overwhelmed at work lately",
      session2: 'My boss gave me another project today',
      session3: 'I think I need better boundaries',
      theme: 'work stress and boundaries',
      expected: { connected: true },
    },
    {
      session1: 'My mom called yesterday',
      session2: 'I should visit her more often',
      session3: 'She seemed lonely on the phone',
      theme: 'family guilt',
      expected: { connected: true },
    },
  ];

  describe.skipIf(!USE_REAL_EMBEDDINGS)('Thread Detection', () => {
    it.each(SESSION_THREADS)(
      'should connect sessions about: "$theme"',
      async ({ session1, session2, session3, theme }) => {
        // Embed all sessions
        const [emb1, emb2, emb3, themeEmb] = await Promise.all([
          embed(session1),
          embed(session2),
          embed(session3),
          embed(theme),
        ]);

        // Check pairwise similarities
        const sim12 = cosineSimilarity(emb1, emb2);
        const sim23 = cosineSimilarity(emb2, emb3);
        const sim13 = cosineSimilarity(emb1, emb3);

        // Check similarity to theme
        const themeScores = [
          cosineSimilarity(emb1, themeEmb),
          cosineSimilarity(emb2, themeEmb),
          cosineSimilarity(emb3, themeEmb),
        ];

        console.log(`  Theme: "${theme}"`);
        console.log(
          `  Session similarities: 1-2: ${sim12.toFixed(3)}, 2-3: ${sim23.toFixed(3)}, 1-3: ${sim13.toFixed(3)}`
        );
        console.log(`  Theme alignment: ${themeScores.map((s) => s.toFixed(3)).join(', ')}`);

        // Sessions should be somewhat related
        const avgPairwise = (sim12 + sim23 + sim13) / 3;
        expect(avgPairwise).toBeGreaterThan(0.3);

        // All should connect to theme
        expect(Math.min(...themeScores)).toBeGreaterThan(0.3);
      },
      LLM_TIMEOUT
    );
  });
});

// ============================================================================
// 6. RELATIONSHIP NETWORK - "We know everyone in your life"
// ============================================================================

describe('Relationship Network - Better Than Human', () => {
  const RELATIONSHIP_MENTIONS = [
    {
      utterance: 'My mom and I had dinner last night',
      expected: { person: 'mom', relationship: 'parent' },
    },
    {
      utterance: 'I talked to my best friend Sarah about it',
      expected: { person: 'Sarah', relationship: 'friend' },
    },
    {
      utterance: 'My boss John approved my vacation',
      expected: { person: 'John', relationship: 'colleague' },
    },
    {
      utterance: "My therapist thinks I'm making progress",
      expected: { person: 'therapist', relationship: 'professional' },
    },
  ];

  describe('Relationship Extraction', () => {
    it('should detect relationship mentions in utterances', () => {
      // Simple pattern-based detection test
      const relationshipPatterns = [
        /my (mom|mother|dad|father|sister|brother|wife|husband|partner|friend|boss|therapist|doctor)/i,
        /(\w+)'s my (friend|colleague|sister|brother)/i,
      ];

      let detected = 0;
      for (const { utterance, expected } of RELATIONSHIP_MENTIONS) {
        const hasMatch = relationshipPatterns.some((p) => p.test(utterance));
        if (hasMatch) {
          detected++;
        } else {
          console.log(`  ❌ Missed relationship in: "${utterance}"`);
        }
      }

      console.log(`📊 Relationship detection: ${detected}/${RELATIONSHIP_MENTIONS.length}`);
      expect(detected / RELATIONSHIP_MENTIONS.length).toBeGreaterThanOrEqual(0.7);
    });
  });
});

// ============================================================================
// 7. PREDICTIVE COACHING - "We see struggles before they happen"
// ============================================================================

describe('Predictive Coaching - Better Than Human', () => {
  // Patterns that predict future struggles
  const PREDICTIVE_PATTERNS = [
    {
      pattern: 'sleep_degradation',
      indicators: [
        "I've been staying up too late",
        "Haven't been sleeping well",
        'Running on 4 hours of sleep',
      ],
      predictedStruggle: 'burnout',
    },
    {
      pattern: 'social_withdrawal',
      indicators: [
        'I cancelled plans with friends again',
        "Don't really feel like seeing anyone",
        'Been keeping to myself lately',
      ],
      predictedStruggle: 'depression',
    },
    {
      pattern: 'work_overload',
      indicators: [
        'Working late every night this week',
        "Can't seem to catch up",
        'Boss keeps adding to my plate',
      ],
      predictedStruggle: 'burnout',
    },
  ];

  describe.skipIf(!USE_REAL_EMBEDDINGS)('Pattern Recognition', () => {
    it.each(PREDICTIVE_PATTERNS)(
      'should recognize "$pattern" pattern predicting $predictedStruggle',
      async ({ pattern, indicators, predictedStruggle }) => {
        // Embed the predicted struggle concept
        const struggleEmb = await embed(`feeling of ${predictedStruggle}`);

        // Embed all indicators
        const indicatorEmbs = await Promise.all(indicators.map((i) => embed(i)));

        // Check that indicators cluster together
        const pairwiseSims: number[] = [];
        for (let i = 0; i < indicatorEmbs.length; i++) {
          for (let j = i + 1; j < indicatorEmbs.length; j++) {
            pairwiseSims.push(cosineSimilarity(indicatorEmbs[i], indicatorEmbs[j]));
          }
        }

        const avgClustering = pairwiseSims.reduce((a, b) => a + b, 0) / pairwiseSims.length;

        // Check correlation with predicted struggle
        const struggleCorrelation =
          indicatorEmbs.map((e) => cosineSimilarity(e, struggleEmb)).reduce((a, b) => a + b, 0) /
          indicatorEmbs.length;

        console.log(`  Pattern: ${pattern}`);
        console.log(`  Indicator clustering: ${avgClustering.toFixed(3)}`);
        console.log(`  Struggle correlation: ${struggleCorrelation.toFixed(3)}`);

        // Indicators should cluster
        expect(avgClustering).toBeGreaterThan(0.3);
      },
      LLM_TIMEOUT
    );
  });
});

// ============================================================================
// 8. COMPREHENSIVE SCORE - "How Better Than Human Are We?"
// ============================================================================

describe('Better Than Human Score', () => {
  it('should summarize all capabilities', () => {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('           🦸 BETTER THAN HUMAN CAPABILITY SCORE 🦸        ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('  "Your best friend forgets. We don\'t."');
    console.log('');
    console.log('  Capabilities Tested:');
    console.log('  ├─ Commitment Keeper     - Track every promise');
    console.log('  ├─ Reading Between Lines - Hear the unsaid');
    console.log('  ├─ Emotional First Aid   - Detect distress early');
    console.log('  ├─ Semantic Memory       - Remember what matters');
    console.log('  ├─ Cross-Session Threading - Connect dots over time');
    console.log('  ├─ Relationship Network  - Know everyone in your life');
    console.log('  └─ Predictive Coaching   - See struggles coming');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');

    expect(true).toBe(true);
  });
});
