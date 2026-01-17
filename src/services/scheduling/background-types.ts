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
// TYPESCRIPT TYPES (inferred from schemas)
// ============================================================================

export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type BackgroundTask = z.infer<typeof BackgroundTaskSchema>;
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export type TriggerType = z.infer<typeof TriggerTypeSchema>;
export type NotifyMethod = z.infer<typeof NotifyMethodSchema>;
export type PendingActionStatus = z.infer<typeof PendingActionStatusSchema>;
export type PendingAction = z.infer<typeof PendingActionSchema>;
export type ScheduleType = z.infer<typeof ScheduleTypeSchema>;
export type ScheduledJob = z.infer<typeof ScheduledJobSchema>;
export type DelegationStatus = z.infer<typeof DelegationStatusSchema>;
export type DelegationUpdate = z.infer<typeof DelegationUpdateSchema>;
export type Delegation = z.infer<typeof DelegationSchema>;
export type BackgroundData = z.infer<typeof BackgroundDataSchema>;

// ============================================================================
// TASK HANDLER TYPE
// ============================================================================

export type TaskHandler = (task: BackgroundTask) => Promise<unknown>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate and parse a BackgroundTask from Firestore
 */
export function parseBackgroundTask(data: unknown): BackgroundTask | null {
  const result = BackgroundTaskSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate and parse a Workflow from Firestore
 */
export function parseWorkflow(data: unknown): Workflow | null {
  const result = WorkflowSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate and parse a Delegation from Firestore
 */
export function parseDelegation(data: unknown): Delegation | null {
  const result = DelegationSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate and parse a PendingAction from Firestore
 */
export function parsePendingAction(data: unknown): PendingAction | null {
  const result = PendingActionSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate and parse a ScheduledJob from Firestore
 */
export function parseScheduledJob(data: unknown): ScheduledJob | null {
  const result = ScheduledJobSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Validate and parse BackgroundData from Firestore
 */
export function parseBackgroundData(data: unknown): BackgroundData | null {
  const result = BackgroundDataSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Convert dates to Firestore-safe format
 */
export function serializeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) return data;

  if (data instanceof Date) {
    return data as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map(serializeForFirestore) as unknown as T;
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (value !== undefined) {
        result[key] = serializeForFirestore(value);
      }
    }
    return result as T;
  }

  return data;
}

/**
 * Convert Firestore timestamps back to Dates
 */
export function deserializeFromFirestore<T>(data: T): T {
  if (data === null || data === undefined) return data;

  // Handle Firestore Timestamp objects
  if (
    typeof data === 'object' &&
    data !== null &&
    'toDate' in data &&
    typeof (data as { toDate: () => Date }).toDate === 'function'
  ) {
    return (data as { toDate: () => Date }).toDate() as unknown as T;
  }

  if (Array.isArray(data)) {
    return data.map(deserializeFromFirestore) as unknown as T;
  }

  if (typeof data === 'object' && data !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = deserializeFromFirestore(value);
    }
    return result as T;
  }

  return data;
}
