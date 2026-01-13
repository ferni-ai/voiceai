/**
 * Emotion Types - Shared across memory and intelligence layers
 *
 * This file consolidates emotion-related type definitions to prevent
 * architecture violations (memory → intelligence imports).
 *
 * @module types/emotion-types
 */
// ============================================================================
// TYPE GUARDS
// ============================================================================
/**
 * Check if a value is a valid PrimaryEmotion
 */
export function isPrimaryEmotion(value) {
    const validEmotions = [
        'joy',
        'sadness',
        'anger',
        'fear',
        'surprise',
        'disgust',
        'trust',
        'anticipation',
        'anxiety',
        'regret',
        'neutral',
    ];
    return typeof value === 'string' && validEmotions.includes(value);
}
/**
 * Check if a value is a valid EmotionResult
 */
export function isEmotionResult(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const obj = value;
    return (isPrimaryEmotion(obj.primary) &&
        typeof obj.intensity === 'number' &&
        typeof obj.valence === 'string' &&
        typeof obj.confidence === 'number');
}
//# sourceMappingURL=emotion-types.js.map