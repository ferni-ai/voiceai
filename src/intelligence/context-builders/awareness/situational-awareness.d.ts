/**
 * Situational Awareness Context Builder
 *
 * Gives the AI awareness of the current state when users ask
 * "what's going on", "what's happening", "catch me up", etc.
 *
 * This makes the AI feel present and aware of:
 * - Current time and day context
 * - User's name and relationship stage
 * - Music playing status
 * - Available capabilities (team members, tools)
 * - Recent conversation highlights
 * - Session duration
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare const AWARENESS_PATTERNS: RegExp[];
declare function buildSituationalAwareness(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildSituationalAwareness, AWARENESS_PATTERNS };
//# sourceMappingURL=situational-awareness.d.ts.map