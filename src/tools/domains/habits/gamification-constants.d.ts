/**
 * Gamification Constants
 *
 * Badge definitions and title progression for the gamification system.
 * These constants are shared between gamification v1 (legacy) and v2.
 *
 * @module habits/gamification-constants
 */
export interface Badge {
    id: string;
    name: string;
    emoji: string;
    description: string;
    category: BadgeCategory;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    earnedAt?: Date;
    progress?: number;
    requirement: string;
}
export type BadgeCategory = 'streaks' | 'milestones' | 'challenges' | 'domains' | 'behavior_science' | 'comebacks' | 'social' | 'special';
export declare const BADGE_DEFINITIONS: Badge[];
export interface UserTitle {
    id: string;
    name: string;
    emoji: string;
    description: string;
    requirement: string;
    tier: number;
}
export declare const TITLE_PROGRESSION: UserTitle[];
//# sourceMappingURL=gamification-constants.d.ts.map