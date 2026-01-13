/**
 * Subconscious Goal Detection System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detecting what users want but haven't articulated - the desires that
 * emerge through patterns across multiple conversations.
 *
 * "You've mentioned wanting more creative work in three different
 * conversations now. I wonder if that's trying to tell you something."
 *
 * This is superhuman because it requires tracking subtle signals across
 * time that even the person themselves may not consciously recognize.
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'SubconsciousGoals' });
// ============================================================================
// DETECTION PATTERNS
// ============================================================================
const DESIRE_PATTERNS = [
    // Career desires
    {
        patterns: [
            /wish\s+i\s+(could|had|was)/i,
            /i('d| would)\s+(love|want)\s+to\s+.*(work|career|job)/i,
            /dream\s+(job|career|role)/i,
            /if\s+only\s+i\s+could\s+.*(work|do|be)/i,
        ],
        category: 'career',
        goalTemplate: 'career change or professional growth',
    },
    // Creative desires
    {
        patterns: [
            /i('ve| have)\s+(always\s+)?wanted\s+to\s+(write|paint|create|make|design)/i,
            /should\s+(start|try)\s+(writing|painting|creating|making)/i,
            /creative\s+(outlet|expression|work)/i,
            /i\s+used\s+to\s+(write|paint|create|draw|play)/i,
        ],
        category: 'creative',
        goalTemplate: 'more creative expression',
    },
    // Relationship desires
    {
        patterns: [
            /i\s+(just\s+)?want\s+(someone|somebody|a\s+person)/i,
            /looking\s+for\s+(love|connection|partner)/i,
            /i\s+miss\s+having\s+(someone|a\s+partner|companionship)/i,
            /wish\s+.*(closer|better)\s+(relationship|connection)/i,
        ],
        category: 'relationship',
        goalTemplate: 'deeper connection or relationship',
    },
    // Self/identity desires
    {
        patterns: [
            /who\s+(am\s+)?i\s+(really|actually)/i,
            /find(ing)?\s+myself/i,
            /figure\s+out\s+who\s+i\s+(am|want\s+to\s+be)/i,
            /i\s+don't\s+(know|understand)\s+(myself|who\s+i)/i,
        ],
        category: 'self',
        goalTemplate: 'self-discovery and identity',
    },
    // Freedom/lifestyle desires
    {
        patterns: [
            /i\s+(just\s+)?want\s+(to\s+be\s+)?free/i,
            /escape\s+(from|this)/i,
            /start\s+(over|fresh|new)/i,
            /different\s+(kind\s+of\s+)?life/i,
            /simpler\s+(life|way)/i,
        ],
        category: 'lifestyle',
        goalTemplate: 'major lifestyle change',
    },
    // Financial freedom
    {
        patterns: [
            /financial\s+freedom/i,
            /not\s+worry\s+about\s+money/i,
            /retire\s+(early|young)/i,
            /quit\s+(my\s+)?(job|work)\s+and/i,
        ],
        category: 'financial',
        goalTemplate: 'financial independence',
    },
    // Health/wellness desires
    {
        patterns: [
            /take\s+better\s+care\s+of\s+(myself|my\s+(body|health))/i,
            /i\s+need\s+to\s+(get\s+)?health(y|ier)/i,
            /wish\s+i\s+(had\s+more\s+)?energy/i,
            /peace\s+of\s+mind/i,
        ],
        category: 'health',
        goalTemplate: 'better health and wellbeing',
    },
];
const FANTASY_PATTERNS = [
    /what\s+if\s+i\s+(just\s+)?(quit|left|dropped|walked)/i,
    /sometimes\s+i\s+(imagine|fantasize|dream|think\s+about)/i,
    /i\s+wonder\s+what\s+(would|it\s+would\s+be\s+like)/i,
    /wouldn't\s+it\s+be\s+(nice|great|amazing|wonderful)/i,
    /i\s+keep\s+thinking\s+about/i,
];
const CONTRADICTION_SIGNALS = [
    { stated: /i('m| am)\s+(happy|fine|good|okay)\s+(with|at|in)/i, signal: 'contentment' },
    { stated: /i\s+love\s+my\s+(job|work|career)/i, signal: 'job satisfaction' },
    { stated: /i\s+don't\s+(need|want)\s+(more|anything|change)/i, signal: 'satisfaction' },
];
// ============================================================================
// STORAGE
// ============================================================================
const profiles = new Map();
/**
 * Get or create subconscious profile
 */
export function getSubconsciousProfile(userId) {
    let profile = profiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            emergingDesires: [],
            contradictions: [],
            recurringThemes: [],
            fantasies: [],
            unresolvedQuestions: [],
            metadata: {
                totalConversations: 0,
                lastUpdated: new Date(),
                confidence: 0,
            },
        };
        profiles.set(userId, profile);
    }
    return profile;
}
/**
 * Analyze message for subconscious signals
 */
export function analyzeSubconscious(userId, text, topics, emotionIntensity) {
    const profile = getSubconsciousProfile(userId);
    const analysis = {
        newDesires: [],
        reinforcedDesires: [],
        fantasyDetected: false,
        fantasyContent: null,
        contradictionDetected: null,
        surfaceOpportunity: {
            shouldSurface: false,
            desire: null,
            phrase: null,
        },
    };
    // ========== DETECT DESIRES ==========
    for (const { patterns, category, goalTemplate } of DESIRE_PATTERNS) {
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                // Check if we already have this desire
                const existingDesire = profile.emergingDesires.find((d) => d.category === category && calculateSimilarity(d.goal, goalTemplate) > 0.5);
                if (existingDesire) {
                    // Reinforce existing desire
                    existingDesire.evidence.push({
                        quote: text.substring(0, 200),
                        timestamp: new Date(),
                        topic: topics[0] || 'general',
                        emotionIntensity,
                    });
                    existingDesire.signalCount++;
                    existingDesire.lastSignal = new Date();
                    existingDesire.confidence = Math.min(0.95, existingDesire.confidence + 0.1);
                    analysis.reinforcedDesires.push(existingDesire);
                }
                else {
                    // New desire detected
                    const newDesire = {
                        id: `desire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        goal: refineGoal(goalTemplate, text, match[0]),
                        category,
                        evidence: [
                            {
                                quote: text.substring(0, 200),
                                timestamp: new Date(),
                                topic: topics[0] || 'general',
                                emotionIntensity,
                            },
                        ],
                        confidence: 0.3 + emotionIntensity * 0.2,
                        firstDetected: new Date(),
                        lastSignal: new Date(),
                        signalCount: 1,
                        surfacing: {
                            strategy: 'when_ready',
                            optimalMoment: 'When they bring up a related topic',
                            hasBeenSurfaced: false,
                        },
                    };
                    profile.emergingDesires.push(newDesire);
                    analysis.newDesires.push({
                        goal: newDesire.goal,
                        category,
                        evidence: match[0],
                        confidence: newDesire.confidence,
                    });
                    log.info({ userId, goal: newDesire.goal }, '🌱 New emerging desire detected');
                }
                break; // One match per category per message
            }
        }
    }
    // ========== DETECT FANTASIES ==========
    for (const pattern of FANTASY_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            analysis.fantasyDetected = true;
            analysis.fantasyContent = text.substring(0, 200);
            // Determine category
            let category = 'lifestyle';
            if (/job|work|career/i.test(text))
                category = 'career';
            if (/money|rich|afford/i.test(text))
                category = 'financial';
            if (/love|relationship|partner/i.test(text))
                category = 'relationship';
            profile.fantasies.push({
                statement: text.substring(0, 200),
                timestamp: new Date(),
                category,
                emotionIntensity,
            });
            break;
        }
    }
    // ========== DETECT RECURRING THEMES ==========
    for (const topic of topics) {
        const existing = profile.recurringThemes.find((t) => calculateSimilarity(t.theme, topic) > 0.6);
        if (existing) {
            existing.occurrences.push({
                date: new Date(),
                context: text.substring(0, 100),
                emotionIntensity,
            });
            existing.frequency =
                existing.occurrences.length / Math.max(1, profile.metadata.totalConversations);
        }
        else if (topic.length > 3) {
            profile.recurringThemes.push({
                theme: topic,
                occurrences: [
                    {
                        date: new Date(),
                        context: text.substring(0, 100),
                        emotionIntensity,
                    },
                ],
                possibleMeaning: inferThemeMeaning(topic),
                frequency: 1,
            });
        }
    }
    // ========== DETECT QUESTIONS ==========
    const questionMatch = text.match(/\?\s*$/);
    if (questionMatch) {
        const questionText = text.replace(/\?\s*$/, '').trim();
        const existing = profile.unresolvedQuestions.find((q) => calculateSimilarity(q.question, questionText) > 0.7);
        if (existing) {
            existing.timesAsked++;
            existing.lastAsked = new Date();
        }
        else if (questionText.length > 10) {
            profile.unresolvedQuestions.push({
                question: questionText,
                timesAsked: 1,
                lastAsked: new Date(),
                possibleUnderlying: inferQuestionMeaning(questionText),
            });
        }
    }
    // ========== SURFACE OPPORTUNITY ==========
    analysis.surfaceOpportunity = checkSurfaceOpportunity(profile, topics, emotionIntensity);
    // Update metadata
    profile.metadata.lastUpdated = new Date();
    profile.metadata.confidence = Math.min(0.9, profile.emergingDesires.length * 0.1 +
        profile.recurringThemes.filter((t) => t.occurrences.length > 2).length * 0.1);
    return analysis;
}
/**
 * Calculate text similarity (simple Jaccard)
 */
function calculateSimilarity(a, b) {
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
}
/**
 * Refine goal statement based on context
 */
function refineGoal(template, fullText, match) {
    // Try to extract more specific goal from text
    const specificPatterns = [
        /want\s+to\s+(.{10,50})/i,
        /wish\s+i\s+could\s+(.{10,50})/i,
        /dream\s+of\s+(.{10,30})/i,
        /hope\s+to\s+(.{10,30})/i,
    ];
    for (const pattern of specificPatterns) {
        const specificMatch = fullText.match(pattern);
        if (specificMatch) {
            return specificMatch[1].replace(/[.,!?].*$/, '').trim();
        }
    }
    return template;
}
/**
 * Infer meaning from recurring theme
 */
function inferThemeMeaning(theme) {
    const themeMeanings = {
        work: 'Possible career dissatisfaction or ambition',
        family: 'Family dynamics are on their mind',
        money: 'Financial concerns or goals',
        relationship: 'Seeking connection or relationship attention',
        health: 'Health awareness or concerns',
        future: 'Anxiety about or planning for the future',
        past: 'Processing past experiences',
        change: 'Ready for transformation',
    };
    for (const [key, meaning] of Object.entries(themeMeanings)) {
        if (theme.toLowerCase().includes(key)) {
            return meaning;
        }
    }
    return `This topic carries significance for them`;
}
/**
 * Infer underlying meaning of repeated questions
 */
function inferQuestionMeaning(question) {
    if (/should\s+i/i.test(question)) {
        return 'Seeking permission or validation';
    }
    if (/what\s+(would|should)\s+you/i.test(question)) {
        return 'Wanting outside perspective';
    }
    if (/why\s+(do|did|does)/i.test(question)) {
        return 'Seeking understanding or explanation';
    }
    if (/how\s+do\s+i/i.test(question)) {
        return 'Seeking guidance or method';
    }
    return 'Unresolved concern or curiosity';
}
/**
 * Check if we should surface an insight
 */
function checkSurfaceOpportunity(profile, currentTopics, emotionIntensity) {
    // Look for desires ready to surface
    const readyDesires = profile.emergingDesires.filter((d) => d.signalCount >= 3 &&
        d.confidence > 0.6 &&
        !d.surfacing.hasBeenSurfaced &&
        d.surfacing.strategy !== 'never');
    if (readyDesires.length === 0) {
        return { shouldSurface: false, desire: null, phrase: null };
    }
    // Find best match for current context
    const matchingDesire = readyDesires.find((d) => currentTopics.some((t) => d.category.toLowerCase().includes(t.toLowerCase()) ||
        t.toLowerCase().includes(d.category.toLowerCase()) ||
        d.evidence.some((e) => e.topic.toLowerCase().includes(t.toLowerCase()))));
    if (matchingDesire) {
        return {
            shouldSurface: emotionIntensity < 0.7, // Don't surface during high emotion
            desire: matchingDesire,
            phrase: generateSurfacePhrase(matchingDesire),
        };
    }
    // Otherwise, surface most confident if > 5 signals
    const mostConfident = readyDesires.sort((a, b) => b.confidence - a.confidence)[0];
    if (mostConfident.signalCount >= 5) {
        return {
            shouldSurface: true,
            desire: mostConfident,
            phrase: generateSurfacePhrase(mostConfident),
        };
    }
    return { shouldSurface: false, desire: null, phrase: null };
}
/**
 * Generate a natural phrase to surface the insight
 */
function generateSurfacePhrase(desire) {
    const phrases = [
        `You've mentioned ${desire.goal} a few times now. I wonder if that's trying to tell you something.`,
        `I've noticed a pattern—you keep coming back to ${desire.goal}. What draws you to that?`,
        `Something I've been noticing: ${desire.goal} seems to be on your mind. Want to explore that?`,
        `I'm curious about something. ${desire.goal} has come up in several of our conversations. Is there something there?`,
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
/**
 * Record user reaction when we surface an insight
 */
export function recordSurfaceReaction(userId, desireId, reaction) {
    const profile = getSubconsciousProfile(userId);
    const desire = profile.emergingDesires.find((d) => d.id === desireId);
    if (desire) {
        desire.surfacing.hasBeenSurfaced = true;
        desire.surfacing.surfacedAt = new Date();
        desire.surfacing.userReaction = reaction;
        if (reaction === 'rejected') {
            desire.confidence *= 0.5;
            desire.surfacing.strategy = 'never';
        }
        else if (reaction === 'resonated') {
            desire.confidence = Math.min(0.95, desire.confidence + 0.2);
        }
        log.info({ userId, desireId, reaction }, '💭 Surface reaction recorded');
    }
}
// ============================================================================
// PROMPT FORMATTING
// ============================================================================
/**
 * Format subconscious insights for prompt
 */
export function formatSubconsciousForPrompt(userId, analysis) {
    const lines = [];
    if (analysis.newDesires.length > 0 || analysis.reinforcedDesires.length > 0) {
        lines.push('[SUBCONSCIOUS AWARENESS]');
    }
    if (analysis.reinforcedDesires.length > 0) {
        const desire = analysis.reinforcedDesires[0];
        lines.push(`Pattern detected: ${desire.goal} (signal #${desire.signalCount})`);
    }
    if (analysis.fantasyDetected) {
        lines.push('They shared a "what if" fantasy - this often reveals true desires.');
    }
    if (analysis.surfaceOpportunity.shouldSurface && analysis.surfaceOpportunity.phrase) {
        lines.push(`Consider surfacing: "${analysis.surfaceOpportunity.phrase}"`);
    }
    return lines.length > 0 ? lines.join('\n') : null;
}
/**
 * Get summary of subconscious profile
 */
export function getSubconsciousSummary(userId) {
    const profile = getSubconsciousProfile(userId);
    if (profile.emergingDesires.length === 0) {
        return null;
    }
    const lines = ['[DEEP PATTERNS DETECTED]'];
    // Top desires
    const topDesires = profile.emergingDesires
        .filter((d) => d.confidence > 0.5)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 3);
    if (topDesires.length > 0) {
        lines.push('Recurring themes in their words:');
        for (const desire of topDesires) {
            lines.push(`- ${desire.goal} (${desire.signalCount} signals)`);
        }
    }
    // Recurring questions
    const repeatQuestions = profile.unresolvedQuestions.filter((q) => q.timesAsked >= 2);
    if (repeatQuestions.length > 0) {
        lines.push(`Questions they keep asking: ${repeatQuestions[0].question}`);
        lines.push(`Possible underlying: ${repeatQuestions[0].possibleUnderlying}`);
    }
    return lines.length > 1 ? lines.join('\n') : null;
}
// ============================================================================
// IMPORT/EXPORT (for persistence)
// ============================================================================
/**
 * Import a subconscious profile into memory (for persistence)
 */
export function importSubconsciousProfile(profile) {
    profiles.set(profile.userId, profile);
}
// ============================================================================
// RESET (for testing)
// ============================================================================
/**
 * Reset all subconscious goals state (for testing)
 */
export function resetSubconsciousGoals() {
    profiles.clear();
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    getSubconsciousProfile,
    analyzeSubconscious,
    recordSurfaceReaction,
    formatSubconsciousForPrompt,
    getSubconsciousSummary,
    resetSubconsciousGoals,
};
//# sourceMappingURL=subconscious.js.map