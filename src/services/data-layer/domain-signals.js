/**
 * Domain Signals
 *
 * Records domain-specific signals for cross-domain correlation.
 * These signals are collected and analyzed by the unified intelligence system.
 *
 * TODO: Integrate with intelligence/unified-intelligence-api.ts
 *
 * @module services/data-layer/domain-signals
 */
import { createLogger } from '../../utils/safe-logger.js';
import { recordDomainSignal, } from '../../intelligence/unified-intelligence-api.js';
const log = createLogger({ module: 'domain-signals' });
/**
 * Record a calendar-related signal
 *
 * @param userId - User ID
 * @param signalType - Type of calendar signal (e.g., 'meeting_scheduled')
 * @param metadata - Additional signal metadata
 */
export function recordCalendarSignal(userId, signalType, metadata = {}) {
    log.debug({ userId, signalType }, 'Recording calendar signal');
    const signal = {
        domain: 'calendar',
        store: 'calendar',
        metric: signalType,
        direction: signalType.includes('cancelled') || signalType === 'deleted' ? 'decreased' : 'changed',
        magnitude: metadata.hasConflict ? 'significant' : 'minor',
        timestamp: new Date(),
        metadata: {
            ...metadata,
        },
    };
    recordDomainSignal(userId, signal);
}
/**
 * Record a financial-related signal
 *
 * @param userId - User ID
 * @param signalType - Type of financial signal (e.g., 'budget_set', 'savings_goal_progress')
 * @param metadata - Additional signal metadata
 */
export function recordFinancialSignal(userId, signalType, metadata = {}) {
    log.debug({ userId, signalType }, 'Recording financial signal');
    let direction = 'changed';
    let magnitude = 'minor';
    // Determine direction based on signal type
    if (signalType === 'spending_logged') {
        direction = 'decreased'; // Money spent
        magnitude = (metadata.amount ?? 0) > 100 ? 'moderate' : 'minor';
    }
    else if (signalType === 'savings_progress' || signalType === 'savings_goal_progress') {
        direction = 'increased';
        magnitude =
            (metadata.savingsProgress ?? metadata.percentageChange ?? 0) > 10
                ? 'significant'
                : 'moderate';
    }
    else if (signalType === 'goal_achieved') {
        magnitude = 'significant';
    }
    const signal = {
        domain: 'financial',
        store: 'financial',
        metric: signalType,
        direction,
        magnitude,
        timestamp: new Date(),
        metadata: {
            ...metadata,
        },
    };
    recordDomainSignal(userId, signal);
}
/**
 * Record a habit-related signal
 */
export function recordHabitSignal(userId, data) {
    log.debug({ userId, type: data.type }, 'Recording habit signal');
    let direction = 'changed';
    let magnitude = 'minor';
    if (data.type === 'completed') {
        direction = 'increased';
    }
    else if (data.type === 'missed' || data.type === 'streak_broken') {
        direction = 'decreased';
        magnitude = 'moderate';
    }
    else if (data.type === 'streak_milestone') {
        direction = 'increased';
        magnitude = 'significant';
    }
    const signal = {
        domain: 'habit',
        store: 'productivity',
        metric: data.type,
        direction,
        magnitude,
        timestamp: new Date(),
        metadata: {
            habitId: data.habitId,
            habitName: data.habitName,
            streakLength: data.streakLength,
            completionRate: data.completionRate,
        },
    };
    recordDomainSignal(userId, signal);
}
/**
 * Record a task-related signal
 */
export function recordTaskSignal(userId, signalType, metadata = {}) {
    log.debug({ userId, signalType }, 'Recording task signal');
    let direction = 'changed';
    let magnitude = 'minor';
    if (signalType === 'completed') {
        direction = 'increased';
        magnitude = 'moderate';
    }
    else if (signalType === 'overdue') {
        direction = 'decreased';
        magnitude = 'significant';
    }
    const signal = {
        domain: 'task',
        store: 'productivity',
        metric: signalType,
        direction,
        magnitude,
        timestamp: new Date(),
        metadata: {
            ...metadata,
        },
    };
    recordDomainSignal(userId, signal);
}
/**
 * Record a milestone-related signal
 */
export function recordMilestoneSignal(userId, signalType, metadata = {}) {
    log.debug({ userId, signalType }, 'Recording milestone signal');
    let direction = 'changed';
    let magnitude = 'moderate';
    if (signalType === 'achieved') {
        direction = 'increased';
        magnitude = 'significant';
    }
    else if (signalType === 'missed') {
        direction = 'decreased';
        magnitude = 'significant';
    }
    else if (signalType === 'approaching') {
        magnitude = 'moderate';
    }
    const signal = {
        domain: 'milestone',
        store: 'life-data',
        metric: signalType,
        direction,
        magnitude,
        timestamp: new Date(),
        metadata: {
            ...metadata,
        },
    };
    recordDomainSignal(userId, signal);
}
/**
 * Record an emotion-related signal
 *
 * @param userId - User ID
 * @param emotion - The detected emotion (e.g., 'joy', 'stress', 'anxiety')
 * @param intensity - Intensity from 0 to 1
 * @param metadata - Additional context
 */
export function recordEmotionSignal(userId, emotion, intensity, metadata = {}) {
    log.debug({ userId, emotion, intensity }, 'Recording emotion signal');
    let direction = 'changed';
    let magnitude = 'minor';
    // Positive emotions are "increased", negative are "decreased"
    const positiveEmotions = ['joy', 'excitement', 'gratitude', 'calm', 'hope', 'contentment'];
    const negativeEmotions = ['stress', 'anxiety', 'sadness', 'frustration', 'anger', 'fear'];
    if (positiveEmotions.includes(emotion.toLowerCase())) {
        direction = 'increased';
    }
    else if (negativeEmotions.includes(emotion.toLowerCase())) {
        direction = 'decreased';
    }
    // Intensity determines magnitude
    if (intensity >= 0.7) {
        magnitude = 'significant';
    }
    else if (intensity >= 0.4) {
        magnitude = 'moderate';
    }
    const signal = {
        domain: 'emotion',
        store: 'health',
        metric: emotion,
        direction,
        magnitude,
        timestamp: new Date(),
        metadata: {
            intensity,
            ...metadata,
        },
    };
    recordDomainSignal(userId, signal);
}
/**
 * Record a wellness-related signal
 */
export function recordWellnessSignal(userId, data) {
    log.debug({ userId, type: data.type }, 'Recording wellness signal');
    let direction = 'changed';
    let magnitude = 'minor';
    if (data.trend === 'improving') {
        direction = 'increased';
    }
    else if (data.trend === 'declining') {
        direction = 'decreased';
        magnitude = 'moderate';
    }
    if (data.type === 'stress_detected' || data.type === 'energy_low') {
        magnitude = 'significant';
    }
    const signal = {
        domain: 'wellness',
        store: 'health',
        metric: data.type,
        direction,
        magnitude,
        timestamp: new Date(),
        metadata: {
            value: data.value,
            trend: data.trend,
        },
    };
    recordDomainSignal(userId, signal);
}
/**
 * Record a relationship-related signal
 */
export function recordRelationshipSignal(userId, data) {
    log.debug({ userId, type: data.type }, 'Recording relationship signal');
    let direction = 'changed';
    let magnitude = 'minor';
    if (data.type === 'relationship_deepened') {
        direction = 'increased';
        magnitude = 'moderate';
    }
    else if (data.type === 'conflict_detected') {
        direction = 'decreased';
        magnitude = 'significant';
    }
    const signal = {
        domain: 'relationships',
        store: 'contacts',
        metric: data.type,
        direction,
        magnitude,
        timestamp: new Date(),
        metadata: {
            personName: data.personName,
            relationshipType: data.relationshipType,
            interactionQuality: data.interactionQuality,
        },
    };
    recordDomainSignal(userId, signal);
}
export default {
    recordCalendarSignal,
    recordFinancialSignal,
    recordHabitSignal,
    recordTaskSignal,
    recordMilestoneSignal,
    recordEmotionSignal,
    recordWellnessSignal,
    recordRelationshipSignal,
};
//# sourceMappingURL=domain-signals.js.map