/**
 * Research Synthesis Tools
 *
 * These tools give Peter the ability to synthesize research at scale,
 * score evidence quality, and find counter-arguments - tasks that would
 * take humans weeks to do properly.
 *
 * "Better than Human" because: No human can read 50 papers in seconds
 * and synthesize them into actionable insights.
 *
 * @module tools/domains/research/superhuman-tools/research-synthesis
 */
import { llm } from '@livekit/agents';
export declare const scoreEvidenceQuality: llm.FunctionTool<{
    claim: string;
}, unknown, string>;
export declare const synthesizeResearch: llm.FunctionTool<{
    topic: string;
    depth: "standard" | "quick" | "comprehensive";
}, unknown, string>;
export declare const findCounterArguments: llm.FunctionTool<{
    belief: string;
    domain: "finance" | "productivity" | "relationships" | "health" | "general" | "career";
}, unknown, string>;
export declare const verifyClaim: llm.FunctionTool<{
    claim: string;
}, unknown, string>;
export declare const getBaseRate: llm.FunctionTool<{
    scenario: string;
    userEstimate?: number | undefined;
}, unknown, string>;
export declare const researchSynthesisTools: {
    scoreEvidenceQuality: llm.FunctionTool<{
        claim: string;
    }, unknown, string>;
    synthesizeResearch: llm.FunctionTool<{
        topic: string;
        depth: "standard" | "quick" | "comprehensive";
    }, unknown, string>;
    findCounterArguments: llm.FunctionTool<{
        belief: string;
        domain: "finance" | "productivity" | "relationships" | "health" | "general" | "career";
    }, unknown, string>;
    verifyClaim: llm.FunctionTool<{
        claim: string;
    }, unknown, string>;
    getBaseRate: llm.FunctionTool<{
        scenario: string;
        userEstimate?: number | undefined;
    }, unknown, string>;
};
export default researchSynthesisTools;
//# sourceMappingURL=research-synthesis.d.ts.map