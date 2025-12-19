/**
 * Outreach Session Integration
 *
 * Hooks into session lifecycle to update outreach context
 * and detect opportunities based on conversation content.
 */

import { isOutreachTriggerCreationEnabled } from '../../config/feature-flags.js';
import { getLogger } from '../../utils/safe-logger.js';
import { onSessionEnd as recordPredictiveSignals } from '../predictive-insights/data-collector.js';
import {
  recordTimingInteraction,
  updateEmotionalState as updateContextEmotionalState,
  updateUserContext,
} from './index.js';
import {
  publishCommitmentTrigger,
  publishEmotionalSupportTrigger,
  publishMilestoneTrigger,
  publishOutreachTrigger,
} from './trigger-publisher.js';
import {
  checkStreaksAtRisk,
  checkMilestonesToCelebrate,
  publishStreakProtectionAlert,
  publishMilestoneCelebration,
} from './maya-habit-outreach.js';

const log = getLogger().child({ module: 'outreach-session-integration' });

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationSummary {
  mainTopics: string[];
  keyPoints: string[];
  emotionalArc: string;
  commitments?: string[];
  followUps?: string[];
}

export interface SessionEndData {
  userId: string;
  sessionId: string;
  personaId: string;
  turns: ConversationTurn[];
  summary?: ConversationSummary;
  durationMinutes: number;
  satisfaction?: 'positive' | 'neutral' | 'negative' | 'unknown';
}

// ============================================================================
// COMMITMENT EXTRACTION
// ============================================================================

// Patterns that indicate user commitments
const COMMITMENT_PATTERNS = [
  /i('ll| will| am going to| plan to| want to| need to| should| must)\s+(.+)/gi,
  /i('m going to| intend to| commit to)\s+(.+)/gi,
  /let me\s+(.+)/gi,
  /i promise\s+(.+)/gi,
  /i'll try to\s+(.+)/gi,
  /my goal is to\s+(.+)/gi,
  /i'm committed to\s+(.+)/gi,
];

// Timeframe indicators
const TIMEFRAME_PATTERNS: Array<{ pattern: RegExp; days: number }> = [
  { pattern: /tomorrow|by tomorrow/i, days: 1 },
  { pattern: /this week|by (the )?end of (the )?week/i, days: 7 },
  { pattern: /next week/i, days: 7 },
  { pattern: /this month|by (the )?end of (the )?month/i, days: 30 },
  { pattern: /in a few days|in (\d+) days/i, days: 3 },
  { pattern: /tonight|this evening|today/i, days: 0 },
  { pattern: /monday|tuesday|wednesday|thursday|friday|saturday|sunday/i, days: 7 },
];

interface ExtractedCommitment {
  what: string;
  timeframe?: string;
  checkInDate: Date;
  originalText: string;
}

function extractCommitments(text: string): ExtractedCommitment[] {
  const commitments: ExtractedCommitment[] = [];
  const seenCommitments = new Set<string>();

  for (const pattern of COMMITMENT_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const what = match[2] || match[1];
      if (!what || what.length < 5 || what.length > 200) continue;

      // Clean up the commitment text
      const cleanedWhat = what
        .replace(/[.,!?]$/, '')
        .replace(/^(to |that i |i )/i, '')
        .trim();

      if (seenCommitments.has(cleanedWhat.toLowerCase())) continue;
      seenCommitments.add(cleanedWhat.toLowerCase());

      // Determine timeframe
      let checkInDate = new Date();
      checkInDate.setDate(checkInDate.getDate() + 2); // Default: 2 days
      let timeframe: string | undefined;

      for (const { pattern: tfPattern, days } of TIMEFRAME_PATTERNS) {
        if (tfPattern.test(match[0]) || tfPattern.test(text)) {
          checkInDate = new Date();
          checkInDate.setDate(checkInDate.getDate() + Math.max(days, 1));
          timeframe = tfPattern.source.replace(/[\\^$.*+?()[\]{}|]/g, '').slice(0, 20);
          break;
        }
      }

      commitments.push({
        what: cleanedWhat,
        timeframe,
        checkInDate,
        originalText: match[0],
      });
    }
  }

  return commitments.slice(0, 5); // Limit to 5 commitments per session
}

// ============================================================================
// EMOTIONAL STATE EXTRACTION
// ============================================================================

// Local emotional states detected in conversations
type DetectedEmotionalState =
  | 'happy'
  | 'excited'
  | 'content'
  | 'neutral'
  | 'stressed'
  | 'anxious'
  | 'sad'
  | 'frustrated'
  | 'overwhelmed';

// Map detected emotional states to context-aggregator EmotionalState
// context-aggregator uses: 'thriving' | 'good' | 'stable' | 'struggling' | 'crisis'
type ContextEmotionalState = 'thriving' | 'good' | 'stable' | 'struggling' | 'crisis';

function mapToContextEmotionalState(state: DetectedEmotionalState): ContextEmotionalState {
  switch (state) {
    case 'excited':
      return 'thriving';
    case 'happy':
    case 'content':
      return 'good';
    case 'neutral':
      return 'stable';
    case 'stressed':
    case 'anxious':
    case 'frustrated':
      return 'struggling';
    case 'sad':
    case 'overwhelmed':
      return 'crisis';
    default:
      return 'stable';
  }
}

const EMOTION_PATTERNS: Array<{ state: DetectedEmotionalState; patterns: RegExp[] }> = [
  {
    state: 'excited',
    patterns: [
      /so excited|can't wait|amazing|incredible|thrilled/i,
      /great news|fantastic|wonderful/i,
    ],
  },
  {
    state: 'happy',
    patterns: [/happy|glad|pleased|delighted|good mood/i, /feeling great|feeling good/i],
  },
  {
    state: 'content',
    patterns: [/content|satisfied|at peace|grateful|thankful/i, /appreciate|blessed/i],
  },
  {
    state: 'stressed',
    patterns: [/stressed|pressure|deadline|overwhelmed by work/i, /too much to do|can't keep up/i],
  },
  {
    state: 'anxious',
    patterns: [/anxious|worried|nervous|afraid|scared/i, /can't stop thinking|what if|uncertain/i],
  },
  { state: 'sad', patterns: [/sad|down|blue|depressed|unhappy/i, /feeling low|not myself/i] },
  {
    state: 'frustrated',
    patterns: [/frustrated|annoyed|irritated|fed up/i, /nothing works|keeps failing/i],
  },
  {
    state: 'overwhelmed',
    patterns: [/overwhelmed|too much|can't handle|drowning/i, /don't know where to start/i],
  },
];

function detectEmotionalState(text: string): DetectedEmotionalState | null {
  for (const { state, patterns } of EMOTION_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return state;
      }
    }
  }
  return null;
}

// ============================================================================
// WIN/STRUGGLE EXTRACTION
// ============================================================================

const WIN_PATTERNS = [
  /i (did it|made it|accomplished|achieved|completed|finished)/i,
  /finally|success|succeeded|proud of/i,
  /breakthrough|milestone|progress/i,
  /good news|great news|exciting news/i,
];

const STRUGGLE_PATTERNS = [
  /struggling with|having trouble|can't figure out/i,
  /keep failing|not working|stuck on/i,
  /frustrated (with|by|about)/i,
  /don't know how to/i,
  /need help with/i,
];

function extractWinsAndStruggles(text: string): { wins: string[]; struggles: string[] } {
  const wins: string[] = [];
  const struggles: string[] = [];

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  for (const sentence of sentences) {
    for (const pattern of WIN_PATTERNS) {
      if (pattern.test(sentence)) {
        wins.push(sentence.trim().slice(0, 100));
        break;
      }
    }
    for (const pattern of STRUGGLE_PATTERNS) {
      if (pattern.test(sentence)) {
        struggles.push(sentence.trim().slice(0, 100));
        break;
      }
    }
  }

  return {
    wins: wins.slice(0, 3),
    struggles: struggles.slice(0, 3),
  };
}

// ============================================================================
// MAIN INTEGRATION FUNCTION
// ============================================================================

/**
 * Analyze a completed session and update outreach context
 */
export async function analyzeSessionForOutreach(data: SessionEndData): Promise<{
  commitmentsFound: number;
  triggersCreated: number;
  contextUpdated: boolean;
}> {
  const { userId, personaId, turns, summary, durationMinutes, satisfaction } = data;

  if (!userId || userId === 'anonymous') {
    return { commitmentsFound: 0, triggersCreated: 0, contextUpdated: false };
  }

  // Check if outreach trigger creation is enabled via feature flag
  if (!isOutreachTriggerCreationEnabled()) {
    log.debug({ userId }, 'Outreach trigger creation disabled via feature flag');
    return { commitmentsFound: 0, triggersCreated: 0, contextUpdated: false };
  }

  // Skip test users - don't create outreach triggers for E2E tests
  if (userId.startsWith('e2e-test') || userId.startsWith('test-') || userId.includes('-test-')) {
    log.debug({ userId }, 'Skipping outreach for test user');
    return { commitmentsFound: 0, triggersCreated: 0, contextUpdated: false };
  }

  log.debug({ userId, personaId, turns: turns.length }, 'Analyzing session for outreach');

  // Combine all user turns into text for analysis
  const userText = turns
    .filter((t) => t.role === 'user')
    .map((t) => t.content)
    .join(' ');

  // Extract commitments
  const commitments = extractCommitments(userText);
  log.debug({ userId, commitments: commitments.length }, 'Extracted commitments');

  // Detect emotional state
  const emotionalState = detectEmotionalState(userText);

  // Extract wins and struggles
  const { wins, struggles } = extractWinsAndStruggles(userText);

  // Update user context
  try {
    updateUserContext(userId, {
      emotionalState: emotionalState || undefined,
      recentTopics: summary?.mainTopics || [],
      recentWins: wins,
      currentStruggles: struggles,
    });

    // Record the interaction time for timing intelligence
    recordTimingInteraction(userId, {
      channel: 'call', // Voice session
      wasOutreach: false,
      gotResponse: true,
      timestamp: new Date(),
    });
  } catch (error) {
    log.warn({ error, userId }, 'Failed to update user context');
  }

  // Create commitment check-in triggers via Pub/Sub
  // PERF: Triggers are published async and processed by Outreach Worker
  let triggersCreated = 0;
  for (const commitment of commitments) {
    try {
      const result = await publishCommitmentTrigger(
        userId,
        commitment.what,
        commitment.checkInDate,
        { sessionId: data.sessionId, personaId }
      );
      if (result.success) triggersCreated++;
    } catch (error) {
      log.warn({ error, commitment }, 'Failed to publish commitment trigger');
    }
  }

  // Check for emotional support triggers
  if (
    emotionalState &&
    ['stressed', 'anxious', 'sad', 'frustrated', 'overwhelmed'].includes(emotionalState)
  ) {
    try {
      // Publish emotional support trigger via Pub/Sub
      const result = await publishEmotionalSupportTrigger(
        userId,
        emotionalState,
        0.7, // Intensity above threshold since we matched the emotion
        { sessionId: data.sessionId, personaId, topics: summary?.mainTopics }
      );
      if (result.success) triggersCreated++;

      log.info({ userId, emotionalState }, 'Published emotional support trigger');
    } catch (error) {
      log.warn({ error, emotionalState }, 'Failed to publish emotional support trigger');
    }
  }

  // Check for celebration triggers
  if (wins.length > 0 && (satisfaction === 'positive' || !satisfaction)) {
    try {
      // Publish milestone celebration trigger via Pub/Sub
      const result = await publishMilestoneTrigger(
        userId,
        wins[0],
        { sessionId: data.sessionId, personaId }
      );
      if (result.success) triggersCreated++;
    } catch (error) {
      log.warn({ error }, 'Failed to publish celebration trigger');
    }
  }

  // Re-engagement trigger if session was short or satisfaction was negative
  if (durationMinutes < 2 || satisfaction === 'negative') {
    try {
      const checkInTime = new Date();
      checkInTime.setDate(checkInTime.getDate() + 3); // 3 days later

      // Publish reengagement trigger via Pub/Sub
      const result = await publishOutreachTrigger({
        userId,
        type: 'reengagement',
        priority: 'medium',
        reason:
          durationMinutes < 2
            ? 'Short session - check in to see if everything is okay'
            : 'Previous session may not have met expectations',
        scheduledFor: checkInTime.toISOString(),
        sessionId: data.sessionId,
        personaId,
      });
      if (result.success) triggersCreated++;
    } catch (error) {
      log.warn({ error }, 'Failed to publish reengagement trigger');
    }
  }

  // Record signals for predictive insights system
  try {
    const transcript = turns.map((t) => `${t.role}: ${t.content}`).join('\n');
    await recordPredictiveSignals(userId, `session-${Date.now()}`, transcript, {
      duration: durationMinutes,
      userInitiated: true, // Assume user-initiated for voice sessions
      satisfactionSignal:
        satisfaction === 'positive'
          ? 'positive'
          : satisfaction === 'negative'
            ? 'negative'
            : 'neutral',
    });
    log.debug({ userId }, '📊 Recorded predictive insight signals');
  } catch (error) {
    log.warn({ error, userId }, 'Failed to record predictive signals');
  }

  // 🌱 MAYA HABIT OUTREACH: Post-session habit checks
  // If the session was with Maya (habits), check for streak/milestone triggers
  if (personaId === 'maya-santos' || personaId === 'maya') {
    try {
      const mayaResults = await analyzeMayaHabitSession(userId, data.sessionId);
      triggersCreated += mayaResults.triggersCreated;
      log.debug({ userId, mayaTriggersCreated: mayaResults.triggersCreated }, '🌱 Maya habit session analyzed');
    } catch (error) {
      log.debug({ error: String(error), userId }, 'Maya habit session analysis failed (non-fatal)');
    }
  }

  log.info(
    { userId, commitmentsFound: commitments.length, triggersCreated },
    'Session analyzed for outreach'
  );

  return {
    commitmentsFound: commitments.length,
    triggersCreated,
    contextUpdated: true,
  };
}

/**
 * Quick analysis for real-time context updates during conversation
 */
export function analyzeMessageForContext(
  userId: string,
  message: string,
  role: 'user' | 'assistant'
): void {
  if (role !== 'user' || !userId || userId === 'anonymous') return;

  // Quick emotional state detection for immediate context
  const emotionalState = detectEmotionalState(message);
  if (emotionalState) {
    try {
      // Map detected state to context-aggregator EmotionalState
      const contextState = mapToContextEmotionalState(emotionalState);
      updateContextEmotionalState(userId, contextState);
    } catch {
      // Non-critical, ignore errors
    }
  }
}

// ============================================================================
// MAYA HABIT SESSION ANALYSIS
// ============================================================================

interface MayaHabitSessionResult {
  triggersCreated: number;
  streaksAtRisk: number;
  milestonesFound: number;
}

/**
 * Analyze a Maya session for habit-specific outreach triggers
 * 
 * This runs after any session with Maya to:
 * 1. Check if any habit milestones were just hit
 * 2. Schedule streak protection alerts for tonight
 * 3. Set up follow-up outreach for habits discussed
 */
async function analyzeMayaHabitSession(
  userId: string,
  sessionId: string
): Promise<MayaHabitSessionResult> {
  const result: MayaHabitSessionResult = {
    triggersCreated: 0,
    streaksAtRisk: 0,
    milestonesFound: 0,
  };

  try {
    // 1. Check for milestones to celebrate (immediate celebration after session)
    const milestones = await checkMilestonesToCelebrate(userId);
    for (const milestone of milestones.slice(0, 2)) {
      const sent = await publishMilestoneCelebration(
        userId,
        milestone.habitId,
        milestone.habitName,
        milestone.days
      );
      if (sent) {
        result.triggersCreated++;
        result.milestonesFound++;
      }
    }

    // 2. Check for streaks at risk (schedule evening reminder)
    const hour = new Date().getHours();
    
    // If it's afternoon or later, check streaks and schedule evening alert
    if (hour >= 12) {
      const atRisk = await checkStreaksAtRisk(userId);
      if (atRisk.atRisk) {
        result.streaksAtRisk = atRisk.habits.length;
        
        // Only schedule evening alert if not already evening
        if (hour < 18) {
          for (const habit of atRisk.habits.slice(0, 2)) {
            const sent = await publishStreakProtectionAlert({
              userId,
              habitId: habit.id,
              habitName: habit.name,
              streakDays: habit.streakDays,
              reason: `Post-session streak protection: ${habit.streakDays} days on "${habit.name}"`,
            });
            if (sent) {
              result.triggersCreated++;
            }
          }
        }
      }
    }

    log.debug(
      { userId, sessionId, ...result },
      'Maya habit session analysis complete'
    );
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Maya habit session analysis error');
  }

  return result;
}

// ============================================================================
// EXPORT
// ============================================================================

export {
  analyzeMayaHabitSession,
  detectEmotionalState,
  extractCommitments,
  extractWinsAndStruggles,
  type DetectedEmotionalState as EmotionalState,
  type ExtractedCommitment,
};
