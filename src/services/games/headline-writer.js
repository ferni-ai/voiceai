/**
 * 📰 Headline Writer Implementation
 *
 * A creative reflection game where users write newspaper headlines
 * about their own life - past, present, or future. The framing
 * helps create distance and perspective on life events.
 *
 * Based on narrative therapy techniques for reframing experiences.
 *
 * Perfect for: perspective-taking, life review, goal visualization
 */
// ============================================================================
// CONSTANTS
// ============================================================================
const TIMEFRAME_PROMPTS = {
    today: 'If today made the front page, what would the headline be?',
    this_week: "What's the headline for your week so far?",
    this_month: "This month in one headline—what's the story?",
    this_year: 'If this year had a headline, what would it say?',
    past: 'Think of a pivotal moment from your past. What headline would it have gotten?',
    future: "Fast forward 5 years. Your life is exactly how you want it. What's the headline?",
    dream: 'Your wildest dream comes true. What does the world read about you tomorrow?',
};
const TONE_SUGGESTIONS = {
    triumphant: 'Write it like a victory announcement',
    honest: 'Be real—the unfiltered truth',
    humorous: 'Make yourself laugh',
    hopeful: 'Write it with optimism',
    any: 'Any tone that feels right',
};
const FOLLOW_UP_PROMPTS = [
    "What's the subheadline? (The smaller text that gives more detail)",
    "Now give me the subheadline—what's the rest of the story?",
    'And the subheadline? What would readers learn next?',
];
const REFLECTION_QUESTIONS = {
    today: [
        'What made today headline-worthy?',
        'How would you feel reading this headline?',
        "What's the 'why' behind this headline?",
    ],
    this_week: [
        "What's been driving this week's story?",
        'Is this the headline you wanted to write?',
        'What would need to change for a different headline next week?',
    ],
    this_month: [
        "What's the theme emerging in your life right now?",
        'Looking at this headline, what matters most to you?',
        'What would your past self think of this headline?',
    ],
    this_year: [
        'This is quite a headline. What got you here?',
        'How does it feel to see your year summed up like this?',
        "What's the one thing this headline captures?",
    ],
    past: [
        'How did that moment change you?',
        "What would you tell the 'you' in that headline?",
        'How does writing it as a headline shift how you see it?',
    ],
    future: [
        'What excites you most about this headline becoming real?',
        "What's one thing you could do today to move toward this?",
        'Does this headline feel achievable? Why or why not?',
    ],
    dream: [
        'What does this headline reveal about what you really want?',
        'If this headline came true, who would you call first?',
        "What's stopping this from being your actual future headline?",
    ],
};
const HEADLINE_FEEDBACK = [
    "That's a powerful headline.",
    'I can see that story.',
    "Now that's a front page moment.",
    'Headlines reveal what matters most.',
    "There's a whole story behind those words.",
];
const PLAYFUL_RESPONSES = [
    'Breaking news indeed!',
    "I'd read that article.",
    'Extra, extra!',
    "Now that's news.",
];
// ============================================================================
// GAME CREATION
// ============================================================================
function getRandomTimeframe() {
    const timeframes = ['today', 'this_week', 'this_year', 'future'];
    return timeframes[Math.floor(Math.random() * timeframes.length)];
}
function getRandomTone() {
    const tones = ['triumphant', 'honest', 'humorous', 'hopeful'];
    return tones[Math.floor(Math.random() * tones.length)];
}
export function createInitialState(timeframe, tone) {
    return {
        phase: 'prompt',
        currentTimeframe: timeframe || getRandomTimeframe(),
        suggestedTone: tone || 'any',
        headlines: [],
        round: 1,
    };
}
// ============================================================================
// INPUT PARSING
// ============================================================================
function isValidHeadline(input) {
    const trimmed = input.trim();
    // Headlines should be at least a few words but not too long
    return trimmed.length >= 5 && trimmed.length <= 200;
}
function parseYesNo(input) {
    const lower = input.toLowerCase().trim();
    if (['yes', 'y', 'sure', 'ok', 'yeah', 'yep', 'another', 'more', "let's go"].includes(lower)) {
        return true;
    }
    if (['no', 'n', 'nope', 'done', 'stop', "i'm good", 'enough'].includes(lower)) {
        return false;
    }
    return null;
}
function parseTimeframeChoice(input) {
    const lower = input.toLowerCase().trim();
    if (lower.includes('today') || lower === '1')
        return 'today';
    if (lower.includes('week') || lower === '2')
        return 'this_week';
    if (lower.includes('month') || lower === '3')
        return 'this_month';
    if (lower.includes('year') || lower === '4')
        return 'this_year';
    if (lower.includes('past') || lower.includes('memory') || lower === '5')
        return 'past';
    if (lower.includes('future') || lower.includes('5 year') || lower === '6')
        return 'future';
    if (lower.includes('dream') || lower.includes('wild') || lower === '7')
        return 'dream';
    return null;
}
// ============================================================================
// MESSAGE GENERATION
// ============================================================================
function getPromptMessage(state) {
    const prompt = TIMEFRAME_PROMPTS[state.currentTimeframe];
    const toneHint = state.suggestedTone !== 'any'
        ? `\n\n(Suggestion: ${TONE_SUGGESTIONS[state.suggestedTone]})`
        : '';
    if (state.round === 1) {
        return `📰 **Headline Writer**\n\n${prompt}${toneHint}`;
    }
    return `Round ${state.round}: ${prompt}${toneHint}`;
}
function getHeadlineFeedback() {
    return HEADLINE_FEEDBACK[Math.floor(Math.random() * HEADLINE_FEEDBACK.length)];
}
function getPlayfulResponse() {
    return PLAYFUL_RESPONSES[Math.floor(Math.random() * PLAYFUL_RESPONSES.length)];
}
function getReflectionQuestion(timeframe) {
    const questions = REFLECTION_QUESTIONS[timeframe];
    return questions[Math.floor(Math.random() * questions.length)];
}
function getTimeframeMenu() {
    return `What would you like to write about?
1. Today
2. This week
3. This month
4. This year
5. A past moment
6. 5 years from now
7. Your wildest dream

Pick a number or just describe it.`;
}
function getSummary(headlines) {
    if (headlines.length === 0)
        return '';
    const summary = headlines
        .map((h, i) => {
        const sub = h.subheadline ? `\n   ${h.subheadline}` : '';
        return `${i + 1}. "${h.text}"${sub}`;
    })
        .join('\n\n');
    return `Your headlines from today:\n\n${summary}\n\nThese headlines tell a story. Keep them somewhere you can look back on them.`;
}
// ============================================================================
// MAIN GAME LOGIC
// ============================================================================
export function processInput(state, input) {
    const lower = input.toLowerCase().trim();
    // Check for quit commands
    if (lower === 'stop' || lower === 'quit' || lower === 'exit' || lower === 'done') {
        const summary = getSummary(state.headlines);
        return {
            message: state.headlines.length > 0
                ? `Thanks for writing with me!\n\n${summary}`
                : "No worries! Headlines will be here when you're ready.",
            gameOver: true,
            winner: null,
            newState: { ...state, phase: 'complete' },
        };
    }
    // PHASE: Initial prompt
    if (state.phase === 'prompt') {
        // Check if they want to pick a different timeframe
        const timeframeChoice = parseTimeframeChoice(input);
        if (timeframeChoice) {
            const newState = {
                ...state,
                currentTimeframe: timeframeChoice,
                phase: 'writing',
            };
            return {
                message: TIMEFRAME_PROMPTS[timeframeChoice],
                gameOver: false,
                newState,
            };
        }
        // If they gave us a headline directly, accept it
        if (isValidHeadline(input)) {
            const currentHeadline = {
                text: input.trim(),
                timeframe: state.currentTimeframe,
            };
            const newState = {
                ...state,
                phase: 'subheadline',
                currentHeadline,
            };
            const feedback = getPlayfulResponse();
            const followUp = FOLLOW_UP_PROMPTS[Math.floor(Math.random() * FOLLOW_UP_PROMPTS.length)];
            return {
                message: `"${input.trim()}"\n\n${feedback} ${followUp}`,
                gameOver: false,
                newState,
            };
        }
        // Otherwise show the prompt
        return {
            message: getPromptMessage(state),
            gameOver: false,
            newState: { ...state, phase: 'writing' },
        };
    }
    // PHASE: Writing headline
    if (state.phase === 'writing') {
        if (!isValidHeadline(input)) {
            return {
                message: "Give me a headline—short and punchy, like you'd see in a newspaper.",
                gameOver: false,
                newState: state,
            };
        }
        const currentHeadline = {
            text: input.trim(),
            timeframe: state.currentTimeframe,
        };
        const newState = {
            ...state,
            phase: 'subheadline',
            currentHeadline,
        };
        const feedback = getHeadlineFeedback();
        const followUp = FOLLOW_UP_PROMPTS[Math.floor(Math.random() * FOLLOW_UP_PROMPTS.length)];
        return {
            message: `"${input.trim()}"\n\n${feedback} ${followUp}`,
            gameOver: false,
            newState,
        };
    }
    // PHASE: Subheadline
    if (state.phase === 'subheadline' && state.currentHeadline) {
        const skipSubheadline = lower === 'skip' || lower === 'pass' || lower === 'no' || lower === 'none';
        const completedHeadline = {
            text: state.currentHeadline.text,
            timeframe: state.currentTimeframe,
            subheadline: skipSubheadline ? undefined : input.trim(),
        };
        const newHeadlines = [...state.headlines, completedHeadline];
        const reflectionQ = getReflectionQuestion(state.currentTimeframe);
        const newState = {
            ...state,
            phase: 'reflection',
            headlines: newHeadlines,
            currentHeadline: undefined,
        };
        const display = completedHeadline.subheadline
            ? `📰 "${completedHeadline.text}"\n${completedHeadline.subheadline}`
            : `📰 "${completedHeadline.text}"`;
        return {
            message: `${display}\n\n${reflectionQ}`,
            gameOver: false,
            newState,
        };
    }
    // PHASE: Reflection
    if (state.phase === 'reflection') {
        const newState = {
            ...state,
            phase: 'another',
        };
        return {
            message: 'Thank you for sharing that.\n\nWant to write another headline? (yes/no)',
            gameOver: false,
            newState,
        };
    }
    // PHASE: Another round?
    if (state.phase === 'another') {
        const wantsAnother = parseYesNo(input);
        if (wantsAnother === true) {
            const newState = {
                ...state,
                phase: 'prompt',
                currentTimeframe: getRandomTimeframe(),
                round: state.round + 1,
            };
            return {
                message: getTimeframeMenu(),
                gameOver: false,
                newState,
            };
        }
        if (wantsAnother === false) {
            const summary = getSummary(state.headlines);
            return {
                message: summary || 'Thanks for playing Headline Writer!',
                gameOver: true,
                winner: null,
                newState: { ...state, phase: 'complete' },
            };
        }
        // Unclear response - try to interpret as a timeframe choice
        const timeframeChoice = parseTimeframeChoice(input);
        if (timeframeChoice) {
            const newState = {
                ...state,
                phase: 'writing',
                currentTimeframe: timeframeChoice,
                round: state.round + 1,
            };
            return {
                message: TIMEFRAME_PROMPTS[timeframeChoice],
                gameOver: false,
                newState,
            };
        }
        return {
            message: 'Want to write another headline? Just say yes or no, or pick a topic (today, past, future, dream).',
            gameOver: false,
            newState: state,
        };
    }
    // Default
    return {
        message: getPromptMessage(state),
        gameOver: false,
        newState: { ...state, phase: 'prompt' },
    };
}
/**
 * Describe the current game state for voice
 */
export function describeStateForVoice(state) {
    if (state.phase === 'complete') {
        return `Headline Writer. ${state.headlines.length} headlines written.`;
    }
    return `Headline Writer. Round ${state.round}. Topic: ${state.currentTimeframe.replace('_', ' ')}.`;
}
/**
 * Get the game start result
 */
export function getStartResult(state) {
    return {
        message: getPromptMessage(state),
        gameOver: false,
        newState: { ...state, phase: 'writing' },
    };
}
/**
 * Get all headlines from the session (for saving)
 */
export function getSessionHeadlines(state) {
    return state.headlines;
}
//# sourceMappingURL=headline-writer.js.map