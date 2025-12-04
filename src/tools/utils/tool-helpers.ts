/**
 * Shared Tool Utilities
 *
 * Common functions used across all tools. Centralizes:
 * - ID generation
 * - User ID extraction from context
 * - Logger access
 * - Response formatting
 * - Currency/date formatting
 *
 * USAGE:
 *   import { getUserId, generateId, formatCurrency } from './utils/tool-helpers.js';
 */

import { log } from '@livekit/agents';

// ============================================================================
// LOGGER
// ============================================================================

/**
 * Get the LiveKit logger instance
 * Cached to avoid repeated calls
 */
let _logger: ReturnType<typeof log> | null = null;

export function getLogger() {
  if (!_logger) {
    try {
      _logger = log();
    } catch {
      // Fallback for testing or non-LiveKit environments
      _logger = {
        debug: console.debug.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        child: () => _logger!,
      } as unknown as ReturnType<typeof log>;
    }
  }
  return _logger;
}

// ============================================================================
// USER ID EXTRACTION
// ============================================================================

/**
 * Standard interface for tool execution context
 */
export interface ToolExecutionContext {
  ctx?: {
    userData?: {
      userId?: string;
      name?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

/**
 * Extract userId from tool context with consistent fallback
 *
 * Works with LiveKit's RunContext or any object with userData
 *
 * @param context - The execution context from tool.execute
 * @param fallback - Default value if userId not found (default: 'default')
 * @returns The user ID string
 *
 * @example
 * execute: async (params, { ctx }) => {
 *   const userId = getUserId({ ctx });
 *   // ...
 * }
 */
export function getUserId(
  context: ToolExecutionContext | { ctx?: unknown },
  fallback: string = 'default'
): string {
  const ctx = context?.ctx as ToolExecutionContext['ctx'];
  return ctx?.userData?.userId || fallback;
}

/**
 * Extract user's name from context
 */
export function getUserName(context: ToolExecutionContext): string | undefined {
  const ctx = context?.ctx as ToolExecutionContext['ctx'];
  return ctx?.userData?.name;
}

/**
 * Get full user data object from context
 */
export function getUserData(context: ToolExecutionContext): Record<string, unknown> {
  const ctx = context?.ctx as ToolExecutionContext['ctx'];
  return ctx?.userData || {};
}

// ============================================================================
// ID GENERATION
// ============================================================================

/**
 * Generate a unique ID with a prefix
 *
 * Format: {prefix}_{timestamp}_{random}
 * Example: task_1699123456789_a3b7c9d
 *
 * @param prefix - The prefix for the ID (e.g., 'task', 'habit', 'goal')
 * @returns A unique string ID
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate a UUID-style ID (for when prefixed IDs aren't appropriate)
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

/**
 * Format a number as currency
 *
 * @param amount - The amount to format
 * @param currency - Currency code (default: 'USD')
 * @returns Formatted currency string (e.g., "$1,234.56")
 */
export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a number as a percentage
 */
export function formatPercent(value: number, decimals: number = 0): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format an ordinal number (1st, 2nd, 3rd, etc.)
 */
export function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/**
 * Format a date for display
 */
export function formatDate(date: Date | string, style: 'short' | 'medium' | 'long' = 'medium'): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  switch (style) {
    case 'short':
      return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
    case 'long':
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    case 'medium':
    default:
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
  }
}

/**
 * Format relative time (e.g., "2 days ago", "in 3 hours")
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.round(diffMs / (1000 * 60));

  if (Math.abs(diffMinutes) < 60) {
    if (diffMinutes === 0) return 'just now';
    return diffMinutes > 0 ? `in ${diffMinutes} minutes` : `${Math.abs(diffMinutes)} minutes ago`;
  }

  if (Math.abs(diffHours) < 24) {
    return diffHours > 0 ? `in ${diffHours} hours` : `${Math.abs(diffHours)} hours ago`;
  }

  if (Math.abs(diffDays) < 7) {
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    if (diffDays === -1) return 'yesterday';
    return diffDays > 0 ? `in ${diffDays} days` : `${Math.abs(diffDays)} days ago`;
  }

  return formatDate(d, 'medium');
}

// ============================================================================
// PROGRESS UTILITIES
// ============================================================================

/**
 * Calculate progress percentage
 */
export function calculateProgress(current: number, target: number): number {
  if (target === 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

/**
 * Create a visual progress bar
 *
 * @param percent - Progress percentage (0-100)
 * @param width - Width in characters (default: 10)
 * @returns Progress bar string (e.g., "████████░░")
 */
export function progressBar(percent: number, width: number = 10): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

// ============================================================================
// RESPONSE FORMATTING
// ============================================================================

/**
 * Standard tool response interface
 * Provides consistent structure for all tool outputs
 */
export interface ToolResponse {
  /** Natural language for TTS/speech */
  speech: string;

  /** Optional rich markdown for display */
  display?: string;

  /** Emotion hint for voice modulation */
  emotion?: 'neutral' | 'happy' | 'excited' | 'concerned' | 'empathetic' | 'celebratory';

  /** Suggested follow-up topic/tool */
  suggestFollow?: string;

  /** Structured data (for programmatic use) */
  data?: Record<string, unknown>;
}

/**
 * Create a standardized tool response
 */
export function createResponse(options: {
  speech: string;
  display?: string;
  emotion?: ToolResponse['emotion'];
  suggestFollow?: string;
  data?: Record<string, unknown>;
}): ToolResponse {
  return {
    speech: options.speech,
    display: options.display,
    emotion: options.emotion || 'neutral',
    suggestFollow: options.suggestFollow,
    data: options.data,
  };
}

/**
 * Format a response with optional emoji prefix
 */
export function formatWithEmoji(message: string, emoji?: string): string {
  return emoji ? `${emoji} ${message}` : message;
}

// ============================================================================
// LIST FORMATTING
// ============================================================================

/**
 * Format an array as a bulleted list
 */
export function bulletList(items: string[], bullet: string = '•'): string {
  return items.map((item) => `${bullet} ${item}`).join('\n');
}

/**
 * Format an array as a numbered list
 */
export function numberedList(items: string[]): string {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Truncate a string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Capitalize first letter of each word
 */
export function titleCase(str: string): string {
  return str.replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Convert camelCase to Title Case
 */
export function camelToTitle(str: string): string {
  return str.replace(/([A-Z])/g, ' $1').trim();
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Check if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if a value is a positive number
 */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && value > 0;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Logger
  getLogger,

  // User context
  getUserId,
  getUserName,
  getUserData,

  // ID generation
  generateId,
  generateUUID,

  // Formatting
  formatCurrency,
  formatPercent,
  ordinal,
  formatDate,
  formatRelativeTime,

  // Progress
  calculateProgress,
  progressBar,

  // Response
  createResponse,
  formatWithEmoji,
  bulletList,
  numberedList,

  // Strings
  truncate,
  titleCase,
  camelToTitle,

  // Validation
  isNonEmptyString,
  isPositiveNumber,
};

