/**
 * Progressive Tool Executor
 *
 * Executes tools with progressive feedback to the user.
 * "Better than human" means: never leave the user wondering what's happening.
 *
 * Philosophy:
 * - Fast responses (< 1.5s): No feedback needed, feels instant
 * - Normal responses (1.5-4s): Brief acknowledgment "Let me check..."
 * - Slow responses (4-8s): Update "Still working on that..."
 * - Timeout (> 8s): Return cached/partial data with apology
 */
import { type ProgressiveExecutionConfig, type ProgressiveResult, type FeedbackCallback } from './types.js';
/**
 * Natural acknowledgment phrases - varies to avoid robotic repetition
 *
 * HUMANIZATION FIX: Removed "Let me see/check/find" patterns - too voice-assistant-y.
 * Keep simple confirmations that don't sound like Alexa/Siri.
 */
declare const ACKNOWLEDGMENTS: Record<string, string[]>;
/**
 * Update phrases when taking longer than expected
 */
declare const UPDATES: Record<string, string[]>;
/**
 * Apology phrases when we have to give up or use fallback
 */
declare const APOLOGIES: Record<string, string[]>;
export declare const DEFAULT_PROGRESSIVE_CONFIG: ProgressiveExecutionConfig;
/**
 * Execute a tool with progressive feedback
 *
 * @param toolName - Name of the tool being executed
 * @param executor - The actual execution function
 * @param sendFeedback - Callback to send feedback to user
 * @param config - Optional configuration overrides
 */
export declare function executeWithProgressiveFeedback<T>(toolName: string, executor: () => Promise<T>, sendFeedback?: FeedbackCallback, config?: Partial<ProgressiveExecutionConfig>): Promise<ProgressiveResult<T>>;
/**
 * Create a progressive version of any async function
 *
 * @example
 * const progressiveGetNews = makeProgressive('getNews', getNews);
 * const result = await progressiveGetNews(topic, sendFeedback);
 */
export declare function makeProgressive<TArgs extends unknown[], TResult>(toolName: string, fn: (...args: TArgs) => Promise<TResult>, config?: Partial<ProgressiveExecutionConfig>): (sendFeedback: FeedbackCallback | undefined, ...args: TArgs) => Promise<ProgressiveResult<TResult>>;
export { ACKNOWLEDGMENTS, UPDATES, APOLOGIES };
//# sourceMappingURL=progressive-executor.d.ts.map