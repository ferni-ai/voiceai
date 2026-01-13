/**
 * Decision Engine Types
 *
 * Type definitions for the outreach decision engine.
 *
 * @module services/outreach/decision-engine-types
 */
import type { AgentId } from '../agent-bus.js';
import type { OutreachChannel, RelationshipStage } from './persona-voice-generator.js';
export type OutreachTriggerType = 'commitment_check' | 'goal_milestone' | 'streak_at_risk' | 'streak_celebration' | 'goal_progress' | 'habit_check' | 'appointment_reminder' | 'event_countdown' | 'milestone_approaching' | 'emotional_support' | 'celebration' | 'concern_check' | 'reengagement' | 'thinking_of_you' | 'follow_up' | 'accountability' | 'personal_share' | 'check_in' | 'team_insight' | 'collaborative_support' | 'planning' | 'team_roundtable' | 'onboarding_welcome' | 'onboarding_nextday' | 'onboarding_topic_deepdive' | 'onboarding_first_week' | 'onboarding_momentum' | 'onboarding_two_week' | 'content_share' | 'insight_discovery' | 'growth_reflection' | 'shared_memory' | 'pattern_acknowledgment' | 'life_rhythm_prediction' | 'scheduled' | 'seasonal' | 'anniversary';
export type OutreachPriority = 'low' | 'medium' | 'high' | 'urgent';
export interface OutreachTrigger {
    id: string;
    type: OutreachTriggerType;
    userId: string;
    priority: OutreachPriority;
    reason: string;
    context?: Record<string, unknown>;
    commitment?: string;
    milestone?: string;
    goal?: string;
    event?: string;
    suggestedTime?: Date;
    expiresAt?: Date;
    suggestedPersona?: AgentId;
    lastPersona?: AgentId;
    wasRecentConversation?: boolean;
    createdAt: Date;
}
export interface OutreachDecision {
    trigger: OutreachTrigger;
    decision: 'send' | 'skip' | 'defer';
    skipReason?: string;
    deferUntil?: Date;
    decidedAt: Date;
    persona?: AgentId;
    channel?: OutreachChannel;
    scheduledFor?: Date;
    generatedMessage?: import('./persona-voice-generator.js').GeneratedOutreach;
}
export interface UserOutreachState {
    userId: string;
    outreachEnabled: boolean;
    allowedChannels: OutreachChannel[];
    preferences: {
        quietHoursStart: string;
        quietHoursEnd: string;
        timezone: string;
        maxPerDay: number;
        maxPerWeek: number;
        preferredChannel?: OutreachChannel;
        neverDuring?: string[];
    };
    patterns: {
        preferredHours: number[];
        preferredDays: number[];
        responseRateByChannel: Record<OutreachChannel, number>;
        avgResponseTimeMs: number;
    };
    counters: {
        outreachToday: number;
        outreachThisWeek: number;
        lastOutreachDate?: Date;
    };
    relationshipStage: RelationshipStage;
    lastPersona?: AgentId;
    lastConversationDate?: Date;
    context: {
        emotionalState?: string;
        recentTopics?: string[];
        recentWins?: string[];
        currentStruggles?: string[];
        upcomingEvents?: Array<{
            date: Date;
            description: string;
        }>;
        interests?: string[];
    };
}
export interface DecisionEngineConfig {
    checkIntervalMs: number;
    defaultQuietHoursStart: string;
    defaultQuietHoursEnd: string;
    defaultMaxPerDay: number;
    defaultMaxPerWeek: number;
    relationshipPermissions: {
        new: {
            allowedChannels: OutreachChannel[];
            maxPerWeek: number;
        };
        building: {
            allowedChannels: OutreachChannel[];
            maxPerWeek: number;
        };
        established: {
            allowedChannels: OutreachChannel[];
            maxPerWeek: number;
        };
        deep: {
            allowedChannels: OutreachChannel[];
            maxPerWeek: number;
        };
    };
    priorityWindows: {
        urgent: number;
        high: number;
        medium: number;
        low: number;
    };
}
//# sourceMappingURL=decision-engine-types.d.ts.map