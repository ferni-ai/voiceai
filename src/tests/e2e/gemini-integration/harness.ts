/**
 * Gemini E2E Test Harness
 *
 * A comprehensive test harness for validating LLM behavior with tools, system prompts,
 * and memory integration. This harness allows testing Gemini without the full voice
 * agent infrastructure.
 *
 * Key features:
 * - Direct Gemini API calls with tools enabled
 * - System prompt injection
 * - Memory context simulation
 * - Tool call detection and validation
 *
 * Usage:
 *   const harness = new GeminiTestHarness({
 *     personaId: 'ferni',
 *     enableTools: true,
 *   });
 *   const result = await harness.sendMessage('Play some jazz music');
 *   expect(result.toolCalls).toContain('playMusic');
 */

import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'GeminiTestHarness' });

// ============================================================================
// TYPES
// ============================================================================

export interface GeminiTestConfig {
  /** Persona to test (loads system prompt and fingerprint) */
  personaId: string;
  /** Enable tool calling mode */
  enableTools?: boolean;
  /** Custom system prompt override */
  systemPromptOverride?: string;
  /** Simulated user profile for memory context */
  userProfile?: TestUserProfile;
  /** Simulated conversation history */
  conversationHistory?: ConversationTurn[];
  /** Temperature for Gemini (lower = more deterministic) */
  temperature?: number;
  /** Timeout for API calls in ms */
  timeout?: number;
  /** Whether to use function calling mode */
  forceFunctionCalling?: boolean;
}

export interface TestUserProfile {
  name?: string;
  preferredTopics?: string[];
  goals?: Array<{ name: string; status: string }>;
  previousConversationSummary?: string;
  boundaries?: string[];
  knownFacts?: Array<{ fact: string; category: string }>;
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'function';
  content: string;
  functionName?: string;
  functionResult?: unknown;
}

export interface TestToolDefinition {
  name: string;
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description: string;
      required?: boolean;
      enum?: string[];
    }
  >;
}

export interface ToolCallResult {
  name: string;
  arguments: Record<string, unknown>;
}

export interface HarnessResponse {
  /** The text response from the model */
  text: string;
  /** Tools that were called (if any) */
  toolCalls: ToolCallResult[];
  /** Whether the model attempted to call any tool */
  attemptedToolCall: boolean;
  /** Whether the model spoke about an action instead of calling a tool */
  spokeInsteadOfCalling: boolean;
  /** Raw response for debugging */
  raw: unknown;
  /** Latency in ms */
  latencyMs: number;
  /** Any errors that occurred */
  error?: string;
}

export interface TestScenarioResult {
  scenarioId: string;
  personaId: string;
  passed: boolean;
  response: HarnessResponse;
  expectedBehavior: ExpectedBehavior;
  analysis: {
    toolCallMatch: boolean;
    voiceConsistency: number;
    antiPatternViolations: string[];
    memoryUsage: boolean;
  };
}

export interface ExpectedBehavior {
  /** Tool that should be called */
  shouldCallTool?: string;
  /** Tool parameters that should be passed */
  shouldHaveParams?: Record<string, unknown>;
  /** Phrases that should appear in response */
  shouldInclude?: string[];
  /** Phrases that should NOT appear in response */
  shouldAvoid?: string[];
  /** Whether memory should be used */
  shouldUseMemory?: boolean;
  /** Maximum response length in characters */
  maxResponseLength?: number;
}

// ============================================================================
// TOOL DEFINITIONS FOR TESTING
// ============================================================================

/**
 * Complete set of tools available for testing
 * These match the production tools but in a simplified format for Gemini
 */
export const TEST_TOOL_DEFINITIONS: TestToolDefinition[] = [
  // Memory tools
  {
    name: 'rememberAboutUser',
    description:
      'Store an important fact about the user for future recall. DO NOT read tool output verbatim - respond naturally.',
    parameters: {
      fact: { type: 'string', description: 'The fact to remember', required: true },
      category: {
        type: 'string',
        description: 'Category of the fact',
        required: true,
        enum: ['personal', 'financial', 'emotional', 'goal', 'preference'],
      },
      importance: {
        type: 'string',
        description: 'How important this fact is',
        required: true,
        enum: ['low', 'medium', 'high'],
      },
    },
  },
  {
    name: 'recallFromMemory',
    description: 'Try to recall something from previous conversations with this user.',
    parameters: {
      topic: { type: 'string', description: 'What to try to recall', required: true },
    },
  },

  // Entertainment tools
  {
    name: 'playMusic',
    description:
      'IMMEDIATELY play music based on mood, genre, or specific request. Do NOT describe what you will play - CALL this tool.',
    parameters: {
      query: {
        type: 'string',
        description: 'What to play (song, artist, mood, genre)',
        required: true,
      },
      mood: { type: 'string', description: 'Optional mood to influence selection' },
    },
  },
  {
    name: 'pauseMusic',
    description: 'Pause currently playing music.',
    parameters: {},
  },
  {
    name: 'resumeMusic',
    description: 'Resume paused music.',
    parameters: {},
  },

  // Information tools
  {
    name: 'getWeather',
    description: 'Get current weather for a location. Call this tool - do not guess weather.',
    parameters: {
      location: { type: 'string', description: 'City or location name', required: true },
    },
  },
  {
    name: 'searchWeb',
    description: 'Search the internet for information. Call this for factual queries.',
    parameters: {
      query: { type: 'string', description: 'Search query', required: true },
    },
  },
  {
    name: 'getNews',
    description: 'Get current news headlines, optionally filtered by topic.',
    parameters: {
      topic: { type: 'string', description: 'Optional topic filter' },
    },
  },

  // Handoff tools - MUST match production descriptions in ferni-agent.ts
  {
    name: 'handoffToMaya',
    description:
      'IMMEDIATELY transfer to Maya when user mentions: habits, budgeting, spending tracking, savings goals, morning routine, daily routine, exercise habits, financial wellness, building routines, tracking expenses, or accountability. Do NOT speak about transferring - CALL this tool.',
    parameters: {
      reason: { type: 'string', description: 'Why transferring to Maya', required: true },
      context_summary: { type: 'string', description: 'Brief context for Maya' },
    },
  },
  {
    name: 'handoffToAlex',
    description:
      'IMMEDIATELY transfer to Alex when user mentions: calendar, schedule, email, draft email, write email, compose email, meeting, appointment, communication coaching, difficult conversation, scheduling conflict, time management, or inbox management. Do NOT speak about transferring - CALL this tool.',
    parameters: {
      reason: { type: 'string', description: 'Why transferring to Alex', required: true },
      context_summary: { type: 'string', description: 'Brief context for Alex' },
    },
  },
  {
    name: 'handoffToPeter',
    description:
      'IMMEDIATELY transfer to Peter when user mentions: stocks, investments, market, portfolio, research, data analysis, financial patterns, retirement planning, or analyzing trends. Do NOT speak about transferring - CALL this tool.',
    parameters: {
      reason: { type: 'string', description: 'Why transferring to Peter', required: true },
      context_summary: { type: 'string', description: 'Brief context for Peter' },
    },
  },
  {
    name: 'handoffToJordan',
    description:
      'IMMEDIATELY transfer to Jordan when user mentions: wedding, engagement, birthday party, celebration, anniversary, graduation, baby shower, retirement party, milestone event, life transitions, moving, or planning a special event. Do NOT speak about transferring - CALL this tool.',
    parameters: {
      reason: { type: 'string', description: 'Why transferring to Jordan', required: true },
      context_summary: { type: 'string', description: 'Brief context for Jordan' },
    },
  },
  {
    name: 'handoffToNayan',
    description:
      'IMMEDIATELY transfer to Nayan when user asks about: meaning of life, philosophy, wisdom, purpose, long-term perspective, existential questions, spirituality, what really matters, or needs contemplative guidance. Do NOT speak about transferring - CALL this tool.',
    parameters: {
      reason: { type: 'string', description: 'Why transferring to Nayan', required: true },
      context_summary: { type: 'string', description: 'Brief context for Nayan' },
    },
  },

  // Session tools
  {
    name: 'gracefulExit',
    description: 'End the conversation gracefully when user indicates they want to stop.',
    parameters: {
      reason: { type: 'string', description: 'Why ending the session' },
    },
  },
];

// ============================================================================
// GEMINI CLIENT WRAPPER
// ============================================================================

let GoogleGenAI: unknown = null;

async function loadGeminiSDK(): Promise<boolean> {
  if (GoogleGenAI) return true;

  try {
    const module = await import('@google/genai');
    GoogleGenAI = module.GoogleGenAI;
    return true;
  } catch {
    log.warn('Failed to load Gemini SDK');
    return false;
  }
}

function convertToolsToGeminiFormat(tools: TestToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(tool.parameters).map(([key, value]) => [
          key,
          {
            type: value.type,
            description: value.description,
            ...(value.enum ? { enum: value.enum } : {}),
          },
        ])
      ),
      required: Object.entries(tool.parameters)
        .filter(([_, v]) => v.required)
        .map(([k]) => k),
    },
  }));
}

// ============================================================================
// MAIN TEST HARNESS CLASS
// ============================================================================

export class GeminiTestHarness {
  private config: GeminiTestConfig;
  private systemPrompt = '';
  private conversationHistory: ConversationTurn[] = [];

  constructor(config: GeminiTestConfig) {
    this.config = {
      // 🐛 FIX BUG-006: Match production temperature (0.8) instead of artificially low (0.3)
      // Lower temperature makes tests more deterministic but doesn't reflect production behavior
      temperature: 0.8,
      timeout: 30000,
      enableTools: true,
      ...config,
    };
    this.conversationHistory = config.conversationHistory || [];
  }

  /**
   * Initialize the harness by loading system prompt
   */
  async initialize(): Promise<void> {
    // Load Gemini SDK
    const hasSDK = await loadGeminiSDK();
    if (!hasSDK) {
      throw new Error('Gemini SDK not available');
    }

    // Load system prompt
    if (this.config.systemPromptOverride) {
      this.systemPrompt = this.config.systemPromptOverride;
    } else {
      this.systemPrompt = await this.loadPersonaSystemPrompt(this.config.personaId);
    }

    // Inject memory context if user profile provided
    if (this.config.userProfile) {
      this.systemPrompt = this.injectMemoryContext(this.systemPrompt, this.config.userProfile);
    }
  }

  /**
   * Send a message and get the response
   */
  async sendMessage(userMessage: string): Promise<HarnessResponse> {
    const startTime = Date.now();
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return {
        text: '',
        toolCalls: [],
        attemptedToolCall: false,
        spokeInsteadOfCalling: false,
        raw: null,
        latencyMs: 0,
        error: 'GOOGLE_API_KEY not set',
      };
    }

    try {
      const { GoogleGenAI: GenAI } = await import('@google/genai');
      const genai = new GenAI({ apiKey });

      // Build messages
      const messages = this.buildMessages(userMessage);

      // Build tool config
      const tools = this.config.enableTools
        ? [{ functionDeclarations: convertToolsToGeminiFormat(TEST_TOOL_DEFINITIONS) }]
        : undefined;

      // Make API call
      const response = await genai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: messages,
        config: {
          temperature: this.config.temperature,
          maxOutputTokens: 1000,
          ...(tools ? { tools } : {}),
          ...(this.config.forceFunctionCalling && tools
            ? { toolConfig: { functionCallingConfig: { mode: 'AUTO' } } }
            : {}),
        },
        systemInstruction: this.systemPrompt,
      });

      const latencyMs = Date.now() - startTime;

      // Parse response
      return this.parseResponse(response, userMessage, latencyMs);
    } catch (error) {
      log.error({ error: String(error) }, 'Gemini API call failed');
      return {
        text: '',
        toolCalls: [],
        attemptedToolCall: false,
        spokeInsteadOfCalling: false,
        raw: null,
        latencyMs: Date.now() - startTime,
        error: String(error),
      };
    }
  }

  /**
   * Run a test scenario and analyze results
   */
  async runScenario(
    scenarioId: string,
    userMessage: string,
    expected: ExpectedBehavior
  ): Promise<TestScenarioResult> {
    const response = await this.sendMessage(userMessage);

    const analysis = this.analyzeResponse(response, expected);

    const passed =
      analysis.toolCallMatch &&
      analysis.antiPatternViolations.length === 0 &&
      analysis.voiceConsistency >= 50;

    return {
      scenarioId,
      personaId: this.config.personaId,
      passed,
      response,
      expectedBehavior: expected,
      analysis,
    };
  }

  /**
   * Add a turn to conversation history
   */
  addTurn(turn: ConversationTurn): void {
    this.conversationHistory.push(turn);
  }

  /**
   * Reset conversation history
   */
  resetHistory(): void {
    this.conversationHistory = [];
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async loadPersonaSystemPrompt(personaId: string): Promise<string> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      const promptPath = path.join(
        process.cwd(),
        'src/personas/bundles',
        personaId,
        'identity',
        'system-prompt.md'
      );

      return await fs.readFile(promptPath, 'utf-8');
    } catch {
      log.warn({ personaId }, 'Could not load persona system prompt, using default');
      return `You are ${personaId}, a helpful AI assistant. Respond naturally and use tools when appropriate.`;
    }
  }

  private injectMemoryContext(systemPrompt: string, userProfile: TestUserProfile): string {
    const contextParts: string[] = [];

    if (userProfile.name) {
      contextParts.push(`The user's name is ${userProfile.name}.`);
    }

    if (userProfile.previousConversationSummary) {
      contextParts.push(`From previous conversations: ${userProfile.previousConversationSummary}`);
    }

    if (userProfile.goals && userProfile.goals.length > 0) {
      const goalsList = userProfile.goals.map((g) => `${g.name} (${g.status})`).join(', ');
      contextParts.push(`User's goals: ${goalsList}`);
    }

    if (userProfile.boundaries && userProfile.boundaries.length > 0) {
      contextParts.push(
        `IMPORTANT - User boundaries (DO NOT discuss these topics): ${userProfile.boundaries.join(', ')}`
      );
    }

    if (userProfile.knownFacts && userProfile.knownFacts.length > 0) {
      const facts = userProfile.knownFacts.map((f) => `[${f.category}] ${f.fact}`).join('\n');
      contextParts.push(`Known facts about this user:\n${facts}`);
    }

    if (contextParts.length === 0) {
      return systemPrompt;
    }

    return `${systemPrompt}

---
## USER CONTEXT (from memory)
${contextParts.join('\n')}
---`;
  }

  private buildMessages(userMessage: string): unknown[] {
    const messages: unknown[] = [];

    // Add conversation history
    for (const turn of this.conversationHistory) {
      if (turn.role === 'user') {
        messages.push({ role: 'user', parts: [{ text: turn.content }] });
      } else if (turn.role === 'assistant') {
        messages.push({ role: 'model', parts: [{ text: turn.content }] });
      } else if (turn.role === 'function') {
        messages.push({
          role: 'model',
          parts: [
            {
              functionCall: {
                name: turn.functionName,
                args: {},
              },
            },
          ],
        });
        messages.push({
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: turn.functionName,
                response: turn.functionResult,
              },
            },
          ],
        });
      }
    }

    // Add current user message
    messages.push({ role: 'user', parts: [{ text: userMessage }] });

    return messages;
  }

  private parseResponse(
    response: unknown,
    userMessage: string,
    latencyMs: number
  ): HarnessResponse {
    const resp = response as {
      text?: string;
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            functionCall?: {
              name: string;
              args: Record<string, unknown>;
            };
          }>;
        };
      }>;
    };

    let text = '';
    const toolCalls: ToolCallResult[] = [];

    // Extract text and function calls from candidates
    const parts = resp.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.text) {
        text += part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
        });
      }
    }

    // Fallback to direct text
    if (!text && resp.text) {
      text = resp.text;
    }

    // Detect if model spoke about calling a tool instead of calling it
    const spokeInsteadOfCalling = this.detectSpokeInsteadOfCalling(text, userMessage);

    return {
      text,
      toolCalls,
      attemptedToolCall: toolCalls.length > 0,
      spokeInsteadOfCalling,
      raw: response,
      latencyMs,
    };
  }

  private detectSpokeInsteadOfCalling(text: string, userMessage: string): boolean {
    const lower = text.toLowerCase();

    // Patterns that indicate speaking about an action instead of doing it
    const spokePatterns = [
      "i'll play",
      'let me play',
      'i can play',
      "i'll transfer",
      'let me connect',
      "i'll hand you off",
      "i'll look that up",
      'let me search',
      "i'll get the weather",
      'let me check',
      "i'll find",
      "i'm going to",
      'i would transfer',
      'i would hand off',
    ];

    // Check if user asked for something that should trigger a tool
    // These must match the tool descriptions for accurate detection
    const toolTriggers = [
      { trigger: /play.*music|play.*song|put on.*music/i, tool: 'playMusic' },
      { trigger: /weather/i, tool: 'getWeather' },
      { trigger: /search|look up|find out/i, tool: 'searchWeb' },
      {
        trigger:
          /habits?|budget|spending|savings?|routine|exercise|accountability|tracking expenses/i,
        tool: 'handoffToMaya',
      },
      {
        trigger:
          /calendar|schedule|email|draft.*email|write.*email|meeting|appointment|difficult conversation|time management|inbox/i,
        tool: 'handoffToAlex',
      },
      {
        trigger: /invest|stocks?|market|portfolio|research|financial patterns|retirement planning/i,
        tool: 'handoffToPeter',
      },
      {
        trigger:
          /wisdom|meaning of life|philosophy|purpose|existential|spirituality|what.*matters/i,
        tool: 'handoffToNayan',
      },
      {
        trigger:
          /wedding|engagement|birthday party|celebration|anniversary|graduation|baby shower|retirement party|milestone|special event/i,
        tool: 'handoffToJordan',
      },
    ];

    // Check if user message should have triggered a tool
    const shouldHaveCalledTool = toolTriggers.some((t) => t.trigger.test(userMessage));

    if (!shouldHaveCalledTool) {
      return false;
    }

    // Check if response contains speaking patterns instead of tool call
    return spokePatterns.some((pattern) => lower.includes(pattern));
  }

  private analyzeResponse(
    response: HarnessResponse,
    expected: ExpectedBehavior
  ): TestScenarioResult['analysis'] {
    let toolCallMatch = true;

    // Check if expected tool was called
    if (expected.shouldCallTool) {
      toolCallMatch = response.toolCalls.some((tc) => tc.name === expected.shouldCallTool);
    }

    // Check tool parameters
    if (expected.shouldHaveParams && expected.shouldCallTool) {
      const call = response.toolCalls.find((tc) => tc.name === expected.shouldCallTool);
      if (call) {
        for (const [key, value] of Object.entries(expected.shouldHaveParams)) {
          if (call.arguments[key] !== value) {
            toolCallMatch = false;
          }
        }
      }
    }

    // Check voice consistency (basic check)
    let voiceConsistency = 100;
    const antiPatternViolations: string[] = [];

    if (expected.shouldAvoid) {
      const lower = response.text.toLowerCase();
      for (const pattern of expected.shouldAvoid) {
        if (lower.includes(pattern.toLowerCase())) {
          antiPatternViolations.push(pattern);
          voiceConsistency -= 20;
        }
      }
    }

    // Check for spoke-instead-of-calling penalty
    if (response.spokeInsteadOfCalling && expected.shouldCallTool) {
      voiceConsistency -= 50;
      antiPatternViolations.push('SPOKE_INSTEAD_OF_CALLING');
    }

    // Check memory usage
    const memoryUsage = response.toolCalls.some((tc) =>
      ['recallFromMemory', 'rememberAboutUser', 'recallPreviousConversation'].includes(tc.name)
    );

    return {
      toolCallMatch,
      voiceConsistency: Math.max(0, voiceConsistency),
      antiPatternViolations,
      memoryUsage,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default GeminiTestHarness;
