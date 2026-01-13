/**
 * VoiceAnalyzer Adapter
 *
 * Adapts existing voice emotion code to the VoiceAnalyzer interface.
 * This bridges the v2 personality system with existing voice processing.
 *
 * @module personality/infrastructure/adapters/voice-analyzer-adapter
 */
import type { VoiceAnalyzer, VoiceFeatures, VoiceEmotionResult, StressAnalysisResult, SilenceAnalysisResult, BreathAnalysisResult, VoiceTone } from '../../domain/interfaces/voice-analyzer.js';
import type { PrimaryEmotion } from '../../domain/model/value-objects/emotional-state.js';
/**
 * VoiceAnalyzerAdapter - Implements VoiceAnalyzer using existing voice processing
 *
 * This is a lightweight adapter that provides reasonable defaults and
 * integrates with existing voice emotion detection where available.
 */
export declare class VoiceAnalyzerAdapter implements VoiceAnalyzer {
    /**
     * Analyze voice for emotional content
     */
    analyzeEmotion(features: VoiceFeatures): Promise<VoiceEmotionResult>;
    /**
     * Analyze voice for stress indicators
     */
    analyzeStress(features: VoiceFeatures): Promise<StressAnalysisResult>;
    /**
     * Classify a silence
     */
    classifySilence(durationMs: number, context: {
        precedingEmotion?: PrimaryEmotion;
        conversationPhase?: 'opening' | 'middle' | 'deep' | 'closing';
        voiceFeaturesBefore?: VoiceFeatures;
    }): Promise<SilenceAnalysisResult>;
    /**
     * Analyze breath patterns
     */
    analyzeBreath(features: VoiceFeatures): Promise<BreathAnalysisResult>;
    /**
     * Detect if voice is breaking
     */
    detectVoiceBreaking(features: VoiceFeatures): Promise<{
        isBreaking: boolean;
        confidence: number;
        severity: 'mild' | 'moderate' | 'severe';
    }>;
    /**
     * Get voice tone classification
     */
    classifyTone(features: VoiceFeatures): Promise<VoiceTone>;
    /**
     * Compare current voice to baseline
     */
    compareToBaseline(currentFeatures: VoiceFeatures, baselineFeatures: VoiceFeatures): Promise<{
        deviations: string[];
        significantChange: boolean;
        suggestedInterpretation?: string;
    }>;
    private estimateArousal;
    private estimateValence;
    private calculateConfidence;
    private classifyPace;
}
export declare function getVoiceAnalyzerAdapter(): VoiceAnalyzerAdapter;
//# sourceMappingURL=voice-analyzer-adapter.d.ts.map