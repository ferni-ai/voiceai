/**
 * Emotional First Aid - Better Than Human Service
 *
 * What no human friend can do: Be fully present at 3am with perfect calm.
 *
 * Rapid-response protocols for acute emotional moments: panic attacks,
 * overwhelming anxiety, crisis moments. Instant, calm, grounding support.
 *
 * @module services/superhuman/emotional-first-aid
 */
export type CrisisLevel = 'grounding' | 'calming' | 'stabilizing' | 'containing' | 'safety';
export type GroundingTechnique = '5-4-3-2-1' | 'breath-count' | 'body-scan' | 'safe-place' | 'cold-water' | 'name-it' | 'container';
export interface CrisisSignal {
    type: 'voice' | 'text' | 'pattern';
    signal: string;
    severity: CrisisLevel;
    confidence: number;
}
export interface FirstAidResponse {
    level: CrisisLevel;
    technique: GroundingTechnique;
    script: string[];
    voiceTone: 'calm' | 'warm' | 'steady' | 'gentle';
    pacing: 'slow' | 'very_slow' | 'match_user';
    followUp: string;
}
export declare function detectCrisis(transcript: string): CrisisSignal | null;
export declare function detectCrisisFromVoice(voiceSignals: {
    emotion?: string;
    arousal?: number;
    valence?: number;
    hasVoiceStrain?: boolean;
    hasVoiceTremor?: boolean;
    speechRate?: number;
}): CrisisSignal | null;
export declare function getFirstAidResponse(level: CrisisLevel): FirstAidResponse;
export declare function getVoiceInstructions(response: FirstAidResponse): string;
export declare function buildFirstAidContext(crisis: CrisisSignal): string;
export declare const emotionalFirstAid: {
    detectCrisis: typeof detectCrisis;
    detectCrisisFromVoice: typeof detectCrisisFromVoice;
    getResponse: typeof getFirstAidResponse;
    getVoiceInstructions: typeof getVoiceInstructions;
    buildContext: typeof buildFirstAidContext;
};
//# sourceMappingURL=emotional-first-aid.d.ts.map