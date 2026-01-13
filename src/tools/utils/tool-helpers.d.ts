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
import { getLogger as getSafeLogger } from '../../utils/safe-logger.js';
type LoggerType = ReturnType<typeof getSafeLogger>;
export declare function getLogger(): LoggerType;
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
export declare function getUserId(context: ToolExecutionContext | {
    ctx?: unknown;
}, fallback?: string): string;
/**
 * Extract user's name from context
 */
export declare function getUserName(context: ToolExecutionContext): string | undefined;
/**
 * Get full user data object from context
 */
export declare function getUserData(context: ToolExecutionContext): Record<string, unknown>;
/**
 * Generate a unique ID with a prefix
 *
 * Format: {prefix}_{timestamp}_{random}
 * Example: task_1699123456789_a3b7c9d
 *
 * @param prefix - The prefix for the ID (e.g., 'task', 'habit', 'goal')
 * @returns A unique string ID
 */
export declare function generateId(prefix: string): string;
/**
 * Generate a UUID-style ID (for when prefixed IDs aren't appropriate)
 */
export declare function generateUUID(): string;
/**
 * Format a number as currency
 *
 * @param amount - The amount to format
 * @param currency - Currency code (default: 'USD')
 * @returns Formatted currency string (e.g., "$1,234.56")
 */
export declare function formatCurrency(amount: number, currency?: string): string;
/**
 * Format a number as a percentage
 */
export declare function formatPercent(value: number, decimals?: number): string;
/**
 * Format an ordinal number (1st, 2nd, 3rd, etc.)
 */
export declare function ordinal(n: number): string;
/**
 * Format a date for display
 */
export declare function formatDate(date: Date | string, style?: 'short' | 'medium' | 'long'): string;
/**
 * Format relative time (e.g., "2 days ago", "in 3 hours")
 */
export declare function formatRelativeTime(date: Date | string): string;
/**
 * Calculate progress percentage
 */
export declare function calculateProgress(current: number, target: number): number;
/**
 * Create a visual progress bar
 *
 * @param percent - Progress percentage (0-100)
 * @param width - Width in characters (default: 10)
 * @returns Progress bar string (e.g., "████████░░")
 */
export declare function progressBar(percent: number, width?: number): string;
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
export declare function createResponse(options: {
    speech: string;
    display?: string;
    emotion?: ToolResponse['emotion'];
    suggestFollow?: string;
    data?: Record<string, unknown>;
}): ToolResponse;
/**
 * Format a response with optional emoji prefix
 */
export declare function formatWithEmoji(message: string, emoji?: string): string;
/**
 * Format an array as a bulleted list
 */
export declare function bulletList(items: string[], bullet?: string): string;
/**
 * Format an array as a numbered list
 */
export declare function numberedList(items: string[]): string;
/**
 * Truncate a string with ellipsis
 */
export declare function truncate(str: string, maxLength: number): string;
/**
 * Capitalize first letter of each word
 */
export declare function titleCase(str: string): string;
/**
 * Convert camelCase to Title Case
 */
export declare function camelToTitle(str: string): string;
/**
 * Check if a value is a non-empty string
 */
export declare function isNonEmptyString(value: unknown): value is string;
/**
 * Check if a value is a positive number
 */
export declare function isPositiveNumber(value: unknown): value is number;
declare const _default: {
    getLogger: typeof getLogger;
    getUserId: typeof getUserId;
    getUserName: typeof getUserName;
    getUserData: typeof getUserData;
    generateId: typeof generateId;
    generateUUID: typeof generateUUID;
    formatCurrency: typeof formatCurrency;
    formatPercent: typeof formatPercent;
    ordinal: typeof ordinal;
    formatDate: typeof formatDate;
    formatRelativeTime: typeof formatRelativeTime;
    calculateProgress: typeof calculateProgress;
    progressBar: typeof progressBar;
    createResponse: typeof createResponse;
    formatWithEmoji: typeof formatWithEmoji;
    bulletList: typeof bulletList;
    numberedList: typeof numberedList;
    truncate: typeof truncate;
    titleCase: typeof titleCase;
    camelToTitle: typeof camelToTitle;
    isNonEmptyString: typeof isNonEmptyString;
    isPositiveNumber: typeof isPositiveNumber;
};
export default _default;
//# sourceMappingURL=tool-helpers.d.ts.map