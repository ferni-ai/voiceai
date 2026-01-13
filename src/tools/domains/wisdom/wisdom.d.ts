/**
 * Wisdom Tools
 *
 * Domain: Quotes, financial history, research-backed insights.
 * Single responsibility: Jack Bogle's wisdom and Vanguard research perspective.
 *
 * This is where Jack's personality and evidence-based wisdom shines.
 * Includes insights from Vanguard whitepapers, academic research, and
 * decades of industry experience.
 */
import { llm } from '@livekit/agents';
/**
 * Get a random Bogle quote
 */
export declare function getBogleQuote(): string;
/**
 * Get a wisdom quote (Bogle or other legends)
 */
export declare function getWisdomQuote(): string;
/**
 * Get research-backed insight on a topic
 */
export declare function getResearchInsight(topic?: string): string;
/**
 * Get research insight for a specific category
 */
export declare function getResearchByCategory(category: 'costs' | 'behavior' | 'allocation' | 'retirement' | 'taxes'): string;
/**
 * Get life wisdom (non-financial)
 */
export declare function getLifeWisdom(): string;
/**
 * Get this day in financial history
 */
export declare function getThisDayInHistory(): string;
/**
 * Get market crash perspective
 */
export declare function getCrashPerspective(crashName?: string): string;
/**
 * Get cost impact explanation
 */
export declare function getCostImpact(amount: number, years: number, feePercent: number): string;
export declare function createWisdomTools(): {
    getWisdomQuote: llm.FunctionTool<Record<string, never>, unknown, string>;
    getBogleQuote: llm.FunctionTool<Record<string, never>, unknown, string>;
    getResearchInsight: llm.FunctionTool<{
        category?: "behavior" | "retirement" | "allocation" | "costs" | "taxes" | undefined;
    }, unknown, string>;
    getLifeWisdom: llm.FunctionTool<Record<string, never>, unknown, string>;
    getThisDayInHistory: llm.FunctionTool<Record<string, never>, unknown, string>;
    getCrashPerspective: llm.FunctionTool<{
        crash?: "2000" | "2008" | "1929" | "1987" | "2020" | "2022" | undefined;
    }, unknown, string>;
    getCostImpact: llm.FunctionTool<{
        amount: number;
        years: number;
        feePercent: number;
    }, unknown, string>;
};
export default createWisdomTools;
//# sourceMappingURL=wisdom.d.ts.map