/**
 * Workflow Action Executor
 *
 * Executes workflow actions by calling real services.
 * This is the SINGLE source of truth for action execution.
 * Used by both:
 *   - life-automation-routes.ts (API-triggered runs)
 *   - workflow-engine.ts (time-based triggers)
 *
 * @module services/workflows/action-executor
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'action-executor' });
// ============================================================================
// VARIABLE INTERPOLATION
// ============================================================================
/**
 * Interpolate {{variable}} placeholders in strings
 */
function interpolate(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }
    return result;
}
/**
 * Interpolate variables in action params
 */
function interpolateParams(params, variables) {
    const result = {};
    for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'string') {
            result[key] = interpolate(value, variables);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
// ============================================================================
// ACTION EXECUTOR
// ============================================================================
/**
 * Execute a single workflow action
 * This is the REAL implementation that calls actual services.
 */
export async function executeAction(action, context) {
    const { userId, variables } = context;
    const params = interpolateParams(action.params, variables);
    try {
        switch (action.type) {
            // ========================================================================
            // MESSAGING
            // ========================================================================
            case 'speak_message': {
                const { sendPushNotification } = await import('../outreach/delivery/push-notifications.js');
                const result = await sendPushNotification({
                    userId,
                    personaId: 'ferni',
                    outreachId: `routine_${action.id}_${Date.now()}`,
                    title: 'Ferni',
                    body: String(params.message),
                    priority: 'normal',
                });
                const sent = result.some((r) => r.success);
                log.info({ userId, sent, message: params.message }, '💬 Speak message sent');
                return { success: sent, output: { spoken: sent, message: params.message } };
            }
            case 'send_notification': {
                const { sendPushNotification } = await import('../outreach/delivery/push-notifications.js');
                const result = await sendPushNotification({
                    userId,
                    personaId: 'ferni',
                    outreachId: `routine_notif_${action.id}_${Date.now()}`,
                    title: String(params.title || 'Ferni'),
                    body: String(params.body || params.message || ''),
                    priority: String(params.priority || 'normal'),
                });
                const sent = result.some((r) => r.success);
                log.info({ userId, sent, title: params.title }, '🔔 Push notification sent');
                return { success: sent, output: { sent, title: params.title } };
            }
            // ========================================================================
            // HABITS
            // ========================================================================
            case 'log_habit': {
                const { logHabit } = await import('../../tools/domains/habits/habits.js');
                const habitId = String(params.habitId || params.habitName);
                const result = logHabit({
                    userId,
                    habitId,
                    count: params.count ? Number(params.count) : undefined,
                    notes: params.notes ? String(params.notes) : undefined,
                });
                log.info({ userId, habitId, result }, '✅ Habit logged');
                return { success: true, output: { logged: true, habitId, result } };
            }
            // ========================================================================
            // REMINDERS
            // ========================================================================
            case 'add_reminder': {
                const reminderTime = parseReminderTime(String(params.time || ''));
                if (reminderTime) {
                    const delayMs = reminderTime.getTime() - Date.now();
                    if (delayMs > 0) {
                        const { scheduleAction } = await import('./scheduled-actions.js');
                        const scheduled = await scheduleAction({
                            userId,
                            scheduledFor: reminderTime,
                            title: '⏰ Reminder',
                            body: String(params.message),
                            workflowId: action.id,
                            personaId: 'ferni',
                        });
                        log.info({ userId, actionId: scheduled.id, time: reminderTime }, '⏰ Reminder scheduled');
                        return { success: true, output: { created: true, time: reminderTime, actionId: scheduled.id } };
                    }
                    else {
                        const { sendPushNotification } = await import('../outreach/delivery/push-notifications.js');
                        await sendPushNotification({
                            userId,
                            personaId: 'ferni',
                            outreachId: `reminder_${action.id}_${Date.now()}`,
                            title: '⏰ Reminder',
                            body: String(params.message),
                            priority: 'high',
                        });
                        log.info({ userId, message: params.message }, '⏰ Reminder sent immediately');
                        return { success: true, output: { created: true, sentImmediately: true } };
                    }
                }
                log.warn({ userId, time: params.time }, 'Could not parse reminder time');
                return { success: false, error: 'Invalid time format' };
            }
            // ========================================================================
            // MUSIC
            // ========================================================================
            case 'play_music': {
                try {
                    const { playInRoom } = await import('../identity/spotify-room-service.js');
                    const query = String(params.query || params.genre || params.playlist || 'relaxing music');
                    const room = String(params.room || params.device || 'default');
                    const result = await playInRoom(userId, room, { query });
                    log.info({ userId, query, room, success: result.success }, '🎵 Music played');
                    return { success: result.success, output: { playing: result.success, query, room }, error: result.error };
                }
                catch (error) {
                    log.warn({ userId, error: String(error) }, 'Music playback failed');
                    return { success: false, error: String(error) };
                }
            }
            // ========================================================================
            // SMART HOME
            // ========================================================================
            case 'control_lights': {
                try {
                    const { controlLights } = await import('../smart-home/unified-smart-home.js');
                    const result = await controlLights(userId, {
                        zone: String(params.zone || 'all'),
                        state: String(params.state || 'on'),
                        brightness: params.brightness ? Number(params.brightness) : undefined,
                        color: params.color ? String(params.color) : undefined,
                    });
                    log.info({ userId, zone: params.zone, state: params.state }, '💡 Lights controlled');
                    return { success: result.success, output: { controlled: result.success, zone: params.zone }, error: result.error };
                }
                catch (error) {
                    log.warn({ userId, error: String(error) }, 'Light control failed');
                    return { success: false, error: String(error) };
                }
            }
            case 'set_thermostat': {
                try {
                    const { setThermostat } = await import('../smart-home/unified-smart-home.js');
                    const result = await setThermostat(userId, {
                        temperature: Number(params.temperature || 72),
                        mode: params.mode ? String(params.mode) : undefined,
                    });
                    log.info({ userId, temperature: params.temperature }, '🌡️ Thermostat set');
                    return { success: result.success, output: { set: result.success, temperature: params.temperature }, error: result.error };
                }
                catch (error) {
                    log.warn({ userId, error: String(error) }, 'Thermostat control failed');
                    return { success: false, error: String(error) };
                }
            }
            // ========================================================================
            // CUSTOM / INTEGRATION
            // ========================================================================
            case 'custom': {
                // Handle calendar checks as custom actions
                if (params.action === 'check_calendar' || params.integration === 'calendar') {
                    try {
                        const { getEvents } = await import('../calendar/unified-calendar-store.js');
                        const hours = Number(params.hours || 24);
                        const startTime = new Date();
                        const endTime = new Date(startTime.getTime() + hours * 60 * 60 * 1000);
                        const events = await getEvents(userId, startTime, endTime);
                        log.info({ userId, eventCount: events.length }, '📅 Calendar checked');
                        return { success: true, output: { events, count: events.length } };
                    }
                    catch (error) {
                        log.warn({ userId, error: String(error) }, 'Calendar check failed');
                        return { success: false, error: String(error) };
                    }
                }
                log.info({ userId, integration: params.integration, query: params.query }, 'Custom action');
                return { success: true, output: { executed: true, params } };
            }
            // ========================================================================
            // FLOW CONTROL
            // ========================================================================
            case 'wait': {
                const seconds = Number(params.seconds || params.waitSeconds || 0);
                if (seconds > 0) {
                    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
                }
                return { success: true };
            }
            case 'set_variable': {
                // Variables are handled by the workflow engine's context
                return { success: true };
            }
            default:
                log.warn({ actionType: action.type }, 'Unknown action type');
                return { success: false, error: `Unknown action type: ${action.type}` };
        }
    }
    catch (error) {
        log.error({ actionType: action.type, error: String(error) }, 'Action execution failed');
        return { success: false, error: String(error) };
    }
}
// ============================================================================
// HELPERS
// ============================================================================
/**
 * Parse a reminder time string into a Date
 */
function parseReminderTime(timeStr) {
    if (!timeStr)
        return null;
    try {
        // Handle relative times: "in 30 minutes", "in 2 hours"
        const relativeMatch = timeStr.match(/in\s+(\d+)\s*(minute|min|hour|hr)s?/i);
        if (relativeMatch) {
            const amount = parseInt(relativeMatch[1] ?? '0', 10);
            const unit = relativeMatch[2]?.toLowerCase();
            const now = new Date();
            if (unit?.startsWith('hour') || unit?.startsWith('hr')) {
                now.setHours(now.getHours() + amount);
            }
            else {
                now.setMinutes(now.getMinutes() + amount);
            }
            return now;
        }
        // Handle absolute times: "3:00 PM", "15:00"
        const absMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
        if (absMatch) {
            let hours = parseInt(absMatch[1] ?? '0', 10);
            const minutes = parseInt(absMatch[2] ?? '0', 10);
            const period = absMatch[3]?.toLowerCase();
            if (period === 'pm' && hours !== 12)
                hours += 12;
            if (period === 'am' && hours === 12)
                hours = 0;
            const date = new Date();
            date.setHours(hours, minutes, 0, 0);
            if (date.getTime() < Date.now()) {
                date.setDate(date.getDate() + 1);
            }
            return date;
        }
        // Handle "tomorrow at X"
        const tomorrowMatch = timeStr.match(/tomorrow\s+(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
        if (tomorrowMatch) {
            let hours = parseInt(tomorrowMatch[1] ?? '9', 10);
            const minutes = parseInt(tomorrowMatch[2] ?? '0', 10);
            const period = tomorrowMatch[3]?.toLowerCase();
            if (period === 'pm' && hours !== 12)
                hours += 12;
            if (period === 'am' && hours === 12)
                hours = 0;
            const date = new Date();
            date.setDate(date.getDate() + 1);
            date.setHours(hours, minutes, 0, 0);
            return date;
        }
        // Try parsing as ISO date
        const parsed = new Date(timeStr);
        if (!isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    catch {
        // Fall through
    }
    return null;
}
export default executeAction;
//# sourceMappingURL=action-executor.js.map