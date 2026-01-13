/**
 * External Data Integration Tools
 *
 * These tools integrate external data sources to provide context that
 * individuals typically don't have access to: local economic conditions,
 * industry trends, news sentiment, and personal inflation calculations.
 *
 * "Better than Human" because: No friend has real-time access to economic
 * data synthesized specifically for your situation.
 *
 * @module tools/domains/research/superhuman-tools/external-data
 */
import { llm } from '@livekit/agents';
export declare const getLocalEconomics: llm.FunctionTool<{
    location: string;
}, unknown, string>;
export declare const synthesizeIndustryTrends: llm.FunctionTool<{
    industry: string;
}, unknown, string>;
export declare const analyzeNewsSentiment: llm.FunctionTool<{
    topic: string;
}, unknown, string>;
export declare const recordSpending: llm.FunctionTool<{
    category: "entertainment" | "education" | "other" | "healthcare" | "housing" | "food" | "utilities" | "transportation" | "childcare" | "clothing";
    amount: number;
    description?: string | undefined;
}, unknown, string>;
export declare const calculatePersonalInflation: llm.FunctionTool<{
    monthlyIncome?: number | undefined;
}, unknown, string>;
export declare const externalDataTools: {
    getLocalEconomics: llm.FunctionTool<{
        location: string;
    }, unknown, string>;
    synthesizeIndustryTrends: llm.FunctionTool<{
        industry: string;
    }, unknown, string>;
    analyzeNewsSentiment: llm.FunctionTool<{
        topic: string;
    }, unknown, string>;
    recordSpending: llm.FunctionTool<{
        category: "entertainment" | "education" | "other" | "healthcare" | "housing" | "food" | "utilities" | "transportation" | "childcare" | "clothing";
        amount: number;
        description?: string | undefined;
    }, unknown, string>;
    calculatePersonalInflation: llm.FunctionTool<{
        monthlyIncome?: number | undefined;
    }, unknown, string>;
};
export default externalDataTools;
//# sourceMappingURL=external-data.d.ts.map