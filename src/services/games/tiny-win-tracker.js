/**
 * 🏆 Tiny Win Tracker Implementation
 *
 * A positivity practice where users identify and celebrate small victories.
 * Based on research showing that noticing small wins builds momentum
 * and improves overall wellbeing.
 *
 * Perfect for: building positivity, habit reinforcement, self-compassion
 */
// ============================================================================
// CONSTANTS
// ============================================================================
const OPENING_PROMPTS = [
    "What's one tiny win from today? It can be as small as getting out of bed.",
    'Tell me something that went well today—even if it seems small.',
    "What's a small victory you can celebrate today?",
    "Name one thing you did today that you're proud of. No win is too small.",
    "What's one thing that went right today?",
];
const CELEBRATION_RESPONSES = [
    'That counts! 🎉 Celebrating the small stuff matters.',
    "Yes! That's absolutely a win worth noting.",
    'I love that. Small wins add up to big momentum.',
    "That's real progress. Don't underestimate it.",
    "Perfect example of a tiny win. You noticed it—that's huge.",
    'That matters more than you might think. Well done.',
];
const FOLLOW_UP_PROMPTS = [
    'Got another one? What else went well?',
    "That's great. Any other wins to add?",
    'Nice. Is there another tiny win hiding in your day?',
    'Love it. What else can we celebrate?',
];
const CLOSING_MESSAGES = [
    'You collected {count} tiny win(s) today. Keep noticing these—they build momentum.',
    '{count} win(s) acknowledged. The practice of noticing wins changes how you see your days.',
    "That's {count} tiny win(s). Research shows celebrating small wins builds resilience.",
    "{count} win(s) in the bank. Come back tomorrow and we'll find more.",
];
const WIN_CATEGORIES = {
    'self-care': [
        'shower',
        'ate',
        'slept',
        'rest',
        'exercise',
        'walk',
        'water',
        'break',
        'bed',
        'coffee',
        'tea',
        'meal',
        'cook',
        'sleep',
        'nap',
    ],
    productivity: [
        'finish',
        'complete',
        'done',
        'submit',
        'send',
        'email',
        'call',
        'meeting',
        'work',
        'task',
        'project',
        'deadline',
        'organize',
        'clean',
    ],
    connection: [
        'friend',
        'family',
        'talk',
        'chat',
        'text',
        'call',
        'visit',
        'help',
        'listen',
        'support',
        'hug',
        'conversation',
        'connect',
    ],
    growth: [
        'learn',
        'try',
        'new',
        'first',
        'practice',
        'read',
        'study',
        'improve',
        'challenge',
        'step',
        'courage',
        'brave',
    ],
};
// ============================================================================
// GAME CREATION
// ============================================================================
export function createInitialState() {
    return {
        phase: 'prompt',
        wins: [],
        sessionWinCount: 0,
        concluded: false,
    };
}
// ============================================================================
// WIN ANALYSIS
// ============================================================================
function categorizeWin(text) {
    const lower = text.toLowerCase();
    for (const [category, keywords] of Object.entries(WIN_CATEGORIES)) {
        if (keywords.some((k) => lower.includes(k))) {
            return category;
        }
    }
    return 'other';
}
function getCelebration() {
    return CELEBRATION_RESPONSES[Math.floor(Math.random() * CELEBRATION_RESPONSES.length)];
}
function getFollowUp() {
    return FOLLOW_UP_PROMPTS[Math.floor(Math.random() * FOLLOW_UP_PROMPTS.length)];
}
function getClosing(count) {
    const template = CLOSING_MESSAGES[Math.floor(Math.random() * CLOSING_MESSAGES.length)];
    return template.replace('{count}', count.toString());
}
function isValidWin(input) {
    const trimmed = input.trim();
    return trimmed.length >= 3 && trimmed.length <= 500;
}
function parseYesNo(input) {
    const lower = input.toLowerCase().trim();
    if (['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'another', 'more'].includes(lower)) {
        return true;
    }
    if (['no', 'n', 'nope', 'done', "that's it", "i'm done", "that's all", 'enough'].includes(lower)) {
        return false;
    }
    return null;
}
// ============================================================================
// MAIN GAME LOGIC
// ============================================================================
export function processInput(state, input) {
    const lower = input.toLowerCase().trim();
    // Check for quit commands
    if (lower === 'stop' || lower === 'quit' || lower === 'exit') {
        const closing = state.wins.length > 0
            ? getClosing(state.wins.length)
            : 'No worries! Tiny wins are waiting to be noticed. Come back anytime.';
        return {
            message: closing,
            gameOver: true,
            winner: null,
            newState: { ...state, phase: 'complete', concluded: true },
        };
    }
    // PHASE: Prompt
    if (state.phase === 'prompt') {
        // Check if they gave us a win already
        if (isValidWin(input)) {
            const win = {
                text: input.trim(),
                category: categorizeWin(input),
                timestamp: new Date().toISOString(),
            };
            const celebration = getCelebration();
            const followUp = getFollowUp();
            return {
                message: `"${input.trim()}"\n\n${celebration}\n\n${followUp}`,
                gameOver: false,
                newState: {
                    ...state,
                    phase: 'another',
                    wins: [...state.wins, win],
                    sessionWinCount: state.sessionWinCount + 1,
                },
            };
        }
        // Show opening prompt
        const prompt = OPENING_PROMPTS[Math.floor(Math.random() * OPENING_PROMPTS.length)];
        return {
            message: `🏆 **Tiny Win Tracker**\n\n${prompt}`,
            gameOver: false,
            newState: { ...state, phase: 'collecting' },
        };
    }
    // PHASE: Collecting
    if (state.phase === 'collecting') {
        if (!isValidWin(input)) {
            return {
                message: "Tell me about a small win—even something like 'I made my bed' counts!",
                gameOver: false,
                newState: state,
            };
        }
        const win = {
            text: input.trim(),
            category: categorizeWin(input),
            timestamp: new Date().toISOString(),
        };
        const celebration = getCelebration();
        const followUp = getFollowUp();
        return {
            message: `"${input.trim()}"\n\n${celebration}\n\n${followUp}`,
            gameOver: false,
            newState: {
                ...state,
                phase: 'another',
                wins: [...state.wins, win],
                sessionWinCount: state.sessionWinCount + 1,
            },
        };
    }
    // PHASE: Another?
    if (state.phase === 'another') {
        const wantsAnother = parseYesNo(input);
        if (wantsAnother === true) {
            return {
                message: "What's another tiny win?",
                gameOver: false,
                newState: { ...state, phase: 'collecting' },
            };
        }
        if (wantsAnother === false) {
            const closing = getClosing(state.wins.length);
            const winsList = state.wins.map((w, i) => `${i + 1}. ${w.text}`).join('\n');
            return {
                message: `${closing}\n\nYour wins today:\n${winsList}`,
                gameOver: true,
                winner: null,
                newState: { ...state, phase: 'complete', concluded: true },
            };
        }
        // They gave another win!
        if (isValidWin(input)) {
            const win = {
                text: input.trim(),
                category: categorizeWin(input),
                timestamp: new Date().toISOString(),
            };
            const celebration = getCelebration();
            const followUp = getFollowUp();
            return {
                message: `"${input.trim()}"\n\n${celebration}\n\n${followUp}`,
                gameOver: false,
                newState: {
                    ...state,
                    wins: [...state.wins, win],
                    sessionWinCount: state.sessionWinCount + 1,
                },
            };
        }
        return {
            message: "Share another win, or say 'done' to wrap up.",
            gameOver: false,
            newState: state,
        };
    }
    // Default
    return {
        message: 'Tell me a tiny win from your day.',
        gameOver: false,
        newState: state,
    };
}
/**
 * Describe current state for voice
 */
export function describeStateForVoice(state) {
    if (state.phase === 'complete') {
        return `Tiny Win Tracker complete. ${state.wins.length} wins recorded.`;
    }
    return `Tiny Win Tracker. ${state.wins.length} wins so far.`;
}
/**
 * Get the game start result
 */
export function getStartResult(state) {
    const prompt = OPENING_PROMPTS[Math.floor(Math.random() * OPENING_PROMPTS.length)];
    return {
        message: `🏆 **Tiny Win Tracker**\n\n${prompt}`,
        gameOver: false,
        newState: { ...state, phase: 'collecting' },
    };
}
/**
 * Get all wins from the session (for saving)
 */
export function getSessionWins(state) {
    return state.wins;
}
//# sourceMappingURL=tiny-win-tracker.js.map