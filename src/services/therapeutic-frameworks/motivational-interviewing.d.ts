/**
 * Motivational Interviewing
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * MI is a collaborative conversation style that strengthens a person's
 * own motivation for change. It's not about convincing—it's about evoking.
 *
 * PHILOSOPHY:
 * People don't change because you tell them to. They change when they
 * hear themselves say why they want to change. MI helps them get there.
 *
 * PERSISTENCE: Change talk history is persisted to Firestore.
 *
 * @module TherapeuticFrameworks/MotivationalInterviewing
 */
import type { ChangeTalk, ChangeTalkInstance } from './types.js';
/**
 * Patterns for detecting change talk (DARN-CAT: Desire, Ability, Reasons, Need, Commitment, Activation, Taking Steps).
 */
export declare const CHANGE_TALK_PATTERNS: Record<ChangeTalk, RegExp[]>;
/**
 * Detect change talk in user speech.
 */
export declare function detectChangeTalk(text: string, topic?: string): ChangeTalkInstance[];
/**
 * Get the strongest change talk type from a set of instances.
 */
export declare function getStrongestChangeTalk(instances: ChangeTalkInstance[]): ChangeTalk | null;
/**
 * Detect sustain talk (resistance to change).
 */
export declare function detectSustainTalk(text: string): {
    detected: boolean;
    patterns: string[];
};
/**
 * Generate OARS-style responses.
 * O = Open questions
 * A = Affirmations
 * R = Reflections
 * S = Summaries
 */
/**
 * Open questions to evoke change talk.
 */
export declare const OPEN_QUESTIONS: Record<ChangeTalk | 'general', string[]>;
/**
 * Affirmations - statements that recognize strengths.
 */
export declare const AFFIRMATIONS: string[];
/**
 * Reflection templates (simple, amplified, double-sided).
 */
export interface Reflection {
    type: 'simple' | 'amplified' | 'double_sided';
    template: string;
    whenToUse: string;
}
export declare const REFLECTION_TEMPLATES: Reflection[];
/**
 * Generate an OARS response based on context.
 */
export declare function generateOARSResponse(context: {
    changeTalk?: ChangeTalkInstance[];
    sustainTalk?: string[];
    emotion?: string;
    topic?: string;
    recentResponses?: string[];
}): OARSResponse;
export interface OARSResponse {
    type: 'reflect_then_question' | 'affirmation' | 'open_question' | 'double_sided_reflection' | 'summary';
    response: string;
    followUp?: string;
    strategy: string;
}
/**
 * Flush persistence
 */
export declare function flushMotivationalInterviewingPersistence(): Promise<void>;
/**
 * Shutdown motivational interviewing service
 */
export declare function shutdownMotivationalInterviewing(): Promise<void>;
/**
 * Record change talk for a user.
 */
export declare function recordChangeTalk(userId: string, instances: ChangeTalkInstance[]): void;
/**
 * Get change talk history for a user.
 */
export declare function getChangeTalkHistory(userId: string): ChangeTalkInstance[];
/**
 * Get topics with the most change talk.
 */
export declare function getTopChangeTalkTopics(userId: string, limit?: number): string[];
/**
 * Analyze ambivalence - topics with both change talk and sustain talk.
 */
export declare function analyzeAmbivalence(userId: string): string[];
/**
 * Build MI context for LLM.
 */
export declare function buildMIContext(userId: string, userText: string, topic?: string): string | null;
//# sourceMappingURL=motivational-interviewing.d.ts.map