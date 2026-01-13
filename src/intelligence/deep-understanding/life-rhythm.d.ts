/**
 * Life Rhythm Prediction System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Predicts when someone will need support BEFORE they reach out.
 * Learns the rhythms of their life - Sunday scaries, Monday motivation,
 * end-of-month stress, seasonal patterns, anniversaries.
 *
 * This is superhuman because even close friends forget these patterns.
 * Ferni remembers and reaches out at just the right moment.
 *
 * "Hey, I know Mondays are usually tough for you. Just checking in."
 */
export interface WeeklyPattern {
    /** Sunday night anxiety pattern */
    sundayScaries: {
        detected: boolean;
        severity: number;
        typicalOnsetHour: number;
        topics: string[];
    };
    /** Monday patterns */
    monday: {
        type: 'dread' | 'motivated' | 'neutral';
        energyLevel: number;
        bestSupportTime: number;
    };
    /** Mid-week patterns */
    midweek: {
        wednesdaySlump: boolean;
        peakProductivityDay: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday';
    };
    /** Friday patterns */
    friday: {
        reliefIntensity: number;
        reflectiveEvening: boolean;
    };
    /** Weekend patterns */
    weekend: {
        type: 'restorative' | 'lonely' | 'busy' | 'mixed';
        lonelinessPeak: boolean;
        familyStress: boolean;
    };
    /** Per-day emotional baselines */
    dailyBaselines: Record<number, {
        avgMood: number;
        avgEnergy: number;
        conversationLikelihood: number;
    }>;
}
export interface MonthlyPattern {
    /** Pay day effects */
    payDay: {
        dayOfMonth: number;
        prePayStress: boolean;
        postPayRelief: boolean;
    };
    /** Bill-related stress */
    billStress: {
        stressDays: number[];
        severity: number;
    };
    /** End of month patterns */
    endOfMonth: {
        deadlinePressure: boolean;
        financialAnxiety: boolean;
        reflectionTendency: boolean;
    };
    /** Beginning of month patterns */
    beginningOfMonth: {
        freshStartEnergy: boolean;
        goalSettingTendency: boolean;
    };
}
export interface SeasonalPattern {
    /** Winter patterns */
    winter: {
        seasonalBlues: boolean;
        severity: number;
        peakMonths: number[];
        copingStrategies: string[];
    };
    /** Holiday patterns */
    holidays: {
        stressLevel: number;
        familyDynamics: 'positive' | 'stressful' | 'mixed' | 'lonely';
        peakStressDates: Date[];
        needsExtraSupport: boolean;
    };
    /** Summer patterns */
    summer: {
        moodLift: boolean;
        vacationAnxiety: boolean;
        socialPressure: boolean;
    };
    /** Transition periods */
    transitions: {
        fallAnxiety: boolean;
        springOptimism: boolean;
    };
}
export interface AnniversaryDate {
    /** Date (month/day) */
    date: {
        month: number;
        day: number;
    };
    /** Type of anniversary */
    type: 'loss' | 'trauma' | 'relationship_end' | 'achievement' | 'beginning' | 'health' | 'other';
    /** Emotional valence */
    valence: 'positive' | 'negative' | 'mixed';
    /** How they typically feel */
    typicalMood: string;
    /** Brief description (for context) */
    description: string;
    /** Last time we acknowledged it */
    lastAcknowledged?: Date;
    /** How many days before to be aware */
    awarenessWindow: number;
}
export interface LifeRhythmProfile {
    userId: string;
    weekly: WeeklyPattern;
    monthly: MonthlyPattern;
    seasonal: SeasonalPattern;
    anniversaries: AnniversaryDate[];
    /** Observation metadata */
    dataQuality: {
        weeklyConfidence: number;
        monthlyConfidence: number;
        seasonalConfidence: number;
        totalObservations: number;
        lastUpdated: Date;
    };
}
export interface RhythmPrediction {
    /** When this prediction is for */
    targetTime: Date;
    /** What we predict */
    prediction: {
        likelyMood: 'low' | 'neutral' | 'elevated';
        likelyEnergy: 'depleted' | 'normal' | 'high';
        supportNeed: 'proactive' | 'available' | 'minimal';
        conversationLikelihood: number;
    };
    /** Why we think this */
    reasons: string[];
    /** Suggested approach */
    approach: {
        shouldReachOut: boolean;
        bestTime: Date | null;
        tone: 'checking_in' | 'celebrating' | 'supporting' | 'neutral';
        suggestedOpener?: string;
    };
    /** Confidence in prediction */
    confidence: number;
}
/**
 * Get or create a life rhythm profile
 */
export declare function getLifeRhythmProfile(userId: string): LifeRhythmProfile;
/**
 * Predict user state for a given time
 */
export declare function predictUserState(userId: string, targetTime?: Date): RhythmPrediction;
/**
 * Record a conversation observation
 */
export declare function recordConversationObservation(userId: string, observation: {
    timestamp: Date;
    mood: number;
    energy: number;
    topics: string[];
    wasStressed: boolean;
    wasPositive: boolean;
    initiated: 'user' | 'ferni';
}): void;
/**
 * Add an anniversary date
 */
export declare function addAnniversary(userId: string, anniversary: AnniversaryDate): void;
/**
 * Format prediction for prompt injection
 */
export declare function formatPredictionForPrompt(prediction: RhythmPrediction): string;
/**
 * Import a life rhythm profile into memory (for persistence)
 */
export declare function importLifeRhythmProfile(profile: LifeRhythmProfile): void;
/**
 * Reset all life rhythm prediction state (for testing)
 */
export declare function resetLifeRhythmPrediction(): void;
declare const _default: {
    getLifeRhythmProfile: typeof getLifeRhythmProfile;
    predictUserState: typeof predictUserState;
    recordConversationObservation: typeof recordConversationObservation;
    addAnniversary: typeof addAnniversary;
    formatPredictionForPrompt: typeof formatPredictionForPrompt;
    resetLifeRhythmPrediction: typeof resetLifeRhythmPrediction;
};
export default _default;
//# sourceMappingURL=life-rhythm.d.ts.map