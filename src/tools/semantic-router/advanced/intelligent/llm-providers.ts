/**
 * Real LLM Providers for Intelligent Routing
 *
 * Production-ready LLM providers for:
 * - LLM Fallback Router (tool selection)
 * - ReAct Reasoning Engine (step-by-step reasoning)
 * - Goal Planner (multi-step decomposition)
 *
 * Supported providers:
 * - Google Gemini (2.0 Flash, 1.5 Pro)
 * - OpenAI (GPT-4o, GPT-4o-mini)
 * - Anthropic Claude (3.5 Sonnet, 3 Haiku)
 *
 * @module semantic-router/advanced/intelligent/llm-providers
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { LLMProvider as FallbackLLMProvider, ToolCandidate } from './llm-fallback.js';
import type { ReActLLMProvider, ToolDescription as ReActTool } from './react-reasoning.js';
import type { GoalPlannerLLMProvider, ToolDefinition as PlannerTool, PlanStep } from './goal-planner.js';

const log = createLogger({ module: 'intelligent-llm-providers' });

// ============================================================================
// TYPES
// ============================================================================

export interface LLMProviderConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

/**
 * Tool selection result from LLM
 */
export interface LLMToolSelectionResult {
  selectedToolId: string | null;
  reasoning: string;
  confidence: number;
  needsClarification?: boolean;
  clarificationQuestion?: string | null;
}

/**
 * ReAct reasoning result from LLM
 */
export interface LLMReActResult {
  steps: Array<{
    type: 'thought' | 'action' | 'observation';
    content: string;
    toolId?: string;
    args?: Record<string, unknown>;
  }>;
  finalAnswer?: string;
  suggestedAction?: {
    toolId: string;
    args: Record<string, unknown>;
  };
}

/**
 * Plan creation result from LLM
 */
export interface LLMPlanResult {
  steps: Array<{
    description: string;
    toolId: string | null;
    args: Record<string, unknown>;
    dependsOn: number[];
  }>;
  explanation: string;
  canAutoExecute: boolean;
}

/**
 * Unified LLM provider with all intelligent routing capabilities
 */
export interface UnifiedLLMProvider extends FallbackLLMProvider, ReActLLMProvider, GoalPlannerLLMProvider {
  /** Select the best tool for a user input */
  selectTool(input: string, candidates: ToolCandidate[]): Promise<LLMToolSelectionResult>;
  /** Perform ReAct reasoning to select and explain tool choice */
  reason(input: string, tools: ReActTool[]): Promise<LLMReActResult>;
  /** Create a multi-step plan for complex requests (returns null if planning fails) */
  createPlan(goal: string, tools: PlannerTool[]): Promise<LLMPlanResult | null>;
}

// ============================================================================
// GEMINI PROVIDER
// ============================================================================

const GEMINI_TOOL_SELECTION_PROMPT = `You are a tool selection assistant. Given a user's request and a list of available tools, select the MOST appropriate tool.

User Request: {input}

Available Tools:
{tools}

Instructions:
1. Analyze the user's intent
2. Match to the best tool (or null if none fit)
3. Explain your reasoning briefly
4. Rate your confidence (0-1)

Respond in JSON:
{
  "selectedToolId": "tool_id" or null,
  "reasoning": "Brief explanation",
  "confidence": 0.85,
  "needsClarification": false,
  "clarificationQuestion": null
}`;

const GEMINI_REACT_PROMPT = `You are a reasoning assistant using the ReAct (Reasoning + Acting) framework.

User Request: {input}

Available Tools:
{tools}

Think step by step:
1. THOUGHT: What is the user trying to accomplish?
2. THOUGHT: Which tool(s) might help?
3. ACTION: Select the best tool and arguments

Respond in JSON:
{
  "steps": [
    { "type": "thought", "content": "The user wants to..." },
    { "type": "thought", "content": "The best tool is..." },
    { "type": "action", "toolId": "tool_id", "args": {} }
  ],
  "selectedToolId": "tool_id",
  "confidence": 0.9,
  "reasoning": "Summary of decision"
}`;

const GEMINI_PLAN_PROMPT = `You are a planning assistant. Break down complex requests into sequential tool executions.

User Goal: {goal}

Available Tools:
{tools}

Create a step-by-step plan. Each step should:
1. Use exactly one tool
2. Specify required arguments
3. Note dependencies on previous steps

Respond in JSON:
{
  "goal": "Restated goal",
  "steps": [
    { "toolId": "tool1", "description": "What this step does", "args": {}, "order": 1, "dependsOn": [] },
    { "toolId": "tool2", "description": "What this step does", "args": {}, "order": 2, "dependsOn": [0] }
  ],
  "reasoning": "Why this plan works",
  "confidence": 0.85,
  "estimatedSteps": 2
}`;

/**
 * Create a Gemini-based LLM provider
 */
export function createGeminiProvider(config: LLMProviderConfig): UnifiedLLMProvider {
  const { apiKey, model = 'gemini-2.0-flash-exp', temperature = 0.3, maxTokens = 1024, timeoutMs = 5000 } = config;

  async function callGemini(prompt: string): Promise<string> {
    const startTime = performance.now();

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
              responseMimeType: 'application/json',
            },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      log.debug(
        { model, latencyMs: performance.now() - startTime },
        'Gemini call complete'
      );

      return text;
    } catch (error) {
      log.error({ error, model }, 'Gemini call failed');
      throw error;
    }
  }

  return {
    // Base LLM interface
    model,
    generate: callGemini,

    // LLM Fallback Router interface
    async selectTool(input: string, candidates: ToolCandidate[]) {
      const toolsText = candidates
        .map((t) => `- ${t.toolId}: ${t.description} (confidence: ${t.confidence.toFixed(2)})`)
        .join('\n');

      const prompt = GEMINI_TOOL_SELECTION_PROMPT
        .replace('{input}', input)
        .replace('{tools}', toolsText);

      try {
        const response = await callGemini(prompt);
        const parsed = JSON.parse(response);

        return {
          selectedToolId: parsed.selectedToolId,
          reasoning: parsed.reasoning || '',
          confidence: parsed.confidence || 0.5,
          needsClarification: parsed.needsClarification || false,
          clarificationQuestion: parsed.clarificationQuestion,
        };
      } catch (error) {
        log.warn({ error }, 'Failed to parse Gemini tool selection response');
        return {
          selectedToolId: candidates[0]?.toolId || null,
          reasoning: 'Fallback to highest confidence candidate',
          confidence: candidates[0]?.confidence || 0,
          needsClarification: false,
        };
      }
    },

    // ReAct Reasoning interface
    async reason(input: string, tools: ReActTool[], context?: Record<string, unknown>) {
      const toolsText = tools
        .map((t) => `- ${t.id}: ${t.description}`)
        .join('\n');

      const prompt = GEMINI_REACT_PROMPT
        .replace('{input}', input)
        .replace('{tools}', toolsText);

      try {
        const response = await callGemini(prompt);
        const parsed = JSON.parse(response);

        return {
          steps: parsed.steps || [],
          selectedToolId: parsed.selectedToolId,
          selectedArgs: parsed.steps?.find((s: { type: string; args?: Record<string, unknown> }) => s.type === 'action')?.args || {},
          confidence: parsed.confidence || 0.5,
          reasoning: parsed.reasoning || '',
        };
      } catch (error) {
        log.warn({ error }, 'Failed to parse Gemini reasoning response');
        return {
          steps: [{ type: 'thought', content: 'Unable to reason about this request' }],
          selectedToolId: null,
          selectedArgs: {},
          confidence: 0,
          reasoning: 'Reasoning failed',
        };
      }
    },

    // Goal Planner interface
    async createPlan(goal: string, tools: PlannerTool[], context?: Record<string, unknown>) {
      const toolsText = tools
        .map((t) => {
          const params = t.parameters?.map((p) => `${p.name}${p.required ? '*' : ''}`).join(', ') || '';
          return `- ${t.id}: ${t.description} (params: ${params || 'none'})`;
        })
        .join('\n');

      const prompt = GEMINI_PLAN_PROMPT
        .replace('{goal}', goal)
        .replace('{tools}', toolsText);

      try {
        const response = await callGemini(prompt);
        const parsed = JSON.parse(response);

        return {
          steps: (parsed.steps || []).map((s: { toolId?: string; description?: string; args?: Record<string, unknown>; dependsOn?: number[] }, i: number) => ({
            toolId: s.toolId || null,
            description: s.description || '',
            args: s.args || {},
            dependsOn: s.dependsOn || [],
          })),
          explanation: parsed.reasoning || '',
          canAutoExecute: parsed.confidence > 0.8,
        };
      } catch (error) {
        log.warn({ error }, 'Failed to parse Gemini plan response');
        return null;
      }
    },
  };
}

// ============================================================================
// OPENAI PROVIDER
// ============================================================================

const OPENAI_SYSTEM_PROMPT = `You are a precise tool selection and planning assistant. Always respond with valid JSON.`;

/**
 * Create an OpenAI-based LLM provider
 */
export function createOpenAIProvider(config: LLMProviderConfig): UnifiedLLMProvider {
  const { apiKey, model = 'gpt-4o-mini', temperature = 0.3, maxTokens = 1024, timeoutMs = 5000 } = config;

  async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<string> {
    const startTime = performance.now();

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';

      log.debug(
        { model, latencyMs: performance.now() - startTime },
        'OpenAI call complete'
      );

      return text;
    } catch (error) {
      log.error({ error, model }, 'OpenAI call failed');
      throw error;
    }
  }

  return {
    // Base LLM interface
    model,
    generate: (prompt: string) => callOpenAI(OPENAI_SYSTEM_PROMPT, prompt),

    async selectTool(input: string, candidates: ToolCandidate[]) {
      const toolsText = candidates
        .map((t) => `- ${t.toolId}: ${t.description}`)
        .join('\n');

      const prompt = `Select the best tool for this request. Respond with JSON: {"selectedToolId": "id", "reasoning": "why", "confidence": 0.9}

Request: ${input}

Tools:
${toolsText}`;

      try {
        const response = await callOpenAI(OPENAI_SYSTEM_PROMPT, prompt);
        const parsed = JSON.parse(response);

        return {
          selectedToolId: parsed.selectedToolId,
          reasoning: parsed.reasoning || '',
          confidence: parsed.confidence || 0.5,
          needsClarification: parsed.needsClarification || false,
          clarificationQuestion: parsed.clarificationQuestion,
        };
      } catch (error) {
        log.warn({ error }, 'Failed to parse OpenAI tool selection response');
        return {
          selectedToolId: candidates[0]?.toolId || null,
          reasoning: 'Fallback to first candidate',
          confidence: candidates[0]?.confidence || 0,
          needsClarification: false,
        };
      }
    },

    async reason(input: string, tools: ReActTool[], context?: Record<string, unknown>) {
      const toolsText = tools.map((t) => `- ${t.id}: ${t.description}`).join('\n');

      const prompt = `Use ReAct reasoning for this request. Respond with JSON: {"steps": [{"type": "thought", "content": "..."}, {"type": "action", "toolId": "...", "args": {}}], "selectedToolId": "...", "confidence": 0.9}

Request: ${input}

Tools:
${toolsText}`;

      try {
        const response = await callOpenAI(OPENAI_SYSTEM_PROMPT, prompt);
        const parsed = JSON.parse(response);

        return {
          steps: parsed.steps || [],
          selectedToolId: parsed.selectedToolId,
          selectedArgs: parsed.steps?.find((s: { type: string; args?: Record<string, unknown> }) => s.type === 'action')?.args || {},
          confidence: parsed.confidence || 0.5,
          reasoning: parsed.reasoning || '',
        };
      } catch (error) {
        log.warn({ error }, 'Failed to parse OpenAI reasoning response');
        return {
          steps: [],
          selectedToolId: null,
          selectedArgs: {},
          confidence: 0,
          reasoning: 'Reasoning failed',
        };
      }
    },

    async createPlan(goal: string, tools: PlannerTool[]) {
      const toolsText = tools.map((t) => `- ${t.id}: ${t.description}`).join('\n');

      const prompt = `Create a step-by-step plan. Respond with JSON: {"steps": [{"toolId": "...", "description": "...", "args": {}, "dependsOn": []}], "explanation": "...", "canAutoExecute": true}

Goal: ${goal}

Tools:
${toolsText}`;

      try {
        const response = await callOpenAI(OPENAI_SYSTEM_PROMPT, prompt);
        const parsed = JSON.parse(response);

        return {
          steps: (parsed.steps || []).map((s: { toolId?: string; description?: string; args?: Record<string, unknown>; dependsOn?: number[] }) => ({
            toolId: s.toolId || null,
            description: s.description || '',
            args: s.args || {},
            dependsOn: s.dependsOn || [],
          })),
          explanation: parsed.explanation || parsed.reasoning || '',
          canAutoExecute: parsed.canAutoExecute ?? parsed.confidence > 0.8,
        };
      } catch (error) {
        log.warn({ error }, 'Failed to parse OpenAI plan response');
        return null;
      }
    },
  };
}

// ============================================================================
// CLAUDE PROVIDER
// ============================================================================

/**
 * Create a Claude-based LLM provider
 */
export function createClaudeProvider(config: LLMProviderConfig): UnifiedLLMProvider {
  const { apiKey, model = 'claude-3-haiku-20240307', temperature = 0.3, maxTokens = 1024, timeoutMs = 5000 } = config;

  async function callClaude(prompt: string): Promise<string> {
    const startTime = performance.now();

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt + '\n\nRespond with valid JSON only.' }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Claude API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      const text = data.content?.[0]?.text || '';

      log.debug(
        { model, latencyMs: performance.now() - startTime },
        'Claude call complete'
      );

      // Extract JSON from response (Claude may include explanation text)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      return jsonMatch ? jsonMatch[0] : text;
    } catch (error) {
      log.error({ error, model }, 'Claude call failed');
      throw error;
    }
  }

  return {
    // Base LLM interface
    model,
    generate: callClaude,

    async selectTool(input: string, candidates: ToolCandidate[]) {
      const toolsText = candidates
        .map((t) => `- ${t.toolId}: ${t.description}`)
        .join('\n');

      const prompt = `Select the best tool for: "${input}"

Tools:
${toolsText}

Respond with: {"selectedToolId": "id", "reasoning": "why", "confidence": 0.9}`;

      try {
        const response = await callClaude(prompt);
        const parsed = JSON.parse(response);

        return {
          selectedToolId: parsed.selectedToolId,
          reasoning: parsed.reasoning || '',
          confidence: parsed.confidence || 0.5,
          needsClarification: parsed.needsClarification || false,
          clarificationQuestion: parsed.clarificationQuestion,
        };
      } catch (error) {
        log.warn({ error }, 'Failed to parse Claude tool selection response');
        return {
          selectedToolId: candidates[0]?.toolId || null,
          reasoning: 'Fallback',
          confidence: 0,
          needsClarification: false,
        };
      }
    },

    async reason(input: string, tools: ReActTool[], context?: Record<string, unknown>) {
      const toolsText = tools.map((t) => `- ${t.id}: ${t.description}`).join('\n');

      const prompt = `Use ReAct reasoning for: "${input}"

Tools:
${toolsText}

Respond with: {"steps": [...], "selectedToolId": "...", "confidence": 0.9}`;

      try {
        const response = await callClaude(prompt);
        const parsed = JSON.parse(response);

        return {
          steps: parsed.steps || [],
          selectedToolId: parsed.selectedToolId,
          selectedArgs: {},
          confidence: parsed.confidence || 0.5,
          reasoning: parsed.reasoning || '',
        };
      } catch (error) {
        return {
          steps: [],
          selectedToolId: null,
          selectedArgs: {},
          confidence: 0,
          reasoning: 'Failed',
        };
      }
    },

    async createPlan(goal: string, tools: PlannerTool[]) {
      const toolsText = tools.map((t) => `- ${t.id}: ${t.description}`).join('\n');

      const prompt = `Create a plan for: "${goal}"

Tools:
${toolsText}

Respond with: {"steps": [{"toolId": "...", "description": "...", "args": {}, "dependsOn": []}], "explanation": "...", "canAutoExecute": true}`;

      try {
        const response = await callClaude(prompt);
        const parsed = JSON.parse(response);

        return {
          steps: (parsed.steps || []).map((s: { toolId?: string; description?: string; args?: Record<string, unknown>; dependsOn?: number[] }) => ({
            toolId: s.toolId || null,
            description: s.description || '',
            args: s.args || {},
            dependsOn: s.dependsOn || [],
          })),
          explanation: parsed.explanation || '',
          canAutoExecute: parsed.canAutoExecute ?? parsed.confidence > 0.8,
        };
      } catch (error) {
        return null;
      }
    },
  };
}

// ============================================================================
// FACTORY
// ============================================================================

export type LLMProviderType = 'gemini' | 'openai' | 'claude';

/**
 * Create LLM provider by type
 */
export function createLLMProvider(
  type: LLMProviderType,
  config: LLMProviderConfig
): UnifiedLLMProvider {
  switch (type) {
    case 'gemini':
      return createGeminiProvider(config);
    case 'openai':
      return createOpenAIProvider(config);
    case 'claude':
      return createClaudeProvider(config);
    default:
      throw new Error(`Unknown LLM provider type: ${type}`);
  }
}

/**
 * Auto-detect and create provider from environment
 */
export function createProviderFromEnv(): UnifiedLLMProvider | null {
  // Prefer GEMINI_API_KEY for LLM, fallback to GOOGLE_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    log.info('Using Gemini provider (auto-detected from GEMINI_API_KEY or GOOGLE_API_KEY)');
    return createGeminiProvider({ apiKey: geminiKey });
  }

  if (process.env.OPENAI_API_KEY) {
    log.info('Using OpenAI provider (auto-detected from OPENAI_API_KEY)');
    return createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    log.info('Using Claude provider (auto-detected from ANTHROPIC_API_KEY)');
    return createClaudeProvider({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  log.warn('No LLM provider configured - LLM fallback will be disabled');
  return null;
}

