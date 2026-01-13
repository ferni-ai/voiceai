/**
 * Advanced Financial Research Tools
 *
 * These tools give Peter institutional-grade financial research capabilities:
 * SEC filing analysis, insider trading tracking, options flow, and
 * macro-to-personal impact analysis.
 *
 * "Better than Human" because: Individual investors rarely have access to
 * the research tools that institutions use.
 *
 * @module tools/domains/research/superhuman-tools/financial-research
 */
import { llm } from '@livekit/agents';
export declare const analyzeSECFiling: llm.FunctionTool<{
    symbol: string;
    filingType: "10-K" | "10-Q" | "latest";
}, unknown, string>;
export declare const trackInsiderTrading: llm.FunctionTool<{
    symbol: string;
}, unknown, string>;
export declare const analyzeOptionsFlow: llm.FunctionTool<{
    symbol: string;
}, unknown, string>;
export declare const bridgeMacroToPersonal: llm.FunctionTool<{
    macroEvent: "fed_rate_hike" | "fed_rate_cut" | "inflation_rising" | "inflation_falling" | "recession_declared" | "unemployment_rising" | "housing_cooling" | "stock_market_correction" | "dollar_strengthening" | "dollar_weakening";
    personalContext?: string | undefined;
}, unknown, string>;
export declare const financialResearchTools: {
    analyzeSECFiling: llm.FunctionTool<{
        symbol: string;
        filingType: "10-K" | "10-Q" | "latest";
    }, unknown, string>;
    trackInsiderTrading: llm.FunctionTool<{
        symbol: string;
    }, unknown, string>;
    analyzeOptionsFlow: llm.FunctionTool<{
        symbol: string;
    }, unknown, string>;
    bridgeMacroToPersonal: llm.FunctionTool<{
        macroEvent: "fed_rate_hike" | "fed_rate_cut" | "inflation_rising" | "inflation_falling" | "recession_declared" | "unemployment_rising" | "housing_cooling" | "stock_market_correction" | "dollar_strengthening" | "dollar_weakening";
        personalContext?: string | undefined;
    }, unknown, string>;
};
export default financialResearchTools;
//# sourceMappingURL=financial-research.d.ts.map