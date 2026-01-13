/**
 * Perfect Timing Intelligence
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Knows exactly when to bring up topics, reach out, or hold back.
 * "Your best friend brings up your divorce during your busiest week.
 * Ferni waits for a quiet Sunday morning."
 *
 * @module PerfectTiming
 */
export type ConversationType = 'deep' | 'gentle' | 'challenging' | 'celebration';
export type CalendarPressure = 'light' | 'moderate' | 'heavy';
export type GreetingTone = 'warm' | 'rushed' | 'tired' | 'neutral' | 'excited';
export interface ReceptivityScore {
    /** Overall receptivity (0-1) */
    score: number;
    /** Interpretation of the score */
    interpretation: string;
    /** Specific recommendations */
    recommendations: {
        canRaiseSensitiveTopics: boolean;
        shouldOfferSupport: boolean;
        keepItLight: boolean;
        perfectForDeep: boolean;
    };
    /** Factors that contributed to the score */
    factors: {
        energy: number;
        stress: number;
        greetingTone: GreetingTone;
        timeOfDay: string;
    };
}
export interface TimeWindow {
    dayOfWeek: number;
    startHour: number;
    endHour: number;
    confidence: number;
}
export interface EnergyPattern {
    avgEnergy: number;
    sampleCount: number;
    confidence: number;
}
export interface QueuedTopic {
    topic: string;
    queuedAt: Date;
    reason: string;
    idealConditions: {
        minEnergy?: number;
        maxCalendarPressure?: CalendarPressure;
        requiredMood?: string[];
        avoidDaysOfWeek?: number[];
        avoidHoursOfDay?: number[];
    };
    expiresAt?: Date;
    surfacedAt?: Date;
    wasEffective?: boolean;
}
export interface ReceptivityReading {
    timestamp: Date;
    score: number;
    voiceMarkers: {
        energy: number;
        stress: number;
        openness: number;
    };
    greetingTone: GreetingTone;
    contextFactors: string[];
}
export interface TimingIntelligence {
    userId: string;
    /** Energy patterns by hour of day */
    energyByHour: Record<number, EnergyPattern>;
    /** Energy patterns by day of week */
    energyByDayOfWeek: Record<number, EnergyPattern>;
    /** Best windows for different conversation types */
    optimalWindows: {
        deepConversations: TimeWindow[];
        gentleCheckIns: TimeWindow[];
        challengingTopics: TimeWindow[];
        celebrations: TimeWindow[];
    };
    /** Topics waiting for right moment */
    queuedTopics: QueuedTopic[];
    /** Recent receptivity readings */
    recentReceptivity: ReceptivityReading[];
    /** Calendar awareness */
    calendarAwareness: {
        typicalMeetingDays: number[];
        averageMeetingsPerDay: number;
        knownBusyPeriods: Array<{
            startDate: Date;
            endDate: Date;
            description: string;
        }>;
    };
    updatedAt: Date;
}
/**
 * Detect receptivity from voice at conversation start.
 * Call this within first 5-10 seconds of user speaking.
 */
export declare function detectReceptivity(voiceAnalysis: {
    energy: number;
    stressLevel: number;
    speechRate?: number;
    greetingTone: GreetingTone;
}): ReceptivityScore;
/**
 * Learn from each conversation to improve timing predictions.
 */
export declare function recordTimingLearning(userId: string, data: {
    timestamp: Date;
    receptivityScore: number;
    conversationQuality: number;
    topicsSurfaced: string[];
    topicsWellReceived: string[];
    voiceEnergy: number;
    greetingTone: GreetingTone;
    calendarContext?: {
        meetingsToday: number;
        hoursUntilNextMeeting?: number;
    };
}): Promise<void>;
/**
 * Queue a topic to surface at the right moment.
 */
export declare function queueTopicForRightMoment(userId: string, topic: string, options: {
    reason: string;
    minEnergy?: number;
    maxCalendarPressure?: CalendarPressure;
    requiredMood?: string[];
    expiresInDays?: number;
    avoidDaysOfWeek?: number[];
    avoidHoursOfDay?: number[];
}): Promise<void>;
/**
 * Check if any queued topics should be surfaced now.
 */
export declare function getTopicsForNow(userId: string, currentConditions: {
    receptivityScore: number;
    energy: number;
    stress: number;
    mood?: string;
    calendarPressure?: CalendarPressure;
}): string[];
/**
 * Mark a topic as surfaced.
 */
export declare function markTopicSurfaced(userId: string, topic: string, wasEffective: boolean): void;
/**
 * Check if now is a good time for a specific type of conversation.
 */
export declare function isGoodTimeFor(userId: string, conversationType: ConversationType): {
    isGood: boolean;
    confidence: number;
    reason: string;
    betterTime?: string;
};
/**
 * Build context for LLM injection.
 */
export declare function buildTimingContext(userId: string, currentReceptivity?: ReceptivityScore): string;
export declare function loadTimingProfile(userId: string): Promise<TimingIntelligence | null>;
/**
 * Get timing profile from memory.
 */
export declare function getTimingProfile(userId: string): TimingIntelligence | null;
export declare const perfectTiming: {
    detectReceptivity: typeof detectReceptivity;
    recordTimingLearning: typeof recordTimingLearning;
    queueTopicForRightMoment: typeof queueTopicForRightMoment;
    getTopicsForNow: typeof getTopicsForNow;
    markTopicSurfaced: typeof markTopicSurfaced;
    isGoodTimeFor: typeof isGoodTimeFor;
    buildTimingContext: typeof buildTimingContext;
    loadTimingProfile: typeof loadTimingProfile;
    getTimingProfile: typeof getTimingProfile;
};
export default perfectTiming;
//# sourceMappingURL=perfect-timing.d.ts.map