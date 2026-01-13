/**
 * Voice Agent Integration - Message Processing
 *
 * @module @ferni/humanization/voice-agent-integration/message-processing
 */
import { type AmbientDetectionResult } from '../ambient-awareness.js';
import { type BreathPattern } from '../breathing-sync.js';
import { type VoiceSnapshot } from '../voice-print.js';
import { type HumanizedResponseResult } from '../index.js';
/**
 * Process a user message through humanization
 */
export declare function processUserMessage(sessionId: string, message: string, context?: {
    voiceEmotion?: {
        primary: string;
        confidence: number;
    };
    voiceSnapshot?: VoiceSnapshot;
    ambientDetection?: AmbientDetectionResult;
    breathPattern?: BreathPattern;
    topic?: string;
}): void;
/**
 * Humanize an agent response
 */
export declare function humanizeResponse(sessionId: string, response: string, context: {
    userMessage: string;
    userEmotion?: string;
    userEnergy?: 'high' | 'medium' | 'low';
    isEmotionalContent?: boolean;
}): HumanizedResponseResult;
//# sourceMappingURL=message-processing.d.ts.map