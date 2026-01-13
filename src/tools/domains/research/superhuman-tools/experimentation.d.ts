/**
 * Personal Experimentation Tools
 *
 * These tools help users apply scientific method to their own lives:
 * A/B testing, Bayesian belief updating, hypothesis tracking,
 * confound detection, and effect size calculation.
 *
 * "Better than Human" because: No friend can help you design proper
 * experiments and interpret results without bias.
 *
 * @module tools/domains/research/superhuman-tools/experimentation
 */
import { llm } from '@livekit/agents';
export declare const designExperiment: llm.FunctionTool<{
    hypothesis: string;
    intervention: string;
    metric: string;
    duration: number;
}, unknown, string>;
export declare const recordExperimentData: llm.FunctionTool<{
    value: number;
    condition: "control" | "treatment";
    notes?: string | undefined;
}, unknown, string>;
export declare const analyzeExperiment: llm.FunctionTool<Record<string, never>, unknown, string>;
export declare const createBelief: llm.FunctionTool<{
    statement: string;
    initialProbability: number;
}, unknown, string>;
export declare const updateBelief: llm.FunctionTool<{
    beliefKeyword: string;
    evidence: string;
    direction: "neutral" | "supports" | "opposes";
    strength: "moderate" | "strong" | "weak";
}, unknown, string>;
export declare const trackHypothesis: llm.FunctionTool<{
    hypothesis: string;
    domain: "habits" | "productivity" | "relationships" | "health" | "finances" | "other" | "career";
}, unknown, string>;
export declare const updateHypothesis: llm.FunctionTool<{
    hypothesisKeyword: string;
    evidence?: string | undefined;
    newStatus?: "testing" | "confirmed" | "inconclusive" | "refuted" | undefined;
}, unknown, string>;
export declare const detectConfounds: llm.FunctionTool<{
    observation: string;
    domain: "habits" | "productivity" | "relationships" | "health" | "finances";
}, unknown, string>;
export declare const calculateEffectSize: llm.FunctionTool<{
    beforeValues: number[];
    afterValues: number[];
    context: string;
}, unknown, string>;
export declare const experimentationTools: {
    designExperiment: llm.FunctionTool<{
        hypothesis: string;
        intervention: string;
        metric: string;
        duration: number;
    }, unknown, string>;
    recordExperimentData: llm.FunctionTool<{
        value: number;
        condition: "control" | "treatment";
        notes?: string | undefined;
    }, unknown, string>;
    analyzeExperiment: llm.FunctionTool<Record<string, never>, unknown, string>;
    createBelief: llm.FunctionTool<{
        statement: string;
        initialProbability: number;
    }, unknown, string>;
    updateBelief: llm.FunctionTool<{
        beliefKeyword: string;
        evidence: string;
        direction: "neutral" | "supports" | "opposes";
        strength: "moderate" | "strong" | "weak";
    }, unknown, string>;
    trackHypothesis: llm.FunctionTool<{
        hypothesis: string;
        domain: "habits" | "productivity" | "relationships" | "health" | "finances" | "other" | "career";
    }, unknown, string>;
    updateHypothesis: llm.FunctionTool<{
        hypothesisKeyword: string;
        evidence?: string | undefined;
        newStatus?: "testing" | "confirmed" | "inconclusive" | "refuted" | undefined;
    }, unknown, string>;
    detectConfounds: llm.FunctionTool<{
        observation: string;
        domain: "habits" | "productivity" | "relationships" | "health" | "finances";
    }, unknown, string>;
    calculateEffectSize: llm.FunctionTool<{
        beforeValues: number[];
        afterValues: number[];
        context: string;
    }, unknown, string>;
};
export default experimentationTools;
//# sourceMappingURL=experimentation.d.ts.map