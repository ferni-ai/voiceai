/**
 * Anticipatory Planning Intelligence
 *
 * "No one else sees your life transitions coming before you do."
 *
 * This service detects upcoming life transitions from conversation patterns
 * and cross-team data, suggesting planning before users think to ask:
 * - Empty nest approaching (kids' graduation dates, college talk)
 * - Retirement window (age, mentions of "when I retire")
 * - Major anniversaries coming
 * - Life stage shifts (newlywed → family planning, career peak → legacy planning)
 *
 * Better Than Human: We see patterns across all conversations and can anticipate
 * life transitions that humans don't consciously track.
 *
 * @module services/superhuman/anticipatory-planning
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';
const log = createLogger({ module: 'superhuman:anticipatory-planning' });
// ============================================================================
// TRANSITION DETECTION PATTERNS
// ============================================================================
const TRANSITION_PATTERNS = {
    empty_nest: {
        keywords: ['college', 'leaving home', 'dorm', 'graduation', 'nest', 'empty'],
        phrases: [
            'last one leaving',
            'off to college',
            'moving out',
            'house will be quiet',
            'just the two of us',
            'kids growing up',
        ],
        demographicHints: (d) => (d?.kidsAges?.some((age) => age >= 16 && age <= 20) ?? false),
        suggestedPlanning: [
            'Celebrate the transition (graduation party, send-off)',
            'Plan the first empty-nest date night',
            'Think about redefining the space (their room)',
            'Consider new activities as a couple',
        ],
        exploratoryQuestions: [
            "How are you feeling about the upcoming change?",
            "What are you looking forward to?",
            "Is there any grief mixed with the excitement?",
        ],
        relevantTeam: [
            { persona: 'jordan', why: 'Life milestone planning' },
            { persona: 'nayan', why: 'Processing the identity shift' },
            { persona: 'maya', why: 'Building new routines' },
        ],
    },
    retirement: {
        keywords: ['retire', 'retirement', 'pension', '401k', 'social security'],
        phrases: [
            'when I retire',
            'after I stop working',
            'few more years',
            'golden years',
            'leaving work',
            'winding down career',
        ],
        demographicHints: (d) => (d?.birthYear ? new Date().getFullYear() - d.birthYear >= 55 : false),
        suggestedPlanning: [
            'Retirement party/celebration',
            'First week of retirement plans',
            'Bucket list prioritization',
            'New routine development',
            'Legacy/purpose planning',
        ],
        exploratoryQuestions: [
            "What does retirement look like in your mind?",
            "What do you want your days to look like?",
            "Any fears or concerns about the transition?",
        ],
        relevantTeam: [
            { persona: 'jordan', why: 'Milestone celebration planning' },
            { persona: 'peter', why: 'Financial readiness review' },
            { persona: 'nayan', why: 'Purpose and legacy exploration' },
            { persona: 'maya', why: 'Building fulfilling routines' },
        ],
    },
    new_parent: {
        keywords: ['pregnant', 'baby', 'expecting', 'nursery', 'due date'],
        phrases: [
            'having a baby',
            "we're expecting",
            'due in',
            'preparing the nursery',
            'parenting',
            'first child',
        ],
        demographicHints: () => false, // Can't predict from demographics alone
        suggestedPlanning: [
            'Baby shower',
            'Nursery setup timeline',
            'Parental leave planning',
            '100-day celebration',
            'Support system setup',
        ],
        exploratoryQuestions: [
            "How are you feeling about becoming a parent?",
            "What kind of support would be most helpful?",
            "Any traditions you want to start?",
        ],
        relevantTeam: [
            { persona: 'jordan', why: 'Milestone planning and celebration' },
            { persona: 'maya', why: 'Building sustainable routines' },
            { persona: 'nayan', why: 'Identity evolution work' },
        ],
    },
    wedding_planning: {
        keywords: ['engaged', 'wedding', 'fiance', 'fiancee', 'marriage', 'proposal'],
        phrases: [
            'getting married',
            'wedding planning',
            'said yes',
            'save the date',
            'wedding venue',
            'bridal',
        ],
        demographicHints: () => false,
        suggestedPlanning: [
            'Wedding planning timeline',
            'Budget and priority setting',
            'Engagement party',
            'Wedding party selection',
            'Venue and vendor research',
        ],
        exploratoryQuestions: [
            "What's most important to you for the big day?",
            "How are you feeling about all the planning?",
            "Any family dynamics to navigate?",
        ],
        relevantTeam: [
            { persona: 'jordan', why: 'Event planning expertise' },
            { persona: 'peter', why: 'Budget planning' },
            { persona: 'alex', why: 'Communication and coordination' },
        ],
    },
    career_change: {
        keywords: ['new job', 'career change', 'promotion', 'quit', 'resignation'],
        phrases: [
            'looking for new opportunities',
            'updating my resume',
            'interviewing',
            'starting fresh',
            'career pivot',
            'leaving my job',
        ],
        demographicHints: () => false,
        suggestedPlanning: [
            'Last day celebration at current job',
            'First 90 days plan',
            'New chapter marker',
            'Skills development roadmap',
        ],
        exploratoryQuestions: [
            "What's driving the change?",
            "What are you hoping for in the new chapter?",
            "Any fears or excitement to process?",
        ],
        relevantTeam: [
            { persona: 'jordan', why: 'Milestone marking' },
            { persona: 'maya', why: 'New routine development' },
            { persona: 'nayan', why: 'Purpose alignment' },
        ],
    },
    relocation: {
        keywords: ['moving', 'relocation', 'new city', 'packing', 'selling house'],
        phrases: [
            'moving to',
            'relocating',
            'new home',
            'leaving town',
            'starting over in',
            'house hunting',
        ],
        demographicHints: () => false,
        suggestedPlanning: [
            'Goodbye gatherings',
            'Moving timeline and checklist',
            'New community exploration',
            'Housewarming planning',
        ],
        exploratoryQuestions: [
            "What's prompting the move?",
            "What will you miss most?",
            "What are you excited about?",
        ],
        relevantTeam: [
            { persona: 'jordan', why: 'Move planning and celebration' },
            { persona: 'alex', why: 'Communication and logistics' },
            { persona: 'maya', why: 'Building new routines' },
        ],
    },
    health_journey: {
        keywords: ['diagnosis', 'treatment', 'surgery', 'recovery', 'health'],
        phrases: [
            'health scare',
            'getting healthier',
            'weight loss journey',
            'fitness goal',
            'doctor said',
        ],
        demographicHints: () => false,
        suggestedPlanning: [
            'Health milestone celebrations',
            'Support system coordination',
            'Recovery timeline',
            'Wellness routine development',
        ],
        exploratoryQuestions: [
            "How are you feeling about this journey?",
            "What support would help most?",
            "What milestones would be meaningful to mark?",
        ],
        relevantTeam: [
            { persona: 'jordan', why: 'Milestone tracking' },
            { persona: 'maya', why: 'Habit development' },
            { persona: 'nayan', why: 'Emotional processing' },
        ],
    },
    divorce_transition: {
        keywords: ['divorce', 'separated', 'custody', 'settlement'],
        phrases: [
            'getting divorced',
            "marriage ending",
            'separated',
            'moving forward',
            'new chapter after',
        ],
        demographicHints: () => false,
        suggestedPlanning: [
            'Closure rituals',
            'New chapter celebration (when ready)',
            'One-year milestone of fresh start',
            'Support circle gathering',
        ],
        exploratoryQuestions: [
            "How are you holding up?",
            "What does moving forward look like for you?",
            "What support would be helpful right now?",
        ],
        relevantTeam: [
            { persona: 'nayan', why: 'Deep emotional processing' },
            { persona: 'jordan', why: 'Fresh start milestone planning' },
            { persona: 'maya', why: 'Building new routines' },
        ],
    },
    loss_grief: {
        keywords: ['passed away', 'died', 'loss', 'grief', 'mourning', 'memorial'],
        phrases: [
            'lost my',
            'dealing with loss',
            'in mourning',
            'anniversary of passing',
            'memorial',
        ],
        demographicHints: () => false,
        suggestedPlanning: [
            'Memorial planning',
            'Anniversary of loss acknowledgment',
            'Legacy preservation',
            'Grief milestone markers',
        ],
        exploratoryQuestions: [
            "How can I support you right now?",
            "Would you like to talk about them?",
            "Are there ways you want to honor their memory?",
        ],
        relevantTeam: [
            { persona: 'nayan', why: 'Grief and wisdom processing' },
            { persona: 'jordan', why: 'Memorial and remembrance planning' },
            { persona: 'ferni', why: 'General support and listening' },
        ],
    },
    financial_milestone: {
        keywords: ['paid off', 'debt free', 'savings goal', 'investment'],
        phrases: [
            'paid off my',
            'debt free',
            'hit my savings goal',
            'financial independence',
            'emergency fund complete',
        ],
        demographicHints: () => false,
        suggestedPlanning: [
            'Celebration of achievement',
            'Next financial goal setting',
            'Lifestyle adjustment planning',
        ],
        exploratoryQuestions: [
            "How does this achievement feel?",
            "What made this possible?",
            "What's the next goal?",
        ],
        relevantTeam: [
            { persona: 'peter', why: 'Financial planning' },
            { persona: 'jordan', why: 'Celebration planning' },
            { persona: 'maya', why: 'Sustaining the habits that got you here' },
        ],
    },
    education_milestone: {
        keywords: ['graduate', 'degree', 'diploma', 'thesis', 'commencement'],
        phrases: [
            'graduating',
            'finishing school',
            'getting my degree',
            'dissertation defense',
            'completed my',
        ],
        demographicHints: () => false,
        suggestedPlanning: [
            'Graduation celebration',
            'Achievement documentation',
            'Next chapter planning',
            'Thank you notes to supporters',
        ],
        exploratoryQuestions: [
            "How does it feel to be finishing?",
            "What doors does this open?",
            "Who do you want to celebrate with?",
        ],
        relevantTeam: [
            { persona: 'jordan', why: 'Celebration planning' },
            { persona: 'nayan', why: 'Reflection on the journey' },
        ],
    },
    relationship_milestone: {
        keywords: ['anniversary', 'together', 'dating', 'years married'],
        phrases: [
            'anniversary coming up',
            'years together',
            'celebrating our',
            'milestone anniversary',
        ],
        demographicHints: (d) => (d?.relationshipDuration ? d.relationshipDuration % 5 === 0 : false),
        suggestedPlanning: [
            'Anniversary celebration',
            'Memory lane experience',
            'Recommitment ritual',
            'Photo/memory compilation',
        ],
        exploratoryQuestions: [
            "Any special way you want to mark this?",
            "What's the most meaningful part of your journey together?",
        ],
        relevantTeam: [
            { persona: 'jordan', why: 'Anniversary celebration planning' },
        ],
    },
    starting_business: {
        keywords: ['startup', 'business', 'entrepreneur', 'launch', 'founding'],
        phrases: [
            'starting a business',
            'launching my',
            'building my company',
            'going out on my own',
            'entrepreneurship',
        ],
        demographicHints: () => false,
        suggestedPlanning: [
            'Launch celebration',
            'First customer celebration',
            'One-year business anniversary',
            'Milestone markers',
        ],
        exploratoryQuestions: [
            "What inspired this venture?",
            "What support do you need?",
            "How do you want to celebrate wins along the way?",
        ],
        relevantTeam: [
            { persona: 'jordan', why: 'Business milestone planning' },
            { persona: 'peter', why: 'Financial planning' },
            { persona: 'maya', why: 'Sustainable work habits' },
        ],
    },
    downsizing: {
        keywords: ['downsize', 'smaller home', 'declutter', 'simplify'],
        phrases: [
            'downsizing',
            'smaller place',
            'less space',
            'simplifying life',
            'getting rid of stuff',
        ],
        demographicHints: (d) => (d?.birthYear ? new Date().getFullYear() - d.birthYear >= 60 : false),
        suggestedPlanning: [
            'Decluttering timeline',
            'Memory preservation for items being let go',
            'New space celebration',
        ],
        exploratoryQuestions: [
            "What's driving this change?",
            "What's hardest to let go of?",
            "What are you most looking forward to?",
        ],
        relevantTeam: [
            { persona: 'jordan', why: 'Transition planning' },
            { persona: 'nayan', why: 'Processing attachment to things' },
        ],
    },
    caregiving: {
        keywords: ['caring for', 'caregiver', 'aging parent', 'assisted living'],
        phrases: [
            'taking care of my',
            'mom/dad needs help',
            'becoming a caregiver',
            'parent health',
            'elder care',
        ],
        demographicHints: () => false,
        suggestedPlanning: [
            'Support system planning',
            'Self-care scheduling',
            'Caregiver milestones recognition',
        ],
        exploratoryQuestions: [
            "How are you managing this new role?",
            "What support do you need?",
            "Are you making time for yourself?",
        ],
        relevantTeam: [
            { persona: 'nayan', why: 'Processing complex emotions' },
            { persona: 'maya', why: 'Sustainable routines' },
            { persona: 'jordan', why: 'Planning and scheduling' },
        ],
    },
    recovery_journey: {
        keywords: ['sober', 'recovery', 'addiction', 'sobriety', 'clean'],
        phrases: [
            'in recovery',
            'getting sober',
            'staying clean',
            'sobriety date',
            'one day at a time',
        ],
        demographicHints: () => false,
        suggestedPlanning: [
            'Milestone celebrations (30, 60, 90 days, 1 year, etc.)',
            'Support system strengthening',
            'New chapter markers',
        ],
        exploratoryQuestions: [
            "How can I support your journey?",
            "What milestones would be meaningful to mark?",
            "What's helping you stay strong?",
        ],
        relevantTeam: [
            { persona: 'jordan', why: 'Milestone celebration' },
            { persona: 'maya', why: 'Building healthy habits' },
            { persona: 'nayan', why: 'Deep processing and purpose' },
        ],
    },
};
// ============================================================================
// STORAGE
// ============================================================================
const COLLECTION = 'anticipatory_planning';
async function loadAnticipatoryProfile(userId) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const doc = await db.collection('bogle_users').doc(userId).collection(COLLECTION).doc('profile').get();
        if (doc.exists) {
            return doc.data();
        }
        return null;
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to load anticipatory planning profile');
        return null;
    }
}
async function saveAnticipatoryProfile(userId, profile) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection(COLLECTION)
            .doc('profile')
            .set({
            ...profile,
            lastUpdated: new Date().toISOString(),
        });
        log.debug({ userId }, 'Saved anticipatory planning profile');
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to save anticipatory planning profile');
    }
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Detect transition signals from user text
 */
export function detectTransitionSignals(text) {
    const detected = [];
    const textLower = text.toLowerCase();
    for (const [transition, pattern] of Object.entries(TRANSITION_PATTERNS)) {
        const triggers = [];
        // Check keywords
        for (const keyword of pattern.keywords) {
            if (textLower.includes(keyword.toLowerCase())) {
                triggers.push(keyword);
            }
        }
        // Check phrases
        for (const phrase of pattern.phrases) {
            if (textLower.includes(phrase.toLowerCase())) {
                triggers.push(phrase);
            }
        }
        if (triggers.length > 0) {
            detected.push({
                transition: transition,
                triggers,
                weight: Math.min(1, triggers.length * 0.3),
            });
        }
    }
    return detected;
}
/**
 * Record a transition signal from conversation analysis
 */
export async function recordTransitionSignal(userId, transition, triggers, source = 'conversation') {
    const profile = (await loadAnticipatoryProfile(userId)) || createDefaultProfile(userId);
    const signal = {
        transition,
        triggers,
        detectedAt: new Date().toISOString(),
        source,
        weight: Math.min(1, triggers.length * 0.3),
    };
    profile.signals.push(signal);
    // Recompute predictions
    profile.predictions = computePredictions(profile);
    await saveAnticipatoryProfile(userId, profile);
    log.info({ userId, transition, triggerCount: triggers.length }, 'Recorded transition signal');
}
/**
 * Update user demographics for better predictions
 */
export async function updateDemographics(userId, demographics) {
    const profile = (await loadAnticipatoryProfile(userId)) || createDefaultProfile(userId);
    profile.demographics = { ...profile.demographics, ...demographics };
    profile.predictions = computePredictions(profile);
    await saveAnticipatoryProfile(userId, profile);
    log.info({ userId }, 'Updated demographics for anticipatory planning');
}
/**
 * Get transitions worth discussing with the user
 */
export async function getAnticipatedTransitions(userId, minConfidence = 0.4) {
    const profile = await loadAnticipatoryProfile(userId);
    if (!profile)
        return [];
    // Filter by confidence and exclude already surfaced (unless user acknowledged)
    return profile.predictions.filter((p) => {
        if (p.confidence < minConfidence)
            return false;
        const surfaced = profile.surfacedTransitions.find((s) => s.transition === p.transition);
        // If we surfaced it and user said "not ready" or "inaccurate", don't resurface
        if (surfaced && ['not_ready', 'inaccurate'].includes(surfaced.userResponse)) {
            // Unless it's been 90+ days
            const daysSince = (Date.now() - new Date(surfaced.surfacedAt).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSince < 90)
                return false;
        }
        return true;
    });
}
/**
 * Mark a transition as surfaced to the user
 */
export async function markTransitionSurfaced(userId, transition, userResponse = 'unknown') {
    const profile = await loadAnticipatoryProfile(userId);
    if (!profile)
        return;
    // Update or add surfaced record
    const existingIdx = profile.surfacedTransitions.findIndex((s) => s.transition === transition);
    const record = {
        transition,
        surfacedAt: new Date().toISOString(),
        userResponse,
    };
    if (existingIdx >= 0) {
        profile.surfacedTransitions[existingIdx] = record;
    }
    else {
        profile.surfacedTransitions.push(record);
    }
    await saveAnticipatoryProfile(userId, profile);
    log.info({ userId, transition, userResponse }, 'Marked transition as surfaced');
}
/**
 * Build context string for LLM injection
 */
export async function buildAnticipatoryPlanningContext(userId) {
    const anticipated = await getAnticipatedTransitions(userId);
    if (anticipated.length === 0)
        return '';
    const lines = ['[ANTICIPATORY PLANNING - Better Than Human]'];
    lines.push("You see life transitions coming before they're consciously planned:\n");
    for (const prediction of anticipated.slice(0, 3)) {
        const pattern = TRANSITION_PATTERNS[prediction.transition];
        lines.push(`🔮 ${formatTransitionName(prediction.transition)} (${Math.round(prediction.confidence * 100)}% confidence)`);
        lines.push(`   Timeframe: ${prediction.estimatedTimeframe}`);
        lines.push(`   Signals: ${prediction.signals.slice(-3).map(s => s.triggers[0]).join(', ')}`);
        if (prediction.suggestedPlanning.length > 0) {
            lines.push(`   💡 Worth planning: ${prediction.suggestedPlanning[0]}`);
        }
        if (prediction.exploratoryQuestions.length > 0) {
            lines.push(`   ❓ Explore gently: "${prediction.exploratoryQuestions[0]}"`);
        }
        lines.push('');
    }
    lines.push('Use this to offer proactive planning support - but be gentle. These are predictions, not certainties.');
    return lines.join('\n');
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function createDefaultProfile(userId) {
    return {
        userId,
        signals: [],
        predictions: [],
        anticipatedMilestones: [],
        surfacedTransitions: [],
        lastUpdated: new Date().toISOString(),
    };
}
function computePredictions(profile) {
    const transitionWeights = {};
    // Aggregate signals by transition
    for (const signal of profile.signals) {
        if (!transitionWeights[signal.transition]) {
            transitionWeights[signal.transition] = { weight: 0, signals: [] };
        }
        // Decay weight over time (signals older than 30 days get reduced)
        const daysSinceSignal = (Date.now() - new Date(signal.detectedAt).getTime()) / (1000 * 60 * 60 * 24);
        const decayedWeight = signal.weight * Math.exp(-daysSinceSignal / 60); // 60-day half-life
        transitionWeights[signal.transition].weight += decayedWeight;
        transitionWeights[signal.transition].signals.push(signal);
    }
    // Check demographic hints
    if (profile.demographics) {
        for (const [transition, pattern] of Object.entries(TRANSITION_PATTERNS)) {
            if (pattern.demographicHints(profile.demographics)) {
                if (!transitionWeights[transition]) {
                    transitionWeights[transition] = { weight: 0, signals: [] };
                }
                transitionWeights[transition].weight += 0.2;
            }
        }
    }
    // Convert to predictions
    const predictions = [];
    for (const [transition, data] of Object.entries(transitionWeights)) {
        const t = transition;
        const pattern = TRANSITION_PATTERNS[t];
        const confidence = Math.min(1, data.weight);
        if (confidence >= 0.3) {
            predictions.push({
                transition: t,
                confidence,
                estimatedTimeframe: estimateTimeframe(t, data.signals),
                signals: data.signals,
                suggestedPlanning: pattern.suggestedPlanning,
                exploratoryQuestions: pattern.exploratoryQuestions,
                relevantTeamMembers: pattern.relevantTeam,
                updatedAt: new Date().toISOString(),
            });
        }
    }
    // Sort by confidence
    return predictions.sort((a, b) => b.confidence - a.confidence);
}
function estimateTimeframe(transition, signals) {
    // Simple heuristic - if signals are recent and frequent, transition is imminent
    if (signals.length === 0)
        return 'Unknown';
    const recentSignals = signals.filter((s) => {
        const daysSince = (Date.now() - new Date(s.detectedAt).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince < 30;
    });
    if (recentSignals.length >= 3)
        return 'Imminent (within weeks)';
    if (recentSignals.length >= 2)
        return 'Near-term (1-3 months)';
    if (signals.length >= 2)
        return 'Medium-term (3-6 months)';
    return 'Longer-term (6+ months)';
}
function formatTransitionName(transition) {
    return transition
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
// ============================================================================
// SERVICE EXPORT
// ============================================================================
export const anticipatoryPlanning = {
    detectTransitionSignals,
    recordTransitionSignal,
    updateDemographics,
    getAnticipatedTransitions,
    markTransitionSurfaced,
    buildAnticipatoryPlanningContext,
    loadAnticipatoryProfile,
};
export default anticipatoryPlanning;
//# sourceMappingURL=anticipatory-planning.js.map