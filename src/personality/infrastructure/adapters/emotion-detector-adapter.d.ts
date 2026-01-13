/**
 * EmotionDetector Adapter
 *
 * Adapts existing emotion detection to the EmotionDetector interface.
 * Provides text-based emotion detection for the v2 personality system.
 *
 * @module personality/infrastructure/adapters/emotion-detector-adapter
 */
import type { EmotionDetector, EmotionDetectionInput, EmotionDetectionResult, ContradictionResult, TrajectoryResult, FirstTimeVulnerabilityResult } from '../../domain/interfaces/emotion-detector.js';
import type { PrimaryEmotion, GranularEmotion } from '../../domain/model/value-objects/emotional-state.js';
import type { EmotionalState } from '../../domain/model/value-objects/emotional-state.js';
/**
 * EmotionDetectorAdapter - Text-based emotion detection
 */
export declare class EmotionDetectorAdapter implements EmotionDetector {
    /**
     * Detect emotion from text
     */
    detectEmotion(input: EmotionDetectionInput): Promise<EmotionDetectionResult>;
    /**
     * Detect emotional contradictions
     */
    detectContradiction(text: string, detectedEmotions: PrimaryEmotion[]): Promise<ContradictionResult>;
    /**
     * Analyze emotional trajectory
     */
    analyzeTrajectory(emotionalHistory: EmotionalState[]): Promise<TrajectoryResult>;
    /**
     * Detect first-time vulnerability
     */
    detectFirstTimeVulnerability(text: string, _userId: string): Promise<FirstTimeVulnerabilityResult>;
    /**
     * Extract topics associated with emotions
     */
    extractEmotionalTopics(text: string): Promise<{
        topics: string[];
        topicEmotionPairs: Array<{
            topic: string;
            emotion: PrimaryEmotion;
            confidence: number;
        }>;
    }>;
    /**
     * Detect vague emotions
     */
    detectVagueEmotions(text: string): Promise<{
        vagueTerms: string[];
        suggestedPreciseEmotions: Map<string, GranularEmotion[]>;
        clarifyingQuestions: string[];
    }>;
    /**
     * Detect crisis signals
     */
    detectCrisisSignals(text: string): Promise<{
        isCrisis: boolean;
        severity: 'low' | 'moderate' | 'high' | 'critical';
        signals: string[];
        recommendedResponse: string;
    }>;
    private extractTopics;
}
export declare function getEmotionDetectorAdapter(): EmotionDetectorAdapter;
//# sourceMappingURL=emotion-detector-adapter.d.ts.map