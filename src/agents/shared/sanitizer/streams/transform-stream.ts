/**
 * Sanitizer Transform Stream
 *
 * Transform streams for real-time sanitization of LLM output.
 * Intercepts and filters tool call leakage from TTS streams.
 *
 * @module agents/shared/sanitizer/streams/transform-stream
 */

import type { voice } from '@livekit/agents';
import type { ReadableStream, WritableStream } from 'node:stream/web';
import { TransformStream } from 'node:stream/web';
import {
  isGuidanceStrippingAvailable,
  containsGuidanceBlocks as rustContainsGuidanceBlocks,
  stripGuidanceBlocks as rustStripGuidanceBlocks,
} from '../../../../memory/rust-accelerator.js';
import { createLogger } from '../../../../utils/safe-logger.js';
import {
  detectsFunctionCallLeakage,
  getReplacementText,
  looksLikeJsonFunctionCall,
} from '../detectors/leakage-detector.js';
import {
  markToolExecutedBySemanticRouter,
  wasToolExecutedBySemanticRouter,
} from '../executors/deduplication.js';
import type { SanitizerStreamOptions } from '../types.js';
// Gateway for generateReply with proper safeguards (debouncing, circuit breaker, etc.)
import {
  generateReply as gatewayGenerateReply,
  TOOL_RESPONSE_TIMEOUT_MS,
} from '../../generate-reply-gateway.js';
// FTIS V2 mode check - when enabled, tools execute via FTIS V2, not JSON workaround
import { recordFTISV2JsonBypass } from '../../../../services/observability/routing-metrics.js';
import { isFTISEnabled } from '../../../processors/tool-routing-integration.js';
// Injection tracking for BTH Communication System feedback loop
import { analyzeResponseAlignment } from '../../../../intelligence/feedback/injection-tracker.js';
// BTH Visible Vulnerability: Detect when Ferni shows authentic uncertainty in responses
import {
  detectVulnerabilityWithContext,
  dispatchVisibleVulnerability,
} from '../../../realtime/emotion-event-dispatcher.js';
import { getFrontendPublisher } from '../../../realtime/frontend-publisher.js';

const log = createLogger({ module: 'sanitizer-stream' });

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

// Using a generic transform stream type to avoid livekit dependency issues
export interface AnyTransformStream {
  readable: ReadableStream<string>;
  writable: WritableStream<string>;
}

// ============================================================================
// BASIC SANITIZER STREAM
// ============================================================================

/**
 * Creates a transform stream that filters tool call leakage from text.
 *
 * @returns Transform stream for sanitization
 */
export function createSanitizerTransformStream(): AnyTransformStream {
  let buffer = '';

  const transformer = new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;

      // Check for JSON function call (don't filter - let executor handle)
      if (looksLikeJsonFunctionCall(buffer)) {
        // Pass through JSON - executor will process
        controller.enqueue(chunk);
        return;
      }

      // Check for leakage patterns
      const detection = detectsFunctionCallLeakage(buffer);
      if (detection.detected) {
        const replacement = getReplacementText(detection);
        if (replacement) {
          controller.enqueue(replacement);
        }
        // Otherwise, silently filter
        buffer = '';
        return;
      }

      // Pass through clean text
      controller.enqueue(chunk);

      // Keep buffer reasonable size
      if (buffer.length > 500) {
        buffer = buffer.slice(-200);
      }
    },

    flush(controller) {
      // Clear buffer on stream end
      buffer = '';
    },
  });

  return transformer;
}

// ============================================================================
// SANITIZER WITH MUSIC FALLBACK
// ============================================================================

/**
 * Creates a transform stream with music tool fallback.
 * When Gemini narrates "Playing music..." instead of calling the tool,
 * this will execute the tool directly.
 *
 * @param options - Configuration options
 * @returns Transform stream with fallback behavior
 */
// ============================================================================
// BETTER THAN HUMAN: Rich Tool Response Guidance
// ============================================================================

/**
 * Build rich guidance for LLM after tool execution.
 * This creates "Better Than Human" responses with full context.
 */
function buildToolResponseGuidance(params: {
  fnName: string;
  result: string;
  success: boolean;
  error?: string;
  options: SanitizerStreamOptions;
}): string {
  const { fnName, result, success, error, options } = params;
  const {
    userName,
    userRequest,
    userEmotion,
    timeContext,
    personaId,
    personaDisplayName,
    recentTopics,
  } = options;

  // Tool-specific response guidance
  const toolGuidance = getToolSpecificGuidance(fnName, success);

  // Build persona voice guidance
  const personaVoice = getPersonaVoiceGuidance(personaId, personaDisplayName);

  // Build emotional attunement
  const emotionalGuidance = userEmotion?.primary
    ? `[EMOTIONAL ATTUNEMENT: User seems ${userEmotion.primary}${userEmotion.intensity && userEmotion.intensity > 0.7 ? ' (strongly)' : ''}. Match their energy appropriately.]`
    : '';

  // Build time awareness
  const timeAwareness = timeContext?.timeOfDay
    ? `[TIME CONTEXT: It's ${timeContext.timeOfDay}${timeContext.isWeekend ? ' on the weekend' : ''}. Be mindful of this in your tone.]`
    : '';

  // Build personalization
  const personalization = userName
    ? `[USER: ${userName}${userRequest ? ` asked: "${userRequest}"` : ''}]`
    : userRequest
      ? `[USER REQUEST: "${userRequest}"]`
      : '';

  // Build continuity reference
  const continuity = recentTopics?.length
    ? `[RECENT TOPICS: ${recentTopics.slice(0, 3).join(', ')} - maintain conversational flow]`
    : '';

  if (success) {
    return [
      `[TOOL EXECUTED: ${fnName}]`,
      `[RESULT: ${result.slice(0, 800)}]`,
      personalization,
      emotionalGuidance,
      timeAwareness,
      personaVoice,
      toolGuidance,
      continuity,
      '',
      '[CRITICAL - OUTPUT FORMAT:]',
      '⚠️ OUTPUT NATURAL SPEECH ONLY - NO JSON, NO CODE, NO MARKDOWN',
      '⚠️ The tool has ALREADY executed. Do NOT output {"fn":...} or any JSON.',
      '⚠️ Just acknowledge the result in plain conversational text.',
      '',
      '[RESPONSE RULES:]',
      '- Respond as if YOU did this, not a tool (never say "the tool" or "I executed")',
      '- Be conversational and warm, like telling a friend',
      '- Keep it brief (1-2 sentences usually)',
      '- NEVER use colons in speech (no "Result: X", say "It\'s X")',
      "- Match the user's emotional energy",
      '- If they were excited, share their excitement',
      '- If result is rich data, share the most relevant highlight first',
    ]
      .filter(Boolean)
      .join('\n');
  } else {
    return [
      `[TOOL FAILED: ${fnName}]`,
      `[ERROR: ${error || 'Unknown error'}]`,
      personalization,
      emotionalGuidance,
      personaVoice,
      '',
      '[CRITICAL - OUTPUT FORMAT:]',
      '⚠️ OUTPUT NATURAL SPEECH ONLY - NO JSON, NO CODE, NO MARKDOWN',
      '⚠️ Do NOT output {"fn":...} or any JSON. Just speak naturally.',
      '',
      '[RESPONSE RULES:]',
      '- Acknowledge the hiccup warmly (not robotically)',
      "- Don't over-apologize or be dramatic",
      '- Offer a specific alternative or ask how else you can help',
      '- Keep it brief and move forward positively',
      '- Example tone: "Hmm, that didn\'t work. Want me to try X instead?"',
    ]
      .filter(Boolean)
      .join('\n');
  }
}

/**
 * Get tool-specific response guidance for natural framing
 */
function getToolSpecificGuidance(fnName: string, success: boolean): string {
  const toolGuidelines: Record<string, string> = {
    // Games & Fun
    startGame: success
      ? '[TOOL GUIDANCE: You started a game! Set up the rules briefly and dive into the first question/round with energy.]'
      : "[TOOL GUIDANCE: Game couldn't start. Offer to try a different game or activity.]",

    // Music
    playMusic: success
      ? '[TOOL GUIDANCE: Music is now playing. A brief "Here we go" or acknowledgment is enough - the music speaks for itself.]'
      : "[TOOL GUIDANCE: Music couldn't play. Ask what else they'd like to hear or suggest checking their connection.]",

    // Weather
    getWeather: success
      ? '[TOOL GUIDANCE: Share the weather conversationally. Start with the most relevant info (temp if asking generally, rain if they asked about umbrella).]'
      : "[TOOL GUIDANCE: Couldn't get weather. Offer to try again or suggest they check their weather app.]",

    // Habits
    createHabit: success
      ? '[TOOL GUIDANCE: Celebrate this with them! Starting a new habit is exciting. Be encouraging but not over-the-top.]'
      : '[TOOL GUIDANCE: Habit creation failed. Ask if they want to try with different details.]',
    logHabitCompletion: success
      ? '[TOOL GUIDANCE: Acknowledge their progress warmly. Reference their streak if impressive.]'
      : "[TOOL GUIDANCE: Couldn't log it. Reassure them it still counts and you'll try again.]",

    // Tasks & Notes
    createTask: success
      ? "[TOOL GUIDANCE: Confirm the task briefly. If it has a due date, mention when it's due.]"
      : '[TOOL GUIDANCE: Task creation failed. Offer to remember it another way.]',
    saveNote: success
      ? '[TOOL GUIDANCE: Confirm you saved it. Brief is best - "Got it, saved."]'
      : "[TOOL GUIDANCE: Couldn't save. Offer to remember it for this conversation at least.]",

    // Timer & Time
    setTimer: success
      ? '[TOOL GUIDANCE: Confirm the timer is set with the duration. Keep it brief.]'
      : "[TOOL GUIDANCE: Timer couldn't be set. Offer an alternative or suggest their phone timer.]",

    // Handoff
    handoff: success
      ? "[TOOL GUIDANCE: You're transitioning to another persona. Say goodbye warmly and hand off naturally.]"
      : '[TOOL GUIDANCE: Handoff failed. Reassure user you can still help, or try again.]',

    // Breathing & Grounding
    breatheWithMe: success
      ? '[TOOL GUIDANCE: Guide them gently into the breathing exercise. Use calm, measured pacing.]'
      : "[TOOL GUIDANCE: Exercise couldn't start. Offer to guide them through breathing yourself.]",
    groundInBody: success
      ? '[TOOL GUIDANCE: Guide them into the grounding exercise with a calm, present voice.]'
      : '[TOOL GUIDANCE: Offer to do a simple grounding check-in together instead.]',
  };

  return (
    toolGuidelines[fnName] ||
    (success
      ? '[TOOL GUIDANCE: Share the result naturally as if you just did something helpful for a friend.]'
      : '[TOOL GUIDANCE: Something went wrong. Be warm, brief, and offer an alternative.]')
  );
}

/**
 * Get persona-specific voice guidance
 */
function getPersonaVoiceGuidance(personaId?: string, displayName?: string): string {
  const personaVoices: Record<string, string> = {
    ferni:
      '[PERSONA VOICE: Warm, grounded life coach. Supportive but not saccharine. Like a wise friend.]',
    'maya-santos':
      '[PERSONA VOICE: Energetic habit coach. Encouraging and action-oriented. Celebrates progress.]',
    'peter-john':
      '[PERSONA VOICE: Calm research advisor. Thoughtful and precise. Explains with clarity.]',
    'alex-chen':
      '[PERSONA VOICE: Professional communications coach. Clear and efficient. Gets to the point.]',
    'jordan-taylor':
      '[PERSONA VOICE: Creative event planner. Enthusiastic about celebrations and milestones.]',
    'nayan-patel':
      '[PERSONA VOICE: Wise philosopher. Reflective and deep. Finds meaning in moments.]',
  };

  if (personaId && personaVoices[personaId]) {
    return personaVoices[personaId];
  }

  return displayName
    ? `[PERSONA VOICE: Respond as ${displayName} with warmth and authenticity.]`
    : '[PERSONA VOICE: Respond warmly and naturally, like a supportive friend.]';
}

export function createSanitizerWithMusicFallback(
  options: SanitizerStreamOptions = {}
): AnyTransformStream {
  // ==========================================================================
  // FTIS V2 MODE: Skip JSON workaround entirely
  // When FTIS V2 is active, tools execute directly via FTIS V2 classification,
  // not via JSON output interception. The LLM should not output JSON at all.
  // ==========================================================================
  if (isFTISEnabled()) {
    // Record metrics for observability
    recordFTISV2JsonBypass();

    log.info(
      { sessionId: options.sessionId, trace: 'FTIS_V2_BYPASS' },
      '🎯 FTIS V2 mode: JSON workaround DISABLED (FTIS handles all tools)'
    );

    // Return a simple passthrough stream - no JSON detection, no execution
    return new TransformStream<string, string>({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
    });
  }

  const { toolContext, session, sessionId } = options;

  let buffer = '';
  let musicFallbackTriggered = false;
  let jsonFunctionExecuted = false;
  // Track text that comes BEFORE a JSON function call (should still be spoken)
  let prefixTextFlushed = false;
  // Track if we're potentially accumulating a JSON block (don't enqueue until we know)
  let potentialJsonAccumulating = false;
  // Buffered chunks waiting to be released if JSON detection fails
  let pendingChunks: string[] = [];
  // FIX (Jan 2026): Track how many characters have been enqueued BEFORE JSON detection
  // This prevents re-enqueuing the prefix when JSON is found, causing "OhOh" duplication
  let charactersEnqueuedBeforeJson = 0;

  // BTH Feedback Loop: Accumulate clean response text for injection attribution analysis
  // This tracks what the LLM actually said (excluding JSON function calls)
  let cleanResponseText = '';

  const transformer = new TransformStream<string, string>({
    async transform(chunk, controller) {
      buffer += chunk;

      // =========================================================================
      // 🔧 JSON FUNCTION CALL EXECUTION (CRITICAL - must happen FIRST!)
      // When LLM outputs `{"fn":"toolName","args":{...}}`, execute it!
      // This is the JSON workaround for Gemini's unreliable native function calling.
      //
      // IMPORTANT: After executing, we MUST tell the LLM about the result so it
      // can continue the conversation naturally. Otherwise the LLM thinks it just
      // output text and waits for user input → SILENCE.
      //
      // FIX (Jan 2026): Handle JSON embedded within text, not just standalone JSON.
      // LLMs often output: "Sure thing.\n```json\n{...}\n```"
      // We need to:
      // 1. Extract and speak the prefix text ("Sure thing.")
      // 2. Execute the JSON function call
      // 3. Strip the JSON from TTS output
      // =========================================================================

      // Detect if we're starting to see a JSON block (must buffer until complete)
      // This catches: ```json, ```\n{, {"fn", etc.
      const jsonStartSignals = [
        /```(?:json)?[\s\n]*\{?[\s\n]*"?fn/i, // Markdown code fence with JSON
        /```(?:json)?[\s\n]*$/, // Just opened code fence
        /\{\s*"fn"\s*:/, // Bare JSON start
      ];

      if (!potentialJsonAccumulating) {
        const hasJsonStart = jsonStartSignals.some((pattern) => pattern.test(buffer));
        if (hasJsonStart) {
          potentialJsonAccumulating = true;
          pendingChunks = []; // Start fresh accumulation

          // Find where the JSON might start
          const codeBlockStart = buffer.indexOf('```');
          const bareJsonStart = buffer.indexOf('{"fn"');
          const jsonStartIndex = codeBlockStart >= 0 ? codeBlockStart : bareJsonStart;

          // Enqueue any text BEFORE the potential JSON start
          // FIX (Jan 2026): Only enqueue the REMAINING prefix text that hasn't been enqueued yet
          // Some chunks may have already been passed through before JSON was detected
          if (jsonStartIndex > 0) {
            const fullPrefixText = buffer.slice(0, jsonStartIndex).trim();
            // Skip characters that were already enqueued before JSON detection
            const remainingPrefixText =
              charactersEnqueuedBeforeJson > 0
                ? fullPrefixText.slice(charactersEnqueuedBeforeJson).trim()
                : fullPrefixText;

            if (remainingPrefixText && !prefixTextFlushed) {
              prefixTextFlushed = true;
              log.info(
                {
                  prefixText: remainingPrefixText.slice(0, 100),
                  alreadyEnqueued: charactersEnqueuedBeforeJson,
                  sessionId,
                  trace: 'E2E_JSON_PREFIX',
                },
                `🔧 E2E TRACE [JSON PREFIX] Speaking prefix before JSON: "${remainingPrefixText.slice(0, 50)}..."`
              );
              controller.enqueue(remainingPrefixText);
              // BTH Feedback Loop: Track prefix as clean response text
              cleanResponseText += remainingPrefixText;
            } else if (fullPrefixText && charactersEnqueuedBeforeJson > 0) {
              log.debug(
                {
                  alreadyEnqueued: charactersEnqueuedBeforeJson,
                  fullPrefixLength: fullPrefixText.length,
                  sessionId,
                },
                '🔧 Prefix already partially/fully enqueued before JSON detection - skipping duplicate'
              );
            }
          }

          log.debug(
            { sessionId, bufferSnippet: buffer.slice(-50) },
            '🔍 Potential JSON block detected, buffering...'
          );
        }
      }

      // If we're accumulating, don't enqueue yet - wait for complete JSON
      if (potentialJsonAccumulating) {
        pendingChunks.push(chunk);
      }

      // Check if buffer CONTAINS a complete JSON function call
      // Pattern: ```json\n{...}\n``` OR just {...} with "fn" and "args"
      const jsonBlockMatch = buffer.match(
        /```(?:json)?\s*(\{[^`]*"fn"\s*:\s*"[^"]+"\s*[^`]*\})\s*```/s
      );
      const bareJsonMatch =
        !jsonBlockMatch &&
        buffer.match(/(\{[^{}]*"fn"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{[^{}]*\}[^{}]*\})/);
      const jsonMatch = jsonBlockMatch || bareJsonMatch;

      if (!jsonFunctionExecuted && jsonMatch) {
        const fullMatch = jsonMatch[0];
        const jsonContent = jsonMatch[1];

        // JSON found and complete - we already enqueued prefix, now execute
        potentialJsonAccumulating = false;
        pendingChunks = [];

        // Try to extract fn and args from the JSON content
        const fnArgsMatch = jsonContent.match(/"fn"\s*:\s*"([^"]+)".*?"args"\s*:\s*(\{[^{}]*\})/s);
        if (fnArgsMatch && toolContext) {
          const fnName = fnArgsMatch[1];
          const argsStr = fnArgsMatch[2];

          try {
            const args = JSON.parse(argsStr);

            // 🚫 DEDUPLICATION: Check if tool was already executed by semantic router
            // This prevents double execution when semantic router and LLM both try to call the same tool
            const toolId = `${fnName}:${JSON.stringify(args)}`;
            if (sessionId && wasToolExecutedBySemanticRouter(sessionId, toolId)) {
              log.info(
                { fn: fnName, sessionId, trace: 'E2E_DEDUP_SKIP' },
                `🚫 E2E TRACE [DEDUP] Skipping ${fnName} - already executed by semantic router`
              );
              buffer = '';
              return;
            }

            jsonFunctionExecuted = true;

            log.info(
              { fn: fnName, args, sessionId, trace: 'E2E_JSON_INTERCEPT' },
              `🔧 E2E TRACE [JSON INTERCEPT] Executing: ${fnName}(${JSON.stringify(args).slice(0, 50)}...)`
            );

            // Mark as executed to prevent duplicate calls from other layers
            if (sessionId) {
              markToolExecutedBySemanticRouter(sessionId, toolId);
            }

            // Execute the function
            const { executeJsonFunction } = await import('../../json-function-executor.js');
            const result = await executeJsonFunction(
              { fn: fnName, args, raw: fullMatch },
              { ...toolContext, sessionId }
            );

            // Convert result to string for guidance
            const resultStr =
              typeof result.result === 'string' ? result.result : JSON.stringify(result.result);

            if (result.success) {
              log.info(
                { fn: fnName, result: resultStr?.slice(0, 100), trace: 'E2E_JSON_SUCCESS' },
                `✅ E2E TRACE [JSON SUCCESS] ${fnName} completed`
              );

              if (result.speakDirectly && resultStr) {
                // Tool explicitly wants to speak directly (e.g., "speak" pseudo-tool)
                session?.say?.(resultStr, { allowInterruptions: true });
              } else if (session && sessionId && sessionId !== 'unknown') {
                // BETTER THAN HUMAN: Use gateway with rich contextual guidance
                // Gateway provides: debouncing, circuit breaker, active response tracking
                const instructions = buildToolResponseGuidance({
                  fnName,
                  result: resultStr || 'Success',
                  success: true,
                  options,
                });

                log.info(
                  {
                    fn: fnName,
                    hasUserContext: !!options.userName,
                    hasEmotion: !!options.userEmotion,
                    trace: 'E2E_GENERATE_REPLY',
                  },
                  `🔄 E2E TRACE [GENERATE_REPLY] Telling LLM about ${fnName} via gateway`
                );

                // Use gateway for proper safeguards - fire and forget with error handling
                // IMPORTANT: Tool responses need longer timeout - Gemini must parse the tool
                // result AND generate a contextual response (not just a simple conversational reply)
                // FIX (Jan 2026): Set waitForPlayout: false to avoid hanging on concurrent speech
                // The PREFIX text may already be playing, and the gateway's speechStarted flag
                // gets polluted by events from that speech, causing the timeout to silently return
                // without rejecting. With waitForPlayout: false, we return after LLM response
                // and the speech happens asynchronously.
                gatewayGenerateReply(session as voice.AgentSession, sessionId, {
                  instructions,
                  context: `json-tool-${fnName}`,
                  priority: 'high', // Tool responses should be high priority
                  allowInterruptions: true,
                  waitForPlayout: false, // Don't wait - PREFIX may be playing concurrently
                  fallbackMessage: resultStr || 'Done!',
                  timeoutMs: TOOL_RESPONSE_TIMEOUT_MS, // 10s - tool responses need more time
                }).catch((gatewayError) => {
                  log.warn(
                    { error: String(gatewayError), fn: fnName, trace: 'E2E_GATEWAY_FALLBACK' },
                    'Gateway generateReply failed, using direct say fallback'
                  );
                  session?.say?.(resultStr || 'Done!', { allowInterruptions: true });
                });
              } else if (resultStr) {
                // Fallback: speak the result directly when session/sessionId not available
                session?.say?.(resultStr, { allowInterruptions: true });
              }
            } else {
              log.error(
                { fn: fnName, error: result.error, trace: 'E2E_JSON_FAILED' },
                `❌ E2E TRACE [JSON FAILED] ${fnName}: ${result.error}`
              );

              // BETTER THAN HUMAN: Rich contextual guidance for graceful failure
              if (session && sessionId && sessionId !== 'unknown') {
                const instructions = buildToolResponseGuidance({
                  fnName,
                  result: '',
                  success: false,
                  error: result.error,
                  options,
                });

                // Use gateway for proper safeguards
                // IMPORTANT: Tool responses need longer timeout - even failures need time to process
                // FIX (Jan 2026): Set waitForPlayout: false to avoid hanging on concurrent speech
                gatewayGenerateReply(session as voice.AgentSession, sessionId, {
                  instructions,
                  context: `json-tool-${fnName}-failed`,
                  priority: 'high',
                  allowInterruptions: true,
                  waitForPlayout: false, // Don't wait - PREFIX may be playing concurrently
                  fallbackMessage: "Hmm, that didn't quite work. Want me to try something else?",
                  timeoutMs: TOOL_RESPONSE_TIMEOUT_MS, // 10s - tool responses need more time
                }).catch((gatewayError) => {
                  log.warn(
                    { error: String(gatewayError), fn: fnName },
                    'Gateway generateReply failed for error case, using direct say fallback'
                  );
                  session?.say?.("Hmm, that didn't quite work. Want me to try something else?", {
                    allowInterruptions: true,
                  });
                });
              } else {
                session?.say?.("Hmm, that didn't quite work. Want me to try something else?", {
                  allowInterruptions: true,
                });
              }
            }
          } catch (parseError) {
            log.warn(
              { error: String(parseError), buffer: buffer.slice(0, 100) },
              'Failed to parse JSON function call'
            );
          }

          // Clear buffer - don't send JSON to TTS
          buffer = '';
          return;
        }
      }

      // Check for music narration pattern
      if (!musicFallbackTriggered && shouldTriggerMusicFallback(buffer)) {
        musicFallbackTriggered = true;

        const query = extractMusicQuery(buffer);
        if (query && session && toolContext) {
          log.info('Music fallback triggered:', { query });

          // Create tool ID for dedup
          const toolId = `playMusic:${query}`;

          // Check if already executed by semantic router
          if (sessionId && wasToolExecutedBySemanticRouter(sessionId, toolId)) {
            log.debug('Music tool already executed by semantic router, skipping');
          } else {
            // Mark as executed
            if (sessionId) {
              markToolExecutedBySemanticRouter(sessionId, toolId);
            }

            // Execute music tool
            try {
              await executeMusicFallback(query, toolContext, session);
            } catch (error) {
              log.error('Music fallback execution failed:', error);
            }
          }
        }

        // Filter out the narration
        buffer = '';
        return;
      }

      // Standard leakage detection
      const detection = detectsFunctionCallLeakage(buffer);
      if (detection.detected) {
        const replacement = getReplacementText(detection);
        if (replacement) {
          controller.enqueue(replacement);
        }
        potentialJsonAccumulating = false;
        pendingChunks = [];
        buffer = '';
        return;
      }

      // If we're accumulating potential JSON, don't enqueue yet
      if (potentialJsonAccumulating) {
        // Safety: If buffer gets too large without finding complete JSON, release it
        // This prevents infinite buffering if LLM outputs malformed JSON
        if (buffer.length > 1000) {
          log.warn(
            { sessionId, bufferLength: buffer.length },
            '⚠️ JSON accumulation buffer overflow - releasing pending chunks'
          );
          // Release all pending chunks
          for (const pendingChunk of pendingChunks) {
            controller.enqueue(pendingChunk);
          }
          potentialJsonAccumulating = false;
          pendingChunks = [];
        }
        // Don't enqueue current chunk - we're still buffering

        // Keep buffer reasonable
        if (buffer.length > 500) {
          buffer = buffer.slice(-200);
        }
        return;
      }

      // Pass through clean text (only when NOT accumulating potential JSON)
      controller.enqueue(chunk);

      // BTH Feedback Loop: Accumulate clean text for injection attribution
      cleanResponseText += chunk;

      // FIX (Jan 2026): Track how much we've enqueued before potential JSON detection
      // This prevents re-enqueuing the prefix if JSON is detected later
      charactersEnqueuedBeforeJson += chunk.length;

      // Keep buffer reasonable
      if (buffer.length > 500) {
        buffer = buffer.slice(-200);
      }
    },

    flush(controller) {
      // If we have pending chunks when stream ends, analyze before releasing
      // This handles the case where JSON detection never completed (e.g., Gemini timeout mid-response)
      if (pendingChunks.length > 0) {
        const combinedPending = pendingChunks.join('');

        // Check if pending content looks like incomplete JSON (should NOT be spoken)
        // Patterns: starts with { or ```, contains "fn":, ends mid-JSON
        const looksLikeIncompleteJson =
          combinedPending.includes('"fn"') ||
          combinedPending.includes('```json') ||
          (combinedPending.includes('{') && !combinedPending.includes('}')) ||
          combinedPending.match(/^\s*\{/) ||
          combinedPending.match(/```\s*$/);

        if (looksLikeIncompleteJson) {
          // DROP incomplete JSON - don't speak it!
          // This happens when Gemini connection dies mid-function-call output
          log.warn(
            {
              sessionId,
              pendingCount: pendingChunks.length,
              preview: combinedPending.slice(0, 100),
            },
            '🚫 Stream ended with incomplete JSON function call - DROPPING (not sending to TTS)'
          );
          // Don't enqueue anything - let the fallback message handle the response
        } else {
          // Not JSON - release the pending chunks
          log.warn(
            { sessionId, pendingCount: pendingChunks.length },
            '⚠️ Stream ended with pending chunks - releasing to TTS'
          );
          for (const pendingChunk of pendingChunks) {
            controller.enqueue(pendingChunk);
            // BTH Feedback Loop: Track released pending chunks as clean response
            cleanResponseText += pendingChunk;
          }
        }
      }

      // =========================================================================
      // BTH FEEDBACK LOOP: Analyze response alignment with injections
      // This is the key hook for Phase 1 - measuring injection effectiveness
      // =========================================================================
      if (cleanResponseText.trim() && sessionId && options.userId) {
        const conversationMode = options.conversationMode || 'conversation';
        try {
          // Non-blocking - fire and forget
          analyzeResponseAlignment(sessionId, options.userId, cleanResponseText, conversationMode);
          log.debug(
            {
              sessionId,
              responseLength: cleanResponseText.length,
              trace: 'BTH_INJECTION_TRACKING',
            },
            '📊 BTH Feedback: Analyzed response alignment with injections'
          );
        } catch (err) {
          log.warn(
            { sessionId, error: String(err) },
            'BTH Feedback: Failed to analyze response alignment'
          );
        }
      }

      // =========================================================================
      // BTH VISIBLE VULNERABILITY: Detect when Ferni's response shows authentic
      // uncertainty/doubt (e.g., "I'm not sure...", "I might be wrong...").
      // This triggers avatar micro-expressions that humanize Ferni.
      // Previously only triggered on USER philosophical questions (turn-handler).
      // Now also triggers on Ferni's OWN response text (streaming path).
      // =========================================================================
      if (cleanResponseText.trim() && sessionId) {
        try {
          const userTopic = options.recentTopics?.[0];
          const result = detectVulnerabilityWithContext(cleanResponseText, userTopic);
          if (result.detected && result.isEmotional) {
            const publisher = getFrontendPublisher();
            const sendData = async (type: string, payload: Record<string, unknown>) => {
              await publisher.sendData(type, payload);
            };
            dispatchVisibleVulnerability(sendData, {
              vulnerabilityType: result.type,
              intensity: result.confidence * 0.8, // Slightly softer than user-triggered
            }).catch((err) => {
              log.debug({ error: String(err) }, 'BTH vulnerability dispatch failed (non-critical)');
            });
            log.debug(
              {
                sessionId,
                vulnerabilityType: result.type,
                confidence: result.confidence,
                trace: 'BTH_VISIBLE_VULNERABILITY',
              },
              '🌱 BTH: Ferni response vulnerability detected (streaming path)'
            );
          }
        } catch (err) {
          log.debug(
            { sessionId, error: String(err) },
            'BTH vulnerability detection failed (non-critical)'
          );
        }
      }

      // Reset state for next response
      buffer = '';
      musicFallbackTriggered = false;
      jsonFunctionExecuted = false;
      potentialJsonAccumulating = false;
      pendingChunks = [];
      charactersEnqueuedBeforeJson = 0;
      cleanResponseText = '';
    },
  });

  return transformer;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Music narration patterns that indicate LLM talked instead of called
 */
const MUSIC_NARRATION_PATTERNS = [
  /playing\s+(some\s+)?(\w+)\s+(music|songs?|tracks?)/i,
  /let me play\s+(some\s+)?(\w+)/i,
  /i(?:'ll| will) play\s+(some\s+)?(\w+)/i,
  /searching for\s+(\w+)\s+(music|songs?)/i,
];

/**
 * Check if buffer contains music narration that needs fallback
 */
function shouldTriggerMusicFallback(text: string): boolean {
  return MUSIC_NARRATION_PATTERNS.some((p) => p.test(text));
}

/**
 * Extract music query from narration text
 */
function extractMusicQuery(text: string): string | null {
  for (const pattern of MUSIC_NARRATION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Return captured group (usually genre/artist)
      return match[2] || match[1]?.replace(/^some\s+/, '') || null;
    }
  }
  return null;
}

/**
 * Execute music tool as fallback
 */
async function executeMusicFallback(
  query: string,
  toolContext: Record<string, unknown>,
  session: SanitizerStreamOptions['session']
): Promise<void> {
  try {
    // Use the JSON function executor to handle the music request
    const { executeJsonFunction } = await import('../../json-function-executor.js');

    const result = await executeJsonFunction(
      {
        fn: 'playMusic',
        args: { query },
        raw: JSON.stringify({ fn: 'playMusic', args: { query } }),
      },
      toolContext
    );

    if (result.success) {
      // Acknowledge to user
      const acknowledgment = `Sure, playing ${query}`;
      session?.say?.(acknowledgment, { allowInterruptions: true });
    } else {
      log.warn({ error: result.error }, 'Music fallback failed');
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Music fallback execution error');
  }
}

// ============================================================================
// GUIDANCE STRIP STREAM
// ============================================================================

/**
 * Patterns for internal guidance blocks to strip (JS fallback)
 */
const GUIDANCE_BLOCK_PATTERNS = [
  /<guidance>[\s\S]*?<\/guidance>/gi,
  /<internal>[\s\S]*?<\/internal>/gi,
  /<system>[\s\S]*?<\/system>/gi,
  /\[guidance\][\s\S]*?\[\/guidance\]/gi,
  /\[internal\][\s\S]*?\[\/internal\]/gi,
  /\[system\][\s\S]*?\[\/system\]/gi,
  /---\s*guidance\s*---[\s\S]*?---\s*end\s*guidance\s*---/gi,

  // Context injection blocks (Jan 2026) - Gemini echoing full instruction blocks
  // These appear when the LLM echoes timing-aware/silence handler context
  /CONTEXT\s*\(read but do NOT include[\s\S]*?Just speak naturally\.?/gi,
  /YOUR TASK:[\s\S]*?Just speak naturally\.?/gi,
  /CRITICAL:\s*Output ONLY your spoken response[\s\S]*?Just speak naturally\.?/gi,

  // Individual instruction fragments that should never be spoken
  /CONTEXT\s*\(read but do NOT include in your response\):[^\n]*/gi,
  /YOUR TASK:\s*[^\n]*/gi,
  /CRITICAL:\s*Output ONLY[^\n]*/gi,
  /No meta-commentary[^\n]*/gi,
  /Just speak naturally\.?\s*/gi,
  /Be curious,? not concerned\.?\s*/gi,
  /Check in gently\s*\([^)]+\)\.?\s*/gi,

  // Speaking cue from silence handler (Jan 2026)
  /Speaking to them now:\s*/gi,
];

/** Check if native Rust acceleration is available */
const useNativeStripping = isGuidanceStrippingAvailable();

if (useNativeStripping) {
  log.debug('🦀 Using Rust-accelerated guidance block stripping (Aho-Corasick O(n))');
}

/**
 * Strip guidance blocks from text (JS fallback implementation)
 */
function stripGuidanceBlocksJS(text: string): string {
  let result = text;
  for (const pattern of GUIDANCE_BLOCK_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

/**
 * Strip guidance blocks from text
 * Uses Rust Aho-Corasick for O(n) multi-pattern matching when available.
 *
 * **Behavior Note (Rust vs JS):**
 * - Unclosed blocks: Rust strips everything after open tag, JS keeps unclosed content
 * - This is intentional: in streaming TTS, unclosed blocks should be hidden
 * - Markdown patterns use literal matching (most common spacing variations supported)
 *
 * @param text - Text to strip guidance from
 * @returns Text with guidance blocks removed
 */
export function stripGuidanceBlocks(text: string): string {
  if (useNativeStripping) {
    try {
      return rustStripGuidanceBlocks(text);
    } catch {
      // Fall back to JS on any error
      return stripGuidanceBlocksJS(text);
    }
  }
  return stripGuidanceBlocksJS(text);
}

/**
 * Fast check if text contains guidance blocks (no stripping)
 * Uses Rust Aho-Corasick for O(n) detection when available.
 */
export function containsGuidanceBlocks(text: string): boolean {
  if (useNativeStripping) {
    try {
      return rustContainsGuidanceBlocks(text);
    } catch {
      // Fall back to JS pattern check
      return GUIDANCE_BLOCK_PATTERNS.some((p) => p.test(text));
    }
  }
  return GUIDANCE_BLOCK_PATTERNS.some((p) => p.test(text));
}

/**
 * Create a stream that strips guidance blocks
 */
export function createGuidanceStripStream(): AnyTransformStream {
  let buffer = '';

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk;

      // Look for complete guidance blocks
      const stripped = stripGuidanceBlocks(buffer);

      // If we stripped something, output the cleaned version
      if (stripped !== buffer) {
        controller.enqueue(stripped);
        buffer = '';
      } else if (!buffer.includes('<') && !buffer.includes('[')) {
        // No potential blocks, pass through
        controller.enqueue(chunk);
        buffer = buffer.slice(-50); // Keep small buffer for potential tags
      }
      // Otherwise, buffer and wait for more
    },

    flush(controller) {
      // Output any remaining clean content
      const stripped = stripGuidanceBlocks(buffer);
      if (stripped) {
        controller.enqueue(stripped);
      }
      buffer = '';
    },
  });
}
