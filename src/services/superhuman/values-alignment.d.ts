/**
 * Values Alignment Engine - Better Than Human Service
 *
 * What no human friend can do: Track values across 1000 conversations.
 *
 * Continuously monitors stated values and detects when decisions
 * or actions conflict with those values.
 *
 * @module services/superhuman/values-alignment
 */
export type ValueCategory = 'family' | 'freedom' | 'security' | 'growth' | 'achievement' | 'service' | 'creativity' | 'authenticity' | 'connection' | 'health' | 'adventure' | 'peace' | 'purpose' | 'wealth' | 'fun';
export interface UserValue {
    id: string;
    userId: string;
    category: ValueCategory;
    statement: string;
    importance: number;
    mentions: number;
    firstMentioned: number;
    lastMentioned: number;
    contextExamples: string[];
    conflictCount: number;
    lastConflictDate?: number;
}
export interface ValueConflict {
    id: string;
    userId: string;
    valueId: string;
    statedValue: string;
    conflictingAction: string;
    detectedAt: number;
    conversationContext: string;
    wasAddressed: boolean;
    userResponse?: 'acknowledged' | 'defended' | 'dismissed' | 'explored';
}
export interface ValuesProfile {
    userId: string;
    topValues: UserValue[];
    recentConflicts: ValueConflict[];
    valueAlignment: number;
    lastUpdated: number;
}
export declare function detectValue(transcript: string): {
    category: ValueCategory;
    statement: string;
    weight: number;
} | null;
export declare function detectConflict(transcript: string, userValues: UserValue[]): {
    valueId: string;
    conflictingAction: string;
} | null;
export declare function loadUserValues(userId: string): Promise<UserValue[]>;
export declare function saveValue(value: UserValue): Promise<void>;
export declare function recordValueMention(userId: string, detected: {
    category: ValueCategory;
    statement: string;
    weight: number;
}): Promise<UserValue>;
export declare function recordConflict(userId: string, conflict: {
    valueId: string;
    conflictingAction: string;
    context: string;
}): Promise<void>;
export declare function buildValuesContext(userId: string): Promise<string>;
export declare const valuesAlignment: {
    detectValue: typeof detectValue;
    detectConflict: typeof detectConflict;
    loadValues: typeof loadUserValues;
    recordMention: typeof recordValueMention;
    recordConflict: typeof recordConflict;
    buildContext: typeof buildValuesContext;
};
//# sourceMappingURL=values-alignment.d.ts.map