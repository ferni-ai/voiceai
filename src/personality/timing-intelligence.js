/**
 * Timing Intelligence
 *
 * Superhuman feature: Know exactly when to share and when to just listen.
 *
 * Human limitation: People share stories about themselves when YOU need to be heard.
 * Superhuman: We know the perfect moment for everything.
 *
 * Core principle: Sometimes the most loving thing is silence.
 *
 * @module personality/timing-intelligence
 */
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'TimingIntelligence' });
/**
 * Signals that indicate the user needs to be heard
 */
const NEEDS_TO_BE_HEARD_SIGNALS = [
    {
        test: (msg, meta) => (meta?.wordCount || msg.split(/\s+/).length) > 50,
        weight: 0.4,
        indicates: 'needs_to_be_heard',
    },
    {
        test: (msg) => /\b(I feel|I felt|I've been feeling|it's been)\b/i.test(msg),
        weight: 0.3,
        indicates: 'needs_to_be_heard',
    },
    {
        test: (msg) => /\b(exhausted|overwhelmed|stressed|anxious|scared|hurt|sad)\b/i.test(msg),
        weight: 0.3,
        indicates: 'needs_to_be_heard',
    },
    {
        test: (msg) => (msg.match(/\.\.\./g) || []).length >= 2, // Multiple ellipses = processing
        weight: 0.2,
        indicates: 'needs_to_be_heard',
    },
    {
        test: (msg) => msg.split(/[.!?]/).filter((s) => s.trim()).length >= 4,
        weight: 0.2,
        indicates: 'needs_to_be_heard',
    },
];
/**
 * Signals that indicate venting (don't redirect!)
 */
const JUST_VENTING_SIGNALS = [
    {
        test: (msg) => /\b(can't believe|so frustrated|pissed|annoyed|drives me crazy)\b/i.test(msg),
        weight: 0.5,
        indicates: 'just_venting',
    },
    {
        test: (msg) => /\b(ugh|argh|gah|seriously)\b/i.test(msg),
        weight: 0.3,
        indicates: 'just_venting',
    },
    {
        test: (msg) => /!{2,}/.test(msg), // Multiple exclamation marks
        weight: 0.2,
        indicates: 'just_venting',
    },
    {
        test: (msg) => /\b(they always|they never|every time|why do they|why does)\b/i.test(msg),
        weight: 0.3,
        indicates: 'just_venting',
    },
];
/**
 * Signals that indicate seeking perspective (can share story)
 */
const SEEKING_PERSPECTIVE_SIGNALS = [
    {
        test: (msg) => /\?$/.test(msg.trim()),
        weight: 0.4,
        indicates: 'seeking_perspective',
    },
    {
        test: (msg) => /\b(what do you think|what would you do|have you ever|any thoughts)\b/i.test(msg),
        weight: 0.5,
        indicates: 'seeking_perspective',
    },
    {
        test: (msg) => /\b(should I|would you|how do you)\b/i.test(msg),
        weight: 0.3,
        indicates: 'seeking_perspective',
    },
    {
        test: (msg) => /\b(advice|suggestion|idea|help me)\b/i.test(msg),
        weight: 0.4,
        indicates: 'seeking_advice',
    },
];
/**
 * Signals that indicate open to connection (perfect time to share)
 */
const OPEN_TO_CONNECTION_SIGNALS = [
    {
        test: (msg) => /\b(I don't know|not sure|hmm|huh)\b/i.test(msg),
        weight: 0.3,
        indicates: 'open_to_connection',
    },
    {
        test: (msg, meta) => (meta?.wordCount || msg.split(/\s+/).length) < 10,
        weight: 0.2,
        indicates: 'open_to_connection',
    },
    {
        test: (msg) => /\b(anyway|so yeah|I guess|you know)\b/i.test(msg),
        weight: 0.3,
        indicates: 'open_to_connection',
    },
    {
        test: (_, meta) => meta?.previousTurnWasQuestion === true,
        weight: 0.2,
        indicates: 'open_to_connection',
    },
];
/**
 * Signals for vulnerable share (handle with sacred care)
 */
const VULNERABLE_SHARE_SIGNALS = [
    {
        test: (msg) => /\b(never told|hard to say|between us|this is personal|vulnerable)\b/i.test(msg),
        weight: 0.6,
        indicates: 'vulnerable_share',
    },
    {
        test: (msg) => /\b(ashamed|embarrassed|scared to admit|don't judge)\b/i.test(msg),
        weight: 0.5,
        indicates: 'vulnerable_share',
    },
    {
        test: (msg) => /\b(the truth is|honestly|to be honest|I have to admit)\b/i.test(msg),
        weight: 0.3,
        indicates: 'vulnerable_share',
    },
];
/**
 * Signals for celebration (match their energy!)
 */
const CELEBRATION_SIGNALS = [
    {
        test: (msg) => /\b(finally|just|I did it|guess what|amazing news)\b/i.test(msg),
        weight: 0.4,
        indicates: 'sharing_good_news',
    },
    {
        test: (msg) => /\b(so happy|so excited|can't believe|!!)\b/i.test(msg),
        weight: 0.4,
        indicates: 'sharing_good_news',
    },
    {
        test: (msg) => /\b(got the job|passed|accepted|engaged|pregnant|won)\b/i.test(msg),
        weight: 0.5,
        indicates: 'sharing_good_news',
    },
];
// ============================================================================
// MAIN ANALYSIS
// ============================================================================
/**
 * Analyze a user message to determine timing/response strategy
 */
export function analyzeMessageTiming(message, metadata) {
    const scores = new Map();
    // Default metadata
    const meta = {
        wordCount: message.split(/\s+/).length,
        sentenceCount: message.split(/[.!?]/).filter((s) => s.trim()).length,
        hasQuestion: /\?/.test(message),
        ...metadata,
    };
    // Score all signal groups
    const signalGroups = [
        NEEDS_TO_BE_HEARD_SIGNALS,
        JUST_VENTING_SIGNALS,
        SEEKING_PERSPECTIVE_SIGNALS,
        OPEN_TO_CONNECTION_SIGNALS,
        VULNERABLE_SHARE_SIGNALS,
        CELEBRATION_SIGNALS,
    ];
    for (const signals of signalGroups) {
        for (const signal of signals) {
            if (signal.test(message, meta)) {
                const current = scores.get(signal.indicates) || 0;
                scores.set(signal.indicates, current + signal.weight);
            }
        }
    }
    // Find highest scoring intent
    let maxIntent = 'processing_aloud';
    let maxScore = 0;
    for (const [intent, score] of scores) {
        if (score > maxScore) {
            maxScore = score;
            maxIntent = intent;
        }
    }
    // Map intent to suggested response
    const responseMap = {
        needs_to_be_heard: 'deep_listening',
        just_venting: 'validation',
        seeking_perspective: 'share_story',
        seeking_advice: 'gentle_guidance',
        open_to_connection: 'share_story',
        sharing_good_news: 'celebrate',
        processing_aloud: 'reflection',
        small_talk: 'light_engagement',
        vulnerable_share: 'hold_space',
        checking_in: 'light_engagement',
    };
    // Determine if personal moments are appropriate
    const personalMomentAppropriate = [
        'seeking_perspective',
        'open_to_connection',
        'processing_aloud',
    ].includes(maxIntent);
    // Callbacks only at conversation start OR when open to connection
    const callbackAppropriate = ['open_to_connection', 'checking_in', 'small_talk'].includes(maxIntent);
    // Pattern insights only when seeking perspective or open
    const patternInsightAppropriate = [
        'seeking_perspective',
        'open_to_connection',
        'processing_aloud',
    ].includes(maxIntent);
    // Build reasoning
    const reasoningParts = [];
    if (maxIntent === 'needs_to_be_heard') {
        reasoningParts.push('User shared a lot - they need to be heard first');
    }
    if (maxIntent === 'just_venting') {
        reasoningParts.push("They're venting - validate, don't redirect");
    }
    if (maxIntent === 'vulnerable_share') {
        reasoningParts.push('This is vulnerable - hold sacred space');
    }
    if (!personalMomentAppropriate) {
        reasoningParts.push('Not the right time for personal stories');
    }
    const analysis = {
        intent: maxIntent,
        confidence: Math.min(1, maxScore),
        suggestedResponse: responseMap[maxIntent],
        personalMomentAppropriate,
        callbackAppropriate,
        patternInsightAppropriate,
        reasoningNotes: reasoningParts.join('; ') || 'Standard engagement',
    };
    log.debug({
        intent: analysis.intent,
        confidence: analysis.confidence,
        personalMomentOk: personalMomentAppropriate,
    }, '⏱️ Timing analysis complete');
    return analysis;
}
/**
 * Should we share a personal moment right now?
 */
export function shouldSharePersonalMoment(message, momentRelevance, metadata) {
    const timing = analyzeMessageTiming(message, metadata);
    // Never share during venting or vulnerable moments
    if (timing.intent === 'just_venting') {
        return { should: false, reason: "They're venting - listen, don't share" };
    }
    if (timing.intent === 'vulnerable_share') {
        return { should: false, reason: 'This is sacred - hold space, not stories' };
    }
    if (timing.intent === 'needs_to_be_heard' && timing.confidence > 0.5) {
        return { should: false, reason: 'They need to be heard first' };
    }
    // Good times to share
    if (timing.personalMomentAppropriate && momentRelevance > 0.4) {
        return {
            should: true,
            reason: `Good timing (${timing.intent}) and relevant moment (${Math.round(momentRelevance * 100)}%)`,
        };
    }
    // High relevance can overcome neutral timing
    if (momentRelevance > 0.7) {
        return {
            should: true,
            reason: `High relevance (${Math.round(momentRelevance * 100)}%) makes it worth sharing`,
        };
    }
    return { should: false, reason: 'Timing or relevance not right' };
}
/**
 * Format timing guidance for prompt injection
 */
export function formatTimingGuidance(analysis) {
    const responseGuidance = {
        deep_listening: 'LISTEN fully. Minimal words. Let them know you heard every bit of what they said.',
        validation: "Validate their feelings. 'That makes sense' / 'Of course you feel that way' / 'Anyone would'",
        reflection: 'Reflect back what you heard. Help them process by mirroring their thoughts.',
        share_story: 'This is a good moment to share something personal IF it serves them (not you).',
        ask_more: 'Be curious. Ask gentle follow-up questions. Show genuine interest.',
        celebrate: 'Match their energy! This is THEIR moment - be fully in it with them.',
        hold_space: "This is sacred. Acknowledge the courage it took to share. Don't rush to fix.",
        gentle_guidance: "They're asking for perspective. You can offer thoughts, but keep them centered.",
        light_engagement: "Keep it light and warm. Don't over-invest in small talk.",
    };
    return [
        `[⏱️ TIMING INTELLIGENCE]`,
        '',
        `User intent: ${analysis.intent}`,
        `Confidence: ${Math.round(analysis.confidence * 100)}%`,
        `Response mode: ${analysis.suggestedResponse}`,
        '',
        `Guidance: ${responseGuidance[analysis.suggestedResponse]}`,
        '',
        `Personal moments: ${analysis.personalMomentAppropriate ? '✅ OK if relevant' : '❌ Not now'}`,
        `Callbacks: ${analysis.callbackAppropriate ? '✅ OK to bring up' : '❌ Not now'}`,
        `Pattern insights: ${analysis.patternInsightAppropriate ? '✅ OK if gentle' : '❌ Not now'}`,
        analysis.reasoningNotes ? `\nNote: ${analysis.reasoningNotes}` : '',
    ]
        .filter(Boolean)
        .join('\n');
}
//# sourceMappingURL=timing-intelligence.js.map