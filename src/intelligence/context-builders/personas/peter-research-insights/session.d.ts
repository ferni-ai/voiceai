/**
 * Session state management for Peter's research insights.
 *
 * @module intelligence/context-builders/personas/peter-research-insights/session
 */
interface PeterSession {
    /** Insights already surfaced this session */
    surfacedInsights: Set<string>;
    /** Turn when briefing was delivered */
    briefingTurn: number;
    /** Whether initial briefing was given */
    initialBriefingGiven: boolean;
}
export declare function getSession(sessionId: string): PeterSession;
export declare function clearPeterResearchSession(sessionId: string): void;
export {};
//# sourceMappingURL=session.d.ts.map