/**
 * Human Personality Context Builder
 *
 * The unified context builder that makes personas feel HUMAN.
 * SUPERHUMAN features through semantic matching and callbacks.
 *
 * FEATURE OWNERSHIP (January 2026):
 * ┌─────────────────────────────────────────────────────────────┐
 * │ Feature                │ Owner           │ Notes            │
 * ├─────────────────────────────────────────────────────────────┤
 * │ Timing Intelligence    │ personality-v2  │ DEFERRED         │
 * │ Anticipation           │ personality-v2  │ NEW in v2        │
 * │ Vulnerability Tracking │ personality-v2  │ MIGRATED to v2   │
 * │ Pattern Detection      │ personality-v2  │ MIGRATED to v2   │
 * │ Growth Milestones      │ personality-v2  │ MIGRATED to v2   │
 * │ Callbacks (smile!)     │ human_personality│ UNIQUE HERE      │
 * │ Moment Sharing         │ human_personality│ UNIQUE HERE      │
 * │ Semantic Search        │ human_personality│ UNIQUE HERE      │
 * │ Key Moment Extraction  │ human_personality│ UNIQUE HERE      │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Philosophy:
 * - Personality through relevance, not repetition
 * - Sometimes the most loving thing is silence
 * - Notice patterns they don't notice themselves
 * - Celebrate growth - humans take it for granted
 *
 * @module intelligence/context-builders/human-personality
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build human personality context
 *
 * Priority order:
 * 1. TIMING INTELLIGENCE - Know how to respond first
 * 2. Callbacks (makes users feel remembered)
 * 3. Emotional patterns (notice what they don't)
 * 4. Growth celebration (remember where they started)
 * 5. Relevant personal moments (when contextually appropriate)
 * 6. Extract callback-worthy moments from user message
 */
declare function buildHumanPersonalityContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Warm up embeddings when a session starts
 * Call this from session initialization
 */
declare function warmUpHumanPersonality(personaId: string): Promise<void>;
export { buildHumanPersonalityContext, warmUpHumanPersonality };
//# sourceMappingURL=human-personality.d.ts.map