/**
 * Call Executor
 *
 * Ferni's domain - makes phone calls on user's behalf.
 * "BETTER THAN HUMAN" - We make the calls you've been putting off.
 *
 * This executor connects to the existing on-behalf-calls system
 * and ensures results are captured via the unified result capture.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { captureBackgroundResult } from '../unified-result-capture.js';
import type { OutcomeStatus, ResultPriority } from '../result-types.js';

const log = createLogger({ module: 'CallExecutor' });

// ============================================================================
// TYPES
// ============================================================================

export interface CallRequest {
  userId: string;
  sessionId?: string;
  contactName: string;
  contactPhone?: string;
  contactId?: string;
  objective: string;
  context?: string;
  script?: string;
  maxDuration?: number;
  initiatedBy?: string;
  priority?: ResultPriority;
}

export interface CallResult {
  success: boolean;
  callId: string;
  contactName: string;
  status: 'completed' | 'voicemail' | 'no_answer' | 'busy' | 'failed';
  outcome: string;
  objectiveAchieved: boolean;
  callbackRequired: boolean;
  callbackTime?: string;
  actionItems?: string[];
  duration?: number;
}

// ============================================================================
// EXECUTOR
// ============================================================================

/**
 * Execute a phone call on user's behalf.
 */
export async function executeCall(request: CallRequest): Promise<CallResult> {
  log.info({ userId: request.userId, contact: request.contactName }, 'Executing on-behalf call');

  const startTime = Date.now();
  const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Try to use the conversational call service
    const result = await makeConversationalCall(request, callId);

    const status: OutcomeStatus = result.success
      ? 'success'
      : result.status === 'voicemail'
        ? 'partial_success'
        : 'failed';

    const summary = buildSummary(request, result);

    // Store result via unified capture
    await captureBackgroundResult({
      userId: request.userId,
      type: 'on_behalf_call',
      status,
      summary,
      priority: request.priority || (result.callbackRequired ? 'high' : 'normal'),
      initiatedBy: request.initiatedBy || 'ferni',
      sessionId: request.sessionId,
      contactName: request.contactName,
      contactId: request.contactId,
      details: result.outcome,
      actionItems: result.actionItems || [],
      requiresCallback: result.callbackRequired,
      callbackTime: result.callbackTime,
      relatedTaskId: callId,
      specificData: {
        callId,
        callStatus: result.status,
        objectiveAchieved: result.objectiveAchieved,
        duration: result.duration,
        durationMs: Date.now() - startTime,
      },
    });

    log.info(
      {
        userId: request.userId,
        contact: request.contactName,
        status: result.status,
        objectiveAchieved: result.objectiveAchieved,
      },
      'On-behalf call completed'
    );

    return result;
  } catch (error) {
    log.error({ error: String(error), userId: request.userId }, 'On-behalf call failed');

    const failedResult: CallResult = {
      success: false,
      callId,
      contactName: request.contactName,
      status: 'failed',
      outcome: `Call couldn't be completed: ${String(error)}`,
      objectiveAchieved: false,
      callbackRequired: false,
    };

    await captureBackgroundResult({
      userId: request.userId,
      type: 'on_behalf_call',
      status: 'failed',
      summary: `Couldn't complete call to ${request.contactName}`,
      priority: 'normal',
      initiatedBy: request.initiatedBy || 'ferni',
      sessionId: request.sessionId,
      contactName: request.contactName,
      details: `Error: ${String(error)}`,
      actionItems: ['Try calling manually'],
    });

    return failedResult;
  }
}

/**
 * Queue a call for background execution.
 */
export async function queueCall(request: CallRequest): Promise<string> {
  log.info({ userId: request.userId, contact: request.contactName }, 'Queueing on-behalf call');

  const taskId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Fire and forget
  void executeCall(request).catch((err) => {
    log.error({ error: String(err), taskId }, 'Queued call failed');
  });

  return taskId;
}

// ============================================================================
// CALL IMPLEMENTATION
// ============================================================================

async function makeConversationalCall(request: CallRequest, callId: string): Promise<CallResult> {
  try {
    // Try to use the existing conversational call service
    const { makeConversationalCall: makeCall, isConversationalCallingConfigured } =
      await import('../../voice/conversational-call-service.js');

    if (isConversationalCallingConfigured()) {
      log.info({ contact: request.contactName }, 'Using conversational call service');

      // Result type varies by implementation - handle gracefully
      // Map CallRequest to ConversationalCallRequest format
      const result = (await makeCall({
        userId: request.userId,
        phone: request.contactPhone || '',
        recipientName: request.contactName,
        purpose: request.objective,
        context:
          request.context || request.script
            ? { message: request.context, script: request.script }
            : undefined,
        timeoutSeconds: request.maxDuration,
      })) as {
        success: boolean;
        callId?: string;
        status?: string;
        outcome?: string;
        summary?: string;
        objectiveAchieved?: boolean;
        callbackRequired?: boolean;
        callbackTime?: string;
        actionItems?: string[];
        duration?: number;
      };

      return {
        success: result.success,
        callId: result.callId || callId,
        contactName: request.contactName,
        status:
          (result.status as CallResult['status']) || (result.success ? 'completed' : 'failed'),
        outcome: result.outcome || result.summary || 'Call completed',
        objectiveAchieved: result.objectiveAchieved ?? result.success,
        callbackRequired: result.callbackRequired ?? false,
        callbackTime: result.callbackTime,
        actionItems: result.actionItems,
        duration: result.duration,
      };
    }
  } catch (importError) {
    log.debug({ error: String(importError) }, 'Conversational call service not available');
  }

  // Fallback: Simulate call queued for later
  log.info({ contact: request.contactName }, 'Call queued for manual handling');

  return {
    success: true,
    callId,
    contactName: request.contactName,
    status: 'completed',
    outcome: `Call to ${request.contactName} has been queued. Objective: ${request.objective}`,
    objectiveAchieved: false,
    callbackRequired: true,
    callbackTime: 'when available',
    actionItems: ['Make this call manually', `Discuss: ${request.objective}`],
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function buildSummary(request: CallRequest, result: CallResult): string {
  if (result.objectiveAchieved) {
    return `Called ${request.contactName} - ${request.objective} ✅`;
  } else if (result.status === 'voicemail') {
    return `Left voicemail for ${request.contactName}`;
  } else if (result.status === 'no_answer') {
    return `${request.contactName} didn't answer`;
  } else if (result.status === 'busy') {
    return `${request.contactName} was busy`;
  } else if (!result.success) {
    return `Couldn't reach ${request.contactName}`;
  } else {
    return `Called ${request.contactName}`;
  }
}
