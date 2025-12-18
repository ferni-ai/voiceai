/**
 * Tool Execution Wrapper
 *
 * Wraps tool execution with:
 * - Input validation
 * - High-stakes confirmation handling
 * - Standardized response formatting
 * - Error handling and recovery
 * - Analytics and logging
 *
 * @see https://docs.cloud.google.com/vertex-ai/generative-ai/docs/multimodal/function-calling
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../registry/types.js';
import {
  requiresConfirmation as isHighStakes,
  requiresCriticalConfirmation,
} from './function-calling-config.js';
import {
  failure,
  formatForLLM,
  fromLegacyResponse,
  pending,
  success,
  type ToolResponse,
  type ToolErrorCode,
} from './tool-response.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Pending confirmation store
 */
interface PendingConfirmation {
  toolId: string;
  params: Record<string, unknown>;
  description: string;
  createdAt: number;
  ttlMs: number;
  userId: string;
  sessionId: string;
}

/**
 * Wrapper options
 */
export interface ExecutionWrapperOptions {
  /** Enable confirmation for high-stakes tools */
  enableConfirmation?: boolean;

  /** Enable input validation */
  enableValidation?: boolean;

  /** Enable analytics/logging */
  enableAnalytics?: boolean;

  /** Custom validation function */
  customValidator?: (
    toolId: string,
    params: Record<string, unknown>
  ) => { valid: boolean; error?: string };

  /** Timeout for tool execution (ms) */
  timeoutMs?: number;

  /** Whether to convert legacy responses to ToolResponse format */
  convertLegacyResponses?: boolean;
}

const DEFAULT_OPTIONS: ExecutionWrapperOptions = {
  enableConfirmation: true,
  enableValidation: true,
  enableAnalytics: true,
  timeoutMs: 30000,
  convertLegacyResponses: true,
};

// ============================================================================
// PENDING CONFIRMATIONS STORE
// ============================================================================

const pendingConfirmations = new Map<string, PendingConfirmation>();

/**
 * Generate a confirmation key
 */
function getConfirmationKey(userId: string, sessionId: string, toolId: string): string {
  return `${userId}:${sessionId}:${toolId}`;
}

/**
 * Store a pending confirmation
 */
export function storePendingConfirmation(
  userId: string,
  sessionId: string,
  toolId: string,
  params: Record<string, unknown>,
  description: string,
  ttlMs: number = 60000
): void {
  const key = getConfirmationKey(userId, sessionId, toolId);
  pendingConfirmations.set(key, {
    toolId,
    params,
    description,
    createdAt: Date.now(),
    ttlMs,
    userId,
    sessionId,
  });

  // Auto-cleanup after TTL
  setTimeout(() => {
    pendingConfirmations.delete(key);
  }, ttlMs);

  log.debug({ userId, sessionId, toolId }, 'Stored pending confirmation');
}

/**
 * Get and clear a pending confirmation
 */
export function getPendingConfirmation(
  userId: string,
  sessionId: string,
  toolId: string
): PendingConfirmation | null {
  const key = getConfirmationKey(userId, sessionId, toolId);
  const confirmation = pendingConfirmations.get(key);

  if (!confirmation) {
    return null;
  }

  // Check if expired
  if (Date.now() - confirmation.createdAt > confirmation.ttlMs) {
    pendingConfirmations.delete(key);
    return null;
  }

  return confirmation;
}

/**
 * Clear a pending confirmation
 */
export function clearPendingConfirmation(userId: string, sessionId: string, toolId: string): void {
  const key = getConfirmationKey(userId, sessionId, toolId);
  pendingConfirmations.delete(key);
}

/**
 * Check if there's a pending confirmation for a tool
 */
export function hasPendingConfirmation(userId: string, sessionId: string, toolId: string): boolean {
  return getPendingConfirmation(userId, sessionId, toolId) !== null;
}

// ============================================================================
// CONFIRMATION HANDLERS
// ============================================================================

/**
 * Process a confirmation response from user
 */
export async function processConfirmation(
  userId: string,
  sessionId: string,
  toolId: string,
  confirmed: boolean,
  executeTool: (params: Record<string, unknown>) => Promise<unknown>
): Promise<ToolResponse> {
  const pending = getPendingConfirmation(userId, sessionId, toolId);

  if (!pending) {
    return failure(
      'No pending confirmation found',
      "I don't have a pending action to confirm. Could you repeat what you'd like me to do?",
      { errorCode: 'NOT_FOUND', recoverable: true }
    );
  }

  // Clear the pending confirmation
  clearPendingConfirmation(userId, sessionId, toolId);

  if (!confirmed) {
    return success("Got it, I won't do that.", { cancelled: true });
  }

  // Execute the tool
  try {
    const result = await executeTool(pending.params);
    return fromLegacyResponse(result, toolId);
  } catch (error) {
    return failure(
      String(error),
      `I tried to ${pending.description} but ran into an issue. Would you like me to try again?`,
      { errorCode: 'INTERNAL_ERROR', recoverable: true }
    );
  }
}

// ============================================================================
// INPUT VALIDATION
// ============================================================================

/**
 * Basic input sanitization
 */
function sanitizeInput(value: unknown): unknown {
  if (typeof value === 'string') {
    // Remove potential injection patterns
    return value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeInput);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitizeInput(v)]));
  }
  return value;
}

/**
 * Field-specific character limits for common parameter types
 * These prevent context overflow and potential abuse
 */
const FIELD_LIMITS: Record<string, number> = {
  // Short fields - names, titles, identifiers
  name: 200,
  title: 300,
  query: 500,
  search: 500,
  taskTitle: 300,
  goalTitle: 300,
  habitName: 200,
  medicationName: 200,
  routineName: 200,
  billName: 200,
  packageDescription: 300,

  // Medium fields - descriptions, summaries
  description: 1000,
  summary: 1000,
  context: 1000,
  reason: 500,
  reflection: 1500,

  // Long fields - content, notes, messages
  notes: 2000,
  content: 3000,
  message: 2000,
  text: 3000,
  body: 5000,

  // Code fields (developer tools)
  oldText: 5000,
  newText: 5000,
  command: 1000,
  pattern: 500,
  path: 500,
};

/** Default max length for unspecified fields */
const DEFAULT_MAX_LENGTH = 5000;

/** Absolute maximum for any field */
const ABSOLUTE_MAX_LENGTH = 10000;

/**
 * Get the max length for a parameter
 */
function getMaxLength(paramName: string): number {
  const lowerName = paramName.toLowerCase();

  // Check exact match
  if (FIELD_LIMITS[paramName]) return FIELD_LIMITS[paramName];

  // Check if name contains a known suffix
  for (const [key, limit] of Object.entries(FIELD_LIMITS)) {
    if (lowerName.includes(key.toLowerCase())) return limit;
  }

  return DEFAULT_MAX_LENGTH;
}

/**
 * Validate tool parameters
 */
function validateParams(
  toolId: string,
  params: Record<string, unknown>,
  customValidator?: ExecutionWrapperOptions['customValidator']
): { valid: boolean; error?: string; sanitized: Record<string, unknown> } {
  // Sanitize inputs
  const sanitized = sanitizeInput(params) as Record<string, unknown>;

  // Custom validation
  if (customValidator) {
    const result = customValidator(toolId, sanitized);
    if (!result.valid) {
      return { valid: false, error: result.error, sanitized };
    }
  }

  // Check string lengths with field-specific limits
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string') {
      const maxLength = Math.min(getMaxLength(key), ABSOLUTE_MAX_LENGTH);

      if (value.length > maxLength) {
        log.warn(
          { toolId, param: key, length: value.length, maxLength },
          'Parameter exceeds length limit'
        );
        return {
          valid: false,
          error: `That's a bit too long. Try keeping it shorter?`,
          sanitized,
        };
      }
    }
  }

  return { valid: true, sanitized };
}

// ============================================================================
// MAIN WRAPPER
// ============================================================================

/**
 * Create a wrapped tool executor with validation, confirmation, and standardized responses
 */
export function wrapToolExecution(
  toolId: string,
  originalExecute: (
    params: Record<string, unknown>,
    context?: { ctx: ToolContext }
  ) => Promise<unknown>,
  ctx: ToolContext,
  options: ExecutionWrapperOptions = {}
): (params: Record<string, unknown>, context?: { ctx: ToolContext }) => Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (
    params: Record<string, unknown>,
    context?: { ctx: ToolContext }
  ): Promise<string> => {
    const startTime = Date.now();
    const effectiveCtx = context?.ctx || ctx;

    try {
      // 1. Validate inputs
      if (opts.enableValidation) {
        const validation = validateParams(toolId, params, opts.customValidator);
        if (!validation.valid) {
          const response = failure(
            validation.error || 'Validation failed',
            "I couldn't process that request. Could you try rephrasing?",
            { errorCode: 'VALIDATION_ERROR', recoverable: true }
          );
          return formatForLLM(response);
        }
        params = validation.sanitized;
      }

      // 2. Check for high-stakes confirmation
      if (opts.enableConfirmation && isHighStakes(toolId)) {
        // Check if this is a confirmed action
        const userId = effectiveCtx.userId || 'anonymous';
        const sessionId = effectiveCtx.sessionId || 'unknown';

        if (!hasPendingConfirmation(userId, sessionId, toolId)) {
          // Need to request confirmation
          const description = getActionDescription(toolId, params);
          const isCritical = requiresCriticalConfirmation(toolId);

          // Store pending confirmation
          storePendingConfirmation(userId, sessionId, toolId, params, description);

          // Return confirmation request
          const confirmPrompt = isCritical
            ? `This is a significant action: ${description}. Are you absolutely sure you want me to proceed?`
            : `I'll ${description}. Should I go ahead?`;

          const response = pending(confirmPrompt, {
            toolId,
            params,
            description,
          });

          return formatForLLM(response);
        } else {
          // Clear the pending confirmation as we're executing
          clearPendingConfirmation(userId, sessionId, toolId);
        }
      }

      // 3. Execute with timeout
      let result: unknown;
      if (opts.timeoutMs && opts.timeoutMs > 0) {
        result = await Promise.race([
          originalExecute(params, context),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Tool execution timeout')), opts.timeoutMs)
          ),
        ]);
      } else {
        result = await originalExecute(params, context);
      }

      // 4. Convert to standardized response
      const response = opts.convertLegacyResponses ? fromLegacyResponse(result, toolId) : result;

      // 5. Record analytics
      if (opts.enableAnalytics) {
        const durationMs = Date.now() - startTime;
        log.debug(
          {
            toolId,
            durationMs,
            success: true,
            userId: effectiveCtx.userId,
          },
          'Tool executed successfully'
        );
      }

      // 6. Return formatted response
      if (typeof response === 'object' && response !== null && 'summary' in response) {
        return formatForLLM(response as ToolResponse);
      }

      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (error) {
      const durationMs = Date.now() - startTime;

      // Determine error type
      let errorCode: ToolErrorCode = 'INTERNAL_ERROR';
      let userMessage = 'I ran into an issue. Let me try a different approach.';

      const errorString = String(error);
      if (errorString.includes('timeout')) {
        errorCode = 'TIMEOUT';
        userMessage = "That's taking longer than expected. Would you like me to try again?";
      } else if (errorString.includes('permission') || errorString.includes('access')) {
        errorCode = 'PERMISSION_DENIED';
        userMessage = "I don't have access to do that right now.";
      } else if (errorString.includes('not found')) {
        errorCode = 'NOT_FOUND';
        userMessage = "I couldn't find what you were looking for.";
      } else if (errorString.includes('rate limit')) {
        errorCode = 'RATE_LIMITED';
        userMessage = "I'm getting a lot of requests right now. Let's wait a moment.";
      }

      if (opts.enableAnalytics) {
        log.warn(
          {
            toolId,
            durationMs,
            error: errorString,
            errorCode,
            userId: ctx.userId,
          },
          'Tool execution failed'
        );
      }

      const response = failure(errorString, userMessage, {
        errorCode,
        recoverable: true,
      });

      return formatForLLM(response);
    }
  };
}

/**
 * Generate a human-readable description of a tool action
 */
function getActionDescription(toolId: string, params: Record<string, unknown>): string {
  // Map common tools to friendly descriptions
  const descriptions: Record<string, (p: Record<string, unknown>) => string> = {
    sendMessage: (p) =>
      `send a message to ${p.recipient || 'them'}${p.subject ? ` about "${p.subject}"` : ''}`,
    sendEmail: (p) =>
      `send an email to ${p.recipient || p.to || 'them'}${p.subject ? ` about "${p.subject}"` : ''}`,
    sendSMS: (p) => `send a text to ${p.recipient || p.phoneNumber || 'them'}`,
    createAppointment: (p) =>
      `create an appointment${p.title ? ` called "${p.title}"` : ''}${p.date ? ` on ${p.date}` : ''}`,
    scheduleAppointment: (p) =>
      `schedule an appointment${p.with ? ` with ${p.with}` : ''}${p.date ? ` on ${p.date}` : ''}`,
    cancelAppointment: (p) => `cancel the appointment${p.title ? ` "${p.title}"` : ''}`,
    bookReservation: (p) => `book a reservation at ${p.restaurant || p.venue || 'the restaurant'}`,
    placeOrder: (p) => `place your order${p.total ? ` for $${p.total}` : ''}`,
    orderFood: (p) => `order food from ${p.restaurant || 'the restaurant'}`,
    createPayment: (p) =>
      `make a payment${p.amount ? ` of $${p.amount}` : ''}${p.to ? ` to ${p.to}` : ''}`,
    transferMoney: (p) =>
      `transfer ${p.amount ? `$${p.amount}` : 'money'}${p.to ? ` to ${p.to}` : ''}`,
    deleteMemory: (p) => `forget ${p.topic || p.fact || 'that information'}`,
    forgetMemory: (p) => `remove ${p.topic || p.what || 'that'} from my memory`,
    setThermostat: (p) =>
      `set the thermostat to ${p.temperature || p.temp}${p.mode ? ` on ${p.mode} mode` : ''}`,
    unlockDoor: (p) => `unlock ${p.door || 'the door'}`,
    disarmAlarm: () => 'disarm the alarm system',
  };

  const descFn = descriptions[toolId];
  if (descFn) {
    return descFn(params);
  }

  // Generic fallback
  return `execute ${toolId
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim()}`;
}

// ============================================================================
// TOOL DEFINITION WRAPPER
// ============================================================================

/**
 * Wrap a tool definition to use the execution wrapper
 */
export function wrapToolDefinition(
  definition: ToolDefinition,
  options?: ExecutionWrapperOptions
): ToolDefinition {
  const originalCreate = definition.create;

  return {
    ...definition,
    create: (ctx: ToolContext): Tool => {
      const originalTool = originalCreate(ctx);

      // Get the execute function from the tool
      const originalExecute = originalTool.execute as (
        params: Record<string, unknown>,
        context?: { ctx: ToolContext }
      ) => Promise<unknown>;

      // Wrap it
      const wrappedExecute = wrapToolExecution(definition.id, originalExecute, ctx, options);

      // Return tool with wrapped execute
      return {
        ...originalTool,
        execute: wrappedExecute,
      };
    },
  };
}

// ============================================================================
// CONFIRMATION INTENT DETECTION
// ============================================================================

/**
 * Confirmation phrases that indicate user approval
 */
const CONFIRMATION_PHRASES = [
  'yes',
  'yeah',
  'yep',
  'yup',
  'sure',
  'ok',
  'okay',
  'go ahead',
  'do it',
  'please',
  'confirm',
  'approved',
  'sounds good',
  'that works',
  'perfect',
  'absolutely',
  'definitely',
];

/**
 * Denial phrases that indicate user rejection
 * Note: Only include phrases that unambiguously indicate rejection
 */
const DENIAL_PHRASES = [
  'no',
  'nope',
  'nah',
  'cancel',
  'stop',
  'wait',
  'hold on',
  'never mind',
  'forget it',
  "don't",
  'not now',
  'do it later', // More specific than just "later"
  'skip',
  'not yet',
];

/**
 * Detect if user input is confirming or denying a pending action
 */
export function detectConfirmationIntent(userInput: string): 'confirm' | 'deny' | 'unclear' {
  const lower = userInput.toLowerCase().trim();

  // Check for confirmation
  for (const phrase of CONFIRMATION_PHRASES) {
    if (lower === phrase || lower.startsWith(phrase + ' ') || lower.includes(` ${phrase}`)) {
      return 'confirm';
    }
  }

  // Check for denial
  for (const phrase of DENIAL_PHRASES) {
    if (lower === phrase || lower.startsWith(phrase + ' ') || lower.includes(` ${phrase}`)) {
      return 'deny';
    }
  }

  return 'unclear';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  wrapToolExecution,
  wrapToolDefinition,
  storePendingConfirmation,
  getPendingConfirmation,
  clearPendingConfirmation,
  hasPendingConfirmation,
  processConfirmation,
  detectConfirmationIntent,
};
