/**
 * Unified Habit System
 *
 * Consolidates habit tracking and habit coaching into a single coherent system.
 * This replaces the separate habits.ts and habit-coaching.ts files.
 *
 * CAPABILITIES:
 * - Basic habit tracking (add, log, stats)
 * - Advanced coaching (Four Tendencies, behavioral science)
 * - Gamification integration (via gamification-v2)
 * - Life domain organization
 * - Challenge system
 * - Progress visualization
 *
 * ARCHITECTURE:
 * - Uses ProductivityStore for persistence
 * - Integrates with gamification-v2 for XP/badges
 * - Leverages tool orchestration for conversation flow
 *
 * NOTE: This file contains SIMPLIFIED constants for the unified tools.
 * For comprehensive habit coaching with full behavioral science backing,
 * use the canonical constants from habit-coaching/constants.ts instead.
 */
import type { ToolDefinition } from '../../registry/types.js';
export type HabitFrequency = 'daily' | 'weekdays' | 'weekends' | 'weekly' | 'custom';
export type HabitCategory = 'health' | 'fitness' | 'mindfulness' | 'productivity' | 'learning' | 'social' | 'finance' | 'other';
export type FourTendency = 'upholder' | 'questioner' | 'obliger' | 'rebel';
export interface EnhancedHabit {
    id: string;
    name: string;
    description?: string;
    category: HabitCategory;
    frequency: HabitFrequency;
    customDays?: number[];
    targetPerDay: number;
    reminderTime?: string;
    isActive: boolean;
    cue?: string;
    reward?: string;
    stackedWith?: string;
    minimumVersion?: string;
    level: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare const LIFE_DOMAINS: {
    readonly health: {
        readonly name: "Health & Energy";
        readonly emoji: "💪";
        readonly description: "Physical health, sleep, nutrition, movement";
        readonly starterHabits: readonly ["drink water", "take a walk", "stretch", "eat vegetables"];
    };
    readonly mind: {
        readonly name: "Mind & Learning";
        readonly emoji: "🧠";
        readonly description: "Mental clarity, learning, creativity";
        readonly starterHabits: readonly ["read 10 minutes", "learn something new", "journal", "meditate"];
    };
    readonly relationships: {
        readonly name: "Relationships";
        readonly emoji: "❤️";
        readonly description: "Connection with others";
        readonly starterHabits: readonly ["call a friend", "express gratitude", "quality time", "random kindness"];
    };
    readonly work: {
        readonly name: "Work & Career";
        readonly emoji: "💼";
        readonly description: "Professional growth and productivity";
        readonly starterHabits: readonly ["plan your day", "deep work block", "clear inbox", "skill practice"];
    };
    readonly money: {
        readonly name: "Money & Finance";
        readonly emoji: "💰";
        readonly description: "Financial health and security";
        readonly starterHabits: readonly ["check accounts", "no-spend challenge", "save something", "track spending"];
    };
    readonly spirit: {
        readonly name: "Spirit & Purpose";
        readonly emoji: "✨";
        readonly description: "Meaning, values, inner peace";
        readonly starterHabits: readonly ["gratitude practice", "meditation", "reflect on values", "help someone"];
    };
};
export declare const TENDENCY_STRATEGIES: Record<FourTendency, {
    description: string;
    strengths: string[];
    challenges: string[];
    strategies: string[];
}>;
export declare const addHabitDef: ToolDefinition;
export declare const logHabitDef: ToolDefinition;
export declare const getHabitStatsDef: ToolDefinition;
export declare const getDueHabitsDef: ToolDefinition;
export declare const getTendencyAdviceDef: ToolDefinition;
export declare const getLifeDomainsDef: ToolDefinition;
export declare const habitToolDefinitions: ToolDefinition[];
export default habitToolDefinitions;
//# sourceMappingURL=unified-habits.d.ts.map