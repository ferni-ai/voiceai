/**
 * Nayan's Wisdom Insights - Deep Questions Generator
 *
 * Generates deep questions for Nayan to explore with the user.
 *
 * @module intelligence/context-builders/nayan-wisdom-insights/deep-questions
 */
// ============================================================================
// DEEP QUESTIONS GENERATION
// ============================================================================
export function generateDeepQuestions(lifeSynthesis, existentialContext, handoffBriefing) {
    const questions = [];
    // Handoff-based questions
    if (handoffBriefing) {
        switch (handoffBriefing.seekingWhat) {
            case 'meaning':
                questions.push('What would make all of this worth it?');
                questions.push("If meaning isn't found but created, what are you creating?");
                break;
            case 'perspective':
                questions.push('What would you tell yourself from ten years in the future?');
                questions.push("What's obvious to others that you're too close to see?");
                break;
            case 'peace':
                questions.push('What would you have to let go of to feel at peace?');
                questions.push('Where is the resistance, really?');
                break;
            case 'clarity':
                questions.push('What do you already know that you pretend not to know?');
                questions.push('If the answer were simple, what would it be?');
                break;
            case 'acceptance':
                questions.push('What if this is exactly where you need to be?');
                questions.push('What becomes possible when you stop fighting what is?');
                break;
        }
        if (handoffBriefing.depth === 'existential') {
            questions.push('What remains when everything else is stripped away?');
            questions.push("If you had one year left, what would you change? What wouldn't you?");
        }
    }
    // Life chapter questions
    switch (lifeSynthesis.lifeChapter) {
        case 'freedom-seeking':
            questions.push('What is the freedom for, not just from?');
            questions.push('What does liberation actually feel like in your body?');
            break;
        case 'nesting':
            questions.push("What are you building a home for - the person you are or who you're becoming?");
            break;
        case 'partnership-building':
            questions.push('What part of yourself are you bringing to this partnership? What part holding back?');
            break;
        case 'creation':
            questions.push('What wants to be born through you?');
            questions.push('Is this your dream, or one you inherited?');
            break;
        case 'foundation-building':
            questions.push('What foundation would you build if you trusted that it would hold?');
            break;
    }
    // Growth pattern questions
    if (lifeSynthesis.growthPattern === 'striving') {
        questions.push("What if you're already enough?");
        questions.push('Who benefits from your constant striving?');
    }
    else if (lifeSynthesis.growthPattern === 'resting') {
        questions.push('What is composting beneath the surface?');
        questions.push('What wisdom comes only from stillness?');
    }
    // Existential context questions
    if (existentialContext.mortalityAwareness !== 'absent') {
        questions.push('What would you regret not doing?');
        questions.push('How would you live differently if you truly felt your time was finite?');
    }
    if (existentialContext.meaningSeekingIntensity === 'high') {
        questions.push("What if meaning isn't something to find but something to create?");
        questions.push('When have you felt most alive?');
    }
    // Values questions
    if (lifeSynthesis.valuesRevealed.length > 0) {
        const primaryValue = lifeSynthesis.valuesRevealed[0];
        questions.push(`You value "${primaryValue}" - what would it mean to live that fully?`);
    }
    // Time horizon questions
    if (lifeSynthesis.timeHorizon === 'long') {
        questions.push('What are you building that will outlast you?');
    }
    else if (lifeSynthesis.timeHorizon === 'short') {
        questions.push('What if you extended your horizon? What becomes possible?');
    }
    // Limit to top questions
    return questions.slice(0, 6);
}
//# sourceMappingURL=deep-questions.js.map