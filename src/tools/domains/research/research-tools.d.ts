/**
 * Stock Picking & Research Tools
 *
 * Tools for "invest in what you know" philosophy:
 * - Find stocks in everyday life
 * - P/E ratio analysis
 * - Company classification (stalwarts, fast growers, turnarounds, etc.)
 * - Ten-bagger potential analysis
 */
import { llm } from '@livekit/agents';
export type StockCategory = 'slow_grower' | 'stalwart' | 'fast_grower' | 'cyclical' | 'turnaround' | 'asset_play';
export declare function createResearchTools(): {
    analyzeStock: llm.FunctionTool<{
        symbol: string;
    }, unknown, string>;
    findStockCategory: llm.FunctionTool<{
        category: "cyclical" | "slow_grower" | "stalwart" | "fast_grower" | "turnaround" | "asset_play";
    }, unknown, string>;
    calculatePEGRatio: llm.FunctionTool<{
        peRatio: number;
        growthRate: number;
    }, unknown, string>;
    findTenBaggers: llm.FunctionTool<Record<string, never>, unknown, string>;
    explainStockCategory: llm.FunctionTool<{
        category: "cyclical" | "slow_grower" | "stalwart" | "fast_grower" | "turnaround" | "asset_play";
    }, unknown, string>;
};
export default createResearchTools;
//# sourceMappingURL=research-tools.d.ts.map