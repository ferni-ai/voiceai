/**
 * Context-to-Behavior Translator
 *
 * This module translates old-style context injections into behavioral signals.
 * It serves two purposes:
 *
 * 1. MIGRATION: Allow gradual conversion of existing builders
 * 2. FALLBACK: Handle any context that still uses the old format
 *
 * The translator parses context strings and extracts behavioral intent,
 * converting things like "[EMOTIONAL CONTEXT: User seems sad]" into
 * structured behavioral signals like { tone: 'gentle', style: 'supportive' }.
 *
 * @module intelligence/context-builders/behavioral/translator
 */
import type { BehavioralSignals } from './signals.js';
/**
 * Translate a single context injection string into behavioral signals
 */
export declare function translateContextToSignals(contextString: string, source?: string): BehavioralSignals;
/**
 * Translate multiple context injections into aggregated signals
 */
export declare function translateContextsToSignals(contexts: Array<{
    content: string;
    source?: string;
    priority?: number;
}>): BehavioralSignals[];
import type { ContextBuilderInput, ContextInjection } from '../core/types.js';
/**
 * Wrap a legacy context builder to also emit behavioral signals.
 *
 * This allows gradual migration - the legacy builder still works,
 * but its output is also translated to behavioral signals.
 */
export declare function wrapLegacyBuilder(legacyBuild: (input: ContextBuilderInput) => Promise<ContextInjection[]>, builderName: string): (input: ContextBuilderInput) => Promise<BehavioralSignals[]>;
/**
 * Sanitize a context string to remove any raw facts that might leak.
 *
 * This is a safety net for any context that still makes it to the prompt.
 * It strips specific details while keeping behavioral intent.
 */
export declare function sanitizeContextForSafety(contextString: string): string;
//# sourceMappingURL=translator.d.ts.map