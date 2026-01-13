/**
 * Pure context-building helpers.
 *
 * These functions are deterministic and side-effect free.
 * They transform user profile and conversation state into context strings
 * for LLM prompt injection.
 *
 * @module context/context-builders
 */
import { type InjectedContent } from '../personas/shared/index.js';
import type { PersonaId } from '../types/branded.js';
import type { UserProfile } from '../types/user-profile.js';
import type { ConversationState, EmotionResult, HandoffRecord, PhaseGuidance } from './types.js';
export declare function buildRelationshipContext(userProfile?: UserProfile): string;
export declare function buildEmotionalContext(userProfile: UserProfile | undefined, emotion?: EmotionResult, state?: ConversationState): string;
export declare function buildTopicContext(userProfile: UserProfile | undefined, state?: ConversationState): string;
export declare function buildPhaseGuidance(guidance: PhaseGuidance): string;
export declare function buildContinuityContext(userProfile?: UserProfile): string;
/**
 * Build a description of the handoff chain for context.
 * Example: "Ferni → Peter (turn 5) → Maya (turn 12)"
 */
export declare function buildHandoffChainDescription(handoffHistory: HandoffRecord[], currentPersona?: PersonaId): string;
/**
 * Get persona names that have been involved in this conversation.
 */
export declare function getInvolvedPersonas(currentPersona: PersonaId, handoffHistory: HandoffRecord[]): PersonaId[];
export interface SharedContentOptions {
    userProfile?: UserProfile;
    currentPersona: PersonaId;
    previousPersona?: PersonaId;
    /** Full handoff history for richer context */
    handoffHistory?: HandoffRecord[];
}
export interface InjectionOptions {
    isGreeting?: boolean;
    isClosing?: boolean;
    isHandoff?: boolean;
    mentionTeammate?: string;
    lastUserMessage?: string;
}
export declare function buildSharedContent(options: SharedContentOptions, injectionOptions?: InjectionOptions): InjectedContent;
export declare function getFormattedSharedContent(options: SharedContentOptions, injectionOptions?: InjectionOptions): string;
//# sourceMappingURL=context-builders.d.ts.map