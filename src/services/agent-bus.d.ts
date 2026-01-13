/**
 * Agent Message Bus - Cross-Agent Communication System
 *
 * Enables Jordan, Maya, Alex, Jack, and Peter to:
 * - Execute each other's tools
 * - Share context and state
 * - Coordinate on complex tasks
 * - Handle handoffs with full context preservation
 */
import { EventEmitter } from 'events';
export type { AgentId } from '../types/agent-ids.js';
import type { AgentId } from '../types/agent-ids.js';
export interface AgentMessage {
    id: string;
    timestamp: Date;
    fromAgent: AgentId;
    toAgent: AgentId;
    type: 'tool_request' | 'tool_response' | 'context_share' | 'notification';
    payload: AgentMessagePayload;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    userId?: string;
    sessionId?: string;
}
export interface AgentMessagePayload {
    toolName?: string;
    toolParams?: Record<string, unknown>;
    context?: Record<string, unknown>;
    result?: string;
    success?: boolean;
    error?: string;
    notificationType?: string;
    notificationData?: Record<string, unknown>;
}
export interface ToolExecutionRequest {
    toolName: string;
    params: Record<string, unknown>;
    userId?: string;
    sessionId?: string;
    context?: Record<string, unknown>;
}
export interface ToolExecutionResult {
    success: boolean;
    result?: string;
    error?: string;
    executedBy: AgentId;
}
declare class AgentBus extends EventEmitter {
    private messages;
    private pendingRequests;
    private toolHandlers;
    private userRateLimits;
    private globalRateLimit;
    constructor();
    /**
     * Check if a request should be rate limited
     */
    private checkRateLimit;
    /**
     * Get current rate limit status for monitoring
     */
    getRateLimitStatus(userId?: string): {
        globalUsage: number;
        userUsage?: number;
    };
    private generateId;
    /**
     * Send a tool execution request to another agent
     */
    requestToolExecution(fromAgent: AgentId, toAgent: AgentId, toolName: string, toolParams: Record<string, unknown>, userId?: string, sessionId?: string, context?: Record<string, unknown>): Promise<ToolExecutionResult>;
    /**
     * Share context between agents
     */
    shareContext(fromAgent: AgentId, toAgent: AgentId, context: Record<string, unknown>, userId?: string): void;
    /**
     * Send a notification to an agent
     */
    notify(fromAgent: AgentId, toAgent: AgentId, notificationType: string, data: Record<string, unknown>, userId?: string): void;
    /**
     * Register a tool handler for an agent
     */
    registerToolHandler(agent: AgentId, toolName: string, handler: (request: ToolExecutionRequest) => Promise<ToolExecutionResult>): void;
    /**
     * Unregister a tool handler
     */
    unregisterToolHandler(agent: AgentId, toolName: string): void;
    private addToPending;
    /**
     * Get pending messages for an agent
     */
    getPendingMessages(agent: AgentId): AgentMessage[];
    /**
     * Clear pending messages for an agent
     */
    clearPendingMessages(agent: AgentId): void;
    /**
     * Get messages between two agents
     */
    getMessagesBetween(agent1: AgentId, agent2: AgentId, limit?: number): AgentMessage[];
    /**
     * Get all messages for a user
     */
    getMessagesForUser(userId: string, limit?: number): AgentMessage[];
    /**
     * Get shared context for a user from all agents
     */
    getSharedContextForUser(userId: string): Record<string, unknown>;
}
export declare function getAgentBus(): AgentBus;
/**
 * Jordan requests Maya to create a savings goal
 */
export declare function jordanRequestMayaSavingsGoal(goalName: string, targetAmount: number, deadline?: string, userId?: string): Promise<ToolExecutionResult>;
/**
 * Jordan requests Maya to allocate budget
 */
export declare function jordanRequestMayaBudget(budgetName: string, totalAmount: number, categories: Record<string, number>, userId?: string): Promise<ToolExecutionResult>;
/**
 * Jordan requests Alex to schedule an event
 */
export declare function jordanRequestAlexSchedule(eventName: string, date: string, reminderDays?: number[], userId?: string): Promise<ToolExecutionResult>;
/**
 * Jordan requests Alex to set up reminders
 */
export declare function jordanRequestAlexReminders(milestoneName: string, checkInFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly', userId?: string): Promise<ToolExecutionResult>;
/**
 * Jordan shares milestone context with Maya
 */
export declare function jordanShareMilestoneWithMaya(milestoneId: string, milestoneName: string, budget: number, targetDate?: Date, userId?: string): void;
/**
 * Jordan shares milestone context with Alex
 */
export declare function jordanShareMilestoneWithAlex(milestoneId: string, milestoneName: string, targetDate?: Date, checklistItems?: string[], userId?: string): void;
/**
 * Maya shares savings progress with Jordan
 */
export declare function mayaShareProgressWithJordan(milestoneId: string, progress: {
    currentAmount: number;
    targetAmount: number;
    percentComplete: number;
    onTrack: boolean;
    projectedCompletionDate?: string;
}, userId?: string): void;
/**
 * Maya notifies Jordan of budget milestone
 */
export declare function mayaNotifyJordanBudgetAlert(milestoneId: string, alertType: 'on_track' | 'ahead' | 'behind' | 'overspent' | 'completed', message: string, userId?: string): void;
/**
 * Alex shares scheduled events with Jordan
 */
export declare function alexShareScheduleWithJordan(milestoneId: string, events: Array<{
    eventId: string;
    title: string;
    date: string;
    status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
}>, userId?: string): void;
/**
 * Alex notifies Jordan of appointment confirmation
 */
export declare function alexNotifyJordanAppointmentUpdate(milestoneId: string, appointmentId: string, status: 'confirmed' | 'rescheduled' | 'cancelled', details: string, userId?: string): void;
/**
 * Ferni requests team status summary
 */
export declare function ferniRequestTeamStatus(userId?: string): Promise<{
    maya: ToolExecutionResult;
    alex: ToolExecutionResult;
    jordan: ToolExecutionResult;
}>;
/**
 * Ferni shares context with entire team
 */
export declare function ferniShareContextWithTeam(context: Record<string, unknown>, userId?: string): void;
/**
 * Ferni notifies team of user mood/context change
 */
export declare function ferniNotifyTeamUserContext(userMood: 'stressed' | 'excited' | 'neutral' | 'anxious' | 'celebratory', context: string, userId?: string): void;
/**
 * Jordan requests investment strategy from Jack (for retirement/long-term goals)
 */
export declare function jordanRequestJackInvestmentStrategy(goalId: string, goalName: string, targetAmount: number, timelineYears: number, riskTolerance: 'conservative' | 'moderate' | 'aggressive', userId?: string): Promise<ToolExecutionResult>;
/**
 * Jordan requests stock research from Peter (for specific investment ideas)
 */
export declare function jordanRequestPeterResearch(topic: string, context: string, userId?: string): Promise<ToolExecutionResult>;
/**
 * Jordan shares retirement goal with Jack
 */
export declare function jordanShareRetirementWithJack(retirementPlan: {
    currentAge: number;
    targetAge: number;
    monthlyIncome: number;
    currentSavings: number;
    style: string;
}, userId?: string): void;
/**
 * Maya requests Alex to schedule financial review
 */
export declare function mayaRequestAlexFinancialReview(reviewType: 'budget_check' | 'savings_review' | 'subscription_audit' | 'quarterly_review', frequency: 'once' | 'weekly' | 'monthly' | 'quarterly', userId?: string): Promise<ToolExecutionResult>;
/**
 * Alex shares appointment cost with Maya (for budget tracking)
 */
export declare function alexShareAppointmentCostWithMaya(appointmentId: string, appointmentName: string, estimatedCost: number, category: string, milestoneId?: string, userId?: string): void;
/**
 * Maya notifies Alex of budget constraint
 */
export declare function mayaNotifyAlexBudgetConstraint(milestoneId: string, remainingBudget: number, message: string, userId?: string): void;
/**
 * Alex notifies Maya of recurring expense
 */
export declare function alexNotifyMayaRecurringExpense(expenseName: string, amount: number, frequency: 'daily' | 'weekly' | 'monthly' | 'yearly', category: string, userId?: string): void;
export default getAgentBus;
//# sourceMappingURL=agent-bus.d.ts.map