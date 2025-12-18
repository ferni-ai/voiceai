/**
 * Function Calling Configuration
 *
 * Centralized configuration for Gemini function calling following Google Vertex AI best practices.
 * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling
 *
 * KEY CONCEPTS:
 * - toolConfig.functionCallingConfig controls HOW the model uses tools
 * - mode: 'AUTO' (default), 'ANY' (force tool use), 'NONE' (disable)
 * - allowedFunctionNames: Constrain which tools the model can call
 *
 * USAGE:
 * ```typescript
 * import { getFunctionCallingConfig, HIGH_STAKES_TOOLS } from './function-calling-config.js';
 *
 * const config = getFunctionCallingConfig('production');
 * // Use config.toolConfig when creating RealtimeModel
 * ```
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Function calling mode as per Vertex AI docs
 */
export type FunctionCallingMode =
  | 'AUTO' // Model decides when to call functions (default)
  | 'ANY' // Model MUST call a function (forces tool use)
  | 'NONE'; // Model cannot call functions

/**
 * Configuration for function calling behavior
 */
export interface FunctionCallingConfig {
  /** The calling mode */
  mode: FunctionCallingMode;

  /**
   * Optional: Restrict which functions can be called.
   * If not specified, all registered functions are available.
   */
  allowedFunctionNames?: string[];
}

/**
 * Full tool configuration for Gemini
 */
export interface GeminiToolConfig {
  functionCallingConfig: FunctionCallingConfig;
}

/**
 * Environment/context for configuration selection
 */
export type ConfigEnvironment =
  | 'production' // Normal conversation
  | 'testing' // E2E tests (may force tool calls)
  | 'crisis' // Crisis mode (restricted tools)
  | 'onboarding' // New user (simpler tool set)
  | 'minimal'; // Debugging (minimal tools)

// ============================================================================
// HIGH-STAKES TOOLS CONFIGURATION
// ============================================================================

/**
 * Tools that have significant consequences and should require confirmation.
 *
 * Per Google docs:
 * "If the model proposes the invocation of a function that would send an order,
 * update a database, or otherwise have significant consequences, validate the
 * function call with the user before executing it."
 */
export const HIGH_STAKES_TOOLS: ReadonlySet<string> = new Set([
  // Communication (sends messages to real people)
  'sendMessage',
  'sendEmail',
  'sendSMS',
  'sendTextMessage',
  'scheduleMessage',
  'postToSocial',

  // Calendar (creates real appointments)
  'createAppointment',
  'scheduleAppointment',
  'cancelAppointment',
  'rescheduleAppointment',
  'bookReservation',

  // Financial (involves money)
  'createPayment',
  'transferMoney',
  'payBill',
  'setUpAutoPay',
  'cancelSubscription',

  // Orders (real-world deliveries)
  'placeOrder',
  'submitOrder',
  'confirmOrder',
  'orderFood',
  'orderGroceries',

  // Contacts (modifies address book)
  'deleteContact',
  'shareContact',

  // Smart Home (physical actions)
  'unlockDoor',
  'disarmAlarm',
  'setThermostat',

  // Data (permanent changes)
  'deleteMemory',
  'forgetMemory',
  'deleteAllData',
  'exportData',
]);

/**
 * Tools that should be confirmed with extra care (double confirmation)
 */
export const CRITICAL_TOOLS: ReadonlySet<string> = new Set([
  'deleteAllData',
  'transferMoney',
  'unlockDoor',
  'disarmAlarm',
]);

/**
 * Check if a tool requires user confirmation before execution
 */
export function requiresConfirmation(toolId: string): boolean {
  return HIGH_STAKES_TOOLS.has(toolId);
}

/**
 * Check if a tool requires extra confirmation (critical action)
 */
export function requiresCriticalConfirmation(toolId: string): boolean {
  return CRITICAL_TOOLS.has(toolId);
}

// ============================================================================
// ENVIRONMENT-SPECIFIC CONFIGURATIONS
// ============================================================================

/**
 * Get function calling configuration for an environment
 */
export function getFunctionCallingConfig(environment: ConfigEnvironment): GeminiToolConfig {
  switch (environment) {
    case 'testing':
      // In tests, we often want to force tool calls for verification
      return {
        functionCallingConfig: {
          mode: 'AUTO',
        },
      };

    case 'crisis':
      // In crisis mode, only allow crisis-related tools
      return {
        functionCallingConfig: {
          mode: 'AUTO',
          allowedFunctionNames: [
            'getCrisisResources',
            'groundingExercise',
            'safetyPlan',
            'emergencyContacts',
            'breathingExercise',
            'rememberAboutUser',
            'recallFromMemory',
          ],
        },
      };

    case 'onboarding':
      // For new users, expose a simpler tool set
      return {
        functionCallingConfig: {
          mode: 'AUTO',
          allowedFunctionNames: [
            'rememberAboutUser',
            'recallFromMemory',
            'getRelationshipSummary',
            'playMusic',
            'getWeather',
            'getCurrentTime',
          ],
        },
      };

    case 'minimal':
      // Minimal mode for debugging
      return {
        functionCallingConfig: {
          mode: 'AUTO',
          allowedFunctionNames: ['playMusic', 'getWeather', 'getCurrentTime', 'rememberAboutUser'],
        },
      };

    case 'production':
    default:
      // Production: AUTO mode, all tools available
      return {
        functionCallingConfig: {
          mode: 'AUTO',
        },
      };
  }
}

// ============================================================================
// DYNAMIC CONFIGURATION
// ============================================================================

/**
 * Build tool config based on runtime context
 */
export function buildToolConfig(options: {
  /** Base environment */
  environment?: ConfigEnvironment;
  /** Override mode */
  modeOverride?: FunctionCallingMode;
  /** Additional allowed tools (merged with environment) */
  additionalTools?: string[];
  /** Tools to exclude */
  excludeTools?: string[];
  /** Is user in crisis? */
  isCrisis?: boolean;
  /** Is this a new user? */
  isNewUser?: boolean;
}): GeminiToolConfig {
  const {
    environment = 'production',
    modeOverride,
    additionalTools = [],
    excludeTools = [],
    isCrisis = false,
    isNewUser = false,
  } = options;

  // Start with base config
  let baseEnv = environment;
  if (isCrisis) baseEnv = 'crisis';
  else if (isNewUser) baseEnv = 'onboarding';

  const baseConfig = getFunctionCallingConfig(baseEnv);

  // Apply overrides
  const config: GeminiToolConfig = {
    functionCallingConfig: {
      mode: modeOverride || baseConfig.functionCallingConfig.mode,
      allowedFunctionNames: baseConfig.functionCallingConfig.allowedFunctionNames,
    },
  };

  // Merge additional tools
  if (additionalTools.length > 0 && config.functionCallingConfig.allowedFunctionNames) {
    const mergedSet = new Set([
      ...config.functionCallingConfig.allowedFunctionNames,
      ...additionalTools,
    ]);
    config.functionCallingConfig.allowedFunctionNames = Array.from(mergedSet);
  }

  // Exclude tools
  if (excludeTools.length > 0 && config.functionCallingConfig.allowedFunctionNames) {
    config.functionCallingConfig.allowedFunctionNames =
      config.functionCallingConfig.allowedFunctionNames.filter(
        (tool) => !excludeTools.includes(tool)
      );
  }

  log.debug(
    {
      environment: baseEnv,
      mode: config.functionCallingConfig.mode,
      allowedCount: config.functionCallingConfig.allowedFunctionNames?.length ?? 'all',
    },
    'Built function calling config'
  );

  return config;
}

// ============================================================================
// THOUGHT SIGNATURES / REASONING PROTOCOL
// ============================================================================

/**
 * Thought signature instructions to append to system prompts.
 *
 * Per Google docs:
 * "Thought signatures should always be used with function calling for best results."
 */
export const THOUGHT_SIGNATURE_PROTOCOL = `
## Tool Usage Protocol

When using tools to help the user:

1. **Understand Intent**: Consider what the user actually needs
2. **Select Appropriately**: Choose the most relevant tool for the situation
3. **Execute Cleanly**: Call the tool with correct, complete parameters
4. **Respond Naturally**: Use the result to craft a helpful, conversational response

### Important Guidelines:
- NEVER announce that you're calling a tool ("Let me use the playMusic function...")
- NEVER speak function names, parameters, or technical details aloud
- ALWAYS call tools silently and respond with the results naturally
- If a tool fails, acknowledge it gracefully and offer alternatives
- For high-stakes actions (sending messages, scheduling, payments), confirm with the user first

### Example Flow:
User: "Play some relaxing jazz"
[Internal: User wants music. Call playMusic with query "relaxing jazz"]
Response: "Here's some smooth jazz to help you unwind."

NOT: "I'll call the playMusic function with query relaxing jazz for you."
`;

/**
 * Get thought signature instructions for a persona
 */
export function getThoughtSignatureProtocol(personaId?: string): string {
  // Base protocol applies to all personas
  let protocol = THOUGHT_SIGNATURE_PROTOCOL;

  // Persona-specific additions could go here
  if (personaId === 'ferni') {
    protocol += `
### Ferni-Specific Guidelines:
- Use memory tools proactively to remember important details
- When user mentions team members, consider if handoff might help
- For emotional moments, prioritize presence over problem-solving
`;
  }

  return protocol;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getFunctionCallingConfig,
  buildToolConfig,
  requiresConfirmation,
  requiresCriticalConfirmation,
  getThoughtSignatureProtocol,
  HIGH_STAKES_TOOLS,
  CRITICAL_TOOLS,
  THOUGHT_SIGNATURE_PROTOCOL,
};
