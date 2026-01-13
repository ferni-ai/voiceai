/**
 * Slack Notification Service
 *
 * Sends notifications to Slack for:
 * - Feature rollouts (start, advance, rollback, complete)
 * - Deployment events
 * - Incident alerts
 * - System health changes
 *
 * Workspace: https://ferniai.slack.com/
 *
 * Setup:
 *   1. Go to https://api.slack.com/apps
 *   2. Create app → From scratch → "Ferni Notifications"
 *   3. Incoming Webhooks → Activate → Add New Webhook
 *   4. Select channel (#deployments, #alerts, etc.)
 *   5. Copy webhook URL to SLACK_WEBHOOK_URL env var
 */
export interface SlackMessage {
    text: string;
    blocks?: SlackBlock[];
    attachments?: SlackAttachment[];
    channel?: string;
    username?: string;
    icon_emoji?: string;
}
interface SlackBlock {
    type: string;
    text?: {
        type: string;
        text: string;
        emoji?: boolean;
    };
    elements?: Array<{
        type: string;
        text?: {
            type: string;
            text: string;
        };
        url?: string;
        style?: string;
    }>;
    fields?: Array<{
        type: string;
        text: string;
    }>;
    accessory?: unknown;
}
interface SlackAttachment {
    color?: string;
    title?: string;
    text?: string;
    fields?: Array<{
        title: string;
        value: string;
        short?: boolean;
    }>;
    footer?: string;
    ts?: number;
}
export type NotificationType = 'rollout_started' | 'rollout_advanced' | 'rollout_complete' | 'rollout_failed' | 'rollout_rolled_back' | 'deployment_started' | 'deployment_success' | 'deployment_failed' | 'incident_opened' | 'incident_resolved' | 'health_degraded' | 'health_recovered' | 'crisis_alert';
export interface NotificationContext {
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
    severity?: 'info' | 'warning' | 'error' | 'success';
    actionUrl?: string;
    actionText?: string;
}
export declare class SlackNotificationService {
    private defaultWebhook;
    private webhooks;
    constructor();
    /**
     * Send a notification
     */
    notify(context: NotificationContext): Promise<boolean>;
    /**
     * Send a notification (alias for notify with simplified interface)
     */
    sendNotification(params: {
        type: 'deployment' | 'incident' | 'system' | 'alert';
        title: string;
        message: string;
        severity?: 'info' | 'warning' | 'critical' | 'error';
        details?: Record<string, unknown>;
    }): Promise<boolean>;
    /**
     * Send a rollout notification
     */
    notifyRollout(featureId: string, status: 'started' | 'advanced' | 'complete' | 'failed' | 'rolled_back', details: {
        percentage?: number;
        stage?: string;
        reason?: string;
        initiatedBy?: string;
        metrics?: Record<string, number>;
    }): Promise<boolean>;
    /**
     * Send a deployment notification
     */
    notifyDeployment(service: string, status: 'started' | 'success' | 'failed', details: {
        version?: string;
        commitSha?: string;
        environment?: string;
        duration?: number;
        url?: string;
        error?: string;
        triggeredBy?: string;
    }): Promise<boolean>;
    /**
     * Send an incident notification
     */
    notifyIncident(title: string, status: 'opened' | 'resolved', details: {
        severity?: 'critical' | 'major' | 'minor';
        affectedServices?: string[];
        description?: string;
        incidentUrl?: string;
    }): Promise<boolean>;
    /**
     * Send a crisis alert notification for user safety events.
     *
     * This is used when critical/emergency crisis events are detected.
     * Alerts go to a dedicated safety channel for immediate attention.
     */
    notifyCrisisAlert(details: {
        userId: string;
        crisisType: string;
        severity: 'critical' | 'emergency';
        timestamp: string;
        resourcesProvided: boolean;
        userAcceptedHelp?: boolean;
        metadata?: {
            sessionId?: string;
            personaId?: string;
            conversationTurnCount?: number;
        };
    }): Promise<boolean>;
    private buildMessage;
    private getWebhookForType;
    private sendToSlack;
    private formatKey;
    private formatValue;
}
export declare function getSlackNotifications(): SlackNotificationService;
export declare function notifySlack(context: NotificationContext): Promise<boolean>;
export declare function notifyRollout(featureId: string, status: 'started' | 'advanced' | 'complete' | 'failed' | 'rolled_back', details: Parameters<SlackNotificationService['notifyRollout']>[2]): Promise<boolean>;
export declare function notifyDeployment(service: string, status: 'started' | 'success' | 'failed', details: Parameters<SlackNotificationService['notifyDeployment']>[2]): Promise<boolean>;
export declare function notifyIncident(title: string, status: 'opened' | 'resolved', details: Parameters<SlackNotificationService['notifyIncident']>[2]): Promise<boolean>;
export declare function notifyCrisisAlert(details: Parameters<SlackNotificationService['notifyCrisisAlert']>[0]): Promise<boolean>;
export interface DDoSAlertDetails {
    /** Detection confidence level */
    confidence: 'low' | 'medium' | 'high';
    /** Human-readable details */
    details: string;
    /** Rate limit stats */
    stats: {
        total: number;
        topIps: Array<[string, number]>;
        topEndpoints: Array<[string, number]>;
    };
    /** Server that detected the attack */
    server: string;
}
/**
 * Send a DDoS attack alert to Slack
 *
 * @param details - DDoS detection details
 * @returns Whether the alert was sent successfully
 */
export declare function notifyDDoSAlert(details: DDoSAlertDetails): Promise<boolean>;
export {};
//# sourceMappingURL=slack-notifications.d.ts.map