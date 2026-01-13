/**
 * Cross-Agent Awareness Service
 *
 * Enables personas to know what their teammates discussed with the user.
 * This creates the feeling of a coordinated team that talks behind the scenes.
 *
 * Example: "Maya mentioned you've been stressed about budgeting - I wanted to
 * check in on how you're feeling about money and life balance."
 *
 * PERSISTENCE: Uses Firestore for cross-session awareness with in-memory caching.
 */
import type { AgentId } from './agent-bus.js';
export interface TeamConversationSummary {
    agentId: string;
    agentName: string;
    timestamp: Date;
    topics: string[];
    emotionalTone: 'positive' | 'neutral' | 'struggling' | 'celebratory';
    keyMoments: string[];
    userGoals?: string[];
    userConcerns?: string[];
    followUpNeeded?: boolean;
}
export interface CrossAgentContext {
    recentTeamInteractions: TeamConversationSummary[];
    sharedGoals: string[];
    teamNotes: TeamNote[];
}
export interface TeamNote {
    fromAgent: string;
    toAgent: string | '*';
    content: string;
    timestamp: Date;
    priority: 'low' | 'medium' | 'high';
    acknowledged: boolean;
}
/**
 * Record a conversation summary for cross-agent awareness
 */
export declare function recordConversationForTeam(userId: string, summary: TeamConversationSummary): Promise<void>;
/**
 * Get what other team members discussed with this user
 */
export declare function getTeamContext(userId: string, currentAgentId: string): Promise<CrossAgentContext>;
/**
 * Add a team note from one agent to another (or all)
 * e.g., "Hey team, user is going through a tough time with their job search"
 */
export declare function addTeamNote(userId: string, note: Omit<TeamNote, 'timestamp' | 'acknowledged'>): Promise<void>;
/**
 * Acknowledge a team note (mark as read)
 */
export declare function acknowledgeTeamNote(userId: string, noteTimestamp: Date, _agentId: string): Promise<void>;
/**
 * Format cross-agent context for prompt injection
 */
export declare function formatCrossAgentContextForPrompt(context: CrossAgentContext, _currentAgentId: string): string;
/**
 * Generate a natural team reference phrase
 */
export declare function generateTeamReferencePhrases(context: CrossAgentContext, _currentAgentId: string): string[];
/**
 * Analyze a conversation and extract a summary for team sharing
 */
export declare function analyzeConversationForTeam(agentId: string, conversationText: string, userEmotions: string[]): TeamConversationSummary;
/**
 * Call at end of session to record what was discussed
 */
export declare function recordSessionForTeam(userId: string, agentId: AgentId, conversationSummary: string, userEmotions: string[]): Promise<void>;
/**
 * Initialize cross-agent awareness for a user
 */
export declare function initializeCrossAgentAwareness(userId: string): Promise<void>;
/**
 * Clear caches (for testing)
 */
export declare function clearCrossAgentCaches(): void;
//# sourceMappingURL=cross-agent-awareness.d.ts.map