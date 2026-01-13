/**
 * Workflow Data Store
 *
 * Persistent storage for automated workflows:
 * - Custom automations (IFTTT-style)
 * - Trigger definitions
 * - Action sequences
 * - Execution history
 *
 * Storage: Firestore (primary) with in-memory fallback
 * Document: /users/{userId}/life_automation/workflows
 *
 * @module services/stores/workflow-store
 */
export type TriggerType = 'time' | 'phrase' | 'event' | 'location' | 'calendar' | 'device' | 'webhook';
export type WorkflowStatus = 'active' | 'paused' | 'disabled' | 'error';
export interface TimeTrigger {
    type: 'time';
    schedule: string;
    timezone?: string;
}
export interface PhraseTrigger {
    type: 'phrase';
    phrases: string[];
    requireExactMatch: boolean;
}
export interface EventTrigger {
    type: 'event';
    eventName: string;
    conditions?: Record<string, unknown>;
}
export interface LocationTrigger {
    type: 'location';
    locationName?: string;
    latitude?: number;
    longitude?: number;
    radiusMeters: number;
    triggerOn: 'enter' | 'exit' | 'both';
}
export interface CalendarTrigger {
    type: 'calendar';
    triggerOn: 'event_start' | 'event_end' | 'event_reminder';
    calendarId?: string;
    eventFilter?: {
        titleContains?: string;
        isAllDay?: boolean;
    };
    offsetMinutes?: number;
}
export interface DeviceTrigger {
    type: 'device';
    deviceId: string;
    deviceType: string;
    condition: {
        property: string;
        operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'changes_to';
        value: unknown;
    };
}
export interface WebhookTrigger {
    type: 'webhook';
    webhookId: string;
    secretKey: string;
}
export type WorkflowTrigger = TimeTrigger | PhraseTrigger | EventTrigger | LocationTrigger | CalendarTrigger | DeviceTrigger | WebhookTrigger;
export type ActionType = 'send_text' | 'send_email' | 'add_task' | 'complete_task' | 'add_reminder' | 'play_music' | 'set_thermostat' | 'control_lights' | 'lock_doors' | 'request_ride' | 'order_groceries' | 'log_habit' | 'send_notification' | 'speak_message' | 'set_variable' | 'wait' | 'condition' | 'webhook' | 'custom';
export interface WorkflowAction {
    id: string;
    type: ActionType;
    name: string;
    params: Record<string, unknown>;
    condition?: {
        variable: string;
        operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_set';
        value?: unknown;
        thenActions?: string[];
        elseActions?: string[];
    };
    waitSeconds?: number;
    onError?: 'continue' | 'stop' | 'retry';
    maxRetries?: number;
}
export interface WorkflowCondition {
    variable: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_set';
    value?: unknown;
}
export interface Workflow {
    id: string;
    userId: string;
    name: string;
    description?: string;
    status: WorkflowStatus;
    trigger: WorkflowTrigger;
    conditions: WorkflowCondition[];
    actions: WorkflowAction[];
    variables: Record<string, unknown>;
    category?: string;
    tags: string[];
    icon?: string;
    color?: string;
    runCount: number;
    lastRunAt?: string;
    lastRunStatus?: 'success' | 'partial' | 'failed';
    lastError?: string;
    isTemplate: boolean;
    templateId?: string;
    createdAt: string;
    updatedAt: string;
}
export interface WorkflowExecution {
    id: string;
    workflowId: string;
    userId: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    triggeredBy: string;
    startedAt: string;
    completedAt?: string;
    actionResults: Array<{
        actionId: string;
        actionName: string;
        status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
        startedAt?: string;
        completedAt?: string;
        result?: unknown;
        error?: string;
    }>;
    variables: Record<string, unknown>;
    error?: string;
}
export interface WorkflowTemplate {
    id: string;
    name: string;
    description: string;
    category: string;
    trigger: WorkflowTrigger;
    conditions: WorkflowCondition[];
    actions: WorkflowAction[];
    tags: string[];
    icon?: string;
    popularity: number;
    createdAt: string;
}
export interface WorkflowData {
    userId: string;
    lastUpdated: Date | string;
    workflows: Workflow[];
    executions: WorkflowExecution[];
    settings: {
        maxConcurrentWorkflows: number;
        executionHistoryDays: number;
        defaultTimezone: string;
    };
}
/**
 * Get workflow data for a user
 * Uses Firestore if available, falls back to in-memory
 */
export declare function getWorkflowData(userId: string): Promise<WorkflowData>;
/**
 * Save workflow data for a user
 * Saves to Firestore if available, always saves to in-memory as fallback
 */
export declare function saveWorkflowData(userId: string, data: Partial<WorkflowData>): Promise<void>;
/**
 * Create a new workflow
 */
export declare function createWorkflow(userId: string, workflow: Omit<Workflow, 'id' | 'userId' | 'runCount' | 'createdAt' | 'updatedAt' | 'status'> & {
    status?: WorkflowStatus;
}): Promise<Workflow>;
/**
 * Update a workflow
 */
export declare function updateWorkflow(userId: string, workflowId: string, updates: Partial<Workflow>): Promise<Workflow | null>;
/**
 * Delete a workflow
 */
export declare function deleteWorkflow(userId: string, workflowId: string): Promise<boolean>;
/**
 * Enable/disable a workflow
 */
export declare function setWorkflowStatus(userId: string, workflowId: string, status: WorkflowStatus): Promise<Workflow | null>;
/**
 * Get workflow by ID
 */
export declare function getWorkflow(userId: string, workflowId: string): Promise<Workflow | null>;
/**
 * Get active workflows
 */
export declare function getActiveWorkflows(userId: string): Promise<Workflow[]>;
/**
 * Get workflows by trigger type
 */
export declare function getWorkflowsByTriggerType(userId: string, triggerType: TriggerType): Promise<Workflow[]>;
/**
 * Get workflows matching a phrase
 */
export declare function getWorkflowsForPhrase(userId: string, phrase: string): Promise<Workflow[]>;
/**
 * Get scheduled workflows due for execution
 */
export declare function getDueScheduledWorkflows(userId: string): Promise<Workflow[]>;
/**
 * Record workflow execution start
 */
export declare function startExecution(userId: string, workflowId: string, triggeredBy: string): Promise<WorkflowExecution>;
/**
 * Update execution action result
 */
export declare function updateExecutionAction(userId: string, executionId: string, actionId: string, result: Partial<WorkflowExecution['actionResults'][0]>): Promise<void>;
/**
 * Complete workflow execution
 */
export declare function completeExecution(userId: string, executionId: string, status: 'completed' | 'failed' | 'cancelled', error?: string): Promise<void>;
/**
 * Fail workflow execution (convenience wrapper)
 */
export declare function failExecution(userId: string, executionId: string, error: string): Promise<void>;
/**
 * Get execution history for a workflow
 */
export declare function getExecutionHistory(userId: string, workflowId: string, limit?: number): Promise<WorkflowExecution[]>;
/**
 * Get recent executions for a user
 */
export declare function getRecentExecutions(userId: string, limit?: number): Promise<WorkflowExecution[]>;
/**
 * Create workflow from template
 */
export declare function createFromTemplate(userId: string, template: WorkflowTemplate, customizations?: Partial<Workflow>): Promise<Workflow>;
/**
 * Migrate in-memory data to Firestore (for existing users)
 */
export declare function migrateUserToFirestore(userId: string): Promise<boolean>;
//# sourceMappingURL=workflow-store.d.ts.map