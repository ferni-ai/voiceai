/**
 * Engagement Data Sender
 *
 * Sends engagement data to the frontend via LiveKit data messages.
 * This allows the frontend to update the engagement UI in real-time.
 */
import { type StoredWeatherEntry } from './engagement/engagement-store.js';
export interface LiveKitRoomLike {
    localParticipant?: {
        publishData: (data: Uint8Array, options?: {
            reliable?: boolean;
        }) => Promise<void>;
    };
}
export interface EngagementDataMessage {
    type: 'engagement';
    ritualStreaks: Array<{
        ritualId: string;
        ritualName: string;
        personaId: string;
        currentStreak: number;
        longestStreak: number;
        lastCompletedAt: string | null;
        dueToday: boolean;
    }>;
    weatherHistory: Array<{
        primary: string;
        energy: string;
        note?: string;
        recordedAt: string;
    }>;
    predictions: Array<{
        id: string;
        category: string;
        question: string;
        userPrediction: number;
        actualOutcome?: number;
        status: 'pending' | 'resolved';
        createdAt: string;
    }>;
    stats: {
        totalRitualDays: number;
        longestOverallStreak: number;
        currentActiveStreaks: number;
        predictionAccuracy?: number;
        teamHuddlesAttended: number;
    };
    timestamp: number;
}
export interface EngagementTriggerMessage {
    type: 'engagement_trigger';
    triggerType: string;
    personaId: string;
    message: string;
    priority: string;
    data?: Record<string, unknown>;
    timestamp: number;
}
declare class EngagementDataSender {
    private room;
    private store;
    private logger;
    constructor();
    /**
     * Set the LiveKit room for sending messages
     */
    setRoom(room: LiveKitRoomLike): void;
    /**
     * Clear the room reference
     */
    clearRoom(): void;
    /**
     * Send engagement data to frontend
     */
    sendEngagementData(userId: string): Promise<void>;
    /**
     * Send an engagement trigger to frontend
     */
    sendTrigger(trigger: {
        type: string;
        personaId: string;
        message: string;
        priority: string;
        data?: Record<string, unknown>;
    }): Promise<void>;
    /**
     * Send ritual completion notification
     */
    sendRitualComplete(userId: string, ritualId: string, newStreak: number): Promise<void>;
    /**
     * Send weather recorded notification
     */
    sendWeatherRecorded(userId: string, _weather: StoredWeatherEntry): Promise<void>;
    /**
     * Send prediction created/updated notification
     */
    sendPredictionUpdate(userId: string): Promise<void>;
    /**
     * Send prediction resolved notification with trigger
     */
    sendPredictionResolved(userId: string, predictionId: string, accuracy: number): Promise<void>;
    private getPredictions;
    private extractCategoryFromPrediction;
    private formatPredictionQuestion;
    private extractMainPrediction;
    private getRitualStreaks;
    private calculateStats;
    private sendDataMessage;
}
export declare function getEngagementDataSender(): EngagementDataSender;
export default EngagementDataSender;
//# sourceMappingURL=engagement-data-sender.d.ts.map