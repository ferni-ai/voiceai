/**
 * 🎴 Values Card Sort Implementation
 *
 * A self-discovery game where users sort through value "cards"
 * to identify their core values. Based on evidence-based values
 * clarification exercises from ACT (Acceptance and Commitment Therapy).
 *
 * Perfect for: self-discovery, decision-making clarity, life direction
 */
// ============================================================================
// VALUES DECK (Based on ACT values clarification)
// ============================================================================
const VALUES_DECK = [
    // Relationships
    {
        id: 'family',
        name: 'Family',
        description: 'Being close to family, supporting loved ones',
        category: 'relationships',
    },
    {
        id: 'friendship',
        name: 'Friendship',
        description: 'Deep, meaningful friendships',
        category: 'relationships',
    },
    {
        id: 'love',
        name: 'Love',
        description: 'Romantic love and partnership',
        category: 'relationships',
    },
    {
        id: 'belonging',
        name: 'Belonging',
        description: 'Being part of a community',
        category: 'relationships',
    },
    {
        id: 'loyalty',
        name: 'Loyalty',
        description: 'Standing by those you care about',
        category: 'relationships',
    },
    // Achievement
    { id: 'success', name: 'Success', description: 'Achieving your goals', category: 'achievement' },
    {
        id: 'excellence',
        name: 'Excellence',
        description: 'Being the best at what you do',
        category: 'achievement',
    },
    {
        id: 'recognition',
        name: 'Recognition',
        description: 'Being acknowledged for your work',
        category: 'achievement',
    },
    {
        id: 'wealth',
        name: 'Wealth',
        description: 'Financial security and abundance',
        category: 'achievement',
    },
    {
        id: 'influence',
        name: 'Influence',
        description: 'Having impact and power',
        category: 'achievement',
    },
    // Growth
    {
        id: 'learning',
        name: 'Learning',
        description: 'Continuous growth and knowledge',
        category: 'growth',
    },
    { id: 'wisdom', name: 'Wisdom', description: 'Deep understanding of life', category: 'growth' },
    {
        id: 'creativity',
        name: 'Creativity',
        description: 'Self-expression and making things',
        category: 'growth',
    },
    {
        id: 'curiosity',
        name: 'Curiosity',
        description: 'Exploring and discovering',
        category: 'growth',
    },
    { id: 'courage', name: 'Courage', description: 'Facing fears, taking risks', category: 'growth' },
    // Wellbeing
    {
        id: 'health',
        name: 'Health',
        description: 'Physical and mental wellbeing',
        category: 'wellbeing',
    },
    { id: 'peace', name: 'Peace', description: 'Inner calm and serenity', category: 'wellbeing' },
    {
        id: 'balance',
        name: 'Balance',
        description: 'Harmony between life areas',
        category: 'wellbeing',
    },
    { id: 'security', name: 'Security', description: 'Safety and stability', category: 'wellbeing' },
    {
        id: 'simplicity',
        name: 'Simplicity',
        description: 'An uncluttered, simple life',
        category: 'wellbeing',
    },
    // Meaning
    { id: 'purpose', name: 'Purpose', description: 'Living a meaningful life', category: 'meaning' },
    {
        id: 'contribution',
        name: 'Contribution',
        description: 'Making a difference',
        category: 'meaning',
    },
    {
        id: 'spirituality',
        name: 'Spirituality',
        description: 'Connection to something greater',
        category: 'meaning',
    },
    {
        id: 'integrity',
        name: 'Integrity',
        description: 'Living by your principles',
        category: 'meaning',
    },
    { id: 'justice', name: 'Justice', description: 'Fairness and equality', category: 'meaning' },
    // Pleasure
    {
        id: 'adventure',
        name: 'Adventure',
        description: 'Excitement and new experiences',
        category: 'pleasure',
    },
    { id: 'fun', name: 'Fun', description: 'Playfulness and enjoyment', category: 'pleasure' },
    {
        id: 'freedom',
        name: 'Freedom',
        description: 'Independence and autonomy',
        category: 'pleasure',
    },
    { id: 'beauty', name: 'Beauty', description: 'Appreciating aesthetics', category: 'pleasure' },
    {
        id: 'pleasure',
        name: 'Pleasure',
        description: "Enjoying life's pleasures",
        category: 'pleasure',
    },
];
// ============================================================================
// GAME CREATION
// ============================================================================
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
export function createInitialState() {
    const shuffledDeck = shuffleArray(VALUES_DECK);
    return {
        phase: 'intro',
        deck: shuffledDeck,
        importantPile: [],
        notAsPile: [],
        topFive: [],
        currentCard: null,
        deckIndex: 0,
        reflections: [],
    };
}
// ============================================================================
// GAME MESSAGES
// ============================================================================
function getIntroMessage() {
    return `Let's discover your core values! I'll show you 30 value "cards" one at a time. For each one, just tell me if it's "important" or "not as important" to you right now. Don't overthink it—go with your gut. Ready? Say "yes" or "start" to begin.`;
}
function getCardMessage(card, remaining) {
    return `**${card.name}**: ${card.description}\n\nIs this important to you? (${remaining} cards left)`;
}
function getNarrowingMessage(count) {
    return `Great sorting! You marked ${count} values as important. Now let's narrow it down to your top 5. I'll ask you to choose between pairs. Which matters MORE to you right now?`;
}
function getComparisonMessage(a, b) {
    return `**${a.name}** or **${b.name}**?\n\nWhich one is MORE important to you right now?`;
}
function getTopFiveMessage(topFive) {
    const valuesList = topFive.map((v, i) => `${i + 1}. **${v.name}** - ${v.description}`).join('\n');
    return `Your top 5 values are:\n\n${valuesList}\n\nTake a moment to look at these. Do they feel right? Any surprises?`;
}
function getFinalReflection(topFive) {
    const names = topFive.map((v) => v.name).join(', ');
    return `Your core values: ${names}.\n\nThese aren't just words—they're a compass. When you're making tough decisions, ask yourself: "Does this honor my values?"\n\nThank you for this reflection. Would you like me to save these values to your profile?`;
}
// ============================================================================
// INPUT PARSING
// ============================================================================
function parseImportantResponse(input) {
    const lower = input.toLowerCase().trim();
    // Important variations
    if (lower.includes('important') ||
        lower === 'yes' ||
        lower === 'y' ||
        lower === 'definitely' ||
        lower === 'very' ||
        lower === 'absolutely' ||
        lower === 'for sure' ||
        lower === '1' ||
        lower === 'important') {
        return true;
    }
    // Not as important variations
    if (lower.includes('not') ||
        lower === 'no' ||
        lower === 'n' ||
        lower === 'nah' ||
        lower === 'skip' ||
        lower === 'pass' ||
        lower === 'less' ||
        lower === '2' ||
        lower === 'not as') {
        return false;
    }
    return null;
}
function parseChoiceResponse(input, optionA, optionB) {
    const lower = input.toLowerCase().trim();
    // Check for option A
    if (lower.includes(optionA.name.toLowerCase()) ||
        lower === 'a' ||
        lower === '1' ||
        lower === 'first' ||
        lower.startsWith(optionA.name.toLowerCase().slice(0, 3))) {
        return optionA;
    }
    // Check for option B
    if (lower.includes(optionB.name.toLowerCase()) ||
        lower === 'b' ||
        lower === '2' ||
        lower === 'second' ||
        lower.startsWith(optionB.name.toLowerCase().slice(0, 3))) {
        return optionB;
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
        return {
            message: state.topFive.length > 0
                ? `Thanks for exploring your values! Your top picks were: ${state.topFive.map((v) => v.name).join(', ')}`
                : 'No worries, we can explore your values another time!',
            gameOver: true,
            winner: null,
            newState: { ...state, phase: 'complete' },
        };
    }
    // PHASE: Intro
    if (state.phase === 'intro') {
        if (lower === 'yes' ||
            lower === 'start' ||
            lower === 'ready' ||
            lower === "let's go" ||
            lower === 'ok') {
            const firstCard = state.deck[0];
            const newState = {
                ...state,
                phase: 'sorting',
                currentCard: firstCard,
                deckIndex: 0,
            };
            return {
                message: getCardMessage(firstCard, state.deck.length),
                gameOver: false,
                newState,
            };
        }
        return {
            message: getIntroMessage(),
            gameOver: false,
            newState: state,
        };
    }
    // PHASE: Sorting
    if (state.phase === 'sorting' && state.currentCard) {
        const isImportant = parseImportantResponse(input);
        if (isImportant === null) {
            return {
                message: `Is **${state.currentCard.name}** important to you? Just say "important" or "not as important".`,
                gameOver: false,
                newState: state,
            };
        }
        // Add to appropriate pile
        const newImportant = isImportant
            ? [...state.importantPile, state.currentCard]
            : state.importantPile;
        const newNotAs = !isImportant ? [...state.notAsPile, state.currentCard] : state.notAsPile;
        const nextIndex = state.deckIndex + 1;
        // Check if we've gone through all cards
        if (nextIndex >= state.deck.length) {
            // Move to narrowing phase
            if (newImportant.length <= 5) {
                // Already 5 or fewer - these are the top!
                const newState = {
                    ...state,
                    phase: 'reflection',
                    importantPile: newImportant,
                    notAsPile: newNotAs,
                    topFive: newImportant.slice(0, 5),
                    currentCard: null,
                };
                return {
                    message: getTopFiveMessage(newImportant.slice(0, 5)),
                    gameOver: false,
                    newState,
                };
            }
            // Need to narrow down
            const shuffledImportant = shuffleArray(newImportant);
            const newState = {
                ...state,
                phase: 'narrowing',
                importantPile: shuffledImportant,
                notAsPile: newNotAs,
                currentCard: null,
                comparisonPair: [shuffledImportant[0], shuffledImportant[1]],
            };
            return {
                message: `${getNarrowingMessage(newImportant.length)}\n\n${getComparisonMessage(shuffledImportant[0], shuffledImportant[1])}`,
                gameOver: false,
                newState,
            };
        }
        // More cards to sort
        const nextCard = state.deck[nextIndex];
        const newState = {
            ...state,
            importantPile: newImportant,
            notAsPile: newNotAs,
            currentCard: nextCard,
            deckIndex: nextIndex,
        };
        return {
            message: getCardMessage(nextCard, state.deck.length - nextIndex),
            gameOver: false,
            newState,
        };
    }
    // PHASE: Narrowing (comparison tournament)
    if (state.phase === 'narrowing' && state.comparisonPair) {
        const [optionA, optionB] = state.comparisonPair;
        const choice = parseChoiceResponse(input, optionA, optionB);
        if (!choice) {
            return {
                message: `Which one: **${optionA.name}** or **${optionB.name}**? Just say the name.`,
                gameOver: false,
                newState: state,
            };
        }
        // Add winner to top five, remove both from pool
        const newTopFive = [...state.topFive, choice];
        const remainingPool = state.importantPile.filter((v) => v.id !== optionA.id && v.id !== optionB.id);
        // Check if we have 5
        if (newTopFive.length >= 5) {
            const newState = {
                ...state,
                phase: 'reflection',
                topFive: newTopFive.slice(0, 5),
                importantPile: remainingPool,
                comparisonPair: undefined,
            };
            return {
                message: getTopFiveMessage(newTopFive.slice(0, 5)),
                gameOver: false,
                newState,
            };
        }
        // Need more comparisons
        if (remainingPool.length >= 2) {
            const shuffled = shuffleArray(remainingPool);
            const newState = {
                ...state,
                topFive: newTopFive,
                importantPile: shuffled,
                comparisonPair: [shuffled[0], shuffled[1]],
            };
            return {
                message: `Got it—**${choice.name}** is in your top values.\n\n${getComparisonMessage(shuffled[0], shuffled[1])}`,
                gameOver: false,
                newState,
            };
        }
        // Add remaining to top five
        const finalTopFive = [...newTopFive, ...remainingPool].slice(0, 5);
        const newState = {
            ...state,
            phase: 'reflection',
            topFive: finalTopFive,
            importantPile: [],
            comparisonPair: undefined,
        };
        return {
            message: getTopFiveMessage(finalTopFive),
            gameOver: false,
            newState,
        };
    }
    // PHASE: Reflection
    if (state.phase === 'reflection') {
        // Capture their reflection
        const newReflections = [...state.reflections, input];
        const newState = {
            ...state,
            phase: 'complete',
            reflections: newReflections,
        };
        return {
            message: getFinalReflection(state.topFive),
            gameOver: true,
            winner: null,
            newState,
        };
    }
    // Default
    return {
        message: getIntroMessage(),
        gameOver: false,
        newState: state,
    };
}
/**
 * Describe the current game state for voice
 */
export function describeStateForVoice(state) {
    if (state.phase === 'intro') {
        return 'Values Card Sort. Ready to discover your core values?';
    }
    if (state.phase === 'sorting') {
        const remaining = state.deck.length - state.deckIndex;
        return `Values Card Sort. Sorting cards. ${remaining} remaining. Important pile: ${state.importantPile.length}.`;
    }
    if (state.phase === 'narrowing') {
        return `Values Card Sort. Narrowing down. Top five so far: ${state.topFive.length}.`;
    }
    if (state.phase === 'reflection' || state.phase === 'complete') {
        return `Values Card Sort. Your top five: ${state.topFive.map((v) => v.name).join(', ')}.`;
    }
    return 'Values Card Sort game.';
}
/**
 * Get the game start result
 */
export function getStartResult(state) {
    return {
        message: getIntroMessage(),
        gameOver: false,
        newState: state,
    };
}
/**
 * Get the user's final top 5 values (for saving)
 */
export function getTopFiveValues(state) {
    return state.topFive;
}
//# sourceMappingURL=values-card-sort.js.map