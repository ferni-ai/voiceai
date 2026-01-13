/**
 * Session state management for Alex's communication insights.
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/session
 */
interface AlexSession {
    briefingTurn: number;
    followUpsRaised: Set<string>;
}
export declare function getSession(sessionId: string): AlexSession;
export declare function clearAlexCommunicationSession(sessionId: string): void;
export {};
//# sourceMappingURL=session.d.ts.map