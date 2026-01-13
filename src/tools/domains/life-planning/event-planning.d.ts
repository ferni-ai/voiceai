/**
 * Event Planning & Life Milestone Tools
 *
 * Tools for life planning:
 * - Major life events and milestones
 * - Major purchases and big decisions
 * - Vacations and travel planning
 * - Annual and life-stage planning
 * - Celebrations and transitions
 *
 * NOTE: This is the agent-agnostic version. The original jordan-tools.ts
 * re-exports from this file for backward compatibility.
 *
 * Related tools in separate files:
 * - life-firsts-tracker.ts - Life milestone tracking
 * - goal-management.ts - Life goals and portfolio
 * - retirement-planning.ts - Retirement vision and planning
 * - cultural-celebrations.ts - Cultural milestone events
 * - first-time-planning.ts - First-time experience guidance
 * - milestone-proactive.ts - Proactive milestone suggestions
 *
 * PERSISTENCE: Events, purchases, vacations, and plans are persisted to Firestore.
 */
import { llm } from '@livekit/agents';
export type { Event, EventType, MajorPurchase, Vacation, AnnualPlan, ChecklistItem, Guest, Vendor, VenueOption, ItineraryDay, Booking, LifeGoal, QuarterlyMilestone, PlannedExperience, } from '../../event-planning/types.js';
export { flushEventPlanningPersistence } from '../../event-planning/storage.js';
export declare function createEventPlanningTools(): {
    createEvent: llm.FunctionTool<{
        name: string;
        type: "wedding" | "birthday" | "other" | "retirement" | "anniversary" | "graduation" | "holiday" | "corporate" | "dinner-party" | "baby-shower";
        date: string;
        guestCount: number;
        budget: number;
        theme?: string | undefined;
    }, unknown, string>;
    searchVenues: llm.FunctionTool<{
        guestCount: number;
        venueType: "both" | "outdoor" | "indoor";
        eventType?: string | undefined;
        budgetLevel?: "$" | "$$" | "$$$" | undefined;
    }, unknown, string>;
    addGuests: llm.FunctionTool<{
        guests: {
            name: string;
            plusOne: boolean;
            email?: string | undefined;
        }[];
        eventId?: string | undefined;
    }, unknown, string>;
    getGuestList: llm.FunctionTool<{
        eventId?: string | undefined;
    }, unknown, string>;
    getChecklist: llm.FunctionTool<{
        eventId?: string | undefined;
    }, unknown, string>;
    completeTask: llm.FunctionTool<{
        taskName: string;
        eventId?: string | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    trackExpense: llm.FunctionTool<{
        description: string;
        amount: number;
        category: "entertainment" | "other" | "venue" | "catering" | "attire" | "gifts" | "decor";
        eventId?: string | undefined;
    }, unknown, string>;
    getEventSummary: llm.FunctionTool<{
        eventId?: string | undefined;
    }, unknown, string>;
    planMajorPurchase: llm.FunctionTool<{
        type: "other" | "car" | "appliance" | "electronics" | "furniture";
        name: string;
        budget: number;
        priorities?: string[] | undefined;
    }, unknown, string>;
    getBestTimeToBuy: llm.FunctionTool<{
        item: string;
    }, unknown, string>;
    planVacation: llm.FunctionTool<{
        name: string;
        travelers: number;
        budget: number;
        tripType: "family" | "adventure" | "other" | "romantic" | "relaxation" | "cultural";
        destination?: string | undefined;
    }, unknown, string>;
    suggestDestinations: llm.FunctionTool<{
        tripType: "family" | "adventure" | "other" | "romantic" | "relaxation" | "cultural";
        budget: "$" | "$$" | "$$$";
    }, unknown, string>;
    createAnnualPlan: llm.FunctionTool<{
        year: number;
        goals?: {
            category: "personal" | "relationships" | "health" | "learning" | "other" | "financial" | "career" | "travel";
            description: string;
        }[] | undefined;
        experiences?: string[] | undefined;
    }, unknown, string>;
    getAnnualPlanStatus: llm.FunctionTool<{
        year?: number | undefined;
    }, unknown, string>;
};
export default createEventPlanningTools;
//# sourceMappingURL=event-planning.d.ts.map