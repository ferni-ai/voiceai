/**
 * Physical Presence Context Builder
 *
 * Makes personas feel physically present and embodied:
 * - What they're doing right now (settling in, adjusting glasses, etc.)
 * - Environmental awareness (their space, sounds around them)
 * - Natural physical reactions to conversation
 *
 * This adds "texture" that makes the AI feel like a real person
 * in a real place, not just a disembodied voice.
 *
 * PRIORITY: Bundle data > PERSONA_PRESENCE fallback > DEFAULT actions
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Persona-specific physical presence traits.
 * These make each persona feel uniquely embodied.
 */
declare const PERSONA_PRESENCE: Record<string, {
    settlingIn: string[];
    thinking: string[];
    engaged: string[];
    environment: string[];
    physicalTics: string[];
}>;
/**
 * Determine what physical presence injection to add.
 * This runs occasionally to add texture without being overwhelming.
 *
 * Priority: Bundle sensory-world data > PERSONA_PRESENCE fallback > defaults
 */
declare function buildPhysicalPresence(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildPhysicalPresence, PERSONA_PRESENCE };
//# sourceMappingURL=physical-presence.d.ts.map