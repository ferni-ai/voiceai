/**
 * Feedback Handler
 *
 * Handles feedback collection for tool optimization from user transcripts.
 *
 * Extracted from transcript-handler.ts to reduce file size.
 *
 * @module voice-agent/handlers/feedback-handler
 */

import type { PersonaConfig } from '../../../personas/types.js';
import type { ConversationContext as FeedbackContext } from '../../../tools/optimization/feedback-collector.js';
import type { UserData } from '../../shared/types.js';
import { diag } from '../../../services/diagnostic-logger.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'FeedbackHandler' });

export interface AutoOptimizer {
  processUserMessage: (
    message: string,
    context: FeedbackContext,
    lastToolId: string | undefined
  ) => void;
}

/**
 * Process feedback collection for tool optimization
 */
export function processFeedbackCollection(
  transcript: string,
  userData: UserData,
  sessionId: string,
  sessionPersona: PersonaConfig,
  autoOptimizer: AutoOptimizer | null | undefined
): void {
  try {
    // Get tool execution data from conversation state
    const toolExecData = userData.conversationState?.getToolExecutionData?.();
    const recentTools = toolExecData?.recentlyUsedTools || [];
    const lastToolResult = toolExecData?.lastToolResult;
    const lastToolId = toolExecData?.lastToolCalled;

    const feedbackContext: FeedbackContext = {
      userId: userData.userId || 'anonymous',
      sessionId,
      agentId: sessionPersona.id,
      turnNumber: userData.turnCount || 0,
      recentTools,
      lastToolResult,
    };

    // Process feedback (synchronous)
    if (autoOptimizer) {
      try {
        autoOptimizer.processUserMessage(transcript, feedbackContext, lastToolId);
      } catch (err) {
        log.debug('Feedback processing error', { error: String(err) });
      }
    }
  } catch (feedbackError) {
    diag.warn('Feedback collection error', { error: String(feedbackError) });
  }
}
