/**
 * Network & Relationship Analytics Tools
 *
 * These tools analyze relationship patterns, communication health,
 * influence mapping, and network gaps. Understanding your social
 * network is crucial for life outcomes but nearly impossible to
 * do objectively yourself.
 *
 * "Better than Human" because: No friend can objectively analyze
 * your relationship patterns without their own biases.
 *
 * @module tools/domains/research/superhuman-tools/network-analytics
 */
import { llm } from '@livekit/agents';
export declare const trackRelationship: llm.FunctionTool<{
    name: string;
    relationship: "family" | "acquaintance" | "friend" | "partner" | "mentor" | "colleague" | "mentee";
    energyImpact: "neutral" | "draining" | "energizing";
    influenceDomains?: string[] | undefined;
}, unknown, string>;
export declare const logInteraction: llm.FunctionTool<{
    name: string;
    type: "email" | "text" | "social" | "call" | "video" | "in_person";
    quality: number;
    topic?: string | undefined;
}, unknown, string>;
export declare const analyzeCommunicationPatterns: llm.FunctionTool<Record<string, never>, unknown, string>;
export declare const scoreRelationshipHealth: llm.FunctionTool<{
    name: string;
}, unknown, string>;
export declare const mapInfluence: llm.FunctionTool<Record<string, never>, unknown, string>;
export declare const analyzeNetworkGaps: llm.FunctionTool<{
    goals: string[];
}, unknown, string>;
export declare const networkAnalyticsTools: {
    trackRelationship: llm.FunctionTool<{
        name: string;
        relationship: "family" | "acquaintance" | "friend" | "partner" | "mentor" | "colleague" | "mentee";
        energyImpact: "neutral" | "draining" | "energizing";
        influenceDomains?: string[] | undefined;
    }, unknown, string>;
    logInteraction: llm.FunctionTool<{
        name: string;
        type: "email" | "text" | "social" | "call" | "video" | "in_person";
        quality: number;
        topic?: string | undefined;
    }, unknown, string>;
    analyzeCommunicationPatterns: llm.FunctionTool<Record<string, never>, unknown, string>;
    scoreRelationshipHealth: llm.FunctionTool<{
        name: string;
    }, unknown, string>;
    mapInfluence: llm.FunctionTool<Record<string, never>, unknown, string>;
    analyzeNetworkGaps: llm.FunctionTool<{
        goals: string[];
    }, unknown, string>;
};
export default networkAnalyticsTools;
//# sourceMappingURL=network-analytics.d.ts.map