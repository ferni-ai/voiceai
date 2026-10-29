/**
 * A guard over the call-start, on-behalf, call-result and turn surfaces: no
 * logger call there may carry caller or contact content (a name, what they
 * said, a reason or purpose, a summary, a city, tool arguments, a payload or
 * a whole context object), or error text outside the safe serializer. Kinds,
 * counts, lengths, keys and yes/no are fine. It reads the source, so a call
 * site no behaviour test reaches is still held to it; the reader and its
 * shape classes are in log-guard.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { offences, type Exemptions } from './log-guard.js';

const SURFACE = [
  'src/agents/voice-agent-entry/index.ts',
  'src/agents/voice-agent-entry/metadata-parser.ts',
  'src/agents/voice-agent-entry/startup-log.ts',
  'src/agents/voice-agent-entry/handler-setup.ts',
  'src/agents/voice-agent-entry/user-input-transcribed.ts',
  'src/agents/voice-agent-entry/session-creator.ts',
  'src/agents/voice-agent-entry/call-start-identify.ts',
  'src/agents/voice-agent-entry/caller-recognition.ts',
  'src/agents/voice-agent-entry/sip-caller.ts',
  'src/agents/voice-agent-entry/persona-builder.ts',
  'src/agents/voice-agent-entry/user-awareness-injection.ts',
  'src/agents/voice-agent/user-identification-handler.ts',
  'src/agents/integrations/on-behalf-transcript-capture.ts',
  'src/agents/outbound-call/on-behalf-call-lifecycle.ts',
  'src/agents/outbound-call/call-control.ts',
  'src/agents/outbound-call/call-screener.ts',
  'src/services/outreach/on-behalf-call-orchestrator.ts',
  'src/services/outreach/on-behalf-dispatch.ts',
  'src/services/outreach/call-result-capture.ts',
  'src/services/outreach/call-transcript-intelligence.ts',
  'src/intelligence/context-builders/external/inbound-call-context.ts',
  'src/intelligence/context-builders/external/outbound-call-context.ts',
  'src/intelligence/context-builders/external/proactive-session-context.ts',
  'src/intelligence/context-builders/external/voice-mismatch-context.ts',
  'src/intelligence/context-builders/external/account-linking-context.ts',
  'src/intelligence/context-builders/external/family-messages-context.ts',
  'src/intelligence/context-builders/external/macos-context.ts',
  'src/intelligence/context-builders/external/pending-call-results.ts',
  // The turn path (#2656, #2653).
  'src/agents/voice-agent/transcript-handler.ts',
  'src/agents/voice-agent/anticipation-handler.ts',
  'src/agents/voice-agent/human-turn-intelligence.ts',
  'src/agents/multi-agent/agent-setup.ts',
  'src/agents/multi-agent/orchestrator.ts',
  'src/agents/shared/tts-wrapper.ts',
  'src/agents/shared/function-call-telemetry.ts',
  'src/agents/shared/e2e-latency-tracker.ts',
  'src/agents/processors/message-analyzer.ts',
  'src/services/world-awareness/home-weather.ts',
  'src/services/world-awareness/index.ts',
  'src/services/world-awareness/saved-interests.ts',
  'src/services/world-awareness/session-integration.ts',
  'src/tools/domains/information/weather.ts',
  'src/tools/domains/information/utils/geocoding.ts',
  // Round 2: one call up the stack from the weather lookup, and the turn processors.
  'src/tools/domains/information/weather-tools.ts',
  'src/agents/shared/tool-executors/information-executor.ts',
  'src/agents/processors/turn-processor/process-turn.ts',
  'src/agents/integrations/better-than-human-integration.ts',
];

/**
 * Files the guard must keep covering, whatever SURFACE says: each was a leak
 * fixed by #2646, #2656/#2663 or #2653. Add to it; never take one out.
 */
const REQUIRED = [
  'src/agents/voice-agent-entry/index.ts',
  'src/agents/voice-agent-entry/metadata-parser.ts',
  'src/agents/voice-agent-entry/session-creator.ts',
  'src/agents/voice-agent-entry/user-awareness-injection.ts',
  'src/agents/voice-agent/user-identification-handler.ts',
  'src/agents/voice-agent/transcript-handler.ts',
  'src/agents/voice-agent/anticipation-handler.ts',
  'src/agents/voice-agent/human-turn-intelligence.ts',
  'src/agents/multi-agent/agent-setup.ts',
  'src/agents/multi-agent/orchestrator.ts',
  'src/agents/shared/function-call-telemetry.ts',
  'src/agents/shared/e2e-latency-tracker.ts',
  'src/agents/processors/message-analyzer.ts',
  'src/services/outreach/on-behalf-call-orchestrator.ts',
  'src/services/outreach/call-result-capture.ts',
  'src/services/world-awareness/index.ts',
  'src/services/world-awareness/session-integration.ts',
  'src/intelligence/context-builders/external/macos-context.ts',
  'src/tools/domains/information/weather.ts',
  'src/tools/domains/information/utils/geocoding.ts',
  'src/tools/domains/information/weather-tools.ts',
  'src/agents/shared/tool-executors/information-executor.ts',
];

/**
 * What the guard leaves, each with why. pending: whole calls left as they are
 * until Seth decides, matched by their EXACT source text, so any change to one
 * (a field added, a slice lengthened) is caught. values: one value in one
 * file that matches a content shape but is not caller content. whole: an
 * object logged whole or spread that holds none.
 */
const EXEMPT: Exemptions = {
  pending: [
    // E2E_USER_INPUT: the call reviewer reads what the caller said here (#2656): pending Seth's call.
    [
      'transcript-handler.ts',
      '(\n        {\n          trace: \'E2E_USER_INPUT\',\n          transcript: event.transcript.slice(0, 100),\n          fullLength: event.transcript.length,\n          sessionId,\n          userId,\n          turnNumber: userData.turnCount || 0,\n        },\n        `🔍 E2E TRACE [STT] User said: "${event.transcript.slice(0, 50)}..." (${event.transcript.length} chars)`\n      )',
    ],
    // voice-eval reads this preview (review-calls, turn-taking): pending Seth's call.
    ['process-turn.ts', "('Processing user turn', {\n    preview: userText.slice(0, 100),\n  })"],
    // resonance response transcript slice (#2663 round 2): pending Seth's call.
    [
      'better-than-human-integration.ts',
      "(\n    {\n      sessionId,\n      capability: pending.capability,\n      reaction,\n      transcript: userTranscript.slice(0, 50),\n    },\n    '📊 Resonance response recorded'\n  )",
    ],
  ],
  values: [
    ['index.ts', '', 'JSON.stringify(summary.turnProfiling || {})'], // timing numbers
    [
      'metadata-parser.ts',
      '',
      "JSON.stringify({\n        callSid: metadata.callSid,\n        callerPhone:\n          maskPhoneNumber(\n            typeof metadata.callerPhone === 'string' ? metadata.callerPhone : undefined\n          ) ?? 'unknown',\n        isKnownCaller: metadata.isKnownCaller,\n        isSponsored: !!metadata.sponsoredIdentityId,\n      })",
    ], // inbound: a call id and a masked number (inbound-call-trust.test.ts)
    ['metadata-parser.ts', '', 'roomNameForContext'], // the LiveKit room name
    ['session-creator.ts', '', "missingCritical.join(', ')"], // tool names
    ['session-creator.ts', '', "toolNames.join(', ')"], // tool names
    ['session-creator.ts', '', "allowedTools ? allowedTools.join(', ') : 'ALL (no restrictions)'"], // tool names
    ['call-transcript-intelligence.ts', 'callId', 'transcript.callId'], // an id
    ['transcript-handler.ts', 'response', 'cached.response.slice(0, 50)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['transcript-handler.ts', 'emotions', "result.contradiction.emotions.join(' + ')"], // emotion labels
    ['agent-setup.ts', '', "finalToolNames.join(', ')"], // tool names
    ['agent-setup.ts', '', 'JSON.stringify(error, null, 2)'], // LiveKit/Gemini connection error events: codes and reasons
    ['agent-setup.ts', '', "audioEventNames.join(', ')"], // SDK event names
    ['agent-setup.ts', '', "evt.text?.slice(0, 100) || '(no text)'"], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['agent-setup.ts', '', "evt.text?.slice(0, 200) || '(empty)'"], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['agent-setup.ts', '', "essentialDomains.join(', ')"], // tool domain names
    ['agent-setup.ts', '', 'JSON.stringify(handlersStatus)'], // which handlers are attached: booleans
    ['agent-setup.ts', '', 'JSON.stringify(timings, null, 2)'], // setup timings
    ['agent-setup.ts', 'textPreview', 'text.slice(0, 60)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['orchestrator.ts', 'greetingPreview', 'greeting.slice(0, 50)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['orchestrator.ts', '', 'greeting.slice(0, 50)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['orchestrator.ts', 'goodbyePreview', 'textToSpeak?.slice(0, 60)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['orchestrator.ts', '', 'textToSpeak.slice(0, 50)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['orchestrator.ts', 'greetingPreview', 'textToSpeak?.slice(0, 60)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['tts-wrapper.ts', 'fallback', 'fallback.slice(0, 50)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['tts-wrapper.ts', 'detectedArgs', 'analysis.detectedArgs.slice(0, 5)'], // argument key names found in leaked JSON, never values
    ['tts-wrapper.ts', 'leakSample', "leakedJson.slice(0, 100).replace(/[a-zA-Z]{4,}/g, 'xxx')"], // letters of 4+ replaced: JSON structure only
    ['tts-wrapper.ts', 'chunk', 'chunk.slice(0, 50)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['tts-wrapper.ts', 'chunk', 'chunk.slice(0, 100)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['tts-wrapper.ts', 'leakedJson', 'jsonLeakBuffer.slice(0, 200)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['tts-wrapper.ts', '', 'chunk.slice(0, 50)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    [
      'tts-wrapper.ts',
      'charCodes',
      "rawLLMBuffer\n                  .slice(0, 20)\n                  .split('')\n                  .map((c) => c.charCodeAt(0))",
    ], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['tts-wrapper.ts', 'outputSample', 'ttsOutputBuffer.slice(0, 200)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['tts-wrapper.ts', 'outputSample', 'ttsOutputBuffer.slice(0, 300)'], // Ferni's own words: pending, with E2E_TTS_OUTPUT (#2656)
    ['e2e-latency-tracker.ts', 'context', 'context'], // a label for the LLM request (generate-reply-gateway)
    ['e2e-latency-tracker.ts', 'context', 'timeline.context'], // a label for the LLM request (generate-reply-gateway)
    ['weather.ts', 'condition', 'condition'], // the weather API's condition text
    ['process-turn.ts', 'enriched', 'enriched.primary'], // an emotion label
    ['better-than-human-integration.ts', 'emotions', "contradictionResult.emotions.join(' + ')"], // emotion labels
  ],
  whole: [
    ['session-creator.ts', 'record'], // TURN_METRICS: latencies and token counts
    ['sip-caller.ts', "(result.status === 'invalid' ? { signedReason: result.reason } : {})"], // SipCallerReading: masked number, attestation enums; signedReason an enum
    ['sip-caller.ts', 'result'], // SipCallerReading: masked number, attestation enums; signedReason an enum
    ['human-turn-intelligence.ts', 'result'], // TurnSignals: scores, flags and a backchannel kind
    ['agent-setup.ts', 'record'], // TURN_METRICS: latencies and token counts
    ['tts-wrapper.ts', 'extractedInfo'], // tool name and argument key names (analyzeLeakedJson)
    ['e2e-latency-tracker.ts', 'summary'], // latencies, a bottleneck kind, the transcript's length
  ],
};

describe('the call and turn logs', () => {
  it.each(SURFACE)('%s logs no caller or contact content', (path) => {
    expect(offences(path, undefined, EXEMPT)).toEqual([]);
  });

  it('a pending call is left only as it is, word for word: one field added is caught', () => {
    const path = 'src/agents/voice-agent/transcript-handler.ts';
    const src = readFileSync(path, 'utf8');
    const changed = src.replace(
      "trace: 'E2E_USER_INPUT',",
      "trace: 'E2E_USER_INPUT',\n          userName,"
    );
    expect(changed).not.toBe(src);
    expect(offences(path, src, EXEMPT)).toEqual([]);
    expect(offences(path, changed, EXEMPT).some((o) => o.includes('event.transcript'))).toBe(true);
    // A slice lengthened at the end of the call, its start unchanged, is caught too.
    const longer = src.replace(
      'User said: "${event.transcript.slice(0, 50)}',
      'User said: "${event.transcript.slice(0, 90)}'
    );
    expect(longer).not.toBe(src);
    expect(offences(path, longer, EXEMPT)).not.toEqual([]);
  });

  it('keeps covering every file a leak was fixed in', () => {
    expect(REQUIRED.filter((f) => !SURFACE.includes(f))).toEqual([]);
  });
});
