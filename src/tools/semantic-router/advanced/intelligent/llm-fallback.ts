/**
 * LLM Fallback Router
 *
 * When semantic routing has high uncertainty, falls back to LLM-based selection.
 * The LLM sees the top candidate tools and makes the final decision with reasoning.
 *
 * This is often MORE accurate than semantic routing because:
 * - LLMs understand nuance and context
 * - They can ask clarifying questions
 * - They handle edge cases better (e.g., "I'm dying here" → casual vs crisis)
 *
 * @module semantic-router/advanced/intelligent/llm-fallback
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { ToolMatch, SemanticRouterResult } from '../../types.js';

const log = createLogger({ module: 'llm-fallback-router' });

// ============================================================================
// TYPES
// ============================================================================

export interface LLMFallbackConfig {
  /** Uncertainty threshold to trigger LLM fallback */
  uncertaintyThreshold: number;
  /** Confidence gap threshold (if top 2 are too close) */
  confidenceGapThreshold: number;
  /** Max tools to show LLM for selection */
  maxCandidates: number;
  /** Model to use for fallback */
  model: 'gemini-2.0-flash' | 'gpt-4o-mini' | 'claude-3-haiku';
  /** Enable reasoning output */
  includeReasoning: boolean;
  /** Timeout for LLM call */
  timeoutMs: number;
}

export interface LLMSelectionResult {
  /** Selected tool ID */
  selectedToolId: string | null;
  /** Why LLM selected this tool */
  reasoning: string;
  /** Confidence in selection (0-1) */
  confidence: number;
  /** Should we ask for clarification? */
  needsClarification: boolean;
  /** Clarification question if needed */
  clarificationQuestion?: string;
  /** Alternative tools LLM considered */
  alternatives: Array<{ toolId: string; reason: string }>;
  /** Time taken for LLM call */
  latencyMs: number;
  /** Whether fallback was triggered */
  wasTriggered: boolean;
}

export interface ToolCandidate {
  toolId: string;
  name: string;
  description: string;
  confidence: number;
  extractedArgs?: Record<string, unknown>;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: LLMFallbackConfig = {
  uncertaintyThreshold: 0.35, // If uncertainty > 35%, use LLM
  confidenceGapThreshold: 0.12, // If top 2 tools within 12%, use LLM
  maxCandidates: 8,
  model: 'gemini-2.0-flash',
  includeReasoning: true,
  timeoutMs: 3000,
};

// ============================================================================
// LLM FALLBACK ROUTER
// ============================================================================

export class LLMFallbackRouter {
  private config: LLMFallbackConfig;
  private llmProvider: LLMProvider | null = null;

  constructor(config: Partial<LLMFallbackConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the LLM provider for fallback routing
   */
  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
    log.info({ model: this.config.model }, 'LLM fallback provider configured');
  }

  /**
   * Check if fallback should be triggered based on routing result
   */
  shouldTriggerFallback(
    routingResult: SemanticRouterResult,
    uncertainty?: { epistemic: number; aleatoric: number; total: number }
  ): { trigger: boolean; reason: string } {
    const matches = routingResult.matches;

    // No matches → definitely trigger
    if (matches.length === 0) {
      return { trigger: true, reason: 'no_matches' };
    }

    const topMatch = matches[0];

    // Very low confidence → trigger
    if (topMatch.confidence < 0.4) {
      return { trigger: true, reason: 'low_confidence' };
    }

    // High uncertainty → trigger
    if (uncertainty && uncertainty.epistemic > this.config.uncertaintyThreshold) {
      return {
        trigger: true,
        reason: `high_uncertainty (${(uncertainty.epistemic * 100).toFixed(0)}%)`,
      };
    }

    // Top 2 candidates too close → trigger
    if (matches.length >= 2) {
      const gap = topMatch.confidence - matches[1].confidence;
      if (gap < this.config.confidenceGapThreshold && matches[1].confidence > 0.5) {
        return {
          trigger: true,
          reason: `ambiguous (gap=${(gap * 100).toFixed(0)}%)`,
        };
      }
    }

    // Action is 'disambiguate' → trigger
    if (routingResult.action.type === 'disambiguate') {
      return { trigger: true, reason: 'needs_disambiguation' };
    }

    return { trigger: false, reason: 'confident_routing' };
  }

  /**
   * Run LLM selection on candidate tools
   */
  async selectTool(
    userInput: string,
    candidates: ToolCandidate[],
    context?: {
      conversationHistory?: Array<{ role: string; content: string }>;
      userId?: string;
      personaId?: string;
    }
  ): Promise<LLMSelectionResult> {
    const startTime = performance.now();

    if (!this.llmProvider) {
      log.warn('No LLM provider configured, returning top candidate');
      return {
        selectedToolId: candidates[0]?.toolId || null,
        reasoning: 'LLM fallback not configured, using semantic routing result',
        confidence: candidates[0]?.confidence || 0,
        needsClarification: false,
        alternatives: [],
        latencyMs: performance.now() - startTime,
        wasTriggered: false,
      };
    }

    // Build prompt for tool selection
    const prompt = this.buildSelectionPrompt(userInput, candidates, context);

    try {
      const response = await Promise.race([
        this.llmProvider.generate(prompt),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('LLM timeout')), this.config.timeoutMs);
        }),
      ]);

      const parsed = this.parseSelectionResponse(response, candidates);

      log.info(
        {
          input: userInput.slice(0, 50),
          selected: parsed.selectedToolId,
          confidence: parsed.confidence,
          needsClarification: parsed.needsClarification,
          latencyMs: performance.now() - startTime,
        },
        'LLM fallback selection complete'
      );

      return {
        ...parsed,
        latencyMs: performance.now() - startTime,
        wasTriggered: true,
      };
    } catch (error) {
      log.error({ error }, 'LLM fallback failed');

      // Fall back to top semantic candidate
      return {
        selectedToolId: candidates[0]?.toolId || null,
        reasoning: `LLM fallback failed: ${error instanceof Error ? error.message : 'unknown'}`,
        confidence: candidates[0]?.confidence || 0,
        needsClarification: false,
        alternatives: [],
        latencyMs: performance.now() - startTime,
        wasTriggered: false,
      };
    }
  }

  /**
   * Build the prompt for LLM tool selection
   */
  private buildSelectionPrompt(
    userInput: string,
    candidates: ToolCandidate[],
    context?: {
      conversationHistory?: Array<{ role: string; content: string }>;
      userId?: string;
      personaId?: string;
    }
  ): string {
    const toolList = candidates
      .slice(0, this.config.maxCandidates)
      .map(
        (t, i) =>
          `${i + 1}. **${t.name}** (id: ${t.toolId})
   Description: ${t.description}
   Semantic confidence: ${(t.confidence * 100).toFixed(0)}%`
      )
      .join('\n\n');

    const historyContext = context?.conversationHistory?.slice(-3)
      ? `Recent conversation:
${context.conversationHistory
  .slice(-3)
  .map((t) => `${t.role}: ${t.content.slice(0, 100)}`)
  .join('\n')}`
      : '';

    return `You are a tool selection expert. A user has made a request and semantic routing found these candidate tools, but the selection is uncertain.

**User said:** "${userInput}"

${historyContext}

**Candidate tools:**
${toolList}

**Your task:**
1. Think about what the user ACTUALLY wants to accomplish
2. Consider if this is casual conversation or a tool request
3. Select the BEST tool, or indicate if none are appropriate
4. If the request is ambiguous, ask a clarifying question

**Response format (JSON):**
{
  "reasoning": "Step-by-step reasoning about what user wants...",
  "selectedToolId": "tool_id_here" or null,
  "confidence": 0.0-1.0,
  "needsClarification": true/false,
  "clarificationQuestion": "Optional question if ambiguous",
  "alternatives": [{"toolId": "...", "reason": "Why this could work..."}]
}

**Important considerations:**
- "I'm dying here" is usually casual, not a crisis
- "Play something" is music, but "play with me" might be games
- If user seems to be chatting, select null for conversation
- Consider the persona context: ${context?.personaId || 'general'}

Respond ONLY with valid JSON:`;
  }

  /**
   * Parse the LLM's selection response
   */
  private parseSelectionResponse(
    response: string,
    candidates: ToolCandidate[]
  ): Omit<LLMSelectionResult, 'latencyMs' | 'wasTriggered'> {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
      const jsonStr = jsonMatch[1] || response;

      const parsed = JSON.parse(jsonStr.trim());

      // Validate selected tool exists
      const validToolId =
        parsed.selectedToolId && candidates.some((c) => c.toolId === parsed.selectedToolId)
          ? parsed.selectedToolId
          : null;

      return {
        selectedToolId: validToolId,
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0)),
        needsClarification: Boolean(parsed.needsClarification),
        clarificationQuestion: parsed.clarificationQuestion,
        alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
      };
    } catch (error) {
      log.warn({ error, response: response.slice(0, 200) }, 'Failed to parse LLM response');

      // Fallback: try to extract tool ID from text
      const toolIdMatch = response.match(/"selectedToolId":\s*"([^"]+)"/);

      return {
        selectedToolId: toolIdMatch?.[1] || null,
        reasoning: 'Failed to parse LLM response',
        confidence: 0.3,
        needsClarification: true,
        clarificationQuestion: "I'm not sure I understood. Could you tell me more?",
        alternatives: [],
      };
    }
  }

  /**
   * Run full fallback flow: check + select
   */
  async runFallbackIfNeeded(
    userInput: string,
    routingResult: SemanticRouterResult,
    toolDescriptions: Map<string, { name: string; description: string }>,
    options?: {
      uncertainty?: { epistemic: number; aleatoric: number; total: number };
      context?: {
        conversationHistory?: Array<{ role: string; content: string }>;
        userId?: string;
        personaId?: string;
      };
    }
  ): Promise<SemanticRouterResult & { llmFallback?: LLMSelectionResult }> {
    const { trigger, reason } = this.shouldTriggerFallback(routingResult, options?.uncertainty);

    if (!trigger) {
      return routingResult;
    }

    log.info({ reason, topConfidence: routingResult.matches[0]?.confidence }, 'Triggering LLM fallback');

    // Build candidates from matches
    const candidates: ToolCandidate[] = routingResult.matches
      .slice(0, this.config.maxCandidates)
      .map((m) => ({
        toolId: m.toolId,
        name: toolDescriptions.get(m.toolId)?.name || m.toolId,
        description: toolDescriptions.get(m.toolId)?.description || 'No description',
        confidence: m.confidence,
        extractedArgs: m.extractedArgs,
      }));

    const llmResult = await this.selectTool(userInput, candidates, options?.context);

    // Update routing result based on LLM selection
    if (llmResult.selectedToolId && llmResult.confidence > 0.5) {
      const selectedMatch = routingResult.matches.find((m) => m.toolId === llmResult.selectedToolId);

      return {
        ...routingResult,
        action: llmResult.needsClarification
          ? {
              type: 'clarify',
              question: llmResult.clarificationQuestion || 'Could you tell me more?',
              missingInfo: [],
            }
          : {
              type: 'execute',
              toolId: llmResult.selectedToolId,
              args: selectedMatch?.extractedArgs || {},
              confidence: llmResult.confidence,
            },
        llmFallback: llmResult,
      };
    }

    // LLM says conversation
    if (llmResult.needsClarification) {
      return {
        ...routingResult,
        action: {
          type: 'clarify',
          question: llmResult.clarificationQuestion || 'Could you tell me more about what you need?',
          missingInfo: [],
        },
        llmFallback: llmResult,
      };
    }

    return {
      ...routingResult,
      action: {
        type: 'conversation',
        reason: llmResult.reasoning,
      },
      llmFallback: llmResult,
    };
  }
}

// ============================================================================
// LLM PROVIDER INTERFACE
// ============================================================================

export interface LLMProvider {
  /** Generate a response from the LLM */
  generate(prompt: string): Promise<string>;
  /** Model name */
  model: string;
}

/**
 * Create a simple Gemini provider
 */
export function createGeminiProvider(apiKey: string): LLMProvider {
  return {
    model: 'gemini-2.0-flash',
    async generate(prompt: string): Promise<string> {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 500,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    },
  };
}

/**
 * Create a simple OpenAI provider
 */
export function createOpenAIProvider(apiKey: string): LLMProvider {
  return {
    model: 'gpt-4o-mini',
    async generate(prompt: string): Promise<string> {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    },
  };
}

// ============================================================================
// SINGLETON
// ============================================================================

let llmFallbackInstance: LLMFallbackRouter | null = null;

export function getLLMFallbackRouter(): LLMFallbackRouter {
  if (!llmFallbackInstance) {
    llmFallbackInstance = new LLMFallbackRouter();
  }
  return llmFallbackInstance;
}

export function initializeLLMFallback(
  config?: Partial<LLMFallbackConfig>,
  provider?: LLMProvider
): LLMFallbackRouter {
  llmFallbackInstance = new LLMFallbackRouter(config);

  if (provider) {
    llmFallbackInstance.setLLMProvider(provider);
  } else if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    // Prefer GEMINI_API_KEY for LLM, fallback to GOOGLE_API_KEY
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    llmFallbackInstance.setLLMProvider(createGeminiProvider(geminiKey!));
  } else if (process.env.OPENAI_API_KEY) {
    llmFallbackInstance.setLLMProvider(createOpenAIProvider(process.env.OPENAI_API_KEY));
  }

  return llmFallbackInstance;
}

