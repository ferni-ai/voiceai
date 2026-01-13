/**
 * First-Time Planning Tools - Jordan's Specialized "Firsts" Support
 *
 * Detailed planning tools for life's major firsts:
 * - First Baby (nursery, baby shower, hospital prep)
 * - First Home (housewarming, moving, settling in)
 * - First Wedding (engagement to honeymoon)
 * - And more...
 *
 * These tools provide deep expertise for each specific "first"
 * with specialized checklists, tips, and guidance.
 */
import { llm } from '@livekit/agents';
export declare const BABY_PLANNING: {
    nurseryShopping: {
        essentials: {
            item: string;
            priority: string;
            priceRange: string;
        }[];
        supplies: {
            item: string;
            priority: string;
            quantity: string;
        }[];
        gear: {
            item: string;
            priority: string;
            priceRange: string;
        }[];
    };
    hospitalBag: {
        forMom: string[];
        forBaby: string[];
        forPartner: string[];
    };
    babyShowerThemes: {
        theme: string;
        colors: string[];
        style: string;
    }[];
};
export declare const HOME_PLANNING: {
    movingChecklist: {
        twoMonthsBefore: string[];
        oneMonthBefore: string[];
        oneWeekBefore: string[];
        movingDay: string[];
        firstWeek: string[];
    };
    housewarmingParty: {
        timing: string;
        checklist: string[];
        tips: string[];
        registryIdeas: string[];
    };
    firstYearHomeChecklist: {
        task: string;
        when: string;
    }[];
};
export declare const WEDDING_PLANNING: {
    timeline: {
        '12-18 months before': string[];
        '9-12 months before': string[];
        '6-9 months before': string[];
        '3-6 months before': string[];
        '1 month before': string[];
        'Week of': string[];
    };
    budgetBreakdown: {
        venue: string;
        catering: string;
        photography: string;
        music: string;
        flowers: string;
        attire: string;
        invitations: string;
        cake: string;
        officiant: string;
        miscellaneous: string;
    };
    savingTips: string[];
};
export declare function createFirstTimePlanningTools(): {
    getBabyShoppingList: llm.FunctionTool<{
        category: "all" | "nursery" | "supplies" | "gear";
        budgetLevel?: "premium" | "budget" | "mid-range" | undefined;
    }, unknown, string>;
    getHospitalBagChecklist: llm.FunctionTool<{
        who?: "all" | "partner" | "baby" | "mom" | undefined;
    }, unknown, string>;
    getBabyShowerIdeas: llm.FunctionTool<{
        style?: "modern" | "all" | "traditional" | "gender-neutral" | undefined;
    }, unknown, string>;
    getMovingChecklist: llm.FunctionTool<{
        timeframe?: "all" | "1-month" | "2-months" | "1-week" | "moving-day" | "first-week" | undefined;
    }, unknown, string>;
    getHousewarmingTips: llm.FunctionTool<Record<string, never>, unknown, string>;
    getFirstYearHomeTasks: llm.FunctionTool<Record<string, never>, unknown, string>;
    getWeddingTimeline: llm.FunctionTool<{
        monthsOut?: number | undefined;
    }, unknown, string>;
    getWeddingSavingTips: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createFirstTimePlanningTools;
//# sourceMappingURL=first-time-planning.d.ts.map