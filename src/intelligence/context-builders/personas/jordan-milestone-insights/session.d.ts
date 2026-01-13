/**
 * Jordan Milestone Insights - Session State
 *
 * Session state management for Jordan's milestone planning context builder.
 *
 * @module intelligence/context-builders/jordan-milestone-insights/session
 */
export interface JordanSession {
    briefingTurn: number;
    celebratedMilestones: Set<string>;
    surfacedInsights: Set<string>;
}
export declare function getSession(sessionId: string): JordanSession;
export declare function clearJordanMilestoneSession(sessionId: string): void;
export declare function clearAllJordanMilestoneSessions(): void;
//# sourceMappingURL=session.d.ts.map