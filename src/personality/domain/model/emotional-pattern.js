/**
 * EmotionalPattern Entity
 *
 * Represents a detected pattern in the user's emotional life.
 * SUPERHUMAN: We notice patterns they don't notice themselves.
 *
 * "I've noticed you seem more stressed when work comes up lately"
 * "Every Sunday evening you seem to get anxious"
 *
 * @module personality/domain/model/emotional-pattern
 */
/**
 * Configuration for pattern detection
 */
const PATTERN_CONFIG = {
    /** Minimum occurrences to confirm a pattern */
    minOccurrences: 3,
    /** Confidence threshold for surfacing */
    surfaceThreshold: 0.6,
    /** High confidence threshold */
    highConfidenceThreshold: 0.8,
    /** Days between allowed surfacing of same pattern */
    cooldownDays: 7,
};
/**
 * EmotionalPattern Entity
 *
 * Tracks a specific emotional pattern we've detected.
 * Has identity (id) and lifecycle (created, updated, surfaced).
 *
 * @example
 * ```typescript
 * const pattern = EmotionalPattern.create({
 *   userId: 'user_123',
 *   patternType: 'topic_emotion',
 *   description: 'work → stress',
 *   triggers: ['work', 'job', 'boss'],
 *   resultingEmotion: 'fear',
 *   resultingGranular: 'anxious',
 * });
 *
 * pattern.addEvidence({
 *   timestamp: new Date(),
 *   context: 'User mentioned upcoming deadline',
 *   emotion: 'fear',
 *   granular: 'anxious',
 *   intensity: 0.7,
 *   topics: ['work', 'deadline'],
 * });
 *
 * if (pattern.isReady ToSurface) {
 *   // Gently share this insight
 * }
 * ```
 */
export class EmotionalPattern {
    id;
    userId;
    patternType;
    description;
    triggers;
    resultingEmotion;
    resultingGranular;
    _evidence;
    _confidence;
    deliveryTiming;
    insightToShare;
    _surfaced;
    _lastSurfacedAt;
    _surfaceCount;
    createdAt;
    _updatedAt;
    constructor(
    /** Unique pattern ID */
    id, 
    /** User this pattern belongs to */
    userId, 
    /** Type of pattern */
    patternType, 
    /** Human-readable description */
    description, 
    /** Triggers (topics, times, people, etc.) */
    triggers, 
    /** Resulting emotion */
    resultingEmotion, 
    /** Granular emotion */
    resultingGranular, 
    /** Evidence supporting this pattern */
    _evidence, 
    /** Pattern confidence (0-1) */
    _confidence, 
    /** When to surface */
    deliveryTiming, 
    /** Insight to share with user */
    insightToShare, 
    /** Has this been surfaced to the user? */
    _surfaced, 
    /** When it was last surfaced */
    _lastSurfacedAt, 
    /** How many times surfaced */
    _surfaceCount, 
    /** Created timestamp */
    createdAt, 
    /** Last updated timestamp */
    _updatedAt) {
        this.id = id;
        this.userId = userId;
        this.patternType = patternType;
        this.description = description;
        this.triggers = triggers;
        this.resultingEmotion = resultingEmotion;
        this.resultingGranular = resultingGranular;
        this._evidence = _evidence;
        this._confidence = _confidence;
        this.deliveryTiming = deliveryTiming;
        this.insightToShare = insightToShare;
        this._surfaced = _surfaced;
        this._lastSurfacedAt = _lastSurfacedAt;
        this._surfaceCount = _surfaceCount;
        this.createdAt = createdAt;
        this._updatedAt = _updatedAt;
    }
    // ============================================================================
    // FACTORY METHODS
    // ============================================================================
    /**
     * Create a new pattern
     */
    static create(params) {
        const id = `pattern_${params.userId}_${params.patternType}_${Date.now()}`;
        const now = new Date();
        const insightToShare = params.insightToShare ??
            EmotionalPattern.generateDefaultInsight(params.patternType, params.triggers, params.resultingEmotion);
        return new EmotionalPattern(id, params.userId, params.patternType, params.description, params.triggers, params.resultingEmotion, params.resultingGranular ?? null, [], 0, params.deliveryTiming ?? 'when_relevant', insightToShare, false, null, 0, now, now);
    }
    /**
     * Generate default insight based on pattern type
     */
    static generateDefaultInsight(type, triggers, emotion) {
        const triggerStr = triggers.slice(0, 2).join(' or ');
        switch (type) {
            case 'topic_emotion':
                return `I've noticed you seem to feel ${emotion} when ${triggerStr} comes up`;
            case 'temporal':
                return `${triggerStr} seems to be a harder time for you`;
            case 'cyclical':
                return `There seems to be a pattern around ${triggerStr}`;
            case 'person_related':
                return `When ${triggerStr} comes up, I notice a shift in your energy`;
            case 'trajectory':
                return `I've noticed things have been feeling more ${emotion} lately`;
            default:
                return `I've noticed a pattern around ${triggerStr}`;
        }
    }
    /**
     * Reconstitute from persistence
     */
    static fromPersistence(data) {
        return new EmotionalPattern(data.id, data.userId, data.patternType, data.description, data.triggers, data.resultingEmotion, data.resultingGranular ?? null, data.evidence.map((e) => ({
            ...e,
            timestamp: new Date(e.timestamp),
        })), data.confidence, data.deliveryTiming, data.insightToShare, data.surfaced, data.lastSurfacedAt ? new Date(data.lastSurfacedAt) : null, data.surfaceCount, new Date(data.createdAt), new Date(data.updatedAt));
    }
    // ============================================================================
    // COMPUTED PROPERTIES
    // ============================================================================
    /** Current confidence score */
    get confidence() {
        return this._confidence;
    }
    /** Get evidence array (immutable copy) */
    get evidence() {
        return [...this._evidence];
    }
    /** Evidence count */
    get evidenceCount() {
        return this._evidence.length;
    }
    /** Has been surfaced */
    get surfaced() {
        return this._surfaced;
    }
    /** Last surfaced timestamp */
    get lastSurfacedAt() {
        return this._lastSurfacedAt;
    }
    /** Surface count */
    get surfaceCount() {
        return this._surfaceCount;
    }
    /** Last updated */
    get updatedAt() {
        return this._updatedAt;
    }
    /**
     * Is this pattern confirmed (enough evidence)?
     */
    get isConfirmed() {
        return this._evidence.length >= PATTERN_CONFIG.minOccurrences;
    }
    /**
     * Is this pattern ready to surface to the user?
     */
    get isReadyToSurface() {
        // Must be confirmed
        if (!this.isConfirmed)
            return false;
        // Must meet confidence threshold
        if (this._confidence < PATTERN_CONFIG.surfaceThreshold)
            return false;
        // Check cooldown
        if (this._lastSurfacedAt) {
            const daysSinceSurfaced = Math.floor((Date.now() - this._lastSurfacedAt.getTime()) / (1000 * 60 * 60 * 24));
            if (daysSinceSurfaced < PATTERN_CONFIG.cooldownDays)
                return false;
        }
        // Delivery timing check
        if (this.deliveryTiming === 'never')
            return false;
        return true;
    }
    /**
     * Is this a high-confidence pattern?
     */
    get isHighConfidence() {
        return this._confidence >= PATTERN_CONFIG.highConfidenceThreshold;
    }
    /**
     * Should this be surfaced immediately?
     */
    get shouldSurfaceImmediately() {
        return this.deliveryTiming === 'immediate' && this.isReadyToSurface && this.isHighConfidence;
    }
    /**
     * Get average intensity from evidence
     */
    get averageIntensity() {
        if (this._evidence.length === 0)
            return 0;
        return this._evidence.reduce((sum, e) => sum + e.intensity, 0) / this._evidence.length;
    }
    /**
     * Get most recent evidence
     */
    get mostRecentEvidence() {
        return this._evidence.length > 0 ? this._evidence[this._evidence.length - 1] ?? null : null;
    }
    // ============================================================================
    // BEHAVIOR METHODS
    // ============================================================================
    /**
     * Add evidence for this pattern
     */
    addEvidence(evidence) {
        this._evidence.push(evidence);
        this._updatedAt = new Date();
        this.recalculateConfidence();
    }
    /**
     * Mark as surfaced to user
     */
    markSurfaced() {
        this._surfaced = true;
        this._lastSurfacedAt = new Date();
        this._surfaceCount++;
        this._updatedAt = new Date();
    }
    /**
     * Check if triggers match current context
     */
    matchesTriggers(context) {
        if (context.topics) {
            const topicMatch = context.topics.some((topic) => this.triggers.some((trigger) => topic.toLowerCase().includes(trigger.toLowerCase()) ||
                trigger.toLowerCase().includes(topic.toLowerCase())));
            if (topicMatch)
                return true;
        }
        if (context.mentionedPeople && this.patternType === 'person_related') {
            const personMatch = context.mentionedPeople.some((person) => this.triggers.some((trigger) => person.toLowerCase().includes(trigger.toLowerCase()) ||
                trigger.toLowerCase().includes(person.toLowerCase())));
            if (personMatch)
                return true;
        }
        if (context.currentTime && this.patternType === 'temporal') {
            // Check time-based triggers (e.g., "sunday evening")
            const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const currentDay = dayNames[context.currentTime.getDay()];
            const currentHour = context.currentTime.getHours();
            const timeOfDay = currentHour < 12 ? 'morning' : currentHour < 18 ? 'afternoon' : 'evening';
            const timeMatch = this.triggers.some((trigger) => trigger.toLowerCase().includes(currentDay ?? '') ||
                trigger.toLowerCase().includes(timeOfDay));
            if (timeMatch)
                return true;
        }
        return false;
    }
    /**
     * Recalculate confidence based on evidence
     */
    recalculateConfidence() {
        const count = this._evidence.length;
        // Base confidence from count
        let confidence = Math.min(0.9, count / 10);
        // Boost for recency
        const recentEvidence = this._evidence.filter((e) => Date.now() - e.timestamp.getTime() < 30 * 24 * 60 * 60 * 1000 // Last 30 days
        );
        if (recentEvidence.length >= 2) {
            confidence = Math.min(0.95, confidence + 0.1);
        }
        // Boost for consistency (same granular emotion)
        if (this.resultingGranular) {
            const consistentCount = this._evidence.filter((e) => e.granular === this.resultingGranular).length;
            const consistencyRatio = consistentCount / count;
            if (consistencyRatio >= 0.7) {
                confidence = Math.min(0.95, confidence + 0.1);
            }
        }
        this._confidence = confidence;
    }
    // ============================================================================
    // SERIALIZATION
    // ============================================================================
    /**
     * Convert to plain object for persistence
     */
    toPersistence() {
        return {
            id: this.id,
            userId: this.userId,
            patternType: this.patternType,
            description: this.description,
            triggers: this.triggers,
            resultingEmotion: this.resultingEmotion,
            resultingGranular: this.resultingGranular,
            evidence: this._evidence.map((e) => ({
                ...e,
                timestamp: e.timestamp.toISOString(),
            })),
            confidence: this._confidence,
            deliveryTiming: this.deliveryTiming,
            insightToShare: this.insightToShare,
            surfaced: this._surfaced,
            lastSurfacedAt: this._lastSurfacedAt?.toISOString() ?? null,
            surfaceCount: this._surfaceCount,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString(),
            // Computed fields for convenience
            isConfirmed: this.isConfirmed,
            isReadyToSurface: this.isReadyToSurface,
            averageIntensity: this.averageIntensity,
        };
    }
    /**
     * Format for LLM prompt injection
     */
    formatForPrompt() {
        if (!this.isReadyToSurface)
            return '';
        const confidenceStr = this.isHighConfidence ? 'high' : 'moderate';
        return [
            '[🔮 PATTERN INSIGHT - SUPERHUMAN OBSERVATION]',
            '',
            `Pattern: ${this.description}`,
            `Evidence: ${this.evidenceCount} occurrences`,
            `Confidence: ${confidenceStr} (${Math.round(this._confidence * 100)}%)`,
            '',
            `Insight to share: "${this.insightToShare}"`,
            '',
            "This is SUPERHUMAN - noticing what they don't notice about themselves.",
            'Deliver gently, as an observation, not a diagnosis.',
            'Frame it as curiosity: "I\'ve noticed..." not "You always..."',
        ].join('\n');
    }
}
//# sourceMappingURL=emotional-pattern.js.map