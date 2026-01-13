/**
 * Emotion Detector
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Analyzes text for emotional content to enable empathetic responses.
 * Uses keyword matching, pattern recognition, and linguistic markers.
 *
 * Empathy starts with understanding. Before we can respond with care,
 * we need to truly *hear* what someone is feeling. This module is our
 * emotional awareness - the foundation of genuine connection.
 */
import { getLogger } from '../../utils/safe-logger.js';
// ============================================================================
// EMOTION LEXICONS
// ============================================================================
const EMOTION_KEYWORDS = {
    joy: [
        { words: ['happy', 'excited', 'thrilled', 'delighted', 'wonderful'], weight: 1.0 },
        { words: ['great', 'good', 'nice', 'pleased', 'glad', 'best'], weight: 0.7 },
        { words: ['love', 'amazing', 'fantastic', 'awesome', 'perfect'], weight: 0.9 },
        { words: ['celebrate', 'success', 'win', 'achievement', 'milestone', 'retired'], weight: 0.8 },
        { words: ['grateful', 'thankful', 'appreciate', 'blessed'], weight: 0.8 },
    ],
    sadness: [
        { words: ['sad', 'depressed', 'unhappy', 'miserable', 'devastated'], weight: 1.0 },
        { words: ['down', 'low', 'blue', 'disappointed', 'let down'], weight: 0.7 },
        { words: ['loss', 'grief', 'mourning', 'miss', 'gone', 'lost'], weight: 0.9 },
        { words: ['hopeless', 'helpless', 'empty', 'lonely', 'alone'], weight: 1.0 },
        { words: ['regret', 'remorse', 'sorry', 'wish'], weight: 0.8 },
        { words: ['lost everything', 'ruined', 'destroyed', 'passed away'], weight: 1.0 },
        { words: ['father', 'mother', 'parent', 'spouse', 'died', 'death'], weight: 0.8 }, // Bereavement context
    ],
    anger: [
        { words: ['angry', 'furious', 'enraged', 'livid', 'outraged'], weight: 1.0 },
        { words: ['mad', 'annoyed', 'irritated', 'frustrated', 'upset'], weight: 0.7 },
        { words: ['hate', 'despise', 'resent', 'bitter', 'hostile'], weight: 0.9 },
        { words: ['unfair', 'cheated', 'betrayed', 'wronged', 'scammed'], weight: 0.8 },
    ],
    fear: [
        { words: ['scared', 'terrified', 'frightened', 'petrified', 'horrified'], weight: 1.0 },
        { words: ['afraid', 'worried', 'anxious', 'nervous', 'uneasy'], weight: 0.8 },
        { words: ['panic', 'dread', 'terror', 'alarmed', 'spooked'], weight: 0.9 },
        { words: ['concerned', 'apprehensive', 'uncertain', 'insecure', 'vulnerable'], weight: 0.6 },
        { words: ['anxiety', 'stress', 'stressed', 'tense'], weight: 0.8 },
        { words: ['crash', 'crashing', 'crashed'], weight: 0.7 },
    ],
    surprise: [
        { words: ['surprised', 'shocked', 'astonished', 'amazed', 'stunned'], weight: 1.0 },
        { words: ['unexpected', 'sudden', 'wow', 'whoa', 'really'], weight: 0.6 },
        { words: ['unbelievable', 'incredible', 'mind-blowing', 'jaw-dropping'], weight: 0.8 },
    ],
    disgust: [
        { words: ['disgusted', 'revolted', 'repulsed', 'sick', 'nauseated'], weight: 1.0 },
        { words: ['gross', 'awful', 'terrible', 'horrible', 'appalling'], weight: 0.7 },
        { words: ['offensive', 'repugnant', 'vile', 'loathsome'], weight: 0.9 },
    ],
    trust: [
        { words: ['trust', 'believe', 'faith', 'confident', 'sure'], weight: 0.8 },
        { words: ['rely', 'depend', 'count on', 'safe', 'secure'], weight: 0.7 },
        { words: ['honest', 'reliable', 'loyal', 'faithful', 'trustworthy'], weight: 0.6 },
        { words: ['confidence', 'certain'], weight: 0.7 },
    ],
    anticipation: [
        { words: ['excited', 'eager', 'looking forward', "can't wait", 'anticipate'], weight: 0.9 },
        { words: ['hope', 'expect', 'await', 'planning', 'preparing'], weight: 0.6 },
        { words: ['curious', 'interested', 'wonder', 'want to know'], weight: 0.5 },
    ],
    anxiety: [
        { words: ['anxious', 'anxiety', 'nervous', 'worried', 'uneasy'], weight: 0.9 },
        { words: ['stressed', 'stress', 'tense', 'panicking', 'panic'], weight: 0.9 },
        { words: ['overwhelmed', 'frantic', 'jittery'], weight: 0.8 },
        { words: ['crash', 'crashing', 'crashed'], weight: 0.7 },
        { words: ['losing everything', 'lose everything'], weight: 0.9 },
    ],
    regret: [
        { words: ['regret', 'regrets', 'regretted', 'remorse', 'remorseful'], weight: 1.0 },
        { words: ['wish', 'should have', 'could have', 'if only'], weight: 0.8 },
        { words: ['mistake', 'wrong decision', 'bad choice'], weight: 0.7 },
    ],
    neutral: [{ words: ['okay', 'fine', 'alright', 'so-so', 'average'], weight: 0.3 }],
};
const DISTRESS_INDICATORS = [
    { pattern: /\b(help|desperate|can't cope|overwhelmed|breaking down)\b/i, weight: 1.0 },
    { pattern: /\b(crisis|emergency|urgent|immediately|asap)\b/i, weight: 0.9 },
    { pattern: /\b(scared|terrified|panicking|freaking out)\b/i, weight: 0.9 },
    { pattern: /\b(can't sleep|can't eat|can't think|can't function)\b/i, weight: 0.8 },
    { pattern: /\b(lost everything|ruined|destroyed|devastated)\b/i, weight: 0.9 },
    { pattern: /\b(don't know what to do|at my wit's end|end of my rope)\b/i, weight: 0.85 },
    {
        pattern: /\b(market (is )?crash(ing|ed)?|losing everything|retirement savings)\b/i,
        weight: 0.7,
    },
    { pattern: /\b(don't have enough|not enough saved)\b/i, weight: 0.5 },
];
const INTENSITY_MODIFIERS = {
    // Amplifiers
    very: 1.3,
    extremely: 1.5,
    incredibly: 1.5,
    absolutely: 1.4,
    totally: 1.3,
    completely: 1.4,
    really: 1.2,
    so: 1.2,
    super: 1.3,
    quite: 1.1,
    // Diminishers
    'a bit': 0.7,
    'a little': 0.7,
    slightly: 0.6,
    somewhat: 0.8,
    'kind of': 0.7,
    'sort of': 0.7,
    mildly: 0.6,
};
// ============================================================================
// DETECTION LOGIC
// ============================================================================
/**
 * Emotion Detector class
 */
export class EmotionDetector {
    emotionHistory = [];
    /**
     * Detect emotion from text
     */
    detect(text) {
        const lowerText = text.toLowerCase();
        const markers = [];
        // Check for all caps (shouting) - increases intensity
        const allCapsBoost = text === text.toUpperCase() && text.length > 3 ? 1.5 : 1.0;
        // Score each emotion
        const scores = {
            joy: 0,
            sadness: 0,
            anger: 0,
            fear: 0,
            surprise: 0,
            disgust: 0,
            trust: 0,
            anticipation: 0,
            anxiety: 0,
            regret: 0,
            neutral: 0,
        };
        // Check for negations to flip positive/negative emotions
        const negationPattern = /\b(not|n't|never|no)\s+(\w+)/gi;
        const negatedWords = new Set();
        let match;
        while ((match = negationPattern.exec(lowerText)) !== null) {
            negatedWords.add(match[2].toLowerCase());
        }
        // Check each emotion's keywords
        for (const [emotion, groups] of Object.entries(EMOTION_KEYWORDS)) {
            for (const group of groups) {
                for (const word of group.words) {
                    if (lowerText.includes(word)) {
                        // Check if this word is negated
                        const isNegated = negatedWords.has(word.split(' ')[0]);
                        if (isNegated) {
                            // Don't score positive emotions if negated
                            if (['joy', 'trust', 'anticipation'].includes(emotion)) {
                                continue;
                            }
                        }
                        scores[emotion] += group.weight;
                        markers.push(word);
                    }
                }
            }
        }
        // Apply intensity modifiers - check for phrases first, then individual words
        let intensityMultiplier = 1.0;
        // Check phrase modifiers first
        const phraseModifiers = [
            { phrase: 'a bit', value: 0.7 },
            { phrase: 'a little', value: 0.7 },
            { phrase: 'kind of', value: 0.7 },
            { phrase: 'sort of', value: 0.7 },
        ];
        for (const { phrase, value } of phraseModifiers) {
            if (lowerText.includes(phrase)) {
                intensityMultiplier *= value;
                markers.push(phrase);
            }
        }
        // Check single-word modifiers
        const singleWordModifiers = [
            'very',
            'extremely',
            'incredibly',
            'absolutely',
            'totally',
            'completely',
            'really',
            'so',
            'super',
            'quite',
            'slightly',
            'somewhat',
            'mildly',
        ];
        for (const modifier of singleWordModifiers) {
            // Count occurrences
            const regex = new RegExp(`\\b${modifier}\\b`, 'gi');
            const matches = lowerText.match(regex);
            if (matches) {
                const count = matches.length;
                const modValue = INTENSITY_MODIFIERS[modifier] || 1.0;
                // Multiply by the modifier for each occurrence
                for (let i = 0; i < count; i++) {
                    intensityMultiplier *= modValue;
                }
                markers.push(...matches);
            }
        }
        // Apply all caps boost
        intensityMultiplier *= allCapsBoost;
        // Apply to all scores
        for (const emotion of Object.keys(scores)) {
            scores[emotion] *= intensityMultiplier;
        }
        // Find primary and secondary emotions
        const sortedEmotions = Object.entries(scores)
            .sort((a, b) => b[1] - a[1])
            .filter(([_, score]) => score > 0);
        const primary = sortedEmotions[0]?.[0] || 'neutral';
        const primaryScore = sortedEmotions[0]?.[1] || 0;
        const secondary = sortedEmotions[1]?.[0];
        // Calculate distress level
        let distressLevel = 0;
        for (const indicator of DISTRESS_INDICATORS) {
            if (indicator.pattern.test(text)) {
                distressLevel = Math.max(distressLevel, indicator.weight);
                const match = text.match(indicator.pattern);
                if (match)
                    markers.push(match[0]);
            }
        }
        // Adjust distress based on negative emotions
        if (['sadness', 'fear', 'anger', 'anxiety'].includes(primary)) {
            distressLevel = Math.max(distressLevel, primaryScore * 0.5);
        }
        // Determine valence
        const valence = this.getValence(primary);
        // Calculate intensity (0-1 scale)
        const intensity = Math.min(1, primaryScore / 2);
        // Calculate confidence
        const confidence = primaryScore > 0.5 ? Math.min(1, primaryScore / 2) : 0.3;
        // Suggest appropriate tone
        const suggestedTone = this.getSuggestedTone(primary, distressLevel, intensity);
        const result = {
            primary,
            secondary,
            intensity,
            valence,
            distressLevel,
            confidence,
            markers: [...new Set(markers)],
            suggestedTone,
        };
        // Track history
        this.emotionHistory.push(result);
        if (this.emotionHistory.length > 20) {
            this.emotionHistory.shift();
        }
        getLogger().debug(`Detected emotion: ${primary} (intensity: ${intensity.toFixed(2)}, distress: ${distressLevel.toFixed(2)})`);
        return result;
    }
    /**
     * Get valence for an emotion
     */
    getValence(emotion) {
        const positive = ['joy', 'trust', 'anticipation'];
        const negative = ['sadness', 'anger', 'fear', 'disgust', 'anxiety', 'regret'];
        if (positive.includes(emotion))
            return 'positive';
        if (negative.includes(emotion))
            return 'negative';
        return 'neutral';
    }
    /**
     * Get suggested tone based on detected emotion
     */
    getSuggestedTone(emotion, distressLevel, intensity) {
        // High distress always needs gentle approach (but only for negative emotions)
        if (distressLevel > 0.7 && this.getValence(emotion) === 'negative')
            return 'gentle';
        if (distressLevel > 0.4 && this.getValence(emotion) === 'negative')
            return 'reassuring';
        // Emotion-based suggestions
        switch (emotion) {
            case 'joy':
                return intensity > 0.6 ? 'warm' : 'friendly';
            case 'anticipation':
                return intensity > 0.6 ? 'enthusiastic' : 'friendly';
            case 'sadness':
            case 'regret':
                return 'gentle';
            case 'fear':
            case 'anxiety':
                return distressLevel > 0.3 ? 'gentle' : 'reassuring';
            case 'anger':
                return 'calm';
            case 'trust':
                return intensity > 0.5 ? 'warm' : 'friendly';
            case 'surprise':
                return intensity > 0.5 ? 'enthusiastic' : 'warm';
            case 'neutral':
                return intensity < 0.1 ? 'informative' : 'calm';
            default:
                return 'measured';
        }
    }
    /**
     * Get emotional trajectory (how emotions have changed)
     */
    getEmotionalTrajectory() {
        if (this.emotionHistory.length < 3) {
            return {
                trend: 'unknown',
                averageDistress: this.emotionHistory[0]?.distressLevel || 0,
                dominantEmotion: this.emotionHistory[0]?.primary || 'neutral',
            };
        }
        // Compare first half to second half
        const mid = Math.floor(this.emotionHistory.length / 2);
        const firstHalf = this.emotionHistory.slice(0, mid);
        const secondHalf = this.emotionHistory.slice(mid);
        const firstAvgValence = this.getAverageValenceScore(firstHalf);
        const secondAvgValence = this.getAverageValenceScore(secondHalf);
        const avgDistress = this.emotionHistory.reduce((sum, e) => sum + e.distressLevel, 0) / this.emotionHistory.length;
        // Count dominant emotion
        const emotionCounts = {};
        for (const result of this.emotionHistory) {
            emotionCounts[result.primary] = (emotionCounts[result.primary] || 0) + 1;
        }
        const dominantEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0][0];
        // Determine trend
        const diff = secondAvgValence - firstAvgValence;
        let trend;
        if (diff > 0.2)
            trend = 'improving';
        else if (diff < -0.2)
            trend = 'declining';
        else
            trend = 'stable';
        return { trend, averageDistress: avgDistress, dominantEmotion };
    }
    /**
     * Convert valence to numeric score
     */
    getAverageValenceScore(results) {
        if (results.length === 0)
            return 0;
        let sum = 0;
        for (const r of results) {
            if (r.valence === 'positive')
                sum += 1;
            else if (r.valence === 'negative')
                sum -= 1;
        }
        return sum / results.length;
    }
    /**
     * Check if user needs emotional support
     */
    needsEmotionalSupport() {
        if (this.emotionHistory.length === 0)
            return false;
        const recent = this.emotionHistory.slice(-3);
        const avgDistress = recent.reduce((sum, e) => sum + e.distressLevel, 0) / recent.length;
        return avgDistress > 0.5;
    }
    /**
     * Clear emotion history
     */
    clearHistory() {
        this.emotionHistory = [];
    }
    /**
     * Enhance detection with LLM inference for ambiguous cases
     *
     * This is an optional enhancement that:
     * 1. Uses keyword detection first (fast, reliable)
     * 2. Falls back to LLM only when confidence is low
     * 3. Never blocks on LLM failure
     *
     * @param text - The user message to analyze
     * @param llmCall - Optional async function to call LLM
     * @returns Enhanced emotion result with potentially higher confidence
     */
    async detectWithLLM(text, llmCall) {
        // Get keyword-based detection first (always works)
        const keywordResult = this.detect(text);
        // If confident enough, use it directly
        if (keywordResult.confidence >= 0.7) {
            return keywordResult;
        }
        // If no LLM available, use keyword result
        if (!llmCall) {
            return keywordResult;
        }
        // For low-confidence results, enhance with LLM
        try {
            const prompt = `Analyze the emotional content of this message. Be concise.

Message: "${text.slice(0, 500)}"

Return ONLY valid JSON with no other text:
{
  "primary": "one of: joy, sadness, anger, fear, surprise, trust, anticipation, anxiety, neutral",
  "intensity": 0.0 to 1.0,
  "distressLevel": 0.0 to 1.0 (urgency of emotional support needed),
  "valence": "positive, negative, or neutral"
}`;
            const response = await llmCall(prompt);
            // Extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                getLogger().debug('LLM emotion response did not contain JSON, using keyword result');
                return keywordResult;
            }
            const llmEmotion = JSON.parse(jsonMatch[0]);
            // Validate primary emotion
            const validEmotions = [
                'joy',
                'sadness',
                'anger',
                'fear',
                'surprise',
                'disgust',
                'trust',
                'anticipation',
                'anxiety',
                'regret',
                'neutral',
            ];
            if (!validEmotions.includes(llmEmotion.primary)) {
                getLogger().debug(`LLM returned invalid emotion: ${llmEmotion.primary}, using keyword result`);
                return keywordResult;
            }
            // Merge LLM result with keyword result
            const mergedResult = {
                primary: llmEmotion.primary,
                secondary: keywordResult.secondary,
                intensity: llmEmotion.intensity ?? keywordResult.intensity,
                valence: this.parseValence(llmEmotion.valence) ?? keywordResult.valence,
                distressLevel: llmEmotion.distressLevel ?? keywordResult.distressLevel,
                confidence: 0.85, // LLM-enhanced confidence
                markers: [...keywordResult.markers, '[llm-enhanced]'],
                suggestedTone: this.getSuggestedTone(llmEmotion.primary, llmEmotion.distressLevel ?? keywordResult.distressLevel, llmEmotion.intensity ?? keywordResult.intensity),
            };
            // Track in history
            this.emotionHistory.push(mergedResult);
            if (this.emotionHistory.length > 20) {
                this.emotionHistory.shift();
            }
            getLogger().debug({
                keyword: keywordResult.primary,
                llm: mergedResult.primary,
                keywordConfidence: keywordResult.confidence.toFixed(2),
            }, 'LLM-enhanced emotion detection');
            return mergedResult;
        }
        catch (error) {
            // LLM failed - use keyword result (fail-safe)
            getLogger().debug(`LLM emotion detection failed: ${error}, using keyword result`);
            return keywordResult;
        }
    }
    /**
     * Parse valence string to Valence type
     */
    parseValence(valence) {
        if (!valence)
            return null;
        const normalized = valence.toLowerCase().trim();
        if (['positive', 'negative', 'neutral'].includes(normalized)) {
            return normalized;
        }
        return null;
    }
}
// ============================================================================
// SINGLETON
// ============================================================================
let defaultDetector = null;
/**
 * Get the default emotion detector
 */
export function getEmotionDetector() {
    if (!defaultDetector) {
        defaultDetector = new EmotionDetector();
    }
    return defaultDetector;
}
/**
 * Quick detect function
 */
export function detectEmotion(text) {
    return getEmotionDetector().detect(text);
}
export default EmotionDetector;
//# sourceMappingURL=emotion.js.map