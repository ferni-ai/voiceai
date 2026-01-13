/**
 * Humanizing Context Builder
 *
 * The orchestrator that brings all humanizing systems together.
 * This is the single entry point for making personas feel ALIVE.
 *
 * Systems orchestrated:
 * 1. Voice Emotion Intelligence - Reading the real emotion behind words
 * 2. Inner World Injection - Sensory memories, contradictions, embodied experience
 * 3. Spontaneous Vulnerability - Micro-stories, hot takes, quirks
 * 4. Persona Mood States - Energy levels, "off days", varying states
 * 5. Relationship Behaviors - Stage-gated permissions and unlocked depth
 *
 * The result: An AI that doesn't just respond correctly,
 * but responds HUMANLY.
 */
import type { PersonaConfig } from '../../../personas/types.js';
import type { BundleRuntimeEngine } from '../../../personas/bundles/runtime.js';
import type { VoiceEmotionResult } from '../../../speech/audio-prosody.js';
import type { EmotionResult } from '../../emotion-detector.js';
import { analyzeVoiceEmotionIntelligence, type VoiceEmotionIntelligence } from '../emotional/voice-emotion-intelligence.js';
import { findInnerWorldInjections, type InnerWorldInjection } from '../intelligence/inner-world-injector.js';
import { selectSpontaneousShare, type SpontaneousShare } from '../personas/spontaneous-vulnerability.js';
import { selectPersonaMood, shouldMoodShift, getMoodShift, type PersonaMood, type MoodState } from '../personas/persona-mood.js';
import { getRelationshipBehaviors, calculateRelationshipStage, mapUserProfileStageToHumanizing, mapHumanizingStageToUserProfile, getRelationshipStageFromProfile, type RelationshipBehaviors, type RelationshipStage, type UserProfileRelationshipStage } from '../relationship/relationship-behaviors.js';
export interface ContextInjection {
    content: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    source: string;
}
export interface HumanizingContext {
    persona: PersonaConfig;
    bundleRuntime?: BundleRuntimeEngine;
    voiceEmotion?: VoiceEmotionResult | null;
    textEmotion?: EmotionResult | null;
    userMessage: string;
    currentTopic?: string;
    recentTopics: string[];
    turnCount: number;
    sessionCount: number;
    userName?: string;
    isVulnerableMoment: boolean;
    userEmotionIntensity: number;
    totalTurns?: number;
    sharedVulnerabilities?: number;
    celebratedTogether?: number;
    difficultConversations?: number;
    userProfileRelationshipStage?: UserProfileRelationshipStage | string;
    previousRelationshipStage?: RelationshipStage;
    usedShareTags?: string[];
    spontaneousShareCount?: number;
    lastMood?: MoodState;
    mentionedPersonalThemes?: Set<string>;
}
export interface HumanizingResult {
    /** All context injections to add to the prompt */
    injections: ContextInjection[];
    /** Voice emotion analysis */
    voiceIntelligence?: VoiceEmotionIntelligence;
    /** Selected inner world content */
    innerWorldContent?: InnerWorldInjection[];
    /** Spontaneous share if selected */
    spontaneousShare?: SpontaneousShare;
    /** Current persona mood */
    mood: PersonaMood;
    /** Relationship behaviors */
    relationship: RelationshipBehaviors;
    /** Whether there's a relationship transition to announce */
    relationshipTransition?: string;
    /** Tags used (for tracking) */
    usedTags: string[];
    /** Debug summary */
    summary: string;
}
/**
 * Build all humanizing context for a conversation turn
 */
export declare function buildHumanizingContext(ctx: HumanizingContext): HumanizingResult;
/**
 * Format all humanizing injections for the prompt
 */
export declare function formatHumanizingForPrompt(result: HumanizingResult): string;
/**
 * Get a quick summary of the humanizing state
 */
export declare function getHumanizingSummary(result: HumanizingResult): string;
export { analyzeVoiceEmotionIntelligence, findInnerWorldInjections, selectSpontaneousShare, selectPersonaMood, getRelationshipBehaviors, calculateRelationshipStage, mapUserProfileStageToHumanizing, mapHumanizingStageToUserProfile, getRelationshipStageFromProfile, shouldMoodShift, getMoodShift, };
export type { VoiceEmotionIntelligence, InnerWorldInjection, SpontaneousShare, PersonaMood, RelationshipBehaviors, RelationshipStage, UserProfileRelationshipStage, MoodState, };
export default buildHumanizingContext;
//# sourceMappingURL=humanizing.d.ts.map