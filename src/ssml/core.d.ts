/**
 * SSML Core Functions
 *
 * Main SSML tagging and sanitization functions.
 * These are the primary exports used throughout the application.
 *
 * This is the CANONICAL implementation for SSML processing.
 * Other modules should import from here or from the ssml index.
 *
 * @module ssml/core
 */
import type { SsmlTagOptions } from './types.js';
/**
 * Check if text already contains SSML tags.
 *
 * Uses native Rust regex (memchr + RegexSet) when available for 2-5x speedup.
 * Falls back to JS regex when native module not loaded.
 */
export declare function hasSsmlTags(text: string): boolean;
/**
 * Strip all SSML tags from text, returning plain text.
 *
 * Uses native Rust regex when available for 3-10x speedup on complex SSML.
 * Falls back to JS regex when native module not loaded.
 */
export declare function stripSsmlTags(text: string): string;
/**
 * Sanitize malformed SSML output
 * Fixes corrupted tags and removes stage directions like "*chuckles*"
 *
 * CRITICAL: This is the safety net that prevents stage directions from being spoken.
 * Any text in *asterisks* or [brackets] that isn't valid SSML should be stripped.
 *
 * This is the CANONICAL implementation - other modules should use this.
 */
export declare function sanitizeSsml(text: string): string;
/**
 * Tag text with SSML for natural speech
 *
 * This is the main function used throughout the application.
 * It applies persona-aware SSML tagging to text.
 *
 * @param text - The text to tag
 * @param optionsOrPersonaId - Either a personaId string or an options object
 * @returns Text with SSML tags applied
 */
export declare function tagTextWithSsmlPersonaAware(text: string, optionsOrPersonaId?: string | SsmlTagOptions): string;
//# sourceMappingURL=core.d.ts.map