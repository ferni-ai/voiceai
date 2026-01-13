/**
 * Open Loops - Proactive Intelligence V3.2
 *
 * Tracks "open loops" - things that need follow-up:
 * - Advice given (already in counterfactual, but surfacing logic here)
 * - User-stated intentions ("I'm going to talk to her tomorrow")
 * - Emotional peaks (check in after a crisis)
 * - Life events mentioned (job interview, doctor visit)
 * - Questions asked but not answered
 *
 * @module services/superhuman/semantic-intelligence/open-loops
 */
import { createLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../firestore-utils.js';
import { createInsight } from './insight-broker.js';
import { onCoachingInsightChange } from '../../data-layer/hooks/coaching-hooks.js';
const log = createLogger({ module: 'open-loops' });
// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    MAX_OPEN_LOOPS: 30,
    MAX_FOLLOW_UPS: 3, // Don't nag more than this
    // Default follow-up windows by type (in hours)
    FOLLOW_UP_WINDOWS: {
        advice: { after: 72, before: 336 }, // 3-14 days
        intention: { after: 24, before: 168 }, // 1-7 days
        emotional_peak: { after: 4, before: 48 }, // 4-48 hours
        life_event: { after: 2, before: 72 }, // 2-72 hours (depends on event)
        question: { after: 168, before: 720 }, // 1-4 weeks
        commitment: { after: 48, before: 336 }, // 2-14 days
        concern: { after: 24, before: 168 }, // 1-7 days
    },
    // Priority by type (base priority)
    TYPE_PRIORITY: {
        emotional_peak: 9,
        life_event: 8,
        commitment: 7,
        concern: 7,
        intention: 6,
        advice: 5,
        question: 4,
    },
};
// ============================================================================
// CACHE
// ============================================================================
const loopCache = new Map();
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Create a new open loop.
 */
export async function createOpenLoop(userId, loop) {
    const now = new Date();
    const id = `loop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const window = CONFIG.FOLLOW_UP_WINDOWS[loop.type];
    const afterHours = loop.followUpAfterHours ?? window.after;
    const beforeHours = loop.followUpBeforeHours ?? window.before;
    const openLoop = {
        id,
        userId,
        type: loop.type,
        content: loop.content,
        context: loop.context,
        created: now,
        followUpAfter: new Date(now.getTime() + afterHours * 60 * 60 * 1000),
        followUpBefore: new Date(now.getTime() + beforeHours * 60 * 60 * 1000),
        status: 'open',
        priority: loop.priority ?? CONFIG.TYPE_PRIORITY[loop.type],
        followUpCount: 0,
        relatedPerson: loop.relatedPerson,
        relatedTopic: loop.relatedTopic,
        emotionAtCreation: loop.emotionAtCreation,
    };
    // Save
    await saveOpenLoop(userId, openLoop);
    // Update cache
    const cached = loopCache.get(userId) ?? [];
    cached.push(openLoop);
    loopCache.set(userId, cached);
    // Create proactive insight for follow-up
    await createFollowUpInsight(userId, openLoop);
    log.debug({ userId, type: loop.type, priority: openLoop.priority }, '🔄 Open loop created');
    return openLoop;
}
/**
 * Get open loops that are ready for follow-up.
 */
export async function getLoopsReadyForFollowUp(userId) {
    const loops = await loadOpenLoops(userId);
    const now = new Date();
    return loops
        .filter((loop) => {
        if (loop.status !== 'open')
            return false;
        if (now < loop.followUpAfter)
            return false;
        if (now > loop.followUpBefore)
            return false;
        if (loop.followUpCount >= CONFIG.MAX_FOLLOW_UPS)
            return false;
        return true;
    })
        .sort((a, b) => b.priority - a.priority);
}
/**
 * Mark a loop as followed up.
 */
export async function markFollowedUp(userId, loopId) {
    const loops = await loadOpenLoops(userId);
    const loop = loops.find((l) => l.id === loopId);
    if (loop) {
        loop.followUpCount++;
        loop.lastFollowUp = new Date();
        loop.status = 'followed_up';
        await saveOpenLoop(userId, loop);
        log.debug({ userId, loopId, count: loop.followUpCount }, '✅ Loop followed up');
    }
}
/**
 * Resolve an open loop.
 */
export async function resolveLoop(userId, loopId, resolution) {
    const loops = await loadOpenLoops(userId);
    const loop = loops.find((l) => l.id === loopId);
    if (loop) {
        loop.status = 'resolved';
        loop.resolved = true;
        loop.resolvedAt = new Date();
        loop.resolution = resolution;
        await saveOpenLoop(userId, loop);
        log.debug({ userId, loopId, resolution: resolution?.slice(0, 50) }, '✅ Loop resolved');
    }
}
/**
 * Dismiss a loop (user doesn't want follow-up).
 */
export async function dismissLoop(userId, loopId) {
    const loops = await loadOpenLoops(userId);
    const loop = loops.find((l) => l.id === loopId);
    if (loop) {
        loop.status = 'dismissed';
        await saveOpenLoop(userId, loop);
        log.debug({ userId, loopId }, '🚫 Loop dismissed');
    }
}
/**
 * Get all open loops for a user.
 */
export async function getAllOpenLoops(userId) {
    const loops = await loadOpenLoops(userId);
    return loops.filter((l) => l.status === 'open');
}
/**
 * Get open loops by type.
 */
export async function getLoopsByType(userId, type) {
    const loops = await loadOpenLoops(userId);
    return loops.filter((l) => l.type === type && l.status === 'open');
}
// ============================================================================
// INTENTION DETECTION
// ============================================================================
const INTENTION_PATTERNS = [
    // "I'm going to..."
    { pattern: /\bi(?:'m| am) going to (\w+(?:\s+\w+){0,5})/i, type: 'intention' },
    { pattern: /\bi(?:'m| am) gonna (\w+(?:\s+\w+){0,5})/i, type: 'intention' },
    // "I will..."
    { pattern: /\bi(?:'ll| will) (\w+(?:\s+\w+){0,5})/i, type: 'intention' },
    // "I plan to..."
    { pattern: /\bi plan to (\w+(?:\s+\w+){0,5})/i, type: 'intention' },
    { pattern: /\bi(?:'m| am) planning to (\w+(?:\s+\w+){0,5})/i, type: 'intention' },
    // "I need to..."
    { pattern: /\bi need to (\w+(?:\s+\w+){0,5})/i, type: 'commitment' },
    { pattern: /\bi have to (\w+(?:\s+\w+){0,5})/i, type: 'commitment' },
    { pattern: /\bi should (\w+(?:\s+\w+){0,5})/i, type: 'intention' },
    // Time-specific
    {
        pattern: /\btomorrow i(?:'m| am|'ll| will) (\w+(?:\s+\w+){0,5})/i,
        type: 'life_event',
    },
    {
        pattern: /\bthis week(?:end)? i(?:'m| am|'ll| will) (\w+(?:\s+\w+){0,5})/i,
        type: 'life_event',
    },
    // Commitments
    { pattern: /\bi promised (?:to )?(\w+(?:\s+\w+){0,5})/i, type: 'commitment' },
    { pattern: /\bi committed to (\w+(?:\s+\w+){0,5})/i, type: 'commitment' },
];
const LIFE_EVENT_PATTERNS = [
    { pattern: /\b(job interview|interview)\b/i, event: 'job interview', priority: 9 },
    {
        pattern: /\b(doctor(?:'s)? appointment|doctor visit)\b/i,
        event: 'doctor appointment',
        priority: 8,
    },
    { pattern: /\b(first date|date tonight|date tomorrow)\b/i, event: 'date', priority: 7 },
    {
        pattern: /\b(presentation|big meeting|important meeting)\b/i,
        event: 'work event',
        priority: 8,
    },
    { pattern: /\b(exam|test|finals)\b/i, event: 'exam', priority: 8 },
    { pattern: /\b(wedding|funeral|graduation)\b/i, event: 'life event', priority: 9 },
    { pattern: /\b(moving|move(?:d)? (?:to|into))\b/i, event: 'moving', priority: 7 },
    { pattern: /\b(surgery|procedure|operation)\b/i, event: 'medical procedure', priority: 9 },
    { pattern: /\b(birthday|anniversary)\b/i, event: 'celebration', priority: 6 },
    { pattern: /\b(vacation|trip|traveling)\b/i, event: 'travel', priority: 5 },
];
const CONCERN_PATTERNS = [
    {
        pattern: /\bi(?:'m| am) worried (?:about )?(\w+(?:\s+\w+){0,5})/i,
        type: 'concern',
    },
    {
        pattern: /\bi(?:'m| am) concerned (?:about )?(\w+(?:\s+\w+){0,5})/i,
        type: 'concern',
    },
    {
        pattern: /\bi(?:'m| am) scared (?:of |about )?(\w+(?:\s+\w+){0,5})/i,
        type: 'concern',
    },
    {
        pattern: /\bi(?:'m| am) anxious (?:about )?(\w+(?:\s+\w+){0,5})/i,
        type: 'concern',
    },
    { pattern: /\bwhat if (\w+(?:\s+\w+){0,5})/i, type: 'concern' },
];
/**
 * Detect intentions, life events, and concerns in user text.
 */
export function detectOpenLoops(userText, context) {
    const detected = [];
    // Check intention patterns
    for (const { pattern, type } of INTENTION_PATTERNS) {
        const match = userText.match(pattern);
        if (match) {
            detected.push({
                type,
                content: match[0],
                priority: CONFIG.TYPE_PRIORITY[type],
                relatedPerson: context.person,
                relatedTopic: context.topic,
            });
        }
    }
    // Check life event patterns
    for (const { pattern, event, priority } of LIFE_EVENT_PATTERNS) {
        if (pattern.test(userText)) {
            detected.push({
                type: 'life_event',
                content: `Mentioned ${event}`,
                priority,
                relatedTopic: event,
            });
        }
    }
    // Check concern patterns
    for (const { pattern, type } of CONCERN_PATTERNS) {
        const match = userText.match(pattern);
        if (match) {
            detected.push({
                type,
                content: match[0],
                priority: CONFIG.TYPE_PRIORITY[type],
                relatedPerson: context.person,
                relatedTopic: context.topic,
            });
        }
    }
    // Check for emotional peaks
    if (context.emotionIntensity && context.emotionIntensity > 0.8) {
        detected.push({
            type: 'emotional_peak',
            content: `High ${context.emotion} moment`,
            priority: CONFIG.TYPE_PRIORITY.emotional_peak,
            relatedPerson: context.person,
            relatedTopic: context.topic,
        });
    }
    return detected;
}
/**
 * Process user text and create open loops.
 */
export async function processUserTextForLoops(userId, userText, context) {
    const detected = detectOpenLoops(userText, context);
    const created = [];
    for (const item of detected) {
        const loop = await createOpenLoop(userId, {
            type: item.type,
            content: item.content,
            context: userText.slice(0, 200),
            priority: item.priority,
            relatedPerson: item.relatedPerson,
            relatedTopic: item.relatedTopic,
            emotionAtCreation: context.emotion,
        });
        created.push(loop);
    }
    if (created.length > 0) {
        log.debug({ userId, count: created.length }, '🔄 Created open loops from user text');
    }
    return created;
}
// ============================================================================
// INSIGHT GENERATION
// ============================================================================
async function createFollowUpInsight(userId, loop) {
    const insightText = generateFollowUpText(loop);
    if (!insightText)
        return;
    await createInsight(userId, {
        source: 'open_loop',
        priority: loop.priority >= 8 ? 'high' : loop.priority >= 5 ? 'medium' : 'low',
        insight: insightText,
        context: loop.content,
        surfaceWhen: [
            { type: 'session_start' },
            ...(loop.relatedTopic
                ? [{ type: 'topic', value: loop.relatedTopic, condition: 'contains' }]
                : []),
            ...(loop.relatedPerson
                ? [{ type: 'person', value: loop.relatedPerson, condition: 'contains' }]
                : []),
        ],
        surfaceAfter: loop.followUpAfter,
        expiresAt: loop.followUpBefore,
        relatedEntities: [
            ...(loop.relatedPerson ? [loop.relatedPerson] : []),
            ...(loop.relatedTopic ? [loop.relatedTopic] : []),
        ],
        confidence: 0.8,
    });
}
function generateFollowUpText(loop) {
    switch (loop.type) {
        case 'intention':
            return `You mentioned you were going to ${loop.content.toLowerCase()}. How did that go?`;
        case 'commitment':
            return `You said you needed to ${loop.content.toLowerCase()}. Did you get to that?`;
        case 'life_event':
            return `You mentioned ${loop.relatedTopic ?? 'something coming up'}. How did it go?`;
        case 'emotional_peak':
            return `Last time we talked, you were feeling really ${loop.emotionAtCreation ?? 'emotional'}. How are you doing now?`;
        case 'concern':
            return `You were worried about ${loop.content.toLowerCase()}. Has anything changed?`;
        case 'question':
            return `We never got back to your question about ${loop.relatedTopic ?? 'something'}. Want to revisit that?`;
        default:
            return null;
    }
}
// ============================================================================
// PERSISTENCE
// ============================================================================
async function loadOpenLoops(userId) {
    // Check cache
    const cached = loopCache.get(userId);
    if (cached)
        return cached;
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('open_loops')
            .where('status', '==', 'open')
            .orderBy('created', 'desc')
            .limit(CONFIG.MAX_OPEN_LOOPS)
            .get();
        const loops = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                created: data.created?.toDate?.() ?? new Date(data.created),
                followUpAfter: data.followUpAfter?.toDate?.() ?? new Date(data.followUpAfter),
                followUpBefore: data.followUpBefore?.toDate?.() ?? new Date(data.followUpBefore),
                lastFollowUp: data.lastFollowUp?.toDate?.() ??
                    (data.lastFollowUp ? new Date(data.lastFollowUp) : undefined),
                resolvedAt: data.resolvedAt?.toDate?.() ?? (data.resolvedAt ? new Date(data.resolvedAt) : undefined),
            };
        });
        loopCache.set(userId, loops);
        return loops;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load open loops');
        return [];
    }
}
async function saveOpenLoop(userId, loop) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('open_loops')
            .doc(loop.id)
            .set(cleanForFirestore(loop));
        // Index open loop to semantic memory for follow-up tracking
        void onCoachingInsightChange(userId, `open_loop_${loop.id}`, {
            insight: `Open loop (${loop.type}): ${loop.description || loop.content?.substring(0, 100)}`,
            context: `Priority: ${loop.priority}, Status: ${loop.status}`,
            personaId: 'ferni',
            category: 'follow_up',
            actionable: loop.status === 'open',
        }, loop.status === 'open' ? 'create' : 'update');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to save open loop');
    }
}
// ============================================================================
// CONTEXT FORMATTING
// ============================================================================
/**
 * Format open loops for LLM context injection.
 */
export async function formatOpenLoopsContext(userId) {
    const loops = await getLoopsReadyForFollowUp(userId);
    if (loops.length === 0)
        return '';
    const sections = [];
    // Group by type
    const byType = new Map();
    for (const loop of loops) {
        const existing = byType.get(loop.type) || [];
        existing.push(loop);
        byType.set(loop.type, existing);
    }
    // Format each group
    for (const [type, typeLoops] of byType) {
        const typeLabel = type === 'intention'
            ? '📋 STATED INTENTIONS'
            : type === 'life_event'
                ? '📅 LIFE EVENTS'
                : type === 'advice'
                    ? '💡 ADVICE GIVEN'
                    : type === 'commitment'
                        ? '🎯 COMMITMENTS'
                        : type === 'question'
                            ? '❓ QUESTIONS'
                            : type === 'concern'
                                ? '💭 CONCERNS'
                                : type === 'emotional_peak'
                                    ? '💗 EMOTIONAL MOMENTS'
                                    : '🔗 OPEN ITEMS';
        sections.push(typeLabel);
        for (const loop of typeLoops.slice(0, 3)) {
            // Max 3 per type
            const daysAgo = Math.floor((Date.now() - loop.created.getTime()) / (1000 * 60 * 60 * 24));
            const timeContext = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
            sections.push(`  • "${loop.content}" (${timeContext})`);
            if (loop.context)
                sections.push(`    Context: ${loop.context}`);
        }
        sections.push('');
    }
    if (sections.length === 0)
        return '';
    return [
        '═══════════════════════════════════════════════════════════',
        'OPEN LOOPS - Things Worth Following Up On',
        '═══════════════════════════════════════════════════════════',
        '',
        ...sections,
        'NOTE: Gently check in on these if naturally relevant.',
        '═══════════════════════════════════════════════════════════',
    ].join('\n');
}
// ============================================================================
// CACHE MANAGEMENT
// ============================================================================
export function clearLoopCache(userId) {
    if (userId) {
        loopCache.delete(userId);
    }
    else {
        loopCache.clear();
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export const openLoops = {
    create: createOpenLoop,
    getReadyForFollowUp: getLoopsReadyForFollowUp,
    markFollowedUp,
    resolve: resolveLoop,
    dismiss: dismissLoop,
    getAll: getAllOpenLoops,
    getByType: getLoopsByType,
    detect: detectOpenLoops,
    processUserText: processUserTextForLoops,
    formatContext: formatOpenLoopsContext,
    clearCache: clearLoopCache,
};
export default openLoops;
//# sourceMappingURL=open-loops.js.map