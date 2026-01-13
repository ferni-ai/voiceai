/**
 * Pattern Detection
 *
 * Detects patterns in user behavior that humans would miss:
 * - Weekly emotional patterns
 * - Relationship patterns
 * - Seasonal patterns
 * - Emotional cycles
 *
 * @module conversation/proactive-memory/pattern-detection
 */
import { createLogger } from '../../utils/safe-logger.js';
const logger = createLogger({ module: 'ProactiveMemory' });
// ============================================================================
// PATTERN DETECTOR
// ============================================================================
export class PatternDetector {
    patterns = [];
    // Tracking data
    topicsByDay = new Map();
    topicsByHour = new Map();
    topicsByMonth = new Map();
    emotionsByDay = new Map();
    peopleByTopic = new Map();
    emotionHistory = [];
    /**
     * Track topic for pattern detection
     */
    trackTopic(topic, timestamp) {
        const dayOfWeek = timestamp.getDay();
        const hour = timestamp.getHours();
        const month = timestamp.getMonth();
        const dayTopics = this.topicsByDay.get(dayOfWeek) || [];
        dayTopics.push(topic);
        this.topicsByDay.set(dayOfWeek, dayTopics.slice(-20));
        const hourTopics = this.topicsByHour.get(hour) || [];
        hourTopics.push(topic);
        this.topicsByHour.set(hour, hourTopics.slice(-20));
        const monthTopics = this.topicsByMonth.get(month) || [];
        monthTopics.push(topic);
        this.topicsByMonth.set(month, monthTopics.slice(-30));
    }
    /**
     * Track emotion for pattern detection
     */
    trackEmotion(emotion, timestamp) {
        const dayOfWeek = timestamp.getDay();
        const dayEmotions = this.emotionsByDay.get(dayOfWeek) || [];
        dayEmotions.push(emotion);
        this.emotionsByDay.set(dayOfWeek, dayEmotions.slice(-20));
        this.emotionHistory.push({ emotion, timestamp });
        if (this.emotionHistory.length > 50) {
            this.emotionHistory = this.emotionHistory.slice(-50);
        }
    }
    /**
     * Track people mentioned with topic
     */
    trackPeopleWithTopic(topic, people) {
        if (people.length === 0)
            return;
        const topicPeople = this.peopleByTopic.get(topic) || [];
        topicPeople.push(...people);
        this.peopleByTopic.set(topic, topicPeople.slice(-20));
    }
    /**
     * Run all pattern detection
     */
    detectPatterns() {
        this.detectDayOfWeekPatterns();
        this.detectWeeklyEmotionalPatterns();
        this.detectRelationshipPatterns();
        this.detectSeasonalPatterns();
        this.detectEmotionalCycles();
        // Keep max 10 patterns
        if (this.patterns.length > 10) {
            this.patterns.sort((a, b) => b.confidence - a.confidence);
            this.patterns = this.patterns.slice(0, 10);
        }
    }
    /**
     * Detect day-of-week topic patterns
     */
    detectDayOfWeekPatterns() {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        for (const [day, topics] of this.topicsByDay.entries()) {
            if (topics.length < 3)
                continue;
            const counts = new Map();
            for (const topic of topics) {
                counts.set(topic, (counts.get(topic) || 0) + 1);
            }
            for (const [topic, count] of counts.entries()) {
                if (count >= 3) {
                    const confidence = count / topics.length;
                    const dayName = dayNames[day];
                    const existing = this.patterns.find((p) => p.type === 'temporal' && p.description.includes(dayName || ''));
                    if (!existing && confidence > 0.5 && dayName) {
                        this.patterns.push({
                            type: 'temporal',
                            description: `${dayName}s often bring up ${topic} for you`,
                            confidence,
                            evidence: [`${count} mentions on ${dayName}s`],
                            detectedAt: new Date(),
                            acknowledged: false,
                        });
                        logger.debug({ day: dayName, topic, confidence }, '📊 Pattern detected');
                    }
                }
            }
        }
    }
    /**
     * Detect weekly emotional patterns
     */
    detectWeeklyEmotionalPatterns() {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const negativeEmotions = ['sad', 'anxious', 'stressed', 'frustrated', 'overwhelmed', 'tired'];
        const positiveEmotions = ['happy', 'excited', 'hopeful', 'calm', 'energetic', 'grateful'];
        for (const [day, emotions] of this.emotionsByDay.entries()) {
            if (emotions.length < 3)
                continue;
            let negative = 0;
            let positive = 0;
            for (const emotion of emotions) {
                if (negativeEmotions.some((e) => emotion.toLowerCase().includes(e)))
                    negative++;
                if (positiveEmotions.some((e) => emotion.toLowerCase().includes(e)))
                    positive++;
            }
            const total = negative + positive;
            if (total < 3)
                continue;
            const negativeRatio = negative / total;
            const positiveRatio = positive / total;
            const dayName = dayNames[day];
            const existing = this.patterns.find((p) => p.type === 'temporal' &&
                p.description.toLowerCase().includes(dayName?.toLowerCase() || '') &&
                p.description.includes('emotionally'));
            if (!existing && dayName) {
                if (negativeRatio > 0.6) {
                    this.patterns.push({
                        type: 'temporal',
                        description: `${dayName}s tend to be emotionally harder for you`,
                        confidence: negativeRatio,
                        evidence: [`${negative}/${total} negative emotions on ${dayName}s`],
                        detectedAt: new Date(),
                        acknowledged: false,
                    });
                }
                else if (positiveRatio > 0.6) {
                    this.patterns.push({
                        type: 'temporal',
                        description: `${dayName}s tend to be your better days`,
                        confidence: positiveRatio,
                        evidence: [`${positive}/${total} positive emotions on ${dayName}s`],
                        detectedAt: new Date(),
                        acknowledged: false,
                    });
                }
            }
        }
    }
    /**
     * Detect relationship patterns
     */
    detectRelationshipPatterns() {
        const stressTopics = ['work', 'job', 'career', 'money', 'finances', 'health'];
        const supportTopics = ['decision', 'advice', 'help', 'support'];
        for (const [topic, people] of this.peopleByTopic.entries()) {
            if (people.length < 3)
                continue;
            const personCounts = new Map();
            for (const person of people) {
                const normalized = person.toLowerCase();
                personCounts.set(normalized, (personCounts.get(normalized) || 0) + 1);
            }
            for (const [person, count] of personCounts.entries()) {
                const confidence = count / people.length;
                if (confidence > 0.4 && count >= 3) {
                    const existing = this.patterns.find((p) => p.type === 'relationship' &&
                        p.description.toLowerCase().includes(person) &&
                        p.description.toLowerCase().includes(topic));
                    if (!existing) {
                        let context = 'when talking about';
                        if (stressTopics.some((t) => topic.includes(t))) {
                            context = 'when stressed about';
                        }
                        else if (supportTopics.some((t) => topic.includes(t))) {
                            context = 'when seeking advice about';
                        }
                        this.patterns.push({
                            type: 'relationship',
                            description: `You often mention ${person} ${context} ${topic}`,
                            confidence,
                            evidence: [`${count} mentions with ${topic} topic`],
                            detectedAt: new Date(),
                            acknowledged: false,
                        });
                    }
                }
            }
        }
    }
    /**
     * Detect seasonal patterns
     */
    detectSeasonalPatterns() {
        const winterMonths = [11, 0, 1];
        const summerMonths = [5, 6, 7];
        const heavyTopics = ['depression', 'lonely', 'isolated', 'unmotivated', 'tired'];
        const lightTopics = ['excited', 'energy', 'motivation', 'happy', 'active'];
        // Check winter months
        let winterHeavy = 0;
        let winterTotal = 0;
        for (const month of winterMonths) {
            const topics = this.topicsByMonth.get(month) || [];
            winterTotal += topics.length;
            winterHeavy += topics.filter((t) => heavyTopics.some((h) => t.toLowerCase().includes(h))).length;
        }
        if (winterTotal > 5 && winterHeavy / winterTotal > 0.3) {
            const existing = this.patterns.find((p) => p.type === 'temporal' && p.description.includes('winter'));
            if (!existing) {
                this.patterns.push({
                    type: 'temporal',
                    description: 'Winter months seem to be more challenging for you emotionally',
                    confidence: winterHeavy / winterTotal,
                    evidence: [`${winterHeavy}/${winterTotal} heavy topics in winter`],
                    detectedAt: new Date(),
                    acknowledged: false,
                });
            }
        }
        // Check summer months
        let summerLight = 0;
        let summerTotal = 0;
        for (const month of summerMonths) {
            const topics = this.topicsByMonth.get(month) || [];
            summerTotal += topics.length;
            summerLight += topics.filter((t) => lightTopics.some((l) => t.toLowerCase().includes(l))).length;
        }
        if (summerTotal > 5 && summerLight / summerTotal > 0.3) {
            const existing = this.patterns.find((p) => p.type === 'temporal' && p.description.includes('summer'));
            if (!existing) {
                this.patterns.push({
                    type: 'temporal',
                    description: 'Summer tends to be a better time for you emotionally',
                    confidence: summerLight / summerTotal,
                    evidence: [`${summerLight}/${summerTotal} positive topics in summer`],
                    detectedAt: new Date(),
                    acknowledged: false,
                });
            }
        }
    }
    /**
     * Detect emotional cycles
     */
    detectEmotionalCycles() {
        if (this.emotionHistory.length < 10)
            return;
        const negativeEmotions = ['sad', 'anxious', 'stressed', 'frustrated', 'down'];
        const negativePeriods = [];
        for (const { emotion, timestamp } of this.emotionHistory) {
            if (negativeEmotions.some((e) => emotion.toLowerCase().includes(e))) {
                negativePeriods.push(timestamp);
            }
        }
        if (negativePeriods.length < 3)
            return;
        const intervals = [];
        for (let i = 1; i < negativePeriods.length; i++) {
            const prev = negativePeriods[i - 1];
            const curr = negativePeriods[i];
            if (prev && curr) {
                const daysBetween = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
                if (daysBetween > 3) {
                    intervals.push(daysBetween);
                }
            }
        }
        if (intervals.length < 2)
            return;
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
        const stdDev = Math.sqrt(variance);
        const consistency = 1 - stdDev / avgInterval;
        if (consistency > 0.5 && avgInterval > 7 && avgInterval < 60) {
            const existing = this.patterns.find((p) => p.type === 'emotional_cycle' && p.description.includes('cycle'));
            if (!existing) {
                const cycleDays = Math.round(avgInterval);
                const cycleWeeks = Math.round(avgInterval / 7);
                this.patterns.push({
                    type: 'emotional_cycle',
                    description: `You seem to have emotional ups and downs roughly every ${cycleWeeks > 1 ? `${cycleWeeks} weeks` : `${cycleDays} days`}`,
                    confidence: consistency,
                    evidence: [`Average ${cycleDays} days between harder periods`],
                    detectedAt: new Date(),
                    acknowledged: false,
                });
            }
        }
    }
    /**
     * Get all patterns
     */
    getPatterns() {
        return [...this.patterns];
    }
    /**
     * Acknowledge a pattern
     */
    acknowledgePattern(type) {
        const pattern = this.patterns.find((p) => p.type === type);
        if (pattern) {
            pattern.acknowledged = true;
        }
    }
    /**
     * Import patterns
     */
    importPatterns(patterns) {
        for (const pattern of patterns) {
            const existing = this.patterns.find((p) => p.description === pattern.description);
            if (!existing) {
                this.patterns.push({ ...pattern, acknowledged: false });
            }
        }
        logger.debug({ count: patterns.length }, 'Imported patterns');
    }
    /**
     * Export patterns
     */
    exportPatterns() {
        return this.patterns.filter((p) => p.confidence > 0.6);
    }
    /**
     * Clear all data
     */
    clear() {
        this.patterns = [];
        this.topicsByDay.clear();
        this.topicsByHour.clear();
        this.topicsByMonth.clear();
        this.emotionsByDay.clear();
        this.peopleByTopic.clear();
        this.emotionHistory = [];
    }
}
//# sourceMappingURL=pattern-detection.js.map