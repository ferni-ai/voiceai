/**
 * Dream Keeper - Better Than Human Service
 *
 * What no human friend can do: Never forget what you dreamed of becoming.
 *
 * Guards and tracks long-term aspirations, reigniting forgotten dreams
 * and connecting daily actions to bigger visions.
 *
 * @module services/superhuman/dream-keeper
 */
export type DreamType = 'career' | 'creative' | 'adventure' | 'relationship' | 'impact' | 'lifestyle' | 'growth' | 'healing';
export type DreamStatus = 'alive' | 'dormant' | 'deferred' | 'evolved' | 'achieved' | 'released';
export interface Dream {
    id: string;
    userId: string;
    statement: string;
    type: DreamType;
    title: string;
    status: DreamStatus;
    confidence: number;
    firstMentioned: number;
    lastMentioned: number;
    mentionCount: number;
    whyItMatters?: string;
    obstacles: string[];
    progressNotes: string[];
    personaId?: string;
    relatedValues?: string[];
    connectedToGoals?: string[];
    dormantSince?: number;
    lastReminded?: number;
}
export interface DreamReminder {
    dreamId: string;
    dreamTitle: string;
    message: string;
    tone: 'curious' | 'gentle' | 'inspiring' | 'supportive';
    daysDormant: number;
}
export declare function detectDream(transcript: string): {
    type: DreamType;
    statement: string;
    confidence: number;
} | null;
export declare function loadUserDreams(userId: string): Promise<Dream[]>;
export declare function saveDream(dream: Dream): Promise<void>;
export declare function recordDreamMention(userId: string, detected: {
    type: DreamType;
    statement: string;
    confidence: number;
}): Promise<Dream>;
export declare function findDormantDreams(userId: string): Promise<DreamReminder[]>;
export declare function buildDreamContext(userId: string): Promise<string>;
export declare const dreamKeeper: {
    detectDream: typeof detectDream;
    loadDreams: typeof loadUserDreams;
    recordMention: typeof recordDreamMention;
    findDormant: typeof findDormantDreams;
    buildContext: typeof buildDreamContext;
};
//# sourceMappingURL=dream-keeper.d.ts.map