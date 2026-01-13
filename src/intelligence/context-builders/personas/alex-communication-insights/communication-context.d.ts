/**
 * Communication context analysis for Alex's communication insights.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/communication-context
 */
import type { CommunicationContext, HandoffContextType } from './types.js';
export declare function classifyTopic(topic: string): {
    isDifficult: boolean;
    isBoundary: boolean;
    needsScripting: boolean;
    dynamic: string | null;
};
export declare function analyzeEmotionalStateForCommunication(emotionalState: string): string[];
export declare function buildCommunicationContext(handoffContext?: HandoffContextType): CommunicationContext;
//# sourceMappingURL=communication-context.d.ts.map