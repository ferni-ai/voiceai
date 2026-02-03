/**
 * PersonaPlex Tool Executor
 *
 * Handles tool execution outside the PersonaPlex voice loop.
 * Since PersonaPlex doesn't have native function calling, we:
 * 1. Detect tool-triggering phrases in the agent's speech
 * 2. Execute the tool asynchronously
 * 3. Inject the result into the next prompt update
 *
 * This preserves ALL of Ferni's 118 tool domains and semantic routing.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { EventEmitter } from 'events';

// Tool system
import { toolOrchestrator } from '../../../tools/orchestrator/tool-orchestrator.js';
import { getToolsForAgent } from '../../../tools/orchestrator/voice-agent-integration.js';
import type { Tool, ToolContext, ToolDefinition } from '../../../tools/registry/types.js';
import { autoRegisterAllDomains } from '../../../tools/registry/loader.js';

// Semantic routing
import { semanticRouter } from '../../../tools/semantic-router/index.js';

// Types
import type { SessionServices } from '../../../types/session.js';

const log = createLogger({ module: 'personaplex-tools' });

// =============================================================================
// TYPES
// =============================================================================

export interface ToolTrigger {
  /** Pattern to match in agent speech */
  pattern: RegExp;
  /** Tool to execute */
  toolId: string;
  /** Extract parameters from the match */
  extractParams: (match: RegExpMatchArray, context: ToolTriggerContext) => Record<string, unknown>;
  /** Optional confirmation phrase */
  confirmationPhrase?: string;
}

export interface ToolTriggerContext {
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
  /** Persona ID */
  personaId: string;
  /** Last user transcript */
  lastUserTranscript: string;
  /** Session services */
  services: SessionServices;
}

export interface ToolExecutionResult {
  /** Tool that was executed */
  toolId: string;
  /** Was execution successful */
  success: boolean;
  /** Result to inject into context */
  result: string;
  /** Error message if failed */
  error?: string;
  /** Execution time in ms */
  executionTimeMs: number;
}

export interface PendingToolExecution {
  /** Tool ID */
  toolId: string;
  /** Parameters */
  params: Record<string, unknown>;
  /** Trigger phrase */
  triggerPhrase: string;
  /** Timestamp */
  timestamp: number;
}

// =============================================================================
// TOOL TRIGGERS
// =============================================================================

/**
 * Default tool triggers - phrases that indicate the agent wants to use a tool
 */
const DEFAULT_TOOL_TRIGGERS: ToolTrigger[] = [
  // Calendar
  {
    pattern: /let me (check|look at|pull up) (?:your |the )?calendar/i,
    toolId: 'getCalendarEvents',
    extractParams: () => ({ daysAhead: 7 }),
  },
  {
    pattern: /i('ll| will) add (?:that |it )?to your calendar/i,
    toolId: 'createCalendarEvent',
    extractParams: (_, ctx) => ({ description: ctx.lastUserTranscript }),
  },

  // Music
  {
    pattern: /i('ll| will) play (?:some )?(.+?)(?:\s+music)?(?:\s+for you)?$/i,
    toolId: 'playMusic',
    extractParams: (match) => ({ query: match[2]?.trim() || 'relaxing' }),
    confirmationPhrase: 'Let me find something for you...',
  },
  {
    pattern: /let me (find|put on) (?:some )?(.+?)(?:\s+music)?/i,
    toolId: 'playMusic',
    extractParams: (match) => ({ query: match[2]?.trim() || 'relaxing' }),
  },
  {
    pattern: /i('ll| will) (pause|stop) the music/i,
    toolId: 'pauseMusic',
    extractParams: () => ({}),
  },

  // Weather
  {
    pattern: /let me (check|look up|get) (?:the )?weather/i,
    toolId: 'getWeather',
    extractParams: () => ({}),
  },

  // Reminders
  {
    pattern: /i('ll| will) (set|create) (?:a |that )?reminder/i,
    toolId: 'createReminder',
    extractParams: (_, ctx) => ({ text: ctx.lastUserTranscript }),
  },
  {
    pattern: /let me (remind|set a reminder)/i,
    toolId: 'createReminder',
    extractParams: (_, ctx) => ({ text: ctx.lastUserTranscript }),
  },

  // Memory
  {
    pattern: /let me (remember|note|save) that/i,
    toolId: 'saveMemory',
    extractParams: (_, ctx) => ({ content: ctx.lastUserTranscript }),
  },
  {
    pattern: /i('ll| will) (keep that in mind|remember that)/i,
    toolId: 'saveMemory',
    extractParams: (_, ctx) => ({ content: ctx.lastUserTranscript }),
  },

  // Habits
  {
    pattern: /let me (check|see) (?:how )?(?:your |the )?habits/i,
    toolId: 'getHabits',
    extractParams: () => ({}),
  },
  {
    pattern: /i('ll| will) (log|mark|track) that (?:habit|as done)/i,
    toolId: 'logHabitCompletion',
    extractParams: (_, ctx) => ({ habitName: ctx.lastUserTranscript }),
  },

  // Goals
  {
    pattern: /let me (check|see) (?:your |the )?goals/i,
    toolId: 'getGoals',
    extractParams: () => ({}),
  },

  // Contacts
  {
    pattern: /let me (find|look up|check) (?:contact info for |info on )?(.+)/i,
    toolId: 'searchContacts',
    extractParams: (match) => ({ query: match[2]?.trim() }),
  },

  // Phone calls
  {
    pattern: /i('ll| will) (call|dial|reach out to) (.+)/i,
    toolId: 'initiateCall',
    extractParams: (match) => ({ contactName: match[3]?.trim() }),
  },

  // Handoff
  {
    pattern: /let me (get|bring in|connect you with) (maya|peter|alex|jordan|nayan)/i,
    toolId: 'handoff',
    extractParams: (match) => ({ targetPersonaId: match[2]?.toLowerCase() }),
  },
  {
    pattern: /i('ll| will) (hand you off|transfer you|bring in) (maya|peter|alex|jordan|nayan)/i,
    toolId: 'handoff',
    extractParams: (match) => ({ targetPersonaId: match[3]?.toLowerCase() }),
  },
];

// =============================================================================
// TOOL EXECUTOR CLASS
// =============================================================================

export class PersonaPlexToolExecutor extends EventEmitter {
  private triggers: ToolTrigger[];
  private tools: Map<string, Tool> = new Map();
  private pendingExecutions: PendingToolExecution[] = [];
  private executionHistory: ToolExecutionResult[] = [];
  private context: ToolTriggerContext;
  private isInitialized = false;

  constructor(context: ToolTriggerContext) {
    super();
    this.context = context;
    this.triggers = [...DEFAULT_TOOL_TRIGGERS];
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize tool executor with persona-specific tools
   */
  async initialize(personaConfig: {
    id: string;
    displayName?: string;
  }): Promise<void> {
    log.info({ personaId: personaConfig.id }, 'Initializing tool executor');

    // Register all tool domains
    await autoRegisterAllDomains();

    // Get tools for this persona
    const { tools, meta } = await getToolsForAgent({
      persona: personaConfig,
      userId: this.context.userId,
      services: this.context.services,
    });

    // Store tools
    for (const [name, tool] of Object.entries(tools)) {
      this.tools.set(name, tool);
    }

    this.isInitialized = true;

    log.info(
      {
        personaId: personaConfig.id,
        toolCount: this.tools.size,
        triggerCount: this.triggers.length,
      },
      'Tool executor initialized'
    );
  }

  // ===========================================================================
  // TRIGGER DETECTION
  // ===========================================================================

  /**
   * Detect tool triggers in agent speech
   */
  detectTriggers(agentSpeech: string): PendingToolExecution[] {
    const detected: PendingToolExecution[] = [];

    for (const trigger of this.triggers) {
      const match = agentSpeech.match(trigger.pattern);
      if (match) {
        const params = trigger.extractParams(match, this.context);

        detected.push({
          toolId: trigger.toolId,
          params,
          triggerPhrase: match[0],
          timestamp: Date.now(),
        });

        log.debug(
          {
            toolId: trigger.toolId,
            triggerPhrase: match[0],
            params,
          },
          'Tool trigger detected'
        );
      }
    }

    return detected;
  }

  /**
   * Process agent speech and execute any triggered tools
   */
  async processAgentSpeech(speech: string): Promise<ToolExecutionResult[]> {
    const triggers = this.detectTriggers(speech);
    const results: ToolExecutionResult[] = [];

    for (const trigger of triggers) {
      const result = await this.executeTool(trigger.toolId, trigger.params);
      results.push(result);
      this.executionHistory.push(result);
    }

    return results;
  }

  // ===========================================================================
  // TOOL EXECUTION
  // ===========================================================================

  /**
   * Execute a tool by ID
   */
  async executeTool(
    toolId: string,
    params: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    log.info({ toolId, params }, 'Executing tool');

    try {
      // Find the tool
      const tool = this.tools.get(toolId);
      if (!tool) {
        // Try to find via semantic routing
        const matched = await this.findToolSemantically(toolId);
        if (!matched) {
          return {
            toolId,
            success: false,
            result: '',
            error: `Tool not found: ${toolId}`,
            executionTimeMs: Date.now() - startTime,
          };
        }
      }

      // Execute the tool
      const toolToExecute = tool || this.tools.get(toolId);
      if (!toolToExecute) {
        return {
          toolId,
          success: false,
          result: '',
          error: 'Tool not found after semantic search',
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Build execution params
      const execParams = {
        ...params,
        userId: this.context.userId,
        sessionId: this.context.sessionId,
      };

      // Execute
      const result = await (toolToExecute as { execute?: (params: unknown) => Promise<unknown> }).execute?.(execParams);
      const resultString = typeof result === 'string' ? result : JSON.stringify(result);

      const executionResult: ToolExecutionResult = {
        toolId,
        success: true,
        result: resultString,
        executionTimeMs: Date.now() - startTime,
      };

      this.emit('toolExecuted', executionResult);

      log.info(
        {
          toolId,
          success: true,
          executionTimeMs: executionResult.executionTimeMs,
        },
        'Tool executed successfully'
      );

      return executionResult;
    } catch (error) {
      const executionResult: ToolExecutionResult = {
        toolId,
        success: false,
        result: '',
        error: String(error),
        executionTimeMs: Date.now() - startTime,
      };

      this.emit('toolError', executionResult);

      log.error(
        {
          toolId,
          error: String(error),
          executionTimeMs: executionResult.executionTimeMs,
        },
        'Tool execution failed'
      );

      return executionResult;
    }
  }

  /**
   * Find a tool semantically when exact match fails
   */
  private async findToolSemantically(query: string): Promise<string | null> {
    try {
      const matches = await semanticRouter.route(query, {
        maxResults: 1,
        threshold: 0.6,
      });

      if (matches.length > 0) {
        return matches[0].toolId;
      }
    } catch (error) {
      log.error({ error: String(error), query }, 'Semantic tool search failed');
    }

    return null;
  }

  // ===========================================================================
  // CONTEXT INJECTION
  // ===========================================================================

  /**
   * Build context injection from recent tool results
   */
  buildToolResultContext(maxResults: number = 3): string {
    const recentResults = this.executionHistory
      .filter((r) => r.success && r.result)
      .slice(-maxResults);

    if (recentResults.length === 0) {
      return '';
    }

    const resultSections = recentResults.map((r) => {
      return `[${r.toolId}]: ${this.truncateResult(r.result, 200)}`;
    });

    return `
RECENT TOOL RESULTS (you can reference these):
${resultSections.join('\n')}
`;
  }

  /**
   * Truncate a result to a maximum length
   */
  private truncateResult(result: string, maxLength: number): string {
    if (result.length <= maxLength) return result;
    return result.slice(0, maxLength) + '...';
  }

  // ===========================================================================
  // CUSTOM TRIGGERS
  // ===========================================================================

  /**
   * Add a custom tool trigger
   */
  addTrigger(trigger: ToolTrigger): void {
    this.triggers.push(trigger);
    log.debug({ toolId: trigger.toolId }, 'Added custom tool trigger');
  }

  /**
   * Remove a tool trigger by tool ID
   */
  removeTrigger(toolId: string): void {
    this.triggers = this.triggers.filter((t) => t.toolId !== toolId);
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  get toolCount(): number {
    return this.tools.size;
  }

  get triggerCount(): number {
    return this.triggers.length;
  }

  get recentExecutions(): ToolExecutionResult[] {
    return this.executionHistory.slice(-10);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a PersonaPlex tool executor
 */
export function createToolExecutor(
  context: ToolTriggerContext
): PersonaPlexToolExecutor {
  return new PersonaPlexToolExecutor(context);
}

// =============================================================================
// UTILITY: INTENT TO TOOL MAPPING
// =============================================================================

/**
 * Map user intent to tool execution
 * Uses semantic routing to find the best tool for a given intent
 */
export async function mapIntentToTool(
  intent: string,
  context: ToolTriggerContext
): Promise<{ toolId: string; confidence: number } | null> {
  try {
    const matches = await semanticRouter.route(intent, {
      maxResults: 1,
      threshold: 0.6,
    });

    if (matches.length > 0) {
      return {
        toolId: matches[0].toolId,
        confidence: matches[0].score,
      };
    }
  } catch (error) {
    log.error({ error: String(error), intent }, 'Intent mapping failed');
  }

  return null;
}
