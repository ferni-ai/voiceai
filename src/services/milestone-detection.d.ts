/**
 * Milestone Detection Service
 *
 * Detects user milestones, anniversaries, and moments worth celebrating.
 */
import type { UserProfile } from '../types/user-profile.js';
export type MilestoneType = 'first_meeting' | 'relationship_upgrade' | 'conversation_count' | 'time_spent' | 'streak' | 'anniversary' | 'breakthrough' | 'goal_achieved' | 'habit_formed' | 'vulnerability_shared';
export interface Milestone {
    type: MilestoneType;
    personaId: string;
    description: string;
    value?: number;
    timestamp: Date;
    celebrationLevel: 'small' | 'medium' | 'big';
}
export interface MilestoneContext {
    userId: string;
    personaId: string;
    profile: UserProfile;
    currentConversationMinutes?: number;
}
/**
 * Check for habit streak milestones (Maya-specific)
 */
export declare function checkHabitStreak(personaId: string, streakDays: number): Milestone | null;
/**
 * Detect all applicable milestones for current context
 */
export declare function detectMilestones(context: MilestoneContext): Milestone[];
/**
 * Get celebration phrase for a milestone
 */
export declare function getMilestoneCelebrationPhrase(milestone: Milestone): string;
export declare function shouldCelebrate(userId: string, personaId: string, milestoneType: MilestoneType): boolean;
export declare function markCelebrated(userId: string, personaId: string, milestoneType: MilestoneType): void;
export declare const MilestoneDetectionService: {
    detect: typeof detectMilestones;
    getCelebrationPhrase: typeof getMilestoneCelebrationPhrase;
    checkStreak: typeof checkHabitStreak;
    shouldCelebrate: typeof shouldCelebrate;
    markCelebrated: typeof markCelebrated;
};
export default MilestoneDetectionService;
//# sourceMappingURL=milestone-detection.d.ts.map