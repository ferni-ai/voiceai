/**
 * Voice Callbacks for Simple Utilities
 *
 * Makes utilities voice-first, not text-first.
 * When a timer completes, Ferni actually SPEAKS to you.
 *
 * VOICE-FIRST PRINCIPLES:
 * 1. Audio feedback for actions (timer set, timer done)
 * 2. Natural speech patterns, not text dumps
 * 3. Interruptible and conversational
 * 4. Contextual follow-up questions
 */
export type VoiceCallbackType = 'timer_complete' | 'countdown_milestone' | 'proactive_suggestion' | 'pattern_insight';
export interface VoiceCallback {
    type: VoiceCallbackType;
    userId: string;
    message: string;
    followUpQuestion?: string;
    sound?: 'timer-ding' | 'gentle-chime' | 'celebration' | 'soft-ping';
    priority: 'high' | 'normal' | 'low';
    scheduledFor?: Date;
    context?: Record<string, unknown>;
}
/**
 * Register the voice callback handler (called by voice agent on startup)
 */
export declare function registerVoiceCallbackHandler(handler: (callback: VoiceCallback) => Promise<void>): void;
/**
 * Unregister the voice callback handler
 */
export declare function unregisterVoiceCallbackHandler(): void;
/**
 * Trigger a voice callback (speaks to user)
 */
export declare function triggerVoiceCallback(callback: VoiceCallback): Promise<void>;
/**
 * Timer completion callback
 */
export declare function onTimerComplete(userId: string, label: string, durationMinutes: number): Promise<void>;
/**
 * Countdown milestone callback (100 days, 1 week, tomorrow, TODAY!)
 */
export declare function onCountdownMilestone(userId: string, event: string, daysRemaining: number, targetDate: Date): Promise<void>;
/**
 * Proactive suggestion callback
 */
export declare function onProactiveSuggestion(userId: string, suggestion: string, context?: Record<string, unknown>): Promise<void>;
/**
 * Pattern insight callback (when we notice something interesting)
 */
export declare function onPatternInsight(userId: string, insight: string, context?: Record<string, unknown>): Promise<void>;
/**
 * Convert a text response to SSML for more natural speech
 */
export declare function toVoiceResponse(text: string, options?: {
    emphasis?: 'strong' | 'moderate' | 'reduced';
    rate?: 'slow' | 'medium' | 'fast';
    pitch?: 'low' | 'medium' | 'high';
    breakBefore?: boolean;
    breakAfter?: boolean;
}): string;
/**
 * Format a number for natural speech
 */
export declare function speakNumber(num: number, type?: 'currency' | 'ordinal' | 'cardinal'): string;
/**
 * Format time for natural speech
 */
export declare function speakTime(hours: number, minutes: number): string;
/**
 * Format duration for natural speech
 */
export declare function speakDuration(minutes: number, seconds?: number): string;
declare const _default: {
    registerVoiceCallbackHandler: typeof registerVoiceCallbackHandler;
    unregisterVoiceCallbackHandler: typeof unregisterVoiceCallbackHandler;
    triggerVoiceCallback: typeof triggerVoiceCallback;
    onTimerComplete: typeof onTimerComplete;
    onCountdownMilestone: typeof onCountdownMilestone;
    onProactiveSuggestion: typeof onProactiveSuggestion;
    onPatternInsight: typeof onPatternInsight;
    toVoiceResponse: typeof toVoiceResponse;
    speakNumber: typeof speakNumber;
    speakTime: typeof speakTime;
    speakDuration: typeof speakDuration;
};
export default _default;
//# sourceMappingURL=voice-callbacks.d.ts.map