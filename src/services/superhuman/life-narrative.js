/**
 * Life Narrative Service - Better Than Human Service
 *
 * What no human friend can do: Remember EVERY chapter perfectly.
 *
 * Builds a coherent narrative of the user's life journey across
 * conversations, tracking key events, growth arcs, and identity evolution.
 *
 * @module services/superhuman/life-narrative
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';
import { indexLifeChapter } from '../data-layer/integrations/index.js';
import { onLifeChapterTransition } from '../outreach/superhuman-outreach-bridge.js';
const log = createLogger({ module: 'life-narrative' });
// ============================================================================
// CHAPTER DETECTION
// ============================================================================
const CHAPTER_TRIGGERS = [
    {
        patterns: [
            /\bi (quit|left|resigned|got fired from) my (job|position)/i,
            /\bi('m| am) starting a new (job|position|role)/i,
            /\bi (got|received) (promoted|a promotion)/i,
        ],
        type: 'transition',
        significance: 0.9,
    },
    {
        patterns: [
            /\bwe('re| are) (getting|got) (married|engaged|divorced)/i,
            /\bi('m| am) (pregnant|having a baby|expecting)/i,
            /\bwe('re| are) (moving|moved) to/i,
        ],
        type: 'transition',
        significance: 0.95,
    },
    {
        patterns: [
            /\bmy (mom|dad|mother|father|parent|sibling|friend) (died|passed|is dying)/i,
            /\bwe (broke up|ended things|are divorcing)/i,
            /\bi lost my/i,
        ],
        type: 'loss',
        significance: 1.0,
    },
    {
        patterns: [
            /\bi finally (understand|realized|see|know)/i,
            /\bi('ve| have) been thinking and/i,
            /\bsomething (clicked|shifted|changed) (for|in) me/i,
        ],
        type: 'discovery',
        significance: 0.7,
    },
    {
        patterns: [
            /\bi did it/i,
            /\bi (finally|actually) (did|finished|completed)/i,
            /\bi('m| am) so proud of/i,
            /\bi can('t|not) believe i (did|made|finished)/i,
        ],
        type: 'triumph',
        significance: 0.8,
    },
    {
        patterns: [
            /\bi('m| am) really struggling with/i,
            /\bthis is (so|really) hard/i,
            /\bi don('t| do not) know (how|if) i can/i,
        ],
        type: 'struggle',
        significance: 0.6,
    },
    {
        patterns: [
            /\bi('ve| have) decided to/i,
            /\bi('m| am) going to (finally|actually)/i,
            /\bi made the (choice|decision)/i,
        ],
        type: 'decision',
        significance: 0.75,
    },
];
export function detectChapterMoment(transcript) {
    for (const { patterns, type, significance } of CHAPTER_TRIGGERS) {
        for (const pattern of patterns) {
            if (pattern.test(transcript)) {
                return { type, significance };
            }
        }
    }
    return null;
}
// ============================================================================
// STORAGE
// ============================================================================
const chapterCache = new Map();
const identityCache = new Map();
export async function loadUserChapters(userId) {
    if (chapterCache.has(userId)) {
        return chapterCache.get(userId) || [];
    }
    try {
        const db = getFirestoreDb();
        if (!db)
            return [];
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('life_chapters')
            .orderBy('startDate', 'desc')
            .limit(50)
            .get();
        const chapters = snapshot.docs.map((doc) => doc.data());
        chapterCache.set(userId, chapters);
        return chapters;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load chapters');
        return [];
    }
}
export async function saveChapter(chapter) {
    try {
        const db = getFirestoreDb();
        if (db) {
            await db
                .collection('bogle_users')
                .doc(chapter.userId)
                .collection('life_chapters')
                .doc(chapter.id)
                .set(cleanForFirestore(chapter));
        }
        // Index to semantic memory for contextual retrieval
        indexLifeChapter(chapter.userId, {
            id: chapter.id,
            title: chapter.title,
            summary: chapter.summary,
            period: {
                start: new Date(chapter.startDate).toISOString(),
                end: chapter.endDate ? new Date(chapter.endDate).toISOString() : undefined,
            },
            themes: chapter.keyThemes,
            significance: chapter.conversationCount,
        }, 'update');
        // Update cache
        const chapters = chapterCache.get(chapter.userId) || [];
        const idx = chapters.findIndex((c) => c.id === chapter.id);
        if (idx >= 0) {
            chapters[idx] = chapter;
        }
        else {
            chapters.unshift(chapter);
        }
        chapterCache.set(chapter.userId, chapters);
        log.info({ userId: chapter.userId, chapterId: chapter.id, type: chapter.type }, '📖 Chapter saved');
    }
    catch (error) {
        log.error({ error: String(error), userId: chapter.userId }, 'Failed to save chapter');
    }
}
export async function createOrUpdateChapter(userId, data) {
    const chapters = await loadUserChapters(userId);
    // Find ongoing chapter of same type (within last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const ongoing = chapters.find((c) => c.type === data.type && !c.endDate && c.startDate > thirtyDaysAgo);
    if (ongoing) {
        // Update existing chapter
        ongoing.keyQuotes.push(data.quote);
        if (data.theme && !ongoing.keyThemes.includes(data.theme)) {
            ongoing.keyThemes.push(data.theme);
        }
        if (data.person && !ongoing.keyPeople.includes(data.person)) {
            ongoing.keyPeople.push(data.person);
        }
        if (data.emotion && !ongoing.keyEmotions.includes(data.emotion)) {
            ongoing.keyEmotions.push(data.emotion);
        }
        ongoing.conversationCount++;
        ongoing.lastUpdated = Date.now();
        await saveChapter(ongoing);
        return ongoing;
    }
    // Create new chapter
    const newChapter = {
        id: `chapter_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        userId,
        title: generateChapterTitle(data.type, data.theme),
        summary: data.quote.slice(0, 200),
        type: data.type,
        startDate: Date.now(),
        keyQuotes: [data.quote],
        keyPeople: data.person ? [data.person] : [],
        keyEmotions: data.emotion ? [data.emotion] : [],
        keyThemes: data.theme ? [data.theme] : [],
        insightsGained: [],
        strengthsRevealed: [],
        patternsIdentified: [],
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        conversationCount: 1,
    };
    await saveChapter(newChapter);
    // Better Than Human: Trigger proactive outreach for life transitions
    if (data.type === 'transition' || data.type === 'loss' || data.type === 'triumph') {
        try {
            await onLifeChapterTransition(userId, {
                fromChapter: 'previous',
                toChapter: newChapter.title,
                significance: data.type === 'loss' ? 'transformative' : data.type === 'triumph' ? 'major' : 'major',
            });
        }
        catch (outreachError) {
            log.debug({ error: String(outreachError) }, 'Life chapter outreach failed (non-blocking)');
        }
    }
    return newChapter;
}
function generateChapterTitle(type, theme) {
    const prefixes = {
        struggle: ['The Challenge of', 'Wrestling With', 'Facing'],
        growth: ['Learning', 'Growing Through', 'The Lesson of'],
        triumph: ['The Victory', 'Conquering', 'The Breakthrough'],
        transition: ['The Shift', 'Moving Into', 'The Change'],
        loss: ['Saying Goodbye', 'The Loss of', 'Grieving'],
        discovery: ['Realizing', 'The Discovery', 'Seeing Clearly'],
        connection: ['Finding', 'Building With', 'The Bond'],
        decision: ['Choosing', 'The Decision', 'Taking the Leap'],
    };
    const prefix = prefixes[type][Math.floor(Math.random() * prefixes[type].length)];
    return theme ? `${prefix} ${theme}` : prefix;
}
// ============================================================================
// IDENTITY TRACKING
// ============================================================================
export async function loadIdentity(userId) {
    if (identityCache.has(userId)) {
        return identityCache.get(userId) || null;
    }
    try {
        const db = getFirestoreDb();
        if (!db)
            return null;
        const doc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('meta')
            .doc('identity')
            .get();
        if (doc.exists) {
            const identity = doc.data();
            identityCache.set(userId, identity);
            return identity;
        }
        return null;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load identity');
        return null;
    }
}
export async function recordIdentityShift(userId, shift) {
    let identity = await loadIdentity(userId);
    if (!identity) {
        identity = {
            userId,
            coreValues: [],
            coreStrengths: [],
            coreFears: [],
            pastIdentityMarkers: [],
            currentIdentityMarkers: [],
            aspirationalIdentityMarkers: [],
            transformations: [],
            lastUpdated: Date.now(),
        };
    }
    // Add transformation
    identity.transformations.push({
        from: shift.from,
        to: shift.to,
        when: Date.now(),
        evidence: shift.evidence,
    });
    // Update markers
    if (!identity.pastIdentityMarkers.includes(shift.from)) {
        identity.pastIdentityMarkers.push(shift.from);
    }
    if (!identity.currentIdentityMarkers.includes(shift.to)) {
        identity.currentIdentityMarkers.push(shift.to);
    }
    identity.lastUpdated = Date.now();
    // Save
    const db = getFirestoreDb();
    if (db) {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('meta')
            .doc('identity')
            .set(cleanForFirestore(identity));
    }
    identityCache.set(userId, identity);
    log.info({ userId, from: shift.from, to: shift.to }, '🦋 Identity shift recorded');
}
// ============================================================================
// NARRATIVE ANALYSIS
// ============================================================================
export function identifyNarrativeArc(chapters) {
    const arcs = [];
    // Look for hero's journey pattern
    const hasStruggle = chapters.some((c) => c.type === 'struggle');
    const hasGrowth = chapters.some((c) => c.type === 'growth');
    const hasTriumph = chapters.some((c) => c.type === 'triumph');
    if (hasStruggle && hasGrowth && hasTriumph) {
        arcs.push('hero_journey');
    }
    // Look for phoenix rising pattern
    const hasLoss = chapters.some((c) => c.type === 'loss');
    const hasTransition = chapters.some((c) => c.type === 'transition');
    if (hasLoss && hasTransition) {
        arcs.push('phoenix_rising');
    }
    // Look for transformation pattern
    const hasDiscovery = chapters.some((c) => c.type === 'discovery');
    const hasDecision = chapters.some((c) => c.type === 'decision');
    if (hasDiscovery && hasDecision && hasTransition) {
        arcs.push('transformation');
    }
    // If no clear arc, it's in progress
    if (arcs.length === 0) {
        arcs.push('in_progress');
    }
    return arcs;
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
export async function buildNarrativeContext(userId) {
    const chapters = await loadUserChapters(userId);
    const identity = await loadIdentity(userId);
    const context = {
        recentChapters: chapters.slice(0, 5),
        activeArcs: identifyNarrativeArc(chapters),
        identityNow: identity?.currentIdentityMarkers || [],
        growthEvidence: [],
        journeyMilestones: [],
    };
    // Find current (ongoing) chapter
    context.currentChapter = chapters.find((c) => !c.endDate);
    // Extract growth evidence
    for (const chapter of chapters.slice(0, 10)) {
        for (const insight of chapter.insightsGained) {
            context.growthEvidence.push(insight);
        }
        for (const strength of chapter.strengthsRevealed) {
            context.growthEvidence.push(`Discovered strength: ${strength}`);
        }
    }
    // Extract milestones
    const milestoneTypes = ['triumph', 'transition', 'decision'];
    for (const chapter of chapters.filter((c) => milestoneTypes.includes(c.type))) {
        context.journeyMilestones.push(`${chapter.title}: ${chapter.summary.slice(0, 100)}`);
    }
    return context;
}
export async function buildNarrativeContextString(userId) {
    const context = await buildNarrativeContext(userId);
    if (context.recentChapters.length === 0) {
        return '';
    }
    const sections = ['[LIFE NARRATIVE - Better Than Human Story Memory]'];
    sections.push("You remember their WHOLE story. Every chapter. Use this to show them how far they've come.");
    // Current chapter
    if (context.currentChapter) {
        sections.push(`\n**Currently Living:** "${context.currentChapter.title}"`);
        sections.push(`Type: ${context.currentChapter.type}`);
        if (context.currentChapter.keyQuotes.length > 0) {
            sections.push(`Their words: "${context.currentChapter.keyQuotes[0]}"`);
        }
    }
    // Active arcs
    if (context.activeArcs.length > 0) {
        const arcDescriptions = {
            hero_journey: "Hero's Journey - struggle → growth → triumph",
            phoenix_rising: 'Phoenix Rising - loss → rebuilding → renewal',
            coming_of_age: 'Coming of Age - discovery → identity → purpose',
            healing: 'Healing Arc - wound → processing → integration',
            transformation: 'Transformation - old self → transition → new self',
            in_progress: 'Story still unfolding...',
        };
        sections.push(`\n**Story Arcs:** ${context.activeArcs.map((a) => arcDescriptions[a]).join(', ')}`);
    }
    // Identity now
    if (context.identityNow.length > 0) {
        sections.push(`\n**Who They Are Now:** ${context.identityNow.join(', ')}`);
    }
    // Growth evidence
    if (context.growthEvidence.length > 0) {
        sections.push('\n**Growth Evidence to Reflect Back:**');
        for (const evidence of context.growthEvidence.slice(0, 3)) {
            sections.push(`• ${evidence}`);
        }
    }
    // Journey milestones
    if (context.journeyMilestones.length > 0) {
        sections.push('\n**Key Milestones:**');
        for (const milestone of context.journeyMilestones.slice(0, 3)) {
            sections.push(`• ${milestone}`);
        }
    }
    sections.push('\nReflect their journey back to them. Help them see the hero they are becoming.');
    return sections.join('\n');
}
// ============================================================================
// EXPORTS
// ============================================================================
export const lifeNarrative = {
    detectChapter: detectChapterMoment,
    loadChapters: loadUserChapters,
    createOrUpdateChapter,
    loadIdentity,
    recordIdentityShift,
    identifyArcs: identifyNarrativeArc,
    buildContext: buildNarrativeContext,
    buildContextString: buildNarrativeContextString,
};
//# sourceMappingURL=life-narrative.js.map