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
import { z } from 'zod';
import { sanitizePlainText } from '../../validation.js';
import { getProductivityStore, } from '../../../services/stores/productivity-store.js';
import { getLogger, generateId } from '../../utils/tool-helpers.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { syncTaskToCalendar, removeCalendarSyncedItem, } from '../../../services/calendar/calendar-bridge.js';
// Bridge function to convert TaskData to Task
function taskDataToTask(data, userId) {
    return {
        id: data.id,
        userId: userId,
        title: data.title,
        description: data.description,
        category: data.category,
        priority: data.priority,
        status: data.status,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        dueTime: data.dueTime,
        reminderMinutesBefore: data.reminderMinutesBefore,
        isRecurring: data.isRecurring,
        recurrencePattern: data.recurrencePattern,
        recurrenceEndDate: data.recurrenceEndDate ? new Date(data.recurrenceEndDate) : undefined,
        parentTaskId: data.parentTaskId,
        tags: data.tags,
        notes: data.notes,
        linkedGoalId: data.linkedGoalId,
        completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
        completionNotes: data.completionNotes,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
    };
}
// Bridge function to convert Task to TaskData
function taskToTaskData(task) {
    return {
        id: task.id,
        title: task.title,
        description: task.description,
        category: task.category,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate?.toISOString(),
        dueTime: task.dueTime,
        reminderMinutesBefore: task.reminderMinutesBefore,
        isRecurring: task.isRecurring,
        recurrencePattern: task.recurrencePattern,
        recurrenceEndDate: task.recurrenceEndDate?.toISOString(),
        parentTaskId: task.parentTaskId,
        tags: task.tags,
        notes: task.notes,
        linkedGoalId: task.linkedGoalId,
        completedAt: task.completedAt?.toISOString(),
        completionNotes: task.completionNotes,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
    };
}
// ============================================================================
// STORAGE - Uses ProductivityStore for persistence
// ============================================================================
// In-memory cache for fast access (synced with persistent store)
const tasksCache = new Map();
const loadedUsers = new Set();
// Load tasks from persistent store for a user
async function ensureUserTasksLoaded(userId) {
    if (loadedUsers.has(userId))
        return;
    try {
        const store = getProductivityStore();
        await store.loadUserData(userId);
        const taskDataList = store.getUserTasks(userId);
        for (const taskData of taskDataList) {
            const task = taskDataToTask(taskData, userId);
            tasksCache.set(task.id, task);
        }
        loadedUsers.add(userId);
        getLogger().debug({ userId, count: taskDataList.length }, 'Loaded tasks from store');
    }
    catch (error) {
        getLogger().warn({ error, userId }, 'Failed to load tasks from store');
        loadedUsers.add(userId); // Mark as loaded to prevent repeated failures
    }
}
// Save task to persistent store
function persistTask(userId, task) {
    try {
        const store = getProductivityStore();
        store.setTask(userId, taskToTaskData(task));
    }
    catch (error) {
        getLogger().warn({ error, taskId: task.id }, 'Failed to persist task');
    }
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
export function getUserTasks(userId) {
    // Note: This is sync for backward compatibility, but caller should ensure tasks are loaded
    // In tool execute functions, we call ensureUserTasksLoaded first
    return Array.from(tasksCache.values())
        .filter((t) => t.userId === userId)
        .sort((a, b) => {
        // Sort by: status (pending first), then priority, then due date
        if (a.status !== b.status) {
            const statusOrder = { pending: 0, in_progress: 1, completed: 2, cancelled: 3 };
            return statusOrder[a.status] - statusOrder[b.status];
        }
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        if (a.priority !== b.priority) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        if (a.dueDate && b.dueDate) {
            return a.dueDate.getTime() - b.dueDate.getTime();
        }
        return a.dueDate ? -1 : 1;
    });
}
function parseNaturalDueDate(expression) {
    const now = new Date();
    const lower = expression.toLowerCase().trim();
    if (lower === 'today') {
        const today = new Date(now);
        today.setHours(23, 59, 0, 0);
        return today;
    }
    if (lower === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 0, 0);
        return tomorrow;
    }
    if (lower === 'this week' || lower === 'end of week') {
        const endOfWeek = new Date(now);
        const daysUntilSunday = 7 - now.getDay();
        endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
        endOfWeek.setHours(23, 59, 0, 0);
        return endOfWeek;
    }
    if (lower === 'next week') {
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return nextWeek;
    }
    // Handle "in X days"
    const inDaysMatch = lower.match(/in\s+(\d+)\s+days?/);
    if (inDaysMatch) {
        const days = parseInt(inDaysMatch[1]);
        const target = new Date(now);
        target.setDate(target.getDate() + days);
        return target;
    }
    // Handle day names
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
        if (lower.includes(days[i])) {
            const target = new Date(now);
            const currentDay = now.getDay();
            const daysUntil = (i - currentDay + 7) % 7 || 7;
            target.setDate(target.getDate() + daysUntil);
            target.setHours(23, 59, 0, 0);
            return target;
        }
    }
    // Try parsing as date string
    const parsed = new Date(expression);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }
    return null;
}
function formatTaskForSpeech(task) {
    const priorityEmoji = { urgent: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[task.priority];
    const statusEmoji = { pending: '☐', in_progress: '🔄', completed: '✅', cancelled: '❌' }[task.status];
    let result = `${statusEmoji} ${priorityEmoji} ${task.title}`;
    if (task.dueDate) {
        const now = new Date();
        const isOverdue = task.dueDate < now && task.status === 'pending';
        const dateStr = task.dueDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        });
        result += isOverdue ? ` ⚠️ OVERDUE (${dateStr})` : ` - Due: ${dateStr}`;
    }
    if (task.isRecurring) {
        result += ' 🔁';
    }
    return result;
}
function createNextRecurringInstance(task) {
    if (!task.isRecurring || !task.recurrencePattern || !task.dueDate) {
        return null;
    }
    // Check if we're past the end date
    if (task.recurrenceEndDate && new Date() > task.recurrenceEndDate) {
        return null;
    }
    const nextDue = new Date(task.dueDate);
    switch (task.recurrencePattern) {
        case 'daily':
            nextDue.setDate(nextDue.getDate() + 1);
            break;
        case 'weekdays':
            do {
                nextDue.setDate(nextDue.getDate() + 1);
            } while (nextDue.getDay() === 0 || nextDue.getDay() === 6);
            break;
        case 'weekly':
            nextDue.setDate(nextDue.getDate() + 7);
            break;
        case 'biweekly':
            nextDue.setDate(nextDue.getDate() + 14);
            break;
        case 'monthly':
            nextDue.setMonth(nextDue.getMonth() + 1);
            break;
        case 'quarterly':
            nextDue.setMonth(nextDue.getMonth() + 3);
            break;
        case 'yearly':
            nextDue.setFullYear(nextDue.getFullYear() + 1);
            break;
    }
    const newTask = {
        ...task,
        id: generateId('task'),
        status: 'pending',
        dueDate: nextDue,
        completedAt: undefined,
        completionNotes: undefined,
        parentTaskId: task.id,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    return newTask;
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
export async function createTask(params) {
    const sanitizedTitle = sanitizePlainText(params.title, 200);
    const sanitizedDesc = params.description
        ? sanitizePlainText(params.description, 1000)
        : undefined;
    const dueDate = typeof params.dueDate === 'string' ? parseNaturalDueDate(params.dueDate) : params.dueDate;
    const task = {
        id: generateId('task'),
        userId: params.userId,
        title: sanitizedTitle,
        description: sanitizedDesc,
        category: params.category || 'personal',
        priority: params.priority || 'medium',
        status: 'pending',
        dueDate: dueDate || undefined,
        dueTime: params.dueTime,
        reminderMinutesBefore: params.reminderMinutesBefore,
        isRecurring: params.isRecurring || false,
        recurrencePattern: params.recurrencePattern,
        recurrenceEndDate: params.recurrenceEndDate,
        tags: params.tags || [],
        linkedGoalId: params.linkedGoalId,
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    // Save to cache and persist
    tasksCache.set(task.id, task);
    persistTask(params.userId, task);
    // Sync task with due date to calendar
    if (dueDate) {
        try {
            // If there's a specific time, use it; otherwise use end of day
            const scheduledFor = new Date(dueDate);
            if (params.dueTime) {
                const [hours, minutes] = params.dueTime.split(':').map(Number);
                scheduledFor.setHours(hours, minutes, 0, 0);
            }
            else {
                // Default to 9 AM if no specific time
                scheduledFor.setHours(9, 0, 0, 0);
            }
            await syncTaskToCalendar(params.userId, task.id, sanitizedTitle, scheduledFor, 30 // Default 30 min duration
            );
        }
        catch (calendarError) {
            getLogger().warn({ error: calendarError, taskId: task.id }, 'Failed to sync task to calendar');
        }
    }
    getLogger().info({ taskId: task.id, title: sanitizedTitle, dueDate: dueDate?.toISOString() }, 'Task created');
    return task;
}
export async function completeTask(taskId, completionNotes) {
    const task = tasksCache.get(taskId);
    if (!task)
        return null;
    task.status = 'completed';
    task.completedAt = new Date();
    task.completionNotes = completionNotes;
    task.updatedAt = new Date();
    // Save to cache and persist
    tasksCache.set(taskId, task);
    persistTask(task.userId, task);
    // Remove from calendar when completed
    if (task.dueDate) {
        try {
            await removeCalendarSyncedItem(task.userId, taskId);
        }
        catch (calendarError) {
            getLogger().warn({ error: calendarError, taskId }, 'Failed to remove task from calendar');
        }
    }
    // Create next instance if recurring
    let nextInstance;
    if (task.isRecurring) {
        const next = createNextRecurringInstance(task);
        if (next) {
            tasksCache.set(next.id, next);
            persistTask(task.userId, next);
            nextInstance = next;
        }
    }
    getLogger().info({ taskId, title: task.title, hasNext: !!nextInstance }, 'Task completed');
    return { task, nextInstance };
}
export function updateTask(taskId, updates) {
    const task = tasksCache.get(taskId);
    if (!task)
        return null;
    if (updates.title)
        task.title = sanitizePlainText(updates.title, 200);
    if (updates.description !== undefined)
        task.description = sanitizePlainText(updates.description, 1000);
    if (updates.category)
        task.category = updates.category;
    if (updates.priority)
        task.priority = updates.priority;
    if (updates.status)
        task.status = updates.status;
    if (updates.dueDate !== undefined)
        task.dueDate = updates.dueDate;
    if (updates.dueTime !== undefined)
        task.dueTime = updates.dueTime;
    if (updates.tags)
        task.tags = updates.tags;
    if (updates.notes !== undefined)
        task.notes = updates.notes;
    task.updatedAt = new Date();
    // Save to cache and persist
    tasksCache.set(taskId, task);
    persistTask(task.userId, task);
    return task;
}
export function deleteTask(taskId) {
    const task = tasksCache.get(taskId);
    if (!task)
        return false;
    // Remove from cache
    tasksCache.delete(taskId);
    // Remove from persistent store
    try {
        const store = getProductivityStore();
        store.deleteTask(taskId);
    }
    catch (error) {
        getLogger().warn({ error, taskId }, 'Failed to delete task from store');
    }
    return true;
}
export function getOverdueTasks(userId) {
    const now = new Date();
    return getUserTasks(userId).filter((t) => t.status === 'pending' && t.dueDate && t.dueDate < now);
}
export function getTodaysTasks(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return getUserTasks(userId).filter((t) => t.status === 'pending' && t.dueDate && t.dueDate >= today && t.dueDate < tomorrow);
}
export function getUpcomingTasks(userId, days = 7) {
    const now = new Date();
    const future = new Date(now);
    future.setDate(future.getDate() + days);
    return getUserTasks(userId).filter((t) => t.status === 'pending' && t.dueDate && t.dueDate >= now && t.dueDate <= future);
}
// ============================================================================
// TOOL DEFINITIONS
// ============================================================================
export function createTaskTools() {
    return {
        addTask: llm.tool({
            description: getToolDescription('addTask'),
            parameters: z.object({
                title: z.string().describe('What needs to be done'),
                dueDate: z
                    .string()
                    .optional()
                    .describe('When it\'s due (e.g., "today", "tomorrow", "Friday", "in 3 days")'),
                priority: z
                    .enum(['low', 'medium', 'high', 'urgent'])
                    .optional()
                    .default('medium')
                    .describe('How important/urgent'),
                category: z
                    .enum(['personal', 'work', 'home', 'health', 'finance', 'family', 'errands', 'other'])
                    .optional()
                    .default('personal')
                    .describe('Task category'),
                isRecurring: z.boolean().optional().default(false).describe('Does this repeat?'),
                recurrencePattern: z
                    .enum(['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'])
                    .optional()
                    .describe('How often it repeats'),
            }),
            execute: async ({ title, dueDate, priority, category, isRecurring, recurrencePattern }, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                // Ensure user's tasks are loaded from persistent store
                await ensureUserTasksLoaded(userId);
                const task = await createTask({
                    userId,
                    title,
                    dueDate: dueDate || undefined,
                    priority,
                    category,
                    isRecurring,
                    recurrencePattern,
                });
                let response = `Added: "${task.title}"`;
                if (task.dueDate) {
                    const dateStr = task.dueDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                    });
                    response += ` - Due ${dateStr} (added to calendar)`;
                }
                if (task.isRecurring && task.recurrencePattern) {
                    response += ` (repeats ${task.recurrencePattern})`;
                }
                if (task.priority === 'urgent' || task.priority === 'high') {
                    response += ` [HIGH PRIORITY]`;
                }
                return response;
            },
        }),
        completeTask: llm.tool({
            description: getToolDescription('completeTask'),
            parameters: z.object({
                taskTitle: z.string().describe('Which task to complete (partial match OK)'),
                notes: z.string().optional().describe('Any completion notes'),
            }),
            execute: async ({ taskTitle, notes }, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserTasksLoaded(userId);
                const userTasks = getUserTasks(userId);
                const task = userTasks.find((t) => t.status === 'pending' && t.title.toLowerCase().includes(taskTitle.toLowerCase()));
                if (!task) {
                    return `I couldn't find a pending task matching "${taskTitle}". Want me to show your task list?`;
                }
                const result = await completeTask(task.id, notes);
                if (!result)
                    return `Hmm, I had trouble marking that done. Want to try again?`;
                let response = `Done! "${result.task.title}" is complete.`;
                if (result.nextInstance) {
                    const nextDate = result.nextInstance.dueDate?.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                    });
                    response += `\n\nNext occurrence scheduled for ${nextDate}.`;
                }
                // Check remaining tasks
                const remaining = userTasks.filter((t) => t.status === 'pending' && t.id !== task.id);
                if (remaining.length > 0) {
                    response += `\n\nYou have ${remaining.length} task${remaining.length > 1 ? 's' : ''} remaining today.`;
                }
                else {
                    response += `\n\nNo more tasks for today. Well done!`;
                }
                return response;
            },
        }),
        getTasks: llm.tool({
            description: getToolDescription('getTasks'),
            parameters: z.object({
                filter: z
                    .enum(['all', 'today', 'overdue', 'upcoming', 'completed'])
                    .optional()
                    .default('today')
                    .describe('Which tasks to show'),
                category: z
                    .enum(['personal', 'work', 'home', 'health', 'finance', 'family', 'errands', 'other'])
                    .optional()
                    .describe('Filter by category'),
            }),
            execute: async ({ filter, category }, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserTasksLoaded(userId);
                let taskList;
                let title;
                switch (filter) {
                    case 'today':
                        taskList = getTodaysTasks(userId);
                        title = "📋 Today's Tasks";
                        break;
                    case 'overdue':
                        taskList = getOverdueTasks(userId);
                        title = '⚠️ Overdue Tasks';
                        break;
                    case 'upcoming':
                        taskList = getUpcomingTasks(userId, 7);
                        title = '📅 Upcoming Tasks (Next 7 Days)';
                        break;
                    case 'completed':
                        taskList = getUserTasks(userId).filter((t) => t.status === 'completed');
                        title = '✅ Completed Tasks';
                        break;
                    default:
                        taskList = getUserTasks(userId).filter((t) => t.status === 'pending');
                        title = '📋 All Tasks';
                }
                if (category) {
                    taskList = taskList.filter((t) => t.category === category);
                    title += ` (${category})`;
                }
                if (taskList.length === 0) {
                    if (filter === 'today') {
                        return `✨ No tasks for today! You're all caught up. Want to add something?`;
                    }
                    return `No ${filter} tasks found. ${filter === 'overdue' ? '🎉 Great job staying on top of things!' : ''}`;
                }
                const formatted = taskList
                    .slice(0, 10)
                    .map((t, i) => `${i + 1}. ${formatTaskForSpeech(t)}`)
                    .join('\n');
                let response = `${title} (${taskList.length}):\n\n${formatted}`;
                if (taskList.length > 10) {
                    response += `\n\n...and ${taskList.length - 10} more.`;
                }
                // Add overdue warning if showing today's tasks
                if (filter === 'today') {
                    const overdue = getOverdueTasks(userId);
                    if (overdue.length > 0) {
                        response += `\n\n⚠️ You also have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}!`;
                    }
                }
                return response;
            },
        }),
        updateTaskPriority: llm.tool({
            description: getToolDescription('updateTaskPriority'),
            parameters: z.object({
                taskTitle: z.string().describe('Which task'),
                priority: z.enum(['low', 'medium', 'high', 'urgent']).describe('New priority'),
            }),
            execute: async ({ taskTitle, priority }, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserTasksLoaded(userId);
                const userTasks = getUserTasks(userId);
                const task = userTasks.find((t) => t.title.toLowerCase().includes(taskTitle.toLowerCase()));
                if (!task) {
                    return `Couldn't find "${taskTitle}". Want me to show your tasks?`;
                }
                const updated = updateTask(task.id, { priority });
                if (!updated)
                    return `Couldn't update that task. Want to try again?`;
                const emoji = { low: '🟢', medium: '🟡', high: '🟠', urgent: '🔴' }[priority];
                return `${emoji} Updated "${updated.title}" to ${priority} priority.`;
            },
        }),
        rescheduleTask: llm.tool({
            description: getToolDescription('rescheduleTask'),
            parameters: z.object({
                taskTitle: z.string().describe('Which task'),
                newDueDate: z.string().describe('New due date (e.g., "tomorrow", "next Monday")'),
            }),
            execute: async ({ taskTitle, newDueDate }, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserTasksLoaded(userId);
                const userTasks = getUserTasks(userId);
                const task = userTasks.find((t) => t.title.toLowerCase().includes(taskTitle.toLowerCase()));
                if (!task) {
                    return `Couldn't find "${taskTitle}".`;
                }
                const parsedDate = parseNaturalDueDate(newDueDate);
                if (!parsedDate) {
                    return `I couldn't understand "${newDueDate}". Try "tomorrow", "Friday", or "in 3 days".`;
                }
                const updated = updateTask(task.id, { dueDate: parsedDate });
                if (!updated)
                    return `Couldn't reschedule that task. Try again?`;
                const dateStr = parsedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                });
                return `📅 Moved "${updated.title}" to ${dateStr}.`;
            },
        }),
        deleteTask: llm.tool({
            description: getToolDescription('deleteTask'),
            parameters: z.object({
                taskTitle: z.string().describe('Which task to delete'),
                confirm: z.boolean().describe('User has confirmed deletion'),
            }),
            execute: async ({ taskTitle, confirm }, { ctx }) => {
                if (!confirm) {
                    return `Are you sure you want to delete "${taskTitle}"? This can't be undone. Say "yes, delete it" to confirm.`;
                }
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserTasksLoaded(userId);
                const userTasks = getUserTasks(userId);
                const task = userTasks.find((t) => t.title.toLowerCase().includes(taskTitle.toLowerCase()));
                if (!task) {
                    return `Couldn't find "${taskTitle}".`;
                }
                deleteTask(task.id);
                return `🗑️ Deleted "${task.title}" from your list.`;
            },
        }),
        getTaskSummary: llm.tool({
            description: getToolDescription('getTaskSummary'),
            parameters: z.object({}),
            execute: async (_, { ctx }) => {
                const userData = ctx?.userData;
                const userId = userData?.userId || 'default';
                await ensureUserTasksLoaded(userId);
                const allTasks = getUserTasks(userId);
                const pending = allTasks.filter((t) => t.status === 'pending');
                const overdue = getOverdueTasks(userId);
                const today = getTodaysTasks(userId);
                const completedToday = allTasks.filter((t) => {
                    if (t.status !== 'completed' || !t.completedAt)
                        return false;
                    const todayStart = new Date();
                    todayStart.setHours(0, 0, 0, 0);
                    return t.completedAt >= todayStart;
                });
                let response = `📊 **Task Summary**\n\n`;
                response += `**Today:** ${today.length} task${today.length !== 1 ? 's' : ''}\n`;
                response += `**Completed Today:** ${completedToday.length}\n`;
                response += `**Total Pending:** ${pending.length}\n`;
                if (overdue.length > 0) {
                    response += `**⚠️ Overdue:** ${overdue.length}\n`;
                }
                // Top priorities
                const urgent = pending.filter((t) => t.priority === 'urgent' || t.priority === 'high');
                if (urgent.length > 0) {
                    response += `\n🔴 **High Priority:**\n`;
                    urgent.slice(0, 3).forEach((t) => {
                        response += `• ${t.title}\n`;
                    });
                }
                if (pending.length === 0) {
                    response += `\n✨ You're all caught up! Nice work.`;
                }
                return response;
            },
        }),
    };
}
export default createTaskTools;
//# sourceMappingURL=tasks.js.map