/**
 * Timer Utilities
 *
 * Set and manage timers with voice callbacks.
 *
 * @module simple-utilities/timer-tools
 */
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';
import { recordUsage, getTimerFollowUp, getUserPatterns, } from './pattern-intelligence.js';
import { updateTimerPreferences } from './persistence.js';
import { onTimerComplete } from './voice-callbacks.js';
import { activeTimers } from './shared-state.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
const setTimerDef = {
    id: 'setTimer',
    name: 'Set Timer',
    description: 'Set a simple countdown timer',
    domain: 'simple-utilities',
    tags: ['timer', 'countdown', 'alarm', 'reminder'],
    create: (_ctx) => {
        return llm.tool({
            description: getToolDescription('setTimer'),
            parameters: z.object({
                minutes: z.number().optional().describe('Minutes for the timer'),
                seconds: z.number().optional().describe('Seconds for the timer'),
                label: z.string().optional().describe('What the timer is for'),
            }),
            execute: async ({ minutes = 0, seconds = 0, label }, { ctx: toolCtx }) => {
                const totalMs = (minutes * 60 + seconds) * 1000;
                if (totalMs <= 0) {
                    return 'I need a time for the timer. Try "5 minutes" or "30 seconds".';
                }
                if (totalMs > 60 * 60 * 1000) {
                    return "For times over an hour, I'd recommend setting an actual reminder instead. Want me to do that?";
                }
                const userData = toolCtx.userData;
                const userId = userData?.userId || 'session';
                // Record usage for pattern learning
                recordUsage(userId, 'setTimer', { minutes, seconds, label });
                // Clear any existing timer for this user
                const existing = activeTimers.get(userId);
                if (existing) {
                    clearTimeout(existing.timeout);
                }
                const endTime = new Date(Date.now() + totalMs);
                const timerLabel = label || 'Timer';
                // Set the timer with voice callback when complete
                const timeout = setTimeout(() => {
                    activeTimers.delete(userId);
                    // Trigger voice callback - actually speaks to user!
                    void onTimerComplete(userId, timerLabel, minutes + seconds / 60).then(() => {
                        // Get personalized follow-up message for logging
                        const followUpMsg = getTimerFollowUp(userId);
                        getLogger().info({ userId, label: timerLabel, followUp: followUpMsg }, '⏰ Timer finished!');
                    });
                }, totalMs);
                // Persist timer preference for cross-session learning
                const hour = new Date().getHours();
                const timeOfDay = hour >= 5 && hour < 12
                    ? 'morning'
                    : hour >= 12 && hour < 17
                        ? 'afternoon'
                        : hour >= 17 && hour < 21
                            ? 'evening'
                            : 'night';
                updateTimerPreferences(userId, {
                    minutes: minutes + seconds / 60,
                    label: label,
                    timeOfDay,
                }).catch((err) => getLogger().debug({ err }, 'Failed to persist timer preference'));
                activeTimers.set(userId, { timeout, label: timerLabel, endTime });
                // Check if this is their usual timer
                const patterns = getUserPatterns(userId);
                const usualTimer = patterns.patterns.commonTimerDurations.find((d) => Math.abs(d.minutes - (minutes + seconds / 60)) < 0.5 && d.count >= 3);
                const timeStr = minutes > 0
                    ? seconds > 0
                        ? `${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''}`
                        : `${minutes} minute${minutes !== 1 ? 's' : ''}`
                    : `${seconds} second${seconds !== 1 ? 's' : ''}`;
                // Personalize response based on patterns
                let response = usualTimer && usualTimer.label
                    ? `⏱️ **Your ${usualTimer.label} timer set for ${timeStr}!**`
                    : `⏱️ **Timer set for ${timeStr}!**${label ? `\n(${label})` : ''}`;
                response += `\n\nI'll check in when it's done!`;
                return response;
            },
        });
    },
};
const cancelTimerDef = {
    id: 'cancelTimer',
    name: 'Cancel Timer',
    description: 'Cancel an active timer',
    domain: 'simple-utilities',
    tags: ['timer', 'cancel', 'stop'],
    create: (_ctx) => {
        return llm.tool({
            description: getToolDescription('cancelTimer'),
            parameters: z.object({}),
            execute: async (_, { ctx: toolCtx }) => {
                const userData = toolCtx.userData;
                const userId = userData?.userId || 'session';
                const timer = activeTimers.get(userId);
                if (timer) {
                    clearTimeout(timer.timeout);
                    activeTimers.delete(userId);
                    return `⏱️ Timer canceled (was set for ${timer.label})`;
                }
                return "You don't have an active timer running.";
            },
        });
    },
};
// ============================================================================
// EXPORTS
// ============================================================================
export const timerToolDefinitions = [setTimerDef, cancelTimerDef];
export { setTimerDef, cancelTimerDef };
//# sourceMappingURL=timer-tools.js.map