// ============================================================================
// CONSTANTS
// ============================================================================
// Prior for Beta distribution (weakly informative)
const BETA_PRIOR = { alpha: 1, beta: 1 };
// Time bucket boundaries
const TIME_BUCKETS = {
    EARLY_MORNING: [5, 8], // 5am-8am
    MORNING: [8, 12], // 8am-12pm
    AFTERNOON: [12, 17], // 12pm-5pm
    EVENING: [17, 21], // 5pm-9pm
    NIGHT: [21, 24], // 9pm-12am
    LATE_NIGHT: [0, 5], // 12am-5am
};
// Minimum data before predictions are confident
const MIN_SAMPLES_FOR_CONFIDENCE = 10;
// How much to weight recent signals
const RECENCY_DECAY = 0.95; // Per week
// ============================================================================
// STATE (In-memory with Firestore persistence)
// ============================================================================
const userProfiles = new Map();
// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================
function getOrCreateProfile(userId) {
    let profile = userProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            hourlyBetas: Array(24)
                .fill(null)
                .map(() => ({ ...BETA_PRIOR })),
            dailyBetas: Array(7)
                .fill(null)
                .map(() => ({ ...BETA_PRIOR })),
            gapPreference: { min: 24, max: 168, optimal: 72 }, // Default: 24h min, 1 week max, 3 days optimal
            avgResponseTimeMs: 0,
            totalOutreach: 0,
            totalEngaged: 0,
            lastUpdated: new Date(),
            patterns: {
                morningPerson: 0,
                weekendActive: 0,
                quickResponder: 0,
                prefersBrevity: 0,
            },
        };
        userProfiles.set(userId, profile);
    }
    return profile;
}
export function getTimingProfile(userId) {
    return userProfiles.get(userId) || null;
}
// ============================================================================
// SIGNAL RECORDING
// ============================================================================
/**
 * Record an outreach timing signal for learning
 */
export function recordTimingSignal(userId, signal) {
    const profile = getOrCreateProfile(userId);
    // Update hourly beta
    const hourBeta = profile.hourlyBetas[signal.hourOfDay];
    if (hourBeta) {
        if (signal.responseType === 'engaged') {
            hourBeta.alpha += 1;
        }
        else if (signal.responseType === 'ignored' || signal.responseType === 'dismissed') {
            hourBeta.beta += 1;
        }
        // 'delayed' counts as partial success
        else if (signal.responseType === 'delayed') {
            hourBeta.alpha += 0.5;
            hourBeta.beta += 0.5;
        }
    }
    // Update daily beta
    const dayBeta = profile.dailyBetas[signal.dayOfWeek];
    if (dayBeta) {
        if (signal.responseType === 'engaged') {
            dayBeta.alpha += 1;
        }
        else if (signal.responseType === 'ignored' || signal.responseType === 'dismissed') {
            dayBeta.beta += 1;
        }
    }
    // Update totals
    profile.totalOutreach += 1;
    if (signal.responseType === 'engaged') {
        profile.totalEngaged += 1;
    }
    // Update response time tracking
    if (signal.responseTimeMs !== null) {
        const n = profile.totalEngaged;
        profile.avgResponseTimeMs = (profile.avgResponseTimeMs * (n - 1) + signal.responseTimeMs) / n;
    }
    // Update patterns
    updatePatterns(profile, signal);
    profile.lastUpdated = new Date();
}
function updatePatterns(profile, signal) {
    const isEngaged = signal.responseType === 'engaged';
    const learningRate = 0.1;
    // Morning person detection
    const isMorning = signal.hourOfDay >= 6 && signal.hourOfDay < 12;
    if (isMorning && isEngaged) {
        profile.patterns.morningPerson += learningRate;
    }
    else if (!isMorning && isEngaged) {
        profile.patterns.morningPerson -= learningRate * 0.5;
    }
    profile.patterns.morningPerson = clamp(profile.patterns.morningPerson, -1, 1);
    // Weekend activity
    const isWeekend = signal.dayOfWeek === 0 || signal.dayOfWeek === 6;
    if (isWeekend && isEngaged) {
        profile.patterns.weekendActive += learningRate;
    }
    else if (!isWeekend && isEngaged) {
        profile.patterns.weekendActive -= learningRate * 0.5;
    }
    profile.patterns.weekendActive = clamp(profile.patterns.weekendActive, -1, 1);
    // Quick responder detection
    if (signal.responseTimeMs !== null) {
        const isQuick = signal.responseTimeMs < 5 * 60 * 1000; // Under 5 minutes
        if (isQuick) {
            profile.patterns.quickResponder += learningRate;
        }
        else {
            profile.patterns.quickResponder -= learningRate * 0.3;
        }
        profile.patterns.quickResponder = clamp(profile.patterns.quickResponder, -1, 1);
    }
}
// ============================================================================
// THOMPSON SAMPLING
// ============================================================================
/**
 * Thompson Sampling: Sample from Beta distributions to balance exploration/exploitation
 */
function sampleBeta(alpha, beta) {
    // Using the Joehnk algorithm for Beta sampling
    // This is a simple but effective method for sampling from Beta(α, β)
    if (alpha <= 0 || beta <= 0) {
        return 0.5; // Fallback
    }
    // For alpha, beta >= 1, use the standard method
    const a = alpha;
    const b = beta;
    // Generate gamma-distributed samples and normalize
    const x = gammaVariate(a);
    const y = gammaVariate(b);
    return x / (x + y);
}
/**
 * Simple gamma variate generator using Marsaglia and Tsang's method
 */
function gammaVariate(shape) {
    if (shape < 1) {
        // For shape < 1, use Ahrens-Dieter method
        return gammaVariate(1 + shape) * Math.pow(Math.random(), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
        let x, v;
        do {
            x = normalVariate();
            v = 1 + c * x;
        } while (v <= 0);
        v = v * v * v;
        const u = Math.random();
        if (u < 1 - 0.0331 * (x * x) * (x * x)) {
            return d * v;
        }
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
            return d * v;
        }
    }
}
/**
 * Box-Muller transform for normal variate
 */
function normalVariate() {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
// ============================================================================
// PREDICTION
// ============================================================================
/**
 * Predict the optimal time to send outreach
 */
export function predictOptimalTiming(userId) {
    const profile = getOrCreateProfile(userId);
    // Sample from each hour's Beta distribution (Thompson Sampling)
    const hourScores = [];
    for (let hour = 0; hour < 24; hour++) {
        const beta = profile.hourlyBetas[hour];
        const score = sampleBeta(beta.alpha, beta.beta);
        hourScores.push({ hour, score });
    }
    // Sort by score descending
    hourScores.sort((a, b) => b.score - a.score);
    // Apply contextual adjustments
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    // Boost scores based on patterns
    for (const hs of hourScores) {
        // Morning person boost
        if (profile.patterns.morningPerson > 0.3 && hs.hour >= 6 && hs.hour < 12) {
            hs.score *= 1 + profile.patterns.morningPerson * 0.3;
        }
        // Evening boost for non-morning people
        if (profile.patterns.morningPerson < -0.3 && hs.hour >= 17 && hs.hour < 22) {
            hs.score *= 1 + Math.abs(profile.patterns.morningPerson) * 0.3;
        }
        // Avoid late night unless they're clearly night owls
        if (hs.hour >= 23 || hs.hour < 6) {
            hs.score *= 0.5;
        }
    }
    // Resort after adjustments
    hourScores.sort((a, b) => b.score - a.score);
    // Calculate confidence based on data volume
    const dataVolume = profile.totalOutreach;
    const confidence = Math.min(dataVolume / MIN_SAMPLES_FOR_CONFIDENCE, 1) * (hourScores[0]?.score || 0.5);
    // Get day-of-week preference
    const dayBeta = profile.dailyBetas[currentDay];
    const dayScore = sampleBeta(dayBeta.alpha, dayBeta.beta);
    // Build reasoning
    const reasoning = buildReasoning(profile, hourScores[0]?.hour || 12);
    return {
        recommendedHour: hourScores[0]?.hour || 12,
        confidence: Math.round(confidence * 100) / 100,
        alternativeHours: hourScores.slice(1, 4).map((h) => h.hour),
        reasoning,
        factors: {
            timeOfDay: hourScores[0]?.score || 0.5,
            dayOfWeek: dayScore,
            recency: calculateRecencyFactor(profile),
            pattern: calculatePatternStrength(profile),
        },
    };
}
function buildReasoning(profile, hour) {
    const parts = [];
    if (profile.totalOutreach < 5) {
        parts.push('Still learning your preferences');
    }
    else {
        // Time preference
        if (hour >= 6 && hour < 12) {
            parts.push('You seem to engage more in the mornings');
        }
        else if (hour >= 12 && hour < 17) {
            parts.push('Afternoons work well for you');
        }
        else if (hour >= 17 && hour < 21) {
            parts.push("You're most responsive in the evenings");
        }
        // Pattern observations
        if (profile.patterns.morningPerson > 0.5) {
            parts.push("You're definitely a morning person");
        }
        if (profile.patterns.quickResponder > 0.5) {
            parts.push('You usually respond quickly');
        }
        if (profile.patterns.weekendActive > 0.3) {
            parts.push("You're more active on weekends");
        }
    }
    return parts.join('. ') || 'Finding the best time to reach you';
}
function calculateRecencyFactor(profile) {
    const daysSinceUpdate = (Date.now() - profile.lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    return Math.pow(RECENCY_DECAY, daysSinceUpdate / 7);
}
function calculatePatternStrength(profile) {
    const { patterns } = profile;
    const absValues = [
        Math.abs(patterns.morningPerson),
        Math.abs(patterns.weekendActive),
        Math.abs(patterns.quickResponder),
    ];
    return absValues.reduce((sum, v) => sum + v, 0) / absValues.length;
}
// ============================================================================
// GAP OPTIMIZATION
// ============================================================================
/**
 * Learn optimal gap between outreach messages
 */
export function recordOutreachGap(userId, gapHours, wasEngaged) {
    const profile = getOrCreateProfile(userId);
    // Simple exponential smoothing for gap preference
    const learningRate = 0.2;
    if (wasEngaged) {
        // Move optimal toward this gap
        profile.gapPreference.optimal =
            profile.gapPreference.optimal * (1 - learningRate) + gapHours * learningRate;
    }
    else {
        // Gap was too short or too long
        if (gapHours < profile.gapPreference.optimal) {
            // Too frequent - increase min
            profile.gapPreference.min = Math.max(profile.gapPreference.min, gapHours + 12);
        }
        else {
            // Too infrequent - decrease max
            profile.gapPreference.max = Math.min(profile.gapPreference.max, gapHours - 12);
        }
    }
    // Ensure valid bounds
    profile.gapPreference.min = Math.max(12, profile.gapPreference.min);
    profile.gapPreference.max = Math.max(profile.gapPreference.min + 24, profile.gapPreference.max);
    profile.gapPreference.optimal = clamp(profile.gapPreference.optimal, profile.gapPreference.min, profile.gapPreference.max);
}
/**
 * Get recommended gap before next outreach
 */
export function getRecommendedGap(userId) {
    const profile = getOrCreateProfile(userId);
    return {
        minHours: profile.gapPreference.min,
        maxHours: profile.gapPreference.max,
        optimalHours: profile.gapPreference.optimal,
    };
}
// ============================================================================
// SHOULD REACH OUT
// ============================================================================
/**
 * Determine if now is a good time to reach out
 */
export function shouldReachOutNow(userId, lastOutreachTime) {
    const profile = getOrCreateProfile(userId);
    const prediction = predictOptimalTiming(userId);
    const now = new Date();
    const currentHour = now.getHours();
    // Check gap constraint
    if (lastOutreachTime) {
        const hoursSince = (now.getTime() - lastOutreachTime.getTime()) / (1000 * 60 * 60);
        if (hoursSince < profile.gapPreference.min) {
            return {
                should: false,
                confidence: 0.9,
                reason: 'Too soon since last outreach',
                suggestedWait: profile.gapPreference.min - hoursSince,
            };
        }
    }
    // Check if current hour is optimal
    const hourDiff = Math.abs(currentHour - prediction.recommendedHour);
    const isNearOptimal = hourDiff <= 2 || hourDiff >= 22; // Within 2 hours
    if (isNearOptimal) {
        return {
            should: true,
            confidence: prediction.confidence,
            reason: prediction.reasoning,
        };
    }
    // Check if current hour is in alternatives
    if (prediction.alternativeHours.includes(currentHour)) {
        return {
            should: true,
            confidence: prediction.confidence * 0.8,
            reason: 'Good alternative time based on your patterns',
        };
    }
    // Calculate wait time to next good window
    let hoursUntilOptimal = prediction.recommendedHour - currentHour;
    if (hoursUntilOptimal <= 0)
        hoursUntilOptimal += 24;
    return {
        should: false,
        confidence: prediction.confidence,
        reason: `Better to wait for ${formatHour(prediction.recommendedHour)}`,
        suggestedWait: hoursUntilOptimal,
    };
}
// ============================================================================
// PERSISTENCE
// ============================================================================
/**
 * Export profile for Firestore storage
 */
export function exportProfile(userId) {
    const profile = userProfiles.get(userId);
    if (!profile)
        return null;
    return {
        ...profile,
        lastUpdated: profile.lastUpdated.toISOString(),
    };
}
/**
 * Import profile from Firestore
 */
export function importProfile(userId, data) {
    const profile = {
        userId,
        hourlyBetas: data.hourlyBetas ||
            Array(24)
                .fill(null)
                .map(() => ({ ...BETA_PRIOR })),
        dailyBetas: data.dailyBetas ||
            Array(7)
                .fill(null)
                .map(() => ({ ...BETA_PRIOR })),
        gapPreference: data.gapPreference || {
            min: 24,
            max: 168,
            optimal: 72,
        },
        avgResponseTimeMs: data.avgResponseTimeMs || 0,
        totalOutreach: data.totalOutreach || 0,
        totalEngaged: data.totalEngaged || 0,
        lastUpdated: data.lastUpdated ? new Date(data.lastUpdated) : new Date(),
        patterns: data.patterns || {
            morningPerson: 0,
            weekendActive: 0,
            quickResponder: 0,
            prefersBrevity: 0,
        },
    };
    userProfiles.set(userId, profile);
}
// ============================================================================
// UTILITIES
// ============================================================================
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function formatHour(hour) {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 || 12;
    return `${h}${ampm}`;
}
// ============================================================================
// EXPORTS
// ============================================================================
export const outreachTimingML = {
    recordSignal: recordTimingSignal,
    predict: predictOptimalTiming,
    shouldReachOut: shouldReachOutNow,
    recordGap: recordOutreachGap,
    getGap: getRecommendedGap,
    getProfile: getTimingProfile,
    exportProfile,
    importProfile,
};
//# sourceMappingURL=outreach-timing-ml.js.map