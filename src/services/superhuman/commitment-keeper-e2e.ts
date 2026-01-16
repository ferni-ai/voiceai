/**
 * Commitment Keeper E2E Integration
 *
 * Phase 13: End-to-end commitment experience for "Better Than Human" memory.
 *
 * Provides:
 * - Enhanced detection with conversation context
 * - Progress tracking with memory integration
 * - Celebration flow for completed commitments
 *
 * Architecture:
 * ```
 * Turn Input → Detection → Commitment Saved
 *                              │
 *           ┌──────────────────┼──────────────────┐
 *           │                  │                  │
 *           ▼                  ▼                  ▼
 *      Memory Link      Progress Track      Follow-up Queue
 *           │                  │                  │
 *           └────────┬─────────┴──────────────────┘
 *                    │
 *                    ▼
 *              E2E Experience
 * ```
 *
 * @module services/superhuman/commitment-keeper-e2e
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  detectCommitment,
  saveCommitment,
  loadUserCommitments,
  updateCommitmentStatus,
  generateFollowUp,
  findMatchingCommitment,
  onActionCompleted,
  type Commitment,
  type CommitmentFollowUp,
  type CommitmentStatus,
  type CommitmentType,
} from './commitment-keeper.js';
import { storeMemory, type PersonaId } from '../../memory/cross-persona/index.js';

const log = createLogger({ module: 'CommitmentKeeperE2E' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * E2E commitment detection input
 */
export interface CommitmentE2EInput {
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
  /** User transcript */
  transcript: string;
  /** Current persona */
  personaId: PersonaId;
  /** Conversation topic */
  topic?: string;
  /** Emotional context */
  emotionalContext?: {
    primary: string;
    intensity: number;
  };
  /** Mentioned entities */
  mentionedEntities?: string[];
}

/**
 * E2E commitment detection result
 */
export interface CommitmentE2EResult {
  /** Whether a commitment was detected */
  detected: boolean;
  /** The detected commitment (if any) */
  commitment?: Commitment;
  /** Detection confidence */
  confidence: number;
  /** Suggested acknowledgment phrase */
  acknowledgment?: string;
  /** Whether to link to memory */
  shouldLinkToMemory: boolean;
  /** Processing time */
  processingTimeMs: number;
}

/**
 * Progress update input
 */
export interface ProgressUpdateInput {
  /** User ID */
  userId: string;
  /** User transcript */
  transcript: string;
  /** Mentioned entities */
  mentionedEntities?: string[];
  /** Emotional context */
  emotionalContext?: {
    primary: string;
    intensity: number;
  };
}

/**
 * Progress update result
 */
export interface ProgressUpdateResult {
  /** Whether progress was detected */
  progressDetected: boolean;
  /** Updated commitment (if any) */
  updatedCommitment?: Commitment;
  /** New status */
  newStatus?: CommitmentStatus;
  /** Whether celebration is appropriate */
  shouldCelebrate: boolean;
  /** Celebration message */
  celebrationMessage?: string;
  /** Follow-up suggestion */
  followUpSuggestion?: CommitmentFollowUp;
}

/**
 * Celebration context
 */
export interface CelebrationContext {
  /** The commitment that was completed */
  commitment: Commitment;
  /** Celebration message */
  message: string;
  /** Intensity level */
  intensity: 'small' | 'medium' | 'big';
  /** Whether to create memory */
  createMemory: boolean;
  /** Memory content (if creating) */
  memoryContent?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface CommitmentE2EConfig {
  /** Minimum confidence to detect commitment */
  minDetectionConfidence: number;
  /** Enable memory linking */
  enableMemoryLinking: boolean;
  /** Enable celebration flow */
  enableCelebration: boolean;
  /** Days before follow-up for soft commitments */
  softCommitmentFollowUpDays: number;
  /** Days before follow-up for strong commitments */
  strongCommitmentFollowUpDays: number;
}

const DEFAULT_CONFIG: CommitmentE2EConfig = {
  minDetectionConfidence: 0.6,
  enableMemoryLinking: true,
  enableCelebration: true,
  softCommitmentFollowUpDays: 7,
  strongCommitmentFollowUpDays: 3,
};

let config: CommitmentE2EConfig = { ...DEFAULT_CONFIG };

/**
 * Update configuration
 */
export function setCommitmentE2EConfig(newConfig: Partial<CommitmentE2EConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getCommitmentE2EConfig(): CommitmentE2EConfig {
  return { ...config };
}

// ============================================================================
// E2E DETECTION
// ============================================================================

/**
 * Detect commitment with E2E enhancements.
 *
 * Enhances basic detection with:
 * - Emotional context awareness
 * - Automatic memory linking
 * - Acknowledgment generation
 */
export async function detectCommitmentE2E(input: CommitmentE2EInput): Promise<CommitmentE2EResult> {
  const startTime = Date.now();

  try {
    // 1. Run base detection
    const detection = detectCommitment(input.transcript, input.userId, {
      topic: input.topic,
      personMentioned: input.mentionedEntities?.[0],
      emotionalIntensity: input.emotionalContext?.intensity,
    });

    if (!detection.detected || detection.confidence < config.minDetectionConfidence) {
      return {
        detected: false,
        confidence: detection.confidence,
        shouldLinkToMemory: false,
        processingTimeMs: Date.now() - startTime,
      };
    }

    // 2. Enhance with emotional weight
    let emotionalWeight = detection.commitment?.emotionalWeight || 0.5;
    if (input.emotionalContext) {
      // Higher emotional context = more significant commitment
      emotionalWeight = Math.min(1.0, emotionalWeight + input.emotionalContext.intensity * 0.2);
    }

    // 3. Build the commitment object
    const commitmentData: Omit<Commitment, 'id'> = {
      userId: input.userId,
      statement: detection.commitment!.statement,
      summary: detection.commitment!.summary,
      text: detection.commitment!.summary,
      type: detection.commitment!.type,
      emotionalWeight,
      personaId: input.personaId,
      topic: input.topic || undefined,
      personInvolved: input.mentionedEntities?.[0],
      createdAt: Date.now(),
      lastMentioned: Date.now(),
      followUpAfter: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3 days default
      status: 'active',
      followUpCount: 0,
    };

    // 4. Save the commitment
    const { commitment: saved } = await saveCommitment(commitmentData);

    // 5. Generate acknowledgment
    const acknowledgment = generateAcknowledgment(saved, detection.confidence);

    // 6. Link to memory if enabled
    if (config.enableMemoryLinking) {
      await linkCommitmentToMemory(input.userId, saved, input.personaId);
    }

    log.debug(
      {
        userId: input.userId,
        type: saved.type,
        confidence: detection.confidence,
        emotionalWeight,
      },
      '✅ Commitment detected E2E'
    );

    return {
      detected: true,
      commitment: saved,
      confidence: detection.confidence,
      acknowledgment,
      shouldLinkToMemory: config.enableMemoryLinking,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Commitment E2E detection failed');

    return {
      detected: false,
      confidence: 0,
      shouldLinkToMemory: false,
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Generate a natural acknowledgment for a detected commitment
 */
function generateAcknowledgment(commitment: Commitment, _confidence: number): string {
  const typeAcks: Record<CommitmentType, string[]> = {
    intention: ["I'll remember that.", "Noted. I'll check in on that.", 'Got it.'],
    promise: [
      "I'll hold space for that promise.",
      "I won't let you forget.",
      'That sounds important to you.',
    ],
    goal: ['I love that goal.', "I'll be cheering you on.", "Let's make that happen."],
    boundary: [
      'Good for you for setting that boundary.',
      "I'll support you in that.",
      'That takes courage.',
    ],
    conversation: [
      'That conversation sounds important.',
      "I'll remind you about that.",
      'Let me know how it goes.',
    ],
    decision: ['That sounds like a clear decision.', 'I hear you on that.', 'Noted.'],
    experiment: [
      "I love that you're experimenting.",
      "Let's see how that goes.",
      "That's a great thing to try.",
    ],
  };

  const acks = typeAcks[commitment.type] || ["I'll remember that."];
  return acks[Math.floor(Math.random() * acks.length)];
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

/**
 * Check for progress on commitments based on user input.
 *
 * Detects when users mention working on or completing commitments.
 */
export async function checkProgressE2E(input: ProgressUpdateInput): Promise<ProgressUpdateResult> {
  try {
    // 1. Load user's active commitments
    const commitments = await loadUserCommitments(input.userId);
    const active = commitments.filter((c) => c.status === 'active' || c.status === 'unclear');

    if (active.length === 0) {
      return {
        progressDetected: false,
        shouldCelebrate: false,
      };
    }

    // 2. Check for completion signals
    const completionResult = await checkForCompletion(input, active);
    if (completionResult.matched) {
      return completionResult.result!;
    }

    // 3. Check for progress signals
    const progressResult = await checkForProgress(input, active);
    if (progressResult.matched) {
      return progressResult.result!;
    }

    // 4. Check for abandonment signals
    const abandonmentResult = await checkForAbandonment(input, active);
    if (abandonmentResult.matched) {
      return abandonmentResult.result!;
    }

    return {
      progressDetected: false,
      shouldCelebrate: false,
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Progress check failed');

    return {
      progressDetected: false,
      shouldCelebrate: false,
    };
  }
}

/**
 * Check for completion signals
 */
async function checkForCompletion(
  input: ProgressUpdateInput,
  _active: Commitment[]
): Promise<{ matched: boolean; result?: ProgressUpdateResult }> {
  const completionPatterns = [
    /i (did|finished|completed|accomplished|achieved|finally did)/i,
    /i ('ve|have) (done|finished|completed|accomplished)/i,
    /i (managed to|succeeded in|was able to)/i,
    /it('s| is) done/i,
    /i (made|kept) (the|my) (call|appointment|commitment)/i,
  ];

  const hasCompletionSignal = completionPatterns.some((p) => p.test(input.transcript));
  if (!hasCompletionSignal) {
    return { matched: false };
  }

  // Find matching commitment
  const matching = await findMatchingCommitment(input.userId, input.transcript);
  if (!matching) {
    return { matched: false };
  }

  // Update status
  await updateCommitmentStatus(
    input.userId,
    matching.id,
    'completed',
    'appreciated' // Default reaction
  );

  // Generate celebration
  const celebration = config.enableCelebration
    ? generateCelebration(matching, input.emotionalContext)
    : undefined;

  if (celebration && config.enableMemoryLinking) {
    await createCelebrationMemory(input.userId, celebration);
  }

  // Reload to get updated commitment
  const updatedCommitment: Commitment = { ...matching, status: 'completed' };

  return {
    matched: true,
    result: {
      progressDetected: true,
      updatedCommitment,
      newStatus: 'completed',
      shouldCelebrate: config.enableCelebration,
      celebrationMessage: celebration?.message,
    },
  };
}

/**
 * Check for progress signals (not complete, but working on it)
 */
async function checkForProgress(
  input: ProgressUpdateInput,
  _active: Commitment[]
): Promise<{ matched: boolean; result?: ProgressUpdateResult }> {
  const progressPatterns = [
    /i('m| am) (working on|making progress on|getting better at)/i,
    /i (started|began|initiated)/i,
    /i('ve| have) been (trying|practicing|working)/i,
    /things are (going|moving)/i,
    /i (made|took) (some|a) (progress|steps|headway)/i,
  ];

  const hasProgressSignal = progressPatterns.some((p) => p.test(input.transcript));
  if (!hasProgressSignal) {
    return { matched: false };
  }

  // Find matching commitment
  const matching = await findMatchingCommitment(input.userId, input.transcript);
  if (!matching) {
    return { matched: false };
  }

  // Record progress via onActionCompleted
  await onActionCompleted({
    userId: input.userId,
    actionType: 'progress',
    target: matching.summary,
    commitmentId: matching.id,
    success: true,
    resultSummary: 'User indicated progress on commitment',
  });

  // Generate supportive follow-up
  const followUp = generateFollowUp(matching);

  return {
    matched: true,
    result: {
      progressDetected: true,
      updatedCommitment: matching,
      shouldCelebrate: false,
      followUpSuggestion: followUp || undefined,
    },
  };
}

/**
 * Check for abandonment signals
 */
async function checkForAbandonment(
  input: ProgressUpdateInput,
  _active: Commitment[]
): Promise<{ matched: boolean; result?: ProgressUpdateResult }> {
  const abandonmentPatterns = [
    /i (gave up|abandoned|dropped|quit|stopped)/i,
    /i (can't|couldn't|won't) (do|continue|keep)/i,
    /i('ve| have) (decided|chosen) (not to|against)/i,
    /it('s| is) (not going to|never going to) happen/i,
    /i('m| am) (done|finished) (with|trying)/i,
  ];

  const hasAbandonmentSignal = abandonmentPatterns.some((p) => p.test(input.transcript));
  if (!hasAbandonmentSignal) {
    return { matched: false };
  }

  // Find matching commitment
  const matching = await findMatchingCommitment(input.userId, input.transcript);
  if (!matching) {
    return { matched: false };
  }

  // Update status
  await updateCommitmentStatus(
    input.userId,
    matching.id,
    'abandoned',
    'neutral' // Default reaction
  );

  // Create updated commitment
  const updatedCommitment: Commitment = { ...matching, status: 'abandoned' };

  return {
    matched: true,
    result: {
      progressDetected: true,
      updatedCommitment,
      newStatus: 'abandoned',
      shouldCelebrate: false,
    },
  };
}

// ============================================================================
// CELEBRATION FLOW
// ============================================================================

/**
 * Generate celebration context for a completed commitment
 */
function generateCelebration(
  commitment: Commitment,
  emotionalContext?: { primary: string; intensity: number }
): CelebrationContext {
  // Determine celebration intensity
  let intensity: 'small' | 'medium' | 'big' = 'small';
  if (commitment.emotionalWeight > 0.7) {
    intensity = 'big';
  } else if (commitment.emotionalWeight > 0.4) {
    intensity = 'medium';
  }

  // Boost intensity if user seems excited
  if (
    emotionalContext?.primary.toLowerCase().includes('excited') ||
    emotionalContext?.primary.toLowerCase().includes('happy')
  ) {
    if (intensity === 'small') intensity = 'medium';
    else if (intensity === 'medium') intensity = 'big';
  }

  // Generate appropriate message
  const messages: Record<typeof intensity, string[]> = {
    small: ['Nice! You did it.', 'Good for you!', "That's progress!"],
    medium: [
      "That's wonderful! You should be proud.",
      "Look at you following through! That's not easy.",
      'I knew you could do it!',
    ],
    big: [
      'This is HUGE! I am so proud of you!',
      'You did it! This is exactly what I love about you - when you commit, you follow through.',
      "This deserves a celebration! You've been working toward this and you made it happen.",
    ],
  };

  const message = messages[intensity][Math.floor(Math.random() * messages[intensity].length)];

  // Build memory content for milestone
  const memoryContent = `Completed commitment: ${commitment.summary}. ${
    intensity === 'big'
      ? 'This was a major achievement.'
      : intensity === 'medium'
        ? 'This was meaningful progress.'
        : 'Good follow-through.'
  }`;

  return {
    commitment,
    message,
    intensity,
    createMemory: intensity !== 'small',
    memoryContent: intensity !== 'small' ? memoryContent : undefined,
  };
}

/**
 * Create a celebration memory
 */
async function createCelebrationMemory(
  userId: string,
  celebration: CelebrationContext
): Promise<void> {
  if (!celebration.createMemory || !celebration.memoryContent) {
    return;
  }

  try {
    await storeMemory({
      userId,
      content: celebration.memoryContent,
      category: 'milestone',
      capturedBy: (celebration.commitment.personaId || 'ferni') as PersonaId,
      emotionalWeight: celebration.commitment.emotionalWeight,
      confidence: 0.95,
      relevantToPersonas: ['ferni', 'maya', 'nayan'],
      relatedEntities: celebration.commitment.personInvolved
        ? [celebration.commitment.personInvolved]
        : undefined,
    });

    log.debug({ userId, intensity: celebration.intensity }, '🎉 Celebration memory created');
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to create celebration memory');
  }
}

// ============================================================================
// MEMORY INTEGRATION
// ============================================================================

/**
 * Link a commitment to the shared memory system
 */
async function linkCommitmentToMemory(
  userId: string,
  commitment: Commitment,
  personaId: PersonaId
): Promise<void> {
  try {
    await storeMemory({
      userId,
      content: `Made commitment: ${commitment.summary}`,
      category: 'commitment',
      capturedBy: personaId,
      emotionalWeight: commitment.emotionalWeight,
      confidence: 0.9,
      relevantToPersonas: ['ferni', 'maya'],
      relatedEntities: commitment.personInvolved ? [commitment.personInvolved] : undefined,
      metadata: {
        commitmentId: commitment.id,
        commitmentType: commitment.type,
        targetDate: commitment.targetDate,
      },
    });
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to link commitment to memory');
  }
}

// ============================================================================
// FOLLOW-UP QUEUE
// ============================================================================

/**
 * Get commitments due for follow-up
 */
export async function getCommitmentsDueForFollowUp(
  userId: string,
  limit = 5
): Promise<CommitmentFollowUp[]> {
  try {
    const commitments = await loadUserCommitments(userId);
    const now = Date.now();

    // Filter to commitments due for follow-up
    const due = commitments.filter((c) => {
      if (c.status !== 'active' && c.status !== 'unclear') return false;
      return c.followUpAfter <= now;
    });

    // Sort by urgency (oldest follow-up first)
    due.sort((a, b) => a.followUpAfter - b.followUpAfter);

    // Generate follow-ups
    const followUps: CommitmentFollowUp[] = [];
    for (const commitment of due.slice(0, limit)) {
      const followUp = generateFollowUp(commitment);
      if (followUp) {
        followUps.push(followUp);
      }
    }

    return followUps;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to get commitments due for follow-up');
    return [];
  }
}

// ============================================================================
// STATS
// ============================================================================

/**
 * Get commitment keeper stats for a user
 */
export async function getCommitmentStats(userId: string): Promise<{
  total: number;
  active: number;
  completed: number;
  abandoned: number;
  completionRate: number;
  avgEmotionalWeight: number;
}> {
  try {
    const commitments = await loadUserCommitments(userId);

    const active = commitments.filter(
      (c) => c.status === 'active' || c.status === 'unclear'
    ).length;
    const completed = commitments.filter((c) => c.status === 'completed').length;
    const abandoned = commitments.filter((c) => c.status === 'abandoned').length;
    const total = commitments.length;

    const completionRate = total > 0 ? completed / total : 0;
    const avgEmotionalWeight =
      total > 0 ? commitments.reduce((sum, c) => sum + c.emotionalWeight, 0) / total : 0;

    return {
      total,
      active,
      completed,
      abandoned,
      completionRate,
      avgEmotionalWeight,
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to get commitment stats');

    return {
      total: 0,
      active: 0,
      completed: 0,
      abandoned: 0,
      completionRate: 0,
      avgEmotionalWeight: 0,
    };
  }
}
