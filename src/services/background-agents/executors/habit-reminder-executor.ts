/**
 * Habit Reminder Executor
 *
 * Maya's domain - triggers habit reminders in the background.
 * "BETTER THAN HUMAN" - We remember your commitments even when you forget.
 *
 * Features:
 * - Sends gentle nudges for habits
 * - Tracks streak status
 * - Adapts timing based on user patterns
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { captureBackgroundResult } from '../unified-result-capture.js';
import type { OutcomeStatus, ResultPriority } from '../result-types.js';

const log = createLogger({ module: 'HabitReminderExecutor' });

// ============================================================================
// TYPES
// ============================================================================

export interface HabitReminderRequest {
  userId: string;
  sessionId?: string;
  habitId: string;
  habitName: string;
  reminderType: 'gentle_nudge' | 'streak_warning' | 'celebration' | 'check_in';
  currentStreak?: number;
  scheduledTime?: string;
  context?: string;
  initiatedBy?: string;
  priority?: ResultPriority;
}

export interface HabitReminderResult {
  sent: boolean;
  habitId: string;
  habitName: string;
  reminderType: string;
  currentStreak?: number;
  message: string;
}

// ============================================================================
// EXECUTOR
// ============================================================================

/**
 * Execute a habit reminder task.
 */
export async function executeHabitReminder(
  request: HabitReminderRequest
): Promise<HabitReminderResult> {
  log.info({ userId: request.userId, habitName: request.habitName }, 'Executing habit reminder');

  const startTime = Date.now();

  try {
    // Build the reminder message based on type
    const message = buildReminderMessage(request);

    const result: HabitReminderResult = {
      sent: true,
      habitId: request.habitId,
      habitName: request.habitName,
      reminderType: request.reminderType,
      currentStreak: request.currentStreak,
      message,
    };

    // Determine status and summary
    const status: OutcomeStatus = 'success';
    const summary = buildSummary(request, result);

    // Store result via unified capture
    await captureBackgroundResult({
      userId: request.userId,
      type: 'reminder_triggered',
      status,
      summary,
      priority: request.priority || getPriorityForType(request.reminderType),
      initiatedBy: request.initiatedBy || 'maya',
      sessionId: request.sessionId,
      details: message,
      specificData: {
        habitId: request.habitId,
        habitName: request.habitName,
        reminderType: request.reminderType,
        currentStreak: request.currentStreak,
        durationMs: Date.now() - startTime,
      },
    });

    log.info(
      { userId: request.userId, habitName: request.habitName, durationMs: Date.now() - startTime },
      'Habit reminder completed'
    );

    return result;
  } catch (error) {
    log.error({ error: String(error), userId: request.userId }, 'Habit reminder failed');

    // Report failure
    await captureBackgroundResult({
      userId: request.userId,
      type: 'reminder_triggered',
      status: 'failed',
      summary: `Couldn't send reminder for "${request.habitName}"`,
      priority: 'low',
      initiatedBy: request.initiatedBy || 'maya',
      sessionId: request.sessionId,
      details: `Error: ${String(error)}`,
    });

    throw error;
  }
}

/**
 * Queue a habit reminder for background execution.
 */
export async function queueHabitReminder(request: HabitReminderRequest): Promise<string> {
  log.info({ userId: request.userId, habitName: request.habitName }, 'Queueing habit reminder');

  // For now, execute immediately (can be changed to actual queue later)
  const taskId = `habit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Fire and forget - don't await
  void executeHabitReminder(request).catch((err) => {
    log.error({ error: String(err), taskId }, 'Queued habit reminder failed');
  });

  return taskId;
}

// ============================================================================
// HELPERS
// ============================================================================

function buildReminderMessage(request: HabitReminderRequest): string {
  const { habitName, reminderType, currentStreak } = request;

  switch (reminderType) {
    case 'gentle_nudge':
      return `Hey! Just a gentle reminder about "${habitName}". You've got this! 🌱`;

    case 'streak_warning':
      return `Your ${currentStreak || 0}-day streak for "${habitName}" is at risk! Don't let it slip. 💪`;

    case 'celebration':
      return `Amazing! You've maintained "${habitName}" for ${currentStreak || 0} days! Keep it up! 🎉`;

    case 'check_in':
      return `How's "${habitName}" going today? I'm here if you need support. 🤗`;

    default:
      return `Reminder about "${habitName}"`;
  }
}

function buildSummary(request: HabitReminderRequest, result: HabitReminderResult): string {
  const { habitName, reminderType, currentStreak } = request;

  switch (reminderType) {
    case 'gentle_nudge':
      return `Sent a gentle nudge about "${habitName}"`;

    case 'streak_warning':
      return `Sent streak warning - ${currentStreak || 0} days at risk for "${habitName}"`;

    case 'celebration':
      return `Celebrated ${currentStreak || 0}-day streak for "${habitName}"! 🎉`;

    case 'check_in':
      return `Checked in about "${habitName}"`;

    default:
      return `Reminder sent for "${habitName}"`;
  }
}

function getPriorityForType(reminderType: string): ResultPriority {
  switch (reminderType) {
    case 'streak_warning':
      return 'high';
    case 'celebration':
      return 'high';
    case 'gentle_nudge':
      return 'normal';
    case 'check_in':
      return 'low';
    default:
      return 'normal';
  }
}
