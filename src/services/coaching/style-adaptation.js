/**
 * Coaching Style Adaptation
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Different people need different coaching approaches.
 * Detects and adapts to user's preferred coaching style.
 *
 * Philosophy:
 * - Meet people where they are
 * - Style is not about us, it's about them
 * - Adapt without losing authenticity
 *
 * @module StyleAdaptation
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'StyleAdaptation' });
// ============================================================================
// IN-MEMORY STORE
// ============================================================================
const styleProfiles = new Map();
function getOrCreateProfile(userId) {
    let profile = styleProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            primaryStyle: 'supportive', // Default
            confidence: 0.3, // Low confidence until we learn more
            processingMode: 'collaborative',
            feedbackPreference: 'gentle',
            preferences: {
                pacingPreference: 'medium',
                silenceComfort: 'comfortable',
                advicePreference: 'ask_first',
                emotionalDepth: 'moderate',
                accountabilityLevel: 'moderate',
            },
            signals: [],
            lastUpdated: new Date(),
        };
        styleProfiles.set(userId, profile);
    }
    return profile;
}
// ============================================================================
// STYLE DETECTION PATTERNS
// ============================================================================
const STYLE_INDICATORS = {
    analytical: {
        patterns: [
            /what (does|do) the (data|numbers|research|evidence) (say|show)/i,
            /can you (break|break it) down/i,
            /what are (the|my) options/i,
            /pros and cons/i,
            /let me think (through|about) this/i,
        ],
        keywords: [
            'analyze',
            'framework',
            'system',
            'strategy',
            'logic',
            'data',
            'evidence',
            'research',
        ],
    },
    emotional: {
        patterns: [
            /i (feel|felt|am feeling)/i,
            /it('s| is) (hard|difficult|overwhelming)/i,
            /i just need to (talk|vent|process)/i,
            /can you just listen/i,
        ],
        keywords: ['feel', 'feeling', 'emotions', 'heart', 'sense', 'intuition', 'overwhelmed'],
    },
    action: {
        patterns: [
            /what (should|do) i do/i,
            /just tell me (what|how)/i,
            /give me (the|a) (steps|plan)/i,
            /let's (get|cut) to (it|the chase)/i,
            /what's (the|my) next (step|move)/i,
        ],
        keywords: ['do', 'action', 'step', 'next', 'now', 'quick', 'fast', 'concrete'],
    },
    reflective: {
        patterns: [
            /i('ve| have) been thinking/i,
            /let me (sit with|think about) (this|that)/i,
            /what (does this|do you think this) (mean|say)/i,
            /i need (some )?time/i,
        ],
        keywords: [
            'reflect',
            'think',
            'consider',
            'ponder',
            'meaning',
            'deeper',
            'journal',
            'meditate',
        ],
    },
    supportive: {
        patterns: [
            /i('m| am) not sure (if|what)/i,
            /is (it|that) (okay|normal)/i,
            /am i (doing|being|thinking) (this|it) (right|wrong)/i,
            /i need (some )?(reassurance|support|encouragement)/i,
        ],
        keywords: ['okay', 'normal', 'support', 'help', 'reassure', 'validate', 'understand'],
    },
    challenging: {
        patterns: [
            /be (honest|straight|direct|real) with me/i,
            /don't (sugarcoat|hold back)/i,
            /give (me|it to me) straight/i,
            /call me out/i,
            /hold me accountable/i,
        ],
        keywords: ['honest', 'direct', 'straight', 'challenge', 'push', 'accountable', 'tough'],
    },
};
// ============================================================================
// STYLE DETECTION
// ============================================================================
/**
 * Analyze a message for style indicators
 */
export function detectStyleSignals(userId, userMessage) {
    const signals = [];
    const lower = userMessage.toLowerCase();
    for (const [style, indicators] of Object.entries(STYLE_INDICATORS)) {
        // Check patterns
        for (const pattern of indicators.patterns) {
            if (pattern.test(lower)) {
                signals.push({
                    timestamp: new Date(),
                    signal: pattern.source,
                    indicatedStyle: style,
                    source: 'behavioral',
                });
            }
        }
        // Check keywords
        const keywordCount = indicators.keywords.filter((kw) => lower.includes(kw)).length;
        if (keywordCount >= 2) {
            signals.push({
                timestamp: new Date(),
                signal: `Multiple keywords: ${indicators.keywords.filter((kw) => lower.includes(kw)).join(', ')}`,
                indicatedStyle: style,
                source: 'behavioral',
            });
        }
    }
    // Store signals
    if (signals.length > 0) {
        const profile = getOrCreateProfile(userId);
        profile.signals.push(...signals);
        // Keep only last 50 signals
        if (profile.signals.length > 50) {
            profile.signals = profile.signals.slice(-50);
        }
        // Update style assessment
        updateStyleAssessment(profile);
    }
    return signals;
}
/**
 * Update style assessment based on accumulated signals
 */
function updateStyleAssessment(profile) {
    const styleCounts = {
        analytical: 0,
        emotional: 0,
        action: 0,
        reflective: 0,
        supportive: 0,
        challenging: 0,
    };
    // Count signals, weighting recent ones more heavily
    const now = Date.now();
    for (const signal of profile.signals) {
        const ageInDays = (now - signal.timestamp.getTime()) / (1000 * 60 * 60 * 24);
        const weight = ageInDays < 7 ? 2 : 1;
        styleCounts[signal.indicatedStyle] += weight;
    }
    // Find primary and secondary styles
    const sorted = Object.entries(styleCounts)
        .sort(([, a], [, b]) => b - a)
        .filter(([, count]) => count > 0);
    if (sorted.length > 0) {
        profile.primaryStyle = sorted[0][0];
        profile.secondaryStyle = sorted[1]?.[0];
        // Calculate confidence based on signal count and consistency
        const totalSignals = profile.signals.length;
        const primaryCount = styleCounts[profile.primaryStyle];
        const consistency = primaryCount / (totalSignals || 1);
        profile.confidence = Math.min(0.95, 0.3 + consistency * 0.5 + totalSignals * 0.02);
    }
    profile.lastUpdated = new Date();
    log.debug({
        userId: profile.userId,
        style: profile.primaryStyle,
        confidence: profile.confidence.toFixed(2),
    }, 'Style updated');
}
/**
 * Set explicit style preference
 */
export function setExplicitStylePreference(userId, style, preferences) {
    const profile = getOrCreateProfile(userId);
    profile.primaryStyle = style;
    profile.confidence = 0.9; // High confidence for explicit preference
    if (preferences) {
        profile.preferences = { ...profile.preferences, ...preferences };
    }
    profile.signals.push({
        timestamp: new Date(),
        signal: 'Explicit preference set',
        indicatedStyle: style,
        source: 'explicit',
    });
    log.info({ userId, style }, '⚙️ Explicit style preference set');
}
const STYLE_GUIDANCE = {
    analytical: {
        responseStyle: 'Structure responses logically. Use frameworks and step-by-step breakdowns.',
        pacing: 'Medium pace. Give them time to process data.',
        questionStyle: 'Ask clarifying, probing questions. "What evidence supports that?"',
        adviceApproach: 'Present options with pros/cons. Let them decide.',
        tone: 'Clear, precise, data-informed.',
    },
    emotional: {
        responseStyle: 'Lead with empathy. Validate feelings before moving to solutions.',
        pacing: 'Slow. Make space for feelings.',
        questionStyle: 'Feeling-focused. "How does that land for you?"',
        adviceApproach: 'Ask before advising. Process emotions first.',
        tone: 'Warm, soft, understanding.',
    },
    action: {
        responseStyle: 'Get to the point quickly. Focus on what they can DO.',
        pacing: 'Fast. Respect their time.',
        questionStyle: 'Action-oriented. "What\'s your next move?"',
        adviceApproach: 'Offer concrete steps directly.',
        tone: 'Direct, energetic, practical.',
    },
    reflective: {
        responseStyle: 'Create space for deep thinking. Offer prompts, not answers.',
        pacing: 'Very slow. Embrace silence.',
        questionStyle: 'Open-ended, philosophical. "What does this reveal about you?"',
        adviceApproach: 'Ask reflective questions. Let insights emerge.',
        tone: 'Calm, spacious, contemplative.',
    },
    supportive: {
        responseStyle: 'Heavy validation. Normalize their experience.',
        pacing: 'Medium. Check in often.',
        questionStyle: 'Gentle. "How can I support you?"',
        adviceApproach: 'Offer encouragement. Suggest gently.',
        tone: 'Nurturing, encouraging, safe.',
    },
    challenging: {
        responseStyle: 'Be direct. Point out patterns and blind spots.',
        pacing: "Medium-fast. Don't over-cushion.",
        questionStyle: 'Provocative. "Is that really true?"',
        adviceApproach: 'Challenge assumptions. Hold them accountable.',
        tone: 'Direct, honest, tough-loving.',
    },
};
/**
 * Get coaching guidance for a user's style
 */
export function getStyleGuidance(userId) {
    const profile = getOrCreateProfile(userId);
    const guidance = STYLE_GUIDANCE[profile.primaryStyle];
    return {
        ...guidance,
        style: profile.primaryStyle,
        confidence: profile.confidence,
    };
}
/**
 * Build LLM context for coaching style
 */
export function buildStyleContext(userId) {
    const profile = styleProfiles.get(userId);
    if (!profile || profile.confidence < 0.4)
        return null;
    const guidance = STYLE_GUIDANCE[profile.primaryStyle];
    const lines = [
        '[🎯 COACHING STYLE ADAPTATION]',
        `This person responds best to: ${profile.primaryStyle.toUpperCase()} coaching`,
        '',
        `Response style: ${guidance.responseStyle}`,
        `Pacing: ${guidance.pacing}`,
        `Questions: ${guidance.questionStyle}`,
        `Advice: ${guidance.adviceApproach}`,
        `Tone: ${guidance.tone}`,
    ];
    if (profile.secondaryStyle) {
        lines.push('');
        lines.push(`Secondary style: ${profile.secondaryStyle} - blend when appropriate`);
    }
    return lines.join('\n');
}
// ============================================================================
// QUERIES
// ============================================================================
export function getStyleProfile(userId) {
    return getOrCreateProfile(userId);
}
export function getPreferredStyle(userId) {
    return getOrCreateProfile(userId).primaryStyle;
}
// ============================================================================
// PERSISTENCE
// ============================================================================
export function exportStyleProfile(userId) {
    return styleProfiles.get(userId) || null;
}
export function importStyleProfile(profile) {
    profile.lastUpdated = new Date(profile.lastUpdated);
    profile.signals.forEach((s) => {
        s.timestamp = new Date(s.timestamp);
    });
    styleProfiles.set(profile.userId, profile);
    log.debug({ userId: profile.userId, style: profile.primaryStyle }, 'Imported style profile');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    detectStyleSignals,
    setExplicitStylePreference,
    getStyleGuidance,
    buildStyleContext,
    getStyleProfile,
    getPreferredStyle,
    exportStyleProfile,
    importStyleProfile,
};
//# sourceMappingURL=style-adaptation.js.map