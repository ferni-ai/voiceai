/**
 * Outreach Session Integration
 *
 * Hooks into session lifecycle to update outreach context
 * and detect opportunities based on conversation content.
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  getOutreachDecisionEngine,
  updateUserContext,
  triggerOutreach,
  recordTimingInteraction,
  updateEmotionalState as updateContextEmotionalState,
  type OutreachTriggerType,
} from './index.js';

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

  // Create commitment check-in triggers
  let triggersCreated = 0;
  for (const commitment of commitments) {
    try {
      triggerOutreach({
        userId,
        type: 'commitment_check',
        priority: 'medium',
        reason: `Check in on commitment: ${commitment.what}`,
        commitment: commitment.what,
        suggestedTime: commitment.checkInDate,
      });
      triggersCreated++;
    } catch (error) {
      log.warn({ error, commitment }, 'Failed to create commitment trigger');
    }
  }

  // Check for emotional support triggers
  if (
    emotionalState &&
    ['stressed', 'anxious', 'sad', 'frustrated', 'overwhelmed'].includes(emotionalState)
  ) {
    try {
      // Schedule a supportive check-in for tomorrow
      const checkInTime = new Date();
      checkInTime.setDate(checkInTime.getDate() + 1);
      checkInTime.setHours(10, 0, 0, 0); // 10 AM

      triggerOutreach({
        userId,
        type: 'emotional_support',
        priority: 'high',
        reason: `User expressed ${emotionalState} feelings during conversation`,
        suggestedTime: checkInTime,
      });
      triggersCreated++;

      log.info({ userId, emotionalState }, 'Created emotional support trigger');
    } catch (error) {
      log.warn({ error, emotionalState }, 'Failed to create emotional support trigger');
    }
  }

  // Check for celebration triggers
  if (wins.length > 0 && (satisfaction === 'positive' || !satisfaction)) {
    try {
      // Immediate celebration acknowledgment
      triggerOutreach({
        userId,
        type: 'celebration',
        priority: 'low',
        reason: `Celebrate recent win: ${wins[0]}`,
        milestone: wins[0],
      });
      triggersCreated++;
    } catch (error) {
      log.warn({ error }, 'Failed to create celebration trigger');
    }
  }

  // Re-engagement trigger if session was short or satisfaction was negative
  if (durationMinutes < 2 || satisfaction === 'negative') {
    try {
      const checkInTime = new Date();
      checkInTime.setDate(checkInTime.getDate() + 3); // 3 days later

      triggerOutreach({
        userId,
        type: 'reengagement',
        priority: 'medium',
        reason:
          durationMinutes < 2
            ? 'Short session - check in to see if everything is okay'
            : 'Previous session may not have met expectations',
        suggestedTime: checkInTime,
      });
      triggersCreated++;
    } catch (error) {
      log.warn({ error }, 'Failed to create reengagement trigger');
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
// EXPORT
// ============================================================================

export {
  extractCommitments,
  detectEmotionalState,
  extractWinsAndStruggles,
  type ExtractedCommitment,
  type DetectedEmotionalState as EmotionalState, // Export as EmotionalState for backward compatibility
};
