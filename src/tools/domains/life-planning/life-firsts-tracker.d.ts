/**
 * Life's Firsts Tracker - Jordan's Core Milestone System
 *
 * Tracks and celebrates all of life's major firsts:
 * - First home, first baby, first wedding
 * - Milestone birthdays, graduations, retirements
 * - Cultural celebrations and coming-of-age moments
 *
 * Jordan is the coordinator of "life's firsts" - making sure
 * every major milestone is planned, celebrated, and remembered.
 */
import { llm } from '@livekit/agents';
export type MilestoneCategory = 'first-home' | 'first-baby' | 'wedding' | 'engagement' | 'graduation' | 'milestone-birthday' | 'retirement' | 'first-job' | 'first-car' | 'first-pet' | 'first-solo-trip' | 'college-sendoff' | 'coming-of-age' | 'anniversary' | 'memorial' | 'other';
export type CulturalCelebration = 'quinceanera' | 'bar-mitzvah' | 'bat-mitzvah' | 'sweet-sixteen' | 'debutante' | 'first-communion' | 'confirmation' | 'graduation-party' | 'housewarming' | 'baby-shower' | 'bridal-shower' | 'bachelor-party' | 'bachelorette-party' | 'engagement-party' | 'rehearsal-dinner' | 'retirement-party' | 'other';
export interface LifeMilestone {
    id: string;
    userId: string;
    category: MilestoneCategory;
    culturalType?: CulturalCelebration;
    name: string;
    description: string;
    targetDate?: Date;
    completedDate?: Date;
    status: 'planning' | 'upcoming' | 'in-progress' | 'completed' | 'celebrated';
    budget?: number;
    spent?: number;
    guestCount?: number;
    location?: string;
    checklist: MilestoneChecklistItem[];
    notes: string[];
    memories: MilestoneMemory[];
    relatedEvents: string[];
    createdAt: Date;
    updatedAt: Date;
}
export interface MilestoneChecklistItem {
    id: string;
    task: string;
    category: string;
    dueDate?: Date;
    completed: boolean;
    notes?: string;
}
export interface MilestoneMemory {
    id: string;
    type: 'note' | 'highlight' | 'lesson-learned' | 'thank-you';
    content: string;
    createdAt: Date;
}
export declare const MILESTONE_TEMPLATES: Record<MilestoneCategory, {
    name: string;
    description: string;
    defaultChecklist: Array<Omit<MilestoneChecklistItem, 'id'>>;
    tips: string[];
    typicalTimeline: string;
    budgetRange: {
        low: number;
        mid: number;
        high: number;
    };
}>;
export declare function createMilestone(userId: string, category: MilestoneCategory, name: string, targetDate?: Date, budget?: number, culturalType?: CulturalCelebration): Promise<LifeMilestone>;
export declare function getMilestone(id: string): LifeMilestone | undefined;
export declare function getUserMilestones(userId: string): Promise<LifeMilestone[]>;
export declare function updateMilestoneChecklist(milestoneId: string, taskId: string, completed: boolean): LifeMilestone | undefined;
export declare function addMilestoneMemory(milestoneId: string, type: MilestoneMemory['type'], content: string): LifeMilestone | undefined;
export declare function createLifeFirstsTools(): {
    createLifeMilestone: llm.FunctionTool<{
        category: "wedding" | "other" | "retirement" | "engagement" | "anniversary" | "graduation" | "memorial" | "first-baby" | "first-home" | "first-solo-trip" | "first-pet" | "coming-of-age" | "milestone-birthday" | "first-job" | "first-car" | "college-sendoff";
        name: string;
        userId: string;
        targetDate?: string | undefined;
        budget?: number | undefined;
        culturalType?: "confirmation" | "other" | "quinceanera" | "bar-mitzvah" | "bat-mitzvah" | "sweet-sixteen" | "debutante" | "first-communion" | "graduation-party" | "housewarming" | "baby-shower" | "bridal-shower" | "bachelor-party" | "bachelorette-party" | "engagement-party" | "rehearsal-dinner" | "retirement-party" | undefined;
    }, unknown, string>;
    viewLifeMilestones: llm.FunctionTool<{
        userId: string;
        status?: "planning" | "completed" | "all" | "upcoming" | undefined;
    }, unknown, string>;
    updateMilestoneTask: llm.FunctionTool<{
        milestoneName: string;
        taskDescription: string;
        completed: boolean;
        userId: string;
    }, unknown, string>;
    addMilestoneNote: llm.FunctionTool<{
        milestoneName: string;
        noteType: "note" | "highlight" | "lesson-learned" | "thank-you";
        content: string;
        userId: string;
    }, unknown, string>;
    getMilestoneTips: llm.FunctionTool<{
        category: "wedding" | "other" | "retirement" | "engagement" | "anniversary" | "graduation" | "memorial" | "first-baby" | "first-home" | "first-solo-trip" | "first-pet" | "coming-of-age" | "milestone-birthday" | "first-job" | "first-car" | "college-sendoff";
    }, unknown, string>;
    getMilestoneCountdown: llm.FunctionTool<{
        userId: string;
        milestoneName?: string | undefined;
    }, unknown, string>;
};
export default createLifeFirstsTools;
//# sourceMappingURL=life-firsts-tracker.d.ts.map