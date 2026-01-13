/**
 * Persona-Specific Memory Tools
 *
 * Natural Memory Tools for Each Persona
 *
 * Each persona remembers things in their own natural way:
 *
 * Ferni: "Remember I like morning check-ins"
 * Jack: "I prefer Vanguard Total Stock Market"
 * Peter: "Add Apple to my watchlist - I use their products daily"
 * Maya: "I always overspend at Target when I'm stressed"
 * Jordan: "My anniversary is June 15th"
 *
 * Designed to feel like talking to a friend who remembers you.
 *
 * See also: tools/shared/persona-memory-factory.ts for utilities and registry
 */
import { llm } from '@livekit/agents';
export declare function createFerniMemoryTools(): {
    rememberAboutMe: llm.FunctionTool<{
        type: "win" | "topic" | "preference" | "music" | "style";
        what: string;
        details?: string | undefined;
    }, unknown, string>;
    whatDoYouKnowAboutMe: llm.FunctionTool<{
        type: "all" | "preferences" | "wins";
    }, unknown, string>;
};
export declare function createBogleMemoryTools(): {
    rememberFund: llm.FunctionTool<{
        name: string;
        sentiment: "neutral" | "positive" | "negative";
        ticker?: string | undefined;
        category?: "index" | "bond" | "balanced" | "international" | "sector" | undefined;
        expenseRatio?: number | undefined;
    }, unknown, string>;
    rememberMyPhilosophy: llm.FunctionTool<{
        philosophy: string;
    }, unknown, string>;
    whatFundsDoILike: llm.FunctionTool<{
        type: "funds" | "all" | "philosophy";
    }, unknown, string>;
};
export declare function createPeterMemoryTools(): {
    addToWatchlist: llm.FunctionTool<{
        name: string;
        ticker?: string | undefined;
        reason?: string | undefined;
        sector?: string | undefined;
        currentPrice?: number | undefined;
    }, unknown, string>;
    rememberCompanyIKnow: llm.FunctionTool<{
        name: string;
        reason: string;
        sentiment: "neutral" | "positive" | "negative";
        ticker?: string | undefined;
    }, unknown, string>;
    showMyWatchlist: llm.FunctionTool<Record<string, never>, unknown, string>;
    markAsBigWinner: llm.FunctionTool<{
        name: string;
    }, unknown, string>;
};
export declare function createMayaMemoryTools(): {
    rememberMerchant: llm.FunctionTool<{
        name: string;
        sentiment: "neutral" | "positive" | "negative";
        category?: string | undefined;
        averageSpend?: number | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    rememberMyTrigger: llm.FunctionTool<{
        trigger: string;
        notes?: string | undefined;
    }, unknown, string>;
    rememberBill: llm.FunctionTool<{
        name: string;
        amount?: number | undefined;
        dueDate?: number | undefined;
        isAutoPay?: boolean | undefined;
    }, unknown, string>;
    rememberSavingsGoal: llm.FunctionTool<{
        name: string;
        targetAmount?: number | undefined;
        currentAmount?: number | undefined;
        targetDate?: string | undefined;
    }, unknown, string>;
    whatDoYouKnowAboutMyMoney: llm.FunctionTool<{
        type: "triggers" | "all" | "goals" | "bills" | "merchants";
    }, unknown, string>;
};
export declare function createJordanMemoryTools(): {
    rememberImportantDate: llm.FunctionTool<{
        name: string;
        date: string;
        recurring: "monthly" | "yearly" | "once";
        person?: string | undefined;
    }, unknown, string>;
    rememberVenue: llm.FunctionTool<{
        name: string;
        sentiment: "neutral" | "positive" | "negative";
        location?: string | undefined;
        priceRange?: string | undefined;
        rating?: number | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    rememberDreamDestination: llm.FunctionTool<{
        destination: string;
        notes?: string | undefined;
    }, unknown, string>;
    showImportantDates: llm.FunctionTool<Record<string, never>, unknown, string>;
    whatDoYouKnowAboutMyEvents: llm.FunctionTool<{
        type: "all" | "destinations" | "dates" | "venues";
    }, unknown, string>;
};
export declare function createAlexMemoryTools(): {
    rememberCommunicationPreference: llm.FunctionTool<{
        preference: string;
        context?: string | undefined;
    }, unknown, string>;
    rememberSchedulingNote: llm.FunctionTool<{
        note: string;
        recurring?: boolean | undefined;
    }, unknown, string>;
    whatDoYouKnowAboutMyCommunication: llm.FunctionTool<Record<string, never>, unknown, string>;
};
/**
 * Create universal memory management tools available to all personas.
 * These allow users to update, delete, and manage their stored memories.
 */
export declare function createMemoryManagementTools(): {
    forgetThisAboutMe: llm.FunctionTool<{
        searchTerm: string;
        persona: "nayan-patel" | "jack-b" | "peter-john" | "event-planner" | "spend-save" | "comm-specialist";
    }, unknown, string>;
    updateWhatYouKnow: llm.FunctionTool<{
        searchTerm: string;
        persona: "nayan-patel" | "jack-b" | "peter-john" | "event-planner" | "spend-save" | "comm-specialist";
        updates: {
            name?: string | undefined;
            details?: string | undefined;
            sentiment?: "neutral" | "positive" | "negative" | undefined;
        };
    }, unknown, string>;
    showAllPeterKnowledge: llm.FunctionTool<{
        type: "all" | "company" | "watchlist" | "ten_bagger";
    }, unknown, string>;
};
declare const _default: {
    createFerniMemoryTools: typeof createFerniMemoryTools;
    createBogleMemoryTools: typeof createBogleMemoryTools;
    createPeterMemoryTools: typeof createPeterMemoryTools;
    createMayaMemoryTools: typeof createMayaMemoryTools;
    createJordanMemoryTools: typeof createJordanMemoryTools;
    createAlexMemoryTools: typeof createAlexMemoryTools;
    createMemoryManagementTools: typeof createMemoryManagementTools;
};
export default _default;
//# sourceMappingURL=persona-tools.d.ts.map