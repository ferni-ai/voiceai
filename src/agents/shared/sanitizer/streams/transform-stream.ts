/**
 * Sanitizer Transform Stream
 *
 * Filters tool-call leakage from TTS streams. Does not intercept or
 * execute JSON `{fn,args}` — voice tools use native function calling.
 *
 * @module agents/shared/sanitizer/streams/transform-stream
 */

import type { ReadableStream, WritableStream } from 'node:stream/web';
import { TransformStream } from 'node:stream/web';
import {
  isGuidanceStrippingAvailable,
  containsGuidanceBlocks as rustContainsGuidanceBlocks,
  stripGuidanceBlocks as rustStripGuidanceBlocks,
} from '../../../../memory/rust-accelerator.js';
import { createLogger } from '../../../../utils/safe-logger.js';
import { detectsFunctionCallLeakage, getReplacementText } from '../detectors/leakage-detector.js';
import {
  markToolExecutedBySemanticRouter,
  wasToolExecutedBySemanticRouter,
} from '../executors/deduplication.js';
import type { SanitizerStreamOptions } from '../types.js';
import { recordFTISV2JsonBypass } from '../../../../services/observability/routing-metrics.js';
import { isFTISEnabled } from '../../../processors/tool-routing-integration.js';
import { analyzeResponseAlignment } from '../../../../intelligence/feedback/injection-tracker.js';
import {
  detectVulnerabilityWithContext,
  dispatchVisibleVulnerability,
} from '../../../realtime/emotion-event-dispatcher.js';
import { getFrontendPublisher } from '../../../realtime/frontend-publisher.js';
import { executeTool } from '../../tool-dispatcher.js';

const log = createLogger({ module: 'sanitizer-stream' });

export interface AnyTransformStream {
  readable: ReadableStream<string>;
  writable: WritableStream<string>;
}

/**
 * Creates a transform stream that filters tool call leakage from text.
 */
export function createSanitizerTransformStream(): AnyTransformStream {
  let buffer = '';

  const transformer = new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;

      const detection = detectsFunctionCallLeakage(buffer);
      if (detection.detected) {
        const replacement = getReplacementText(detection);
        if (replacement) {
          controller.enqueue(replacement);
        }
        buffer = '';
        return;
      }

      controller.enqueue(chunk);
      if (buffer.length > 500) {
        buffer = buffer.slice(-200);
      }
    },

    flush() {
      buffer = '';
    },
  });

  return transformer;
}

export function createSanitizerWithMusicFallback(
  options: SanitizerStreamOptions = {}
): AnyTransformStream {
  if (isFTISEnabled()) {
    recordFTISV2JsonBypass();
    log.info(
      { sessionId: options.sessionId, trace: 'FTIS_V2_BYPASS' },
      'FTIS mode: sanitizer is passthrough (FTIS handles tools)'
    );
    return new TransformStream<string, string>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
    });
  }

  const { toolContext, session, sessionId } = options;
  let buffer = '';
  let musicFallbackTriggered = false;
  let cleanResponseText = '';

  const transformer = new TransformStream<string, string>({
    async transform(chunk, controller) {
      buffer += chunk;

      if (!musicFallbackTriggered && shouldTriggerMusicFallback(buffer)) {
        musicFallbackTriggered = true;
        const query = extractMusicQuery(buffer);
        if (query && session && toolContext) {
          const toolId = `playMusic:${query}`;
          if (sessionId && wasToolExecutedBySemanticRouter(sessionId, toolId)) {
            log.debug('Music tool already executed, skipping fallback');
          } else {
            if (sessionId) {
              markToolExecutedBySemanticRouter(sessionId, toolId);
            }
            try {
              await executeMusicFallback(query, toolContext, session);
            } catch (error) {
              log.error({ error: String(error) }, 'Music fallback execution failed');
            }
          }
        }
        buffer = '';
        return;
      }

      const detection = detectsFunctionCallLeakage(buffer);
      if (detection.detected) {
        const replacement = getReplacementText(detection);
        if (replacement) {
          controller.enqueue(replacement);
        }
        buffer = '';
        return;
      }

      controller.enqueue(chunk);
      cleanResponseText += chunk;
      if (buffer.length > 500) {
        buffer = buffer.slice(-200);
      }
    },

    async flush() {
      if (cleanResponseText.trim() && sessionId && options.userId) {
        const conversationMode = options.conversationMode || 'conversation';
        try {
          analyzeResponseAlignment(sessionId, options.userId, cleanResponseText, conversationMode);
        } catch (err) {
          log.warn({ sessionId, error: String(err) }, 'BTH Feedback: alignment analysis failed');
        }
      }

      if (cleanResponseText.trim() && sessionId) {
        try {
          const userTopic = options.recentTopics?.[0];
          const result = detectVulnerabilityWithContext(cleanResponseText, userTopic);
          if (result.detected && result.isEmotional) {
            const publisher = getFrontendPublisher(sessionId);
            const sendData = async (type: string, payload: Record<string, unknown>) => {
              await publisher.sendData(type, payload);
            };
            dispatchVisibleVulnerability(sendData, {
              vulnerabilityType: result.type,
              intensity: result.confidence * 0.8,
            }).catch((err) => {
              log.debug({ error: String(err) }, 'BTH vulnerability dispatch failed (non-critical)');
            });
          }
        } catch (err) {
          log.debug({ sessionId, error: String(err) }, 'BTH vulnerability detection failed');
        }
      }

      buffer = '';
      musicFallbackTriggered = false;
      cleanResponseText = '';
    },
  });

  return transformer;
}

const MUSIC_NARRATION_PATTERNS = [
  /playing\s+(some\s+)?(\w+)\s+(music|songs?|tracks?)/i,
  /let me play\s+(some\s+)?(\w+)/i,
  /i(?:'ll| will) play\s+(some\s+)?(\w+)/i,
  /searching for\s+(\w+)\s+(music|songs?)/i,
];

function shouldTriggerMusicFallback(text: string): boolean {
  return MUSIC_NARRATION_PATTERNS.some((p) => p.test(text));
}

function extractMusicQuery(text: string): string | null {
  for (const pattern of MUSIC_NARRATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[2] || match[1]?.replace(/^some\s+/, '') || null;
    }
  }
  return null;
}

async function executeMusicFallback(
  query: string,
  toolContext: Record<string, unknown>,
  session: SanitizerStreamOptions['session']
): Promise<void> {
  try {
    const result = await executeTool(
      { name: 'playMusic', args: { query } },
      toolContext as { userId?: string; sessionId?: string; personaId?: string }
    );
    if (result.success) {
      session?.say?.(`Sure, playing ${query}`, { allowInterruptions: true });
    } else {
      log.warn({ error: result.error }, 'Music fallback failed');
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Music fallback execution error');
  }
}

const GUIDANCE_BLOCK_PATTERNS = [
  /<guidance>[\s\S]*?<\/guidance>/gi,
  /<internal>[\s\S]*?<\/internal>/gi,
  /<system>[\s\S]*?<\/system>/gi,
  /\[guidance\][\s\S]*?\[\/guidance\]/gi,
  /\[internal\][\s\S]*?\[\/internal\]/gi,
  /\[system\][\s\S]*?\[\/system\]/gi,
  /---\s*guidance\s*---[\s\S]*?---\s*end\s*guidance\s*---/gi,
  /CONTEXT\s*\(read but do NOT include[\s\S]*?Just speak naturally\.?/gi,
  /YOUR TASK:[\s\S]*?Just speak naturally\.?/gi,
  /CRITICAL:\s*Output ONLY your spoken response[\s\S]*?Just speak naturally\.?/gi,
  /CONTEXT\s*\(read but do NOT include in your response\):[^\n]*/gi,
  /YOUR TASK:\s*[^\n]*/gi,
  /CRITICAL:\s*Output ONLY[^\n]*/gi,
  /No meta-commentary[^\n]*/gi,
  /Just speak naturally\.?\s*/gi,
  /Be curious,? not concerned\.?\s*/gi,
  /Check in gently\s*\([^)]+\)\.?\s*/gi,
  /Speaking to them now:\s*/gi,
];

const useNativeStripping = isGuidanceStrippingAvailable();

function stripGuidanceBlocksJS(text: string): string {
  let result = text;
  for (const pattern of GUIDANCE_BLOCK_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

export function stripGuidanceBlocks(text: string): string {
  if (useNativeStripping) {
    try {
      return rustStripGuidanceBlocks(text);
    } catch {
      return stripGuidanceBlocksJS(text);
    }
  }
  return stripGuidanceBlocksJS(text);
}

export function containsGuidanceBlocks(text: string): boolean {
  if (useNativeStripping) {
    try {
      return rustContainsGuidanceBlocks(text);
    } catch {
      return GUIDANCE_BLOCK_PATTERNS.some((p) => p.test(text));
    }
  }
  return GUIDANCE_BLOCK_PATTERNS.some((p) => p.test(text));
}

export function createGuidanceStripStream(): AnyTransformStream {
  let buffer = '';

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;
      const stripped = stripGuidanceBlocks(buffer);
      if (stripped !== buffer) {
        controller.enqueue(stripped);
        buffer = '';
      } else if (!buffer.includes('<') && !buffer.includes('[')) {
        controller.enqueue(chunk);
        buffer = buffer.slice(-50);
      }
    },

    flush(controller) {
      const stripped = stripGuidanceBlocks(buffer);
      if (stripped) {
        controller.enqueue(stripped);
      }
      buffer = '';
    },
  });
}
