/**
 * Tasks / To-Do List Tools
 *
 * Simple, voice-friendly task management for daily productivity.
 * Unlike goals (long-term), tasks are immediate, actionable items.
 *
 * Features:
 * - Quick task capture
 * - Due dates and priorities
 * - Categories and tags
 * - Recurring tasks
 * - Smart suggestions
 */
import { llm } from '@livekit/agents';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskCategory = 'personal' | 'work' | 'home' | 'health' | 'finance' | 'family' | 'errands' | 'other';
export type RecurrencePattern = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
export interface Task {
    id: string;
    userId: string;
    title: string;
    description?: string;
    category: TaskCategory;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate?: Date;
    dueTime?: string;
    reminderMinutesBefore?: number;
    isRecurring: boolean;
    recurrencePattern?: RecurrencePattern;
    recurrenceEndDate?: Date;
    parentTaskId?: string;
    tags: string[];
    notes?: string;
    linkedGoalId?: string;
    linkedAppointmentId?: string;
    completedAt?: Date;
    completionNotes?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare function getUserTasks(userId: string): Task[];
export declare function createTask(params: {
    userId: string;
    title: string;
    description?: string;
    category?: TaskCategory;
    priority?: TaskPriority;
    dueDate?: Date | string;
    dueTime?: string;
    tags?: string[];
    isRecurring?: boolean;
    recurrencePattern?: RecurrencePattern;
    recurrenceEndDate?: Date;
    linkedGoalId?: string;
    reminderMinutesBefore?: number;
}): Promise<Task>;
export declare function completeTask(taskId: string, completionNotes?: string): Promise<{
    task: Task;
    nextInstance?: Task;
} | null>;
export declare function updateTask(taskId: string, updates: Partial<Pick<Task, 'title' | 'description' | 'category' | 'priority' | 'status' | 'dueDate' | 'dueTime' | 'tags' | 'notes'>>): Task | null;
export declare function deleteTask(taskId: string): boolean;
export declare function getOverdueTasks(userId: string): Task[];
export declare function getTodaysTasks(userId: string): Task[];
export declare function getUpcomingTasks(userId: string, days?: number): Task[];
export declare function createTaskTools(): {
    addTask: llm.FunctionTool<{
        title: string;
        priority: "medium" | "low" | "high" | "urgent";
        category: "personal" | "finance" | "health" | "family" | "home" | "other" | "work" | "errands";
        isRecurring: boolean;
        dueDate?: string | undefined;
        recurrencePattern?: "quarterly" | "monthly" | "weekly" | "yearly" | "daily" | "biweekly" | "weekdays" | undefined;
    }, unknown, string>;
    completeTask: llm.FunctionTool<{
        taskTitle: string;
        notes?: string | undefined;
    }, unknown, string>;
    getTasks: llm.FunctionTool<{
        filter: "completed" | "all" | "today" | "upcoming" | "overdue";
        category?: "personal" | "finance" | "health" | "family" | "home" | "other" | "work" | "errands" | undefined;
    }, unknown, string>;
    updateTaskPriority: llm.FunctionTool<{
        taskTitle: string;
        priority: "medium" | "low" | "high" | "urgent";
    }, unknown, string>;
    rescheduleTask: llm.FunctionTool<{
        taskTitle: string;
        newDueDate: string;
    }, unknown, string>;
    deleteTask: llm.FunctionTool<{
        taskTitle: string;
        confirm: boolean;
    }, unknown, string>;
    getTaskSummary: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export default createTaskTools;
//# sourceMappingURL=tasks.d.ts.map