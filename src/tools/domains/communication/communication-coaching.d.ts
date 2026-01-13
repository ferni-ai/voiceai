/**
 * Communication Coaching Tools
 *
 * Tools to help users with communication challenges:
 * - Draft difficult messages with proper frameworks
 * - Practice conversations with role-play scenarios
 * - Get feedback on existing communications
 * - Navigate workplace relationships
 * - Build assertive communication skills
 *
 * NOTE: For new code, use `tools/domains/communication/index.ts` instead.
 */
import { llm } from '@livekit/agents';
export declare function createCommunicationCoachingTools(): {
    draftDifficultMessage: llm.FunctionTool<{
        conversationType: "other" | "asking_for_raise" | "asking_for_promotion" | "giving_feedback" | "receiving_feedback" | "declining_request" | "setting_boundary" | "following_up" | "delivering_bad_news" | "resolving_conflict" | "negotiating_deadline" | "addressing_issue" | "building_relationship";
        recipient: string;
        context: string;
        keyPoints: string;
        desiredOutcome: string;
        format: "script" | "email" | "text" | "slack" | "talking_points";
        tone: "professional" | "warm" | "direct" | "friendly" | "formal" | "diplomatic";
    }, unknown, string>;
    practiceConversation: llm.FunctionTool<{
        scenario: string;
        otherPerson: string;
        userGoal: string;
        anticipatedChallenges?: string | undefined;
    }, unknown, string>;
    reviewMessage: llm.FunctionTool<{
        message: string;
        context: string;
        concern?: string | undefined;
    }, unknown, string>;
    planCommunicationStrategy: llm.FunctionTool<{
        situation: string;
        stakeholders: string;
        goal: string;
        constraints?: string | undefined;
        timeline?: string | undefined;
    }, unknown, string>;
    checkTone: llm.FunctionTool<{
        message: string;
        intendedTone: string;
    }, unknown, string>;
    transformTone: llm.FunctionTool<{
        message: string;
        currentTone: string;
        targetTone: "softer" | "warmer" | "more_direct" | "more_formal" | "more_casual" | "more_assertive";
    }, unknown, string>;
    buildAssertiveResponse: llm.FunctionTool<{
        situation: string;
        whatUserWants: string;
        currentResponse?: string | undefined;
        fear?: string | undefined;
    }, unknown, string>;
    planFollowUp: llm.FunctionTool<{
        originalRequest: string;
        recipient: string;
        daysSinceOriginal: number;
        previousFollowUps: number;
        urgency: "medium" | "low" | "high";
    }, unknown, string>;
    analyzeIncomingMessage: llm.FunctionTool<{
        incomingMessage: string;
        sender: string;
        userContext?: string | undefined;
        userGoal?: string | undefined;
    }, unknown, string>;
    analyzeCommPattern: llm.FunctionTool<{
        sampleMessages: string;
        context: string;
        challenge: string;
    }, unknown, string>;
};
export default createCommunicationCoachingTools;
//# sourceMappingURL=communication-coaching.d.ts.map