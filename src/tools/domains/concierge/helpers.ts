/**
 * Concierge domain helpers: background outreach kickoff and status formatting.
 * Extracted from concierge/index.ts.
 */

import { getTaskTracker, PhoneCaller } from '../../../services/concierge/index.js';

/**
 * Spoken when autonomous business calling isn't available. Honest instead of
 * claiming "I'm calling them now" when no call will be placed.
 */
export const CALLS_UNAVAILABLE_REPLY =
  "I can't call businesses for you just yet, so I haven't contacted anyone. I can help you find their numbers or draft what to say, if that helps.";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Start the outreach process in the background
 */
export async function startConciergeOutreach(requestId: string, userId: string): Promise<void> {
  const tracker = getTaskTracker();
  const request = await tracker.getRequest(requestId);
  if (!request) return;

  await tracker.updateStatus(requestId, 'in_progress', 'Starting outreach');

  const caller = new PhoneCaller({
    userId,
    userName: undefined,
    callbackNumber: undefined,
  });

  // Process targets
  for (const target of request.targets.slice(0, request.maxTargets)) {
    if (!target.phone) continue;

    await tracker.updateTargetStatus(requestId, target.id, 'calling');

    const result = await caller.call({
      target,
      domain: request.domain,
      requirements: request.requirements,
    });

    if (result.success && result.result) {
      await tracker.addResult(requestId, result.result);
    } else {
      await tracker.updateTargetStatus(requestId, target.id, 'failed');
      if (result.simulated) {
        // No real call can be placed; don't pretend the request completed.
        await tracker.updateStatus(requestId, 'failed', result.error ?? 'Calling unavailable');
        return;
      }
    }

    const updatedRequest = await tracker.getRequest(requestId);
    if (updatedRequest && tracker.isRequestComplete(updatedRequest)) {
      break;
    }
  }

  await tracker.updateStatus(requestId, 'completed');
}

/**
 * Parse time preference from natural language
 */
export function parseTimePreference(time?: string): 'morning' | 'afternoon' | 'evening' | 'any' {
  if (!time) return 'any';
  const lower = time.toLowerCase();
  if (lower.includes('morning') || lower.includes('breakfast')) return 'morning';
  if (lower.includes('afternoon') || lower.includes('lunch')) return 'afternoon';
  if (lower.includes('evening') || lower.includes('dinner') || lower.includes('night'))
    return 'evening';
  return 'any';
}

/**
 * Format status update for speech
 */
export function formatStatusUpdate(request: any): string {
  const emoji = getStatusEmoji(request.status);
  let message = `${emoji} ${request.description}\n\n`;

  switch (request.status) {
    case 'pending':
      message += 'Queued and ready to start.';
      break;
    case 'in_progress':
      message += `Calling businesses... ${request.results.length} responses so far.`;
      break;
    case 'awaiting_user':
      if (request.recommendation) {
        message += `I recommend ${request.recommendation.targetName}: ${request.recommendation.reason}`;
      }
      break;
    case 'completed':
      message += `All done! Got ${request.results.filter((r: any) => r.success).length} successful responses.`;
      break;
    case 'failed':
      message += `Unfortunately, I couldn't complete this request.`;
      break;
  }

  return message;
}

/**
 * Get status emoji
 */
export function getStatusEmoji(status: string): string {
  const emojis: Record<string, string> = {
    pending: '⏳',
    in_progress: '📞',
    awaiting_user: '✋',
    completed: '✅',
    failed: '❌',
  };
  return emojis[status] || '❓';
}
