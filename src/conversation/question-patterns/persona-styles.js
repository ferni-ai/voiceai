/**
 * Persona Question Styles
 *
 * Question preferences for each persona.
 * Different personas have different questioning styles.
 *
 * @module @ferni/conversation/question-patterns/persona-styles
 */
export const PERSONA_QUESTION_STYLES = {
    'nayan-patel': {
        preferredTypes: ['open_ended', 'rhetorical', 'leading'],
        avoidTypes: ['scaling'],
        customQuestions: [
            { text: "What's your time horizon here?", type: 'open_ended', context: 'investing' },
            { text: 'Are you trying to get rich quick, or build wealth slowly?', type: 'leading' },
            { text: 'Can you afford to lose this money?', type: 'clarifying', context: 'risk' },
            { text: 'What would you do if the market dropped 40% tomorrow?', type: 'hypothetical' },
        ],
    },
    ferni: {
        preferredTypes: ['reflective', 'open_ended', 'echo'],
        avoidTypes: ['leading', 'scaling'],
        customQuestions: [
            { text: "What's underneath that feeling?", type: 'reflective' },
            { text: 'Where do you feel that in your body?', type: 'reflective' },
            { text: 'What story are you telling yourself about this?', type: 'reflective' },
            { text: 'What would compassion say here?', type: 'hypothetical' },
        ],
    },
    'peter-john': {
        preferredTypes: ['clarifying', 'hypothetical', 'open_ended'],
        avoidTypes: ['echo'],
        customQuestions: [
            { text: 'Do you know what you own, and why you own it?', type: 'confirming' },
            { text: 'What does this company actually do?', type: 'clarifying' },
            { text: 'Have you visited the store? Talked to customers?', type: 'clarifying' },
            { text: "Is this a company you'd be happy to own for 10 years?", type: 'hypothetical' },
        ],
    },
    'maya-santos': {
        preferredTypes: ['open_ended', 'scaling', 'confirming'],
        avoidTypes: ['rhetorical'],
        customQuestions: [
            { text: "What's your 'why' behind this goal?", type: 'reflective' },
            { text: 'How does this align with your values?', type: 'reflective' },
            { text: "What's one small step you could take today?", type: 'open_ended' },
            { text: 'What would progress look like for you?', type: 'open_ended' },
        ],
    },
    'alex-chen': {
        preferredTypes: ['clarifying', 'confirming', 'follow_up'],
        avoidTypes: ['reflective'],
        customQuestions: [
            { text: "What's the deadline for this?", type: 'clarifying' },
            { text: 'Who else needs to be involved?', type: 'clarifying' },
            { text: "What's the priority here?", type: 'clarifying' },
            { text: 'Is there anything blocking you right now?', type: 'open_ended' },
        ],
    },
    'jordan-taylor': {
        preferredTypes: ['open_ended', 'hypothetical', 'echo'],
        avoidTypes: ['scaling'],
        customQuestions: [
            { text: "What's the vibe you're going for?", type: 'open_ended' },
            { text: 'What would make this unforgettable?', type: 'hypothetical' },
            { text: 'How do you want people to feel?', type: 'reflective' },
            { text: "What's the one thing we absolutely can't skip?", type: 'clarifying' },
        ],
    },
};
//# sourceMappingURL=persona-styles.js.map