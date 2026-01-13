/**
 * Behavioral Signals Type System
 *
 * This module defines the structured signals that context builders emit.
 * Instead of injecting raw context strings that might leak, builders
 * output behavioral signals that describe HOW the model should behave.
 *
 * PHILOSOPHY:
 * - Old: "Here's a fact. Don't say it, but use it." (prone to leakage)
 * - New: "Here's how to behave. Just do it." (nothing to leak)
 *
 * @module intelligence/context-builders/behavioral/signals
 */
// ============================================================================
// FACTORY HELPERS
// ============================================================================
/**
 * Create a callback signal with safe defaults
 */
export function createCallback(type, hint, strength = 'natural') {
    return { type, hint, strength };
}
/**
 * Create minimal "just be present" signals
 */
export function createPresenceSignals() {
    return {
        tone: 'gentle',
        pace: 'slow',
        length: 'brief',
        style: 'listening',
        questionStyle: 'none',
        modes: { holdingSpace: true },
    };
}
/**
 * Create celebratory signals
 */
export function createCelebrationSignals() {
    return {
        tone: 'celebratory',
        energy: 'elevated',
        style: 'celebratory',
        modes: { celebrationMode: true },
    };
}
/**
 * Create crisis/grounding signals
 */
export function createCrisisSignals() {
    return {
        tone: 'grounding',
        pace: 'slow',
        length: 'brief',
        style: 'grounding',
        questionStyle: 'none',
        modes: { crisisMode: true, holdingSpace: true },
        priority: 100, // Highest priority
    };
}
//# sourceMappingURL=signals.js.map