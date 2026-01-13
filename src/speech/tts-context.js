/**
 * TTS Context Service - Prosody Continuity Across Turns
 *
 * Maintains conversation context for TTS to ensure natural prosody
 * continuity between utterances. Without this, each TTS call is
 * independent and prosody can feel disconnected.
 *
 * Key insight from Sesame's research:
 * "Without additional context—including tone, rhythm, and history
 * of the conversation—models lack the information to choose the best option."
 *
 * Cartesia's WebSocket API supports "contexts" which maintain prosody
 * between inputs using the same context_id.
 *
 * @see https://docs.cartesia.ai/api-reference/tts/working-with-web-sockets/contexts
 * @see https://www.sesame.com/research/crossing_the_uncanny_valley_of_voice
 */
import { getLogger } from '../utils/safe-logger.js';
// ============================================================================
// TTS CONTEXT SERVICE
// ============================================================================
export class TtsContextService {
    contexts = new Map();
    /**
     * Create or get context for a session
     */
    getOrCreateContext(sessionId, personaId) {
        const key = `${sessionId}:${personaId}`;
        if (!this.contexts.has(key)) {
            const context = {
                contextId: this.generateContextId(),
                sessionId,
                personaId,
                recentTurns: [],
                emotionalArc: 'stable',
                conversationEnergy: 0.5,
                rapport: 0.3,
                wasInterrupted: false,
            };
            this.contexts.set(key, context);
            getLogger().debug({ sessionId, personaId, contextId: context.contextId }, '🎤 Created new TTS context for prosody continuity');
        }
        return this.contexts.get(key);
    }
    /**
     * Record an agent turn for prosody tracking
     */
    recordAgentTurn(sessionId, personaId, options) {
        const context = this.getOrCreateContext(sessionId, personaId);
        context.recentTurns.push({
            speaker: 'agent',
            timestamp: Date.now(),
            emotion: options.emotion,
            energy: options.energy,
            wasInterrupted: options.wasInterrupted,
            durationMs: options.durationMs,
        });
        // Keep only last 5 turns
        if (context.recentTurns.length > 5) {
            context.recentTurns.shift();
        }
        context.lastAgentUtteranceEnd = Date.now();
        context.wasInterrupted = options.wasInterrupted;
        // Update emotional arc
        this.updateEmotionalArc(context);
    }
    /**
     * Record a user turn for context
     */
    recordUserTurn(sessionId, personaId, emotion, durationMs) {
        const context = this.getOrCreateContext(sessionId, personaId);
        context.recentTurns.push({
            speaker: 'user',
            timestamp: Date.now(),
            emotion: emotion.primary || 'neutral',
            energy: emotion.intensity || 0.5,
            wasInterrupted: false,
            durationMs,
        });
        // Keep only last 5 turns
        if (context.recentTurns.length > 5) {
            context.recentTurns.shift();
        }
        // Update rapport based on conversation length and emotional engagement
        const turnCount = context.recentTurns.length;
        context.rapport = Math.min(1, 0.3 + turnCount * 0.1);
        // Update energy based on user
        context.conversationEnergy = emotion.intensity || 0.5;
        this.updateEmotionalArc(context);
    }
    /**
     * Get prosody guidance for next agent utterance
     */
    getProsodyGuidance(sessionId, personaId) {
        const context = this.getOrCreateContext(sessionId, personaId);
        const guidance = {
            openingPause: false,
            openingPauseDuration: 0,
            warmth: 'medium',
            pace: 'match',
            emphasisWords: [],
            ssmlPrefix: '',
            targetEnergy: context.conversationEnergy,
        };
        // ===== OPENING PAUSE =====
        // Add pause after emotional moment or interruption
        const lastTurn = context.recentTurns[context.recentTurns.length - 1];
        if (context.wasInterrupted) {
            // After interruption - brief pause to reset
            guidance.openingPause = true;
            guidance.openingPauseDuration = 150;
            guidance.ssmlPrefix = '<break time="150ms"/>';
        }
        else if (lastTurn?.speaker === 'user' && lastTurn.energy > 0.7) {
            // After high-energy user turn - pause to acknowledge
            guidance.openingPause = true;
            guidance.openingPauseDuration = 200;
            guidance.ssmlPrefix = '<break time="200ms"/>';
        }
        // ===== WARMTH =====
        // Increase warmth as rapport builds
        if (context.rapport > 0.7) {
            guidance.warmth = 'high';
        }
        else if (context.rapport < 0.4) {
            guidance.warmth = 'medium';
        }
        // ===== PACE =====
        // Match conversation energy
        if (context.emotionalArc === 'de-escalating') {
            guidance.pace = 'slower';
        }
        else if (context.conversationEnergy > 0.7) {
            guidance.pace = 'match'; // Match high energy
        }
        // ===== TARGET ENERGY =====
        // Emotional arc affects target
        switch (context.emotionalArc) {
            case 'escalating':
                guidance.targetEnergy = Math.min(1, context.conversationEnergy + 0.1);
                break;
            case 'de-escalating':
                guidance.targetEnergy = Math.max(0.3, context.conversationEnergy - 0.1);
                break;
            default:
                guidance.targetEnergy = context.conversationEnergy;
        }
        getLogger().debug({
            sessionId,
            personaId,
            arc: context.emotionalArc,
            energy: context.conversationEnergy,
            rapport: context.rapport,
            guidance: {
                openingPause: guidance.openingPause,
                warmth: guidance.warmth,
                pace: guidance.pace,
            },
        }, '🎤 Generated prosody guidance');
        return guidance;
    }
    /**
     * Get the context ID for Cartesia API
     */
    getContextId(sessionId, personaId) {
        return this.getOrCreateContext(sessionId, personaId).contextId;
    }
    /**
     * Apply prosody guidance to text via SSML
     */
    applyProsodyGuidance(text, guidance) {
        let result = text;
        // Add opening pause if needed
        if (guidance.ssmlPrefix) {
            result = guidance.ssmlPrefix + result;
        }
        // Add warmth wrapper
        if (guidance.warmth === 'high') {
            result = `<emotion value="affectionate">${result}</emotion>`;
        }
        // Adjust pace
        if (guidance.pace === 'slower') {
            result = `<speed ratio="0.92">${result}</speed>`;
        }
        else if (guidance.pace === 'faster') {
            result = `<speed ratio="1.05">${result}</speed>`;
        }
        return result;
    }
    /**
     * Update emotional arc based on recent turns
     */
    updateEmotionalArc(context) {
        const turns = context.recentTurns;
        if (turns.length < 2) {
            context.emotionalArc = 'stable';
            return;
        }
        // Compare energy of last 2-3 turns
        const recentEnergies = turns.slice(-3).map((t) => t.energy);
        const avgRecent = recentEnergies.reduce((a, b) => a + b, 0) / recentEnergies.length;
        const firstEnergy = recentEnergies[0];
        const lastEnergy = recentEnergies[recentEnergies.length - 1];
        if (lastEnergy - firstEnergy > 0.2) {
            context.emotionalArc = 'escalating';
        }
        else if (firstEnergy - lastEnergy > 0.2) {
            context.emotionalArc = 'de-escalating';
        }
        else {
            context.emotionalArc = 'stable';
        }
    }
    /**
     * Generate unique context ID
     */
    generateContextId() {
        return `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    /**
     * Clear context for a session (e.g., on disconnect)
     */
    clearSession(sessionId) {
        const keysToDelete = [];
        this.contexts.forEach((_value, key) => {
            if (key.startsWith(`${sessionId}:`)) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach((key) => this.contexts.delete(key));
        getLogger().debug({ sessionId }, 'Cleared TTS contexts for session');
    }
    /**
     * Reset all contexts
     */
    reset() {
        this.contexts.clear();
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let ttsContextInstance = null;
export function getTtsContextService() {
    if (!ttsContextInstance) {
        ttsContextInstance = new TtsContextService();
    }
    return ttsContextInstance;
}
export function resetTtsContextService() {
    ttsContextInstance?.reset();
    ttsContextInstance = null;
}
//# sourceMappingURL=tts-context.js.map