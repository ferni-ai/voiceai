/**
 * Equivalence Classifier
 *
 * Uses LLM to determine if two tools are functionally equivalent.
 * This provides a more accurate classification than embedding similarity alone.
 *
 * @module tools/intelligence/merger/equivalence-classifier
 */

import {
  getClassificationModel,
  MAX_TOKENS_MEDIUM,
  TEMP_CLASSIFICATION,
} from '../../../config/gemini-config.js';
import { HTTP_TIMEOUT_MS } from '../../../config/resilience-config.js';
import { createLogger } from '../../../utils/safe-logger.js';
import type { EquivalenceResult, ToolDefinition } from './types.js';

const log = createLogger({ module: 'tool-merger:equivalence' });

// ============================================================================
// TYPES
// ============================================================================

interface ClassifierConfig {
  /** Model to use for classification */
  model: string;
  /** Temperature for LLM */
  temperature: number;
  /** Maximum tokens for response */
  maxTokens: number;
  /** Timeout in milliseconds */
  timeoutMs: number;
}

const DEFAULT_CONFIG: ClassifierConfig = {
  model: getClassificationModel(),
  temperature: TEMP_CLASSIFICATION,
  maxTokens: MAX_TOKENS_MEDIUM,
  timeoutMs: HTTP_TIMEOUT_MS,
};

// ============================================================================
// EQUIVALENCE CLASSIFIER
// ============================================================================

export class EquivalenceClassifier {
  private config: ClassifierConfig;
  private cache = new Map<string, EquivalenceResult>();

  constructor(config: Partial<ClassifierConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Classify whether two tools are functionally equivalent
   */
  async classifyEquivalence(
    toolA: ToolDefinition,
    toolB: ToolDefinition,
    embeddingSimilarity: number
  ): Promise<EquivalenceResult> {
    const cacheKey = this.getCacheKey(toolA.id, toolB.id);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const startTime = Date.now();

    try {
      const prompt = this.buildPrompt(toolA, toolB, embeddingSimilarity);
      const response = await this.callLLM(prompt);
      const result = this.parseResponse(response, toolA.id, toolB.id, embeddingSimilarity);

      // Cache the result
      this.cache.set(cacheKey, result);

      log.debug(
        {
          toolA: toolA.id,
          toolB: toolB.id,
          equivalent: result.functionallyEquivalent,
          confidence: result.confidence,
          durationMs: Date.now() - startTime,
        },
        'Equivalence classification complete'
      );

      return result;
    } catch (error) {
      log.warn(
        { toolA: toolA.id, toolB: toolB.id, error: String(error) },
        'LLM classification failed, using embedding similarity fallback'
      );

      // Fall back to embedding similarity
      const result: EquivalenceResult = {
        toolA: toolA.id,
        toolB: toolB.id,
        embeddingSimilarity,
        functionallyEquivalent: embeddingSimilarity > 0.9,
        confidence: embeddingSimilarity,
        reasoning: 'Fallback to embedding similarity due to LLM error',
      };

      this.cache.set(cacheKey, result);
      return result;
    }
  }

  /**
   * Batch classify multiple pairs for efficiency
   */
  async classifyBatch(
    pairs: Array<{
      toolA: ToolDefinition;
      toolB: ToolDefinition;
      similarity: number;
    }>
  ): Promise<EquivalenceResult[]> {
    // Process in parallel with concurrency limit
    const CONCURRENCY = 5;
    const results: EquivalenceResult[] = [];

    for (let i = 0; i < pairs.length; i += CONCURRENCY) {
      const batch = pairs.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (p) => this.classifyEquivalence(p.toolA, p.toolB, p.similarity))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Build the prompt for equivalence classification
   */
  private buildPrompt(toolA: ToolDefinition, toolB: ToolDefinition, similarity: number): string {
    return `You are analyzing two software tools to determine if they are functionally equivalent.
Two tools are "functionally equivalent" if:
1. They serve the same primary purpose
2. A user could use either tool interchangeably to accomplish the same goal
3. The differences are only in naming or minor implementation details

## Tool A
ID: ${toolA.id}
Name: ${toolA.name}
Domain: ${toolA.domain}
Description: ${toolA.description}
${toolA.inputSchema ? `Input Schema: ${JSON.stringify(toolA.inputSchema, null, 2).slice(0, 500)}` : ''}

## Tool B
ID: ${toolB.id}
Name: ${toolB.name}
Domain: ${toolB.domain}
Description: ${toolB.description}
${toolB.inputSchema ? `Input Schema: ${JSON.stringify(toolB.inputSchema, null, 2).slice(0, 500)}` : ''}

## Embedding Similarity
Cosine similarity: ${similarity.toFixed(3)}

## Your Task
Determine if these tools are functionally equivalent. Consider:
- Do they solve the same user problem?
- Could they be merged into a single tool without losing functionality?
- Are the differences superficial (naming) or substantial (different capabilities)?

Respond in JSON format:
{
  "equivalent": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}`;
  }

  /**
   * Call the LLM for classification
   */
  private async callLLM(prompt: string): Promise<string> {
    // Dynamic import to avoid circular dependencies
    const { GoogleGenerativeAI } = await import('@google/generative-ai');

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY not set');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: this.config.model });

    const result = await Promise.race([
      model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: this.config.temperature,
          maxOutputTokens: this.config.maxTokens,
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM timeout')), this.config.timeoutMs)
      ),
    ]);

    const { response } = result;
    return response.text();
  }

  /**
   * Parse LLM response into structured result
   */
  private parseResponse(
    response: string,
    toolAId: string,
    toolBId: string,
    embeddingSimilarity: number
  ): EquivalenceResult {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        equivalent?: boolean;
        confidence?: number;
        reasoning?: string;
      };

      return {
        toolA: toolAId,
        toolB: toolBId,
        embeddingSimilarity,
        functionallyEquivalent: parsed.equivalent ?? false,
        confidence: parsed.confidence ?? 0.5,
        reasoning: parsed.reasoning,
      };
    } catch (error) {
      log.warn(
        { error: String(error), response: response.slice(0, 200) },
        'Failed to parse LLM response'
      );

      // Conservative fallback
      return {
        toolA: toolAId,
        toolB: toolBId,
        embeddingSimilarity,
        functionallyEquivalent: false,
        confidence: 0.3,
        reasoning: 'Failed to parse LLM response',
      };
    }
  }

  /**
   * Get cache key for a tool pair (order-independent)
   */
  private getCacheKey(toolA: string, toolB: string): string {
    return [toolA, toolB].sort().join('::');
  }

  /**
   * Clear the classification cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses for real rate
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let classifierInstance: EquivalenceClassifier | null = null;

export function getEquivalenceClassifier(): EquivalenceClassifier {
  if (!classifierInstance) {
    classifierInstance = new EquivalenceClassifier();
  }
  return classifierInstance;
}

export function resetEquivalenceClassifier(): void {
  classifierInstance = null;
}
