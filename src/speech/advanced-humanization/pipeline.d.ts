/**
 * Humanization Pipeline
 *
 * Main entry point for the advanced humanization system.
 * Combines all techniques for maximum natural speech effect.
 *
 * @module advanced-humanization/pipeline
 */
import { type HumanizationOptions } from './types.js';
/**
 * Apply full humanization pipeline to text
 *
 * This is the main entry point for the advanced humanization system.
 * It combines all techniques for maximum natural speech effect:
 *
 * 1. **Emotion mapping** - Applies appropriate Cartesia emotion based on context
 * 2. **Natural fillers** - Injects "um", "well", "you know" for spontaneity
 * 3. **Breath group pacing** - Natural pauses at phrase boundaries
 * 4. **Speech rhythm variation** - Prevents monotonous delivery
 *
 * @param text - The text to humanize
 * @param options - Humanization options
 * @returns Humanized text with SSML enhancements
 *
 * @example
 * ```typescript
 * const humanized = humanizeText("I think this is important.", {
 *   personaId: 'ferni',
 *   emotionContext: {
 *     agentIntent: 'explaining',
 *     topicWeight: 'medium',
 *     relationshipStage: 'friend'
 *   }
 * });
 * ```
 */
export declare function humanizeText(text: string, options?: Partial<HumanizationOptions>): string;
//# sourceMappingURL=pipeline.d.ts.map