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
import { settleAwaitingAnswers, type FollowUpAnswer } from './commitment-follow-through.js';

// Use dynamic import for Firestore to avoid hard dependency
async function getFirestoreDb(): Promise<FirebaseFirestore.Firestore | null> {
  try {
    const { getFirestore } = await import('firebase-admin/firestore');
    return getFirestore();
  } catch {
    return null;
  }
}

const log = createLogger({ module: 'CommitmentTracking' });

// ============================================================================
// TYPES
// ============================================================================

export type CommitmentType =
  | 'explicit' // "I'm going to..."
  | 'implicit' // "I should..." / "I need to..."
  | 'goal' // Bigger life goal mentioned
  | 'promise' // Promise to self or others
  | 'habit' // Habit they want to build/break
  | 'task'; // One-time task

export type CommitmentStatus =
  | 'active' // Currently being tracked
  | 'completed' // Successfully done
  | 'abandoned' // They decided not to pursue
  | 'paused' // Temporarily on hold
  | 'in_progress'; // Making progress

export type FollowUpType =
  | 'check_in' // General "how's it going"
  | 'specific' // About a specific commitment
  | 'celebrate' // They achieved something
  | 'encourage' // After a setback
  | 'remind'; // Gentle reminder

export interface Commitment {
  id: string;
  userId: string;

  /** What they committed to */
  content: string;

  /** Type of commitment */
  type: CommitmentType;

  /** Current status */
  status: CommitmentStatus;

  /** When they made the commitment */
  createdAt: Date;

  /** Last time we discussed this */
  lastMentioned: Date;

  /** When to follow up */
  followUpDate: Date | null;

  /** Follow-up type */
  followUpType: FollowUpType;

  /** Original context (what they said) */
  originalQuote: string;

  /** Why this matters to them (if shared) */
  motivation?: string;

  /** Any obstacles they mentioned */
  obstacles?: string[];

  /** Progress notes */
  progressNotes: Array<{
    date: Date;
    note: string;
    sentiment: 'positive' | 'neutral' | 'setback';
  }>;

  /** Times we've followed up */
  followUpCount: number;

  /** Their response to follow-ups */
  followUpReception: 'positive' | 'neutral' | 'avoidant' | 'unknown';

  /** Related topic area */
  domain?:
    | 'health'
    | 'relationships'
    | 'career'
    | 'personal_growth'
    | 'finance'
    | 'creativity'
    | 'other';

  /** Importance they indicated (explicit or inferred) */
  importance: 'high' | 'medium' | 'low';

  /** Should we actively follow up? Off once we've asked (one follow-up, never a nag). */
  shouldFollowUp: boolean;

  /** We asked how it went and haven't heard yet (see commitment-follow-through.ts). */
  awaitingAnswer?: boolean;
  followUpAskedAt?: string;
}

export interface CommitmentProfile {
  userId: string;
  commitments: Commitment[];

  /** Total commitments made */
  totalCommitments: number;

  /** Completion rate */
  completionRate: number;

  /** Patterns */
  patterns: {
    /** Domains they commit to most */
    topDomains: string[];
    /** Common obstacles */
    commonObstacles: string[];
    /** Best time for check-ins */
    bestFollowUpTiming: 'morning' | 'evening' | 'midweek' | 'weekend';
    /** How they respond to accountability */
    accountabilityStyle: 'welcome' | 'gentle' | 'minimal';
  };
}

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
export function detectCommitments(
  userText: string,
  _context?: { recentTopics?: string[]; emotion?: string }
): Array<{ type: CommitmentType; content: string; quote: string }> {
  const detected: Array<{ type: CommitmentType; content: string; quote: string }> = [];
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
function extractCommitmentContent(match: RegExpMatchArray): string {
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
function cleanCommitmentText(text: string): string {
  return (
    text
      .trim()
      // Remove trailing punctuation
      .replace(/[.!?,]+$/, '')
      // Remove common filler words at start
      .replace(/^(just|like|maybe|probably|definitely|finally)\s+/i, '')
      // Limit length
      .slice(0, 150)
  );
}

/**
 * Detect progress on existing commitments
 */
export function detectProgress(
  userText: string,
  existingCommitments: Commitment[]
): Array<{ commitmentId: string; type: 'completed' | 'progress' | 'setback'; context: string }> {
  const results: Array<{
    commitmentId: string;
    type: 'completed' | 'progress' | 'setback';
    context: string;
  }> = [];
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
function isCommitmentRelated(text: string, commitmentContent: string): boolean {
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
function calculateFollowUpDate(type: CommitmentType): Date {
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
export async function saveCommitment(commitment: Commitment): Promise<void> {
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
    indexCommitment(
      {
        id: commitment.id,
        userId: commitment.userId,
        content: commitment.content,
        type: commitment.type,
        status: commitment.status,
        originalQuote: commitment.originalQuote,
        motivation: commitment.motivation,
        obstacles: commitment.obstacles,
      },
      'create'
    );

    log.info({ userId: commitment.userId, commitmentId: commitment.id }, '💫 Commitment saved');
  } catch (err) {
    log.error({ error: String(err) }, 'Failed to save commitment');
  }
}

/**
 * A stored commitment. The commitment-keeper service writes to the same
 * collection with `summary` instead of `content`; read either, skip neither-text docs.
 */
function fromDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): Commitment | null {
  const data = doc.data();
  const content = data.content ?? data.summary ?? data.statement;
  if (typeof content !== 'string' || !content) return null;
  const notes = (data.progressNotes as Array<{ date: string; note: string }>) || [];
  return {
    ...data,
    id: doc.id,
    content,
    createdAt: new Date(data.createdAt as string),
    lastMentioned: new Date(data.lastMentioned as string),
    followUpDate: data.followUpDate ? new Date(data.followUpDate as string) : null,
    progressNotes: notes.map((note) => ({ ...note, date: new Date(note.date) })),
  } as Commitment;
}

/**
 * Get user's active commitments
 */
export async function getActiveCommitments(userId: string): Promise<Commitment[]> {
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

    return snapshot.docs.flatMap((doc) => fromDoc(doc) ?? []);
  } catch (err) {
    log.error({ error: String(err), userId }, 'Failed to get commitments');
    return [];
  }
}

/** Due for its one follow-up: asked about at most once, never while awaiting an answer. */
function isDueForFollowUp(c: Commitment, now: Date): boolean {
  return (
    c.shouldFollowUp === true &&
    !c.awaitingAnswer &&
    c.followUpDate !== null &&
    c.followUpDate.getTime() <= now.getTime()
  );
}

/**
 * Get commitments due for follow-up. Filtered in memory from the active list:
 * the old status+shouldFollowUp+followUpDate query had no composite index.
 */
export async function getCommitmentsDueForFollowUp(userId: string): Promise<Commitment[]> {
  const now = new Date();
  return (await getActiveCommitments(userId)).filter((c) => isDueForFollowUp(c, now)).slice(0, 5);
}

/**
 * Update commitment status
 */
export async function updateCommitmentStatus(
  userId: string,
  commitmentId: string,
  status: CommitmentStatus,
  note?: string
): Promise<void> {
  try {
    const db = await getFirestoreDb();
    if (!db) {
      return;
    }

    const updates: Record<string, unknown> = {
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
  } catch (err) {
    log.error({ error: String(err), userId, commitmentId }, 'Failed to update commitment');
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Process user message for commitments
 * Call this from turn handler
 */
export async function processCommitments(
  userId: string,
  userText: string,
  context?: { recentTopics?: string[]; emotion?: string }
): Promise<{
  newCommitments: Commitment[];
  progressUpdates: Array<{ commitmentId: string; type: string }>;
  followUpsDue: Commitment[];
  /** Answers to a follow-up Ferni asked last turn, now recorded. */
  answers: FollowUpAnswer[];
}> {
  // Get existing commitments
  const existingCommitments = await getActiveCommitments(userId);
  const answers = await settleAwaitingAnswers(userId, userText, existingCommitments);
  const answered = new Set(answers.map((a) => a.id));

  // Detect new commitments
  const detected = detectCommitments(userText, context);
  const newCommitments: Commitment[] = [];

  for (const d of detected) {
    // Check if similar commitment already exists
    const exists = existingCommitments.some((c) => isCommitmentRelated(c.content, d.content));

    if (!exists) {
      const commitment: Commitment = {
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

      log.info(
        { userId, type: d.type, content: d.content.slice(0, 50) },
        '💫 New commitment detected'
      );
    }
  }

  // Detect progress on existing commitments
  const unanswered = existingCommitments.filter((c) => !answered.has(c.id));
  const progressUpdates = detectProgress(userText, unanswered);

  for (const update of progressUpdates) {
    await updateCommitmentStatus(
      userId,
      update.commitmentId,
      update.type === 'completed' ? 'completed' : 'in_progress',
      update.context
    );
  }

  const now = new Date();
  const followUpsDue = unanswered.filter((c) => isDueForFollowUp(c, now)).slice(0, 5);

  return { newCommitments, progressUpdates, followUpsDue, answers };
}

/**
 * Generate follow-up phrase for a commitment
 */
export function generateFollowUpPhrase(commitment: Commitment): string {
  const phrases: Record<string, string[]> = {
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
