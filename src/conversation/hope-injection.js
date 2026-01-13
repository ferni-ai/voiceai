/**
 * Hope Injection System
 *
 * > "The future isn't fixed. And neither are you."
 *
 * Subtly weaves forward-looking language during difficult moments:
 *
 * - **Future Anchoring**: Reference things they mentioned looking forward to
 * - **Possibility Language**: "when" instead of "if" where appropriate
 * - **Gentle Reframing**: Without toxic positivity
 * - **Agency Restoration**: Remind them of their capacity to change
 * - **Temporal Perspective**: This moment isn't forever
 *
 * The key: Hope without dismissing their current pain.
 *
 * @module @ferni/hope-injection
 */
import { seededPick } from './utils/rng.js';
import { getContentWithFallback } from '../services/llm-dynamic-content.js';
import { createLogger } from '../utils/safe-logger.js';
const logger = createLogger({ module: 'HopeInjection' });
// ============================================================================
// DETECTION PATTERNS
// ============================================================================
/** Hopelessness indicators */
const HOPELESSNESS_PATTERNS = [
    /nothing (will )?ever (change|get better|work)/i,
    /what'?s the point/i,
    /i (can'?t|don'?t) see (a way|how|any)/i,
    /there'?s no (hope|point|use|way)/i,
    /i'?ll (never|always) be/i,
    /it'?s (always|never) (been|going to be)/i,
    /i (give up|'?m done|quit)/i,
    /why (bother|try|even)/i,
    /it doesn'?t matter/i,
];
/** Feeling stuck indicators */
const STUCK_PATTERNS = [
    /i (feel |'?m )?(stuck|trapped|frozen)/i,
    /i (can'?t|don'?t know how to) (move|get out|change)/i,
    /same (thing|stuff|problems?) (over and over|again)/i,
    /nothing (i do|works|helps)/i,
    /i keep (trying|doing) (but|and)/i,
    /i'?m (going in circles|spinning)/i,
    /no way out/i,
];
/** Self-critical indicators */
const SELF_CRITICAL_PATTERNS = [
    /i'?m (such a|so|the worst|always)/i,
    /what'?s wrong with me/i,
    /i (can'?t|couldn'?t|won'?t) (do|get|be)/i,
    /i (always|never) (mess|screw|f.ck)/i,
    /i'?m (not good|bad|terrible|stupid)/i,
    /i (should have|shouldn'?t have)/i,
    /it'?s (my|all my) fault/i,
    /i (hate|can'?t stand) myself/i,
];
/** Future anchors - things to look forward to */
const FUTURE_ANCHOR_PATTERNS = [
    { pattern: /looking forward to (.+)/i, category: 'event' },
    { pattern: /i have (.+) (coming up|next|soon)/i, category: 'event' },
    { pattern: /i want to (.+)/i, category: 'goal' },
    { pattern: /i'?m (planning|going) to (.+)/i, category: 'plan' },
    { pattern: /my goal is (to )?(.+)/i, category: 'goal' },
    { pattern: /i (hope|dream|wish) (to|i could) (.+)/i, category: 'dream' },
    { pattern: /when i (.+)/i, category: 'plan' },
    { pattern: /seeing (.+) (soon|next|this)/i, category: 'person' },
];
/** Phrases that should NOT get hope injection (already moving forward) */
const FORWARD_MOVEMENT_PATTERNS = [
    /i'?m (starting to |beginning to )?(feel better|see|understand)/i,
    /things are (getting|looking) (better|up)/i,
    /i (realized|figured out|decided)/i,
    /i'?m (going to|gonna) (try|do|make)/i,
    /at least/i,
    /on the bright side/i,
];
// ============================================================================
// HOPE PHRASES
// ============================================================================
const HOPE_PHRASES = {
    future_anchor: {
        struggle: [], // Populated dynamically
        stuck: [],
        hopeless: [],
        grieving: [],
        anxious: [],
        self_critical: [],
        overwhelmed: [],
        general: [],
    },
    possibility: {
        struggle: [
            "...and things can shift, even when it doesn't feel like it.",
            'There might be more possibilities here than you can see right now.',
            'I wonder what could change, even a little bit.',
        ],
        stuck: [
            "Feeling stuck doesn't mean you are stuck. Sometimes we just can't see the door yet.",
            "What if there's a way through this that you haven't found yet?",
            "Being stuck is temporary, even when it doesn't feel that way.",
        ],
        hopeless: [
            "I hear how dark this feels. And I also know feelings aren't facts.",
            "Even when we can't see the path, it doesn't mean there isn't one.",
        ],
        grieving: [
            "Grief doesn't have a timeline. And neither does healing.",
            'This pain is real. And so is your capacity to carry it.',
        ],
        anxious: [
            "The future is unwritten. That's scary, but it's also true.",
            "What you're imagining might happen isn't what will happen.",
        ],
        self_critical: [
            "You're seeing yourself through a very harsh lens right now.",
            "I wonder if you'd say this to someone you loved.",
        ],
        overwhelmed: [
            "This moment isn't forever. It's just right now.",
            "You don't have to solve everything today.",
        ],
        general: ['Things can change. They often do.', 'What feels permanent rarely is.'],
    },
    agency: {
        struggle: [
            "You've gotten through hard things before.",
            "You're still here, still trying. That matters.",
        ],
        stuck: [
            'You have more power here than you might think.',
            "You've changed things before. You can again.",
        ],
        hopeless: [
            'Reaching out right now is a choice. You made it.',
            "The fact that you're talking about this means something.",
        ],
        grieving: [],
        anxious: [
            'You have some control here, even if not over everything.',
            "There are things you can do. Let's find them.",
        ],
        self_critical: [
            "You're being harder on yourself than you'd be on anyone else.",
            "You're capable of more than you're giving yourself credit for.",
        ],
        overwhelmed: [
            "You don't have to figure this all out at once.",
            "What's the one smallest thing you could do?",
        ],
        general: [
            'You have more agency here than you might realize.',
            'What would feel like a step forward, even tiny?',
        ],
    },
    temporal: {
        struggle: [
            "This chapter isn't the whole story.",
            "Where you are now isn't where you'll always be.",
        ],
        stuck: [
            'Seasons change. So do situations.',
            "This isn't permanent, even if it feels that way.",
        ],
        hopeless: [
            "How you feel right now isn't how you'll feel forever.",
            "Tomorrow is a new day. That's not nothing.",
        ],
        grieving: [
            'Grief changes shape over time, even if it never fully goes.',
            "You won't always feel exactly like this.",
        ],
        anxious: [
            "Whatever happens, you'll deal with it then. Not now.",
            "You can't solve tomorrow's problems today.",
        ],
        self_critical: [
            "One mistake, or even several, doesn't define who you are.",
            "You're more than this moment.",
        ],
        overwhelmed: ['This feeling will pass. They always do.', 'Right now is temporary.'],
        general: [
            'Everything changes, including this.',
            'Six months from now, things will look different.',
        ],
    },
    growth: {
        struggle: [
            'Sometimes the hardest times teach us the most.',
            "There's growth happening here, even if you can't see it yet.",
        ],
        stuck: [
            'Sometimes we have to sit in the stuck before we can move.',
            'Even being aware of feeling stuck is progress.',
        ],
        hopeless: [],
        grieving: ["Processing this takes time. That's not weakness, it's work."],
        anxious: [],
        self_critical: [
            'Being hard on yourself means you care. Can you redirect that caring?',
            'The fact that you want to be better shows who you really are.',
        ],
        overwhelmed: [],
        general: [
            "You're learning something here, even if it hurts.",
            'Growth often feels like breaking first.',
        ],
    },
    connection: {
        struggle: ["You're not alone in this. I'm here.", "We're figuring this out together."],
        stuck: ["You don't have to find the way out alone.", "Let's sit in this together."],
        hopeless: [
            "I'm not going anywhere. We can sit with this together.",
            "You don't have to carry this alone.",
        ],
        grieving: [
            "I'm here. You don't have to go through this alone.",
            "Grief shared is grief held. I'm holding some of this with you.",
        ],
        anxious: ["Whatever happens, you won't face it alone."],
        self_critical: ["I don't see you the way you're seeing yourself right now."],
        overwhelmed: [
            'We can break this down together.',
            "I'm here. Let's take this one piece at a time.",
        ],
        general: ["You're not alone in this.", "I'm with you."],
    },
    gentle_reframe: {
        struggle: [
            'What if this is the hard part before the change?',
            'Struggle often comes right before a breakthrough.',
        ],
        stuck: [
            'What if stuck is just paused?',
            'Sometimes we need to stop before we can change direction.',
        ],
        hopeless: ["The fact that you're here means some part of you hasn't given up."],
        grieving: ["Grief is love with nowhere to go. That's not weakness."],
        anxious: [
            "What you're feeling is your brain trying to protect you. It's just being overzealous.",
        ],
        self_critical: [
            "What if you're not broken—just human?",
            'What would you tell a friend who said this about themselves?',
        ],
        overwhelmed: [
            "You're not incapable—you're overloaded. There's a difference.",
            "What if it's not you? What if it's just too much?",
        ],
        general: [
            'There might be another way to look at this.',
            "What if this isn't the whole picture?",
        ],
    },
};
// ============================================================================
// HOPE INJECTION ENGINE
// ============================================================================
export class HopeInjectionEngine {
    futureAnchors = [];
    lastInjectionTurn = -10;
    injectionCount = 0;
    turnCount = 0;
    // Config
    MIN_INJECTION_INTERVAL = 4;
    MAX_INJECTIONS_PER_SESSION = 8;
    constructor() {
        logger.debug('HopeInjectionEngine initialized');
    }
    /**
     * Process a message to extract future anchors
     */
    extractFutureAnchors(message, turnCount) {
        this.turnCount = turnCount;
        for (const { pattern, category } of FUTURE_ANCHOR_PATTERNS) {
            const match = pattern.exec(message);
            if (match) {
                const content = match[1] || match[2] || match[3];
                if (content && content.length > 3) {
                    this.futureAnchors.push({
                        content: content.trim(),
                        turn: turnCount,
                        category,
                        sentiment: 'positive',
                    });
                }
            }
        }
        // Keep only recent anchors
        if (this.futureAnchors.length > 10) {
            this.futureAnchors = this.futureAnchors.slice(-10);
        }
    }
    /**
     * Analyze a message and determine if/what hope to inject
     *
     * @param userMessage - User's message
     * @param turnCount - Current turn
     * @returns Hope guidance
     */
    analyze(userMessage, turnCount) {
        this.turnCount = turnCount;
        // Extract any future anchors from this message
        this.extractFutureAnchors(userMessage, turnCount);
        // Default response
        const noHope = {
            shouldInject: false,
            injectionType: null,
            injection: null,
            context: 'general',
            toxicPositivityRisk: false,
        };
        // Don't inject too frequently
        if (turnCount - this.lastInjectionTurn < this.MIN_INJECTION_INTERVAL) {
            return noHope;
        }
        // Max injections per session
        if (this.injectionCount >= this.MAX_INJECTIONS_PER_SESSION) {
            return noHope;
        }
        // Don't inject if they're already moving forward
        if (FORWARD_MOVEMENT_PATTERNS.some((p) => p.test(userMessage))) {
            return noHope;
        }
        // Detect context
        const context = this.detectContext(userMessage);
        if (context === 'general') {
            // Only inject for specific difficult contexts
            return noHope;
        }
        // Check for toxic positivity risk
        const toxicPositivityRisk = this.assessToxicPositivityRisk(context, userMessage);
        // Determine best hope type
        const hopeType = this.selectHopeType(context, toxicPositivityRisk);
        if (!hopeType) {
            return { ...noHope, context, toxicPositivityRisk };
        }
        // Get injection
        const injection = this.getInjection(hopeType, context);
        if (!injection) {
            return { ...noHope, context, toxicPositivityRisk };
        }
        // Decision
        const shouldInject = !toxicPositivityRisk && injection.confidence > 0.5;
        if (shouldInject) {
            this.lastInjectionTurn = turnCount;
            this.injectionCount++;
        }
        logger.debug({
            context,
            hopeType,
            shouldInject,
            toxicPositivityRisk,
            confidence: injection.confidence.toFixed(2),
        }, '🌱 Hope analysis complete');
        return {
            shouldInject,
            injectionType: hopeType,
            injection: shouldInject ? injection : null,
            context,
            toxicPositivityRisk,
        };
    }
    /**
     * Get a future anchor callback if available
     */
    getFutureAnchorCallback() {
        if (this.futureAnchors.length === 0)
            return null;
        // Get most recent positive anchor
        const anchor = [...this.futureAnchors].reverse().find((a) => a.sentiment === 'positive');
        if (!anchor)
            return null;
        const templates = [
            `Speaking of which—you mentioned ${anchor.content}. How's that going?`,
            `I remember you said you were ${anchor.content}. Is that still happening?`,
            `You have ${anchor.content} to look forward to, right?`,
            `What about ${anchor.content}? That sounded good when you mentioned it.`,
        ];
        return seededPick(`${Date.now()}:484`, templates) ?? templates[0];
    }
    /**
     * Get future anchors
     */
    getAnchors() {
        return [...this.futureAnchors];
    }
    /**
     * Reset for new conversation
     */
    reset() {
        this.futureAnchors = [];
        this.lastInjectionTurn = -10;
        this.injectionCount = 0;
        this.turnCount = 0;
        logger.debug('HopeInjectionEngine reset');
    }
    // ============================================================================
    // PRIVATE METHODS
    // ============================================================================
    detectContext(message) {
        if (HOPELESSNESS_PATTERNS.some((p) => p.test(message)))
            return 'hopeless';
        if (STUCK_PATTERNS.some((p) => p.test(message)))
            return 'stuck';
        if (SELF_CRITICAL_PATTERNS.some((p) => p.test(message)))
            return 'self_critical';
        // Check for specific emotions
        const lowerMessage = message.toLowerCase();
        if (/(grief|grieving|lost|died|passed|miss (them|him|her))/.test(lowerMessage))
            return 'grieving';
        if (/(anxious|worried|scared|afraid|nervous|panic)/.test(lowerMessage))
            return 'anxious';
        if (/(overwhelmed|too much|can'?t cope|drowning)/.test(lowerMessage))
            return 'overwhelmed';
        if (/(struggling|hard|difficult|tough|rough)/.test(lowerMessage))
            return 'struggle';
        return 'general';
    }
    assessToxicPositivityRisk(context, message) {
        // High risk contexts where hope could feel dismissive
        const highRiskContexts = ['hopeless', 'grieving'];
        // If context is high risk and message is very intense, be careful
        if (highRiskContexts.includes(context)) {
            const intensityIndicators = [
                /i (can'?t|won'?t|don'?t want to)/i,
                /nothing (matters|helps|works)/i,
                /leave me alone/i,
                /you don'?t understand/i,
                /stop/i,
            ];
            if (intensityIndicators.some((p) => p.test(message))) {
                return true;
            }
        }
        return false;
    }
    selectHopeType(context, toxicRisk) {
        // Prioritization based on context
        const priorities = {
            hopeless: ['connection', 'temporal', 'gentle_reframe'],
            stuck: ['possibility', 'agency', 'temporal'],
            self_critical: ['gentle_reframe', 'agency', 'connection'],
            grieving: ['connection', 'temporal'],
            anxious: ['temporal', 'agency', 'possibility'],
            overwhelmed: ['temporal', 'connection', 'agency'],
            struggle: ['agency', 'temporal', 'possibility', 'connection'],
            general: ['possibility', 'agency'],
        };
        const options = priorities[context] || priorities.general;
        // If high toxic risk, only use connection or temporal
        if (toxicRisk) {
            const safeOptions = options.filter((t) => t === 'connection' || t === 'temporal');
            return safeOptions.length > 0 ? safeOptions[0] : null;
        }
        // Pick based on what's available
        for (const type of options) {
            const phrases = HOPE_PHRASES[type][context];
            if (phrases && phrases.length > 0) {
                return type;
            }
        }
        return null;
    }
    getInjection(type, context) {
        // Check for future anchor opportunity
        if (type === 'future_anchor' && this.futureAnchors.length > 0) {
            const callback = this.getFutureAnchorCallback();
            if (callback) {
                return {
                    type: 'future_anchor',
                    phrase: callback,
                    placement: 'suffix',
                    confidence: 0.75,
                };
            }
        }
        // Try LLM-generated encouragement first (from cache)
        const llmContext = {
            contentType: 'encouragement',
            emotion: context,
            metadata: {
                hopeType: type,
                hopeContext: context,
                shouldBeSubtle: true,
            },
        };
        const llmContent = getContentWithFallback(llmContext);
        if (llmContent.source === 'llm' && llmContent.content) {
            return {
                type,
                phrase: llmContent.content,
                placement: 'suffix',
                confidence: 0.8,
            };
        }
        // Get phrases for this type and context
        const phrases = HOPE_PHRASES[type][context];
        if (!phrases || phrases.length === 0) {
            // Fall back to general
            const generalPhrases = HOPE_PHRASES[type].general;
            if (!generalPhrases || generalPhrases.length === 0) {
                return null;
            }
            return {
                type,
                phrase: seededPick(`${Date.now()}:624`, generalPhrases) ?? generalPhrases[0],
                placement: 'suffix',
                confidence: 0.5,
            };
        }
        return {
            type,
            phrase: seededPick(`${Date.now()}:632`, phrases) ?? phrases[0],
            placement: 'suffix',
            confidence: 0.7,
        };
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';
const hopeInjectionRegistry = createSessionRegistry((sessionId) => new HopeInjectionEngine(), { name: 'HopeInjection', cleanup: (engine) => engine.reset(), verbose: false });
registerGlobalRegistry(hopeInjectionRegistry);
export function getHopeInjectionEngine(sessionId) {
    return hopeInjectionRegistry.get(sessionId);
}
export function resetHopeInjectionEngine(sessionId) {
    const engine = hopeInjectionRegistry.get(sessionId);
    engine.reset();
}
export function clearHopeInjectionEngine(sessionId) {
    hopeInjectionRegistry.reset(sessionId);
}
export function getActiveHopeInjectionCount() {
    return hopeInjectionRegistry.getActiveCount();
}
export default HopeInjectionEngine;
//# sourceMappingURL=hope-injection.js.map