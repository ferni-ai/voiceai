/**
 * Shared Personality Context Assembler
 *
 * Gathers ALL contextual signals to enable "Better Than Human" personality composition.
 * This is the 8-dimensional sensing layer that makes expressions feel alive.
 *
 * Dimensions:
 * 1. Temporal (time of day, day of week, season)
 * 2. Emotional (current, trajectory, intensity, distress)
 * 3. Conversational (momentum, topic, turn count)
 * 4. Relational (stage, history, shared vulnerability)
 * 5. Prosodic (speech pace, pauses, energy level)
 * 6. Topical (current, shift detection, user mentions)
 * 7. Behavioral (what user just shared, personal sharing)
 * 8. Learned (user resonance profile from cross-session)
 *
 * Generalized from: personas/bundles/ferni/personality-context-assembler.ts
 *
 * @module personas/shared/personality-context-assembler
 */
import type { PersonalityContext } from './better-than-human-personality.js';
export interface ContextAssemblerInput {
    personaId: string;
    sessionId: string;
    userId?: string;
    turnCount: number;
    userTranscript: string;
    voiceEmotion?: {
        primary?: string;
        confidence?: number;
        arousal?: number;
        valence?: number;
    };
    speechRateWPM?: number;
    pauseBeforeMs?: number;
    textEmotion?: {
        primary?: string;
        intensity?: number;
        distressLevel?: number;
    };
    conversationMomentum?: 'opening' | 'building' | 'cruising' | 'winding_down' | 'peaking' | 'intimate' | 'closing' | 'stalled';
    currentTopics?: string[];
    lastTopics?: string[];
    relationshipStage?: string;
    totalConversations?: number;
    sharedVulnerabilities?: number;
    previousTurns?: Array<{
        userTranscript: string;
        speechRate?: number;
        pauseBefore?: number;
        voiceEmotion?: string;
        topics?: string[];
        timestamp: number;
    }>;
}
type TimeOfDay = 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night' | 'late_night';
type Season = 'spring' | 'summer' | 'fall' | 'winter';
declare function getTimeOfDay(): TimeOfDay;
declare function getSeason(): Season;
declare function detectTopicShift(input: ContextAssemblerInput): boolean;
type UserSharingType = 'win' | 'struggle' | 'question' | 'story' | 'feeling' | 'request';
declare function detectUserSharingType(transcript: string): UserSharingType | undefined;
declare function isPersonalSharing(transcript: string, distressLevel?: number): boolean;
declare function isHeavyTopic(transcript: string, distressLevel?: number): boolean;
/**
 * Assemble full 8-dimensional personality context from available signals.
 * This is the foundation for "Better Than Human" personality composition.
 */
export declare function assemblePersonalityContext(input: ContextAssemblerInput): PersonalityContext;
export declare const sharedContextAssembler: {
    assemble: typeof assemblePersonalityContext;
    getTimeOfDay: typeof getTimeOfDay;
    getSeason: typeof getSeason;
    detectTopicShift: typeof detectTopicShift;
    detectUserSharingType: typeof detectUserSharingType;
    isPersonalSharing: typeof isPersonalSharing;
    isHeavyTopic: typeof isHeavyTopic;
};
export default sharedContextAssembler;
//# sourceMappingURL=personality-context-assembler.d.ts.map