/**
 * Side effects for the tool dispatcher: learning, tracking, webhooks.
 *
 * @module agents/shared/tool-dispatcher-effects
 */

import {
  getActionTracker,
  getActionTypeForTool,
  isTrackableTool,
} from '../../services/action-tracker/index.js';
import { createLogger, truncateForLog } from '../../utils/safe-logger.js';
import { recordAction } from './action-history.js';
import { logJsonDetected, logJsonExecuted } from './function-call-telemetry.js';
import {
  onToolCalled as dispatchToolCalledWebhook,
  onToolCompleted as dispatchToolCompletedWebhook,
  onToolFailed as dispatchToolFailedWebhook,
} from '../integrations/developer-webhook-integration.js';
import { recordActualToolExecution } from '../../tools/semantic-router/learning/implicit-correction-capture.js';

const log = createLogger({ module: 'tool-dispatcher-effects' });

interface EffectContext {
  userId?: string;
  personaId?: string;
  publisherId?: string;
  inputText?: string;
  semanticPrediction?: { toolId: string; confidence: number };
}

export function extractDomainFromTool(toolName: string): string {
  const domainPatterns: Record<string, string[]> = {
    music: ['playmusic', 'pausemusic', 'skiptrack', 'getplaylist', 'setvolume'],
    weather: ['getweather', 'weatherforecast'],
    calendar: ['getcalendar', 'getschedule', 'createevent', 'updateevent'],
    communication: ['sendtext', 'sendemail', 'makecall', 'leavemessage'],
    habits: ['createhabit', 'loghabit', 'gethabits'],
    memories: ['savememory', 'recallmemory', 'getmemories'],
    news: ['getnews', 'searchnews'],
    finance: ['getmarketsummary', 'getquote', 'getportfolio'],
  };
  const toolLower = toolName.toLowerCase();
  for (const [domain, patterns] of Object.entries(domainPatterns)) {
    if (patterns.some((p) => toolLower.includes(p) || toolLower === p)) {
      return domain;
    }
  }
  return 'general';
}

function extractTargetFromArgs(args: Record<string, unknown>): string | undefined {
  for (const key of ['contact', 'contactName', 'recipient', 'to', 'target', 'name', 'phone', 'email']) {
    if (typeof args[key] === 'string' && args[key]) {
      return args[key] as string;
    }
  }
  return undefined;
}

export function notifyToolStarted(
  sessionId: string,
  fn: string,
  args: Record<string, unknown>,
  ctx: EffectContext
): void {
  dispatchToolCalledWebhook({
    sessionId,
    userId: ctx.userId,
    personaId: ctx.personaId,
    publisherId: ctx.publisherId,
    toolName: fn,
    toolDomain: extractDomainFromTool(fn),
    args,
  });
  logJsonDetected(sessionId, fn, args);
}

export function notifyToolSucceeded(params: {
  sessionId: string;
  fn: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  ctx: EffectContext;
}): void {
  const { sessionId, fn, args, result, durationMs, ctx } = params;
  if (sessionId !== 'unknown') {
    void recordActualToolExecution(sessionId, fn, 'native_fc').catch(() => undefined);
  }
  dispatchToolCompletedWebhook({
    sessionId,
    userId: ctx.userId,
    personaId: ctx.personaId,
    publisherId: ctx.publisherId,
    toolName: fn,
    toolDomain: extractDomainFromTool(fn),
    result: truncateForLog(JSON.stringify(result), 500),
    executionTimeMs: durationMs,
  });
  logJsonExecuted(sessionId, fn, true, durationMs);
  if (sessionId) {
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    recordAction(sessionId, fn, args, true, truncateForLog(resultStr || '', 200));
  }
  recordPostExecution(true, fn, args, durationMs, result, ctx, sessionId);
}

export function notifyToolFailed(params: {
  sessionId: string;
  fn: string;
  args: Record<string, unknown>;
  error: unknown;
  durationMs: number;
  ctx: EffectContext;
}): void {
  const { sessionId, fn, args, error, durationMs, ctx } = params;
  dispatchToolFailedWebhook({
    sessionId,
    userId: ctx.userId,
    personaId: ctx.personaId,
    publisherId: ctx.publisherId,
    toolName: fn,
    toolDomain: extractDomainFromTool(fn),
    error: String(error).slice(0, 500),
  });
  logJsonExecuted(sessionId, fn, false, durationMs, String(error));
  if (sessionId) {
    recordAction(sessionId, fn, args, false, `Failed: ${String(error).slice(0, 100)}`);
  }
  recordPostExecution(false, fn, args, durationMs, undefined, ctx, sessionId, String(error));
}

function recordPostExecution(
  success: boolean,
  fn: string,
  args: Record<string, unknown>,
  durationMs: number,
  result: unknown,
  ctx: EffectContext,
  sessionId: string,
  error?: string
): void {
  if (ctx.userId) {
    const resultSummary = success
      ? truncateForLog(typeof result === 'string' ? result : JSON.stringify(result), 200)
      : `Failed: ${String(error).slice(0, 150)}`;
    trackHighImpactAction({
      userId: ctx.userId,
      sessionId: sessionId !== 'unknown' ? sessionId : undefined,
      toolId: fn,
      args,
      inputText: ctx.inputText,
      success,
      resultSummary,
      durationMs,
    });
  }
  if (ctx.userId && ctx.inputText) {
    import('../../intelligence/semantic-intelligence/index.js')
      .then(async ({ recordExecution }) =>
        recordExecution({
          userId: ctx.userId as string,
          sessionId: sessionId !== 'unknown' ? sessionId : 'unknown',
          personaId: ctx.personaId || 'ferni',
          inputText: ctx.inputText as string,
          toolId: fn,
          args,
          success,
          executionTimeMs: durationMs,
          semanticPrediction: ctx.semanticPrediction,
        })
      )
      .catch((err) => {
        log.debug({ error: String(err) }, 'Learning loop recording failed (non-critical)');
      });
  }
  if (sessionId !== 'unknown' && ctx.inputText) {
    import('../../tools/intelligence/learning/index.js')
      .then(({ getOutcomeTracker }) => {
        getOutcomeTracker().track({
          sessionId,
          turnId: `turn_${Date.now()}`,
          toolId: fn,
          query: ctx.inputText as string,
          selectedBy: ctx.semanticPrediction ? 'semantic' : 'direct',
          confidence: ctx.semanticPrediction?.confidence || 0.5,
          wasExecuted: true,
          executionSuccess: success,
          executionLatencyMs: durationMs,
          userContinued: true,
          followUpTools: [],
          personaId: ctx.personaId || 'ferni',
        });
      })
      .catch((err) => {
        log.debug({ error: String(err) }, 'Outcome tracking failed (non-critical)');
      });
  }
}

function trackHighImpactAction(params: {
  userId: string;
  sessionId?: string;
  toolId: string;
  args: Record<string, unknown>;
  inputText?: string;
  success: boolean;
  resultSummary: string;
  durationMs: number;
}): void {
  if (!params.userId || !isTrackableTool(params.toolId)) {
    return;
  }
  const actionType = getActionTypeForTool(params.toolId);
  if (!actionType) {
    return;
  }
  void (async () => {
    try {
      const tracker = getActionTracker();
      const target = extractTargetFromArgs(params.args);
      const action = await tracker.createAction({
        userId: params.userId,
        type: actionType,
        description: params.inputText || `${actionType} to ${target || 'contact'}`,
        target,
        targetContact: (params.args.phone as string) || (params.args.email as string) || undefined,
        sessionId: params.sessionId,
        userMessage: params.inputText,
      });
      await tracker.startExecution(action.id, { toolId: params.toolId, toolArgs: params.args });
      await tracker.completeExecution(action.id, {
        success: params.success,
        resultSummary: params.resultSummary,
        callDurationSeconds:
          actionType === 'call' ? Math.round(params.durationMs / 1000) : undefined,
        deliveryStatus: params.success ? 'sent' : 'failed',
      });
    } catch (err) {
      log.debug({ error: String(err) }, 'Action tracking failed (non-critical)');
    }
  })();
}
