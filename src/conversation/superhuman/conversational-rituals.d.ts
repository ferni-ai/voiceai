/**
 * Conversational Rituals System
 *
 * > "Should we do our thing where we start with three good things?"
 *
 * Develops and maintains personalized rituals that become "our thing":
 * - Check-in patterns ("How's your energy today?")
 * - Closing rituals ("What's one small thing you can do tonight?")
 * - Topic rituals ("Let's do our gratitude thing")
 * - Celebration rituals ("Ring the bell!")
 *
 * Rituals create predictability, comfort, and a sense of shared history.
 *
 * @module @ferni/superhuman/conversational-rituals
 */
export type RitualType = 'greeting' | 'check_in' | 'closing' | 'celebration' | 'comfort' | 'transition' | 'custom';
export interface Ritual {
    /** Unique identifier */
    id: string;
    /** Name for the ritual */
    name: string;
    /** What Ferni says/does */
    ferniPart: string;
    /** What user typically responds */
    userPart: string;
    /** When to suggest this ritual */
    type: RitualType;
    /** Times performed */
    performedCount: number;
    /** Last performed */
    lastPerformed: Date | null;
    /** How much user seems to like it (based on engagement) */
    engagementScore: number;
    /** Topics this relates to */
    topics: string[];
}
export interface RitualState {
    /** All established rituals */
    rituals: Ritual[];
    /** Potential rituals being "tested" */
    potentialRituals: Ritual[];
    /** User preferences */
    preferences: {
        likesStructure: boolean;
        preferredCheckInStyle: 'quick' | 'thorough' | 'emotional';
        preferredClosingStyle: 'actionable' | 'reflective' | 'warm';
    };
}
export interface RitualSuggestion {
    ritual: Ritual;
    prompt: string;
    context: string;
}
/**
 * Record that a ritual was performed and track engagement
 */
export declare function recordRitualPerformed(userId: string, ritualId: string, engagement: 'positive' | 'neutral' | 'negative'): void;
/**
 * Suggest a ritual based on context
 */
export declare function suggestRitual(userId: string, context: {
    phase: 'greeting' | 'middle' | 'closing';
    topics: string[];
    emotion: string;
    turnCount: number;
    hasWin?: boolean;
    needsComfort?: boolean;
}): RitualSuggestion | null;
/**
 * Format ritual guidance for LLM prompt
 */
export declare function formatRitualGuidance(userId: string, context: {
    phase: 'greeting' | 'middle' | 'closing';
    topics: string[];
    emotion: string;
    turnCount: number;
    hasWin?: boolean;
    needsComfort?: boolean;
}): string | null;
/**
 * Create a custom ritual
 */
export declare function createCustomRitual(userId: string, ritual: {
    name: string;
    ferniPart: string;
    userPart: string;
    topics: string[];
}): Ritual;
/**
 * Get all established rituals for a user
 */
export declare function getEstablishedRituals(userId: string): Ritual[];
export declare function clearRitualStates(): void;
//# sourceMappingURL=conversational-rituals.d.ts.map