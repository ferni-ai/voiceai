/**
 * Context Aggregator Service
 *
 * Pulls together all context about a user's life to inform outreach.
 * This is what makes outreach feel personal, not generic.
 *
 * Context Sources:
 * 1. Recent Conversations - What have we been talking about?
 * 2. Active Commitments - What did they say they'd do?
 * 3. Emotional State - How are they doing emotionally?
 * 4. Life Events - What's happening in their life?
 * 5. Progress & Struggles - What's going well? What's hard?
 * 6. Relationship History - Inside jokes, shared memories
 *
 * Philosophy: Know what's happening in their life before reaching out.
 */
import type { AgentId } from '../agent-bus.js';
export interface UserLifeContext {
    userId: string;
    updatedAt: Date;
    conversations: {
        lastConversation?: ConversationSummary;
        recentConversations: ConversationSummary[];
        topicsDiscussed: TopicMemory[];
        openLoops: OpenLoop[];
    };
    commitments: {
        active: Commitment[];
        recentCompleted: Commitment[];
        recentMissed: Commitment[];
    };
    emotional: {
        currentState: EmotionalState;
        recentEmotions: EmotionRecord[];
        knownTriggers: string[];
        knownSupports: string[];
        emotionalTrend: 'improving' | 'stable' | 'declining' | 'unknown';
    };
    lifeEvents: {
        upcoming: LifeEvent[];
        recent: LifeEvent[];
        ongoing: LifeEvent[];
        anniversaries: Anniversary[];
    };
    progress: {
        recentWins: Win[];
        currentStruggles: Struggle[];
        activeGoals: Goal[];
        streaks: Streak[];
        atRiskItems: string[];
    };
    relationship: {
        stage: 'new' | 'building' | 'established' | 'deep';
        startDate?: Date;
        totalConversations: number;
        significantMoments: SignificantMoment[];
        insideJokes: string[];
        sharedReferences: string[];
        preferredPersona?: AgentId;
        lastInteractionDate?: Date;
    };
    personal: {
        interests: string[];
        preferences: string[];
        family?: string[];
        workInfo?: string;
        timezone?: string;
        phone?: string;
        email?: string;
        firstName?: string;
        preferredName?: string;
    };
}
export interface ConversationSummary {
    id: string;
    date: Date;
    persona: AgentId;
    duration: number;
    summary: string;
    topics: string[];
    emotionalTone: string;
    commitmentsMade: string[];
    keyMoments: string[];
}
export interface TopicMemory {
    topic: string;
    lastMentioned: Date;
    timesDiscussed: number;
    sentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
    relatedCommitments?: string[];
}
export interface OpenLoop {
    id: string;
    description: string;
    createdAt: Date;
    context: string;
    importance: 'low' | 'medium' | 'high';
    followUpNeeded: boolean;
}
export interface Commitment {
    id: string;
    what: string;
    when: Date;
    checkInTime?: Date;
    status: 'pending' | 'completed' | 'missed' | 'rescheduled';
    context?: string;
    createdAt: Date;
}
export type EmotionalState = 'thriving' | 'good' | 'stable' | 'struggling' | 'crisis';
export interface EmotionRecord {
    date: Date;
    state: EmotionalState;
    trigger?: string;
    notes?: string;
}
export interface LifeEvent {
    id: string;
    type: 'appointment' | 'celebration' | 'deadline' | 'travel' | 'social' | 'health' | 'work' | 'family' | 'other';
    description: string;
    date: Date;
    importance: 'low' | 'medium' | 'high';
    linkedCommitments?: string[];
    followUpSent?: boolean;
}
export interface Anniversary {
    type: 'relationship_start' | 'milestone' | 'personal' | 'other';
    description: string;
    date: Date;
    yearsAgo?: number;
}
export interface Win {
    id: string;
    description: string;
    date: Date;
    category: string;
    celebrated: boolean;
    significance: 'small' | 'medium' | 'big';
}
export interface Struggle {
    id: string;
    description: string;
    startDate: Date;
    category: string;
    supportProvided: boolean;
    resolved: boolean;
}
export interface Goal {
    id: string;
    title: string;
    category: string;
    progressPercent: number;
    status: 'on-track' | 'at-risk' | 'behind' | 'completed';
    lastUpdated: Date;
}
export interface Streak {
    id: string;
    habit: string;
    currentDays: number;
    longestDays: number;
    isAtRisk: boolean;
}
export interface SignificantMoment {
    id: string;
    date: Date;
    description: string;
    type: 'breakthrough' | 'celebration' | 'vulnerable_moment' | 'milestone' | 'funny';
}
/**
 * Get or create user context (sync - uses cache or creates default)
 * For hydrated data from Firestore, call loadUserContextFromFirestore first
 */
export declare function getUserContext(userId: string): UserLifeContext;
/**
 * Load user context from Firestore (async)
 */
export declare function loadUserContextFromFirestore(userId: string): Promise<UserLifeContext>;
/**
 * Record a conversation for context
 */
export declare function recordConversation(userId: string, conversation: Omit<ConversationSummary, 'id'>): void;
/**
 * Add a commitment
 */
export declare function addCommitment(userId: string, commitment: Omit<Commitment, 'id'>): string;
/**
 * Update commitment status
 */
export declare function updateCommitmentStatus(userId: string, commitmentId: string, status: Commitment['status']): void;
/**
 * Add an open loop (unresolved topic)
 */
export declare function addOpenLoop(userId: string, loop: Omit<OpenLoop, 'id'>): string;
/**
 * Resolve an open loop
 */
export declare function resolveOpenLoop(userId: string, loopId: string): void;
/**
 * Update emotional state
 */
export declare function updateEmotionalState(userId: string, state: EmotionalState, trigger?: string, notes?: string): void;
/**
 * Add a life event
 */
export declare function addLifeEvent(userId: string, event: Omit<LifeEvent, 'id'>): string;
/**
 * Add an ongoing life situation
 */
export declare function addOngoingEvent(userId: string, event: Omit<LifeEvent, 'id'>): string;
/**
 * Add a win
 */
export declare function addWin(userId: string, win: Omit<Win, 'id'>): string;
/**
 * Add a struggle
 */
export declare function addStruggle(userId: string, struggle: Omit<Struggle, 'id'>): string;
/**
 * Resolve a struggle
 */
export declare function resolveStruggle(userId: string, struggleId: string): void;
/**
 * Add a significant moment
 */
export declare function addSignificantMoment(userId: string, moment: Omit<SignificantMoment, 'id'>): string;
/**
 * Add an inside joke
 */
export declare function addInsideJoke(userId: string, joke: string): void;
/**
 * Update personal info
 */
export declare function updatePersonalInfo(userId: string, info: Partial<UserLifeContext['personal']>): void;
/**
 * Get context summary for outreach message generation
 */
export declare function getContextForOutreach(userId: string): {
    emotionalState: EmotionalState;
    emotionalTrend: string;
    recentTopics: string[];
    activeCommitments: string[];
    recentWins: string[];
    currentStruggles: string[];
    upcomingEvents: string[];
    openLoops: string[];
    relationshipStage: string;
    insideJokes: string[];
    lastConversationSummary?: string;
};
/**
 * Check if user needs support
 */
export declare function needsSupport(userId: string): {
    needsSupport: boolean;
    reason?: string;
    priority: 'low' | 'medium' | 'high';
};
/**
 * Get items that need follow-up
 */
export declare function getFollowUpItems(userId: string): Array<{
    type: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
}>;
export declare function clearUserContext(userId: string): void;
/**
 * Prune old data to prevent memory growth
 */
export declare function pruneOldData(maxAgeDays?: number): number;
declare const _default: {
    getUserContext: typeof getUserContext;
    recordConversation: typeof recordConversation;
    addCommitment: typeof addCommitment;
    updateCommitmentStatus: typeof updateCommitmentStatus;
    addOpenLoop: typeof addOpenLoop;
    resolveOpenLoop: typeof resolveOpenLoop;
    updateEmotionalState: typeof updateEmotionalState;
    addLifeEvent: typeof addLifeEvent;
    addOngoingEvent: typeof addOngoingEvent;
    addWin: typeof addWin;
    addStruggle: typeof addStruggle;
    resolveStruggle: typeof resolveStruggle;
    addSignificantMoment: typeof addSignificantMoment;
    addInsideJoke: typeof addInsideJoke;
    updatePersonalInfo: typeof updatePersonalInfo;
    getContextForOutreach: typeof getContextForOutreach;
    needsSupport: typeof needsSupport;
    getFollowUpItems: typeof getFollowUpItems;
    clearUserContext: typeof clearUserContext;
    pruneOldData: typeof pruneOldData;
};
export default _default;
//# sourceMappingURL=context-aggregator.d.ts.map