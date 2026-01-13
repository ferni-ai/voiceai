/**
 * Growth Tracking
 *
 * Superhuman feature: Remember where users started and celebrate their progress.
 *
 * "Remember a few months ago when you couldn't even talk about this?
 *  Look at you now. That's real growth."
 *
 * Humans take growth for granted. We don't.
 *
 * @module personality/growth-tracking
 */
export interface GrowthMoment {
    id: string;
    userId: string;
    area: string;
    pastEvidence: string;
    pastDate: Date;
    currentEvidence: string;
    currentDate: Date;
    celebration: string;
    significance: 'notable' | 'significant' | 'breakthrough';
    surfaced: boolean;
}
/** Growth moments per user */
declare const growthMoments: Map<string, GrowthMoment[]>;
/**
 * Record a potential growth moment
 */
export declare function recordGrowthEvidence(userId: string, area: string, evidence: string, isProgress: boolean): void;
/**
 * Get growth moments ready to celebrate
 */
export declare function getGrowthCelebrations(userId: string, options?: {
    onlyUnsurfaced?: boolean;
}): GrowthMoment[];
/**
 * Mark a growth moment as surfaced
 */
export declare function markGrowthSurfaced(growthId: string, userId: string): void;
/**
 * Format growth celebration for prompt injection
 */
export declare function formatGrowthForPrompt(growth: GrowthMoment): string;
/**
 * Clear growth moments for a user
 */
export declare function clearUserGrowthMoments(userId: string): void;
/**
 * Clear all growth moments
 */
export declare function clearAllGrowthMoments(): void;
export { growthMoments };
//# sourceMappingURL=growth-tracking.d.ts.map