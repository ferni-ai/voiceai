/**
 * Pacing & Volume Detection Constants
 * Keywords for detecting speech speed and volume cues
 *
 * @module ssml/constants/pacing
 */
/**
 * Keywords indicating slower speech is appropriate
 * Used for emotional weight, reflection, important points
 */
export const SLOW_PACE_KEYWORDS = [
    // Emotional weight
    'important',
    'crucial',
    'essential',
    'vital',
    'critical',
    'significant',
    'meaningful',
    'profound',
    'deep',
    'serious',
    // Reflection/contemplation
    'consider',
    'reflect',
    'think about',
    'ponder',
    'contemplate',
    'imagine',
    'picture',
    'visualize',
    'notice',
    'observe',
    // Emphasis markers
    'remember',
    'never forget',
    'always',
    'truly',
    'really',
    'genuinely',
    'honestly',
    'sincerely',
    'fundamentally',
    // Emotional states
    'sad',
    'sorry',
    'difficult',
    'hard',
    'challenging',
    'painful',
    'grief',
    'loss',
    'mourning',
    'heartache',
    // Calming content
    'breathe',
    'relax',
    'calm',
    'peaceful',
    'gentle',
    'slowly',
    'softly',
    'quietly',
    'tenderly',
    'carefully',
    // Gravity/weight
    'grave',
    'solemn',
    'heavy',
    'weighty',
    'momentous',
    'consequential',
    'pivotal',
    'life-changing',
];
/**
 * Keywords indicating faster speech is appropriate
 * Used for excitement, urgency, energy
 */
export const FAST_PACE_KEYWORDS = [
    // Excitement
    'excited',
    'exciting',
    'thrilling',
    'amazing',
    'awesome',
    'fantastic',
    'incredible',
    'wonderful',
    'great news',
    // Urgency
    'quick',
    'quickly',
    'fast',
    'hurry',
    'urgent',
    'immediately',
    'right away',
    'asap',
    'now',
    // Energy
    'energetic',
    'dynamic',
    'lively',
    'vibrant',
    'enthusiastic',
    'eager',
    'passionate',
    'pumped',
    'fired up',
    'ready to go',
    // Action
    "let's go",
    'come on',
    'get started',
    'dive in',
    'jump in',
    'get moving',
    'take action',
];
/**
 * Keywords indicating louder/emphasized speech
 * Used for SSML volume tags
 */
export const EMPHASIS_KEYWORDS = [
    // Importance markers
    'important',
    'crucial',
    'essential',
    'vital',
    'key',
    'critical',
    'fundamental',
    'necessary',
    'imperative',
    // Emphasis words
    'definitely',
    'absolutely',
    'certainly',
    'undoubtedly',
    'without doubt',
    'for sure',
    'no question',
    'unquestionably',
    // Intensity
    'very',
    'really',
    'truly',
    'extremely',
    'incredibly',
    'exceptionally',
    'remarkably',
    'extraordinarily',
    // Exclamation triggers
    'amazing',
    'wonderful',
    'fantastic',
    'excellent',
    'brilliant',
    'outstanding',
    'magnificent',
    'spectacular',
    // Call to attention
    'listen',
    'hear this',
    'pay attention',
    'note this',
    'remember',
    "don't forget",
    'keep in mind',
];
/**
 * Keywords indicating softer/quieter speech
 * Used for intimate, gentle, or sensitive content
 */
export const WHISPER_KEYWORDS = [
    // Intimacy
    'secret',
    'between us',
    'just between',
    'confidential',
    'private',
    'personal',
    'intimate',
    'close',
    // Gentle delivery
    'whisper',
    'softly',
    'quietly',
    'gently',
    'tenderly',
    'delicately',
    'subtly',
    'carefully',
    // Sensitive topics
    'sensitive',
    'difficult',
    'hard to say',
    'vulnerable',
    'fragile',
    'tender',
    'raw',
    'emotional',
    // Calming
    'soothing',
    'calming',
    'peaceful',
    'restful',
    'tranquil',
    'serene',
    'hushed',
    'muted',
    // Reverence
    'sacred',
    'holy',
    'precious',
    'treasured',
    'cherished',
    'beloved',
    'dear',
];
/**
 * Default speed ratio (1.0 = normal)
 */
export const DEFAULT_SPEED = 1.0;
/**
 * Speed ratio adjustments
 */
export const SPEED_ADJUSTMENTS = {
    /** Slow speech ratio */
    slow: 0.85,
    /** Normal speech ratio */
    normal: 1.0,
    /** Fast speech ratio */
    fast: 1.15,
    /** Very slow for emphasis */
    verySlow: 0.75,
    /** Very fast for excitement */
    veryFast: 1.25,
};
/**
 * Default volume ratio (1.0 = normal)
 */
export const DEFAULT_VOLUME = 1.0;
/**
 * Volume ratio adjustments
 */
export const VOLUME_ADJUSTMENTS = {
    /** Whisper volume */
    whisper: 0.6,
    /** Soft volume */
    soft: 0.8,
    /** Normal volume */
    normal: 1.0,
    /** Loud volume */
    loud: 1.2,
    /** Emphasis volume */
    emphasis: 1.3,
};
//# sourceMappingURL=pacing.js.map