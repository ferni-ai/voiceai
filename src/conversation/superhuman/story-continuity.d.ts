/**
 * Story Continuity System
 *
 * "How's Sarah doing with her new job?" - Remembering the cast of characters.
 *
 * Real friends remember the people in your life. This system tracks the
 * characters in the user's story and asks about them naturally.
 *
 * @module conversation/superhuman/story-continuity
 */
export interface PersonInLife {
    id: string;
    userId: string;
    name: string;
    relationship: RelationshipType;
    details: PersonDetail[];
    lastMentioned: Date;
    mentionCount: number;
    sentiment: 'positive' | 'negative' | 'complicated' | 'neutral';
    activeStorylines: Storyline[];
    resolvedStorylines: Storyline[];
}
export type RelationshipType = 'partner' | 'spouse' | 'parent' | 'child' | 'sibling' | 'friend' | 'coworker' | 'boss' | 'ex' | 'therapist' | 'doctor' | 'other';
export interface PersonDetail {
    type: 'job' | 'hobby' | 'personality' | 'issue' | 'achievement' | 'plan' | 'other';
    detail: string;
    addedAt: Date;
}
export interface Storyline {
    id: string;
    summary: string;
    startDate: Date;
    lastUpdate: Date;
    isResolved: boolean;
    updates: StorylineUpdate[];
}
export interface StorylineUpdate {
    timestamp: Date;
    update: string;
}
export interface PersonFollowUp {
    person: PersonInLife;
    question: string;
    reason: string;
    storyline?: Storyline;
}
/**
 * Extract a person mentioned in a message
 */
export declare function extractPerson(userId: string, message: string): Partial<PersonInLife> | null;
/**
 * Get or create a person in the user's life
 */
export declare function getOrCreatePerson(userId: string, partial: Partial<PersonInLife>): PersonInLife;
/**
 * Add a detail about a person
 */
export declare function addPersonDetail(userId: string, personId: string, detail: Omit<PersonDetail, 'addedAt'>): void;
/**
 * Start or update a storyline
 */
export declare function updateStoryline(userId: string, personId: string, storylineSummary: string, update: string): void;
/**
 * Find people to ask about
 */
export declare function findPeopleToAskAbout(userId: string, context: {
    recentTopics?: string[];
    turnCount?: number;
}): PersonFollowUp | null;
/**
 * Format follow-up for prompt
 */
export declare function formatFollowUpForPrompt(followUp: PersonFollowUp): string;
declare const _default: {
    extractPerson: typeof extractPerson;
    getOrCreatePerson: typeof getOrCreatePerson;
    addPersonDetail: typeof addPersonDetail;
    updateStoryline: typeof updateStoryline;
    findPeopleToAskAbout: typeof findPeopleToAskAbout;
    formatFollowUpForPrompt: typeof formatFollowUpForPrompt;
};
export default _default;
//# sourceMappingURL=story-continuity.d.ts.map