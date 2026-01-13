/**
 * Commitment Tracking System
 *
 * "Better Than Human" - We remember what you said you'd do.
 *
 * Philosophy: Real accountability isn't nagging. It's:
 * - Remembering the specific thing they committed to
 * - Gently checking in at the right time
 * - Celebrating progress without judgment
 * - Understanding setbacks with empathy
 * - Adjusting expectations based on their reality
 *
 * This system tracks:
 * - Explicit commitments ("I'm going to start exercising")
 * - Implicit commitments ("I should really call my mom")
 * - Follow-up schedules (when to check in)
 * - Progress and setbacks
 * - Context for empathetic responses
 *
 * @module CommitmentTracking
 */
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { indexCommitment, deindexCommitment } from '../data-layer/integrations/index.js';
// Use dynamic import for Firestore to avoid hard dependency
async function getFirestoreDb() {
    try {
        const { getFirestore } = await import('firebase-admin/firestore');
        return getFirestore();
    }
    catch {
        return null;
    }
}
const log = createLogger({ module: 'CommitmentTracking' });
// ============================================================================
// DETECTION PATTERNS
// ============================================================================
/** Explicit commitment indicators */
const EXPLICIT_PATTERNS = [
    /i('m| am) (going to|gonna) (.+)/i,
    /i will (.+)/i,
    /starting (today|tomorrow|this week|monday), i('ll|'m going to) (.+)/i,
    /i've decided to (.+)/i,
    /i'm committing to (.+)/i,
    /i promise (myself|to) (.+)/i,
    /my goal is to (.+)/i,
    /this week i('ll|'m going to) (.+)/i,
];
/** Implicit commitment indicators */
const IMPLICIT_PATTERNS = [
    /i (really )?(should|need to|ought to|have to) (.+)/i,
    /i know i (should|need to) (.+)/i,
    /i've been meaning to (.+)/i,
    /i keep telling myself to (.+)/i,
    /i've been putting off (.+)/i,
    /it's time i (.+)/i,
];
/** Goal/aspiration indicators */
const GOAL_PATTERNS = [
    /i want to (.+)/i,
    /i wish i could (.+)/i,
    /my dream is to (.+)/i,
    /one day i('ll| want to) (.+)/i,
    /i've always wanted to (.+)/i,
];
/** Completion indicators */
const COMPLETION_PATTERNS = [
    /i (did it|finally did it)/i,
    /i (actually|finally) (.+)/i,
    /guess what.+i (.+)/i,
    /i can't believe i (.+)/i,
    /i'm proud.+i (.+)/i,
];
/** Setback indicators */
const SETBACK_PATTERNS = [
    /i didn't (.+)/i,
    /i failed to (.+)/i,
    /i couldn't (.+)/i,
    /i skipped (.+)/i,
    /i forgot to (.+)/i,
    /i haven't been (.+)/i,
];
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Detect commitments in user text
 */
export function detectCommitments(userText, _context) {
    const detected = [];
    const text = userText.toLowerCase();
    // Check explicit patterns
    for (const pattern of EXPLICIT_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            const content = extractCommitmentContent(match);
            if (content && content.length > 3) {
                detected.push({
                    type: 'explicit',
                    content,
                    quote: userText.slice(0, 200),
                });
                break; // Only capture first explicit commitment per message
            }
        }
    }
    // Check implicit patterns
    for (const pattern of IMPLICIT_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            const content = extractCommitmentContent(match);
            if (content && content.length > 3) {
                detected.push({
                    type: 'implicit',
                    content,
                    quote: userText.slice(0, 200),
                });
                break;
            }
        }
    }
    // Check goal patterns (lower priority)
    for (const pattern of GOAL_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
            const content = extractCommitmentContent(match);
            if (content && content.length > 5) {
                detected.push({
                    type: 'goal',
                    content,
                    quote: userText.slice(0, 200),
                });
                break;
            }
        }
    }
    return detected;
}
/**
 * Extract the actual commitment content from a regex match
 */
function extractCommitmentContent(match) {
    // Find the most meaningful captured group
    for (let i = match.length - 1; i > 0; i--) {
        if (match[i] && match[i].length > 3) {
            return cleanCommitmentText(match[i]);
        }
    }
    return '';
}
/**
 * Clean up commitment text
 */
function cleanCommitmentText(text) {
    return (text
        .trim()
        // Remove trailing punctuation
        .replace(/[.!?,]+$/, '')
        // Remove common filler words at start
        .replace(/^(just|like|maybe|probably|definitely|finally)\s+/i, '')
        // Limit length
        .slice(0, 150));
}
/**
 * Detect progress on existing commitments
 */
export function detectProgress(userText, existingCommitments) {
    const results = [];
    const text = userText.toLowerCase();
    // Check for completion
    for (const pattern of COMPLETION_PATTERNS) {
        if (pattern.test(text)) {
            // Find which commitment this might relate to
            for (const commitment of existingCommitments) {
                if (isCommitmentRelated(text, commitment.content)) {
                    results.push({
                        commitmentId: commitment.id,
                        type: 'completed',
                        context: userText.slice(0, 200),
                    });
                }
            }
        }
    }
    // Check for setbacks
    for (const pattern of SETBACK_PATTERNS) {
        if (pattern.test(text)) {
            for (const commitment of existingCommitments) {
                if (isCommitmentRelated(text, commitment.content)) {
                    results.push({
                        commitmentId: commitment.id,
                        type: 'setback',
                        context: userText.slice(0, 200),
                    });
                }
            }
        }
    }
    return results;
}
/**
 * Check if text relates to a commitment
 */
function isCommitmentRelated(text, commitmentContent) {
    const textWords = new Set(text.toLowerCase().split(/\s+/));
    const commitmentWords = commitmentContent.toLowerCase().split(/\s+/);
    // Check for significant word overlap
    let matches = 0;
    for (const word of commitmentWords) {
        if (word.length > 3 && textWords.has(word)) {
            matches++;
        }
    }
    // At least 2 significant words match
    return matches >= 2;
}
/**
 * Calculate follow-up date based on commitment type
 */
function calculateFollowUpDate(type) {
    const now = new Date();
    const followUp = new Date(now);
    switch (type) {
        case 'explicit':
            // Follow up in 3-5 days for explicit commitments
            followUp.setDate(now.getDate() + 4);
            break;
        case 'implicit':
            // Follow up in a week for "should" statements
            followUp.setDate(now.getDate() + 7);
            break;
        case 'goal':
            // Follow up in 2 weeks for goals
            followUp.setDate(now.getDate() + 14);
            break;
        case 'habit':
            // Follow up in 3 days for habits
            followUp.setDate(now.getDate() + 3);
            break;
        default:
            followUp.setDate(now.getDate() + 5);
    }
    return followUp;
}
// ============================================================================
// PERSISTENCE
// ============================================================================
const COLLECTION = 'bogle_users';
/**
 * Save a new commitment
 */
export async function saveCommitment(commitment) {
    try {
        const db = await getFirestoreDb();
        if (!db) {
            log.debug('Firestore not available, skipping commitment save');
            return;
        }
        const commitmentData = {
            ...commitment,
            createdAt: commitment.createdAt.toISOString(),
            lastMentioned: commitment.lastMentioned.toISOString(),
            followUpDate: commitment.followUpDate?.toISOString() || null,
            progressNotes: commitment.progressNotes.map((note) => ({
                ...note,
                date: note.date.toISOString(),
            })),
        };
        await db
            .collection(COLLECTION)
            .doc(commitment.userId)
            .collection('commitments')
            .doc(commitment.id)
            .set(cleanForFirestore(commitmentData));
        // Index to semantic memory for contextual retrieval
        indexCommitment({
            id: commitment.id,
            userId: commitment.userId,
            content: commitment.content,
            type: commitment.type,
            status: commitment.status,
            originalQuote: commitment.originalQuote,
            motivation: commitment.motivation,
            obstacles: commitment.obstacles,
        }, 'create');
        log.info({ userId: commitment.userId, commitmentId: commitment.id }, '💫 Commitment saved');
    }
    catch (err) {
        log.error({ error: String(err) }, 'Failed to save commitment');
    }
}
/**
 * Get user's active commitments
 */
export async function getActiveCommitments(userId) {
    try {
        const db = await getFirestoreDb();
        if (!db) {
            return [];
        }
        const snapshot = await db
            .collection(COLLECTION)
            .doc(userId)
            .collection('commitments')
            .where('status', 'in', ['active', 'in_progress'])
            .orderBy('createdAt', 'desc')
            .limit(20)
            .get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                createdAt: new Date(data.createdAt),
                lastMentioned: new Date(data.lastMentioned),
                followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
                progressNotes: (data.progressNotes || []).map((note) => ({
                    ...note,
                    date: new Date(note.date),
                })),
            };
        });
    }
    catch (err) {
        log.error({ error: String(err), userId }, 'Failed to get commitments');
        return [];
    }
}
/**
 * Get commitments due for follow-up
 */
export async function getCommitmentsDueForFollowUp(userId) {
    try {
        const db = await getFirestoreDb();
        if (!db) {
            return [];
        }
        const now = new Date();
        const snapshot = await db
            .collection(COLLECTION)
            .doc(userId)
            .collection('commitments')
            .where('status', 'in', ['active', 'in_progress'])
            .where('shouldFollowUp', '==', true)
            .where('followUpDate', '<=', now.toISOString())
            .limit(5)
            .get();
        return snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                ...data,
                id: doc.id,
                createdAt: new Date(data.createdAt),
                lastMentioned: new Date(data.lastMentioned),
                followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
                progressNotes: (data.progressNotes || []).map((note) => ({
                    ...note,
                    date: new Date(note.date),
                })),
            };
        });
    }
    catch (err) {
        log.error({ error: String(err), userId }, 'Failed to get follow-up commitments');
        return [];
    }
}
/**
 * Update commitment status
 */
export async function updateCommitmentStatus(userId, commitmentId, status, note) {
    try {
        const db = await getFirestoreDb();
        if (!db) {
            return;
        }
        const updates = {
            status,
            lastMentioned: new Date().toISOString(),
        };
        if (note) {
            // We need to add to progressNotes array
            const docRef = db
                .collection(COLLECTION)
                .doc(userId)
                .collection('commitments')
                .doc(commitmentId);
            const doc = await docRef.get();
            if (doc.exists) {
                const data = doc.data();
                const progressNotes = data?.progressNotes || [];
                progressNotes.push({
                    date: new Date().toISOString(),
                    note,
                    sentiment: status === 'completed' ? 'positive' : 'neutral',
                });
                updates.progressNotes = progressNotes;
            }
        }
        await db
            .collection(COLLECTION)
            .doc(userId)
            .collection('commitments')
            .doc(commitmentId)
            .update(cleanForFirestore(updates));
        // Update or remove from semantic index based on status
        if (status === 'completed' || status === 'abandoned') {
            deindexCommitment(userId, commitmentId);
        }
        log.info({ userId, commitmentId, status }, '✅ Commitment status updated');
    }
    catch (err) {
        log.error({ error: String(err), userId, commitmentId }, 'Failed to update commitment');
    }
}
/**
 * Record a follow-up was made
 */
export async function recordFollowUp(userId, commitmentId, reception) {
    try {
        const db = await getFirestoreDb();
        if (!db) {
            return;
        }
        // Calculate next follow-up based on reception
        const nextFollowUp = new Date();
        switch (reception) {
            case 'positive':
                nextFollowUp.setDate(nextFollowUp.getDate() + 7); // Follow up in a week
                break;
            case 'neutral':
                nextFollowUp.setDate(nextFollowUp.getDate() + 5);
                break;
            case 'avoidant':
                nextFollowUp.setDate(nextFollowUp.getDate() + 14); // Back off
                break;
        }
        const docRef = db
            .collection(COLLECTION)
            .doc(userId)
            .collection('commitments')
            .doc(commitmentId);
        const doc = await docRef.get();
        if (doc.exists) {
            const data = doc.data();
            await docRef.update(cleanForFirestore({
                followUpCount: (data?.followUpCount || 0) + 1,
                followUpReception: reception,
                followUpDate: nextFollowUp.toISOString(),
                lastMentioned: new Date().toISOString(),
                // If avoidant 3+ times, stop following up
                shouldFollowUp: reception === 'avoidant' && (data?.followUpCount || 0) >= 2 ? false : true,
            }));
        }
    }
    catch (err) {
        log.error({ error: String(err), userId, commitmentId }, 'Failed to record follow-up');
    }
}
// ============================================================================
// PUBLIC API
// ============================================================================
/**
 * Process user message for commitments
 * Call this from turn handler
 */
export async function processCommitments(userId, userText, context) {
    // Get existing commitments
    const existingCommitments = await getActiveCommitments(userId);
    // Detect new commitments
    const detected = detectCommitments(userText, context);
    const newCommitments = [];
    for (const d of detected) {
        // Check if similar commitment already exists
        const exists = existingCommitments.some((c) => isCommitmentRelated(c.content, d.content));
        if (!exists) {
            const commitment = {
                id: `commitment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                userId,
                content: d.content,
                type: d.type,
                status: 'active',
                createdAt: new Date(),
                lastMentioned: new Date(),
                followUpDate: calculateFollowUpDate(d.type),
                followUpType: 'check_in',
                originalQuote: d.quote,
                progressNotes: [],
                followUpCount: 0,
                followUpReception: 'unknown',
                importance: d.type === 'explicit' ? 'high' : 'medium',
                shouldFollowUp: d.type !== 'goal', // Don't auto follow-up on vague goals
            };
            await saveCommitment(commitment);
            newCommitments.push(commitment);
            log.info({ userId, type: d.type, content: d.content.slice(0, 50) }, '💫 New commitment detected');
        }
    }
    // Detect progress on existing commitments
    const progressUpdates = detectProgress(userText, existingCommitments);
    for (const update of progressUpdates) {
        await updateCommitmentStatus(userId, update.commitmentId, update.type === 'completed' ? 'completed' : 'in_progress', update.context);
    }
    // Get follow-ups due
    const followUpsDue = await getCommitmentsDueForFollowUp(userId);
    return {
        newCommitments,
        progressUpdates,
        followUpsDue,
    };
}
/**
 * Generate follow-up phrase for a commitment
 */
export function generateFollowUpPhrase(commitment) {
    const phrases = {
        check_in: [
            `Hey, I've been thinking about when you said you'd ${commitment.content}. How's that going?`,
            `Remember when you mentioned ${commitment.content}? Just curious how it's been.`,
            `I've been holding space for your ${commitment.content} thing. Any updates?`,
        ],
        celebrate: [
            `I noticed you've been working on ${commitment.content}. That takes real commitment.`,
            `The progress you've made on ${commitment.content}... I see it.`,
        ],
        encourage: [
            `I know ${commitment.content} hasn't been easy. That's okay. What's getting in the way?`,
            `Sometimes ${commitment.content} type goals hit roadblocks. Want to talk about it?`,
        ],
    };
    const typeOptions = phrases[commitment.followUpType] || phrases.check_in;
    return typeOptions[Math.floor(Math.random() * typeOptions.length)];
}
// Types are already exported at definition - no need to re-export
//# sourceMappingURL=commitment-tracking.js.map