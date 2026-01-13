/**
 * Predictive Anticipation Engine
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is our most SUPERHUMAN capability: knowing what the user needs
 * BEFORE they say it. This creates the magical "they truly understand me" feeling.
 *
 * @module conversation/predictive-anticipation
 */
import type { EmotionalHistoryEntry, EmotionalPrediction, EmotionalTrajectory, NeedPrediction, PredictContext, PredictedNeed, PredictionResult, ProsodyInput, TopicSequencePrediction, TopicTransition, UserBaseline, VoiceStatePrediction } from './types.js';
export type { EmotionalHistoryEntry, EmotionalPrediction, EmotionalTrajectory, NeedPrediction, PredictContext, PredictedNeed, PredictionResult, ProsodyInput, TopicSequencePrediction, TopicTransition, UserBaseline, VoiceStatePrediction, };
export declare class PredictiveAnticipationEngine {
    private topicTransitions;
    private currentTopic;
    private topicHistory;
    private emotionalHistory;
    private needHistory;
    private voiceStateHistory;
    private turnCount;
    private sessionStartTime;
    private userId;
    private userBaseline;
    constructor(sessionId: string, userId?: string);
    /**
     * Process a turn and get predictions
     */
    predict(userMessage: string, context: PredictContext): PredictionResult;
    recordPredictionOutcome(predictionType: 'need' | 'topic' | 'emotional', wasCorrect: boolean): void;
    updateBaseline(baseline: Partial<UserBaseline>): void;
    reset(): void;
    private predictVoiceState;
    private recordTopicTransition;
    private predictNextTopic;
    private predictNeed;
    private recordEmotionalState;
    private predictEmotionalTrajectory;
    private calculateSlope;
    private detectCycling;
    private generateSuggestions;
    private calculateOverallConfidence;
    exportLearning(): {
        topicTransitions: TopicTransition[];
        baseline: UserBaseline;
    };
    importLearning(data: {
        topicTransitions?: TopicTransition[];
        baseline?: Partial<UserBaseline>;
    }): void;
    getState(): {
        turnCount: number;
        currentTopic: string | null;
        topicHistory: string[];
        emotionalHistory: EmotionalHistoryEntry[];
        topicTransitions: TopicTransition[];
    };
}
export declare function getPredictiveAnticipationEngine(sessionId: string, userId?: string): PredictiveAnticipationEngine;
export declare function resetPredictiveAnticipationEngine(sessionId: string, userId?: string): void;
export declare function clearPredictiveAnticipationEngine(sessionId: string, userId?: string): void;
export declare function getActivePredictiveAnticipationCount(): number;
export default PredictiveAnticipationEngine;
//# sourceMappingURL=index.d.ts.map