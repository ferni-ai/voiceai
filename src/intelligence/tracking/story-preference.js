/**
 * Story Preference Learning Engine
 *
 * Learns which types of stories resonate with each user by tracking:
 * - Story characteristics (length, type, emotional depth)
 * - User engagement signals after stories
 * - Topics that trigger good story reception
 * - Personal vs educational story preference
 */
import { getLogger } from '../../utils/safe-logger.js';
// Detection patterns
const INTEREST_PATTERNS = [
    /tell me more/i,
    /that's (interesting|fascinating|amazing)/i,
    /what happened (next|then)/i,
];
const FOLLOWUP_PATTERNS = [/\?$/, /what about/i, /how (come|did|does)/i];
const EMOTIONAL_PATTERNS = [/that (makes me|got me) (feel|think)/i, /reminds me of/i];
const OWN_STORY_PATTERNS = [/\b(i|my|me)\b.*\b(once|when i|remember when)\b/i];
const TOPIC_CHANGE_PATTERNS = [/anyway|but anyway/i, /on another (note|topic)/i];
// ============================================================================
// STORY PREFERENCE ENGINE
// ============================================================================
export class StoryPreferenceEngine {
    attempts = [];
    pendingStory = null;
    sessionStoryCount = 0;
    constructor() {
        getLogger().debug('StoryPreferenceEngine initialized');
    }
    recordStory(content, topic, type, emotionalDepth) {
        const detectedType = type || this.detectStoryType(content);
        const length = this.detectLength(content);
        const depth = emotionalDepth || this.detectDepth(content);
        const attempt = {
            id: `story_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date(),
            type: detectedType,
            length,
            emotionalDepth: depth,
            topic,
            preview: content.slice(0, 100),
        };
        this.attempts.push(attempt);
        this.pendingStory = attempt;
        this.sessionStoryCount++;
        if (this.attempts.length > 50) {
            this.attempts = this.attempts.slice(-50);
        }
        getLogger().debug({ type: detectedType, length, depth, topic }, 'Story recorded');
        return attempt.id;
    }
    detectStoryType(content) {
        const lower = content.toLowerCase();
        if (/\b(i remember|back when i|in my|my (early|younger|first))\b/.test(lower))
            return 'personal';
        if (/\b(client|someone i (know|worked with))\b/.test(lower))
            return 'client';
        if (/\b(in (19|20)\d\d|back in|historically)\b/.test(lower))
            return 'historical';
        if (/\b(think of it like|imagine|it's like)\b/.test(lower))
            return 'metaphorical';
        if (/\b(here's how|let me explain)\b/.test(lower))
            return 'educational';
        if (/\b(success|made it|turned it around)\b/.test(lower))
            return 'inspirational';
        if (/\b(learned the hard way|mistake|lost|warning)\b/.test(lower))
            return 'cautionary';
        return 'personal';
    }
    detectLength(content) {
        const words = content.split(/\s+/).length;
        if (words < 50)
            return 'brief';
        if (words < 150)
            return 'medium';
        return 'detailed';
    }
    detectDepth(content) {
        const lower = content.toLowerCase();
        const emotionalWords = ['feel', 'felt', 'heart', 'scared', 'proud', 'love', 'afraid'];
        const count = emotionalWords.filter((w) => lower.includes(w)).length;
        if (count >= 4)
            return 'deep';
        if (count >= 2)
            return 'moderate';
        return 'light';
    }
    analyzeEngagement(userResponse) {
        if (!this.pendingStory)
            return null;
        const engagement = {
            responseLength: this.categorizeLength(userResponse),
            askedFollowUp: FOLLOWUP_PATTERNS.some((p) => p.test(userResponse)),
            sharedOwn: OWN_STORY_PATTERNS.some((p) => p.test(userResponse)),
            emotionalResponse: EMOTIONAL_PATTERNS.some((p) => p.test(userResponse)),
            changedTopic: TOPIC_CHANGE_PATTERNS.some((p) => p.test(userResponse)),
            expressedInterest: this.extractInterestPhrases(userResponse),
        };
        this.pendingStory.userEngagement = engagement;
        this.pendingStory.engagementTimestamp = new Date();
        this.pendingStory = null;
        getLogger().debug({ engagement }, 'Story engagement analyzed');
        return engagement;
    }
    categorizeLength(response) {
        const words = response.split(/\s+/).length;
        if (words < 10)
            return 'short';
        if (words < 40)
            return 'medium';
        return 'long';
    }
    extractInterestPhrases(response) {
        const phrases = [];
        for (const pattern of INTEREST_PATTERNS) {
            const match = response.match(pattern);
            if (match)
                phrases.push(match[0]);
        }
        return phrases;
    }
    calculatePreferences() {
        const typeScores = {
            personal: 0.5,
            client: 0.5,
            historical: 0.5,
            metaphorical: 0.5,
            educational: 0.5,
            inspirational: 0.5,
            cautionary: 0.5,
        };
        const typeAttempts = {
            personal: [],
            client: [],
            historical: [],
            metaphorical: [],
            educational: [],
            inspirational: [],
            cautionary: [],
        };
        const lengthScores = { brief: [], medium: [], detailed: [] };
        const depthScores = { light: [], moderate: [], deep: [] };
        const goodTopics = new Set();
        const badTopics = new Set();
        let sharesCount = 0, asksCount = 0, totalEngaged = 0, totalScore = 0;
        for (const attempt of this.attempts) {
            typeAttempts[attempt.type].push(attempt);
            if (attempt.userEngagement) {
                totalEngaged++;
                const score = this.engagementToScore(attempt.userEngagement);
                totalScore += score;
                lengthScores[attempt.length].push(score);
                depthScores[attempt.emotionalDepth].push(score);
                if (score >= 0.7)
                    goodTopics.add(attempt.topic);
                else if (score < 0.4)
                    badTopics.add(attempt.topic);
                if (attempt.userEngagement.sharedOwn)
                    sharesCount++;
                if (attempt.userEngagement.askedFollowUp)
                    asksCount++;
            }
        }
        for (const [type, attempts] of Object.entries(typeAttempts)) {
            const engaged = attempts.filter((a) => a.userEngagement);
            if (engaged.length >= 2) {
                const avg = engaged.reduce((sum, a) => sum + this.engagementToScore(a.userEngagement), 0) /
                    engaged.length;
                typeScores[type] = avg;
            }
        }
        const preferredLength = this.findBestOption(lengthScores) || 'medium';
        const preferredDepth = this.findBestOption(depthScores) || 'moderate';
        const bestTypes = Object.entries(typeScores)
            .filter(([_, score]) => score >= 0.6)
            .sort((a, b) => b[1] - a[1])
            .map(([type]) => type);
        const averageEngagement = totalEngaged > 0 ? totalScore / totalEngaged : 0.5;
        return {
            typeScores,
            preferredLength,
            preferredDepth,
            goodTopics: Array.from(goodTopics),
            badTopics: Array.from(badTopics),
            sharesTrigger: sharesCount >= 2,
            asksTrigger: asksCount >= 2,
            totalAttempts: this.attempts.length,
            averageEngagement,
            likesStories: averageEngagement >= 0.55,
            bestTypes,
        };
    }
    engagementToScore(engagement) {
        let score = 0.5;
        if (engagement.responseLength === 'long')
            score += 0.2;
        else if (engagement.responseLength === 'medium')
            score += 0.1;
        if (engagement.askedFollowUp)
            score += 0.2;
        if (engagement.sharedOwn)
            score += 0.15;
        if (engagement.emotionalResponse)
            score += 0.1;
        if (engagement.expressedInterest.length > 0)
            score += 0.1;
        if (engagement.changedTopic)
            score -= 0.3;
        if (engagement.responseLength === 'short' && !engagement.expressedInterest.length)
            score -= 0.1;
        return Math.max(0, Math.min(1, score));
    }
    findBestOption(scores) {
        let best = null;
        let bestAvg = 0;
        for (const [option, values] of Object.entries(scores)) {
            if (values.length >= 2) {
                const avg = values.reduce((a, b) => a + b, 0) / values.length;
                if (avg > bestAvg) {
                    bestAvg = avg;
                    best = option;
                }
            }
        }
        return best;
    }
    getStoryGuidance(currentTopic, currentEmotion, turnCount) {
        const prefs = this.calculatePreferences();
        if ((turnCount || 0) < 4) {
            return {
                shouldTellStory: false,
                avoidTypes: [],
                contextNote: 'Too early for a story',
                confidence: 0.7,
            };
        }
        if (this.sessionStoryCount >= 3) {
            return {
                shouldTellStory: false,
                avoidTypes: [],
                contextNote: 'Already shared several stories',
                confidence: 0.6,
            };
        }
        if (!prefs.likesStories) {
            return {
                shouldTellStory: false,
                avoidTypes: Object.keys(prefs.typeScores),
                contextNote: 'User prefers direct info',
                confidence: 0.75,
            };
        }
        if (prefs.badTopics.includes(currentTopic)) {
            return {
                shouldTellStory: false,
                avoidTypes: [],
                contextNote: `User prefers facts for "${currentTopic}"`,
                confidence: 0.7,
            };
        }
        let recommendedType = prefs.bestTypes[0] || 'personal';
        let recommendedDepth = prefs.preferredDepth;
        if (currentEmotion === 'anxiety' || currentEmotion === 'fear') {
            recommendedType = prefs.typeScores.cautionary > 0.5 ? 'cautionary' : 'inspirational';
        }
        else if (currentEmotion === 'sadness') {
            recommendedType = 'inspirational';
            recommendedDepth = 'deep';
        }
        const avoidTypes = Object.entries(prefs.typeScores)
            .filter(([_, score]) => score < 0.4)
            .map(([type]) => type);
        return {
            shouldTellStory: true,
            recommendedType,
            recommendedLength: prefs.preferredLength,
            recommendedDepth,
            avoidTypes,
            contextNote: prefs.goodTopics.includes(currentTopic)
                ? `User engages well with "${currentTopic}" stories`
                : undefined,
            confidence: prefs.averageEngagement,
        };
    }
    formatGuidanceForPrompt() {
        const prefs = this.calculatePreferences();
        const lines = [];
        if (!prefs.likesStories) {
            lines.push('[STORIES] User prefers direct answers. Keep narratives brief.');
        }
        else {
            lines.push(`[STORIES] User engages well with stories (${(prefs.averageEngagement * 100).toFixed(0)}%).`);
            if (prefs.bestTypes.length > 0)
                lines.push(`Best types: ${prefs.bestTypes.slice(0, 2).join(', ')}`);
            lines.push(`Preferred: ${prefs.preferredLength}, ${prefs.preferredDepth} depth`);
            if (prefs.sharesTrigger)
                lines.push('User shares their own stories - encourage this.');
        }
        return lines.join(' ');
    }
    reset() {
        this.sessionStoryCount = 0;
        this.pendingStory = null;
        getLogger().debug('StoryPreferenceEngine session reset');
    }
    getSessionStats() {
        return { storiesTold: this.sessionStoryCount, pendingEngagement: this.pendingStory !== null };
    }
}
// Singleton management
const engines = new Map();
export function getStoryPreference(userId) {
    if (!engines.has(userId))
        engines.set(userId, new StoryPreferenceEngine());
    return engines.get(userId);
}
export function removeStoryPreference(userId) {
    engines.delete(userId);
}
//# sourceMappingURL=story-preference.js.map