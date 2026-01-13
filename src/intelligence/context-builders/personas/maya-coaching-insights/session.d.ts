/**
 * Session state management for Maya's coaching insights.
 *
 * @module intelligence/context-builders/personas/maya-coaching-insights/session
 */
interface MayaSession {
    briefingTurn: number;
    celebratedWins: Set<string>;
    coachingApproaches: string[];
}
export declare function getSession(sessionId: string): MayaSession;
export declare function clearMayaCoachingSession(sessionId: string): void;
export {};
//# sourceMappingURL=session.d.ts.map