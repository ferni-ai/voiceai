/**
 * Engagement Data Sender
 *
 * Sends engagement data to the frontend via LiveKit data messages.
 * This allows the frontend to update the engagement UI in real-time.
 */
import { getLogger } from '../utils/safe-logger.js';
import { PERSONA_RITUALS } from './daily-rituals.js';
import { EngagementStore, } from './engagement/engagement-store.js';
// ============================================================================
// DATA SENDER SERVICE
// ============================================================================
class EngagementDataSender {
    room = null;
    store;
    logger = getLogger();
    constructor() {
        this.store = new EngagementStore();
    }
    /**
     * Set the LiveKit room for sending messages
     */
    setRoom(room) {
        this.room = room;
    }
    /**
     * Clear the room reference
     */
    clearRoom() {
        this.room = null;
    }
    /**
     * Send engagement data to frontend
     */
    async sendEngagementData(userId) {
        if (!this.room) {
            this.logger.debug('[EngagementDataSender] No room set, skipping send');
            return;
        }
        try {
            const profile = await this.store.getProfile(userId);
            const weatherHistory = await this.store.getWeatherHistory(userId, 7);
            const ritualStreaks = await this.getRitualStreaks(userId);
            const predictions = await this.getPredictions(userId);
            const message = {
                type: 'engagement',
                ritualStreaks,
                weatherHistory: weatherHistory.map((w) => ({
                    primary: w.weather.primary,
                    energy: w.weather.energy,
                    note: w.weather.note,
                    recordedAt: w.date,
                })),
                predictions,
                stats: this.calculateStats(profile, ritualStreaks),
                timestamp: Date.now(),
            };
            await this.sendDataMessage(message);
            this.logger.debug({ userId, streaks: ritualStreaks.length, predictions: predictions.length }, '[EngagementDataSender] Sent engagement data');
        }
        catch (error) {
            this.logger.error({ error, userId }, '[EngagementDataSender] Failed to send engagement data');
        }
    }
    /**
     * Send an engagement trigger to frontend
     */
    async sendTrigger(trigger) {
        if (!this.room)
            return;
        const message = {
            type: 'engagement_trigger',
            triggerType: trigger.type,
            personaId: trigger.personaId,
            message: trigger.message,
            priority: trigger.priority,
            data: trigger.data,
            timestamp: Date.now(),
        };
        await this.sendDataMessage(message);
        this.logger.debug({ trigger: trigger.type }, '[EngagementDataSender] Sent trigger');
    }
    /**
     * Send ritual completion notification
     */
    async sendRitualComplete(userId, ritualId, newStreak) {
        // Update the engagement data to reflect the completion
        await this.sendEngagementData(userId);
        // Check if this is a milestone
        const milestones = [3, 7, 14, 21, 30, 60, 90, 100, 365];
        if (milestones.includes(newStreak)) {
            const ritual = PERSONA_RITUALS[ritualId];
            await this.sendTrigger({
                type: 'streak_milestone',
                personaId: ritual?.personaId || 'ferni',
                message: `${newStreak} days of ${ritual?.name || 'practice'}!`,
                priority: 'high',
                data: { ritualId, streak: newStreak },
            });
        }
    }
    /**
     * Send weather recorded notification
     */
    async sendWeatherRecorded(userId, _weather) {
        await this.sendEngagementData(userId);
    }
    /**
     * Send prediction created/updated notification
     */
    async sendPredictionUpdate(userId) {
        // Just resend all engagement data (includes predictions)
        await this.sendEngagementData(userId);
    }
    /**
     * Send prediction resolved notification with trigger
     */
    async sendPredictionResolved(userId, predictionId, accuracy) {
        await this.sendEngagementData(userId);
        // Send trigger for remarkable accuracy
        if (accuracy >= 90) {
            await this.sendTrigger({
                type: 'prediction_result',
                personaId: 'peter-john',
                message: `You called it! ${accuracy}% accuracy on that prediction.`,
                priority: 'high',
                data: { predictionId, accuracy },
            });
        }
        else if (accuracy < 50) {
            await this.sendTrigger({
                type: 'prediction_result',
                personaId: 'peter-john',
                message: `Interesting - that prediction was off by quite a bit. What got in the way?`,
                priority: 'medium',
                data: { predictionId, accuracy },
            });
        }
    }
    // ============================================================================
    // HELPER METHODS
    // ============================================================================
    async getPredictions(userId) {
        try {
            const storedPredictions = await this.store.getRecentPredictions(userId, 20);
            return storedPredictions.map((p) => ({
                id: p.id,
                category: this.extractCategoryFromPrediction(p),
                question: this.formatPredictionQuestion(p),
                userPrediction: this.extractMainPrediction(p),
                actualOutcome: p.accuracy,
                status: p.completedAt ? 'resolved' : 'pending',
                createdAt: p.createdAt,
            }));
        }
        catch (error) {
            this.logger.warn({ error, userId }, '[EngagementDataSender] Failed to get predictions');
            return [];
        }
    }
    extractCategoryFromPrediction(p) {
        // Extract category from prediction keys
        const keys = Object.keys(p.predictions);
        if (keys.includes('Mood average (1-10)'))
            return 'mood';
        if (keys.includes('Deep work hours'))
            return 'productivity';
        if (keys.includes('Exercise sessions'))
            return 'health';
        if (keys.includes('Social time (hours)'))
            return 'social';
        return 'overall';
    }
    formatPredictionQuestion(p) {
        const keys = Object.keys(p.predictions);
        if (keys.length === 1) {
            return `Week of ${p.weekOf}: ${keys[0]}`;
        }
        return `Week of ${p.weekOf}: Weekly behavior prediction`;
    }
    extractMainPrediction(p) {
        const values = Object.values(p.predictions);
        // Return first value as representative, or average
        if (values.length === 1)
            return values[0];
        return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    }
    async getRitualStreaks(userId) {
        const streaks = [];
        const today = new Date().toDateString();
        for (const [ritualId, ritual] of Object.entries(PERSONA_RITUALS)) {
            const streak = await this.store.getRitualStreak(userId, ritualId);
            if (streak) {
                const lastDate = streak.lastCompletedAt
                    ? new Date(streak.lastCompletedAt).toDateString()
                    : null;
                streaks.push({
                    ritualId,
                    ritualName: ritual.name,
                    personaId: ritual.personaId,
                    currentStreak: streak.currentStreak,
                    longestStreak: streak.longestStreak,
                    lastCompletedAt: streak.lastCompletedAt,
                    dueToday: lastDate !== today,
                });
            }
            else {
                // No streak yet - show as available
                streaks.push({
                    ritualId,
                    ritualName: ritual.name,
                    personaId: ritual.personaId,
                    currentStreak: 0,
                    longestStreak: 0,
                    lastCompletedAt: null,
                    dueToday: true,
                });
            }
        }
        return streaks;
    }
    calculateStats(profile, streaks) {
        // Calculate total ritual days
        let totalRitualDays = 0;
        let longestOverallStreak = 0;
        let currentActiveStreaks = 0;
        for (const streak of streaks) {
            totalRitualDays += streak.currentStreak;
            longestOverallStreak = Math.max(longestOverallStreak, streak.longestStreak);
            if (streak.currentStreak > 0) {
                currentActiveStreaks++;
            }
        }
        return {
            totalRitualDays,
            longestOverallStreak,
            currentActiveStreaks,
            predictionAccuracy: profile?.stats.predictionAccuracy,
            teamHuddlesAttended: profile?.stats.teamHuddlesAttended || 0,
        };
    }
    async sendDataMessage(message) {
        if (!this.room)
            return;
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify(message));
            await this.room.localParticipant?.publishData(data, { reliable: true });
        }
        catch (error) {
            this.logger.error({ error }, '[EngagementDataSender] Failed to publish data');
        }
    }
}
// ============================================================================
// SINGLETON EXPORT
// ============================================================================
let instance = null;
export function getEngagementDataSender() {
    if (!instance) {
        instance = new EngagementDataSender();
    }
    return instance;
}
export default EngagementDataSender;
//# sourceMappingURL=engagement-data-sender.js.map