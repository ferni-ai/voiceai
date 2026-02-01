/**
 * Multi-Layer Semantic Matcher
 *
 * The core matching engine that combines multiple strategies:
 * 1. Pattern matching (fast, exact)
 * 2. Keyword scoring (fast, fuzzy)
 * 3. Embedding similarity (slower, semantic)
 * 4. Context awareness (uses conversation history)
 * 5. Holistic NLU (relationship, emotion, time, domain, multi-intent)
 *
 * @module tools/semantic-router/matcher
 */

import { runHolisticLayer, type HolisticLayerResult } from './holistic-layer.js';
import type { SemanticToolRegistry } from './registry.js';
import type {
  ConversationTurn,
  DetectedIntent,
  EmbeddingVector,
  MatchLayer,
  SemanticRouterConfig,
  SemanticToolDefinition,
  ToolCategory,
  ToolMatch,
} from './types.js';
import { getKeywordWeight, getKeywordWord } from './types.js';
// Centralized similarity operations - uses SIMD-ready implementation from rust-accelerator
import { batchCosineSimilarityOptimized, cosineSimilarity } from '../../memory/rust-accelerator.js';
// Re-export for backwards compatibility with existing consumers
export { cosineSimilarity };

// ============================================================================
// TEXT NORMALIZATION
// ============================================================================

/**
 * Normalize input text for matching
 */
export function normalizeText(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      // Remove extra whitespace
      .replace(/\s+/g, ' ')
      // Remove common filler words
      .replace(/\b(um|uh|like|you know|well|so|actually|basically)\b/gi, '')
      // Normalize contractions
      .replace(/can't/g, 'cannot')
      .replace(/won't/g, 'will not')
      .replace(/n't/g, ' not')
      .replace(/'ll/g, ' will')
      .replace(/'ve/g, ' have')
      .replace(/'re/g, ' are')
      .replace(/'d/g, ' would')
      .trim()
  );
}

/**
 * Extract key tokens from text
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.!?;:()[\]{}'"]+/)
    .filter((t) => t.length > 1);
}

// ============================================================================
// LAYER 1: PATTERN MATCHING
// ============================================================================

interface PatternMatchResult {
  toolId: string;
  score: number;
  matchedPattern: string;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Check if a phrase matches as a complete word/phrase (not substring)
 * Examples:
 *   matchesAsWord("next", "next") → true (exact match)
 *   matchesAsWord("next", "play next") → true (word at end)
 *   matchesAsWord("next song", "skip to next song please") → true (words in middle)
 *   matchesAsWord("ex", "next") → false ("ex" is inside "next", not a separate word)
 */
function matchesAsWord(phrase: string, text: string): boolean {
  // Exact match is always valid
  if (text === phrase) return true;

  // Use word boundary regex to ensure the phrase appears as complete word(s)
  // \b matches word boundaries (start/end of string, or between word/non-word chars)
  const phrasePattern = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i');
  return phrasePattern.test(text);
}

/**
 * Fast pattern matching against triggers
 */
export function matchPatterns(
  normalizedText: string,
  tools: Array<{
    definition: SemanticToolDefinition;
    normalizedPhrases: string[];
    compiledPatterns: RegExp[];
  }>
): PatternMatchResult[] {
  const results: PatternMatchResult[] = [];

  for (const tool of tools) {
    // Check phrases - must match as complete words, not substrings
    for (const phrase of tool.normalizedPhrases) {
      if (matchesAsWord(phrase, normalizedText)) {
        results.push({
          toolId: tool.definition.id,
          score: 1.0, // Phrase match = full confidence
          matchedPattern: phrase,
        });
        break; // One match per tool is enough
      }
    }

    // Check regex patterns if no phrase matched
    if (!results.some((r) => r.toolId === tool.definition.id)) {
      for (const pattern of tool.compiledPatterns) {
        if (pattern.test(normalizedText)) {
          results.push({
            toolId: tool.definition.id,
            score: 0.95, // Regex match = very high confidence
            matchedPattern: pattern.source,
          });
          break;
        }
      }
    }
  }

  return results;
}

// ============================================================================
// LAYER 2: KEYWORD SCORING
// ============================================================================

interface KeywordMatchResult {
  toolId: string;
  score: number;
  matchedKeywords: string[];
  antiKeywordPenalty: number;
}

/**
 * Score based on keyword presence
 */
export function scoreKeywords(
  tokens: string[],
  tools: Array<{ definition: SemanticToolDefinition }>
): KeywordMatchResult[] {
  const results: KeywordMatchResult[] = [];
  const tokenSet = new Set(tokens);

  for (const tool of tools) {
    const keywords = tool.definition.triggers.keywords || [];
    const antiKeywords = tool.definition.triggers.antiKeywords || [];

    let totalWeight = 0;
    let matchedWeight = 0;
    const matchedKeywords: string[] = [];

    // Score positive keywords
    for (const kw of keywords) {
      const weight = getKeywordWeight(kw);
      const word = getKeywordWord(kw);
      totalWeight += weight;
      if (tokenSet.has(word.toLowerCase())) {
        matchedWeight += weight;
        matchedKeywords.push(word);
      }
    }

    // Calculate anti-keyword penalty
    let antiKeywordPenalty = 0;
    for (const anti of antiKeywords) {
      if (tokenSet.has(anti.toLowerCase())) {
        antiKeywordPenalty += 0.3; // Significant penalty per anti-keyword
      }
    }

    // Calculate score
    const rawScore = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    const penalizedScore = Math.max(0, rawScore - antiKeywordPenalty);

    if (penalizedScore > 0 || matchedKeywords.length > 0) {
      results.push({
        toolId: tool.definition.id,
        score: penalizedScore,
        matchedKeywords,
        antiKeywordPenalty,
      });
    }
  }

  return results;
}

// ============================================================================
// LAYER 3: EMBEDDING SIMILARITY
// ============================================================================

// Note: cosineSimilarity is imported from rust-accelerator.js (SIMD-accelerated)

interface EmbeddingMatchResult {
  toolId: string;
  score: number;
  descriptionSimilarity: number;
  bestExampleSimilarity: number;
  bestExampleIndex: number;
}

/**
 * Score based on embedding similarity.
 * Uses SIMD-accelerated batch operations when there are 5+ tools (40-60x speedup).
 */
export function scoreEmbeddings(
  queryEmbedding: EmbeddingVector,
  tools: Array<{
    definition: SemanticToolDefinition;
    descriptionEmbedding?: EmbeddingVector;
    exampleEmbeddings?: EmbeddingVector[];
  }>
): EmbeddingMatchResult[] {
  const results: EmbeddingMatchResult[] = [];

  // Filter tools that have embeddings
  const toolsWithEmbeddings = tools.filter((t) => t.descriptionEmbedding);
  if (toolsWithEmbeddings.length === 0) return results;

  // Use batch SIMD for 5+ tools (threshold where SIMD provides benefit)
  const useBatch = toolsWithEmbeddings.length >= 5;
  const queryArray = Array.isArray(queryEmbedding) ? queryEmbedding : Array.from(queryEmbedding);

  if (useBatch) {
    // === BATCH PATH: SIMD-accelerated ===

    // 1. Batch all description similarities at once
    const descEmbeddings = toolsWithEmbeddings.map((t) =>
      Array.isArray(t.descriptionEmbedding)
        ? t.descriptionEmbedding
        : Array.from(t.descriptionEmbedding!)
    );
    const descSimilarities = batchCosineSimilarityOptimized(queryArray, descEmbeddings);

    // 2. Collect all examples with metadata for batch processing
    const exampleMeta: Array<{ toolIdx: number; exampleIdx: number }> = [];
    const exampleEmbeddings: number[][] = [];

    toolsWithEmbeddings.forEach((tool, toolIdx) => {
      if (tool.exampleEmbeddings && tool.exampleEmbeddings.length > 0) {
        tool.exampleEmbeddings.forEach((emb, exIdx) => {
          exampleMeta.push({ toolIdx, exampleIdx: exIdx });
          exampleEmbeddings.push(Array.isArray(emb) ? emb : Array.from(emb));
        });
      }
    });

    // 3. Batch example similarities (only if we have examples)
    let exampleSimilarities: number[] = [];
    if (exampleEmbeddings.length >= 5) {
      exampleSimilarities = batchCosineSimilarityOptimized(queryArray, exampleEmbeddings);
    } else if (exampleEmbeddings.length > 0) {
      // Small batch - use individual comparisons
      exampleSimilarities = exampleEmbeddings.map((emb) => cosineSimilarity(queryArray, emb));
    }

    // 4. Aggregate best example per tool
    const bestExamplePerTool = new Map<number, { similarity: number; index: number }>();
    exampleSimilarities.forEach((sim, i) => {
      const { toolIdx, exampleIdx } = exampleMeta[i];
      const current = bestExamplePerTool.get(toolIdx);
      if (!current || sim > current.similarity) {
        bestExamplePerTool.set(toolIdx, { similarity: sim, index: exampleIdx });
      }
    });

    // 5. Build results
    toolsWithEmbeddings.forEach((tool, toolIdx) => {
      const descSim = descSimilarities[toolIdx];
      const bestEx = bestExamplePerTool.get(toolIdx);
      const bestExSim = bestEx?.similarity ?? 0;
      const bestExIdx = bestEx?.index ?? -1;

      // Combined score (examples weighted higher - they're more specific)
      const combinedScore = descSim * 0.3 + bestExSim * 0.7;

      if (combinedScore > 0.3) {
        results.push({
          toolId: tool.definition.id,
          score: combinedScore,
          descriptionSimilarity: descSim,
          bestExampleSimilarity: bestExSim,
          bestExampleIndex: bestExIdx,
        });
      }
    });
  } else {
    // === INDIVIDUAL PATH: Small batch, use direct comparisons ===
    for (const tool of toolsWithEmbeddings) {
      const descSim = cosineSimilarity(queryEmbedding, tool.descriptionEmbedding!);

      let bestExSim = 0;
      let bestExIdx = -1;

      if (tool.exampleEmbeddings) {
        for (let i = 0; i < tool.exampleEmbeddings.length; i++) {
          const exSim = cosineSimilarity(queryEmbedding, tool.exampleEmbeddings[i]);
          if (exSim > bestExSim) {
            bestExSim = exSim;
            bestExIdx = i;
          }
        }
      }

      const combinedScore = descSim * 0.3 + bestExSim * 0.7;

      if (combinedScore > 0.3) {
        results.push({
          toolId: tool.definition.id,
          score: combinedScore,
          descriptionSimilarity: descSim,
          bestExampleSimilarity: bestExSim,
          bestExampleIndex: bestExIdx,
        });
      }
    }
  }

  return results;
}

// ============================================================================
// LAYER 4: CONTEXT AWARENESS
// ============================================================================

interface ContextBoost {
  toolId: string;
  boost: number;
  reason: string;
}

/**
 * Calculate context-based boosts for tools
 */
export function calculateContextBoosts(
  conversationHistory: ConversationTurn[] | undefined,
  recentTools: string[] | undefined,
  tools: Array<{ definition: SemanticToolDefinition }>
): ContextBoost[] {
  const boosts: ContextBoost[] = [];

  // Guard against undefined parameters
  const history = conversationHistory || [];
  const recent = recentTools || [];

  // Boost tools related to recently used tools
  if (recent.length > 0) {
    const lastTool = recent[recent.length - 1];
    for (const tool of tools) {
      // Same category as recent tool
      const lastToolDef = tools.find((t) => t.definition.id === lastTool);
      if (lastToolDef && tool.definition.category === lastToolDef.definition.category) {
        boosts.push({
          toolId: tool.definition.id,
          boost: 0.1,
          reason: `Same category as recent tool ${lastTool}`,
        });
      }
    }
  }

  // Boost based on conversation topics
  const recentText = history
    .slice(-3)
    .map((t) => t.text || '')
    .join(' ')
    .toLowerCase();

  // Check if conversation context mentions tool-relevant topics
  for (const tool of tools) {
    const { triggers } = tool.definition;

    // Check if keywords appear in recent conversation
    const keywords = triggers.keywords || [];
    const keywordMatches = keywords.filter((kw) =>
      recentText.includes(getKeywordWord(kw).toLowerCase())
    );

    if (keywordMatches.length > 0) {
      boosts.push({
        toolId: tool.definition.id,
        boost: 0.05 * keywordMatches.length,
        reason: `Conversation mentions ${keywordMatches.map((k) => getKeywordWord(k)).join(', ')}`,
      });
    }
  }

  return boosts;
}

// ============================================================================
// INTENT DETECTION
// ============================================================================

const INTENT_PATTERNS: Array<{
  pattern: RegExp;
  mood: DetectedIntent['mood'];
  urgency?: DetectedIntent['urgency'];
}> = [
  // Commands
  { pattern: /^(play|start|stop|pause|skip|next|previous)\b/i, mood: 'command', urgency: 'normal' },
  { pattern: /^(set|create|add|remove|delete|update)\b/i, mood: 'command', urgency: 'normal' },
  { pattern: /^(call|text|email|message|send)\b/i, mood: 'command', urgency: 'high' },

  // Questions
  { pattern: /^(what|how|why|when|where|who|which|can you)\b/i, mood: 'question' },
  { pattern: /\?$/, mood: 'question' },

  // Requests
  { pattern: /^(could you|would you|can you|please|i'd like|i want)\b/i, mood: 'request' },

  // Urgent patterns
  {
    pattern: /\b(urgent|emergency|asap|right now|immediately)\b/i,
    mood: 'command',
    urgency: 'critical',
  },
  { pattern: /\b(help|crisis|panic)\b/i, mood: 'request', urgency: 'critical' },
];

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: ToolCategory | 'conversation' }> = [
  // Music
  {
    pattern: /\b(play|music|song|album|artist|playlist|spotify|jazz|rock|classical)\b/i,
    category: 'music',
  },

  // Information
  {
    pattern: /\b(what is|who is|tell me about|search|look up|find out|weather|news)\b/i,
    category: 'information',
  },

  // Memory
  { pattern: /\b(remember|recall|what did i|last time|history|memory)\b/i, category: 'memory' },

  // Calendar
  {
    pattern: /\b(calendar|schedule|appointment|meeting|event|remind|tomorrow|next week)\b/i,
    category: 'calendar',
  },

  // Tasks
  { pattern: /\b(task|todo|to-do|checklist|action item)\b/i, category: 'tasks' },

  // Communication
  { pattern: /\b(call|text|email|message|contact|phone)\b/i, category: 'communication' },

  // Wellness
  { pattern: /\b(meditation|breathing|calm|stress|anxiety|sleep|relax)\b/i, category: 'wellness' },

  // Finance
  { pattern: /\b(money|budget|spending|save|invest|finance|bank)\b/i, category: 'finance' },

  // Handoff
  {
    pattern: /\b(talk to|speak with|transfer|hand off|maya|peter|alex|jordan|nayan)\b/i,
    category: 'handoff',
  },

  // Settings
  {
    pattern: /\b(settings|preferences|configure|setup|volume|brightness)\b/i,
    category: 'settings',
  },
];

/**
 * Detect user intent from text
 */
export function detectIntent(normalizedText: string): DetectedIntent {
  let mood: DetectedIntent['mood'] = 'statement';
  let urgency: DetectedIntent['urgency'] = 'normal';
  let category: ToolCategory | 'conversation' | 'clarification' | 'unknown' = 'unknown';
  let specific: string | undefined;

  // Detect mood and urgency
  for (const { pattern, mood: m, urgency: u } of INTENT_PATTERNS) {
    if (pattern.test(normalizedText)) {
      mood = m;
      if (u) urgency = u;
      break;
    }
  }

  // Detect category
  for (const { pattern, category: c } of CATEGORY_PATTERNS) {
    if (pattern.test(normalizedText)) {
      category = c;
      // Extract specific intent
      const match = normalizedText.match(pattern);
      if (match) specific = match[0];
      break;
    }
  }

  // Very short inputs with no clear intent → clarification needed
  if (normalizedText.split(' ').length <= 2 && category === 'unknown') {
    category = 'clarification';
  }

  // Calculate confidence based on clarity of intent
  let confidence = 0.5; // Base confidence
  if (category !== 'unknown' && category !== 'clarification') confidence += 0.3;
  if (mood !== 'statement') confidence += 0.1;
  if (specific) confidence += 0.1;

  return {
    category,
    specific,
    confidence: Math.min(confidence, 1.0),
    mood,
    urgency,
  };
}

// ============================================================================
// COMBINED MATCHING - HELPER TYPES
// ============================================================================

interface ScoreEntry {
  pattern: number;
  keyword: number;
  embedding: number;
  context: number;
  history: number;
  holistic: number;
  matchedBy: MatchLayer[];
  matchReason: string[];
}

type ScoreMap = Map<string, ScoreEntry>;

// ============================================================================
// LAYER HELPERS
// ============================================================================

function runPatternLayer(
  config: SemanticRouterConfig,
  normalizedText: string,
  allTools: Array<{
    definition: SemanticToolDefinition;
    normalizedPhrases: string[];
    compiledPatterns: RegExp[];
  }>,
  scoreMap: ScoreMap,
  timings: Record<string, number>
): void {
  if (!config.enabledLayers.includes('pattern')) return;

  const patternStart = performance.now();
  const patternResults = matchPatterns(normalizedText, allTools);
  timings.pattern = performance.now() - patternStart;

  for (const result of patternResults) {
    const scores = scoreMap.get(result.toolId);
    if (scores) {
      scores.pattern = result.score;
      scores.matchedBy.push('pattern');
      scores.matchReason.push(`Pattern: "${result.matchedPattern}"`);
    }
  }
}

function runKeywordLayer(
  config: SemanticRouterConfig,
  tokens: string[],
  allTools: Array<{ definition: SemanticToolDefinition }>,
  scoreMap: ScoreMap,
  timings: Record<string, number>
): void {
  if (!config.enabledLayers.includes('keyword')) return;

  const keywordStart = performance.now();
  const keywordResults = scoreKeywords(tokens, allTools);
  timings.keyword = performance.now() - keywordStart;

  for (const result of keywordResults) {
    const scores = scoreMap.get(result.toolId);
    if (scores) {
      scores.keyword = result.score;
      if (result.score > 0) {
        scores.matchedBy.push('keyword');
        scores.matchReason.push(`Keywords: ${result.matchedKeywords.join(', ')}`);
      }
    }
  }
}

function runEmbeddingLayer(
  config: SemanticRouterConfig,
  queryEmbedding: EmbeddingVector | undefined,
  allTools: Array<{
    definition: SemanticToolDefinition;
    descriptionEmbedding?: EmbeddingVector;
    exampleEmbeddings?: EmbeddingVector[];
  }>,
  scoreMap: ScoreMap,
  timings: Record<string, number>
): void {
  if (!config.enabledLayers.includes('embedding') || !queryEmbedding) return;

  const embeddingStart = performance.now();
  const embeddingResults = scoreEmbeddings(queryEmbedding, allTools);
  timings.embedding = performance.now() - embeddingStart;

  for (const result of embeddingResults) {
    const scores = scoreMap.get(result.toolId);
    if (scores) {
      scores.embedding = result.score;
      if (result.score > 0.3) {
        scores.matchedBy.push('embedding');
        scores.matchReason.push(`Semantic similarity: ${(result.score * 100).toFixed(0)}%`);
      }
    }
  }
}

function runContextLayer(
  config: SemanticRouterConfig,
  conversationHistory: ConversationTurn[] | undefined,
  recentTools: string[] | undefined,
  allTools: Array<{ definition: SemanticToolDefinition }>,
  scoreMap: ScoreMap,
  timings: Record<string, number>
): void {
  if (!config.enabledLayers.includes('context') || !conversationHistory) return;

  const contextStart = performance.now();
  const contextBoosts = calculateContextBoosts(conversationHistory, recentTools ?? [], allTools);
  timings.context = performance.now() - contextStart;

  for (const boost of contextBoosts) {
    const scores = scoreMap.get(boost.toolId);
    if (scores) {
      scores.context = boost.boost;
      if (boost.boost > 0) {
        scores.matchedBy.push('context');
        scores.matchReason.push(`Context: ${boost.reason}`);
      }
    }
  }
}

function combineAndSortMatches(scoreMap: ScoreMap, config: SemanticRouterConfig): ToolMatch[] {
  const matches: ToolMatch[] = [];

  scoreMap.forEach((scores, toolId) => {
    const { weightedScore, totalWeight } = calculateWeightedScore(scores, config);
    let confidence = totalWeight > 0 ? weightedScore / totalWeight : 0;

    // CRITICAL: Perfect pattern match (1.0) should override combined confidence
    // Pattern match = deterministic intent (e.g., "check the weather" → weather_current)
    // Don't let other lower-scoring layers dilute a perfect match
    if (scores.pattern >= 1.0) {
      confidence = 1.0;
    } else if (scores.pattern >= 0.95) {
      // Regex pattern match (0.95) should also be very high confidence
      confidence = Math.max(confidence, 0.95);
    } else {
      // IMPROVED CONFIDENCE SCORING (January 2026)
      // Apply penalties for ambiguous matches to reduce misfires on conversational text

      // Penalty 1: Mixed signals penalty
      // If we have keyword matches but no pattern match, reduce confidence
      // This catches "I want to play" (conversational) vs "play jazz music" (clear intent)
      if (scores.keyword > 0 && scores.pattern < 0.5) {
        const mixedSignalPenalty = 0.15;
        confidence = Math.max(0, confidence - mixedSignalPenalty);
      }

      // Penalty 2: Low embedding confidence
      // Embeddings < 0.6 suggest the text isn't clearly a tool invocation
      if (scores.embedding > 0 && scores.embedding < 0.6) {
        const lowEmbeddingPenalty = 0.1;
        confidence = Math.max(0, confidence - lowEmbeddingPenalty);
      }

      // Penalty 3: Single weak signal
      // If only one layer matched and it's not pattern, reduce confidence
      const matchingLayers = scores.matchedBy.length;
      if (matchingLayers === 1 && !scores.matchedBy.includes('pattern')) {
        const singleLayerPenalty = 0.1;
        confidence = Math.max(0, confidence - singleLayerPenalty);
      }

      // Bonus: Multiple strong signals
      // If multiple layers agree (pattern + keyword, or keyword + embedding), boost slightly
      if (matchingLayers >= 2 && scores.pattern >= 0.7 && scores.keyword >= 0.5) {
        const multiLayerBonus = 0.05;
        confidence = Math.min(0.99, confidence + multiLayerBonus); // Cap below 1.0 for non-perfect matches
      }
    }

    if (confidence >= config.thresholds.minimum) {
      matches.push({
        toolId,
        confidence,
        matchedBy: scores.matchedBy,
        layerScores: {
          pattern: scores.pattern,
          keyword: scores.keyword,
          embedding: scores.embedding,
          context: scores.context,
          history: scores.history,
          holistic: scores.holistic,
        },
        extractedArgs: {},
        missingArgs: [],
        matchReason: scores.matchReason.join('; ') || 'No strong match',
      });
    }
  });

  return matches.sort((a, b) => b.confidence - a.confidence);
}

function calculateWeightedScore(
  scores: ScoreEntry,
  config: SemanticRouterConfig
): { weightedScore: number; totalWeight: number } {
  const weightedScore =
    scores.pattern * config.layerWeights.pattern +
    scores.keyword * config.layerWeights.keyword +
    scores.embedding * config.layerWeights.embedding +
    scores.context * config.layerWeights.context +
    scores.history * config.layerWeights.history +
    scores.holistic * config.layerWeights.holistic;

  let totalWeight = 0;
  if (scores.pattern > 0) totalWeight += config.layerWeights.pattern;
  if (scores.keyword > 0) totalWeight += config.layerWeights.keyword;
  if (scores.embedding > 0) totalWeight += config.layerWeights.embedding;
  if (scores.context > 0) totalWeight += config.layerWeights.context;
  if (scores.history > 0) totalWeight += config.layerWeights.history;
  if (scores.holistic > 0) totalWeight += config.layerWeights.holistic;

  return { weightedScore, totalWeight };
}

// ============================================================================
// COMBINED MATCHING - PUBLIC API
// ============================================================================

export interface CombinedMatchResult {
  intent: DetectedIntent;
  matches: ToolMatch[];
  timings: Record<MatchLayer | 'total' | 'normalize' | 'intent' | 'holistic', number>;
  holisticResult?: HolisticLayerResult;
}

/**
 * Run all matching layers and combine results
 */
export function runCombinedMatching(
  inputText: string,
  registry: SemanticToolRegistry,
  config: SemanticRouterConfig,
  context?: {
    conversationHistory?: ConversationTurn[];
    recentTools?: string[];
    queryEmbedding?: EmbeddingVector;
    sessionId?: string; // For holistic NLU multi-turn tracking
    userId?: string;
    personaId?: string;
  }
): CombinedMatchResult {
  const startTime = performance.now();
  const timings: Record<string, number> = {};

  // 1. Normalize text
  const normalizeStart = performance.now();
  const normalizedText = normalizeText(inputText);
  const tokens = tokenize(normalizedText);
  timings.normalize = performance.now() - normalizeStart;

  // 2. Detect intent
  const intentStart = performance.now();
  const intent = detectIntent(normalizedText);
  timings.intent = performance.now() - intentStart;

  // 3. Get all tools
  const allTools = registry.getAllRegistered();

  // Score map: toolId -> layer scores
  const scoreMap = new Map<
    string,
    {
      pattern: number;
      keyword: number;
      embedding: number;
      context: number;
      history: number;
      holistic: number;
      matchedBy: MatchLayer[];
      matchReason: string[];
    }
  >();

  // Initialize score map
  for (const tool of allTools) {
    scoreMap.set(tool.definition.id, {
      pattern: 0,
      keyword: 0,
      embedding: 0,
      context: 0,
      history: 0,
      holistic: 0,
      matchedBy: [],
      matchReason: [],
    });
  }

  // Run enabled matching layers
  runPatternLayer(config, normalizedText, allTools, scoreMap, timings);
  runKeywordLayer(config, tokens, allTools, scoreMap, timings);
  runEmbeddingLayer(config, context?.queryEmbedding, allTools, scoreMap, timings);
  runContextLayer(
    config,
    context?.conversationHistory,
    context?.recentTools,
    allTools,
    scoreMap,
    timings
  );

  // Run holistic NLU layer (relationship, emotion, multi-intent detection)
  const holisticResult = runHolisticLayer(
    inputText,
    context?.sessionId,
    allTools,
    scoreMap,
    timings
  );

  // Combine and sort matches
  const allMatches = combineAndSortMatches(scoreMap, config);
  const topMatches = allMatches.slice(0, config.maxMatches);

  timings.total = performance.now() - startTime;

  return {
    intent,
    matches: topMatches,
    timings: timings as CombinedMatchResult['timings'],
    holisticResult,
  };
}
