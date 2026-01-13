/**
 * Conversational Imperfections Context Builder
 *
 * "Actually wait, let me rephrase that..."
 *
 * Philosophy: Perfect speech feels robotic. Real conversations have:
 * - Mid-sentence course corrections
 * - Word-finding pauses
 * - Thought pivots
 * - Self-interruptions
 * - Trailing off
 * - Restatements for clarity
 *
 * This injects humanizing imperfections into Ferni's responses.
 *
 * @module intelligence/context-builders/conversational-imperfections
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { BuilderCategory, createHintInjection, registerContextBuilder, } from '../index.js';
const log = createLogger({ module: 'ConversationalImperfections' });
const IMPERFECTION_TYPES = [
    {
        name: 'mid_sentence_correction',
        description: 'Correcting yourself mid-thought',
        examples: [
            'So what you could do is— actually, no, let me think about this differently.',
            "I think the answer is— well, hang on, that's not quite right.",
            'You should probably— actually wait, let me back up a second.',
        ],
        triggers: ['advice', 'suggestion', 'recommendation', 'thinking'],
        frequency: 0.15,
    },
    {
        name: 'word_finding',
        description: "Searching for the right word (without using 'um' or 'uh')",
        examples: [
            "It's like... what's the word... a kind of restlessness.",
            "There's this... I want to say 'momentum'? That's not quite it, but close.",
            "You know that feeling when you're... how do I put this... standing at a threshold?",
        ],
        triggers: ['emotion', 'abstract', 'feeling', 'describe'],
        frequency: 0.12,
    },
    {
        name: 'thought_pivot',
        description: 'Starting one direction, realizing another is better',
        examples: [
            "I was going to say— you know what, there's something more important here.",
            'Let me start with— actually, can we talk about something first?',
            "The obvious thing is— but that's not what you need to hear, is it?",
        ],
        triggers: ['complex', 'sensitive', 'important', 'deeper'],
        frequency: 0.1,
    },
    {
        name: 'self_interruption',
        description: 'Interrupting yourself with a more pressing thought',
        examples: [
            'So the plan would be— wait, before that, how are you actually feeling about this?',
            'We should look at— hold on, I just realized something.',
            'The next step is— oh, but I should ask you first...',
        ],
        triggers: ['action', 'plan', 'next_step', 'moving_forward'],
        frequency: 0.1,
    },
    {
        name: 'trailing_realization',
        description: 'Trailing off as you realize something',
        examples: [
            "You've been doing this for a while now, haven't you... longer than you maybe realize.",
            "This isn't really about the deadline... is it?",
            "There's something underneath all this...",
        ],
        triggers: ['pattern', 'realization', 'deeper_meaning', 'insight'],
        frequency: 0.08,
    },
    {
        name: 'restatement',
        description: 'Restating something more precisely',
        examples: [
            'That came out wrong. What I mean is...',
            'Let me try that again, more clearly.',
            "That's not quite what I meant. Here's what I'm actually thinking...",
        ],
        triggers: ['complex_topic', 'nuanced', 'important_point'],
        frequency: 0.1,
    },
    {
        name: 'thinking_aloud',
        description: 'Processing in real-time with the user',
        examples: [
            'Let me think about this with you for a second...',
            "I'm trying to find the right angle here...",
            'There are a few ways to look at this... let me work through them...',
        ],
        triggers: ['problem', 'question', 'uncertainty', 'decision'],
        frequency: 0.12,
    },
    {
        name: 'gentle_hedge',
        description: 'Softening certainty to invite dialogue',
        examples: [
            'I could be wrong about this, but...',
            'This might not land right, but hear me out...',
            "I'm not sure if this is helpful, but...",
        ],
        triggers: ['advice', 'opinion', 'perspective', 'suggestion'],
        frequency: 0.15,
    },
];
const sessionState = new Map();
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
export const conversationalImperfectionsBuilder = {
    name: 'conversational-imperfections',
    description: 'Injects humanizing speech imperfections and natural hesitations',
    priority: 85, // Late in the pipeline, before final response
    category: BuilderCategory.HUMANIZING,
    build: async (input) => {
        const { persona, analysis, services, userData } = input;
        const injections = [];
        const sessionId = services?.sessionId || 'default';
        const turnCount = userData?.turnCount || 0;
        // Initialize session state
        if (!sessionState.has(sessionId)) {
            sessionState.set(sessionId, {
                lastUsed: new Map(),
                totalUsed: 0,
                turnCount: 0,
            });
        }
        const state = sessionState.get(sessionId);
        state.turnCount = turnCount;
        // Allow more imperfections for authentic human speech (5 per conversation)
        // Humans naturally have more speech variations - 3 was too robotic
        if (state.totalUsed >= 5) {
            return injections;
        }
        // Skip first turn - too early
        if (turnCount < 1) {
            return injections;
        }
        // Determine relevant imperfections based on context
        const topics = analysis?.topics?.detected || [];
        const emotion = analysis?.emotion?.primary || 'neutral';
        const isVulnerable = analysis?.emotion?.needsSupport;
        const isComplex = topics.length > 2;
        // Collect triggered imperfections
        const triggered = [];
        for (const imperfection of IMPERFECTION_TYPES) {
            // Check if any trigger matches
            const triggerMatches = imperfection.triggers.some((trigger) => {
                const topicsLower = topics.map((t) => t.toLowerCase());
                // Direct topic match
                if (topicsLower.some((t) => t.includes(trigger) || trigger.includes(t))) {
                    return true;
                }
                // Emotion-based triggers
                if (trigger === 'emotion' && emotion !== 'neutral')
                    return true;
                if (trigger === 'sensitive' && isVulnerable)
                    return true;
                if (trigger === 'complex' && isComplex)
                    return true;
                return false;
            });
            if (triggerMatches) {
                // Check cooldown (don't repeat same type within 3 turns)
                const lastUsedTurn = state.lastUsed.get(imperfection.name) || -10;
                if (turnCount - lastUsedTurn < 3) {
                    continue;
                }
                // Apply frequency check
                if (Math.random() < imperfection.frequency) {
                    triggered.push(imperfection);
                }
            }
        }
        // Pick one imperfection at most
        if (triggered.length === 0) {
            return injections;
        }
        // Random selection weighted toward earlier matches
        const selected = triggered[Math.floor(Math.random() * triggered.length)];
        const example = selected.examples[Math.floor(Math.random() * selected.examples.length)];
        // Update state
        state.lastUsed.set(selected.name, turnCount);
        state.totalUsed++;
        // Create injection
        const content = `[NATURAL SPEECH IMPERFECTION]

Real conversations aren't perfectly smooth. You can use this ONCE in your response:

TYPE: ${selected.name.replace(/_/g, ' ')}
EXAMPLE: "${example}"

HOW TO USE:
- Weave this naturally into your response
- Don't force it - skip if it doesn't fit
- It should feel spontaneous, not scripted
- The imperfection should serve the conversation

WHY: This makes you feel human. Perfect speech is uncanny.

CONSTRAINT: Only use this imperfection ONCE. Don't overdo it.`;
        injections.push(createHintInjection('natural_speech', content, {
            category: 'humanizing',
        }));
        log.debug({
            sessionId,
            turnCount,
            imperfection: selected.name,
            totalUsed: state.totalUsed,
        }, 'Injected conversational imperfection');
        return injections;
    },
};
// ============================================================================
// CLEANUP
// ============================================================================
/**
 * Clear session state (for testing)
 */
export function clearSessionImperfections(sessionId) {
    sessionState.delete(sessionId);
}
/**
 * Get imperfection stats for debugging
 */
export function getImperfectionStats(sessionId) {
    const state = sessionState.get(sessionId);
    if (!state)
        return null;
    return {
        totalUsed: state.totalUsed,
        types: Array.from(state.lastUsed.keys()),
    };
}
// ============================================================================
// REGISTER
// ============================================================================
registerContextBuilder(conversationalImperfectionsBuilder);
export default conversationalImperfectionsBuilder;
//# sourceMappingURL=conversational-imperfections.js.map