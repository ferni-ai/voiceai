/**
 * Workflow Resume Notifications
 *
 * When workflows pause for user input, we need to notify them!
 * A paused workflow with no notification is a dead workflow.
 *
 * This module provides:
 * - Push notifications when workflow needs input
 * - Email fallback for non-app users
 * - Resume link handling
 * - Timeout and expiration warnings
 *
 * @module services/scheduling/workflow-notifications
 */

import { EventEmitter } from 'events';

import { clearNamedInterval, registerInterval } from '../../utils/interval-manager.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getBackgroundTaskService, type Workflow, type PendingAction } from './background-tasks.js';

const log = createLogger({ module: 'WorkflowNotifications' });

// ============================================================================
// TYPES
// ============================================================================

export interface WorkflowNotification {
  id: string;
  workflowId: string;
  userId: string;
  type: 'input_needed' | 'expiring_soon' | 'expired' | 'completed' | 'failed';
  title: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  sentVia?: ('push' | 'email' | 'sms')[];
  acknowledged?: boolean;
}

export interface NotificationConfig {
  /** Send push notifications */
  enablePush: boolean;
  /** Send email for important notifications */
  enableEmail: boolean;
  /** Send SMS for urgent notifications */
  enableSms: boolean;
  /** Warn when workflow will expire in X hours */
  expirationWarningHours: number;
  /** Maximum time a workflow can be paused before auto-cancel */
  maxPauseDurationHours: number;
  /** How often to check for stalled workflows */
  checkIntervalMs: number;
}

const DEFAULT_CONFIG: NotificationConfig = {
  enablePush: true,
  enableEmail: true,
  enableSms: false, // Only for truly urgent
  expirationWarningHours: 24,
  maxPauseDurationHours: 72,
  checkIntervalMs: 5 * 60 * 1000, // 5 minutes
};

// ============================================================================
// WORKFLOW NOTIFICATION SERVICE
// ============================================================================

class WorkflowNotificationService extends EventEmitter {
  private config: NotificationConfig;
  private checkInterval: NodeJS.Timeout | null = null;
  private sentNotifications = new Map<string, WorkflowNotification>();
  private initialized = false;

  constructor(config: Partial<NotificationConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    log.info('🔔 Workflow notification service initializing');

    // Subscribe to workflow events
    const taskService = getBackgroundTaskService();

    taskService.on('workflow_paused', (workflow: Workflow) => {
      void this.handleWorkflowPaused(workflow);
    });

    taskService.on('workflow_completed', (workflow: Workflow) => {
      void this.handleWorkflowCompleted(workflow);
    });

    taskService.on('pending_action_expired', (action: PendingAction) => {
      void this.handlePendingActionExpired(action);
    });

    // Start periodic check for stalled workflows
    this.startStalledWorkflowChecker();

    this.initialized = true;
    log.info('✅ Workflow notification service ready');
  }

  shutdown(): void {
    clearNamedInterval('workflow-stalled-checker');
    this.checkInterval = null;
    this.initialized = false;
    log.info('🔔 Workflow notification service shut down');
  }

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  private async handleWorkflowPaused(workflow: Workflow): Promise<void> {
    if (!workflow.requiresUserInput) {
      // Paused for internal reasons, no notification needed
      return;
    }

    log.info(
      { workflowId: workflow.id, userId: workflow.userId, reason: workflow.pauseReason },
      '📋 Workflow paused - sending notification'
    );

    const notification = await this.createNotification({
      workflowId: workflow.id,
      userId: workflow.userId,
      type: 'input_needed',
      title: this.getWorkflowTitle(workflow),
      body: workflow.requiresUserInput,
      actionUrl: `/workflow/${workflow.id}/resume`,
      actionLabel: 'Continue',
      metadata: {
        workflowName: workflow.name,
        currentStep: workflow.currentStepIndex,
        totalSteps: workflow.steps.length,
        pauseReason: workflow.pauseReason,
      },
    });

    await this.sendNotification(notification);
  }

  private async handleWorkflowCompleted(workflow: Workflow): Promise<void> {
    // Only notify if this was a multi-step workflow that took significant time
    const duration = workflow.completedAt
      ? workflow.completedAt.getTime() - workflow.createdAt.getTime()
      : 0;

    // Only notify if workflow took more than 5 minutes (not instant)
    if (duration < 5 * 60 * 1000) return;

    log.info({ workflowId: workflow.id, userId: workflow.userId }, '✅ Workflow completed');

    const notification = await this.createNotification({
      workflowId: workflow.id,
      userId: workflow.userId,
      type: 'completed',
      title: `${this.getWorkflowTitle(workflow)} Complete!`,
      body: this.getCompletionMessage(workflow),
      actionUrl: `/workflow/${workflow.id}/results`,
      actionLabel: 'View Results',
      metadata: {
        workflowName: workflow.name,
        durationMs: duration,
        stepsCompleted: workflow.currentStepIndex,
      },
    });

    await this.sendNotification(notification);
  }

  private async handlePendingActionExpired(action: PendingAction): Promise<void> {
    log.warn(
      { actionId: action.id, userId: action.userId, waitingFor: action.waitingFor },
      '⏰ Pending action expired'
    );

    const notification = await this.createNotification({
      workflowId: action.id,
      userId: action.userId,
      type: 'expired',
      title: 'Action Expired',
      body: `The ${action.description} we were tracking has expired. Let me know if you'd like to set this up again.`,
      metadata: {
        actionType: action.actionType,
        waitingFor: action.waitingFor,
      },
    });

    await this.sendNotification(notification);
  }

  // ============================================================================
  // STALLED WORKFLOW CHECKER
  // ============================================================================

  private startStalledWorkflowChecker(): void {
    const checkStalled = async () => {
      try {
        const taskService = getBackgroundTaskService();
        const now = new Date();

        // Get all users with background data (simplified - in production, query Firestore)
        // This is a placeholder - the actual implementation would query Firestore
        // for all paused workflows across all users

        // For now, emit an event that the API layer can use to trigger checks
        this.emit('check_stalled_workflows', { timestamp: now });

        log.debug('Checked for stalled workflows');
      } catch (error) {
        log.warn({ error }, 'Failed to check stalled workflows');
      }
    };

    registerInterval(
      'workflow-stalled-checker',
      () => void checkStalled(),
      this.config.checkIntervalMs
    );
  }

  /**
   * Check if a workflow is stalled and send appropriate notification
   * Called from external batch job or periodic check
   */
  async checkWorkflowStatus(workflow: Workflow): Promise<void> {
    if (workflow.status !== 'paused') return;

    const now = new Date();
    const pauseDuration = now.getTime() - workflow.updatedAt.getTime();
    const pauseHours = pauseDuration / (1000 * 60 * 60);

    // Check if we should send expiration warning
    const warningThreshold = this.config.maxPauseDurationHours - this.config.expirationWarningHours;

    if (pauseHours >= warningThreshold && pauseHours < this.config.maxPauseDurationHours) {
      const notificationKey = `expiring_${workflow.id}`;
      if (!this.sentNotifications.has(notificationKey)) {
        const hoursRemaining = Math.ceil(this.config.maxPauseDurationHours - pauseHours);

        const notification = await this.createNotification({
          workflowId: workflow.id,
          userId: workflow.userId,
          type: 'expiring_soon',
          title: 'Workflow Needs Attention',
          body: `Your "${workflow.name}" will expire in ${hoursRemaining} hours if we don't hear back.`,
          actionUrl: `/workflow/${workflow.id}/resume`,
          actionLabel: 'Continue Now',
          metadata: {
            hoursRemaining,
            pausedAt: workflow.updatedAt,
          },
        });

        await this.sendNotification(notification);
        this.sentNotifications.set(notificationKey, notification);
      }
    }

    // Check if workflow should be auto-cancelled
    if (pauseHours >= this.config.maxPauseDurationHours) {
      log.info({ workflowId: workflow.id, pauseHours }, 'Auto-cancelling expired workflow');

      // Mark workflow as failed/expired
      workflow.status = 'failed';
      workflow.pauseReason = `Auto-cancelled after ${Math.round(pauseHours)} hours of inactivity`;

      const notification = await this.createNotification({
        workflowId: workflow.id,
        userId: workflow.userId,
        type: 'expired',
        title: 'Workflow Expired',
        body: `Your "${workflow.name}" was cancelled due to inactivity. Let me know if you'd like to start over.`,
        metadata: {
          pauseDuration: pauseHours,
          reason: 'timeout',
        },
      });

      await this.sendNotification(notification);
    }
  }

  // ============================================================================
  // NOTIFICATION CREATION & SENDING
  // ============================================================================

  private async createNotification(
    params: Omit<WorkflowNotification, 'id' | 'createdAt'>
  ): Promise<WorkflowNotification> {
    return {
      ...params,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date(),
    };
  }

  private async sendNotification(notification: WorkflowNotification): Promise<void> {
    const sentVia: ('push' | 'email' | 'sms')[] = [];

    try {
      // Try push notification first
      if (this.config.enablePush) {
        const pushSent = await this.sendPushNotification(notification);
        if (pushSent) sentVia.push('push');
      }

      // Send email for important notifications or if push failed
      if (
        this.config.enableEmail &&
        (sentVia.length === 0 || notification.type === 'input_needed')
      ) {
        const emailSent = await this.sendEmailNotification(notification);
        if (emailSent) sentVia.push('email');
      }

      // SMS only for truly urgent cases
      if (this.config.enableSms && sentVia.length === 0 && notification.type === 'expiring_soon') {
        const smsSent = await this.sendSmsNotification(notification);
        if (smsSent) sentVia.push('sms');
      }

      notification.sentVia = sentVia;

      log.info(
        {
          notificationId: notification.id,
          userId: notification.userId,
          type: notification.type,
          sentVia,
        },
        '📤 Workflow notification sent'
      );

      this.emit('notification_sent', notification);
    } catch (error) {
      log.error({ error, notificationId: notification.id }, 'Failed to send notification');
      this.emit('notification_failed', { notification, error });
    }
  }

  private async sendPushNotification(notification: WorkflowNotification): Promise<boolean> {
    try {
      // Dynamic import to avoid circular dependencies
      const { sendPushNotification } = await import('../outreach/delivery/index.js');

      const results = await sendPushNotification({
        userId: notification.userId,
        outreachId: notification.id,
        personaId: 'ferni',
        title: notification.title,
        body: notification.body,
        clickAction: notification.actionUrl
          ? `https://app.ferni.ai${notification.actionUrl}`
          : 'https://app.ferni.ai',
        priority: notification.type === 'input_needed' ? 'high' : 'normal',
        data: {
          workflowId: notification.workflowId,
          notificationType: notification.type,
        },
      });

      return results.some((r) => r.success);
    } catch (error) {
      log.debug({ error }, 'Push notification unavailable');
      return false;
    }
  }

  private async sendEmailNotification(notification: WorkflowNotification): Promise<boolean> {
    try {
      const { sendEmail } = await import('../outreach/delivery/index.js');

      const result = await sendEmail({
        to: '', // Would need to look up user email
        subject: notification.title,
        body: this.formatEmailBody(notification),
        personaId: 'ferni',
        userId: notification.userId,
        outreachId: notification.id,
      });

      return result.success;
    } catch (error) {
      log.debug({ error }, 'Email notification unavailable');
      return false;
    }
  }

  private async sendSmsNotification(notification: WorkflowNotification): Promise<boolean> {
    try {
      const { sendSMS } = await import('../outreach/delivery/index.js');

      const result = await sendSMS({
        to: '', // Would need to look up user phone
        body: `${notification.title}\n\n${notification.body}`,
        personaId: 'ferni',
        userId: notification.userId,
        outreachId: notification.id,
      });

      return result.success;
    } catch (error) {
      log.debug({ error }, 'SMS notification unavailable');
      return false;
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private getWorkflowTitle(workflow: Workflow): string {
    // Make workflow name more human-readable
    const name = workflow.name
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .trim();

    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  private getCompletionMessage(workflow: Workflow): string {
    const stepCount = workflow.steps.length;
    const duration = workflow.completedAt
      ? Math.round((workflow.completedAt.getTime() - workflow.createdAt.getTime()) / (1000 * 60))
      : 0;

    if (duration < 60) {
      return `All ${stepCount} steps complete! Took about ${duration} minutes.`;
    } else {
      const hours = Math.round(duration / 60);
      return `All ${stepCount} steps complete! Wrapped up after ${hours} hour${hours > 1 ? 's' : ''}.`;
    }
  }

  private formatEmailBody(notification: WorkflowNotification): string {
    let body = notification.body;

    if (notification.actionUrl) {
      body += `\n\n${notification.actionLabel || 'Continue'}: https://app.ferni.ai${notification.actionUrl}`;
    }

    return body;
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Acknowledge a notification (user saw it)
   */
  acknowledgeNotification(notificationId: string): void {
    const notification = this.sentNotifications.get(notificationId);
    if (notification) {
      notification.acknowledged = true;
      this.emit('notification_acknowledged', notification);
    }
  }

  /**
   * Get pending notifications for a user
   */
  getPendingNotifications(userId: string): WorkflowNotification[] {
    return Array.from(this.sentNotifications.values()).filter(
      (n) => n.userId === userId && !n.acknowledged
    );
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: WorkflowNotificationService | null = null;

export function getWorkflowNotificationService(): WorkflowNotificationService {
  if (!instance) {
    instance = new WorkflowNotificationService();
  }
  return instance;
}

export async function initializeWorkflowNotifications(): Promise<WorkflowNotificationService> {
  const service = getWorkflowNotificationService();
  await service.initialize();
  return service;
}

export function shutdownWorkflowNotifications(): void {
  if (instance) {
    instance.shutdown();
    instance = null;
  }
}

export { WorkflowNotificationService };
