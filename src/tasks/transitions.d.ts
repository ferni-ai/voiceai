/**
 * Natural Transitions - Human-like conversation bridges
 *
 * Tasks should NOT announce themselves like:
 * ❌ "Now starting the Goal Setting task..."
 * ❌ "Task complete. Moving to next phase."
 *
 * They should flow naturally like:
 * ✅ "You know, that reminds me..."
 * ✅ "Speaking of which..."
 * ✅ "Before we go on, let me ask..."
 */
/**
 * Transitions INTO a topic (starting)
 */
export declare const TOPIC_ENTRY_TRANSITIONS: {
    gentle: string[];
    curious: string[];
    important: string[];
    returning: string[];
    story: string[];
};
/**
 * Transitions OUT of a topic (closing)
 */
export declare const TOPIC_EXIT_TRANSITIONS: {
    wrapUp: string[];
    checkIn: string[];
    moveOn: string[];
    openEnded: string[];
};
/**
 * Transitions BETWEEN emotions/moods
 */
export declare const EMOTIONAL_TRANSITIONS: {
    lightToSerious: string[];
    seriousToLight: string[];
    supportToPractical: string[];
    practicalToSupport: string[];
};
/**
 * Transitions for specific task types
 */
export declare const TASK_TRANSITIONS: {
    toGoals: string[];
    toWisdom: string[];
    toFear: string[];
    toCelebration: string[];
    toGoodbye: string[];
};
/**
 * Get a random transition phrase from a category
 */
export type TransitionKey = keyof typeof TOPIC_ENTRY_TRANSITIONS | keyof typeof TOPIC_EXIT_TRANSITIONS | keyof typeof EMOTIONAL_TRANSITIONS | keyof typeof TASK_TRANSITIONS;
/**
 * Check if a string is a valid transition key
 */
export declare function isValidTransitionKey(key: string): key is TransitionKey;
export declare function getTransition(category: TransitionKey): string;
/**
 * Get a contextual transition based on current conversation state
 */
export declare function getContextualTransition(context: {
    fromMood?: 'light' | 'serious' | 'support' | 'practical';
    toMood?: 'light' | 'serious' | 'support' | 'practical';
    toTask?: 'goals' | 'wisdom' | 'fear' | 'celebration' | 'goodbye';
    isReturning?: boolean;
    topicMentioned?: string;
}): string;
/**
 * Wrap a message with appropriate transitions
 */
export declare function wrapWithTransitions(message: string, options?: {
    entry?: keyof typeof TOPIC_ENTRY_TRANSITIONS;
    exit?: keyof typeof TOPIC_EXIT_TRANSITIONS;
}): string;
declare const _default: {
    TOPIC_ENTRY_TRANSITIONS: {
        gentle: string[];
        curious: string[];
        important: string[];
        returning: string[];
        story: string[];
    };
    TOPIC_EXIT_TRANSITIONS: {
        wrapUp: string[];
        checkIn: string[];
        moveOn: string[];
        openEnded: string[];
    };
    EMOTIONAL_TRANSITIONS: {
        lightToSerious: string[];
        seriousToLight: string[];
        supportToPractical: string[];
        practicalToSupport: string[];
    };
    TASK_TRANSITIONS: {
        toGoals: string[];
        toWisdom: string[];
        toFear: string[];
        toCelebration: string[];
        toGoodbye: string[];
    };
    getTransition: typeof getTransition;
    getContextualTransition: typeof getContextualTransition;
    wrapWithTransitions: typeof wrapWithTransitions;
};
export default _default;
//# sourceMappingURL=transitions.d.ts.map