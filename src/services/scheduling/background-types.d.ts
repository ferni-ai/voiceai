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
export declare const TaskPrioritySchema: z.ZodEnum<{
    medium: "medium";
    low: "low";
    high: "high";
    urgent: "urgent";
}>;
export declare const TaskStatusSchema: z.ZodEnum<{
    pending: "pending";
    failed: "failed";
    completed: "completed";
    cancelled: "cancelled";
    running: "running";
    waiting: "waiting";
}>;
export declare const BackgroundTaskSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    type: z.ZodString;
    description: z.ZodString;
    parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    priority: z.ZodEnum<{
        medium: "medium";
        low: "low";
        high: "high";
        urgent: "urgent";
    }>;
    scheduledFor: z.ZodOptional<z.ZodDate>;
    retryCount: z.ZodNumber;
    maxRetries: z.ZodNumber;
    status: z.ZodEnum<{
        pending: "pending";
        failed: "failed";
        completed: "completed";
        cancelled: "cancelled";
        running: "running";
        waiting: "waiting";
    }>;
    result: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodString>;
    createdBy: z.ZodString;
    conversationId: z.ZodOptional<z.ZodString>;
    parentWorkflowId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodDate;
    startedAt: z.ZodOptional<z.ZodDate>;
    completedAt: z.ZodOptional<z.ZodDate>;
}, z.core.$strip>;
export declare const WorkflowStepSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    taskType: z.ZodString;
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    status: z.ZodEnum<{
        pending: "pending";
        failed: "failed";
        completed: "completed";
        cancelled: "cancelled";
        running: "running";
        waiting: "waiting";
    }>;
    result: z.ZodOptional<z.ZodUnknown>;
    error: z.ZodOptional<z.ZodString>;
    condition: z.ZodOptional<z.ZodString>;
    onSuccess: z.ZodOptional<z.ZodString>;
    onFailure: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const WorkflowStatusSchema: z.ZodEnum<{
    pending: "pending";
    failed: "failed";
    completed: "completed";
    paused: "paused";
    running: "running";
}>;
export declare const WorkflowSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    name: z.ZodString;
    description: z.ZodString;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        taskType: z.ZodString;
        parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        status: z.ZodEnum<{
            pending: "pending";
            failed: "failed";
            completed: "completed";
            cancelled: "cancelled";
            running: "running";
            waiting: "waiting";
        }>;
        result: z.ZodOptional<z.ZodUnknown>;
        error: z.ZodOptional<z.ZodString>;
        condition: z.ZodOptional<z.ZodString>;
        onSuccess: z.ZodOptional<z.ZodString>;
        onFailure: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    currentStepIndex: z.ZodNumber;
    status: z.ZodEnum<{
        pending: "pending";
        failed: "failed";
        completed: "completed";
        paused: "paused";
        running: "running";
    }>;
    context: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    pauseReason: z.ZodOptional<z.ZodString>;
    canResume: z.ZodBoolean;
    requiresUserInput: z.ZodOptional<z.ZodString>;
    createdBy: z.ZodString;
    handledBy: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
    completedAt: z.ZodOptional<z.ZodDate>;
}, z.core.$strip>;
export declare const TriggerTypeSchema: z.ZodEnum<{
    webhook: "webhook";
    time: "time";
    manual: "manual";
    polling: "polling";
}>;
export declare const NotifyMethodSchema: z.ZodEnum<{
    push: "push";
    email: "email";
    sms: "sms";
    next_conversation: "next_conversation";
}>;
export declare const PendingActionStatusSchema: z.ZodEnum<{
    completed: "completed";
    cancelled: "cancelled";
    triggered: "triggered";
    expired: "expired";
    watching: "watching";
}>;
export declare const PendingActionSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    waitingFor: z.ZodString;
    description: z.ZodString;
    triggerType: z.ZodEnum<{
        webhook: "webhook";
        time: "time";
        manual: "manual";
        polling: "polling";
    }>;
    triggerConfig: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    actionType: z.ZodString;
    actionParameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    notifyUser: z.ZodBoolean;
    notifyMethod: z.ZodOptional<z.ZodEnum<{
        push: "push";
        email: "email";
        sms: "sms";
        next_conversation: "next_conversation";
    }>>;
    status: z.ZodEnum<{
        completed: "completed";
        cancelled: "cancelled";
        triggered: "triggered";
        expired: "expired";
        watching: "watching";
    }>;
    expiresAt: z.ZodOptional<z.ZodDate>;
    createdBy: z.ZodString;
    createdAt: z.ZodDate;
    triggeredAt: z.ZodOptional<z.ZodDate>;
    completedAt: z.ZodOptional<z.ZodDate>;
}, z.core.$strip>;
export declare const ScheduleTypeSchema: z.ZodEnum<{
    custom: "custom";
    monthly: "monthly";
    weekly: "weekly";
    daily: "daily";
}>;
export declare const ScheduledJobSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    name: z.ZodString;
    schedule: z.ZodEnum<{
        custom: "custom";
        monthly: "monthly";
        weekly: "weekly";
        daily: "daily";
    }>;
    customCron: z.ZodOptional<z.ZodString>;
    timezone: z.ZodString;
    jobType: z.ZodString;
    parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    isActive: z.ZodBoolean;
    lastRunAt: z.ZodOptional<z.ZodDate>;
    nextRunAt: z.ZodOptional<z.ZodDate>;
    runCount: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, z.core.$strip>;
export declare const DelegationStatusSchema: z.ZodEnum<{
    completed: "completed";
    in_progress: "in_progress";
    accepted: "accepted";
    delegated: "delegated";
    returned: "returned";
}>;
export declare const DelegationUpdateSchema: z.ZodObject<{
    timestamp: z.ZodDate;
    from: z.ZodString;
    message: z.ZodString;
}, z.core.$strip>;
export declare const DelegationSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    taskDescription: z.ZodString;
    context: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    fromPersona: z.ZodString;
    toPersona: z.ZodString;
    status: z.ZodEnum<{
        completed: "completed";
        in_progress: "in_progress";
        accepted: "accepted";
        delegated: "delegated";
        returned: "returned";
    }>;
    outcome: z.ZodOptional<z.ZodString>;
    originalRequest: z.ZodString;
    updates: z.ZodArray<z.ZodObject<{
        timestamp: z.ZodDate;
        from: z.ZodString;
        message: z.ZodString;
    }, z.core.$strip>>;
    createdAt: z.ZodDate;
    acceptedAt: z.ZodOptional<z.ZodDate>;
    completedAt: z.ZodOptional<z.ZodDate>;
}, z.core.$strip>;
export declare const BackgroundDataSchema: z.ZodObject<{
    userId: z.ZodString;
    tasks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        type: z.ZodString;
        description: z.ZodString;
        parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        priority: z.ZodEnum<{
            medium: "medium";
            low: "low";
            high: "high";
            urgent: "urgent";
        }>;
        scheduledFor: z.ZodOptional<z.ZodDate>;
        retryCount: z.ZodNumber;
        maxRetries: z.ZodNumber;
        status: z.ZodEnum<{
            pending: "pending";
            failed: "failed";
            completed: "completed";
            cancelled: "cancelled";
            running: "running";
            waiting: "waiting";
        }>;
        result: z.ZodOptional<z.ZodUnknown>;
        error: z.ZodOptional<z.ZodString>;
        createdBy: z.ZodString;
        conversationId: z.ZodOptional<z.ZodString>;
        parentWorkflowId: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodDate;
        startedAt: z.ZodOptional<z.ZodDate>;
        completedAt: z.ZodOptional<z.ZodDate>;
    }, z.core.$strip>>;
    workflows: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        name: z.ZodString;
        description: z.ZodString;
        steps: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            taskType: z.ZodString;
            parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            status: z.ZodEnum<{
                pending: "pending";
                failed: "failed";
                completed: "completed";
                cancelled: "cancelled";
                running: "running";
                waiting: "waiting";
            }>;
            result: z.ZodOptional<z.ZodUnknown>;
            error: z.ZodOptional<z.ZodString>;
            condition: z.ZodOptional<z.ZodString>;
            onSuccess: z.ZodOptional<z.ZodString>;
            onFailure: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        currentStepIndex: z.ZodNumber;
        status: z.ZodEnum<{
            pending: "pending";
            failed: "failed";
            completed: "completed";
            paused: "paused";
            running: "running";
        }>;
        context: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        pauseReason: z.ZodOptional<z.ZodString>;
        canResume: z.ZodBoolean;
        requiresUserInput: z.ZodOptional<z.ZodString>;
        createdBy: z.ZodString;
        handledBy: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodDate;
        updatedAt: z.ZodDate;
        completedAt: z.ZodOptional<z.ZodDate>;
    }, z.core.$strip>>;
    pendingActions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        waitingFor: z.ZodString;
        description: z.ZodString;
        triggerType: z.ZodEnum<{
            webhook: "webhook";
            time: "time";
            manual: "manual";
            polling: "polling";
        }>;
        triggerConfig: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        actionType: z.ZodString;
        actionParameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        notifyUser: z.ZodBoolean;
        notifyMethod: z.ZodOptional<z.ZodEnum<{
            push: "push";
            email: "email";
            sms: "sms";
            next_conversation: "next_conversation";
        }>>;
        status: z.ZodEnum<{
            completed: "completed";
            cancelled: "cancelled";
            triggered: "triggered";
            expired: "expired";
            watching: "watching";
        }>;
        expiresAt: z.ZodOptional<z.ZodDate>;
        createdBy: z.ZodString;
        createdAt: z.ZodDate;
        triggeredAt: z.ZodOptional<z.ZodDate>;
        completedAt: z.ZodOptional<z.ZodDate>;
    }, z.core.$strip>>;
    scheduledJobs: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        name: z.ZodString;
        schedule: z.ZodEnum<{
            custom: "custom";
            monthly: "monthly";
            weekly: "weekly";
            daily: "daily";
        }>;
        customCron: z.ZodOptional<z.ZodString>;
        timezone: z.ZodString;
        jobType: z.ZodString;
        parameters: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        isActive: z.ZodBoolean;
        lastRunAt: z.ZodOptional<z.ZodDate>;
        nextRunAt: z.ZodOptional<z.ZodDate>;
        runCount: z.ZodNumber;
        createdAt: z.ZodDate;
        updatedAt: z.ZodDate;
    }, z.core.$strip>>;
    delegations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        taskDescription: z.ZodString;
        context: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        fromPersona: z.ZodString;
        toPersona: z.ZodString;
        status: z.ZodEnum<{
            completed: "completed";
            in_progress: "in_progress";
            accepted: "accepted";
            delegated: "delegated";
            returned: "returned";
        }>;
        outcome: z.ZodOptional<z.ZodString>;
        originalRequest: z.ZodString;
        updates: z.ZodArray<z.ZodObject<{
            timestamp: z.ZodDate;
            from: z.ZodString;
            message: z.ZodString;
        }, z.core.$strip>>;
        createdAt: z.ZodDate;
        acceptedAt: z.ZodOptional<z.ZodDate>;
        completedAt: z.ZodOptional<z.ZodDate>;
    }, z.core.$strip>>;
    lastUpdated: z.ZodDate;
}, z.core.$strip>;
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
export type TaskHandler = (task: BackgroundTask) => Promise<unknown>;
/**
 * Validate and parse a BackgroundTask from Firestore
 */
export declare function parseBackgroundTask(data: unknown): BackgroundTask | null;
/**
 * Validate and parse a Workflow from Firestore
 */
export declare function parseWorkflow(data: unknown): Workflow | null;
/**
 * Validate and parse a Delegation from Firestore
 */
export declare function parseDelegation(data: unknown): Delegation | null;
/**
 * Validate and parse a PendingAction from Firestore
 */
export declare function parsePendingAction(data: unknown): PendingAction | null;
/**
 * Validate and parse a ScheduledJob from Firestore
 */
export declare function parseScheduledJob(data: unknown): ScheduledJob | null;
/**
 * Validate and parse BackgroundData from Firestore
 */
export declare function parseBackgroundData(data: unknown): BackgroundData | null;
/**
 * Convert dates to Firestore-safe format
 */
export declare function serializeForFirestore<T>(data: T): T;
/**
 * Convert Firestore timestamps back to Dates
 */
export declare function deserializeFromFirestore<T>(data: T): T;
//# sourceMappingURL=background-types.d.ts.map