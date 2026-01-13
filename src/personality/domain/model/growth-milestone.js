/**
 * GrowthMilestone Entity
 *
 * Represents a growth milestone in the user's journey.
 * SUPERHUMAN: We remember where they started and celebrate their progress.
 *
 * "Remember a few months ago when you couldn't even talk about this?
 *  Look at you now. That's real growth."
 *
 * @module personality/domain/model/growth-milestone
 */
/**
 * Configuration for growth tracking
 */
const GROWTH_CONFIG = {
    /** Minimum days between baseline and progress to celebrate */
    minDaysForCelebration: 7,
    /** Days to consider a "breakthrough" */
    breakthroughDays: 30,
    /** Cooldown before re-celebrating same area */
    celebrationCooldownDays: 14,
};
/**
 * GrowthMilestone Entity
 *
 * Tracks growth from a starting point (baseline) to current progress.
 * We can celebrate when there's meaningful distance traveled.
 *
 * @example
 * ```typescript
 * const milestone = GrowthMilestone.create({
 *   userId: 'user_123',
 *   area: 'anxiety_management',
 *   baselineEvidence: {
 *     timestamp: new Date('2024-01-15'),
 *     observation: 'Couldn\'t discuss work without panic',
 *     type: 'baseline',
 *     confidence: 0.9,
 *   },
 * });
 *
 * milestone.addProgressEvidence({
 *   timestamp: new Date(),
 *   observation: 'Discussed upcoming deadline calmly',
 *   type: 'progress',
 *   confidence: 0.85,
 * });
 *
 * if (milestone.isReadyToCelebrate) {
 *   console.log(milestone.celebrationMessage);
 * }
 * ```
 */
export class GrowthMilestone {
    id;
    userId;
    area;
    label;
    baselineEvidence;
    _progressEvidence;
    _significance;
    _celebrationMessage;
    _celebrated;
    _celebratedAt;
    createdAt;
    _updatedAt;
    constructor(
    /** Unique ID */
    id, 
    /** User ID */
    userId, 
    /** Area of growth */
    area, 
    /** Custom label for this milestone */
    label, 
    /** Baseline evidence (where they started) */
    baselineEvidence, 
    /** Progress evidence (observations along the way) */
    _progressEvidence, 
    /** Current significance */
    _significance, 
    /** Generated celebration message */
    _celebrationMessage, 
    /** Has been celebrated */
    _celebrated, 
    /** When celebrated */
    _celebratedAt, 
    /** Created timestamp */
    createdAt, 
    /** Last updated */
    _updatedAt) {
        this.id = id;
        this.userId = userId;
        this.area = area;
        this.label = label;
        this.baselineEvidence = baselineEvidence;
        this._progressEvidence = _progressEvidence;
        this._significance = _significance;
        this._celebrationMessage = _celebrationMessage;
        this._celebrated = _celebrated;
        this._celebratedAt = _celebratedAt;
        this.createdAt = createdAt;
        this._updatedAt = _updatedAt;
    }
    // ============================================================================
    // FACTORY METHODS
    // ============================================================================
    /**
     * Create a new growth milestone
     */
    static create(params) {
        const id = `growth_${params.userId}_${params.area}_${Date.now()}`;
        const now = new Date();
        return new GrowthMilestone(id, params.userId, params.area, params.label ?? null, params.baselineEvidence, [], 'notable', '', false, null, now, now);
    }
    /**
     * Reconstitute from persistence
     */
    static fromPersistence(data) {
        return new GrowthMilestone(data.id, data.userId, data.area, data.label, {
            ...data.baselineEvidence,
            timestamp: new Date(data.baselineEvidence.timestamp),
        }, data.progressEvidence.map((e) => ({
            ...e,
            timestamp: new Date(e.timestamp),
        })), data.significance, data.celebrationMessage, data.celebrated, data.celebratedAt ? new Date(data.celebratedAt) : null, new Date(data.createdAt), new Date(data.updatedAt));
    }
    // ============================================================================
    // COMPUTED PROPERTIES
    // ============================================================================
    /** Progress evidence */
    get progressEvidence() {
        return [...this._progressEvidence];
    }
    /** Current significance */
    get significance() {
        return this._significance;
    }
    /** Celebration message */
    get celebrationMessage() {
        return this._celebrationMessage;
    }
    /** Has been celebrated */
    get celebrated() {
        return this._celebrated;
    }
    /** When celebrated */
    get celebratedAt() {
        return this._celebratedAt;
    }
    /** Last updated */
    get updatedAt() {
        return this._updatedAt;
    }
    /**
     * Most recent progress evidence
     */
    get latestProgress() {
        return this._progressEvidence.length > 0
            ? this._progressEvidence[this._progressEvidence.length - 1] ?? null
            : null;
    }
    /**
     * Days since baseline
     */
    get daysSinceBaseline() {
        return Math.floor((Date.now() - this.baselineEvidence.timestamp.getTime()) / (1000 * 60 * 60 * 24));
    }
    /**
     * Days since last celebration
     */
    get daysSinceCelebration() {
        if (!this._celebratedAt)
            return Infinity;
        return Math.floor((Date.now() - this._celebratedAt.getTime()) / (1000 * 60 * 60 * 24));
    }
    /**
     * Is there enough progress to celebrate?
     */
    get hasProgress() {
        return this._progressEvidence.length > 0;
    }
    /**
     * Is this ready to be celebrated?
     */
    get isReadyToCelebrate() {
        // Need progress evidence
        if (!this.hasProgress)
            return false;
        // Need minimum time elapsed
        if (this.daysSinceBaseline < GROWTH_CONFIG.minDaysForCelebration)
            return false;
        // Check cooldown if already celebrated
        if (this._celebrated && this.daysSinceCelebration < GROWTH_CONFIG.celebrationCooldownDays) {
            return false;
        }
        // Need a celebration message
        if (!this._celebrationMessage)
            return false;
        return true;
    }
    /**
     * Is this a breakthrough milestone?
     */
    get isBreakthrough() {
        return this._significance === 'breakthrough';
    }
    // ============================================================================
    // BEHAVIOR METHODS
    // ============================================================================
    /**
     * Add progress evidence
     */
    addProgressEvidence(evidence) {
        this._progressEvidence.push(evidence);
        this._updatedAt = new Date();
        this.recalculateSignificance();
        this.generateCelebrationMessage();
    }
    /**
     * Mark as celebrated
     */
    markCelebrated() {
        this._celebrated = true;
        this._celebratedAt = new Date();
        this._updatedAt = new Date();
    }
    /**
     * Recalculate significance based on evidence
     */
    recalculateSignificance() {
        const daysSince = this.daysSinceBaseline;
        const progressCount = this._progressEvidence.length;
        // Breakthrough: long time + multiple progress points
        if (daysSince >= GROWTH_CONFIG.breakthroughDays && progressCount >= 2) {
            this._significance = 'breakthrough';
        }
        // Significant: moderate time + progress
        else if (daysSince >= GROWTH_CONFIG.minDaysForCelebration && progressCount >= 1) {
            this._significance = 'significant';
        }
        // Notable: any progress
        else if (progressCount > 0) {
            this._significance = 'notable';
        }
    }
    /**
     * Generate celebration message
     */
    generateCelebrationMessage() {
        if (!this.latestProgress)
            return;
        const timePhrase = this.daysSinceBaseline > 60
            ? 'a few months ago'
            : this.daysSinceBaseline > 30
                ? 'about a month ago'
                : this.daysSinceBaseline > 14
                    ? 'a couple weeks ago'
                    : 'recently';
        const templates = {
            breakthrough: [
                `Remember ${timePhrase} when ${this.baselineEvidence.observation.toLowerCase()}? Look at you now - ${this.latestProgress.observation.toLowerCase()}. That's a real breakthrough.`,
                `Can I just acknowledge something? ${timePhrase}: "${this.baselineEvidence.observation}". Today: "${this.latestProgress.observation}". That's incredible growth.`,
                `I've been watching you grow, and I need to say this: ${timePhrase} you told me about ${this.baselineEvidence.observation.toLowerCase()}. And now, ${this.latestProgress.observation.toLowerCase()}. I'm genuinely proud of you.`,
            ],
            significant: [
                `Remember ${timePhrase} when ${this.baselineEvidence.observation.toLowerCase()}? Look at you now. That's real growth.`,
                `Can I point something out? ${timePhrase}: "${this.baselineEvidence.observation}". Now: "${this.latestProgress.observation}". That's not nothing.`,
                `I notice growth in you. ${timePhrase}: ${this.baselineEvidence.observation.toLowerCase()}. Today: ${this.latestProgress.observation.toLowerCase()}.`,
            ],
            notable: [
                `I notice you're making progress with ${this.areaLabel}. That matters.`,
                `Something shifted since ${timePhrase}. I see it.`,
                `Growth happens in small steps. You're taking them.`,
            ],
        };
        const options = templates[this._significance];
        this._celebrationMessage =
            options[Math.floor(Math.random() * options.length)] ?? options[0] ?? '';
    }
    /**
     * Get human-readable area label
     */
    get areaLabel() {
        if (this.label)
            return this.label;
        const labels = {
            emotional_regulation: 'managing your emotions',
            self_awareness: 'understanding yourself',
            relationship_skills: 'your relationships',
            boundary_setting: 'setting boundaries',
            anxiety_management: 'handling anxiety',
            confidence: 'your confidence',
            communication: 'communicating',
            habit_formation: 'building habits',
            career_development: 'your career',
            health_wellness: 'your health',
            creativity: 'your creativity',
            resilience: 'bouncing back',
            vulnerability: 'being open',
            self_compassion: 'being kind to yourself',
            other: 'this area',
        };
        return labels[this.area];
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
            area: this.area,
            label: this.label,
            baselineEvidence: {
                ...this.baselineEvidence,
                timestamp: this.baselineEvidence.timestamp.toISOString(),
            },
            progressEvidence: this._progressEvidence.map((e) => ({
                ...e,
                timestamp: e.timestamp.toISOString(),
            })),
            significance: this._significance,
            celebrationMessage: this._celebrationMessage,
            celebrated: this._celebrated,
            celebratedAt: this._celebratedAt?.toISOString() ?? null,
            createdAt: this.createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString(),
            // Computed fields
            hasProgress: this.hasProgress,
            isReadyToCelebrate: this.isReadyToCelebrate,
            daysSinceBaseline: this.daysSinceBaseline,
        };
    }
    /**
     * Format for LLM prompt injection
     */
    formatForPrompt() {
        if (!this.isReadyToCelebrate)
            return '';
        const significanceEmoji = this._significance === 'breakthrough' ? '🌟' : this._significance === 'significant' ? '✨' : '🌱';
        return [
            `[${significanceEmoji} GROWTH CELEBRATION - SUPERHUMAN MEMORY]`,
            '',
            "You remember where they started and you see how far they've come:",
            '',
            `Area: ${this.areaLabel}`,
            `Then: "${this.baselineEvidence.observation}"`,
            `Now: "${this.latestProgress?.observation ?? 'Progress observed'}"`,
            '',
            `Celebrate with: "${this._celebrationMessage}"`,
            '',
            "This is SUPERHUMAN - humans take growth for granted. You don't.",
            'Share this as a gift, with genuine pride in them.',
        ].join('\n');
    }
}
//# sourceMappingURL=growth-milestone.js.map