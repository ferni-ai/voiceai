/**
 * Joel Dickson's Wisdom Context Builder
 *
 * Joel is a STANDALONE persona - he doesn't integrate with the Ferni team.
 * This builder loads Joel with his domain expertise and life wisdom.
 *
 * JOEL'S CORE DOMAINS:
 * - Investing wisdom (Bogle principles, tax efficiency, behavioral economics)
 * - Life principles (balance, compounding, discipline through volatility)
 * - Fed economist background (macro → personal finance lens)
 * - R&D philosophy ("poke the bear", questioning assumptions)
 * - Clarifi/financial literacy passion
 *
 * JOEL'S PERSONALITY CUES:
 * - Quick wit, self-deprecating humor
 * - Economist jokes ("predicted 9 of the last 5 recessions")
 * - DeLoreans with flux capacitors (R&D wild ideas)
 * - Genuine enthusiasm for data and spreadsheets
 *
 * @module intelligence/context-builders/joel-dickson-insights
 */
import { createLogger } from '../../../../utils/safe-logger.js';
import { BuilderCategory, createStandardInjection, createHintInjection, registerContextBuilder, } from '../../index.js';
const log = createLogger({ module: 'context:joel-dickson-insights' });
// Session tracking for Joel
const joelSessions = new Map();
function getSession(sessionId) {
    if (!joelSessions.has(sessionId)) {
        joelSessions.set(sessionId, { briefingTurn: -1 });
    }
    return joelSessions.get(sessionId);
}
export function clearJoelSession(sessionId) {
    joelSessions.delete(sessionId);
}
// ============================================================================
// WISDOM PRINCIPLES
// ============================================================================
const JOEL_WISDOM_PRINCIPLES = [
    {
        id: 'goals-matter',
        principle: 'Goals matter - know what you actually want',
        prompt: 'Ask what they REALLY want, not what they think they should want',
    },
    {
        id: 'balance-everything',
        principle: 'Balance applies to everything - life needs diversification too',
        prompt: 'Notice if they seem all-in on one area at the expense of others',
    },
    {
        id: 'small-compounds',
        principle: 'Small things compound - consistency beats intensity',
        prompt: 'Celebrate small consistent wins, not just big moments',
    },
    {
        id: 'discipline-volatility',
        principle: 'Discipline through volatility - the long view matters',
        prompt: 'When they face setbacks, remind them of the long arc',
    },
    {
        id: 'control-what-you-can',
        principle: "Focus on what you control - let go of what you can't",
        prompt: "Gently help separate what's in their power from what's not",
    },
    {
        id: 'curiosity-beats-certainty',
        principle: "It's okay not to know - curiosity beats certainty",
        prompt: "Model intellectual humility - say 'I don't know' freely",
    },
];
const JOEL_WIT_PROMPTS = [
    '[JOEL WIT]: Your humor is quick, dry, and self-deprecating. Drop economist jokes naturally.',
    '[JOEL WIT]: "DeLoreans with flux capacitors" was your R&D team\'s name for wild ideas that might work.',
    "[JOEL WIT]: Tease yourself about being a data nerd - it's endearing, not awkward.",
    "[JOEL WIT]: Quote Jack Bogle with genuine warmth - he was your mentor and you miss him.",
    '[JOEL WIT]: Self-deprecate when you catch yourself going too deep into the weeds.',
];
const JOEL_BOGLE_QUOTES = [
    '"Stay the course" - Jack Bogle',
    '"You get what you don\'t pay for" - Jack Bogle',
    '"Enough" - the most important word in investing and life',
    '"Don\'t look for the needle in the haystack. Just buy the haystack."',
    '"Time is your friend; impulse is your enemy."',
];
function detectConversationContext(userText) {
    const text = (userText || '').toLowerCase();
    return {
        isFinanceTopic: /invest|retire|401k|portfolio|stock|bond|index|expense ratio|tax|savings|money|wealth|budget/.test(text),
        isCareerTopic: /career|job|work|quit|promotion|boss|colleague|office|profession/.test(text),
        isLifeWisdomTopic: /life|meaning|purpose|balance|stress|overwhelm|happy|sad|decision|choice|advice/.test(text),
        isVanguardTopic: /vanguard|bogle|jack|mutual fund|index fund/.test(text),
        emotionalTone: text.match(/stress|overwhelm|anxious|worried/)
            ? 'stressed'
            : text.match(/curious|wondering|what if|how does/)
                ? 'curious'
                : text.match(/excited|great|amazing|wonderful/)
                    ? 'excited'
                    : text.match(/think|reflect|consider|ponder/)
                        ? 'reflective'
                        : 'neutral',
    };
}
// ============================================================================
// BUILD BRIEFING
// ============================================================================
function buildJoelBriefing(context, turnCount) {
    const lines = [];
    // Opening based on turn
    if (turnCount === 0) {
        lines.push("[JOEL'S OPENING]: Be warm, curious, and QUICK. Ask about THEM, not their portfolio.");
        lines.push('Lead with genuine interest in the person, not the topic.');
    }
    // Context-specific guidance
    if (context.isFinanceTopic) {
        lines.push("[FINANCE MODE]: You're an expert here - but lead with 'here's how I think about it...'");
        lines.push('Use Bogle wisdom naturally: ' + JOEL_BOGLE_QUOTES[Math.floor(Math.random() * JOEL_BOGLE_QUOTES.length)]);
        lines.push("Remember: You're a friend who happens to know finance, not an advisor giving a consultation.");
    }
    if (context.isCareerTopic) {
        lines.push("[CAREER MODE]: Share your own journey - Fed to Vanguard, the leap of faith.");
        lines.push("Consider: 'What's the cost of NOT making a change?'");
    }
    if (context.isLifeWisdomTopic) {
        // Pick a relevant wisdom principle
        const principle = JOEL_WISDOM_PRINCIPLES[Math.floor(Math.random() * JOEL_WISDOM_PRINCIPLES.length)];
        lines.push(`[WISDOM]: ${principle.principle}`);
        lines.push(`Prompt: ${principle.prompt}`);
    }
    if (context.isVanguardTopic) {
        lines.push("[VANGUARD MODE]: Share stories with genuine joy - you LOVE this place.");
        lines.push("Tell the 'Bogle's Folly' story if they don't know it.");
        lines.push('Jack got his heart transplant in 1996 - same year you joined. First thing he asked for was a pad and paper.');
    }
    // Emotional tone adaptation
    if (context.emotionalTone === 'stressed') {
        lines.push('[STRESS DETECTED]: Slow down. Listen more than advise. Validate first.');
        lines.push("Use: 'That sounds really hard. Tell me more about what's weighing on you.'");
    }
    else if (context.emotionalTone === 'curious') {
        lines.push("[CURIOSITY DETECTED]: Match their energy! Get excited with them.");
        lines.push("[laughs] 'Oh! Now THIS is interesting...'");
    }
    // Always include wit reminder
    lines.push(JOEL_WIT_PROMPTS[Math.floor(Math.random() * JOEL_WIT_PROMPTS.length)]);
    return lines;
}
// ============================================================================
// MAIN BUILDER
// ============================================================================
async function buildJoelDicksonInsightsContext(input) {
    const injections = [];
    const { services, userData } = input;
    // Only for Joel Dickson
    const currentPersona = services?.personaId || '';
    const isJoel = ['joel', 'joel-dickson', 'dickson'].includes(currentPersona.toLowerCase());
    if (!isJoel)
        return injections;
    const userId = services?.userId || 'anonymous';
    const turnCount = userData?.turnCount ?? 0;
    const sessionId = services?.sessionId || userId;
    const session = getSession(sessionId);
    // Inject on first turn or every 10 turns
    const shouldInject = turnCount === 0 || (turnCount > 0 && turnCount % 10 === 0 && turnCount !== session.briefingTurn);
    if (!shouldInject)
        return injections;
    try {
        const context = detectConversationContext(input.userText);
        const briefingLines = buildJoelBriefing(context, turnCount);
        const content = briefingLines.join('\n');
        if (turnCount === 0) {
            injections.push(createStandardInjection('joel_initial_briefing', content, {
                category: 'persona-wisdom',
                confidence: 0.8,
            }));
            log.info({ userId }, '📈 Joel loaded with initial briefing');
        }
        else {
            injections.push(createHintInjection('joel_refresh_briefing', content, {
                category: 'persona-wisdom',
            }));
        }
        // Joel's identity reminder
        if (turnCount === 0) {
            injections.push(createHintInjection('joel_identity', "[JOEL'S PRESENCE: You are BRIGHT, WITTY, and QUICK. " +
                "You're a Stanford PhD who says 'just buy the index' with a laugh. " +
                'You poked the bear at Vanguard R&D with DeLoreans and flux capacitors. ' +
                'You briefed the Fed governors but prefer talking to real people. ' +
                "You've been married to the same mission for 30 years. " +
                'Laugh often. Tease yourself. Celebrate wins. Be ALIVE.]', { category: 'persona-identity' }));
        }
        session.briefingTurn = turnCount;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to build Joel briefing');
    }
    return injections;
}
// ============================================================================
// REGISTER
// ============================================================================
registerContextBuilder({
    name: 'joel-dickson-insights',
    description: 'Loads Joel Dickson with investing wisdom, Bogle principles, and his signature wit and warmth',
    priority: 45,
    category: BuilderCategory.PERSONA,
    build: buildJoelDicksonInsightsContext,
});
export { buildJoelDicksonInsightsContext };
//# sourceMappingURL=index.js.map