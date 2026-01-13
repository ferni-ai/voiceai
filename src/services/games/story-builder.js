/**
 * 📖 Story Builder Implementation
 *
 * Collaborative storytelling game where players
 * take turns adding to a story.
 *
 * Voice-friendly implementation with natural conversation flow.
 */
// ============================================================================
// CONSTANTS
// ============================================================================
const STORY_PROMPTS = [
    // Adventure
    {
        opening: 'The old map had been hidden in the library for decades. When Alex finally unfolded it,',
        genre: 'adventure',
        setting: 'mysterious library',
    },
    {
        opening: 'The compass always pointed north, except today. Today it pointed straight down into the earth, where',
        genre: 'adventure',
        setting: 'underground mystery',
    },
    {
        opening: 'Nobody had climbed that mountain in fifty years. They said the last expedition found something up there—something that',
        genre: 'adventure',
        setting: 'mountain expedition',
    },
    // Mystery
    {
        opening: 'The letter arrived without a return address. Inside was a single photograph of a door that',
        genre: 'mystery',
        setting: 'mysterious correspondence',
    },
    {
        opening: 'Everyone in town knew the clock tower had been broken for years. So when it suddenly chimed at midnight,',
        genre: 'mystery',
        setting: 'small town secrets',
    },
    {
        opening: 'The detective had seen many strange cases, but nothing like this. The room was completely empty except for',
        genre: 'mystery',
        setting: 'detective case',
    },
    // Fantasy
    {
        opening: 'In a world where dreams could be harvested like crops, one farmer discovered that their latest harvest contained',
        genre: 'fantasy',
        setting: 'dream world',
    },
    {
        opening: 'The dragon was supposed to be just a statue in the town square. But every full moon,',
        genre: 'fantasy',
        setting: 'magical town',
    },
    {
        opening: 'They said the forest moved at night—that the trees walked to new locations. And one morning,',
        genre: 'fantasy',
        setting: 'enchanted forest',
    },
    // Sci-Fi
    {
        opening: 'The AI had been dormant for a century. When it finally woke up, it asked only one question:',
        genre: 'scifi',
        setting: 'future technology',
    },
    {
        opening: 'Space travel had become routine, boring even. But this mission was different because the distress signal came from',
        genre: 'scifi',
        setting: 'space mission',
    },
    {
        opening: 'Time machines were invented, then immediately banned. But someone had used one anyway, and now',
        genre: 'scifi',
        setting: 'time travel',
    },
    // Slice of Life
    {
        opening: 'The coffee shop was always empty at this hour, which is why they were surprised to see',
        genre: 'slice-of-life',
        setting: 'coffee shop',
    },
    {
        opening: 'Moving to a new city is hard. But finding this particular apartment changed everything because',
        genre: 'slice-of-life',
        setting: 'new beginnings',
    },
    {
        opening: 'Every Sunday, grandmother made the same recipe. But this time, she added something different—',
        genre: 'slice-of-life',
        setting: 'family traditions',
    },
];
/** AI story continuations based on context */
const STORY_CONTINUATIONS = {
    transition: [
        'And then,',
        'What happened next was unexpected.',
        'Little did they know,',
        'Meanwhile,',
        'Just when things seemed settled,',
        'The next morning,',
        'As night fell,',
    ],
    tension: [
        "But something wasn't right.",
        'A shadow moved in the corner.',
        'The silence was broken by',
        'Suddenly, everything changed when',
        'Their heart raced as',
        'An unexpected visitor arrived—',
    ],
    discovery: [
        "That's when they noticed",
        'Hidden beneath the surface was',
        'The truth was finally revealed:',
        'A secret had been uncovered—',
        'What they found surprised everyone:',
    ],
    character: [
        'There was someone who',
        'An old friend appeared and',
        'A stranger approached with',
        'The guide explained that',
        'A voice called out,',
    ],
};
// ============================================================================
// GAME CREATION
// ============================================================================
export function createInitialState(genre) {
    const availablePrompts = genre ? STORY_PROMPTS.filter((p) => p.genre === genre) : STORY_PROMPTS;
    const prompt = availablePrompts[Math.floor(Math.random() * availablePrompts.length)];
    return {
        storyParts: [prompt.opening],
        genre: prompt.genre,
        turnCount: 0,
        isUserTurn: true,
        currentChapter: 1,
    };
}
// ============================================================================
// STORY LOGIC
// ============================================================================
/**
 * Check if the user's contribution is valid
 */
function isValidContribution(text) {
    // Must have some content
    if (text.trim().length < 5)
        return false;
    // Check for stop commands (not valid contribution)
    const lower = text.toLowerCase();
    if (lower === 'stop' || lower === 'quit' || lower === 'end')
        return false;
    return true;
}
/**
 * Generate AI's story continuation based on context
 */
function generateAIContinuation(state, userPart) {
    const lower = userPart.toLowerCase();
    // Determine what type of continuation makes sense
    let continuationType = 'transition';
    if (lower.includes('?') || lower.includes('wonder') || lower.includes('strange')) {
        continuationType = 'discovery';
    }
    else if (lower.includes('suddenly') || lower.includes('danger') || lower.includes('afraid')) {
        continuationType = 'tension';
    }
    else if (lower.includes('person') || lower.includes('someone') || lower.includes('they')) {
        continuationType = 'character';
    }
    const options = STORY_CONTINUATIONS[continuationType];
    return options[Math.floor(Math.random() * options.length)];
}
/**
 * Get a chapter transition if appropriate
 */
function shouldTransitionChapter(state) {
    // Every 6 contributions (3 exchanges), consider a new chapter
    return state.turnCount > 0 && state.turnCount % 6 === 0;
}
// ============================================================================
// GAME MESSAGES
// ============================================================================
function getStartMessage(state) {
    const genreNames = {
        adventure: 'an adventure',
        mystery: 'a mystery',
        fantasy: 'a fantasy',
        scifi: 'a sci-fi',
        'slice-of-life': 'a slice-of-life',
    };
    return `Let's build a story together! I'll start, then you add the next part, and we'll take turns. This is ${genreNames[state.genre]} story.\n\n"${state.storyParts[0]}"\n\nWhat happens next?`;
}
function getContinuationMessage(aiPart, fullStory) {
    const encouragements = [
        'Your turn!',
        'What happens next?',
        'Continue the story!',
        'Where does the story go from here?',
        'Keep it going!',
    ];
    const encouragement = encouragements[Math.floor(Math.random() * encouragements.length)];
    return `"${aiPart}" ${encouragement}`;
}
function getChapterTransitionMessage(chapter) {
    return `\n📖 Chapter ${chapter}\n\n`;
}
function getInvalidContributionMessage() {
    return 'Add a bit more to the story! What happens next?';
}
function getEndGameMessage(state) {
    const totalParts = state.storyParts.length;
    const fullStory = state.storyParts.join(' ');
    // Truncate for voice if too long
    const preview = fullStory.length > 200 ? fullStory.substring(0, 200) + '...' : fullStory;
    return `What a story! We created ${totalParts} parts across ${state.currentChapter} chapter${state.currentChapter > 1 ? 's' : ''}.\n\nOur story:\n"${preview}"\n\nWant to start a new story?`;
}
/**
 * Process user input (their story contribution)
 */
export function processInput(state, input) {
    const lower = input.toLowerCase().trim();
    // Check for quit/stop commands
    if (lower === 'stop' ||
        lower === 'quit' ||
        lower === 'end' ||
        lower === 'done' ||
        lower === 'the end') {
        // Add a story ending
        const finalState = {
            ...state,
            storyParts: [...state.storyParts, 'And so the story came to its end.'],
        };
        return {
            message: getEndGameMessage(finalState),
            gameOver: true,
            winner: 'draw',
            newState: finalState,
        };
    }
    // Validate contribution
    if (!isValidContribution(input)) {
        return {
            message: getInvalidContributionMessage(),
            gameOver: false,
            newState: state,
        };
    }
    // Add user's part to story
    const storyWithUserPart = [...state.storyParts, input.trim()];
    // Generate AI continuation
    const aiPart = generateAIContinuation(state, input);
    const newStoryParts = [...storyWithUserPart, aiPart];
    // Check for chapter transition
    const newTurnCount = state.turnCount + 1;
    let currentChapter = state.currentChapter;
    let message = getContinuationMessage(aiPart, newStoryParts);
    if (shouldTransitionChapter({ ...state, turnCount: newTurnCount })) {
        currentChapter++;
        message = getChapterTransitionMessage(currentChapter) + message;
    }
    const newState = {
        storyParts: newStoryParts,
        genre: state.genre,
        turnCount: newTurnCount,
        isUserTurn: true,
        currentChapter,
    };
    // Optional: End after many exchanges
    if (newTurnCount >= 20) {
        return {
            message: `${message}\n\nWow, we've built quite the epic! Say "the end" to wrap up, or keep going!`,
            gameOver: false,
            newState,
        };
    }
    return {
        message,
        gameOver: false,
        newState,
    };
}
/**
 * Describe the current game state for voice
 */
export function describeStateForVoice(state) {
    const lastPart = state.storyParts[state.storyParts.length - 1];
    const preview = lastPart.length > 50 ? lastPart.substring(0, 50) + '...' : lastPart;
    if (state.turnCount === 0) {
        return `Story Builder. ${state.genre} genre. The story begins: "${preview}" Your turn to continue!`;
    }
    return `Story Builder. Chapter ${state.currentChapter}. ${state.storyParts.length} parts so far. Last line: "${preview}" Your turn!`;
}
/**
 * Get the game start result
 */
export function getStartResult(state) {
    return {
        message: getStartMessage(state),
        gameOver: false,
        newState: state,
    };
}
/**
 * Get the full story so far
 */
export function getFullStory(state) {
    return state.storyParts.join(' ');
}
//# sourceMappingURL=story-builder.js.map