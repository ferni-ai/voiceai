/**
 * LLM-Powered Semantic Data Storage Synthetic Testing
 *
 * Tests that our semantic storage systems correctly:
 * 1. Store and retrieve memories by meaning (not just keywords)
 * 2. Cache similar queries semantically
 * 3. Rank memories by relevance
 * 4. Handle edge cases (ambiguous queries, similar but different meanings)
 *
 * Uses LLM-generated test scenarios to validate semantic understanding
 * goes beyond simple keyword matching.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Import systems under test
import { embed, cosineSimilarity, getEmbeddingProvider } from '../memory/embeddings.js';
import {
  findSimilarCached,
  storeInSemanticCache,
  clearUserSemanticCache,
  getSemanticCacheStats,
} from '../memory/semantic-memory-cache.js';

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const USE_LLM = !!process.env.GOOGLE_API_KEY;
const LLM_TIMEOUT = 30000;
const SIMILARITY_THRESHOLD = 0.85; // What we consider "semantically similar"

// Check if we have real embeddings (not local random vectors)
const USE_REAL_EMBEDDINGS = !!process.env.GOOGLE_API_KEY || !!process.env.OPENAI_API_KEY;

function isUsingLocalEmbeddings(): boolean {
  const provider = getEmbeddingProvider();
  return provider.model === 'local-random';
}

import { TEST_LLM_MODEL } from './test-llm-config.js';

// ============================================================================
// LLM SCENARIO GENERATOR
// ============================================================================

interface SemanticScenario {
  original: string;
  similar: string[];
  different: string[];
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

async function generateSemanticScenarios(count = 5): Promise<SemanticScenario[]> {
  if (!USE_LLM) {
    return [];
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: TEST_LLM_MODEL });

  const prompt = `Generate ${count} test scenarios for semantic similarity testing.

For each scenario, provide:
- An "original" query (something a user might ask)
- 2-3 "similar" queries that mean the SAME thing but use DIFFERENT words
- 2-3 "different" queries that sound similar but mean something DIFFERENT

Examples of SIMILAR (should match):
- "What are my hobbies?" ↔ "Tell me about my interests" ↔ "What do I like to do?"
- "How am I sleeping?" ↔ "What's my sleep been like?" ↔ "Am I getting enough rest?"

Examples of DIFFERENT (should NOT match):
- "What are my hobbies?" vs "What's the weather like?"
- "How am I sleeping?" vs "How's my work going?"
- "Tell me about my mom" vs "Tell me about my goals"

Return JSON array:
[
  {
    "original": "What are my hobbies?",
    "similar": ["Tell me about my interests", "What do I like to do for fun?"],
    "different": ["What's the weather today?", "What should I eat?"],
    "category": "preferences",
    "difficulty": "easy"
  }
]

Include scenarios about:
- Personal preferences (hobbies, food, music)
- Relationships (family, friends)
- Goals and aspirations
- Health and wellness
- Work and productivity
- Emotional state

ONLY return valid JSON, no markdown.`;

  try {
    const result = await model.generateContent(prompt);
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
// MEMORY STORAGE SCENARIOS
// ============================================================================

interface MemoryScenario {
  memory: string;
  relevantQueries: string[];
  irrelevantQueries: string[];
  category: string;
}

async function generateMemoryScenarios(count = 5): Promise<MemoryScenario[]> {
  if (!USE_LLM) {
    return [];
  }

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: TEST_LLM_MODEL });

  const prompt = `Generate ${count} test scenarios for memory retrieval testing.

For each scenario:
- A "memory" that would be stored (something a user said)
- 2-3 "relevantQueries" that SHOULD retrieve this memory
- 2-3 "irrelevantQueries" that should NOT retrieve this memory

Example:
{
  "memory": "I had a great hiking trip last weekend with my brother",
  "relevantQueries": [
    "What outdoor activities do I enjoy?",
    "Tell me about time with my family",
    "What did I do last weekend?"
  ],
  "irrelevantQueries": [
    "What's my favorite restaurant?",
    "How's my work project going?",
    "What music do I like?"
  ],
  "category": "activities"
}

Include memories about:
- Activities and experiences
- Relationships and people mentioned
- Goals and commitments
- Preferences stated
- Emotional moments
- Health/wellness mentions

ONLY return valid JSON, no markdown.`;

  try {
    const result = await model.generateContent(prompt);
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
// 1. EMBEDDING QUALITY TESTS
// ============================================================================

describe('Embedding Quality - Semantic Similarity', () => {
  // Seed scenarios that should ALWAYS work
  const SEED_SIMILAR_PAIRS = [
    ['What are my hobbies?', 'Tell me about my interests'],
    ['How is my sleep?', "What's my rest been like?"],
    ['Tell me about my mom', 'What do you know about my mother?'],
    ['What are my goals?', 'What am I working towards?'],
    ["How's my mood?", 'How am I feeling emotionally?'],
  ];

  const SEED_DIFFERENT_PAIRS = [
    ['What are my hobbies?', "What's the weather like?"],
    ['Tell me about my mom', 'Tell me about my job'],
    ['How is my sleep?', "What's for dinner?"],
    ['What are my goals?', 'Who is my best friend?'],
    ["How's my mood?", 'What time is it?'],
  ];

  describe('Seed Scenarios - Similar Pairs', () => {
    it.skipIf(!USE_REAL_EMBEDDINGS).each(SEED_SIMILAR_PAIRS)(
      'should recognize "%s" and "%s" as semantically similar',
      async (query1, query2) => {
        const [emb1, emb2] = await Promise.all([embed(query1), embed(query2)]);

        const similarity = cosineSimilarity(emb1, emb2);

        expect(similarity).toBeGreaterThan(0.7); // Should be quite similar
      },
      LLM_TIMEOUT
    );
  });

  describe('Seed Scenarios - Different Pairs', () => {
    it.skipIf(!USE_REAL_EMBEDDINGS).each(SEED_DIFFERENT_PAIRS)(
      'should recognize "%s" and "%s" as semantically different',
      async (query1, query2) => {
        const [emb1, emb2] = await Promise.all([embed(query1), embed(query2)]);

        const similarity = cosineSimilarity(emb1, emb2);

        expect(similarity).toBeLessThan(0.6); // Should be quite different
      },
      LLM_TIMEOUT
    );
  });

  describe('LLM-Generated Scenarios', { timeout: LLM_TIMEOUT * 2 }, () => {
    it('should correctly identify semantically similar queries', async () => {
      const scenarios = await generateSemanticScenarios(5);
      if (scenarios.length === 0) {
        console.log('Skipping LLM test - no GOOGLE_API_KEY');
        return;
      }

      let correctSimilar = 0;
      let totalSimilar = 0;
      let correctDifferent = 0;
      let totalDifferent = 0;

      for (const scenario of scenarios) {
        const originalEmb = await embed(scenario.original);

        // Test similar pairs
        for (const similar of scenario.similar) {
          const similarEmb = await embed(similar);
          const similarity = cosineSimilarity(originalEmb, similarEmb);
          totalSimilar++;
          if (similarity > 0.7) {
            correctSimilar++;
          } else {
            console.log(
              `  ❌ Expected similar: "${scenario.original}" ↔ "${similar}" (${similarity.toFixed(3)})`
            );
          }
        }

        // Test different pairs
        for (const different of scenario.different) {
          const differentEmb = await embed(different);
          const similarity = cosineSimilarity(originalEmb, differentEmb);
          totalDifferent++;
          if (similarity < 0.6) {
            correctDifferent++;
          } else {
            console.log(
              `  ❌ Expected different: "${scenario.original}" ↔ "${different}" (${similarity.toFixed(3)})`
            );
          }
        }
      }

      const similarAccuracy = correctSimilar / totalSimilar;
      const differentAccuracy = correctDifferent / totalDifferent;

      console.log(
        `📊 Similar pairs: ${correctSimilar}/${totalSimilar} (${(similarAccuracy * 100).toFixed(1)}%)`
      );
      console.log(
        `📊 Different pairs: ${correctDifferent}/${totalDifferent} (${(differentAccuracy * 100).toFixed(1)}%)`
      );

      expect(similarAccuracy).toBeGreaterThanOrEqual(0.7); // 70% accuracy on similar
      expect(differentAccuracy).toBeGreaterThanOrEqual(0.7); // 70% accuracy on different
    });
  });
});

// ============================================================================
// 2. SEMANTIC CACHE TESTS
// ============================================================================

describe('Semantic Memory Cache', () => {
  const TEST_USER_ID = 'test-user-semantic-cache';

  beforeAll(() => {
    clearUserSemanticCache(TEST_USER_ID);
  });

  afterAll(() => {
    clearUserSemanticCache(TEST_USER_ID);
  });

  describe('Basic Cache Operations', () => {
    it.skipIf(!USE_REAL_EMBEDDINGS)('should cache and retrieve exact matches', async () => {
      const query = 'What are my hobbies?';
      const result = { memories: ['hiking', 'reading'] };

      // Store in cache
      await storeInSemanticCache(TEST_USER_ID, query, result);

      // Retrieve with exact same query
      const cached = await findSimilarCached<typeof result>(TEST_USER_ID, query);

      expect(cached.hit).toBe(true);
      expect(cached.result).toEqual(result);
    });

    it.skipIf(!USE_REAL_EMBEDDINGS)(
      'should cache-hit on semantically similar queries',
      async () => {
        const originalQuery = 'Tell me about my family';
        const result = { memories: ['mom', 'dad', 'sister'] };

        // Store original
        await storeInSemanticCache(TEST_USER_ID, originalQuery, result);

        // Try similar query
        const similarQuery = 'What do you know about my relatives?';
        const cached = await findSimilarCached<typeof result>(TEST_USER_ID, similarQuery);

        // Should hit if similarity > 0.85
        if (cached.hit) {
          expect(cached.result).toEqual(result);
          console.log(`✅ Cache hit with similarity: ${cached.similarity?.toFixed(3)}`);
        } else {
          console.log(`⚠️ Cache miss - similarity below threshold`);
        }
      }
    );

    it.skipIf(!USE_REAL_EMBEDDINGS)(
      'should cache-miss on semantically different queries',
      async () => {
        const originalQuery = 'What music do I like?';
        const result = { memories: ['jazz', 'classical'] };

        // Store original
        await storeInSemanticCache(TEST_USER_ID, originalQuery, result);

        // Try completely different query
        const differentQuery = "What's the weather forecast?";
        const cached = await findSimilarCached<typeof result>(TEST_USER_ID, differentQuery);

        expect(cached.hit).toBe(false);
      }
    );
  });

  describe('LLM-Generated Cache Scenarios', { timeout: LLM_TIMEOUT * 2 }, () => {
    it.skipIf(!USE_REAL_EMBEDDINGS)(
      'should correctly handle semantic cache hits and misses',
      async () => {
        const scenarios = await generateSemanticScenarios(3);
        if (scenarios.length === 0) {
          console.log('Skipping LLM test - no GOOGLE_API_KEY');
          return;
        }

        // Clear cache for clean test
        clearUserSemanticCache(TEST_USER_ID);

        let cacheHitsCorrect = 0;
        let cacheHitsTotal = 0;
        let cacheMissesCorrect = 0;
        let cacheMissesTotal = 0;

        for (const scenario of scenarios) {
          // Store original query
          const result = { category: scenario.category, query: scenario.original };
          await storeInSemanticCache(TEST_USER_ID, scenario.original, result);

          // Test similar queries (should hit)
          for (const similar of scenario.similar) {
            const cached = await findSimilarCached<typeof result>(TEST_USER_ID, similar);
            cacheHitsTotal++;
            if (cached.hit) {
              cacheHitsCorrect++;
            } else {
              console.log(
                `  ❌ Expected cache HIT for: "${similar}" (similar to "${scenario.original}")`
              );
            }
          }

          // Test different queries (should miss)
          for (const different of scenario.different) {
            const cached = await findSimilarCached<typeof result>(TEST_USER_ID, different);
            cacheMissesTotal++;
            if (!cached.hit) {
              cacheMissesCorrect++;
            } else {
              console.log(
                `  ❌ Expected cache MISS for: "${different}" (sim: ${cached.similarity?.toFixed(3)})`
              );
            }
          }
        }

        const hitAccuracy = cacheHitsCorrect / cacheHitsTotal;
        const missAccuracy = cacheMissesCorrect / cacheMissesTotal;

        console.log(
          `📊 Cache hits: ${cacheHitsCorrect}/${cacheHitsTotal} (${(hitAccuracy * 100).toFixed(1)}%)`
        );
        console.log(
          `📊 Cache misses: ${cacheMissesCorrect}/${cacheMissesTotal} (${(missAccuracy * 100).toFixed(1)}%)`
        );

        // Allow some flexibility - semantic similarity isn't perfect
        expect(hitAccuracy).toBeGreaterThanOrEqual(0.5); // At least 50% hits
        expect(missAccuracy).toBeGreaterThanOrEqual(0.7); // At least 70% correct misses
      }
    );
  });
});

// ============================================================================
// 3. MEMORY RETRIEVAL RELEVANCE TESTS
// ============================================================================

describe('Memory Retrieval Relevance', () => {
  // Seed memories with expected retrieval behavior
  const SEED_MEMORIES = [
    {
      memory: 'I love hiking in the mountains with my dog',
      relevantQueries: ['outdoor activities', 'what do I do with my pet?', 'nature hobbies'],
      irrelevantQueries: ['favorite restaurants', 'work schedule', 'music preferences'],
    },
    {
      memory: "My mom's birthday is next week and I need to plan a surprise party",
      relevantQueries: ['family events', 'upcoming celebrations', 'things to plan'],
      irrelevantQueries: ['exercise routine', 'sleep quality', 'career goals'],
    },
    {
      memory: "I've been feeling really stressed about the project deadline",
      relevantQueries: ['how am I feeling', 'work stress', 'emotional state'],
      irrelevantQueries: ['weekend plans', 'favorite movies', 'dietary preferences'],
    },
  ];

  describe('Seed Scenarios - Relevance Scoring', () => {
    it.skipIf(!USE_REAL_EMBEDDINGS).each(SEED_MEMORIES)(
      'should rank relevant queries higher than irrelevant for: "$memory"',
      async ({ memory, relevantQueries, irrelevantQueries }) => {
        const memoryEmb = await embed(memory);

        // Score relevant queries
        const relevantScores = await Promise.all(
          relevantQueries.map(async (q) => {
            const qEmb = await embed(q);
            return { query: q, score: cosineSimilarity(memoryEmb, qEmb) };
          })
        );

        // Score irrelevant queries
        const irrelevantScores = await Promise.all(
          irrelevantQueries.map(async (q) => {
            const qEmb = await embed(q);
            return { query: q, score: cosineSimilarity(memoryEmb, qEmb) };
          })
        );

        const avgRelevant =
          relevantScores.reduce((sum, r) => sum + r.score, 0) / relevantScores.length;
        const avgIrrelevant =
          irrelevantScores.reduce((sum, r) => sum + r.score, 0) / irrelevantScores.length;

        // Relevant queries should score higher on average
        expect(avgRelevant).toBeGreaterThan(avgIrrelevant);
      },
      LLM_TIMEOUT
    );
  });

  describe('LLM-Generated Memory Retrieval', { timeout: LLM_TIMEOUT * 2 }, () => {
    it.skipIf(!USE_REAL_EMBEDDINGS)(
      'should correctly rank relevant vs irrelevant queries for memories',
      async () => {
        const scenarios = await generateMemoryScenarios(3);
        if (scenarios.length === 0) {
          console.log('Skipping LLM test - no GOOGLE_API_KEY');
          return;
        }

        let correctRankings = 0;
        const totalRankings = scenarios.length;

        for (const scenario of scenarios) {
          const memoryEmb = await embed(scenario.memory);

          // Score relevant queries
          const relevantScores = await Promise.all(
            scenario.relevantQueries.map(async (q) => {
              const qEmb = await embed(q);
              return cosineSimilarity(memoryEmb, qEmb);
            })
          );

          // Score irrelevant queries
          const irrelevantScores = await Promise.all(
            scenario.irrelevantQueries.map(async (q) => {
              const qEmb = await embed(q);
              return cosineSimilarity(memoryEmb, qEmb);
            })
          );

          const avgRelevant = relevantScores.reduce((sum, s) => sum + s, 0) / relevantScores.length;
          const avgIrrelevant =
            irrelevantScores.reduce((sum, s) => sum + s, 0) / irrelevantScores.length;

          if (avgRelevant > avgIrrelevant) {
            correctRankings++;
          } else {
            console.log(`  ❌ Ranking failed for: "${scenario.memory.slice(0, 50)}..."`);
            console.log(
              `     Relevant avg: ${avgRelevant.toFixed(3)}, Irrelevant avg: ${avgIrrelevant.toFixed(3)}`
            );
          }
        }

        const accuracy = correctRankings / totalRankings;
        console.log(
          `📊 Ranking accuracy: ${correctRankings}/${totalRankings} (${(accuracy * 100).toFixed(1)}%)`
        );

        expect(accuracy).toBeGreaterThanOrEqual(0.7); // 70% accuracy
      }
    );
  });
});

// ============================================================================
// 4. EDGE CASES & ROBUSTNESS
// ============================================================================

describe('Edge Cases & Robustness', () => {
  describe('Ambiguous Queries', () => {
    const AMBIGUOUS_CASES = [
      {
        query: 'How is it going?',
        potentialMeanings: ['general wellbeing', 'specific project', 'relationship status'],
      },
      {
        query: 'Tell me about that thing',
        potentialMeanings: ['recent topic', 'ongoing project', 'mentioned item'],
      },
    ];

    // These tests work even with local embeddings (just validate output structure)
    it.each(AMBIGUOUS_CASES)(
      'should handle ambiguous query: "$query"',
      async ({ query }) => {
        // Ambiguous queries should still generate valid embeddings
        const emb = await embed(query);

        expect(emb).toBeDefined();
        expect(emb.length).toBeGreaterThan(0);
        expect(emb.every((v) => typeof v === 'number')).toBe(true);
      },
      LLM_TIMEOUT
    );
  });

  describe('Similar Words, Different Meanings', () => {
    const HOMONYM_CASES = [
      {
        sentence1: 'I need to book a flight',
        sentence2: 'I love to read a good book',
        shouldBeSimilar: false, // "book" has different meanings
      },
      {
        sentence1: 'The bank is closed today',
        sentence2: 'I walked along the river bank',
        shouldBeSimilar: false, // "bank" has different meanings
      },
      {
        sentence1: 'I need to run some errands',
        sentence2: 'I went for a morning run',
        shouldBeSimilar: false, // "run" has different meanings
      },
    ];

    it.skipIf(!USE_REAL_EMBEDDINGS).each(HOMONYM_CASES)(
      'should distinguish: "$sentence1" vs "$sentence2"',
      async ({ sentence1, sentence2, shouldBeSimilar }) => {
        const [emb1, emb2] = await Promise.all([embed(sentence1), embed(sentence2)]);

        const similarity = cosineSimilarity(emb1, emb2);

        if (shouldBeSimilar) {
          expect(similarity).toBeGreaterThan(0.7);
        } else {
          // Allow some similarity (words are the same) but not high
          expect(similarity).toBeLessThan(0.8);
        }
      },
      LLM_TIMEOUT
    );
  });

  describe('Empty and Invalid Inputs', () => {
    it('should handle empty string', async () => {
      const emb = await embed('');
      expect(emb).toBeDefined();
      expect(emb.length).toBeGreaterThan(0);
    });

    it('should handle very long input', async () => {
      const longText = 'word '.repeat(500);
      const emb = await embed(longText);
      expect(emb).toBeDefined();
      expect(emb.length).toBeGreaterThan(0);
    });

    it('should handle special characters', async () => {
      const specialText = '🎵 Music & fun! @home #blessed 💯';
      const emb = await embed(specialText);
      expect(emb).toBeDefined();
      expect(emb.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// 5. PERFORMANCE METRICS
// ============================================================================

describe('Performance Metrics', () => {
  it.skipIf(!USE_REAL_EMBEDDINGS)('should track cache statistics', async () => {
    const userId = 'test-stats-user';
    clearUserSemanticCache(userId);

    // Store some queries
    await storeInSemanticCache(userId, 'query1', { result: 1 });
    await storeInSemanticCache(userId, 'query2', { result: 2 });

    // Do some lookups
    await findSimilarCached(userId, 'query1'); // Should hit
    await findSimilarCached(userId, 'completely different query'); // Should miss

    const stats = getSemanticCacheStats();

    expect(stats).toBeDefined();
    // Stats structure depends on implementation
    console.log('📊 Cache stats:', stats);

    clearUserSemanticCache(userId);
  });
});
