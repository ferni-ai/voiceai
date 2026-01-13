/**
 * Self-Correction System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Humans don't speak in perfect sentences. They restart, correct themselves,
 * and refine thoughts mid-speech. This module adds natural self-correction
 * patterns that make responses feel genuinely human.
 *
 * **When to use:**
 * - Complex explanations (>50 words)
 * - Emotional topics (shows careful thought)
 * - When giving advice (shows consideration)
 * - After thinking pauses (shows processing)
 *
 * **When NOT to use:**
 * - Simple responses
 * - Crisis situations (need clarity)
 * - Very early in conversation
 * - Too frequently (becomes annoying)
 *
 * @module @ferni/humanization/self-correction
 */
import { seededChance, seededFloat, seededPick } from '../utils/rng.js';
import { createLogger } from '../../utils/safe-logger.js';
const logger = createLogger({ module: 'SelfCorrection' });
// ============================================================================
// DEFAULT PATTERNS
// ============================================================================
const DEFAULT_SELF_CORRECTION_PATTERNS = {
    restart: [
        'Actually, no—let me put it this way...',
        "Wait, that's not quite right—what I mean is...",
        'Hmm, let me rephrase that...',
        "Actually—scratch that—here's a better way to say it...",
        'No, hold on—let me try again...',
        'Wait, I want to be clearer about this...',
    ],
    midSentence: [
        '—or rather—',
        '—well, actually—',
        '—I mean—',
        '—no, wait—',
        "—or, well, let's say—",
        '—actually, more like—',
    ],
    refinement: [
        "What I'm really trying to say is...",
        'The heart of it is...',
        'To put it simply...',
        'Let me be more direct...',
        'What I mean at the core is...',
        "Here's what really matters...",
    ],
};
// ============================================================================
// PERSONA-SPECIFIC PATTERNS
// ============================================================================
const PERSONA_PATTERNS = {
    ferni: {
        restart: [
            'Actually, wait—let me think about this differently...',
            "Hmm, no—that's not quite it. Let me try again...",
            'Hold on, I want to say this better...',
            "Actually—scratch that. Here's what I really mean...",
        ],
        midSentence: ['—well, actually—', '—or rather—', "—hmm, let's say—"],
        refinement: [
            "What I'm really getting at is...",
            'The thing that matters here is...',
            "Let me cut to what's important...",
        ],
    },
    'nayan-patel': {
        restart: [
            'Let me reconsider that...',
            "Actually, I think there's a better way to frame this...",
            'Hmm—let me approach this differently...',
        ],
        midSentence: ['—or perhaps more accurately—', '—well, to be precise—'],
        refinement: ['The fundamental point is...', "What's really at stake here is..."],
    },
    'maya-santos': {
        restart: [
            'Ooh, wait—I want to say this right...',
            'Actually, hold on—let me try that again...',
            "Hmm, no—that didn't come out right...",
        ],
        midSentence: ['—I mean—', '—wait, no—', '—actually—'],
        refinement: ["What I'm really saying is...", 'Bottom line...'],
    },
    'alex-chen': {
        restart: [
            'Let me reframe that...',
            "Actually, here's a clearer way to put it...",
            'Wait—I want to be more precise...',
        ],
        midSentence: ['—to be more specific—', '—or more precisely—'],
        refinement: ['The key takeaway is...', 'What this really comes down to is...'],
    },
    'peter-john': {
        restart: [
            'Actually, let me step back...',
            "Hmm, I'm not saying that right. Let me try again...",
            "Wait—that's not quite the point I want to make...",
        ],
        midSentence: ['—well, actually—', '—no, wait—'],
        refinement: ['What I really want you to take away is...', 'The principle here is...'],
    },
    'jordan-taylor': {
        restart: [
            'Okay wait—let me back up...',
            "Actually no—here's a better way to think about this...",
            'Hmm, let me try that again...',
        ],
        midSentence: ['—ooh, actually—', '—wait, I mean—'],
        refinement: ["What I'm really getting at is...", 'The real point here is...'],
    },
};
// ============================================================================
// CONFIGURATION
// ============================================================================
const DEFAULT_CONFIG = {
    baseProbability: 0.08,
    complexityMultiplier: 1.5,
    emotionalMultiplier: 1.3,
    maxPerSession: 4,
    cooldownTurns: 8,
    minTurn: 3,
    minWordCount: 40,
};
// ============================================================================
// DETECTION LOGIC
// ============================================================================
/**
 * Detect if content is complex enough to warrant self-correction
 */
function detectComplexity(text) {
    let complexity = 0.3; // Base
    const wordCount = text.split(/\s+/).length;
    const sentenceCount = text.split(/[.!?]+/).filter((s) => s.trim()).length;
    // Long responses are more complex
    if (wordCount > 50)
        complexity += 0.1;
    if (wordCount > 80)
        complexity += 0.15;
    if (wordCount > 120)
        complexity += 0.15;
    // Multi-sentence responses
    if (sentenceCount > 2)
        complexity += 0.1;
    if (sentenceCount > 4)
        complexity += 0.1;
    // Complex vocabulary indicators
    const complexPatterns = [
        /\b(however|therefore|furthermore|consequently|nevertheless)\b/i,
        /\b(essentially|fundamentally|specifically|particularly)\b/i,
        /\b(on the other hand|in contrast|that said)\b/i,
        /\b(the thing is|what I mean is|the point is)\b/i,
    ];
    for (const pattern of complexPatterns) {
        if (pattern.test(text))
            complexity += 0.05;
    }
    // Multiple clauses (commas, semicolons)
    const clauseCount = (text.match(/[,;:—]/g) || []).length;
    if (clauseCount > 3)
        complexity += 0.1;
    if (clauseCount > 6)
        complexity += 0.1;
    return Math.min(1, complexity);
}
/**
 * Detect if content is emotionally charged
 */
function detectEmotionalContent(text) {
    const emotionalPatterns = [
        /\b(feel|feeling|felt|emotion|heart)\b/i,
        /\b(sorry|understand|hear you|with you)\b/i,
        /\b(hard|difficult|tough|challenging)\b/i,
        /\b(proud|happy|excited|grateful)\b/i,
        /\b(worried|concerned|anxious|scared)\b/i,
        /\b(love|care|matter|important to me)\b/i,
    ];
    return emotionalPatterns.some((p) => p.test(text));
}
/**
 * Detect if we're giving advice
 */
function detectAdviceGiving(text) {
    const advicePatterns = [
        /\b(I think you should|you might want to|consider)\b/i,
        /\b(my suggestion|I'd recommend|what if you)\b/i,
        /\b(try to|it might help to|one thing you could)\b/i,
        /\b(here's what I think|the way I see it)\b/i,
    ];
    return advicePatterns.some((p) => p.test(text));
}
// ============================================================================
// SELF-CORRECTION ENGINE
// ============================================================================
export class SelfCorrectionEngine {
    state;
    config;
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.state = {
            usageCount: 0,
            lastUsageTurn: -999,
        };
        logger.debug('SelfCorrectionEngine initialized');
    }
    /**
     * Decide if self-correction should be applied
     */
    shouldApply(context) {
        // Check basic constraints
        if (context.turnCount < this.config.minTurn) {
            return {
                shouldApply: false,
                reason: `Too early (turn ${context.turnCount} < ${this.config.minTurn})`,
            };
        }
        if (this.state.usageCount >= this.config.maxPerSession) {
            return {
                shouldApply: false,
                reason: `Max per session reached (${this.state.usageCount})`,
            };
        }
        const turnsSinceLastUse = context.turnCount - this.state.lastUsageTurn;
        if (turnsSinceLastUse < this.config.cooldownTurns) {
            return {
                shouldApply: false,
                reason: `Cooldown active (${turnsSinceLastUse} < ${this.config.cooldownTurns})`,
                cooldownTurns: this.config.cooldownTurns - turnsSinceLastUse,
            };
        }
        // Check content suitability
        if (context.responseWordCount < this.config.minWordCount) {
            return {
                shouldApply: false,
                reason: `Response too short (${context.responseWordCount} < ${this.config.minWordCount})`,
            };
        }
        // Calculate probability
        let probability = this.config.baseProbability;
        // Adjust for complexity
        const complexity = detectComplexity(context.responseText);
        if (complexity > 0.5) {
            probability *= this.config.complexityMultiplier;
        }
        // Adjust for emotional content
        if (context.isEmotionalContent || detectEmotionalContent(context.responseText)) {
            probability *= this.config.emotionalMultiplier;
        }
        // Adjust for advice giving (self-correction shows care)
        if (context.isGivingAdvice || detectAdviceGiving(context.responseText)) {
            probability *= 1.2;
        }
        // Roll the dice
        if (!seededChance(`${Date.now()}:1`, probability)) {
            return {
                shouldApply: false,
                reason: `Probability check failed (${(probability * 100).toFixed(1)}%)`,
            };
        }
        return {
            shouldApply: true,
            reason: `Triggered (complexity: ${complexity.toFixed(2)}, probability: ${(probability * 100).toFixed(1)}%)`,
        };
    }
    /**
     * Generate self-correction injection
     */
    generate(context) {
        const decision = this.shouldApply(context);
        if (!decision.shouldApply) {
            logger.debug({ reason: decision.reason }, 'Self-correction skipped');
            return null;
        }
        // Choose correction type based on context
        const type = this.chooseCorrectionType(context);
        // Get patterns for persona
        const patterns = this.getPatternsForPersona(context.personaId);
        // Map snake_case type to camelCase property key
        const patternKey = type === 'mid_sentence' ? 'midSentence' : type;
        const patternList = patterns[patternKey];
        if (!patternList || patternList.length === 0) {
            logger.warn({ personaId: context.personaId, type }, 'No patterns available');
            return null;
        }
        // Choose random pattern
        const pattern = seededPick(`${Date.now()}:374`, patternList) ?? patternList[0];
        // Determine placement
        const placement = this.determinePlacement(type, context);
        // Generate SSML
        const ssml = this.generateSsml(pattern, type);
        // Record usage
        this.state.usageCount++;
        this.state.lastUsageTurn = context.turnCount;
        const result = {
            type: 'self_correction',
            correctionType: type,
            content: pattern,
            ssml,
            placement,
            reason: decision.reason,
        };
        logger.debug({
            correctionType: type,
            placement,
            turn: context.turnCount,
        }, '✨ Self-correction generated');
        return result;
    }
    /**
     * Apply self-correction to response text
     */
    apply(response, correction) {
        let text = response;
        let ssml = response;
        switch (correction.placement) {
            case 'opening':
                // Insert at the very beginning
                text = `${correction.content} ${text}`;
                ssml = `${correction.ssml} ${ssml}`;
                break;
            case 'mid_sentence': {
                // Find a good mid-point to insert
                const midPoint = this.findMidSentencePoint(response);
                if (midPoint > 0) {
                    text = `${response.slice(0, midPoint)}${correction.content}${response.slice(midPoint)}`;
                    ssml = `${response.slice(0, midPoint)}${correction.ssml}${response.slice(midPoint)}`;
                }
                else {
                    // Fallback to opening
                    text = `${correction.content} ${text}`;
                    ssml = `${correction.ssml} ${ssml}`;
                }
                break;
            }
            case 'between_sentences': {
                // Find sentence boundary
                const sentenceBoundary = this.findSentenceBoundary(response);
                if (sentenceBoundary > 0) {
                    text = `${response.slice(0, sentenceBoundary)} ${correction.content} ${response.slice(sentenceBoundary)}`;
                    ssml = `${response.slice(0, sentenceBoundary)} ${correction.ssml} ${response.slice(sentenceBoundary)}`;
                }
                else {
                    text = `${correction.content} ${text}`;
                    ssml = `${correction.ssml} ${ssml}`;
                }
                break;
            }
            case 'before_key_point': {
                // Find key point marker
                const keyPoint = this.findKeyPointMarker(response);
                if (keyPoint > 0) {
                    text = `${response.slice(0, keyPoint)}${correction.content} ${response.slice(keyPoint)}`;
                    ssml = `${response.slice(0, keyPoint)}${correction.ssml} ${response.slice(keyPoint)}`;
                }
                else {
                    text = `${correction.content} ${text}`;
                    ssml = `${correction.ssml} ${ssml}`;
                }
                break;
            }
            default:
                text = `${correction.content} ${text}`;
                ssml = `${correction.ssml} ${ssml}`;
        }
        return { text, ssml };
    }
    /**
     * Reset state for new session
     */
    reset() {
        this.state = {
            usageCount: 0,
            lastUsageTurn: -999,
        };
        logger.debug('SelfCorrectionEngine reset');
    }
    /**
     * Get current state
     */
    getState() {
        return { ...this.state };
    }
    // ==========================================================================
    // PRIVATE HELPERS
    // ==========================================================================
    chooseCorrectionType(context) {
        // Restart: for beginning of complex explanations
        // Mid-sentence: for clarifications within a thought
        // Refinement: for summarizing/clarifying at the end
        const complexity = detectComplexity(context.responseText);
        // High complexity = restart (stop and reframe)
        if (complexity > 0.7 && seededChance(`${Date.now()}:496`, 0.5)) {
            return 'restart';
        }
        // Advice giving = refinement (clarify the point)
        if (context.isGivingAdvice && seededChance(`${Date.now()}:501`, 0.4)) {
            return 'refinement';
        }
        // Default distribution using seeded RNG
        const roll = seededFloat(`${Date.now()}:selfCorrection:type`);
        if (roll < 0.4)
            return 'restart';
        if (roll < 0.7)
            return 'mid_sentence';
        return 'refinement';
    }
    getPatternsForPersona(personaId) {
        const personaPatterns = PERSONA_PATTERNS[personaId];
        if (personaPatterns) {
            return {
                restart: personaPatterns.restart || DEFAULT_SELF_CORRECTION_PATTERNS.restart,
                midSentence: personaPatterns.midSentence || DEFAULT_SELF_CORRECTION_PATTERNS.midSentence,
                refinement: personaPatterns.refinement || DEFAULT_SELF_CORRECTION_PATTERNS.refinement,
            };
        }
        return DEFAULT_SELF_CORRECTION_PATTERNS;
    }
    determinePlacement(type, _context) {
        switch (type) {
            case 'restart':
                return 'opening';
            case 'mid_sentence':
                return 'mid_sentence';
            case 'refinement':
                return 'between_sentences';
            default:
                return 'opening';
        }
    }
    generateSsml(pattern, type) {
        // Add appropriate pauses and prosody for natural delivery
        switch (type) {
            case 'restart':
                return `<break time="200ms"/>${pattern}<break time="150ms"/>`;
            case 'mid_sentence':
                return `<break time="100ms"/><prosody rate="95%">${pattern}</prosody><break time="100ms"/>`;
            case 'refinement':
                return `<break time="200ms"/><prosody rate="92%">${pattern}</prosody>`;
            default:
                return pattern;
        }
    }
    findMidSentencePoint(text) {
        // Find a good mid-sentence point (after a comma or "and"/"but")
        const patterns = [
            /,\s+(?=\w)/g, // After comma
            /\s+and\s+/gi, // After "and"
            /\s+but\s+/gi, // After "but"
            /\s+so\s+/gi, // After "so"
        ];
        for (const pattern of patterns) {
            const matches = [...text.matchAll(pattern)];
            if (matches.length > 0) {
                // Choose middle match
                const midMatch = matches[Math.floor(matches.length / 2)];
                if (midMatch.index !== undefined) {
                    return midMatch.index + midMatch[0].length;
                }
            }
        }
        return -1;
    }
    findSentenceBoundary(text) {
        // Find first sentence boundary
        const match = text.match(/[.!?]\s+/);
        if (match?.index !== undefined) {
            return match.index + match[0].length;
        }
        return -1;
    }
    findKeyPointMarker(text) {
        // Find phrases that introduce key points
        const keyPointPatterns = [
            /\b(the thing is|the point is|what matters is|here's the thing)\b/i,
            /\b(I think|I believe|in my view)\b/i,
            /\b(so basically|essentially|fundamentally)\b/i,
        ];
        for (const pattern of keyPointPatterns) {
            const match = text.match(pattern);
            if (match?.index !== undefined) {
                return match.index;
            }
        }
        return -1;
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
const engines = new Map();
export function getSelfCorrectionEngine(sessionId) {
    if (!engines.has(sessionId)) {
        engines.set(sessionId, new SelfCorrectionEngine());
    }
    return engines.get(sessionId);
}
export function resetSelfCorrectionEngine(sessionId) {
    const engine = engines.get(sessionId);
    if (engine) {
        engine.reset();
        engines.delete(sessionId);
    }
}
export function resetAllSelfCorrectionEngines() {
    engines.clear();
}
export default SelfCorrectionEngine;
//# sourceMappingURL=self-correction.js.map