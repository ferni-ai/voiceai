/**
 * Filler / Subvocal Pattern Analysis
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Not all fillers are equal. This module analyzes "um", "uh", "like" patterns
 * to understand what they reveal about the user's cognitive state:
 *
 * - "Um" at sentence start = gathering thoughts
 * - "Uh" mid-sentence = word-finding difficulty
 * - "Like" as quotative = storytelling mode
 * - Sudden increase in fillers = emotional content incoming
 * - Specific patterns = uncertainty, stalling, or processing
 *
 * @module FillerAnalysis
 */
import { getLogger } from '../utils/safe-logger.js';
const log = getLogger().child({ module: 'FillerAnalysis' });
// ============================================================================
// FILLER PATTERNS
// ============================================================================
const FILLER_PATTERNS = [
    {
        type: 'um',
        patterns: [/\b(um+|umm+)\b/gi],
        meanings: [
            { position: /^(um+|umm+)\b/i, meaning: 'gathering_thoughts' },
            { position: /[,\.]\s*(um+|umm+)\b/i, meaning: 'gathering_thoughts' },
            { position: /\b(um+|umm+)\b.*\b(um+|umm+)\b/i, meaning: 'emotional_processing' },
        ],
    },
    {
        type: 'uh',
        patterns: [/\b(uh+|uhh+)\b/gi],
        meanings: [
            { position: /\w+\s+(uh+|uhh+)\s+\w+/i, meaning: 'word_finding' },
            { position: /^(uh+|uhh+)\b/i, meaning: 'stalling' },
        ],
    },
    {
        type: 'like',
        patterns: [/\b(like)\b/gi],
        meanings: [
            { position: /\b(was|were|said|be)\s+like\s+['"]/i, meaning: 'storytelling' },
            { position: /\b(like)\s+(um|uh|I)/i, meaning: 'hedging' },
            { position: /,?\s+like,?\s+/i, meaning: 'hedging' },
        ],
    },
    {
        type: 'you_know',
        patterns: [/\b(you know)\b/gi],
        meanings: [
            { position: /^(you know)\b/i, meaning: 'buying_time' },
            { position: /[,\.]\s*(you know)\s*[,\.]?/i, meaning: 'hedging' },
            { position: /(you know)\s*\?/i, meaning: 'uncertain' },
        ],
    },
    {
        type: 'i_mean',
        patterns: [/\b(I mean)\b/gi],
        meanings: [
            { position: /^(I mean)\b/i, meaning: 'gathering_thoughts' },
            { position: /\.\s+(I mean)\b/i, meaning: 'hedging' },
            { position: /(I mean)\s*,?\s*(like|um|uh)/i, meaning: 'word_finding' },
        ],
    },
    {
        type: 'so',
        patterns: [/^(so)\b/gi, /[\.!?]\s+(so)\b/gi],
        meanings: [
            { position: /^(so)\s+(um|uh|like|basically)/i, meaning: 'buying_time' },
            { position: /^(so)\s+(?:the|I|we|it)/i, meaning: 'gathering_thoughts' },
        ],
    },
    {
        type: 'well',
        patterns: [/^(well)\b/gi, /[\.!?]\s+(well)\b/gi],
        meanings: [
            { position: /^(well)\s*[,\.]/i, meaning: 'stalling' },
            { position: /^(well)\s+(I|it's|that)/i, meaning: 'hedging' },
            { position: /^(well)\s+(um|uh)/i, meaning: 'uncertain' },
        ],
    },
    {
        type: 'basically',
        patterns: [/\b(basically)\b/gi],
        meanings: [
            { position: /^(basically)\b/i, meaning: 'buying_time' },
            { position: /(basically)\s*,?\s*(I|it|the)/i, meaning: 'hedging' },
        ],
    },
];
// ============================================================================
// FILLER ANALYZER
// ============================================================================
export class FillerAnalyzer {
    history = [];
    baselineFillerRate = null;
    observationCount = 0;
    maxHistory = 15;
    constructor() {
        log.debug('FillerAnalyzer initialized');
    }
    /**
     * Analyze text for filler patterns
     */
    analyze(text) {
        const instances = this.detectFillers(text);
        const words = text.split(/\s+/).filter((w) => w.length > 0);
        const wordCount = words.length;
        // Calculate filler rate
        const fillerRate = wordCount > 0 ? (instances.length / wordCount) * 100 : 0;
        // Update baseline (first 5 observations)
        this.observationCount++;
        if (this.observationCount <= 5) {
            if (this.baselineFillerRate === null) {
                this.baselineFillerRate = fillerRate;
            }
            else {
                this.baselineFillerRate =
                    (this.baselineFillerRate * (this.observationCount - 1) + fillerRate) /
                        this.observationCount;
            }
        }
        // Determine if elevated
        const elevated = this.baselineFillerRate !== null && fillerRate > this.baselineFillerRate * 1.5;
        // Find dominant type and position
        const { dominantType, dominantPosition } = this.findDominants(instances);
        // Determine pattern meaning
        const patternMeaning = this.determinePatternMeaning(instances, elevated);
        const pattern = {
            fillerRate,
            elevated,
            dominantType,
            dominantPosition,
            patternMeaning,
        };
        // Detect emotional processing
        const emotionalProcessing = elevated && instances.length >= 3;
        // Detect articulation difficulty
        const articulationDifficulty = instances.filter((i) => i.meaning === 'word_finding' || i.meaning === 'stalling').length >= 2;
        // Generate interpretation
        const interpretation = this.generateInterpretation(pattern, emotionalProcessing, articulationDifficulty);
        // Generate guidance
        const guidance = this.generateGuidance(pattern, emotionalProcessing, articulationDifficulty);
        // Confidence based on word count
        const confidence = Math.min(1, wordCount / 15);
        const result = {
            instances,
            pattern,
            interpretation,
            emotionalProcessing,
            articulationDifficulty,
            guidance,
            confidence,
        };
        // Store in history
        this.history.push(result);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        if (elevated || emotionalProcessing || articulationDifficulty) {
            log.debug({
                fillerRate: fillerRate.toFixed(1),
                elevated,
                dominantType,
                patternMeaning,
            }, '💭 Filler pattern detected');
        }
        return result;
    }
    /**
     * Get trend across recent utterances
     */
    getTrend() {
        if (this.history.length < 3) {
            return { trend: 'stable', avgRate: 0, consistentPattern: null };
        }
        const recent = this.history.slice(-5);
        const rates = recent.map((r) => r.pattern.fillerRate);
        const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
        // Trend
        const firstHalf = rates.slice(0, Math.floor(rates.length / 2));
        const secondHalf = rates.slice(Math.floor(rates.length / 2));
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        let trend;
        if (secondAvg > firstAvg * 1.3)
            trend = 'increasing';
        else if (secondAvg < firstAvg * 0.7)
            trend = 'decreasing';
        else
            trend = 'stable';
        // Consistent pattern
        const patternCounts = new Map();
        for (const r of recent) {
            patternCounts.set(r.pattern.patternMeaning, (patternCounts.get(r.pattern.patternMeaning) || 0) + 1);
        }
        let consistentPattern = null;
        const threshold = Math.ceil(recent.length / 2);
        patternCounts.forEach((count, pattern) => {
            if (count >= threshold && pattern !== 'normal' && consistentPattern === null) {
                consistentPattern = pattern;
            }
        });
        return { trend, avgRate, consistentPattern };
    }
    /**
     * Reset analyzer
     */
    reset() {
        this.history = [];
        this.baselineFillerRate = null;
        this.observationCount = 0;
        log.debug('FillerAnalyzer reset');
    }
    // ==========================================================================
    // PRIVATE HELPERS
    // ==========================================================================
    detectFillers(text) {
        const instances = [];
        for (const fillerDef of FILLER_PATTERNS) {
            for (const pattern of fillerDef.patterns) {
                let match;
                const regex = new RegExp(pattern.source, pattern.flags);
                while ((match = regex.exec(text)) !== null) {
                    const position = match.index || 0;
                    const context = this.getContext(text, position);
                    // Determine position type
                    const positionType = this.determinePosition(text, position, match[0]);
                    // Determine meaning based on context
                    let meaning = 'normal';
                    for (const meaningDef of fillerDef.meanings) {
                        if (meaningDef.position.test(context)) {
                            meaning = meaningDef.meaning;
                            break;
                        }
                    }
                    instances.push({
                        type: fillerDef.type,
                        position: positionType,
                        charPosition: position,
                        context,
                        meaning,
                    });
                }
            }
        }
        // Sort by position
        instances.sort((a, b) => a.charPosition - b.charPosition);
        return instances;
    }
    getContext(text, position, radius = 30) {
        const start = Math.max(0, position - radius);
        const end = Math.min(text.length, position + radius);
        return text.slice(start, end);
    }
    determinePosition(text, charPosition, filler) {
        const before = text.slice(0, charPosition).trim();
        const after = text.slice(charPosition + filler.length).trim();
        // Check if at sentence start
        if (before.length === 0 || /[.!?]\s*$/.test(before)) {
            return 'sentence_start';
        }
        // Check if quotative ("she was like")
        if (/\b(was|were|said|be)\s*$/.test(before) && /^['"]/.test(after)) {
            return 'quotative';
        }
        // Check if before important content (followed by strong statement)
        if (/^[,]?\s*(I|we|you|the|that|this)\s+\w+/i.test(after)) {
            return 'before_important';
        }
        // Check if stalling (multiple fillers or followed by another filler)
        if (/^[,]?\s*(um|uh|er|like|well|so)\b/i.test(after)) {
            return 'stalling';
        }
        return 'mid_thought';
    }
    findDominants(instances) {
        if (instances.length === 0) {
            return { dominantType: null, dominantPosition: null };
        }
        // Count types
        const typeCounts = new Map();
        const positionCounts = new Map();
        for (const inst of instances) {
            typeCounts.set(inst.type, (typeCounts.get(inst.type) || 0) + 1);
            positionCounts.set(inst.position, (positionCounts.get(inst.position) || 0) + 1);
        }
        // Find dominants
        let dominantType = null;
        let maxTypeCount = 0;
        typeCounts.forEach((count, type) => {
            if (count > maxTypeCount) {
                maxTypeCount = count;
                dominantType = type;
            }
        });
        let dominantPosition = null;
        let maxPosCount = 0;
        positionCounts.forEach((count, pos) => {
            if (count > maxPosCount) {
                maxPosCount = count;
                dominantPosition = pos;
            }
        });
        return { dominantType, dominantPosition };
    }
    determinePatternMeaning(instances, elevated) {
        if (instances.length === 0)
            return 'normal';
        // If elevated fillers, likely emotional processing
        if (elevated && instances.length >= 3) {
            return 'emotional_processing';
        }
        // Count meanings
        const meaningCounts = new Map();
        for (const inst of instances) {
            meaningCounts.set(inst.meaning, (meaningCounts.get(inst.meaning) || 0) + 1);
        }
        // Find dominant meaning
        let dominant = 'normal';
        let maxCount = 0;
        meaningCounts.forEach((count, meaning) => {
            if (count > maxCount && meaning !== 'normal') {
                maxCount = count;
                dominant = meaning;
            }
        });
        return dominant;
    }
    generateInterpretation(pattern, emotionalProcessing, articulationDifficulty) {
        if (emotionalProcessing) {
            return 'Elevated filler usage suggests user is processing something emotionally significant.';
        }
        if (articulationDifficulty) {
            return 'User is struggling to find words or articulate their thoughts.';
        }
        const interpretations = {
            gathering_thoughts: 'User is taking time to organize their thoughts.',
            word_finding: 'User is searching for the right words.',
            stalling: 'User may be uncertain or buying time.',
            storytelling: 'User is in storytelling/quotation mode.',
            hedging: "User is hedging or softening what they're saying.",
            emotional_processing: 'User is processing emotional content.',
            uncertain: 'User seems uncertain about what to say.',
            buying_time: 'User is buying time to think.',
            normal: 'Filler usage is within normal range.',
        };
        return interpretations[pattern.patternMeaning];
    }
    generateGuidance(pattern, emotionalProcessing, articulationDifficulty) {
        if (emotionalProcessing) {
            return 'User may be approaching difficult content. Be patient and give them space.';
        }
        if (articulationDifficulty) {
            return 'User is struggling to articulate. Don\'t rush them. You might help: "Take your time."';
        }
        const guidance = {
            gathering_thoughts: 'Give them space to collect their thoughts.',
            word_finding: "Be patient. Don't jump in to finish their sentences.",
            stalling: 'They may need encouragement or a gentle prompt.',
            storytelling: "They're engaged in narrative. Let them tell the story.",
            hedging: 'They may be uncertain. Encourage directness gently.',
            emotional_processing: 'Something significant is being processed. Be present.',
            uncertain: 'They need reassurance. Create a safe space.',
            buying_time: "They're thinking. Give them a moment.",
            normal: 'Continue conversing naturally.',
        };
        return guidance[pattern.patternMeaning];
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
import { createSessionRegistry, registerGlobalRegistry } from '../utils/session-registry.js';
const fillerAnalyzerRegistry = createSessionRegistry((sessionId) => new FillerAnalyzer(), {
    name: 'FillerAnalyzer',
    cleanup: (analyzer) => analyzer.reset(),
    verbose: false,
});
registerGlobalRegistry(fillerAnalyzerRegistry);
export function getFillerAnalyzer(sessionId) {
    return fillerAnalyzerRegistry.get(sessionId);
}
export function resetFillerAnalyzer(sessionId) {
    fillerAnalyzerRegistry.reset(sessionId);
}
export function resetAllFillerAnalyzers() {
    fillerAnalyzerRegistry.resetAll();
}
export function getActiveFillerAnalyzerCount() {
    return fillerAnalyzerRegistry.getActiveCount();
}
export default FillerAnalyzer;
//# sourceMappingURL=filler-analysis.js.map