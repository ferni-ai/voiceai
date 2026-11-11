/**
 * Proactive context for the session opener: an open thread, a high-priority insight, or an
 * emotional memory check-in, plus whether the caller is distressed. Fetched once per greeting by
 * greeting-handler for both the bundle and standard paths.
 *
 * @module voice-agent/greeting-proactive-context
 */

import { log } from '@livekit/agents';
import type { EmotionalCheckIn } from '../../intelligence/tracking/emotional-memory.js';
import { diag } from '../../services/diagnostic-logger.js';
import type { SessionServices } from '../../services/types.js';
import { exceedsDistressThreshold } from '../../tasks/constants.js';
import type { UserData } from '../shared/types.js';

/** Threads, insights and emotional check-ins for the opener, fetched once per greeting. */
export interface ProactiveContext {
  threadStarter?: string;
  proactiveInsight?: string;
  proactiveInsightId?: string;
  emotionalCheckIn?: string;
  emotionalCheckInType?: EmotionalCheckIn['type'];
  /** See isCallerDistressed. */
  callerDistressed: boolean;
  openQuestions: string[];
}

/**
 * Distressed: a concern from last time is still open (a follow_up or support check-in, even when
 * a thread or insight takes the opener), or this session's distress is above MODERATE, the
 * threshold tasks use (src/tasks/constants.ts DISTRESS_THRESHOLDS, exceedsDistressThreshold).
 */
function isCallerDistressed(
  checkIns: EmotionalCheckIn[],
  distressLevel: number | undefined
): boolean {
  const openConcern = checkIns.some((c) => c.type === 'follow_up' || c.type === 'support');
  return openConcern || exceedsDistressThreshold(distressLevel ?? 0, 'MODERATE');
}

/** Emotional memory check-ins, top priority first; empty if the read fails. */
function readCheckIns(services: SessionServices): EmotionalCheckIn[] {
  try {
    return services.emotionalMemory.getCheckInSuggestions();
  } catch (e) {
    log().debug({ error: String(e) }, 'Emotional check-in fetch failed (non-blocking)');
    return [];
  }
}

/** Mark the check-in as followed up so it isn't repeated; never blocks the greeting. */
function markCheckInUsed(services: SessionServices, checkIn: EmotionalCheckIn): void {
  try {
    services.emotionalMemory.markFollowedUp(checkIn.moment.id);
  } catch (e) {
    log().debug({ error: String(e) }, 'Emotional check-in mark failed (non-blocking)');
  }
  diag.session('Using emotional memory check-in', {
    type: checkIn.type,
    reference: checkIn.reference,
  });
}

/**
 * Get proactive context (threads, insights, emotional check-ins)
 */
export async function getProactiveContext(
  services: SessionServices,
  userData: UserData,
  isReturningUser: boolean
): Promise<ProactiveContext> {
  // Get open thread conversation starter for proactive greeting
  let threadStarter: string | undefined;
  const openThreads = services.getOpenThreads();
  if (openThreads.length > 0 && isReturningUser) {
    threadStarter = services.getThreadConversationStarter() || undefined;
    if (threadStarter) {
      diag.session('Found cross-session thread to surface', {
        threadCount: openThreads.length,
        starterLen: threadStarter.length,
      });
    }
  }

  // Get open questions from threads
  const openQuestions = openThreads.flatMap((t) => t.questionsToAnswer || []).slice(0, 3);

  // Get high-priority proactive insights for check-ins
  let proactiveInsight: string | undefined;
  let proactiveInsightId: string | undefined;
  if (isReturningUser) {
    try {
      const insightResult = await services.getProactiveInsights();
      if (insightResult.highPriorityCount > 0 && insightResult.suggestedConversationStarter) {
        // Only use proactive insight if no thread starter (avoid double-starter)
        if (!threadStarter) {
          proactiveInsight = insightResult.suggestedConversationStarter;
          proactiveInsightId = insightResult.suggestedInsightId;
        }
      }
    } catch (e) {
      log().debug({ error: String(e) }, 'Proactive insights fetch failed (non-blocking)');
    }
  }

  return {
    threadStarter,
    proactiveInsight,
    proactiveInsightId,
    openQuestions,
    ...checkInContext(
      services,
      userData,
      isReturningUser,
      Boolean(threadStarter || proactiveInsight)
    ),
  };
}

/**
 * Emotional memory check-ins for returning users. Read even when a thread or insight takes the
 * opener (`openerTaken`): an open concern still decides how the opener sounds.
 */
function checkInContext(
  services: SessionServices,
  userData: UserData,
  isReturningUser: boolean,
  openerTaken: boolean
): Pick<ProactiveContext, 'emotionalCheckIn' | 'emotionalCheckInType' | 'callerDistressed'> {
  const checkIns = isReturningUser ? readCheckIns(services) : [];
  const top = openerTaken ? undefined : checkIns[0];
  if (top) markCheckInUsed(services, top);
  return {
    emotionalCheckIn: top?.suggestedOpener,
    emotionalCheckInType: top?.type,
    callerDistressed: isCallerDistressed(checkIns, userData.lastEmotionAnalysis?.distressLevel),
  };
}
