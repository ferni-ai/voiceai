/**
 * Standard transition phrases for personal moments
 *
 * Separated into its own file to avoid circular imports between
 * personal-moment-store.ts and the individual moments files.
 *
 * @module personality/transitions
 */
/**
 * Standard transition phrases by depth
 */
export const STANDARD_TRANSITIONS = {
    surface: [
        'You know what that reminds me of?',
        'That makes me think of...',
        'Speaking of which...',
    ],
    medium: [
        'Can I share something?',
        "Here's something I don't talk about often...",
        'That brings up something...',
    ],
    deep: [
        "I'm going to share something personal...",
        'Can I be honest about something?',
        "I don't usually say this, but...",
    ],
    sacred: [
        '<break time="300ms"/>',
        'I want to share something with you...',
        'This is hard to talk about, but...',
    ],
};
//# sourceMappingURL=transitions.js.map