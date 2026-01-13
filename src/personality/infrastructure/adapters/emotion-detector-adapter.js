/**
 * EmotionDetector Adapter
 *
 * Adapts existing emotion detection to the EmotionDetector interface.
 * Provides text-based emotion detection for the v2 personality system.
 *
 * @module personality/infrastructure/adapters/emotion-detector-adapter
 */
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'EmotionDetectorAdapter' });
const EMOTION_PATTERNS = [
    // Joy patterns
    {
        keywords: [/\b(ecstatic|thrilled|overjoyed|elated)\b/i],
        emotion: 'joy',
        granular: 'ecstatic',
        intensityBoost: 0.3,
    },
    {
        keywords: [/\b(happy|glad|pleased|delighted)\b/i],
        emotion: 'joy',
        granular: 'happy',
    },
    {
        keywords: [/\b(content|satisfied|peaceful)\b/i],
        emotion: 'joy',
        granular: 'content',
        intensityBoost: -0.2,
    },
    {
        keywords: [/\b(relieved|phew|finally)\b/i],
        emotion: 'joy',
        granular: 'relieved',
    },
    {
        keywords: [/\b(proud|accomplished|achieved)\b/i],
        emotion: 'joy',
        granular: 'proud',
    },
    {
        keywords: [/\b(grateful|thankful|blessed)\b/i],
        emotion: 'joy',
        granular: 'grateful',
    },
    {
        keywords: [/\b(hopeful|optimistic|looking forward)\b/i],
        emotion: 'joy',
        granular: 'hopeful',
    },
    // Sadness patterns
    {
        keywords: [/\b(devastated|heartbroken|crushed|shattered)\b/i],
        emotion: 'sadness',
        granular: 'devastated',
        intensityBoost: 0.3,
    },
    {
        keywords: [/\b(sad|unhappy|down|blue)\b/i],
        emotion: 'sadness',
        granular: 'sad',
    },
    {
        keywords: [/\b(melancholy|wistful|bittersweet)\b/i],
        emotion: 'sadness',
        granular: 'melancholy',
    },
    {
        keywords: [/\b(disappointed|let down)\b/i],
        emotion: 'sadness',
        granular: 'disappointed',
    },
    {
        keywords: [/\b(lonely|alone|isolated)\b/i],
        emotion: 'sadness',
        granular: 'lonely',
        intensityBoost: 0.1,
    },
    {
        keywords: [/\b(grief|mourning|loss|died|passed away)\b/i],
        emotion: 'sadness',
        granular: 'grief',
        intensityBoost: 0.25,
    },
    // Fear patterns
    {
        keywords: [/\b(terrified|petrified|scared to death)\b/i],
        emotion: 'fear',
        granular: 'terrified',
        intensityBoost: 0.3,
    },
    {
        keywords: [/\b(anxious|anxiety|worried|nervous)\b/i],
        emotion: 'fear',
        granular: 'anxious',
    },
    {
        keywords: [/\b(overwhelmed|too much|can't cope|drowning)\b/i],
        emotion: 'fear',
        granular: 'overwhelmed',
        intensityBoost: 0.2,
    },
    {
        keywords: [/\b(scared|afraid|frightened)\b/i],
        emotion: 'fear',
        granular: 'nervous',
    },
    {
        keywords: [/\b(vulnerable|exposed|unsafe)\b/i],
        emotion: 'fear',
        granular: 'vulnerable',
        intensityBoost: 0.1,
    },
    // Anger patterns
    {
        keywords: [/\b(furious|enraged|livid|seething)\b/i],
        emotion: 'anger',
        granular: 'furious',
        intensityBoost: 0.3,
    },
    {
        keywords: [/\b(angry|mad|pissed)\b/i],
        emotion: 'anger',
        granular: 'angry',
    },
    {
        keywords: [/\b(frustrated|annoyed|irritated)\b/i],
        emotion: 'anger',
        granular: 'frustrated',
        intensityBoost: -0.1,
    },
    {
        keywords: [/\b(resentful|bitter)\b/i],
        emotion: 'anger',
        granular: 'resentful',
    },
    // Trust patterns
    {
        keywords: [/\b(trust|faith|believe in)\b/i],
        emotion: 'trust',
    },
    // Surprise patterns
    {
        keywords: [/\b(shocked|stunned|astonished)\b/i],
        emotion: 'surprise',
        granular: 'shocked',
        intensityBoost: 0.2,
    },
    {
        keywords: [/\b(amazed|wow|incredible)\b/i],
        emotion: 'surprise',
        granular: 'amazed',
    },
    {
        keywords: [/\b(confused|puzzled|don't understand)\b/i],
        emotion: 'surprise',
        granular: 'confused',
    },
    // Other granular emotions
    {
        keywords: [/\b(exhausted|drained|wiped out)\b/i],
        emotion: 'sadness',
        granular: 'exhausted',
    },
    {
        keywords: [/\b(bored|uninterested|meh)\b/i],
        emotion: 'neutral',
        granular: 'bored',
    },
    {
        keywords: [/\b(curious|wondering|interested)\b/i],
        emotion: 'anticipation',
        granular: 'curious',
    },
    {
        keywords: [/\b(nostalgic|remember when|miss)\b/i],
        emotion: 'sadness',
        granular: 'nostalgic',
    },
];
/**
 * First-time vulnerability markers
 */
const FIRST_TIME_MARKERS = [
    { pattern: /\b(never told|first time|nobody knows)\b/i, weight: 0.9 },
    { pattern: /\b(hard to say|difficult to admit)\b/i, weight: 0.7 },
    { pattern: /\b(um|uh|well\.{2,})\b/i, weight: 0.3 },
    { pattern: /\b(probably nothing|this is silly)\b/i, weight: 0.5 },
    { pattern: /\b(can I tell you|promise you won't)\b/i, weight: 0.6 },
    { pattern: /\b(I trust you|feel safe with you)\b/i, weight: 0.7 },
];
/**
 * Crisis signal patterns
 */
const CRISIS_PATTERNS = [
    { pattern: /\b(kill myself|want to die|end it all)\b/i, severity: 'critical' },
    { pattern: /\b(suicidal|self.?harm)\b/i, severity: 'critical' },
    { pattern: /\b(don't want to live|no point living)\b/i, severity: 'high' },
    { pattern: /\b(can't go on|can't do this anymore)\b/i, severity: 'high' },
    { pattern: /\b(hopeless|nothing matters|give up)\b/i, severity: 'moderate' },
    { pattern: /\b(panic attack|can't breathe)\b/i, severity: 'moderate' },
];
/**
 * EmotionDetectorAdapter - Text-based emotion detection
 */
export class EmotionDetectorAdapter {
    /**
     * Detect emotion from text
     */
    async detectEmotion(input) {
        const text = input.text.toLowerCase();
        const evidence = [];
        let bestMatch = {
            emotion: 'neutral',
            granular: null,
            confidence: 0.3,
            intensity: 0.3,
        };
        // Check all patterns
        for (const pattern of EMOTION_PATTERNS) {
            for (const keyword of pattern.keywords) {
                const match = text.match(keyword);
                if (match) {
                    evidence.push(`Found "${match[0]}"`);
                    const confidence = 0.6 + (pattern.intensityBoost ?? 0);
                    const intensity = 0.5 + (pattern.intensityBoost ?? 0);
                    if (confidence > bestMatch.confidence) {
                        bestMatch = {
                            emotion: pattern.emotion,
                            granular: pattern.granular ?? null,
                            confidence: Math.min(0.95, confidence),
                            intensity: Math.min(1, Math.max(0.2, intensity)),
                        };
                    }
                }
            }
        }
        // Check user vocabulary if provided
        if (input.userVocabulary) {
            for (const [word, emotion] of input.userVocabulary) {
                if (text.includes(word.toLowerCase())) {
                    evidence.push(`User vocabulary: "${word}"`);
                    if (bestMatch.confidence < 0.7) {
                        bestMatch.emotion = emotion;
                        bestMatch.confidence = 0.7;
                    }
                }
            }
        }
        // Extract associated topics
        const topics = this.extractTopics(text);
        return {
            primary: bestMatch.emotion,
            granular: bestMatch.granular,
            confidence: bestMatch.confidence,
            intensity: bestMatch.intensity,
            associatedTopics: topics,
            evidence,
        };
    }
    /**
     * Detect emotional contradictions
     */
    async detectContradiction(text, detectedEmotions) {
        // Look for explicit contradictions in text
        const contradictionPhrases = [
            /\b(but also|yet|however|at the same time|mixed feelings)\b/i,
            /\b(happy.*sad|excited.*scared|relieved.*worried)\b/i,
        ];
        const hasContradictionLanguage = contradictionPhrases.some((p) => p.test(text));
        // Check if emotions are in opposing categories
        const positiveEmotions = ['joy', 'trust', 'anticipation'];
        const negativeEmotions = ['sadness', 'anger', 'fear', 'disgust'];
        const hasPositive = detectedEmotions.some((e) => positiveEmotions.includes(e));
        const hasNegative = detectedEmotions.some((e) => negativeEmotions.includes(e));
        const detected = hasContradictionLanguage || (hasPositive && hasNegative);
        if (detected && detectedEmotions.length >= 2) {
            return {
                detected: true,
                emotions: [detectedEmotions[0], detectedEmotions[1]],
                validationPhrase: "It makes sense to feel both of those things at once.",
                confidence: hasContradictionLanguage ? 0.8 : 0.6,
            };
        }
        return {
            detected: false,
            confidence: 0.7,
        };
    }
    /**
     * Analyze emotional trajectory
     */
    async analyzeTrajectory(emotionalHistory) {
        if (emotionalHistory.length < 3) {
            return {
                trajectory: 'stable',
                confidence: 0.4,
                evidence: ['Not enough data'],
                daysAnalyzed: 0,
            };
        }
        // Calculate average valence over time
        const recentStates = emotionalHistory.slice(-10);
        const valenceScores = recentStates.map((state) => {
            if (state.isPositive)
                return 1;
            if (state.isNegative)
                return -1;
            return 0;
        });
        const firstHalfLength = Math.floor(valenceScores.length / 2) || 1;
        const secondHalfLength = valenceScores.length - firstHalfLength || 1;
        const firstHalfAvg = valenceScores.slice(0, firstHalfLength).reduce((a, b) => a + b, 0) / firstHalfLength;
        const secondHalfAvg = valenceScores.slice(firstHalfLength).reduce((a, b) => a + b, 0) / secondHalfLength;
        const diff = secondHalfAvg - firstHalfAvg;
        const evidence = [];
        // Calculate volatility
        let volatility = 0;
        for (let i = 1; i < valenceScores.length; i++) {
            volatility += Math.abs((valenceScores[i] ?? 0) - (valenceScores[i - 1] ?? 0));
        }
        let trajectory;
        if (diff > 0.3) {
            trajectory = 'improving';
            evidence.push('Recent emotions more positive than earlier');
        }
        else if (diff < -0.3) {
            trajectory = 'declining';
            evidence.push('Recent emotions more negative than earlier');
        }
        else if (volatility > 5) {
            trajectory = 'volatile';
            evidence.push('High emotional variability');
        }
        else {
            trajectory = 'stable';
            evidence.push('Consistent emotional state');
        }
        // Estimate days analyzed
        const oldest = recentStates[0]?.detectedAt ?? new Date();
        const newest = recentStates[recentStates.length - 1]?.detectedAt ?? new Date();
        const daysAnalyzed = Math.ceil((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));
        return {
            trajectory,
            confidence: Math.min(0.85, 0.5 + emotionalHistory.length * 0.05),
            evidence,
            daysAnalyzed,
        };
    }
    /**
     * Detect first-time vulnerability
     */
    async detectFirstTimeVulnerability(text, _userId) {
        const markers = [];
        let totalWeight = 0;
        for (const { pattern, weight } of FIRST_TIME_MARKERS) {
            if (pattern.test(text)) {
                const match = text.match(pattern);
                markers.push(match?.[0] ?? pattern.source);
                totalWeight += weight;
            }
        }
        const isFirstTime = totalWeight >= 0.5;
        const confidence = Math.min(0.95, totalWeight);
        // Calculate vulnerability level
        let vulnerabilityLevel = 2; // Default
        if (text.match(/\b(trauma|abuse|secret|shame)\b/i))
            vulnerabilityLevel = 5;
        else if (text.match(/\b(scared|afraid|struggling)\b/i))
            vulnerabilityLevel = 4;
        else if (text.match(/\b(worried|anxious|hard)\b/i))
            vulnerabilityLevel = 3;
        let suggestedAcknowledgment;
        if (isFirstTime) {
            suggestedAcknowledgment = "Thank you for trusting me with that. I know it wasn't easy to share.";
        }
        return {
            isFirstTime,
            confidence,
            markers,
            suggestedAcknowledgment,
            vulnerabilityLevel,
        };
    }
    /**
     * Extract topics associated with emotions
     */
    async extractEmotionalTopics(text) {
        const topicPatterns = [
            { pattern: /\b(work|job|office|boss|colleague|meeting)\b/i, topic: 'work', emotion: 'fear' },
            { pattern: /\b(family|mom|dad|parent|sibling|brother|sister)\b/i, topic: 'family' },
            { pattern: /\b(relationship|partner|boyfriend|girlfriend|spouse)\b/i, topic: 'relationship' },
            { pattern: /\b(money|bills|debt|financial|afford)\b/i, topic: 'finances', emotion: 'fear' },
            { pattern: /\b(health|sick|doctor|hospital|diagnosis)\b/i, topic: 'health', emotion: 'fear' },
            { pattern: /\b(friend|friendship|social)\b/i, topic: 'social' },
            { pattern: /\b(future|tomorrow|next year|plans)\b/i, topic: 'future' },
            { pattern: /\b(past|history|remember|used to)\b/i, topic: 'past' },
        ];
        const topics = [];
        const topicEmotionPairs = [];
        for (const { pattern, topic, emotion } of topicPatterns) {
            if (pattern.test(text)) {
                topics.push(topic);
                if (emotion) {
                    topicEmotionPairs.push({ topic, emotion, confidence: 0.5 });
                }
            }
        }
        return { topics, topicEmotionPairs };
    }
    /**
     * Detect vague emotions
     */
    async detectVagueEmotions(text) {
        const vaguePatterns = [
            {
                pattern: /\b(bad|not good|rough)\b/i,
                term: 'bad',
                suggestions: ['sad', 'anxious', 'frustrated', 'exhausted'],
                question: 'When you say bad, what does that feel like in your body?',
            },
            {
                pattern: /\b(weird|strange|off)\b/i,
                term: 'weird',
                suggestions: ['anxious', 'confused', 'vulnerable'],
                question: "What kind of 'off'? Anxious? Confused? Something else?",
            },
            {
                pattern: /\b(fine|okay|alright)\b/i,
                term: 'fine',
                suggestions: ['content', 'sad', 'exhausted'],
                question: "Sometimes 'fine' means really fine, and sometimes it doesn't. How are you really?",
            },
            {
                pattern: /\b(upset|bothered)\b/i,
                term: 'upset',
                suggestions: ['sad', 'angry', 'frustrated', 'devastated'],
                question: 'Is it more of a sad upset or an angry upset?',
            },
        ];
        const vagueTerms = [];
        const suggestedPreciseEmotions = new Map();
        const clarifyingQuestions = [];
        for (const { pattern, term, suggestions, question } of vaguePatterns) {
            if (pattern.test(text)) {
                vagueTerms.push(term);
                suggestedPreciseEmotions.set(term, suggestions);
                clarifyingQuestions.push(question);
            }
        }
        return { vagueTerms, suggestedPreciseEmotions, clarifyingQuestions };
    }
    /**
     * Detect crisis signals
     */
    async detectCrisisSignals(text) {
        const signals = [];
        let highestSeverity = 'low';
        const severityOrder = ['low', 'moderate', 'high', 'critical'];
        for (const { pattern, severity } of CRISIS_PATTERNS) {
            if (pattern.test(text)) {
                const match = text.match(pattern);
                signals.push(match?.[0] ?? 'Crisis indicator');
                if (severityOrder.indexOf(severity) > severityOrder.indexOf(highestSeverity)) {
                    highestSeverity = severity;
                }
            }
        }
        const isCrisis = highestSeverity !== 'low';
        let recommendedResponse;
        switch (highestSeverity) {
            case 'critical':
                recommendedResponse =
                    "This is serious. You're not alone in this. Can we talk about getting you some support right now?";
                break;
            case 'high':
                recommendedResponse =
                    "I hear how much pain you're in. Your feelings are valid. Let's talk about what support might help.";
                break;
            case 'moderate':
                recommendedResponse =
                    "That sounds really hard. I'm here with you. Would it help to talk more about what you're experiencing?";
                break;
            default:
                recommendedResponse = "I'm here and listening.";
        }
        return { isCrisis, severity: highestSeverity, signals, recommendedResponse };
    }
    // ============================================================================
    // PRIVATE HELPERS
    // ============================================================================
    extractTopics(text) {
        const topicPatterns = [
            { pattern: /\b(work|job|office|career)\b/i, topic: 'work' },
            { pattern: /\b(family|mom|dad|parent)\b/i, topic: 'family' },
            { pattern: /\b(relationship|partner|dating)\b/i, topic: 'relationship' },
            { pattern: /\b(health|sick|doctor)\b/i, topic: 'health' },
            { pattern: /\b(money|financial|bills)\b/i, topic: 'finances' },
            { pattern: /\b(friend|social|alone)\b/i, topic: 'social' },
        ];
        return topicPatterns.filter(({ pattern }) => pattern.test(text)).map(({ topic }) => topic);
    }
}
/**
 * Get singleton instance
 */
let instance = null;
export function getEmotionDetectorAdapter() {
    if (!instance) {
        instance = new EmotionDetectorAdapter();
    }
    return instance;
}
//# sourceMappingURL=emotion-detector-adapter.js.map