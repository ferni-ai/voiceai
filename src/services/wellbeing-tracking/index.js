/**
 * Wellbeing Tracking System
 *
 * Phase 20: Continuous wellbeing assessment through conversation.
 * Tracks mood, energy, anxiety, connection, purpose, and sleep.
 *
 * Data is persisted to Firestore for cross-session retention with
 * in-memory caching for fast reads.
 *
 * @module WellbeingTracking
 */
import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { persistSnapshot as saveToFirestore, loadSnapshots as loadFromFirestore, persistProfile as saveProfileToFirestore, loadProfile as loadProfileFromFirestore, } from './persistence.js';
const log = getLogger().child({ module: 'wellbeing-tracking' });
// ============================================================================
// STORAGE
// ============================================================================
const userProfiles = new Map();
const snapshots = new Map(); // userId -> snapshots
// ============================================================================
// ASSESSMENT QUESTIONS (Natural, not clinical)
// ============================================================================
const NATURAL_ASSESSMENTS = [
    {
        dimension: 'mood',
        naturalQuestion: "How's your week been, really?",
        followUpQuestions: [
            "What's that been like?",
            'How does that compare to last week?',
            "What's been the best part?",
        ],
        extractionPatterns: [
            /been (great|good|okay|fine|rough|hard|terrible|awful|amazing|wonderful)/i,
            /feeling (happy|sad|down|up|low|good|bad|better|worse)/i,
            /I('m| am) (doing )?(well|good|okay|not great|struggling|fine)/i,
        ],
        valueMapping: (match) => {
            const positive = ['great', 'good', 'amazing', 'wonderful', 'happy', 'up', 'well', 'better'];
            const neutral = ['okay', 'fine', 'alright'];
            const negative = [
                'rough',
                'hard',
                'terrible',
                'awful',
                'sad',
                'down',
                'low',
                'bad',
                'struggling',
                'worse',
            ];
            const lower = match.toLowerCase();
            if (positive.some((w) => lower.includes(w)))
                return 0.7;
            if (neutral.some((w) => lower.includes(w)))
                return 0.5;
            if (negative.some((w) => lower.includes(w)))
                return 0.3;
            return 0.5;
        },
    },
    {
        dimension: 'energy',
        naturalQuestion: 'How are your energy levels these days?',
        followUpQuestions: [
            'When do you feel most drained?',
            'What gives you energy?',
            'How tired have you been feeling?',
        ],
        extractionPatterns: [
            /energy.*(high|low|good|bad|drained|exhausted|full|none)/i,
            /(tired|exhausted|drained|energized|wired|awake)/i,
            /feel.*(tired|exhausted|energetic|alive)/i,
        ],
        valueMapping: (match) => {
            const high = ['high', 'good', 'full', 'energized', 'wired', 'awake', 'alive'];
            const low = ['low', 'bad', 'drained', 'exhausted', 'tired', 'none'];
            const lower = match.toLowerCase();
            if (high.some((w) => lower.includes(w)))
                return 0.7;
            if (low.some((w) => lower.includes(w)))
                return 0.3;
            return 0.5;
        },
    },
    {
        dimension: 'sleepQuality',
        naturalQuestion: "How've you been sleeping?",
        followUpQuestions: [
            'What time are you getting to bed?',
            'Do you feel rested when you wake up?',
            'Any trouble falling or staying asleep?',
        ],
        extractionPatterns: [
            /sleep.*(well|good|bad|terrible|great|poorly|fine)/i,
            /(insomnia|can't sleep|sleeping (well|badly)|tossing|turning)/i,
            /wake up.*(tired|rested|exhausted|refreshed)/i,
        ],
        valueMapping: (match) => {
            const good = ['well', 'good', 'great', 'fine', 'rested', 'refreshed'];
            const bad = [
                'bad',
                'terrible',
                'poorly',
                'insomnia',
                "can't",
                'tossing',
                'turning',
                'tired',
                'exhausted',
            ];
            const lower = match.toLowerCase();
            if (good.some((w) => lower.includes(w)))
                return 0.7;
            if (bad.some((w) => lower.includes(w)))
                return 0.3;
            return 0.5;
        },
    },
    {
        dimension: 'worry',
        naturalQuestion: "What's been on your mind lately?",
        followUpQuestions: [
            'Is there anything weighing on you?',
            'How much have you been worrying?',
            "What's keeping you up at night?",
        ],
        extractionPatterns: [
            /(worried|anxious|stressed|calm|peaceful|relaxed) about/i,
            /(can't stop thinking|ruminating|obsessing|dwelling)/i,
            /anxiety.*(high|low|manageable|overwhelming)/i,
        ],
        valueMapping: (match) => {
            const high = [
                'worried',
                'anxious',
                'stressed',
                "can't stop",
                'ruminating',
                'obsessing',
                'overwhelming',
            ];
            const low = ['calm', 'peaceful', 'relaxed', 'manageable'];
            const lower = match.toLowerCase();
            if (high.some((w) => lower.includes(w)))
                return 0.7;
            if (low.some((w) => lower.includes(w)))
                return 0.3;
            return 0.5;
        },
    },
    {
        dimension: 'loneliness',
        naturalQuestion: 'How connected have you been feeling to people lately?',
        followUpQuestions: [
            'Have you seen friends or family recently?',
            'Do you feel like people get you?',
            'How much alone time have you had?',
        ],
        extractionPatterns: [
            /(lonely|isolated|connected|close to people|alone)/i,
            /friends.*(seen|haven't seen|miss|talking to)/i,
            /feel.*(understood|misunderstood|invisible|seen)/i,
        ],
        valueMapping: (match) => {
            const high = [
                'lonely',
                'isolated',
                'alone',
                "haven't seen",
                'miss',
                'misunderstood',
                'invisible',
            ];
            const low = ['connected', 'close', 'seen', 'talking to', 'understood'];
            const lower = match.toLowerCase();
            if (high.some((w) => lower.includes(w)))
                return 0.7;
            if (low.some((w) => lower.includes(w)))
                return 0.3;
            return 0.5;
        },
    },
    {
        dimension: 'meaningfulness',
        naturalQuestion: 'Does your life feel meaningful these days?',
        followUpQuestions: [
            'What gives you a sense of purpose?',
            "Do you feel like you're working toward something?",
            'What matters most to you right now?',
        ],
        extractionPatterns: [
            /life.*(meaningful|meaningless|purposeful|pointless)/i,
            /(purpose|meaning|direction|lost|floating|grounded)/i,
            /feel.*(fulfilled|empty|satisfied|hollow)/i,
        ],
        valueMapping: (match) => {
            const high = [
                'meaningful',
                'purposeful',
                'purpose',
                'meaning',
                'direction',
                'grounded',
                'fulfilled',
                'satisfied',
            ];
            const low = ['meaningless', 'pointless', 'lost', 'floating', 'empty', 'hollow'];
            const lower = match.toLowerCase();
            if (high.some((w) => lower.includes(w)))
                return 0.7;
            if (low.some((w) => lower.includes(w)))
                return 0.3;
            return 0.5;
        },
    },
];
const DETECTION_PATTERNS = [
    {
        dimension: 'mood',
        patterns: [
            /I('m| am| feel| have been) (really )?(happy|sad|down|depressed|great|terrible|okay|fine|good|bad)/i,
            /been feeling (really )?(happy|sad|down|depressed|great|terrible|okay|fine|good|bad)/i,
            /my mood.*(good|bad|low|high|stable|unstable)/i,
        ],
        extract: (match) => {
            const positive = ['happy', 'great', 'good', 'high', 'stable'];
            const negative = ['sad', 'down', 'depressed', 'terrible', 'bad', 'low', 'unstable'];
            const lower = match.toLowerCase();
            if (positive.some((w) => lower.includes(w)))
                return { value: 0.7, confidence: 0.7 };
            if (negative.some((w) => lower.includes(w)))
                return { value: 0.3, confidence: 0.7 };
            return { value: 0.5, confidence: 0.5 };
        },
    },
    {
        dimension: 'energy',
        patterns: [
            /I('m| am| feel) (so |really )?(tired|exhausted|drained|energetic|wired|alive)/i,
            /no energy|full of energy|running on empty/i,
            /can barely (get up|function|move)/i,
        ],
        extract: (match) => {
            const high = ['energetic', 'wired', 'alive', 'full of energy'];
            const low = ['tired', 'exhausted', 'drained', 'no energy', 'running on empty', 'barely'];
            const lower = match.toLowerCase();
            if (high.some((w) => lower.includes(w)))
                return { value: 0.8, confidence: 0.8 };
            if (low.some((w) => lower.includes(w)))
                return { value: 0.2, confidence: 0.8 };
            return { value: 0.5, confidence: 0.5 };
        },
    },
    {
        dimension: 'worry',
        patterns: [
            /I('m| am| feel) (really |so )?(worried|anxious|stressed|calm|peaceful)/i,
            /can't stop (worrying|thinking|obsessing)/i,
            /anxiety.*(through the roof|manageable|gone|under control)/i,
        ],
        extract: (match) => {
            const high = ['worried', 'anxious', 'stressed', "can't stop", 'through the roof'];
            const low = ['calm', 'peaceful', 'manageable', 'gone', 'under control'];
            const lower = match.toLowerCase();
            if (high.some((w) => lower.includes(w)))
                return { value: 0.8, confidence: 0.8 };
            if (low.some((w) => lower.includes(w)))
                return { value: 0.2, confidence: 0.8 };
            return { value: 0.5, confidence: 0.5 };
        },
    },
    {
        dimension: 'sleepQuality',
        patterns: [
            /slept (well|badly|terribly|great|like a baby|like crap)/i,
            /(insomnia|can't sleep|sleeping fine|sleep has been)/i,
            /haven't (slept|been sleeping)/i,
        ],
        extract: (match) => {
            const good = ['well', 'great', 'like a baby', 'fine'];
            const bad = ['badly', 'terribly', 'like crap', 'insomnia', "can't", "haven't"];
            const lower = match.toLowerCase();
            if (good.some((w) => lower.includes(w)))
                return { value: 0.8, confidence: 0.7 };
            if (bad.some((w) => lower.includes(w)))
                return { value: 0.2, confidence: 0.7 };
            return { value: 0.5, confidence: 0.5 };
        },
    },
    {
        dimension: 'loneliness',
        patterns: [
            /I('m| feel) (so |really )?(lonely|isolated|alone|connected)/i,
            /no one (understands|gets me|cares)/i,
            /(haven't seen|miss) (anyone|friends|family|people)/i,
        ],
        extract: (match) => {
            const high = ['lonely', 'isolated', 'alone', 'no one', "haven't seen", 'miss'];
            const low = ['connected'];
            const lower = match.toLowerCase();
            if (high.some((w) => lower.includes(w)))
                return { value: 0.8, confidence: 0.7 };
            if (low.some((w) => lower.includes(w)))
                return { value: 0.2, confidence: 0.7 };
            return { value: 0.5, confidence: 0.5 };
        },
    },
    {
        dimension: 'hopefulness',
        patterns: [
            /I('m| feel) (really |so )?(hopeful|hopeless|optimistic|pessimistic)/i,
            /(things will|it's going to) (get better|never change|work out)/i,
            /no point|what's the point|there's hope/i,
        ],
        extract: (match) => {
            const high = ['hopeful', 'optimistic', 'get better', 'work out', "there's hope"];
            const low = ['hopeless', 'pessimistic', 'never change', 'no point', "what's the point"];
            const lower = match.toLowerCase();
            if (high.some((w) => lower.includes(w)))
                return { value: 0.8, confidence: 0.8 };
            if (low.some((w) => lower.includes(w)))
                return { value: 0.2, confidence: 0.8 };
            return { value: 0.5, confidence: 0.5 };
        },
    },
];
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Record a wellbeing snapshot.
 * Persists to both in-memory cache and Firestore.
 */
export function recordSnapshot(userId, dimensions, options) {
    const snapshot = {
        id: `wb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId,
        timestamp: new Date(),
        source: options?.source || 'detected',
        dimensions,
        confidence: options?.confidence || {},
        conversationId: options?.conversationId,
        topic: options?.topic,
        notes: options?.notes,
    };
    // Store snapshot in memory
    if (!snapshots.has(userId)) {
        snapshots.set(userId, []);
    }
    snapshots.get(userId).push(snapshot);
    // Update profile
    updateProfile(userId, snapshot);
    // Persist to Firestore (async, non-blocking)
    void saveToFirestore(userId, snapshot).catch((err) => {
        log.warn({ error: String(err), userId }, 'Failed to persist snapshot to Firestore');
    });
    log.debug({ userId, dimensions: Object.keys(dimensions) }, 'Wellbeing snapshot recorded');
    return snapshot;
}
/**
 * Detect wellbeing signals from a message.
 */
export function detectWellbeing(message) {
    const result = {
        dimensions: {},
        confidence: {},
        signals: [],
    };
    for (const pattern of DETECTION_PATTERNS) {
        for (const regex of pattern.patterns) {
            const match = message.match(regex);
            if (match) {
                const { value, confidence } = pattern.extract(match[0], message);
                result.dimensions[pattern.dimension] = value;
                result.confidence[pattern.dimension] = confidence;
                result.signals.push({
                    dimension: pattern.dimension,
                    signal: match[0],
                    value,
                });
                break; // One match per dimension
            }
        }
    }
    return result;
}
/**
 * Get user's wellbeing profile.
 * Loads from Firestore if not in memory cache.
 */
export async function getWellbeingProfileAsync(userId) {
    // Check memory cache first
    if (userProfiles.has(userId)) {
        return userProfiles.get(userId);
    }
    // Try to load from Firestore
    const firestoreProfile = await loadProfileFromFirestore(userId);
    if (firestoreProfile) {
        userProfiles.set(userId, firestoreProfile);
        // Also load snapshots into memory
        const firestoreSnapshots = await loadFromFirestore(userId, 30);
        if (firestoreSnapshots.length > 0) {
            snapshots.set(userId, firestoreSnapshots);
        }
        return firestoreProfile;
    }
    // Create new profile
    return getOrCreateProfile(userId);
}
/**
 * Get user's wellbeing profile (sync version for backward compatibility).
 * Note: For new code, prefer getWellbeingProfileAsync.
 */
export function getWellbeingProfile(userId) {
    return getOrCreateProfile(userId);
}
/**
 * Get current wellbeing status.
 */
export function getCurrentWellbeing(userId) {
    const profile = getOrCreateProfile(userId);
    return profile.current?.dimensions || null;
}
/**
 * Get a natural assessment question.
 */
export function getAssessmentQuestion(dimension) {
    return NATURAL_ASSESSMENTS.find((a) => a.dimension === dimension) || null;
}
/**
 * Get all assessment questions.
 */
export function getAssessmentQuestions() {
    return NATURAL_ASSESSMENTS;
}
/**
 * Calculate trends for a dimension.
 */
export function calculateTrend(userId, dimension, periodDays = 7) {
    const userSnapshots = snapshots.get(userId) || [];
    const cutoff = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const relevantSnapshots = userSnapshots
        .filter((s) => s.timestamp >= cutoff && s.dimensions[dimension] !== undefined)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    if (relevantSnapshots.length < 3)
        return null;
    // Calculate trend using simple linear regression
    const values = relevantSnapshots.map((s) => s.dimensions[dimension]);
    const n = values.length;
    const meanX = (n - 1) / 2;
    const meanY = values.reduce((a, b) => a + b, 0) / n;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
        numerator += (i - meanX) * (values[i] - meanY);
        denominator += (i - meanX) ** 2;
    }
    const slope = denominator !== 0 ? numerator / denominator : 0;
    let direction = 'stable';
    if (slope > 0.02)
        direction = 'improving';
    else if (slope < -0.02)
        direction = 'declining';
    // Confidence based on sample size and variance
    const variance = values.reduce((sum, v) => sum + (v - meanY) ** 2, 0) / n;
    const confidence = Math.min(0.9, 0.5 + n / 20 - variance);
    return {
        dimension,
        direction,
        magnitude: Math.abs(slope),
        confidence: Math.max(0.3, confidence),
        periodDays,
    };
}
/**
 * Get a wellbeing summary for LLM context.
 */
export function getWellbeingContextInjection(userId) {
    const profile = getOrCreateProfile(userId);
    if (profile.totalSnapshots < 3) {
        return ''; // Not enough data
    }
    const current = profile.current?.dimensions || {};
    const trends = profile.weeklyTrends;
    const dimensionDescriptions = [];
    // Describe current state for key dimensions
    if (current.mood !== undefined) {
        const moodLevel = current.mood > 0.6 ? 'positive' : current.mood < 0.4 ? 'low' : 'moderate';
        dimensionDescriptions.push(`Mood: ${moodLevel}`);
    }
    if (current.energy !== undefined) {
        const energyLevel = current.energy > 0.6 ? 'good' : current.energy < 0.4 ? 'low' : 'moderate';
        dimensionDescriptions.push(`Energy: ${energyLevel}`);
    }
    if (current.worry !== undefined && current.worry > 0.6) {
        dimensionDescriptions.push('Elevated worry/anxiety');
    }
    // Describe trends
    const improvingDimensions = trends
        .filter((t) => t.direction === 'improving')
        .map((t) => t.dimension);
    const decliningDimensions = trends
        .filter((t) => t.direction === 'declining')
        .map((t) => t.dimension);
    let trendText = '';
    if (improvingDimensions.length > 0) {
        trendText += `\nImproving: ${improvingDimensions.join(', ')}`;
    }
    if (decliningDimensions.length > 0) {
        trendText += `\nWatch: ${decliningDimensions.join(', ')}`;
    }
    if (dimensionDescriptions.length === 0 && !trendText) {
        return '';
    }
    return `[📊 WELLBEING CONTEXT]
${dimensionDescriptions.join(' | ')}${trendText}

Adjust your approach based on their current state.`;
}
/**
 * Get overall wellbeing score (0-100).
 */
export function getOverallScore(userId) {
    const profile = getOrCreateProfile(userId);
    if (!profile.current?.dimensions)
        return null;
    const dims = profile.current.dimensions;
    const weights = {
        mood: 0.2,
        energy: 0.15,
        moodStability: 0.1,
        motivation: 0.1,
        worry: -0.15, // Inverted - lower is better
        loneliness: -0.1,
        hopefulness: 0.1,
        sleepQuality: 0.1,
    };
    let score = 50; // Start at middle
    let totalWeight = 0;
    for (const [dim, weight] of Object.entries(weights)) {
        const value = dims[dim];
        if (value !== undefined) {
            score += value * weight * 100;
            totalWeight += Math.abs(weight);
        }
    }
    // Normalize
    if (totalWeight > 0) {
        score = Math.round(score);
    }
    return Math.max(0, Math.min(100, score));
}
// ============================================================================
// INTERNAL HELPERS
// ============================================================================
function getOrCreateProfile(userId) {
    if (!userProfiles.has(userId)) {
        userProfiles.set(cleanForFirestore(userId), {
            userId,
            current: null,
            personalBaseline: null,
            weeklyTrends: [],
            monthlyTrends: [],
            totalSnapshots: 0,
            firstSnapshot: null,
            lastSnapshot: null,
        });
    }
    return userProfiles.get(userId);
}
function updateProfile(userId, snapshot) {
    const profile = getOrCreateProfile(userId);
    // Update current
    profile.current = snapshot;
    // Update metadata
    profile.totalSnapshots++;
    if (!profile.firstSnapshot)
        profile.firstSnapshot = snapshot.timestamp;
    profile.lastSnapshot = snapshot.timestamp;
    // Update trends periodically
    if (profile.totalSnapshots % 5 === 0) {
        updateTrends(userId);
    }
    // Update baseline periodically
    if (profile.totalSnapshots % 10 === 0) {
        updateBaseline(userId);
    }
    // Persist profile to Firestore (async, non-blocking)
    void saveProfileToFirestore(userId, profile).catch((err) => {
        log.warn({ error: String(err), userId }, 'Failed to persist profile to Firestore');
    });
}
function updateTrends(userId) {
    const profile = getOrCreateProfile(userId);
    const dimensions = [
        'mood',
        'energy',
        'worry',
        'loneliness',
        'hopefulness',
        'sleepQuality',
    ];
    profile.weeklyTrends = dimensions
        .map((dim) => calculateTrend(userId, dim, 7))
        .filter((t) => t !== null);
    profile.monthlyTrends = dimensions
        .map((dim) => calculateTrend(userId, dim, 30))
        .filter((t) => t !== null);
}
function updateBaseline(userId) {
    const profile = getOrCreateProfile(userId);
    const userSnapshots = snapshots.get(userId) || [];
    if (userSnapshots.length < 10)
        return;
    // Calculate baseline from all snapshots
    const baseline = {
        mood: 0,
        moodStability: 0,
        energy: 0,
        motivation: 0,
        worry: 0,
        physicalTension: 0,
        loneliness: 0,
        socialSatisfaction: 0,
        meaningfulness: 0,
        hopefulness: 0,
        sleepQuality: 0,
        selfCareLevel: 0,
    };
    const counts = { ...baseline };
    for (const snapshot of userSnapshots) {
        for (const [dim, value] of Object.entries(snapshot.dimensions)) {
            if (value !== undefined) {
                baseline[dim] += value;
                counts[dim]++;
            }
        }
    }
    // Calculate averages
    for (const dim of Object.keys(baseline)) {
        if (counts[dim] > 0) {
            baseline[dim] = baseline[dim] / counts[dim];
        }
    }
    profile.personalBaseline = {
        userId,
        dimensions: baseline,
        sampleCount: userSnapshots.length,
        lastUpdated: new Date(),
    };
}
/**
 * Process a message for wellbeing signals.
 * This is the main integration point for the context builder.
 */
export function processForWellbeing(userId, message, context) {
    // Detect signals from the message
    const detected = detectWellbeing(message);
    const alerts = [];
    // Record snapshot if we detected anything
    if (Object.keys(detected.dimensions).length > 0) {
        recordSnapshot(userId, detected.dimensions, {
            source: 'detected',
            confidence: detected.confidence,
            topic: context?.topic,
        });
    }
    // Check for concerning signals and generate alerts
    if (detected.dimensions.hopefulness !== undefined && detected.dimensions.hopefulness < 0.3) {
        alerts.push({
            dimension: 'hopefulness',
            severity: 'urgent',
            message: 'User expressing low hopefulness - be especially supportive',
        });
    }
    if (detected.dimensions.loneliness !== undefined && detected.dimensions.loneliness > 0.7) {
        alerts.push({
            dimension: 'loneliness',
            severity: 'notice',
            message: 'User expressing loneliness - emphasize connection',
        });
    }
    if (detected.dimensions.worry !== undefined && detected.dimensions.worry > 0.7) {
        alerts.push({
            dimension: 'worry',
            severity: 'notice',
            message: 'User expressing high anxiety - consider grounding techniques',
        });
    }
    // Get profile and trends
    const profile = getOrCreateProfile(userId);
    let overallTrend = null;
    if (profile.weeklyTrends.length > 0) {
        const decliningCount = profile.weeklyTrends.filter((t) => t.direction === 'declining').length;
        const improvingCount = profile.weeklyTrends.filter((t) => t.direction === 'improving').length;
        let trend = 'stable';
        if (decliningCount > improvingCount + 1) {
            trend = 'declining';
        }
        else if (improvingCount > decliningCount + 1) {
            trend = 'improving';
        }
        overallTrend = {
            trend,
            currentState: profile.current?.dimensions ?? {},
        };
    }
    // Generate LLM context
    let llmContext = null;
    if (detected.signals.length > 0 || alerts.length > 0) {
        const parts = ['[📊 WELLBEING SIGNALS]'];
        if (detected.signals.length > 0) {
            parts.push(`Detected: ${detected.signals.map((s) => `${s.dimension} (${s.signal})`).join(', ')}`);
        }
        if (alerts.length > 0) {
            parts.push(`Alerts: ${alerts.map((a) => a.message).join('; ')}`);
        }
        if (overallTrend?.trend === 'declining') {
            parts.push('Weekly trend: declining - be especially attentive');
        }
        llmContext = parts.join('\n');
    }
    else {
        // Check if we should still inject context from profile
        llmContext = getWellbeingContextInjection(userId) || null;
    }
    return {
        signals: detected.signals,
        alerts,
        llmContext,
        summary: overallTrend,
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
// ============================================================================
// ADDITIONAL EXPORTS FOR API & SCHEDULED JOBS
// ============================================================================
/**
 * Get recent snapshots for a user
 */
export function getRecentSnapshots(userId, days = 7) {
    const userSnapshots = snapshots.get(userId) || [];
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return userSnapshots
        .filter((s) => s.timestamp >= cutoff)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}
/**
 * Get all wellbeing profiles (for batch processing)
 */
export function getAllWellbeingProfiles() {
    return Array.from(userProfiles.values());
}
/**
 * Get users who need a check-in nudge
 */
export function getUsersNeedingCheckIn(options) {
    const { minDaysSinceCheckIn, maxDaysSinceCheckIn } = options;
    const now = Date.now();
    const eligible = [];
    for (const [userId, profile] of userProfiles.entries()) {
        const userSnapshots = snapshots.get(userId) || [];
        if (userSnapshots.length === 0)
            continue;
        const lastSnapshot = userSnapshots[userSnapshots.length - 1];
        const daysSince = (now - lastSnapshot.timestamp.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince >= minDaysSinceCheckIn && daysSince <= maxDaysSinceCheckIn) {
            eligible.push(userId);
        }
    }
    return eligible;
}
/**
 * Get last check-in time for a user
 */
export function getLastCheckInTime(userId) {
    const userSnapshots = snapshots.get(userId) || [];
    if (userSnapshots.length === 0)
        return null;
    return userSnapshots[userSnapshots.length - 1].timestamp;
}
export const wellbeingTracker = {
    record: recordSnapshot,
    detect: detectWellbeing,
    getProfile: getWellbeingProfile,
    getProfileAsync: getWellbeingProfileAsync,
    getCurrent: getCurrentWellbeing,
    getQuestion: getAssessmentQuestion,
    getQuestions: getAssessmentQuestions,
    getTrend: calculateTrend,
    getScore: getOverallScore,
    getContextInjection: getWellbeingContextInjection,
    getRecentSnapshots,
    getAllProfiles: getAllWellbeingProfiles,
    getUsersNeedingCheckIn,
    getLastCheckInTime,
};
export default wellbeingTracker;
//# sourceMappingURL=index.js.map