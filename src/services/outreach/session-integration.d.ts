/**
 * Outreach Session Integration
 *
 * Hooks into session lifecycle to update outreach context
 * and detect opportunities based on conversation content.
 */
export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
}
export interface ConversationSummary {
    mainTopics: string[];
    keyPoints: string[];
    emotionalArc: string;
    commitments?: string[];
    followUps?: string[];
}
export interface SessionEndData {
    userId: string;
    sessionId: string;
    personaId: string;
    turns: ConversationTurn[];
    summary?: ConversationSummary;
    durationMinutes: number;
    satisfaction?: 'positive' | 'neutral' | 'negative' | 'unknown';
}
interface ExtractedCommitment {
    what: string;
    timeframe?: string;
    checkInDate: Date;
    originalText: string;
}
declare function extractCommitments(text: string): ExtractedCommitment[];
type DetectedEmotionalState = 'happy' | 'excited' | 'content' | 'neutral' | 'stressed' | 'anxious' | 'sad' | 'frustrated' | 'overwhelmed';
declare function detectEmotionalState(text: string): DetectedEmotionalState | null;
declare function extractWinsAndStruggles(text: string): {
    wins: string[];
    struggles: string[];
};
/**
 * Analyze a completed session and update outreach context
 */
export declare function analyzeSessionForOutreach(data: SessionEndData): Promise<{
    commitmentsFound: number;
    triggersCreated: number;
    contextUpdated: boolean;
}>;
/**
 * Quick analysis for real-time context updates during conversation
 */
export declare function analyzeMessageForContext(userId: string, message: string, role: 'user' | 'assistant'): void;
interface MayaHabitSessionResult {
    triggersCreated: number;
    streaksAtRisk: number;
    milestonesFound: number;
}
/**
 * Analyze a Maya session for habit-specific outreach triggers
 *
 * This runs after any session with Maya to:
 * 1. Check if any habit milestones were just hit
 * 2. Schedule streak protection alerts for tonight
 * 3. Set up follow-up outreach for habits discussed
 */
declare function analyzeMayaHabitSession(userId: string, sessionId: string): Promise<MayaHabitSessionResult>;
export { analyzeMayaHabitSession, detectEmotionalState, extractCommitments, extractWinsAndStruggles, type DetectedEmotionalState as EmotionalState, type ExtractedCommitment, };
//# sourceMappingURL=session-integration.d.ts.map