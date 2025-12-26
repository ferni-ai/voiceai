/**
 * Agent Message Bus - Cross-Agent Communication System
 *
 * Enables Jordan, Maya, Alex, Jack, and Peter to:
 * - Execute each other's tools
 * - Share context and state
 * - Coordinate on complex tasks
 * - Handle handoffs with full context preservation
 */

import { getLogger } from '../utils/safe-logger.js';
import { EventEmitter } from 'events';

// ============================================================================
// RATE LIMITING
// ============================================================================

interface RateLimitState {
  requestCount: number;
  windowStart: number;
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute per user
const MAX_TOTAL_REQUESTS_PER_WINDOW = 500; // 500 total requests per minute

// ============================================================================
// TYPES
// ============================================================================

// Re-export AgentId from types layer for backward compatibility
// New code should import from '../types/agent-ids.js'
export type { AgentId } from '../types/agent-ids.js';

// Import for use within this module
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
  // For tool_request
  toolName?: string;
  toolParams?: Record<string, unknown>;
  context?: Record<string, unknown>; // Additional context for tool execution

  // For tool_response
  result?: string;
  success?: boolean;
  error?: string;

  // For notification
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

// ============================================================================
// AGENT BUS SINGLETON
// ============================================================================

class AgentBus extends EventEmitter {
  private messages = new Map<string, AgentMessage>();
  private pendingRequests = new Map<string, AgentMessage[]>();
  private toolHandlers = new Map<
    string,
    (request: ToolExecutionRequest) => Promise<ToolExecutionResult>
  >();

  // Rate limiting
  private userRateLimits = new Map<string, RateLimitState>();
  private globalRateLimit: RateLimitState = { requestCount: 0, windowStart: Date.now() };

  constructor() {
    super();
    getLogger().info('🚌 Agent Message Bus initialized');
  }

  /**
   * Check if a request should be rate limited
   */
  private checkRateLimit(userId?: string): { allowed: boolean; reason?: string } {
    const now = Date.now();

    // Reset global rate limit window if needed
    if (now - this.globalRateLimit.windowStart > RATE_LIMIT_WINDOW_MS) {
      this.globalRateLimit = { requestCount: 0, windowStart: now };
    }

    // Check global rate limit
    if (this.globalRateLimit.requestCount >= MAX_TOTAL_REQUESTS_PER_WINDOW) {
      getLogger().warn(
        { totalRequests: this.globalRateLimit.requestCount },
        'Global rate limit exceeded'
      );
      return {
        allowed: false,
        reason: 'System is experiencing high load. Please try again in a moment.',
      };
    }

    // Check per-user rate limit
    if (userId) {
      let userLimit = this.userRateLimits.get(userId);

      // Reset window if needed
      if (!userLimit || now - userLimit.windowStart > RATE_LIMIT_WINDOW_MS) {
        userLimit = { requestCount: 0, windowStart: now };
      }

      if (userLimit.requestCount >= MAX_REQUESTS_PER_WINDOW) {
        getLogger().warn({ userId, requests: userLimit.requestCount }, 'User rate limit exceeded');
        return {
          allowed: false,
          reason: 'Too many requests. Please slow down and try again in a minute.',
        };
      }

      // Increment counters
      userLimit.requestCount++;
      this.userRateLimits.set(userId, userLimit);
    }

    this.globalRateLimit.requestCount++;
    return { allowed: true };
  }

  /**
   * Get current rate limit status for monitoring
   */
  getRateLimitStatus(userId?: string): { globalUsage: number; userUsage?: number } {
    const globalUsage = Math.round(
      (this.globalRateLimit.requestCount / MAX_TOTAL_REQUESTS_PER_WINDOW) * 100
    );
    let userUsage: number | undefined;

    if (userId) {
      const userLimit = this.userRateLimits.get(userId);
      if (userLimit) {
        userUsage = Math.round((userLimit.requestCount / MAX_REQUESTS_PER_WINDOW) * 100);
      }
    }

    return { globalUsage, userUsage };
  }

  // ============================================================================
  // MESSAGE CREATION
  // ============================================================================

  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Send a tool execution request to another agent
   */
  async requestToolExecution(
    fromAgent: AgentId,
    toAgent: AgentId,
    toolName: string,
    toolParams: Record<string, unknown>,
    userId?: string,
    sessionId?: string,
    context?: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    // Check rate limits first
    const rateLimitCheck = this.checkRateLimit(userId);
    if (!rateLimitCheck.allowed) {
      getLogger().warn({ fromAgent, toAgent, toolName, userId }, 'Tool execution rate limited');
      return {
        success: false,
        error: rateLimitCheck.reason,
        executedBy: toAgent,
      };
    }

    const messageId = this.generateId();

    const message: AgentMessage = {
      id: messageId,
      timestamp: new Date(),
      fromAgent,
      toAgent,
      type: 'tool_request',
      payload: {
        toolName,
        toolParams,
        context,
      },
      status: 'pending',
      userId,
      sessionId,
    };

    this.messages.set(messageId, message);
    this.addToPending(toAgent, message);

    getLogger().info(
      {
        messageId,
        from: fromAgent,
        to: toAgent,
        tool: toolName,
      },
      '📨 Tool request sent'
    );

    // Try to execute immediately if handler is registered
    const handler = this.toolHandlers.get(`${toAgent}:${toolName}`);
    if (handler) {
      message.status = 'processing';
      try {
        const result = await handler({
          toolName,
          params: toolParams,
          userId,
          sessionId,
          context,
        });
        message.status = 'completed';
        message.payload.result = result.result;
        message.payload.success = result.success;

        this.emit('tool_completed', { messageId, result });

        return result;
      } catch (error) {
        message.status = 'failed';
        message.payload.error = error instanceof Error ? error.message : 'Unknown error';

        return {
          success: false,
          error: message.payload.error,
          executedBy: toAgent,
        };
      }
    }

    // Queue for later execution
    this.emit('tool_request', message);

    return {
      success: true,
      result: `Tool request "${toolName}" queued for ${toAgent}`,
      executedBy: toAgent,
    };
  }

  /**
   * Share context between agents
   */
  shareContext(
    fromAgent: AgentId,
    toAgent: AgentId,
    context: Record<string, unknown>,
    userId?: string
  ): void {
    // Check rate limits first
    const rateLimitCheck = this.checkRateLimit(userId);
    if (!rateLimitCheck.allowed) {
      getLogger().warn({ fromAgent, toAgent, userId }, 'Context share rate limited');
      return;
    }

    const messageId = this.generateId();

    const message: AgentMessage = {
      id: messageId,
      timestamp: new Date(),
      fromAgent,
      toAgent,
      type: 'context_share',
      payload: { context },
      status: 'completed',
      userId,
    };

    this.messages.set(messageId, message);
    this.emit('context_shared', { fromAgent, toAgent, context, userId });

    getLogger().info(
      {
        messageId,
        from: fromAgent,
        to: toAgent,
        contextKeys: Object.keys(context),
      },
      '📤 Context shared'
    );
  }

  /**
   * Send a notification to an agent
   */
  notify(
    fromAgent: AgentId,
    toAgent: AgentId,
    notificationType: string,
    data: Record<string, unknown>,
    userId?: string
  ): void {
    // Check rate limits first
    const rateLimitCheck = this.checkRateLimit(userId);
    if (!rateLimitCheck.allowed) {
      getLogger().warn(
        { fromAgent, toAgent, notificationType, userId },
        'Notification rate limited'
      );
      return;
    }

    const messageId = this.generateId();

    const message: AgentMessage = {
      id: messageId,
      timestamp: new Date(),
      fromAgent,
      toAgent,
      type: 'notification',
      payload: {
        notificationType,
        notificationData: data,
      },
      status: 'completed',
      userId,
    };

    this.messages.set(messageId, message);
    this.emit('notification', message);

    getLogger().info(
      {
        messageId,
        from: fromAgent,
        to: toAgent,
        type: notificationType,
      },
      '🔔 Notification sent'
    );
  }

  // ============================================================================
  // TOOL HANDLER REGISTRATION
  // ============================================================================

  /**
   * Register a tool handler for an agent
   */
  registerToolHandler(
    agent: AgentId,
    toolName: string,
    handler: (request: ToolExecutionRequest) => Promise<ToolExecutionResult>
  ): void {
    const key = `${agent}:${toolName}`;
    this.toolHandlers.set(key, handler);
    getLogger().debug({ agent, toolName }, 'Tool handler registered');
  }

  /**
   * Unregister a tool handler
   */
  unregisterToolHandler(agent: AgentId, toolName: string): void {
    const key = `${agent}:${toolName}`;
    this.toolHandlers.delete(key);
  }

  // ============================================================================
  // PENDING MESSAGE MANAGEMENT
  // ============================================================================

  private addToPending(agent: AgentId, message: AgentMessage): void {
    const pending = this.pendingRequests.get(agent) || [];
    pending.push(message);
    this.pendingRequests.set(agent, pending);
  }

  /**
   * Get pending messages for an agent
   */
  getPendingMessages(agent: AgentId): AgentMessage[] {
    return this.pendingRequests.get(agent) || [];
  }

  /**
   * Clear pending messages for an agent
   */
  clearPendingMessages(agent: AgentId): void {
    this.pendingRequests.set(agent, []);
  }

  // ============================================================================
  // MESSAGE HISTORY
  // ============================================================================

  /**
   * Get messages between two agents
   */
  getMessagesBetween(agent1: AgentId, agent2: AgentId, limit = 10): AgentMessage[] {
    return Array.from(this.messages.values())
      .filter(
        (m) =>
          (m.fromAgent === agent1 && m.toAgent === agent2) ||
          (m.fromAgent === agent2 && m.toAgent === agent1)
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get all messages for a user
   */
  getMessagesForUser(userId: string, limit = 20): AgentMessage[] {
    return Array.from(this.messages.values())
      .filter((m) => m.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get shared context for a user from all agents
   */
  getSharedContextForUser(userId: string): Record<string, unknown> {
    const contextMessages = Array.from(this.messages.values())
      .filter((m) => m.userId === userId && m.type === 'context_share')
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const merged: Record<string, unknown> = {};
    for (const msg of contextMessages) {
      if (msg.payload.context) {
        Object.assign(merged, msg.payload.context);
      }
    }
    return merged;
  }
}

// Singleton instance
let agentBusInstance: AgentBus | null = null;

export function getAgentBus(): AgentBus {
  if (!agentBusInstance) {
    agentBusInstance = new AgentBus();
  }
  return agentBusInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS FOR JORDAN'S TEAM INTEGRATION
// ============================================================================

/**
 * Jordan requests Maya to create a savings goal
 */
export async function jordanRequestMayaSavingsGoal(
  goalName: string,
  targetAmount: number,
  deadline?: string,
  userId?: string
): Promise<ToolExecutionResult> {
  return getAgentBus().requestToolExecution(
    'jordan',
    'maya',
    'createSavingsGoal',
    {
      name: goalName,
      targetAmount,
      deadline,
      linkedToMilestone: true,
    },
    userId
  );
}

/**
 * Jordan requests Maya to allocate budget
 */
export async function jordanRequestMayaBudget(
  budgetName: string,
  totalAmount: number,
  categories: Record<string, number>,
  userId?: string
): Promise<ToolExecutionResult> {
  return getAgentBus().requestToolExecution(
    'jordan',
    'maya',
    'createBudget',
    {
      name: budgetName,
      totalAmount,
      categories,
      linkedToMilestone: true,
    },
    userId
  );
}

/**
 * Jordan requests Alex to schedule an event
 */
export async function jordanRequestAlexSchedule(
  eventName: string,
  date: string,
  reminderDays: number[] = [7, 1],
  userId?: string
): Promise<ToolExecutionResult> {
  return getAgentBus().requestToolExecution(
    'jordan',
    'alex',
    'scheduleEvent',
    {
      title: eventName,
      date,
      reminderDays,
      source: 'jordan-milestone',
    },
    userId
  );
}

/**
 * Jordan requests Alex to set up reminders
 */
export async function jordanRequestAlexReminders(
  milestoneName: string,
  checkInFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly',
  userId?: string
): Promise<ToolExecutionResult> {
  return getAgentBus().requestToolExecution(
    'jordan',
    'alex',
    'scheduleRecurringReminder',
    {
      title: `${milestoneName} Check-in`,
      frequency: checkInFrequency,
      source: 'jordan-milestone',
    },
    userId
  );
}

/**
 * Jordan shares milestone context with Maya
 */
export function jordanShareMilestoneWithMaya(
  milestoneId: string,
  milestoneName: string,
  budget: number,
  targetDate?: Date,
  userId?: string
): void {
  getAgentBus().shareContext(
    'jordan',
    'maya',
    {
      milestoneId,
      milestoneName,
      budget,
      targetDate: targetDate?.toISOString(),
      type: 'milestone_budget',
    },
    userId
  );
}

/**
 * Jordan shares milestone context with Alex
 */
export function jordanShareMilestoneWithAlex(
  milestoneId: string,
  milestoneName: string,
  targetDate?: Date,
  checklistItems?: string[],
  userId?: string
): void {
  getAgentBus().shareContext(
    'jordan',
    'alex',
    {
      milestoneId,
      milestoneName,
      targetDate: targetDate?.toISOString(),
      checklistItems,
      type: 'milestone_schedule',
    },
    userId
  );
}

// ============================================================================
// REVERSE DIRECTION: MAYA → JORDAN (Progress Updates)
// ============================================================================

/**
 * Maya shares savings progress with Jordan
 */
export function mayaShareProgressWithJordan(
  milestoneId: string,
  progress: {
    currentAmount: number;
    targetAmount: number;
    percentComplete: number;
    onTrack: boolean;
    projectedCompletionDate?: string;
  },
  userId?: string
): void {
  getAgentBus().shareContext(
    'maya',
    'jordan',
    {
      milestoneId,
      ...progress,
      type: 'savings_progress',
      timestamp: new Date().toISOString(),
    },
    userId
  );
}

/**
 * Maya notifies Jordan of budget milestone
 */
export function mayaNotifyJordanBudgetAlert(
  milestoneId: string,
  alertType: 'on_track' | 'ahead' | 'behind' | 'overspent' | 'completed',
  message: string,
  userId?: string
): void {
  getAgentBus().notify(
    'maya',
    'jordan',
    'budget_alert',
    {
      milestoneId,
      alertType,
      message,
    },
    userId
  );
}

// ============================================================================
// REVERSE DIRECTION: ALEX → JORDAN (Schedule Updates)
// ============================================================================

/**
 * Alex shares scheduled events with Jordan
 */
export function alexShareScheduleWithJordan(
  milestoneId: string,
  events: Array<{
    eventId: string;
    title: string;
    date: string;
    status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled';
  }>,
  userId?: string
): void {
  getAgentBus().shareContext(
    'alex',
    'jordan',
    {
      milestoneId,
      events,
      type: 'schedule_update',
      timestamp: new Date().toISOString(),
    },
    userId
  );
}

/**
 * Alex notifies Jordan of appointment confirmation
 */
export function alexNotifyJordanAppointmentUpdate(
  milestoneId: string,
  appointmentId: string,
  status: 'confirmed' | 'rescheduled' | 'cancelled',
  details: string,
  userId?: string
): void {
  getAgentBus().notify(
    'alex',
    'jordan',
    'appointment_update',
    {
      milestoneId,
      appointmentId,
      status,
      details,
    },
    userId
  );
}

// ============================================================================
// FERNI (COACH) COORDINATION
// ============================================================================

/**
 * Ferni requests team status summary
 */
export async function ferniRequestTeamStatus(userId?: string): Promise<{
  maya: ToolExecutionResult;
  alex: ToolExecutionResult;
  jordan: ToolExecutionResult;
}> {
  const bus = getAgentBus();

  const [mayaResult, alexResult, jordanResult] = await Promise.all([
    bus.requestToolExecution('jack-b', 'maya', 'getMilestoneProgress', { all: true }, userId),
    bus.requestToolExecution('jack-b', 'alex', 'getScheduledEvents', { upcoming: true }, userId),
    bus.requestToolExecution('jack-b', 'jordan', 'getActiveGoals', { summary: true }, userId),
  ]);

  return {
    maya: mayaResult,
    alex: alexResult,
    jordan: jordanResult,
  };
}

/**
 * Ferni shares context with entire team
 */
export function ferniShareContextWithTeam(context: Record<string, unknown>, userId?: string): void {
  const bus = getAgentBus();
  const teamMembers: AgentId[] = ['jordan', 'maya', 'alex', 'nayan-patel', 'peter-john'];

  for (const agent of teamMembers) {
    bus.shareContext(
      'jack-b',
      agent,
      {
        ...context,
        type: 'coach_broadcast',
        timestamp: new Date().toISOString(),
      },
      userId
    );
  }
}

/**
 * Ferni notifies team of user mood/context change
 */
export function ferniNotifyTeamUserContext(
  userMood: 'stressed' | 'excited' | 'neutral' | 'anxious' | 'celebratory',
  context: string,
  userId?: string
): void {
  const bus = getAgentBus();
  const teamMembers: AgentId[] = ['jordan', 'maya', 'alex'];

  for (const agent of teamMembers) {
    bus.notify(
      'jack-b',
      agent,
      'user_context_update',
      {
        userMood,
        context,
        adjustTone: true,
      },
      userId
    );
  }
}

// ============================================================================
// INVESTMENT COORDINATION (JORDAN ↔ JACK/PETER)
// ============================================================================

/**
 * Jordan requests investment strategy from Jack (for retirement/long-term goals)
 */
export async function jordanRequestJackInvestmentStrategy(
  goalId: string,
  goalName: string,
  targetAmount: number,
  timelineYears: number,
  riskTolerance: 'conservative' | 'moderate' | 'aggressive',
  userId?: string
): Promise<ToolExecutionResult> {
  return getAgentBus().requestToolExecution(
    'jordan',
    'nayan-patel',
    'suggestInvestmentStrategy',
    {
      goalId,
      goalName,
      targetAmount,
      timelineYears,
      riskTolerance,
      type: 'milestone_investment',
    },
    userId
  );
}

/**
 * Jordan requests stock research from Peter (for specific investment ideas)
 */
export async function jordanRequestPeterResearch(
  topic: string,
  context: string,
  userId?: string
): Promise<ToolExecutionResult> {
  return getAgentBus().requestToolExecution(
    'jordan',
    'peter-john',
    'researchInvestment',
    {
      topic,
      context,
      type: 'milestone_research',
    },
    userId
  );
}

/**
 * Jordan shares retirement goal with Jack
 */
export function jordanShareRetirementWithJack(
  retirementPlan: {
    currentAge: number;
    targetAge: number;
    monthlyIncome: number;
    currentSavings: number;
    style: string;
  },
  userId?: string
): void {
  getAgentBus().shareContext(
    'jordan',
    'nayan-patel',
    {
      ...retirementPlan,
      type: 'retirement_plan',
      timestamp: new Date().toISOString(),
    },
    userId
  );
}

// ============================================================================
// CROSS-TEAM COORDINATION (MAYA ↔ ALEX)
// ============================================================================

/**
 * Maya requests Alex to schedule financial review
 */
export async function mayaRequestAlexFinancialReview(
  reviewType: 'budget_check' | 'savings_review' | 'subscription_audit' | 'quarterly_review',
  frequency: 'once' | 'weekly' | 'monthly' | 'quarterly',
  userId?: string
): Promise<ToolExecutionResult> {
  const titles: Record<string, string> = {
    budget_check: 'Budget Check-in with Maya',
    savings_review: 'Savings Progress Review',
    subscription_audit: 'Subscription Audit',
    quarterly_review: 'Quarterly Financial Review',
  };

  return getAgentBus().requestToolExecution(
    'maya',
    'alex',
    'scheduleRecurringReminder',
    {
      title: titles[reviewType] || 'Financial Review',
      frequency,
      source: 'maya-financial',
      notifyAgent: 'maya',
    },
    userId
  );
}

/**
 * Alex shares appointment cost with Maya (for budget tracking)
 */
export function alexShareAppointmentCostWithMaya(
  appointmentId: string,
  appointmentName: string,
  estimatedCost: number,
  category: string,
  milestoneId?: string,
  userId?: string
): void {
  getAgentBus().shareContext(
    'alex',
    'maya',
    {
      appointmentId,
      appointmentName,
      estimatedCost,
      category,
      milestoneId,
      type: 'appointment_cost',
      timestamp: new Date().toISOString(),
    },
    userId
  );
}

/**
 * Maya notifies Alex of budget constraint
 */
export function mayaNotifyAlexBudgetConstraint(
  milestoneId: string,
  remainingBudget: number,
  message: string,
  userId?: string
): void {
  getAgentBus().notify(
    'maya',
    'alex',
    'budget_constraint',
    {
      milestoneId,
      remainingBudget,
      message,
      adjustBookings: true,
    },
    userId
  );
}

/**
 * Alex notifies Maya of recurring expense
 */
export function alexNotifyMayaRecurringExpense(
  expenseName: string,
  amount: number,
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
  category: string,
  userId?: string
): void {
  getAgentBus().notify(
    'alex',
    'maya',
    'recurring_expense',
    {
      expenseName,
      amount,
      frequency,
      category,
      trackInBudget: true,
    },
    userId
  );
}

export default getAgentBus;
