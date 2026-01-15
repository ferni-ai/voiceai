/**
 * Batched LLM Analysis Service
 *
 * PERFORMANCE OPTIMIZATION: Batch multiple analysis tasks into a single
 * LLM call to reduce API overhead by 50%+.
 *
 * Instead of:
 * - 1 call for intent classification
 * - 1 call for emotion detection
 * - 1 call for entity extraction
 * - 1 call for topic detection
 * = 4 API calls, ~800-1200ms total
 *
 * We do:
 * - 1 call with all tasks in structured output
 * = 1 API call, ~200-400ms total
 *
 * @module intelligence/batched-llm-analysis
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getDefaultModel } from '../../services/llm/model-config.js';

const log = createLogger({ module: 'BatchedLLMAnalysis' });

// ============================================================================
// GEMINI CLIENT TYPE (minimal interface for what we use)
// ============================================================================

/** Minimal type for the Gemini client response we need */
interface GeminiGenerateResponse {
  text?: string;
  response: {
    usageMetadata?: {
      totalTokenCount?: number;
    };
  };
}

/** Minimal type for the Gemini client we use */
interface GeminiClientLike {
  models: {
    generateContent: (options: {
      model: string;
      contents: string;
      config?: {
        temperature?: number;
        maxOutputTokens?: number;
      };
    }) => Promise<GeminiGenerateResponse>;
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface AnalysisRequest {
  /** User message to analyze */
  message: string;
  /** Previous messages for context */
  context?: Array<{ role: string; content: string }>;
  /** Current persona ID */
  personaId?: string;
  /** User ID for personalization */
  userId?: string;
  /** Which analyses to run */
  analyses?: AnalysisType[];
}

export type AnalysisType =
  | 'intent'
  | 'emotion'
  | 'entities'
  | 'topics'
  | 'sentiment'
  | 'distress'
  | 'cognitive_distortions'
  | 'action_items';

export interface IntentAnalysis {
  primary: string;
  secondary?: string;
  confidence: number;
  requiresAction: boolean;
  urgency: 'low' | 'medium' | 'high';
}

export interface EmotionAnalysis {
  primary: string;
  secondary?: string;
  intensity: number;
  valence: 'positive' | 'neutral' | 'negative';
  arousal: number;
  needsSupport: boolean;
}

export interface EntityAnalysis {
  people: Array<{ name: string; relationship?: string }>;
  places: string[];
  times: Array<{ text: string; parsed?: Date }>;
  events: string[];
  topics: string[];
}

export interface TopicAnalysis {
  detected: string[];
  primary?: string;
  shift?: {
    from: string;
    to: string;
    significance: 'minor' | 'major';
  };
}

export interface SentimentAnalysis {
  score: number; // -1 to 1
  magnitude: number; // 0 to 1
  aspects: Array<{ aspect: string; sentiment: number }>;
}

export interface DistressAnalysis {
  level: number; // 0-10
  indicators: string[];
  isCrisis: boolean;
  recommendedResponse: 'normal' | 'supportive' | 'crisis';
}

export interface CognitiveDistortionAnalysis {
  detected: Array<{
    type: string;
    phrase: string;
    confidence: number;
  }>;
  overallPattern?: string;
}

export interface ActionItemAnalysis {
  items: Array<{
    action: string;
    urgency: 'low' | 'medium' | 'high';
    deadline?: string;
  }>;
  commitments: string[];
  questions: string[];
}

export interface BatchedAnalysisResult {
  intent?: IntentAnalysis;
  emotion?: EmotionAnalysis;
  entities?: EntityAnalysis;
  topics?: TopicAnalysis;
  sentiment?: SentimentAnalysis;
  distress?: DistressAnalysis;
  cognitiveDistortions?: CognitiveDistortionAnalysis;
  actionItems?: ActionItemAnalysis;
  /** Processing metrics */
  _meta: {
    durationMs: number;
    tokensUsed?: number;
    cached: boolean;
  };
}

// ============================================================================
// PROMPTS
// ============================================================================

const ANALYSIS_SYSTEM_PROMPT = `You are an expert conversation analyst. Analyze the user's message and return a structured JSON response with the requested analyses.

Be accurate, concise, and focused. Consider the conversation context when available.

For distress detection:
- Level 0-3: Normal conversation
- Level 4-6: Elevated stress, may need support
- Level 7-9: High distress, supportive response needed
- Level 10: Crisis, immediate intervention needed

For cognitive distortions, detect patterns like:
- All-or-nothing thinking
- Catastrophizing
- Mind reading
- Fortune telling
- Should statements
- Emotional reasoning
- Overgeneralization`;

function buildAnalysisPrompt(request: AnalysisRequest): string {
  const analyses = request.analyses || ['intent', 'emotion', 'entities', 'topics'];

  let prompt = `Analyze this message and return JSON with the following fields:\n\n`;
  prompt += `Message: "${request.message}"\n\n`;

  if (request.context && request.context.length > 0) {
    prompt += `Recent conversation context:\n`;
    for (const msg of request.context.slice(-3)) {
      prompt += `${msg.role}: ${msg.content.slice(0, 200)}\n`;
    }
    prompt += `\n`;
  }

  prompt += `Return ONLY valid JSON with these fields:\n{\n`;

  if (analyses.includes('intent')) {
    prompt += `  "intent": { "primary": string, "secondary": string|null, "confidence": 0-1, "requiresAction": boolean, "urgency": "low"|"medium"|"high" },\n`;
  }

  if (analyses.includes('emotion')) {
    prompt += `  "emotion": { "primary": string, "secondary": string|null, "intensity": 0-1, "valence": "positive"|"neutral"|"negative", "arousal": 0-1, "needsSupport": boolean },\n`;
  }

  if (analyses.includes('entities')) {
    prompt += `  "entities": { "people": [{"name": string, "relationship": string|null}], "places": [string], "times": [{"text": string}], "events": [string], "topics": [string] },\n`;
  }

  if (analyses.includes('topics')) {
    prompt += `  "topics": { "detected": [string], "primary": string|null, "shift": {"from": string, "to": string, "significance": "minor"|"major"}|null },\n`;
  }

  if (analyses.includes('sentiment')) {
    prompt += `  "sentiment": { "score": -1 to 1, "magnitude": 0-1, "aspects": [{"aspect": string, "sentiment": -1 to 1}] },\n`;
  }

  if (analyses.includes('distress')) {
    prompt += `  "distress": { "level": 0-10, "indicators": [string], "isCrisis": boolean, "recommendedResponse": "normal"|"supportive"|"crisis" },\n`;
  }

  if (analyses.includes('cognitive_distortions')) {
    prompt += `  "cognitiveDistortions": { "detected": [{"type": string, "phrase": string, "confidence": 0-1}], "overallPattern": string|null },\n`;
  }

  if (analyses.includes('action_items')) {
    prompt += `  "actionItems": { "items": [{"action": string, "urgency": "low"|"medium"|"high", "deadline": string|null}], "commitments": [string], "questions": [string] },\n`;
  }

  prompt += `}`;

  return prompt;
}

// ============================================================================
// BATCHED ANALYZER
// ============================================================================

class BatchedLLMAnalyzer {
  private cache = new Map<string, { result: BatchedAnalysisResult; timestamp: number }>();
  private cacheTtlMs = 60000; // 1 minute cache for same messages
  private metrics = {
    totalRequests: 0,
    cacheHits: 0,
    apiCalls: 0,
    avgLatencyMs: 0,
    totalTokens: 0,
    savedCalls: 0, // Calls saved by batching
  };
  private latencies: number[] = [];

  /**
   * Run batched analysis on a message
   */
  async analyze(request: AnalysisRequest): Promise<BatchedAnalysisResult> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    // Check cache
    const cacheKey = this.getCacheKey(request);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      this.metrics.cacheHits++;
      return { ...cached.result, _meta: { ...cached.result._meta, cached: true } };
    }

    // Default analyses if not specified
    const analyses = request.analyses || ['intent', 'emotion', 'entities', 'topics', 'distress'];

    // Track saved calls (would be N calls without batching)
    this.metrics.savedCalls += analyses.length - 1;

    try {
      const result = await this.callLLM(request, analyses);

      const durationMs = Date.now() - startTime;
      result._meta = {
        durationMs,
        tokensUsed: result._meta?.tokensUsed,
        cached: false,
      };

      // Update metrics
      this.metrics.apiCalls++;
      this.latencies.push(durationMs);
      if (this.latencies.length > 100) this.latencies.shift();
      this.metrics.avgLatencyMs = this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;

      // Cache result
      this.cache.set(cacheKey, { result, timestamp: Date.now() });

      log.debug(
        {
          analyses: analyses.length,
          durationMs,
          message: request.message.slice(0, 50),
        },
        'Batched analysis complete'
      );

      return result;
    } catch (error) {
      log.warn({ error: String(error) }, 'Batched LLM analysis failed');

      // Return fallback result
      return this.getFallbackResult(request.message, analyses, Date.now() - startTime);
    }
  }

  /**
   * Call LLM with batched analysis request
   */
  private async callLLM(
    request: AnalysisRequest,
    analyses: AnalysisType[]
  ): Promise<BatchedAnalysisResult> {
    const prompt = buildAnalysisPrompt({ ...request, analyses });

    // Try to use the existing LLM infrastructure
    try {
      // Use centralized Gemini config
      const { getGeminiClient, isGeminiConfigured } = await import('../../config/gemini-config.js');

      if (!isGeminiConfigured()) {
        throw new Error(
          'Gemini not configured - check USE_VERTEX_AI and GOOGLE_CLOUD_PROJECT in .env'
        );
      }

      const genai = await getGeminiClient();
      if (!genai) {
        throw new Error('Failed to initialize Gemini client');
      }

      // Type assertion: getGeminiClient returns unknown, but we know it's a GoogleGenAI client
      const client = genai as unknown as GeminiClientLike;
      const response = await client.models.generateContent({
        model: getDefaultModel(),
        contents: `${ANALYSIS_SYSTEM_PROMPT}\n\n${prompt}`,
        config: {
          temperature: 0.1, // Low temperature for consistent analysis
          maxOutputTokens: 1000,
        },
      });

      const text = response.text ?? '';

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as Omit<BatchedAnalysisResult, '_meta'>;

      return {
        ...parsed,
        _meta: {
          durationMs: 0,
          tokensUsed: response.response.usageMetadata?.totalTokenCount,
          cached: false,
        },
      };
    } catch (error) {
      // Fallback to OpenAI if Gemini fails
      try {
        const { default: OpenAI } = await import('openai');

        const openai = new OpenAI();

        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 1000,
          response_format: { type: 'json_object' },
        });

        const text = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(text) as Omit<BatchedAnalysisResult, '_meta'>;

        return {
          ...parsed,
          _meta: {
            durationMs: 0,
            tokensUsed: response.usage?.total_tokens,
            cached: false,
          },
        };
      } catch (openaiError) {
        log.warn({ error: String(openaiError) }, 'OpenAI fallback also failed');
        throw error;
      }
    }
  }

  /**
   * Get fallback result when LLM fails
   */
  private getFallbackResult(
    message: string,
    analyses: AnalysisType[],
    durationMs: number
  ): BatchedAnalysisResult {
    const result: BatchedAnalysisResult = {
      _meta: { durationMs, cached: false },
    };

    if (analyses.includes('intent')) {
      result.intent = {
        primary: 'unknown',
        confidence: 0.3,
        requiresAction: false,
        urgency: 'low',
      };
    }

    if (analyses.includes('emotion')) {
      result.emotion = {
        primary: 'neutral',
        intensity: 0.5,
        valence: 'neutral',
        arousal: 0.5,
        needsSupport: false,
      };
    }

    if (analyses.includes('entities')) {
      result.entities = {
        people: [],
        places: [],
        times: [],
        events: [],
        topics: [],
      };
    }

    if (analyses.includes('topics')) {
      result.topics = {
        detected: [],
        primary: undefined,
      };
    }

    if (analyses.includes('sentiment')) {
      result.sentiment = {
        score: 0,
        magnitude: 0.5,
        aspects: [],
      };
    }

    if (analyses.includes('distress')) {
      result.distress = {
        level: 0,
        indicators: [],
        isCrisis: false,
        recommendedResponse: 'normal',
      };
    }

    if (analyses.includes('cognitive_distortions')) {
      result.cognitiveDistortions = {
        detected: [],
      };
    }

    if (analyses.includes('action_items')) {
      result.actionItems = {
        items: [],
        commitments: [],
        questions: [],
      };
    }

    return result;
  }

  /**
   * Generate cache key
   */
  private getCacheKey(request: AnalysisRequest): string {
    const analyses = (request.analyses || []).sort().join(',');
    return `${request.message.slice(0, 100)}:${analyses}:${request.personaId || ''}`;
  }

  /**
   * Get metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let analyzerInstance: BatchedLLMAnalyzer | null = null;

export function getBatchedAnalyzer(): BatchedLLMAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new BatchedLLMAnalyzer();
  }
  return analyzerInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Run batched analysis on a message
 */
export async function batchedAnalyze(request: AnalysisRequest): Promise<BatchedAnalysisResult> {
  return getBatchedAnalyzer().analyze(request);
}

/**
 * Quick intent + emotion analysis (most common use case)
 */
export async function analyzeIntentAndEmotion(
  message: string,
  context?: Array<{ role: string; content: string }>
): Promise<{ intent: IntentAnalysis; emotion: EmotionAnalysis; durationMs: number }> {
  const result = await batchedAnalyze({
    message,
    context,
    analyses: ['intent', 'emotion'],
  });

  return {
    intent: result.intent!,
    emotion: result.emotion!,
    durationMs: result._meta.durationMs,
  };
}

/**
 * Full analysis (all fields)
 */
export async function fullAnalysis(
  message: string,
  context?: Array<{ role: string; content: string }>,
  userId?: string
): Promise<BatchedAnalysisResult> {
  return batchedAnalyze({
    message,
    context,
    userId,
    analyses: [
      'intent',
      'emotion',
      'entities',
      'topics',
      'sentiment',
      'distress',
      'cognitive_distortions',
      'action_items',
    ],
  });
}

/**
 * Get batched analysis metrics
 */
export function getBatchedAnalysisMetrics(): ReturnType<BatchedLLMAnalyzer['getMetrics']> {
  return getBatchedAnalyzer().getMetrics();
}

export default BatchedLLMAnalyzer;
