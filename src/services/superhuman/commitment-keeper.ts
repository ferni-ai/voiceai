/**
 * Commitment Keeper - Better Than Human Service
 *
 * What no human friend can do: Never forget what you said you'd do.
 *
 * Tracks user commitments made during conversations and follows up
 * with care (not nagging). This is the foundation of "better than human"
 * accountability.
 *
 * @module services/superhuman/commitment-keeper
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';
import {
  validateCommitmentFeasibility,
  createCalendarBlocksForCommitment,
  buildCommitmentCalendarContext,
  type CommitmentFeasibility,
} from './commitment-calendar-integration.js';
import { syncCommitmentToCalendar } from '../calendar/calendar-bridge.js';
import { onCommitmentKeeperChange } from '../data-layer/hooks/superhuman-hooks.js';
import { onCommitmentMade, onCommitmentAtRisk } from '../outreach/superhuman-outreach-bridge.js';

const log = createLogger({ module: 'commitment-keeper' });

// ============================================================================
// TYPES
// ============================================================================

export type CommitmentType =
  | 'intention' // "I'm going to..." - soft commitment
  | 'promise' // "I promise..." - strong commitment
  | 'goal' // "My goal is..." - aspirational
  | 'boundary' // "I need to stop..." - self-protection
  | 'conversation' // "I need to talk to..." - interpersonal
  | 'decision' // "I've decided..." - firm choice
  | 'experiment'; // "I'm going to try..." - exploratory;

export type CommitmentStatus =
  | 'active' // Still working toward it
  | 'completed' // User confirmed done
  | 'deferred' // Postponed with reason
  | 'abandoned' // User decided not to pursue
  | 'unclear'; // Need to check in

export type FollowUpTone =
  | 'curious' // "How did it go?"
  | 'supportive' // "No pressure, just thinking of you"
  | 'celebratory' // "Tell me everything!"
  | 'gentle' // "I know this was hard..."
  | 'patient'; // "Whenever you're ready"

export interface Commitment {
  id: string;
  userId: string;

  // What they committed to
  statement: string; // Original words
  summary: string; // Condensed version
  text: string; // Alias for summary (for calendar integration)
  type: CommitmentType;

  // Context
  topic?: string; // What were we discussing
  emotionalWeight: number; // 0-1 how significant this feels
  personInvolved?: string; // If about a relationship/conversation

  // Timing
  createdAt: number;
  targetDate?: number; // When they said they'd do it
  lastMentioned: number;
  followUpAfter: number; // When to check in

  // Status
  status: CommitmentStatus;
  followUpCount: number;
  lastFollowUp?: number;

  // Learning
  userReactionToFollowUp?: 'appreciated' | 'annoyed' | 'neutral';

  // Calendar integration (Better Than Human)
  calendarEventIds?: string[]; // Events created for this commitment
  feasibilityScore?: number; // 0-100, how feasible given calendar
  duration?: number; // Duration in minutes for recurring commitments
  frequency?: { times: number; period: string }; // e.g., { times: 3, period: 'week' }
  preferredTime?: string; // 'morning', 'afternoon', 'evening'
}

export interface CommitmentFollowUp {
  commitmentId: string;
  tone: FollowUpTone;
  message: string;
  shouldSurface: boolean;
  urgency: 'low' | 'normal' | 'high';
}

export interface CommitmentDetectionResult {
  detected: boolean;
  commitment?: Omit<
    Commitment,
    'id' | 'createdAt' | 'lastMentioned' | 'followUpAfter' | 'status' | 'followUpCount'
  >;
  confidence: number;
}

// ============================================================================
// COMMITMENT DETECTION PATTERNS
// ============================================================================

// Sarcasm indicators - reduce confidence when detected (P2 FIX)
const SARCASM_INDICATORS = [
  /\(not\)$/i,
  /\bas if\b/i,
  /\byeah right\b/i,
  /\bsure,? (yeah|right|okay|uh huh)/i,
  /\boh (sure|yeah|definitely|absolutely)\b/i,
  /\bwhen (pigs fly|hell freezes)/i,
  /\b(totally|definitely|absolutely),? (not|never)/i,
  /\b🙄|\/s$/i, // Eye roll emoji or /s tag
  /\blol as if\b/i,
  /\bsuuure\b/i, // Drawn out "sure"
];

// External pressure - NOT the user's own commitment (P3 FIX)
const EXTERNAL_PRESSURE_PATTERNS = [
  /\b(everyone|they|people|my (mom|dad|parents|boss|friends)) (say|says|tell|tells|think|thinks) i should\b/i,
  /\b(everyone|they) (want|wants) me to\b/i,
  /\bi('m| am) supposed to\b/i, // Obligation, not commitment
  /\bi('m| am) expected to\b/i,
];

const COMMITMENT_PATTERNS: Array<{
  pattern: RegExp;
  type: CommitmentType;
  weight: number;
}> = [
  // Strong intentions
  { pattern: /\bi('m| am) going to\b/i, type: 'intention', weight: 0.7 },
  { pattern: /\bi('ll| will)\b/i, type: 'intention', weight: 0.6 },
  { pattern: /\bi need to\b/i, type: 'intention', weight: 0.65 },
  { pattern: /\bi have to\b/i, type: 'intention', weight: 0.6 },
  { pattern: /\bi('ve| have) got to\b/i, type: 'intention', weight: 0.65 },
  { pattern: /\bi want to\b/i, type: 'intention', weight: 0.5 },

  // Gen-Z / Casual slang intentions (P1 FIX)
  { pattern: /\bgonna\b/i, type: 'intention', weight: 0.65 }, // Works standalone
  { pattern: /\bi('m| am)? ?gonna\b/i, type: 'intention', weight: 0.7 }, // With "I'm"
  { pattern: /\bfinna\b/i, type: 'intention', weight: 0.7 }, // "fixing to"
  { pattern: /\bboutta\b/i, type: 'intention', weight: 0.65 }, // "about to"
  { pattern: /\bdeadass (gonna|going to|finna)\b/i, type: 'intention', weight: 0.85 }, // emphatic
  { pattern: /\blowkey (need to|gotta|gonna)\b/i, type: 'intention', weight: 0.6 },
  { pattern: /\bhighkey (need to|gotta|gonna)\b/i, type: 'intention', weight: 0.7 },
  { pattern: /\bno cap,? i('m| am)?\b/i, type: 'intention', weight: 0.7 }, // "not lying"
  { pattern: /\bi gotta\b/i, type: 'intention', weight: 0.65 },
  { pattern: /\bimma\b/i, type: 'intention', weight: 0.65 }, // "I'm going to"
  { pattern: /\bfr fr\b/i, type: 'intention', weight: 0.5 }, // "for real for real" = emphasis

  // ESL / Non-native speaker patterns (P1 FIX)
  { pattern: /\bi (will|must) (to )?do\b/i, type: 'intention', weight: 0.6 },
  { pattern: /\bi must to\b/i, type: 'intention', weight: 0.55 },
  { pattern: /\btomorrow i (will |am |)(start|do|make|go)\b/i, type: 'intention', weight: 0.65 },
  { pattern: /\bi (am )?(make|do) (start|begin)\b/i, type: 'intention', weight: 0.55 },
  { pattern: /\bi (will |am )?definitely\b/i, type: 'intention', weight: 0.6 },

  // Implicit/hedged intentions (maybe → still tracking)
  { pattern: /\bmaybe i should\b/i, type: 'intention', weight: 0.4 },
  { pattern: /\bi (keep|kept) telling myself\b/i, type: 'intention', weight: 0.5 },
  { pattern: /\bi (really )?(should|ought to)\b/i, type: 'intention', weight: 0.5 },

  // Indirect commitments - "consider it done" patterns (P2 FIX)
  {
    pattern: /\bconsider (it|that|the \w+) (as )?(good as )?done\b/i,
    type: 'promise',
    weight: 0.75,
  },
  { pattern: /\bsay less\b/i, type: 'intention', weight: 0.65 }, // Gen-Z "I got you"
  { pattern: /\bi got (you|this|it)\b/i, type: 'intention', weight: 0.6 },
  { pattern: /\b(say no more|no need to ask twice)\b/i, type: 'promise', weight: 0.7 },
  { pattern: /\b(count on|you can count on) (me|it)\b/i, type: 'promise', weight: 0.8 },
  { pattern: /\bi('ll|'d) bet (i'm|i am|i'll)\b/i, type: 'intention', weight: 0.55 },

  // Archaic/formal patterns (P2 FIX)
  { pattern: /\bupon the morrow\b/i, type: 'intention', weight: 0.55 },
  { pattern: /\bshall (find|ensure|complete|deliver)\b/i, type: 'intention', weight: 0.6 },
  { pattern: /\bby (eod|end of day|close of business|cob)\b/i, type: 'intention', weight: 0.7 },

  // More ESL patterns (P2 FIX)
  { pattern: /\bme (finish|do|make|complete|send)\b/i, type: 'intention', weight: 0.55 },
  { pattern: /\bno (you )?worry\b/i, type: 'promise', weight: 0.5 },

  // Double negative patterns (P3 FIX) - "It's not as though I'm NOT going to..."
  { pattern: /\bnot as (though|if) i('m| am)? not\b/i, type: 'intention', weight: 0.6 },
  { pattern: /\bi('m| am) not not going to\b/i, type: 'intention', weight: 0.6 },
  {
    pattern: /\bit('s| is) not (like|that) i (won't|wouldn't)\b/i,
    type: 'intention',
    weight: 0.55,
  },

  // Formal/legal patterns (P3 FIX)
  { pattern: /\b(hereby|herewith) (undertake|commit|agree)\b/i, type: 'promise', weight: 0.7 },
  { pattern: /\bthe undersigned\b/i, type: 'promise', weight: 0.65 },
  { pattern: /\bensure (the|that|its)\b/i, type: 'intention', weight: 0.55 },
  { pattern: /\bfacilitate (the|delivery|completion)\b/i, type: 'intention', weight: 0.55 },
  { pattern: /\bprior to (the|conclusion|end)\b/i, type: 'intention', weight: 0.5 },

  // UK/AU slang (P3 FIX)
  { pattern: /\bgive it a (fair )?crack\b/i, type: 'intention', weight: 0.6 },
  { pattern: /\bshe'll be (right|apples)\b/i, type: 'promise', weight: 0.55 },
  { pattern: /\bno worries,? (i'll|i will)\b/i, type: 'promise', weight: 0.7 },

  // More ESL/broken English (P3 FIX)
  { pattern: /\bi am will be\b/i, type: 'intention', weight: 0.5 },
  { pattern: /\bi am the person who (does|will)\b/i, type: 'intention', weight: 0.55 },
  { pattern: /\bby the time of\b/i, type: 'intention', weight: 0.5 },

  // Promises
  { pattern: /\bi promise\b/i, type: 'promise', weight: 0.9 },
  { pattern: /\bi swear\b/i, type: 'promise', weight: 0.85 },
  { pattern: /\bi commit to\b/i, type: 'promise', weight: 0.9 },
  { pattern: /\bon god\b/i, type: 'promise', weight: 0.8 }, // Gen-Z emphatic promise

  // Goals
  { pattern: /\bmy goal is\b/i, type: 'goal', weight: 0.8 },
  { pattern: /\bi('m| am) working on\b/i, type: 'goal', weight: 0.6 },
  { pattern: /\bi('m| am) trying to\b/i, type: 'experiment', weight: 0.5 },

  // Boundaries
  { pattern: /\bi need to stop\b/i, type: 'boundary', weight: 0.7 },
  { pattern: /\bi('m| am) done with\b/i, type: 'boundary', weight: 0.75 },
  { pattern: /\bno more\b/i, type: 'boundary', weight: 0.6 },

  // Conversations
  { pattern: /\bi need to (talk|speak) to\b/i, type: 'conversation', weight: 0.8 },
  { pattern: /\bi('m| am) going to (tell|ask|confront)\b/i, type: 'conversation', weight: 0.75 },
  {
    pattern: /\bi have to have (a|that)( \w+)? conversation\b/i,
    type: 'conversation',
    weight: 0.85,
  },
  {
    pattern: /\bi need to have (a|that)( \w+)? conversation\b/i,
    type: 'conversation',
    weight: 0.85,
  },

  // Decisions
  { pattern: /\bi('ve| have) decided\b/i, type: 'decision', weight: 0.85 },
  { pattern: /\bi('m| am) going to (quit|leave|end)\b/i, type: 'decision', weight: 0.8 },
  {
    pattern: /\bi('m| am) going to start (my own|a) (business|company|practice)/i,
    type: 'decision',
    weight: 0.85,
  },
  { pattern: /\bthat('s| is) it,? i('m| am)\b/i, type: 'decision', weight: 0.7 },
];

const TIME_PATTERNS: Array<{ pattern: RegExp; daysFromNow: number }> = [
  { pattern: /\btoday\b/i, daysFromNow: 0 },
  { pattern: /\btonight\b/i, daysFromNow: 0 },
  { pattern: /\btomorrow\b/i, daysFromNow: 1 },
  { pattern: /\bthis week\b/i, daysFromNow: 5 },
  { pattern: /\bnext week\b/i, daysFromNow: 10 },
  { pattern: /\bthis weekend\b/i, daysFromNow: 4 },
  { pattern: /\bby (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, daysFromNow: 7 },
  { pattern: /\bsoon\b/i, daysFromNow: 3 },
];

// ============================================================================
// DETECTION
// ============================================================================

export function detectCommitment(
  transcript: string,
  userId: string,
  context?: { topic?: string; personMentioned?: string; emotionalIntensity?: number }
): CommitmentDetectionResult {
  const lowerTranscript = transcript.toLowerCase();

  // P2 FIX: Check for sarcasm indicators FIRST
  const hasSarcasm = SARCASM_INDICATORS.some((pattern) => pattern.test(lowerTranscript));
  if (hasSarcasm) {
    // Don't detect commitments that are clearly sarcastic
    return { detected: false, confidence: 0 };
  }

  // P3 FIX: Check for external pressure - not the user's own commitment
  const isExternalPressure = EXTERNAL_PRESSURE_PATTERNS.some((pattern) =>
    pattern.test(lowerTranscript)
  );
  if (isExternalPressure) {
    // External pressure is NOT a commitment the user made
    return { detected: false, confidence: 0 };
  }

  // Find matching patterns
  let bestMatch: { type: CommitmentType; weight: number } | null = null;
  let matchedPattern: RegExp | null = null;

  for (const { pattern, type, weight } of COMMITMENT_PATTERNS) {
    if (pattern.test(lowerTranscript)) {
      if (!bestMatch || weight > bestMatch.weight) {
        bestMatch = { type, weight };
        matchedPattern = pattern;
      }
    }
  }

  if (!bestMatch || !matchedPattern) {
    return { detected: false, confidence: 0 };
  }

  // Extract the commitment statement
  const match = transcript.match(matchedPattern);
  if (!match) {
    return { detected: false, confidence: 0 };
  }

  // Get the rest of the sentence after the pattern
  const matchIndex = match.index || 0;
  const afterMatch = transcript.slice(matchIndex);
  const sentenceEnd = afterMatch.search(/[.!?]|$/);
  const statement = afterMatch.slice(0, sentenceEnd + 1).trim();

  // Create summary (first 100 chars or to period)
  const summary = statement.length > 100 ? `${statement.slice(0, 97)}...` : statement;

  // Detect target date
  let targetDate: number | undefined;
  for (const { pattern, daysFromNow } of TIME_PATTERNS) {
    if (pattern.test(lowerTranscript)) {
      targetDate = Date.now() + daysFromNow * 24 * 60 * 60 * 1000;
      break;
    }
  }

  // Calculate emotional weight
  const emotionalWeight = Math.min(1, (context?.emotionalIntensity || 0.5) * bestMatch.weight);

  return {
    detected: true,
    confidence: bestMatch.weight,
    commitment: {
      userId,
      statement,
      summary,
      text: summary, // Alias for calendar integration
      type: bestMatch.type,
      topic: context?.topic,
      emotionalWeight,
      personInvolved: context?.personMentioned,
      targetDate,
    },
  };
}

// ============================================================================
// STORAGE
// ============================================================================

const commitmentCache = new Map<string, Commitment[]>();

export async function saveCommitment(
  commitment: Omit<Commitment, 'id'>,
  options?: { validateCalendar?: boolean; createCalendarBlocks?: boolean }
): Promise<{ commitment: Commitment; feasibility?: CommitmentFeasibility }> {
  const id = `commit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const fullCommitment: Commitment = {
    ...commitment,
    id,
    text: commitment.summary, // Alias for calendar integration
    createdAt: Date.now(),
    lastMentioned: Date.now(),
    followUpAfter: commitment.targetDate || Date.now() + 3 * 24 * 60 * 60 * 1000, // Default 3 days
    status: 'active',
    followUpCount: 0,
  };

  // Better Than Human: Validate against calendar
  let feasibility: CommitmentFeasibility | undefined;
  if (options?.validateCalendar !== false) {
    try {
      feasibility = await validateCommitmentFeasibility(commitment.userId, fullCommitment);
      fullCommitment.feasibilityScore = feasibility.score;

      if (!feasibility.feasible) {
        log.info(
          {
            userId: commitment.userId,
            commitment: commitment.summary,
            score: feasibility.score,
            conflicts: feasibility.conflicts,
          },
          '⚠️ Commitment may not be feasible given calendar'
        );
      }
    } catch (error) {
      log.warn({ error: String(error) }, 'Calendar feasibility check failed (non-blocking)');
    }
  }

  try {
    const db = getFirestoreDb();
    if (db) {
      await db
        .collection('bogle_users')
        .doc(commitment.userId)
        .collection('commitments')
        .doc(id)
        .set(cleanForFirestore(fullCommitment));
    }

    // Index to semantic memory for cross-domain awareness
    void onCommitmentKeeperChange(
      commitment.userId,
      id,
      {
        commitment: fullCommitment.summary,
        madeOn: new Date(fullCommitment.createdAt).toISOString(),
        status: 'pending',
        remindersSent: 0,
      },
      'create'
    );

    // Better Than Human: Create calendar blocks for the commitment
    // Auto-create blocks when there's a target date (better than human by default)
    const shouldCreateBlocks = options?.createCalendarBlocks ?? !!commitment.targetDate;
    if (shouldCreateBlocks && feasibility?.suggestedSlots?.length) {
      try {
        const blocks = await createCalendarBlocksForCommitment(
          commitment.userId,
          fullCommitment,
          feasibility.suggestedSlots
        );

        if (blocks.eventIds.length > 0) {
          fullCommitment.calendarEventIds = blocks.eventIds;

          // Update Firestore with calendar event IDs
          if (db) {
            await db
              .collection('bogle_users')
              .doc(commitment.userId)
              .collection('commitments')
              .doc(id)
              .update(cleanForFirestore({ calendarEventIds: blocks.eventIds }));
          }

          log.info(
            {
              userId: commitment.userId,
              commitmentId: id,
              blocksCreated: blocks.eventIds.length,
            },
            'Calendar blocks created for commitment'
          );
        }
      } catch (error) {
        log.warn({ error: String(error) }, 'Failed to create calendar blocks (non-blocking)');
      }
    }

    // Sync commitment target date to calendar as reminder event
    if (commitment.targetDate) {
      try {
        await syncCommitmentToCalendar(
          commitment.userId,
          id,
          fullCommitment.summary,
          new Date(commitment.targetDate),
          {
            description: fullCommitment.statement,
            type: fullCommitment.type,
            emotionalWeight: fullCommitment.emotionalWeight,
          }
        );
      } catch (calendarError) {
        log.warn({ error: String(calendarError) }, 'Failed to sync commitment to calendar');
      }
    }

    // Update cache
    const userCommitments = commitmentCache.get(commitment.userId) || [];
    userCommitments.push(fullCommitment);
    commitmentCache.set(commitment.userId, userCommitments);

    // Better Than Human: Schedule proactive follow-up via outreach system
    try {
      await onCommitmentMade(commitment.userId, {
        id,
        summary: fullCommitment.summary,
        deadline: fullCommitment.targetDate ? new Date(fullCommitment.targetDate) : undefined,
      });
    } catch (outreachError) {
      // Outreach is optional - don't fail commitment save
      log.debug({ error: String(outreachError) }, 'Outreach scheduling failed (non-blocking)');
    }

    log.info(
      { userId: commitment.userId, commitmentId: id, type: fullCommitment.type },
      'Commitment saved'
    );

    return { commitment: fullCommitment, feasibility };
  } catch (error) {
    log.error({ error: String(error), userId: commitment.userId }, 'Failed to save commitment');
    throw error;
  }
}

export async function loadUserCommitments(userId: string): Promise<Commitment[]> {
  if (commitmentCache.has(userId)) {
    return commitmentCache.get(userId) || [];
  }

  try {
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('commitments')
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const commitments = snapshot.docs.map((doc) => doc.data() as Commitment);
    commitmentCache.set(userId, commitments);

    return commitments;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load commitments');
    return [];
  }
}

export async function updateCommitmentStatus(
  userId: string,
  commitmentId: string,
  status: CommitmentStatus,
  reaction?: 'appreciated' | 'annoyed' | 'neutral'
): Promise<void> {
  try {
    const db = getFirestoreDb();
    if (db) {
      await db
        .collection('bogle_users')
        .doc(userId)
        .collection('commitments')
        .doc(commitmentId)
        .update(
          cleanForFirestore({
            status,
            ...(reaction && { userReactionToFollowUp: reaction }),
            lastMentioned: Date.now(),
          })
        );
    }

    // Update cache
    const userCommitments = commitmentCache.get(userId) || [];
    const idx = userCommitments.findIndex((c) => c.id === commitmentId);
    if (idx >= 0) {
      userCommitments[idx].status = status;
      if (reaction) userCommitments[idx].userReactionToFollowUp = reaction;

      // 🎭 TRIGGER GROUP OUTREACH: When a commitment is completed, celebrate with the team!
      if (status === 'completed') {
        const commitment = userCommitments[idx];
        // Only trigger for emotionally significant commitments
        if (commitment.emotionalWeight > 0.5) {
          void triggerCommitmentCelebration(userId, commitment);
        }
      }
    }

    log.info({ userId, commitmentId, status }, '✅ Commitment status updated');
  } catch (error) {
    log.error({ error: String(error), userId, commitmentId }, 'Failed to update commitment');
  }
}

/**
 * Trigger team celebration when a significant commitment is completed.
 * Fire-and-forget - doesn't block the main flow.
 */
async function triggerCommitmentCelebration(userId: string, commitment: Commitment): Promise<void> {
  try {
    const { onCommitmentMilestone } =
      await import('../conversation-thread/group-outreach-triggers.js');
    await onCommitmentMilestone(userId, {
      commitmentText: commitment.summary,
      completionRate: 1, // Completed = 100%
    });
  } catch (error) {
    // Non-blocking - just log the error
    log.debug(
      { error: String(error), userId },
      'Failed to trigger commitment celebration (non-fatal)'
    );
  }
}

// ============================================================================
// FOLLOW-UP GENERATION
// ============================================================================

const FOLLOW_UP_TEMPLATES: Record<CommitmentType, Record<FollowUpTone, string[]>> = {
  intention: {
    curious: [
      'I keep thinking about when you said "{summary}". How did it go?',
      'You mentioned "{summary}" a while back. Did that happen?',
    ],
    supportive: [
      'No pressure, but I remembered you wanted to {summary}. Still on your mind?',
      'I\'ve been thinking about you. That thing about "{summary}" - whenever you\'re ready.',
    ],
    celebratory: ['Tell me you did it! "{summary}" - did it happen?!'],
    gentle: ['I know "{summary}" was a big step. How are you feeling about it?'],
    patient: ['"{summary}" - I\'m here whenever you want to talk about how it went.'],
  },
  promise: {
    curious: ['You made a promise to yourself about "{summary}". How\'s that going?'],
    supportive: ['That promise you made - "{summary}" - I believe in you. How\'s it going?'],
    celebratory: ['That promise! "{summary}" - please tell me you kept it!'],
    gentle: ['Promises to ourselves are hard. "{summary}" - no judgment, just checking in.'],
    patient: ['"{summary}" - still working on it? I\'m not going anywhere.'],
  },
  conversation: {
    curious: [
      'Did you have that conversation? The one about "{summary}"?',
      'I keep thinking about that talk you needed to have. "{summary}" - any updates?',
    ],
    supportive: [
      'Those conversations are never easy. "{summary}" - still finding the right moment?',
      'I\'m here if you want to practice. "{summary}" - big conversations take time.',
    ],
    celebratory: ['You had the talk! Tell me about "{summary}"!'],
    gentle: [
      'I know "{summary}" has been weighing on you. The right words will come.',
      'Hard conversations. "{summary}". I\'m proud of you just for trying.',
    ],
    patient: [
      '"{summary}" - whenever you\'re ready. The conversation will happen when it\'s meant to.',
    ],
  },
  boundary: {
    curious: ['How\'s that boundary going? The one about "{summary}"?'],
    supportive: ['Boundaries are hard. "{summary}" - you\'re doing the work.'],
    celebratory: ['Look at you holding that boundary! "{summary}" - that\'s growth.'],
    gentle: ['"{summary}" - boundaries wobble sometimes. That\'s okay.'],
    patient: ['"{summary}" - every day you hold it is a win.'],
  },
  goal: {
    curious: ['Progress check! "{summary}" - where are you at?'],
    supportive: ['Your goal to "{summary}" - still important to you?'],
    celebratory: ['Goal update time! "{summary}" - I want to hear everything!'],
    gentle: ['Goals shift sometimes. "{summary}" - still feels right?'],
    patient: ['"{summary}" - big goals take time. How\'s the journey?'],
  },
  decision: {
    curious: ['You decided "{summary}". How\'s that playing out?'],
    supportive: ['That was a big decision. "{summary}" - feeling good about it?'],
    celebratory: ['You made the call! "{summary}" - living with it okay?'],
    gentle: ['Decisions have aftershocks. "{summary}" - processing it okay?'],
    patient: ['"{summary}" - decisions unfold over time. How are you feeling now?'],
  },
  experiment: {
    curious: ['How\'s the experiment going? "{summary}"?'],
    supportive: ['Trying new things is brave. "{summary}" - learning anything?'],
    celebratory: ['Experiment results! "{summary}" - what\'d you discover?'],
    gentle: ['Experiments can fail - that\'s the point. "{summary}" - any data?'],
    patient: ['"{summary}" - experiments take time. Still exploring?'],
  },
};

export function generateFollowUp(commitment: Commitment): CommitmentFollowUp | null {
  const now = Date.now();

  // Don't follow up too soon
  if (now < commitment.followUpAfter) {
    return null;
  }

  // Don't follow up more than 3 times
  if (commitment.followUpCount >= 3) {
    return null;
  }

  // Calculate tone based on context
  let tone: FollowUpTone = 'curious';
  if (commitment.emotionalWeight > 0.7) {
    tone = 'gentle';
  } else if (commitment.followUpCount > 0) {
    tone = commitment.userReactionToFollowUp === 'annoyed' ? 'patient' : 'supportive';
  } else if (commitment.type === 'promise' || commitment.type === 'decision') {
    tone = 'supportive';
  }

  // Get templates for this type and tone
  const templates = FOLLOW_UP_TEMPLATES[commitment.type]?.[tone] || [
    'How\'s that thing going? "{summary}"',
  ];

  const template = templates[Math.floor(Math.random() * templates.length)];
  const message = template.replace(/{summary}/g, commitment.summary);

  // Calculate urgency
  let urgency: 'low' | 'normal' | 'high' = 'normal';
  if (commitment.targetDate && now > commitment.targetDate) {
    urgency = 'low'; // Past due - be gentle
  } else if (commitment.type === 'conversation' && commitment.emotionalWeight > 0.7) {
    urgency = 'high'; // Important conversation
  }

  return {
    commitmentId: commitment.id,
    tone,
    message,
    shouldSurface: true,
    urgency,
  };
}

export async function getFollowUpsForUser(userId: string): Promise<CommitmentFollowUp[]> {
  const commitments = await loadUserCommitments(userId);
  const followUps: CommitmentFollowUp[] = [];

  for (const commitment of commitments) {
    if (commitment.status === 'active') {
      const followUp = generateFollowUp(commitment);
      if (followUp) {
        followUps.push(followUp);
      }
    }
  }

  // Sort by urgency
  const urgencyOrder = { high: 0, normal: 1, low: 2 };
  followUps.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return followUps.slice(0, 3); // Max 3 follow-ups at a time
}

// ============================================================================
// CONTEXT INJECTION
// ============================================================================

export async function buildCommitmentContextForLLM(userId: string): Promise<string> {
  const commitments = await loadUserCommitments(userId);
  const followUps = await getFollowUpsForUser(userId);

  if (commitments.length === 0) {
    return '';
  }

  const sections: string[] = ['[COMMITMENT KEEPER - Better Than Human Accountability]'];
  sections.push('You remember EVERYTHING they commit to. This is your superpower.');

  // Active commitments
  const active = commitments.filter((c) => c.status === 'active');
  if (active.length > 0) {
    sections.push('\n**Active Commitments:**');
    for (const c of active.slice(0, 5)) {
      const daysAgo = Math.floor((Date.now() - c.createdAt) / (24 * 60 * 60 * 1000));
      const calendarNote =
        c.feasibilityScore !== undefined && c.feasibilityScore < 50
          ? ' ⚠️ calendar-constrained'
          : c.calendarEventIds?.length
            ? ' 📅 time blocked'
            : '';
      sections.push(`• "${c.summary}" (${c.type}, ${daysAgo} days ago${calendarNote})`);
    }
  }

  // Due for follow-up
  if (followUps.length > 0) {
    sections.push('\n**Ready for Caring Follow-up:**');
    for (const f of followUps) {
      sections.push(`• [${f.urgency}] ${f.message}`);
    }
    sections.push('\nFollow up NATURALLY, not mechanically. Weave it in. Be caring, not nagging.');
  }

  // Calendar-based warnings for commitments at risk
  const atRiskCommitments = active.filter(
    (c) => c.feasibilityScore !== undefined && c.feasibilityScore < 40
  );
  if (atRiskCommitments.length > 0) {
    sections.push('\n**⚠️ Calendar Conflicts:**');
    for (const c of atRiskCommitments) {
      sections.push(
        `• "${c.summary}" may be hard to fit in - consider helping them rescope or find time`
      );
    }
  }

  return sections.join('\n');
}

// Keep old function name as alias for backward compatibility
export const buildCommitmentContext = buildCommitmentContextForLLM;

// ============================================================================
// EXPORTS
// ============================================================================

export const commitmentKeeper = {
  detect: detectCommitment,
  save: saveCommitment,
  load: loadUserCommitments,
  updateStatus: updateCommitmentStatus,
  getFollowUps: getFollowUpsForUser,
  buildContext: buildCommitmentContext,
  // Calendar integration (Better Than Human)
  validateFeasibility: validateCommitmentFeasibility,
  createCalendarBlocks: createCalendarBlocksForCommitment,
  buildCalendarContext: buildCommitmentCalendarContext,
};
