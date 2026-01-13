/**
 * Message Validation Service ("Sleep on It")
 *
 * Helps users avoid sending messages they might regret.
 * Alex can suggest waiting periods for emotionally charged messages.
 *
 * Features:
 * - Detect emotional/risky message content
 * - Store drafts for "cooling off" periods
 * - Provide tone analysis and suggestions
 * - Track validation status and timing
 *
 * Philosophy:
 * - Not about censorship - about thoughtful communication
 * - User always has final say
 * - Gentle suggestions, not blocking
 * - Celebrate when user chooses patience
 *
 * @module services/message-validation
 */
import { getLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
const log = getLogger();
// ============================================================================
// FIRESTORE SETUP
// ============================================================================
const DRAFTS_COLLECTION = 'message_drafts';
let db = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise = null;
async function getFirestore() {
    if (db)
        return db;
    if (dbInitPromise)
        return dbInitPromise;
    dbInitPromise = initializeFirestore();
    return dbInitPromise;
}
async function initializeFirestore() {
    try {
        const { Firestore } = await import('@google-cloud/firestore');
        db = new Firestore({
            projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
            databaseId: process.env.FIRESTORE_DATABASE || '(default)',
        });
        log.info('Message validation Firestore initialized');
        return db;
    }
    catch (error) {
        log.warn({ error }, 'Firestore not available for message validation');
        dbInitPromise = null; // Allow retry
        return null;
    }
}
// ============================================================================
// IN-MEMORY CACHE
// ============================================================================
const draftCache = new Map();
const loadedUsers = new Set();
// ============================================================================
// MESSAGE ANALYSIS
// ============================================================================
/**
 * Analyze a message for emotional content and risk factors
 */
export function analyzeMessage(content, options) {
    const signals = [];
    const tones = [];
    const suggestions = [];
    const contentLower = content.toLowerCase();
    const now = options?.timeOfDay || new Date();
    const hour = now.getHours();
    // === SIGNAL DETECTION ===
    // All caps detection
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    if (capsRatio > 0.5 && content.length > 20) {
        signals.push({
            type: 'all-caps',
            severity: 'medium',
            description: 'Heavy use of capital letters can come across as shouting',
        });
        tones.push('angry');
    }
    // Exclamation marks
    const exclamationCount = (content.match(/!/g) || []).length;
    if (exclamationCount > 3) {
        signals.push({
            type: 'exclamation-heavy',
            severity: 'low',
            description: 'Multiple exclamation marks can seem aggressive or overly emotional',
        });
        tones.push('emotional');
    }
    // Accusatory language
    const accusatoryPatterns = [
        /you always/i,
        /you never/i,
        /you don't care/i,
        /your fault/i,
        /you made me/i,
        /because of you/i,
        /you ruined/i,
        /you're the reason/i,
    ];
    for (const pattern of accusatoryPatterns) {
        if (pattern.test(content)) {
            signals.push({
                type: 'accusatory-language',
                severity: 'high',
                description: 'Accusatory statements can escalate conflict',
                excerpt: content.match(pattern)?.[0],
            });
            tones.push('angry');
            suggestions.push('Consider using "I feel" statements instead of "you always/never"');
            break;
        }
    }
    // Ultimatums
    const ultimatumPatterns = [
        /if you don't.*i will/i,
        /this is your last chance/i,
        /i'm done/i,
        /we're done/i,
        /it's over/i,
        /or else/i,
        /final warning/i,
    ];
    for (const pattern of ultimatumPatterns) {
        if (pattern.test(content)) {
            signals.push({
                type: 'ultimatum',
                severity: 'high',
                description: 'Ultimatums often close doors to resolution',
                excerpt: content.match(pattern)?.[0],
            });
            tones.push('demanding');
            suggestions.push('Consider expressing your needs without issuing ultimatums');
            break;
        }
    }
    // Profanity (light check)
    const profanityPatterns = [
        /\bf+u+c+k+/i,
        /\bsh+i+t+/i,
        /\bdamn/i,
        /\bhell\b/i,
        /\bass\b/i,
        /\bbull\s*sh/i,
    ];
    for (const pattern of profanityPatterns) {
        if (pattern.test(content)) {
            signals.push({
                type: 'profanity',
                severity: 'medium',
                description: 'Strong language may not land as intended',
            });
            tones.push('angry');
            break;
        }
    }
    // Passive-aggressive patterns
    const passiveAggressivePatterns = [
        /fine\./i,
        /whatever\./i,
        /i guess/i,
        /if that's what you want/i,
        /i don't care anymore/i,
        /do what you want/i,
        /good for you/i,
        /must be nice/i,
    ];
    for (const pattern of passiveAggressivePatterns) {
        if (pattern.test(content)) {
            signals.push({
                type: 'passive-aggressive',
                severity: 'medium',
                description: 'This phrasing might come across as passive-aggressive',
                excerpt: content.match(pattern)?.[0],
            });
            tones.push('passive-aggressive');
            break;
        }
    }
    // Late night detection (10pm - 5am)
    if (hour >= 22 || hour < 5) {
        signals.push({
            type: 'late-night',
            severity: 'medium',
            description: 'Messages sent late at night are often regretted',
        });
        suggestions.push('Consider waiting until morning to send this');
    }
    // Emotional words
    const emotionalWords = [
        'hate',
        'love',
        'betrayed',
        'devastated',
        'furious',
        'heartbroken',
        'disgusted',
        'terrified',
        'humiliated',
        'abandoned',
    ];
    const foundEmotional = emotionalWords.filter((w) => contentLower.includes(w));
    if (foundEmotional.length > 0) {
        signals.push({
            type: 'emotional-words',
            severity: 'medium',
            description: 'High-intensity emotional language detected',
            excerpt: foundEmotional.join(', '),
        });
        tones.push('emotional');
    }
    // Sensitive topics
    const sensitiveTopics = [
        { pattern: /divorce|custody|lawyer|attorney/i, topic: 'legal/family' },
        { pattern: /fired|terminated|hr\b|lawsuit/i, topic: 'employment' },
        { pattern: /money|debt|owe|pay me back/i, topic: 'financial' },
        { pattern: /breakup|breaking up|leave you|leaving you/i, topic: 'relationship' },
    ];
    for (const { pattern, topic } of sensitiveTopics) {
        if (pattern.test(content)) {
            signals.push({
                type: 'sensitive-topic',
                severity: 'high',
                description: `Discusses sensitive topic: ${topic}`,
            });
            suggestions.push(`Messages about ${topic} matters deserve extra thought`);
            break;
        }
    }
    // === TONE INFERENCE ===
    // Check for professional tone indicators
    if (contentLower.includes('regards') ||
        contentLower.includes('sincerely') ||
        contentLower.includes('best,') ||
        contentLower.includes('thank you for')) {
        tones.push('professional');
    }
    // Check for friendly tone
    if (contentLower.includes('hope you') ||
        contentLower.includes('take care') ||
        contentLower.includes('looking forward') ||
        contentLower.includes('miss you')) {
        tones.push('friendly');
    }
    // Check for apologetic tone
    if (contentLower.includes("i'm sorry") ||
        contentLower.includes('apologize') ||
        contentLower.includes('my fault') ||
        contentLower.includes('forgive me')) {
        tones.push('apologetic');
    }
    // Default to neutral if no strong tones
    if (tones.length === 0) {
        tones.push('neutral');
    }
    // === RISK SCORING ===
    let riskScore = 0;
    // Add points based on signals
    for (const signal of signals) {
        switch (signal.severity) {
            case 'high':
                riskScore += 25;
                break;
            case 'medium':
                riskScore += 15;
                break;
            case 'low':
                riskScore += 5;
                break;
        }
    }
    // Add points for negative tones
    const negativeTones = [
        'angry',
        'frustrated',
        'defensive',
        'passive-aggressive',
        'demanding',
    ];
    const negToneCount = tones.filter((t) => negativeTones.includes(t)).length;
    riskScore += negToneCount * 10;
    // Cap at 100
    riskScore = Math.min(100, riskScore);
    // === DETERMINE DOMINANT TONE ===
    const toneFreq = new Map();
    for (const tone of tones) {
        toneFreq.set(tone, (toneFreq.get(tone) || 0) + 1);
    }
    let dominantTone = 'neutral';
    let maxFreq = 0;
    for (const [tone, freq] of toneFreq) {
        if (freq > maxFreq) {
            maxFreq = freq;
            dominantTone = tone;
        }
    }
    // === WAIT RECOMMENDATION ===
    const recommendWait = riskScore >= 40;
    let waitReason;
    if (recommendWait) {
        if (signals.some((s) => s.type === 'late-night')) {
            waitReason = 'Late night messages are often regretted. Sleep on it?';
        }
        else if (signals.some((s) => s.type === 'accusatory-language' || s.type === 'ultimatum')) {
            waitReason = 'This message has some strong language. Worth a second look?';
        }
        else if (signals.some((s) => s.type === 'sensitive-topic')) {
            waitReason = 'This touches on a sensitive topic. Take time to be sure of your words?';
        }
        else {
            waitReason = 'This seems emotionally charged. Maybe sleep on it?';
        }
    }
    // === BUILD RESULT ===
    return {
        riskScore,
        tones: [...new Set(tones)],
        dominantTone,
        signals,
        suggestions,
        recommendWait,
        waitReason,
    };
}
/**
 * Calculate suggested wait time based on analysis
 */
function calculateWaitHours(analysis, timeOfDay) {
    const now = timeOfDay || new Date();
    const hour = now.getHours();
    // Base wait time on risk score
    let waitHours = 0;
    if (analysis.riskScore >= 70) {
        waitHours = 24; // 24 hours for high risk
    }
    else if (analysis.riskScore >= 50) {
        waitHours = 12; // 12 hours for medium risk
    }
    else if (analysis.riskScore >= 40) {
        waitHours = 4; // 4 hours for low-medium risk
    }
    // If late night, always suggest at least until morning
    if (hour >= 22 || hour < 6) {
        const hoursUntilMorning = hour >= 22 ? 24 - hour + 8 : 8 - hour;
        waitHours = Math.max(waitHours, hoursUntilMorning);
    }
    return waitHours;
}
// ============================================================================
// DRAFT MANAGEMENT
// ============================================================================
/**
 * Save a message draft for review
 */
export async function saveDraft(userId, draft) {
    await ensureUserLoaded(userId);
    const analysis = analyzeMessage(draft.content);
    const waitHours = calculateWaitHours(analysis);
    const now = new Date();
    const messageDraft = {
        id: `draft_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        userId,
        recipient: draft.recipient,
        recipientType: draft.recipientType,
        subject: draft.subject,
        content: draft.content,
        analysis,
        status: 'pending',
        suggestedWaitHours: waitHours,
        waitUntil: new Date(now.getTime() + waitHours * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
        userNotes: draft.userNotes,
    };
    // Add to cache
    const drafts = draftCache.get(userId) || [];
    drafts.push(messageDraft);
    draftCache.set(userId, drafts);
    // Persist
    await persistDraft(messageDraft);
    log.info({
        userId,
        draftId: messageDraft.id,
        riskScore: analysis.riskScore,
        waitHours,
    }, 'Message draft saved for review');
    return messageDraft;
}
/**
 * Get pending drafts for a user
 */
export async function getPendingDrafts(userId) {
    await ensureUserLoaded(userId);
    const drafts = draftCache.get(userId) || [];
    return drafts.filter((d) => d.status === 'pending');
}
/**
 * Get a specific draft
 */
export async function getDraft(userId, draftId) {
    await ensureUserLoaded(userId);
    const drafts = draftCache.get(userId) || [];
    return drafts.find((d) => d.id === draftId) || null;
}
/**
 * Get drafts ready for review (wait time elapsed)
 */
export async function getDraftsReadyForReview(userId) {
    await ensureUserLoaded(userId);
    const drafts = draftCache.get(userId) || [];
    const now = new Date();
    return drafts.filter((d) => d.status === 'pending' && d.waitUntil <= now);
}
/**
 * Approve a draft for sending
 */
export async function approveDraft(userId, draftId, modifiedContent) {
    const draft = await getDraft(userId, draftId);
    if (!draft)
        return null;
    draft.status = modifiedContent ? 'modified' : 'approved';
    draft.reviewedAt = new Date();
    draft.updatedAt = new Date();
    if (modifiedContent) {
        draft.modifiedContent = modifiedContent;
    }
    await persistDraft(draft);
    log.info({ userId, draftId, status: draft.status }, 'Draft approved');
    return draft;
}
/**
 * Discard a draft
 */
export async function discardDraft(userId, draftId) {
    const draft = await getDraft(userId, draftId);
    if (!draft)
        return false;
    draft.status = 'discarded';
    draft.updatedAt = new Date();
    await persistDraft(draft);
    log.info({ userId, draftId }, 'Draft discarded');
    return true;
}
/**
 * Mark a draft as sent
 */
export async function markDraftSent(userId, draftId) {
    const draft = await getDraft(userId, draftId);
    if (!draft)
        return;
    draft.sentAt = new Date();
    draft.updatedAt = new Date();
    await persistDraft(draft);
}
// ============================================================================
// REVIEW HELPERS
// ============================================================================
/**
 * Check if a draft is ready for review
 */
export async function isReadyForReview(userId, draftId) {
    const draft = await getDraft(userId, draftId);
    if (!draft)
        return false;
    return draft.status === 'pending' && draft.waitUntil <= new Date();
}
/**
 * Get time remaining until review
 */
export async function getTimeUntilReview(userId, draftId) {
    const draft = await getDraft(userId, draftId);
    if (!draft || draft.status !== 'pending')
        return null;
    const now = new Date();
    const remaining = draft.waitUntil.getTime() - now.getTime();
    return Math.max(0, Math.ceil(remaining / (1000 * 60))); // Minutes remaining
}
/**
 * Format analysis for speech output
 */
export function formatAnalysisForSpeech(analysis) {
    let output = '';
    // Tone summary
    output += `This message comes across as ${analysis.dominantTone}`;
    if (analysis.tones.length > 1) {
        const otherTones = analysis.tones.filter((t) => t !== analysis.dominantTone).slice(0, 2);
        if (otherTones.length > 0) {
            output += ` with hints of ${otherTones.join(' and ')}`;
        }
    }
    output += '.\n\n';
    // Risk assessment
    if (analysis.riskScore >= 70) {
        output += "I'd really suggest sleeping on this one. ";
    }
    else if (analysis.riskScore >= 50) {
        output += 'This might be worth a second look. ';
    }
    else if (analysis.riskScore >= 30) {
        output += 'A few things to consider: ';
    }
    // Key signals
    const highSignals = analysis.signals.filter((s) => s.severity === 'high');
    if (highSignals.length > 0) {
        output += highSignals.map((s) => s.description).join('. ') + '. ';
    }
    // Suggestions
    if (analysis.suggestions.length > 0) {
        output += '\n\nSuggestions:\n';
        analysis.suggestions.forEach((s) => {
            output += `- ${s}\n`;
        });
    }
    // Wait recommendation
    if (analysis.recommendWait && analysis.waitReason) {
        output += `\n${analysis.waitReason}`;
    }
    return output;
}
// ============================================================================
// PERSISTENCE
// ============================================================================
async function ensureUserLoaded(userId) {
    if (loadedUsers.has(userId))
        return;
    const firestore = await getFirestore();
    if (!firestore) {
        loadedUsers.add(userId);
        return;
    }
    try {
        const snapshot = await firestore
            .collection(DRAFTS_COLLECTION)
            .where('userId', '==', userId)
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        const drafts = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
            drafts.push({
                ...data,
                createdAt: data.createdAt?.toDate() || new Date(),
                updatedAt: data.updatedAt?.toDate() || new Date(),
                waitUntil: data.waitUntil?.toDate() || new Date(),
                reviewedAt: data.reviewedAt?.toDate(),
                sentAt: data.sentAt?.toDate(),
            });
        }
        draftCache.set(userId, drafts);
        loadedUsers.add(userId);
        log.debug({ userId, count: drafts.length }, 'Loaded message drafts');
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to load drafts');
        loadedUsers.add(userId);
    }
}
async function persistDraft(draft) {
    const firestore = await getFirestore();
    if (!firestore)
        return;
    try {
        // Remove undefined values for Firestore compatibility
        const cleanDraft = structuredClone(draft);
        await firestore.collection(DRAFTS_COLLECTION).doc(draft.id).set(cleanForFirestore(cleanDraft));
    }
    catch (error) {
        log.error({ error: String(error), draftId: draft.id }, 'Failed to persist draft');
    }
}
// ============================================================================
// CACHE MANAGEMENT
// ============================================================================
export function clearCache(userId) {
    if (userId) {
        draftCache.delete(userId);
        loadedUsers.delete(userId);
    }
    else {
        draftCache.clear();
        loadedUsers.clear();
    }
}
export default {
    analyzeMessage,
    saveDraft,
    getPendingDrafts,
    getDraft,
    getDraftsReadyForReview,
    approveDraft,
    discardDraft,
    markDraftSent,
    isReadyForReview,
    getTimeUntilReview,
    formatAnalysisForSpeech,
    clearCache,
};
//# sourceMappingURL=message-validation-service.js.map