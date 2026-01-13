/**
 * Alive Awareness Context Builder
 *
 * Integrates all the systems that make personas feel alive and aware:
 * - Cross-agent memory sharing
 * - Physical state continuity
 * - Metacognitive moments
 * - Mood drift
 * - Temporal anchoring
 * - Genuine curiosity
 * - World awareness
 *
 * This builder runs on each turn and injects relevant context into the prompt.
 */
import type { ContextBuilderInput, ContextInjection } from '../core/types.js';
interface AliveAwarenessInput extends ContextBuilderInput {
    sessionId: string;
    personaId: string;
    turnCount: number;
    currentTopics?: string[];
    userEmotion?: string;
    userEmotionIntensity?: number;
    wasPersonalSharing?: boolean;
    gaveAdvice?: boolean;
    askedQuestion?: boolean;
    toldStory?: boolean;
    lastConversationDate?: Date;
}
interface AliveAwarenessResult {
    injections: ContextInjection[];
    physicalComment?: string;
    metacognitiveComment?: string;
    moodExpression?: string;
    temporalAnchor?: string;
    teamContext?: string;
    curiosityQuestion?: string;
    summary: string;
}
export declare function buildAliveAwarenessContext(input: AliveAwarenessInput): Promise<AliveAwarenessResult>;
/**
 * Format alive awareness for prompt injection
 */
export declare function formatAliveAwarenessForPrompt(result: AliveAwarenessResult): string;
export declare const aliveAwarenessBuilder: {
    name: string;
    priority: number;
    build: typeof buildAliveAwarenessContext;
    format: typeof formatAliveAwarenessForPrompt;
};
export {};
//# sourceMappingURL=alive-awareness.d.ts.map