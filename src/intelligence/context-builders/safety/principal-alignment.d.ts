/**
 * Principal Alignment Context Builder
 *
 * > "When Ferni's interests conflict with the user's actual wellbeing, which wins?"
 *
 * This builder integrates the Principal Alignment module into the LLM context,
 * ensuring the agent serves users' genuine interests over engagement metrics,
 * validation-seeking, or sycophancy disguised as rapport-building.
 *
 * Core injections:
 * - Truth Obligations (when we MUST deliver difficult truths)
 * - Unhealthy Attachment warnings (AI replacing human connection)
 * - Human Referral triggers (when professional help is needed)
 * - Values Conflict surfacing (proactive values alignment)
 * - Manipulation Self-Check (ensuring authentic responses)
 * - Transparency Requirements (being honest about limitations)
 *
 * @module PrincipalAlignmentContextBuilder
 */
/**
 * Check agent response for manipulation risks BEFORE sending to user
 *
 * This is called by the response processor after LLM generates response
 * but before it's spoken to the user.
 */
export declare function checkResponsePrincipalAlignment(agentResponse: string, context: {
    userMessage: string;
    userId: string;
    turnCount: number;
    userEmotion?: string;
    topicWeight?: 'light' | 'medium' | 'heavy';
}): Promise<{
    safe: boolean;
    warnings: string[];
    corrections: string[];
}>;
//# sourceMappingURL=principal-alignment.d.ts.map