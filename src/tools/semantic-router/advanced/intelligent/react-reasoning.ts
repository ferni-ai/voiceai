/**
 * ReAct Reasoning Engine
 *
 * Implements the ReAct (Reasoning + Acting) paradigm for tool selection.
 * Instead of directly selecting tools, the engine:
 * 1. Thinks about what the user wants
 * 2. Considers available tools
 * 3. Reasons step-by-step
 * 4. Selects the best action
 *
 * This provides:
 * - Explainable decisions
 * - Better handling of complex intents
 * - Ability to chain multiple tools
 *
 * @module semantic-router/advanced/intelligent/react-reasoning
 */

import { createLogger } from '../../../../utils/safe-logger.js';

const log = createLogger({ module: 'react-reasoning' });

// ============================================================================
// TYPES
// ============================================================================

export interface ReActConfig {
  /** Maximum reasoning steps before forcing a decision */
  maxSteps: number;
  /** Enable verbose reasoning output */
  verbose: boolean;
  /** Temperature for reasoning (lower = more deterministic) */
  temperature: number;
  /** Timeout for each reasoning step */
  stepTimeoutMs: number;
  /** Model to use for reasoning */
  model: 'gemini-2.0-flash' | 'gpt-4o-mini' | 'claude-3-haiku';
}

export interface ReasoningStep {
  /** Step number */
  step: number;
  /** Type of step */
  type: 'thought' | 'action' | 'observation';
  /** Content of this step */
  content: string;
  /** Tool selected (if action) */
  toolId?: string;
  /** Arguments extracted (if action) */
  args?: Record<string, unknown>;
  /** Confidence in this step */
  confidence: number;
  /** Time taken for this step */
  durationMs: number;
}

export interface ReActResult {
  /** Final decision */
  decision: {
    /** Tool to use, or null for conversation */
    toolId: string | null;
    /** Extracted arguments */
    args: Record<string, unknown>;
    /** Confidence in decision */
    confidence: number;
    /** Type of action */
    actionType: 'execute' | 'clarify' | 'conversation' | 'chain';
  };
  /** All reasoning steps */
  reasoning: ReasoningStep[];
  /** Human-readable explanation */
  explanation: string;
  /** Should we explain our reasoning to user? */
  shouldExplain: boolean;
  /** Total time taken */
  totalDurationMs: number;
  /** Alternative interpretations */
  alternatives: Array<{
    interpretation: string;
    toolId: string | null;
    probability: number;
  }>;
}

export interface ToolDescription {
  id: string;
  name: string;
  description: string;
  parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
  examples?: string[];
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: ReActConfig = {
  maxSteps: 5,
  verbose: true,
  temperature: 0.3,
  stepTimeoutMs: 2000,
  model: 'gemini-2.0-flash',
};

// ============================================================================
// REACT REASONING ENGINE
// ============================================================================

export class ReActReasoningEngine {
  private config: ReActConfig;
  private llmProvider: ReActLLMProvider | null = null;

  constructor(config: Partial<ReActConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the LLM provider for reasoning
   */
  setLLMProvider(provider: ReActLLMProvider): void {
    this.llmProvider = provider;
    log.info({ model: this.config.model }, 'ReAct LLM provider configured');
  }

  /**
   * Run ReAct reasoning on user input
   */
  async reason(
    userInput: string,
    availableTools: ToolDescription[],
    context?: {
      conversationHistory?: Array<{ role: string; content: string }>;
      userProfile?: { preferences?: string[]; recentTopics?: string[] };
      personaId?: string;
    }
  ): Promise<ReActResult> {
    const startTime = performance.now();
    const steps: ReasoningStep[] = [];

    if (!this.llmProvider) {
      // Return fast fallback without LLM
      return this.fastFallback(userInput, availableTools, startTime);
    }

    // Build initial prompt
    let currentPrompt = this.buildInitialPrompt(userInput, availableTools, context);

    // Reasoning loop
    for (let stepNum = 1; stepNum <= this.config.maxSteps; stepNum++) {
      const stepStart = performance.now();

      try {
        const response = await Promise.race([
          this.llmProvider.generate(currentPrompt),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Step timeout')), this.config.stepTimeoutMs);
          }),
        ]);

        const parsed = this.parseStep(response, stepNum);
        steps.push({
          ...parsed,
          durationMs: performance.now() - stepStart,
        });

        // Check if we have a final action
        if (parsed.type === 'action' && parsed.toolId !== undefined) {
          // We have a decision
          return this.buildResult(steps, startTime, availableTools);
        }

        // Check for conversation decision
        if (
          parsed.type === 'action' &&
          parsed.content.toLowerCase().includes('conversation')
        ) {
          return this.buildResult(steps, startTime, availableTools);
        }

        // Continue reasoning
        currentPrompt = this.buildContinuationPrompt(currentPrompt, response);
      } catch (error) {
        log.warn({ error, step: stepNum }, 'ReAct step failed');
        steps.push({
          step: stepNum,
          type: 'observation',
          content: `Error: ${error instanceof Error ? error.message : 'unknown'}`,
          confidence: 0,
          durationMs: performance.now() - stepStart,
        });
        break;
      }
    }

    // Max steps reached, make final decision
    return this.buildResult(steps, startTime, availableTools);
  }

  /**
   * Quick reasoning for simple, clear-cut cases
   */
  async quickReason(
    userInput: string,
    topCandidate: ToolDescription | null,
    confidence: number
  ): Promise<{ shouldProceed: boolean; reasoning: string }> {
    // Very high confidence → proceed
    if (confidence > 0.92 && topCandidate) {
      return {
        shouldProceed: true,
        reasoning: `High confidence match for "${topCandidate.name}"`,
      };
    }

    // No candidate → conversation
    if (!topCandidate) {
      return {
        shouldProceed: false,
        reasoning: 'No suitable tool found, treating as conversation',
      };
    }

    // Quick heuristics for common patterns
    const quickDecision = this.quickHeuristics(userInput, topCandidate);
    if (quickDecision) {
      return quickDecision;
    }

    // Need full reasoning
    return {
      shouldProceed: false,
      reasoning: 'Uncertain - full reasoning needed',
    };
  }

  /**
   * Fast heuristics for common patterns
   */
  private quickHeuristics(
    userInput: string,
    tool: ToolDescription
  ): { shouldProceed: boolean; reasoning: string } | null {
    const lower = userInput.toLowerCase();

    // Explicit tool invocations
    const explicitPatterns: Array<{ pattern: RegExp; toolPattern: string; reasoning: string }> = [
      {
        pattern: /^play\s+(?:some\s+)?(?:music|song|jazz|rock|classical)/i,
        toolPattern: 'music',
        reasoning: 'Explicit music play request',
      },
      {
        pattern: /^(?:set\s+)?(?:a\s+)?(?:reminder|timer|alarm)\s+/i,
        toolPattern: 'reminder',
        reasoning: 'Explicit reminder/timer request',
      },
      {
        pattern: /^what(?:'s| is)\s+the\s+weather/i,
        toolPattern: 'weather',
        reasoning: 'Explicit weather query',
      },
      {
        pattern: /^(?:call|text|message)\s+/i,
        toolPattern: 'communication',
        reasoning: 'Explicit communication request',
      },
      {
        pattern: /^transfer\s+(?:me\s+)?to\s+/i,
        toolPattern: 'handoff',
        reasoning: 'Explicit persona transfer request',
      },
    ];

    for (const { pattern, toolPattern, reasoning } of explicitPatterns) {
      if (pattern.test(lower) && tool.id.toLowerCase().includes(toolPattern)) {
        return { shouldProceed: true, reasoning };
      }
    }

    // Anti-patterns (things that look like tool calls but aren't)
    const antiPatterns: Array<{ pattern: RegExp; reasoning: string }> = [
      {
        pattern: /^(?:i'm\s+)?(?:dying|killing|dead)\s+(?:here|laughing)?/i,
        reasoning: 'Casual expression, not a crisis',
      },
      {
        pattern: /^(?:that's\s+)?(?:cool|nice|great|awesome)/i,
        reasoning: 'Casual acknowledgment, not a request',
      },
      {
        pattern: /^(?:hmm|um|uh|well|so|okay)/i,
        reasoning: 'Filler word, likely conversation',
      },
    ];

    for (const { pattern, reasoning } of antiPatterns) {
      if (pattern.test(lower)) {
        return { shouldProceed: false, reasoning };
      }
    }

    return null;
  }

  /**
   * Build the initial ReAct prompt
   */
  private buildInitialPrompt(
    userInput: string,
    tools: ToolDescription[],
    context?: {
      conversationHistory?: Array<{ role: string; content: string }>;
      userProfile?: { preferences?: string[]; recentTopics?: string[] };
      personaId?: string;
    }
  ): string {
    const toolList = tools
      .slice(0, 15) // Limit tools to fit in context
      .map(
        (t) =>
          `- **${t.name}** (${t.id}): ${t.description}
    Parameters: ${t.parameters.map((p) => `${p.name}${p.required ? '*' : ''}`).join(', ')}`
      )
      .join('\n');

    const historyStr = context?.conversationHistory?.slice(-3)
      ? context.conversationHistory
          .slice(-3)
          .map((t) => `${t.role}: ${t.content.slice(0, 80)}`)
          .join('\n')
      : 'No recent history';

    return `You are a ReAct (Reasoning and Acting) agent selecting the best tool for a user request.

**User said:** "${userInput}"

**Recent conversation:**
${historyStr}

**Available tools:**
${toolList}

**Instructions:**
Use the ReAct framework: alternate between Thought (reasoning) and Action (decision).

Format your response as:
Thought 1: [Your reasoning about what the user wants]
Thought 2: [Consider which tools could help]
Thought 3: [Evaluate edge cases - is this casual conversation? Is the request clear?]
Action: [Your decision - either "Use tool: {tool_id} with args: {json}" OR "Conversation: {reason}"]

**Key considerations:**
- "I'm dying here" is usually casual, not a crisis
- "Play" could mean music, games, or casual speech
- Questions often need tools (weather, time, lookups)
- Statements of feeling usually need conversation, not tools
- If unclear, say "Clarify: {question}"

Begin your ReAct reasoning:`;
  }

  /**
   * Build continuation prompt after previous steps
   */
  private buildContinuationPrompt(previousPrompt: string, lastResponse: string): string {
    return `${previousPrompt}

${lastResponse}

Continue your reasoning. Remember to eventually reach an Action.`;
  }

  /**
   * Parse a reasoning step from LLM output
   */
  private parseStep(response: string, stepNum: number): Omit<ReasoningStep, 'durationMs'> {
    // Look for Action
    const actionMatch = response.match(/Action:\s*(.+?)(?:\n|$)/i);
    if (actionMatch) {
      const actionContent = actionMatch[1].trim();

      // Check for tool usage
      const toolMatch = actionContent.match(/Use\s+tool:\s*(\w+)(?:\s+with\s+args:\s*(\{.+?\}))?/i);
      if (toolMatch) {
        let args: Record<string, unknown> = {};
        try {
          if (toolMatch[2]) {
            args = JSON.parse(toolMatch[2]);
          }
        } catch {
          // Ignore parse errors for args
        }

        return {
          step: stepNum,
          type: 'action',
          content: actionContent,
          toolId: toolMatch[1],
          args,
          confidence: 0.85,
        };
      }

      // Check for conversation
      if (actionContent.toLowerCase().includes('conversation')) {
        return {
          step: stepNum,
          type: 'action',
          content: actionContent,
          toolId: undefined,
          confidence: 0.8,
        };
      }

      // Check for clarification
      if (actionContent.toLowerCase().includes('clarify')) {
        return {
          step: stepNum,
          type: 'action',
          content: actionContent,
          toolId: '__clarify__',
          confidence: 0.7,
        };
      }
    }

    // Look for Thought
    const thoughtMatch = response.match(/Thought(?:\s*\d+)?:\s*(.+?)(?:\n|$)/i);
    if (thoughtMatch) {
      return {
        step: stepNum,
        type: 'thought',
        content: thoughtMatch[1].trim(),
        confidence: 0.6,
      };
    }

    // Default to observation
    return {
      step: stepNum,
      type: 'observation',
      content: response.slice(0, 200),
      confidence: 0.3,
    };
  }

  /**
   * Build final result from reasoning steps
   */
  private buildResult(
    steps: ReasoningStep[],
    startTime: number,
    availableTools: ToolDescription[]
  ): ReActResult {
    const totalDurationMs = performance.now() - startTime;

    // Find the action step
    const actionStep = steps.find((s) => s.type === 'action');

    // Build explanation from thoughts
    const thoughts = steps.filter((s) => s.type === 'thought');
    const explanation = thoughts.map((t) => t.content).join(' → ');

    // Determine decision
    let decision: ReActResult['decision'];

    if (actionStep?.toolId === '__clarify__') {
      decision = {
        toolId: null,
        args: {},
        confidence: actionStep.confidence,
        actionType: 'clarify',
      };
    } else if (actionStep?.toolId) {
      const validTool = availableTools.find((t) => t.id === actionStep.toolId);
      decision = {
        toolId: validTool ? actionStep.toolId : null,
        args: actionStep.args || {},
        confidence: validTool ? actionStep.confidence : 0.3,
        actionType: validTool ? 'execute' : 'conversation',
      };
    } else {
      decision = {
        toolId: null,
        args: {},
        confidence: 0.7,
        actionType: 'conversation',
      };
    }

    return {
      decision,
      reasoning: steps,
      explanation: explanation || 'No explicit reasoning captured',
      shouldExplain: steps.length > 2 || decision.confidence < 0.7,
      totalDurationMs,
      alternatives: [], // Could extract from reasoning
    };
  }

  /**
   * Fast fallback when no LLM is available
   */
  private fastFallback(
    userInput: string,
    availableTools: ToolDescription[],
    startTime: number
  ): ReActResult {
    // Use heuristics only
    const lower = userInput.toLowerCase();

    // Quick pattern matching
    for (const tool of availableTools) {
      const toolWords = tool.name.toLowerCase().split(/\s+/);
      const inputWords = lower.split(/\s+/);

      const overlap = toolWords.filter((tw) => inputWords.some((iw) => iw.includes(tw))).length;

      if (overlap >= 1 && inputWords[0] === toolWords[0]) {
        return {
          decision: {
            toolId: tool.id,
            args: {},
            confidence: 0.6,
            actionType: 'execute',
          },
          reasoning: [
            {
              step: 1,
              type: 'thought',
              content: `Keyword match: "${inputWords[0]}" matches tool "${tool.name}"`,
              confidence: 0.6,
              durationMs: 1,
            },
          ],
          explanation: 'Fast keyword matching (no LLM)',
          shouldExplain: false,
          totalDurationMs: performance.now() - startTime,
          alternatives: [],
        };
      }
    }

    return {
      decision: {
        toolId: null,
        args: {},
        confidence: 0.5,
        actionType: 'conversation',
      },
      reasoning: [
        {
          step: 1,
          type: 'observation',
          content: 'No LLM available, no keyword matches',
          confidence: 0.5,
          durationMs: 1,
        },
      ],
      explanation: 'Fallback to conversation (no LLM, no matches)',
      shouldExplain: false,
      totalDurationMs: performance.now() - startTime,
      alternatives: [],
    };
  }
}

// ============================================================================
// LLM PROVIDER INTERFACE
// ============================================================================

export interface ReActLLMProvider {
  generate(prompt: string): Promise<string>;
}

// ============================================================================
// SINGLETON
// ============================================================================

let reactEngineInstance: ReActReasoningEngine | null = null;

export function getReActEngine(): ReActReasoningEngine {
  if (!reactEngineInstance) {
    reactEngineInstance = new ReActReasoningEngine();
  }
  return reactEngineInstance;
}

export function initializeReActEngine(
  config?: Partial<ReActConfig>,
  provider?: ReActLLMProvider
): ReActReasoningEngine {
  reactEngineInstance = new ReActReasoningEngine(config);

  if (provider) {
    reactEngineInstance.setLLMProvider(provider);
  }

  return reactEngineInstance;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a human-readable explanation of reasoning
 */
export function explainReasoning(result: ReActResult): string {
  const thoughts = result.reasoning.filter((s) => s.type === 'thought');

  if (thoughts.length === 0) {
    return result.explanation;
  }

  const steps = thoughts.map((t, i) => `${i + 1}. ${t.content}`).join('\n');

  return `Here's how I thought about your request:
${steps}

${result.decision.actionType === 'execute' ? `I decided to use: ${result.decision.toolId}` : "I'll respond conversationally."}`;
}

/**
 * Check if reasoning suggests multi-step action
 */
export function suggestsMultiStep(result: ReActResult): boolean {
  const content = result.reasoning.map((s) => s.content.toLowerCase()).join(' ');
  return (
    content.includes('first') ||
    content.includes('then') ||
    content.includes('after that') ||
    content.includes('multiple')
  );
}

