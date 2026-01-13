/**
 * Background Tasks Type Definitions
 *
 * Shared types for the background task system including:
 * - Tasks: Single async operations
 * - Workflows: Multi-step processes
 * - Pending Actions: Events waiting on triggers
 * - Scheduled Jobs: Recurring tasks
 * - Delegations: Inter-persona handoffs
 */
import { z } from 'zod';
// ============================================================================
// ZOD SCHEMAS (for Firestore validation)
// ============================================================================
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const TaskStatusSchema = z.enum([
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled',
    'waiting',
]);
export const BackgroundTaskSchema = z.object({
    id: z.string(),
    userId: z.string(),
    // What to do
    type: z.string(),
    description: z.string(),
    parameters: z.record(z.string(), z.unknown()),
    // When/how
    priority: TaskPrioritySchema,
    scheduledFor: z.date().optional(),
    retryCount: z.number(),
    maxRetries: z.number(),
    // Status
    status: TaskStatusSchema,
    result: z.unknown().optional(),
    error: z.string().optional(),
    // Context
    createdBy: z.string(),
    conversationId: z.string().optional(),
    parentWorkflowId: z.string().optional(),
    // Timestamps
    createdAt: z.date(),
    startedAt: z.date().optional(),
    completedAt: z.date().optional(),
});
export const WorkflowStepSchema = z.object({
    id: z.string(),
    name: z.string(),
    taskType: z.string(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    status: TaskStatusSchema,
    result: z.unknown().optional(),
    error: z.string().optional(),
    // Conditionals
    condition: z.string().optional(),
    onSuccess: z.string().optional(),
    onFailure: z.string().optional(),
});
export const WorkflowStatusSchema = z.enum(['pending', 'running', 'paused', 'completed', 'failed']);
export const WorkflowSchema = z.object({
    id: z.string(),
    userId: z.string(),
    // Definition
    name: z.string(),
    description: z.string(),
    steps: z.array(WorkflowStepSchema),
    // State
    currentStepIndex: z.number(),
    status: WorkflowStatusSchema,
    context: z.record(z.string(), z.unknown()),
    // Control
    pauseReason: z.string().optional(),
    canResume: z.boolean(),
    requiresUserInput: z.string().optional(),
    // Persona
    createdBy: z.string(),
    handledBy: z.string().optional(),
    // Timestamps
    createdAt: z.date(),
    updatedAt: z.date(),
    completedAt: z.date().optional(),
});
export const TriggerTypeSchema = z.enum(['webhook', 'polling', 'time', 'manual']);
export const NotifyMethodSchema = z.enum(['sms', 'email', 'push', 'next_conversation']);
export const PendingActionStatusSchema = z.enum([
    'watching',
    'triggered',
    'completed',
    'expired',
    'cancelled',
]);
export const PendingActionSchema = z.object({
    id: z.string(),
    userId: z.string(),
    // What we're waiting for
    waitingFor: z.string(),
    description: z.string(),
    // Trigger conditions
    triggerType: TriggerTypeSchema,
    triggerConfig: z.record(z.string(), z.unknown()),
    // What to do when triggered
    actionType: z.string(),
    actionParameters: z.record(z.string(), z.unknown()),
    notifyUser: z.boolean(),
    notifyMethod: NotifyMethodSchema.optional(),
    // Status
    status: PendingActionStatusSchema,
    expiresAt: z.date().optional(),
    // Context
    createdBy: z.string(),
    // Timestamps
    createdAt: z.date(),
    triggeredAt: z.date().optional(),
    completedAt: z.date().optional(),
});
export const ScheduleTypeSchema = z.enum(['daily', 'weekly', 'monthly', 'custom']);
export const ScheduledJobSchema = z.object({
    id: z.string(),
    userId: z.string(),
    // Schedule
    name: z.string(),
    schedule: ScheduleTypeSchema,
    customCron: z.string().optional(),
    timezone: z.string(),
    // What to do
    jobType: z.string(),
    parameters: z.record(z.string(), z.unknown()),
    // Status
    isActive: z.boolean(),
    lastRunAt: z.date().optional(),
    nextRunAt: z.date().optional(),
    runCount: z.number(),
    // Timestamps
    createdAt: z.date(),
    updatedAt: z.date(),
});
export const DelegationStatusSchema = z.enum([
    'delegated',
    'accepted',
    'in_progress',
    'completed',
    'returned',
]);
export const DelegationUpdateSchema = z.object({
    timestamp: z.date(),
    from: z.string(),
    message: z.string(),
});
export const DelegationSchema = z.object({
    id: z.string(),
    userId: z.string(),
    // What
    taskDescription: z.string(),
    context: z.record(z.string(), z.unknown()),
    // Who
    fromPersona: z.string(),
    toPersona: z.string(),
    // Status
    status: DelegationStatusSchema,
    outcome: z.string().optional(),
    // Communication
    originalRequest: z.string(),
    updates: z.array(DelegationUpdateSchema),
    // Timestamps
    createdAt: z.date(),
    acceptedAt: z.date().optional(),
    completedAt: z.date().optional(),
});
export const BackgroundDataSchema = z.object({
    userId: z.string(),
    tasks: z.array(BackgroundTaskSchema),
    workflows: z.array(WorkflowSchema),
    pendingActions: z.array(PendingActionSchema),
    scheduledJobs: z.array(ScheduledJobSchema),
    delegations: z.array(DelegationSchema),
    lastUpdated: z.date(),
});
// ============================================================================
// VALIDATION HELPERS
// ============================================================================
/**
 * Validate and parse a BackgroundTask from Firestore
 */
export function parseBackgroundTask(data) {
    const result = BackgroundTaskSchema.safeParse(data);
    return result.success ? result.data : null;
}
/**
 * Validate and parse a Workflow from Firestore
 */
export function parseWorkflow(data) {
    const result = WorkflowSchema.safeParse(data);
    return result.success ? result.data : null;
}
/**
 * Validate and parse a Delegation from Firestore
 */
export function parseDelegation(data) {
    const result = DelegationSchema.safeParse(data);
    return result.success ? result.data : null;
}
/**
 * Validate and parse a PendingAction from Firestore
 */
export function parsePendingAction(data) {
    const result = PendingActionSchema.safeParse(data);
    return result.success ? result.data : null;
}
/**
 * Validate and parse a ScheduledJob from Firestore
 */
export function parseScheduledJob(data) {
    const result = ScheduledJobSchema.safeParse(data);
    return result.success ? result.data : null;
}
/**
 * Validate and parse BackgroundData from Firestore
 */
export function parseBackgroundData(data) {
    const result = BackgroundDataSchema.safeParse(data);
    return result.success ? result.data : null;
}
/**
 * Convert dates to Firestore-safe format
 */
export function serializeForFirestore(data) {
    if (data === null || data === undefined)
        return data;
    if (data instanceof Date) {
        return data;
    }
    if (Array.isArray(data)) {
        return data.map(serializeForFirestore);
    }
    if (typeof data === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                result[key] = serializeForFirestore(value);
            }
        }
        return result;
    }
    return data;
}
/**
 * Convert Firestore timestamps back to Dates
 */
export function deserializeFromFirestore(data) {
    if (data === null || data === undefined)
        return data;
    // Handle Firestore Timestamp objects
    if (typeof data === 'object' &&
        data !== null &&
        'toDate' in data &&
        typeof data.toDate === 'function') {
        return data.toDate();
    }
    if (Array.isArray(data)) {
        return data.map(deserializeFromFirestore);
    }
    if (typeof data === 'object' && data !== null) {
        const result = {};
        for (const [key, value] of Object.entries(data)) {
            result[key] = deserializeFromFirestore(value);
        }
        return result;
    }
    return data;
}
//# sourceMappingURL=background-types.js.map