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
  'src/services/outreach/call-progress.ts',
  'src/services/outreach/call-result-watch.ts',
  'src/services/outreach/owner-room.ts',
  'src/services/outreach/call-transcript-intelligence.ts',
  'src/intelligence/context-builders/external/inbound-call-context.ts',
  'src/intelligence/context-builders/external/outbound-call-context.ts',
  'src/intelligence/context-builders/external/proactive-session-context.ts',
  'src/intelligence/context-builders/external/voice-mismatch-context.ts',
  'src/intelligence/context-builders/external/account-linking-context.ts',
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
  // The placed call's own lines: the person called, their name and number (on-behalf privacy).
  'src/services/outreach/outbound-call-tracker.ts',
  'src/services/outreach/message-enrichment.ts',
  'src/services/outreach/scheduled-outreach-executor.ts',
  'src/services/outreach/scheduled-multi-outreach.ts',
  'src/tools/domains/telephony/call-on-behalf.ts',
  'src/services/outreach/webhooks/twilio-webhooks.ts',
  'src/services/outreach/on-behalf-call-orchestrator.ts',
  'src/services/outreach/user-contact.ts',
  'src/services/contacts/contact-relationship-service.ts',
  'src/services/identity/contacts/contact-onboarding.ts',
  'src/services/trust-and-identity/identity-orchestrator.ts',
  // #4392: what the person said they'd do, their commitments, and Ferni's handoff line.
  'src/services/trust-systems/small-wins.ts',
  'src/services/superhuman/commitment-calendar-integration.ts',
  'src/agents/multi-agent/handoff-brief.ts',
  'src/agents/processors/injection-builders/safety-coaching-builders.ts',
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
  'src/agents/integrations/better-than-human-integration.ts',
  'src/services/trust-systems/small-wins.ts',
  'src/services/superhuman/commitment-calendar-integration.ts',
  'src/agents/multi-agent/handoff-brief.ts',
  'src/agents/processors/injection-builders/safety-coaching-builders.ts',
];

/**
 * What the guard leaves, each with why. pending: whole calls left as they are
 * until Seth decides, matched by their EXACT source text, so any change to one
 * (a field added, a slice lengthened) is caught. values: one value in one
 * file that matches a content shape but is not caller content. whole: an
 * object logged whole or spread that holds none.
 */
const EXEMPT: Exemptions = {
  // The owner decided (11-12): what anyone said is a length on prod; nothing is pending (#4392).
  pending: [],
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
    ['transcript-handler.ts', 'emotions', "result.contradiction.emotions.join(' + ')"], // emotion labels
    ['agent-setup.ts', '', "finalToolNames.join(', ')"], // tool names
    ['agent-setup.ts', '', 'JSON.stringify(error, null, 2)'], // LiveKit/Gemini connection error events: codes and reasons
    ['agent-setup.ts', '', "audioEventNames.join(', ')"], // SDK event names
    ['agent-setup.ts', '', "essentialDomains.join(', ')"], // tool domain names
    ['agent-setup.ts', '', 'JSON.stringify(handlersStatus)'], // which handlers are attached: booleans
    ['agent-setup.ts', '', 'JSON.stringify(timings, null, 2)'], // setup timings
    ['tts-wrapper.ts', 'fallback', 'fallback.slice(0, 50)'], // the character codes of a garbage reply's first 20 characters (punctuation or empty)
    ['tts-wrapper.ts', 'detectedArgs', 'analysis.detectedArgs.slice(0, 5)'], // argument key names found in leaked JSON, never values
    ['tts-wrapper.ts', 'leakSample', "leakedJson.slice(0, 100).replace(/[a-zA-Z]{4,}/g, 'xxx')"], // letters of 4+ replaced: JSON structure only
    [
      'tts-wrapper.ts',
      'charCodes',
      "rawLLMBuffer\n                  .slice(0, 20)\n                  .split('')\n                  .map((c) => c.charCodeAt(0))",
    ], // the character codes of a garbage reply's first 20 characters (punctuation or empty)
    ['e2e-latency-tracker.ts', 'context', 'context'], // a label for the LLM request (generate-reply-gateway)
    ['e2e-latency-tracker.ts', 'context', 'timeline.context'], // a label for the LLM request (generate-reply-gateway)
    ['weather.ts', 'condition', 'condition'], // the weather API's condition text
    ['process-turn.ts', 'enriched', 'enriched.primary'], // an emotion label
    ['better-than-human-integration.ts', 'emotions', "contradictionResult.emotions.join(' + ')"], // emotion labels
    ['twilio-webhooks.ts', 'phoneLast4', 'last4(phone)'], // a number's last four digits
    ['twilio-webhooks.ts', 'phoneLast4', 'last4(From)'], // a number's last four digits
    ['twilio-webhooks.ts', 'phoneLast4', 'last4(payload.To)'], // a number's last four digits
    ['twilio-webhooks.ts', 'messageSid', 'payload.MessageSid'], // a Twilio id
    ['twilio-webhooks.ts', 'callSid', 'payload.CallSid'], // a Twilio id
    ['handoff-brief.ts', 'stockCut', 'cut !== said'], // yes/no: was the stock opener cut
  ],
  whole: [
    ['session-creator.ts', 'record'], // TURN_METRICS: latencies and token counts
    ['sip-caller.ts', "(result.status === 'invalid' ? { signedReason: result.reason } : {})"], // SipCallerReading: masked number, attestation enums; signedReason an enum
    ['human-turn-intelligence.ts', 'result'], // TurnSignals: scores, flags and a backchannel kind
    ['agent-setup.ts', 'record'], // TURN_METRICS: latencies and token counts
    ['tts-wrapper.ts', 'extractedInfo'], // tool name and argument key names (analyzeLeakedJson)
    ['e2e-latency-tracker.ts', 'summary'], // latencies, a bottleneck kind, the transcript's length
    ['scheduled-outreach-executor.ts', 'result'], // ExecutionResult: counts
  ],
};

describe('the call and turn logs', () => {
  it.each(SURFACE)('%s logs no caller or contact content', (path) => {
    expect(offences(path, undefined, EXEMPT)).toEqual([]);
  });

  // #4392: E2E_USER_INPUT logged every member's final transcript in prod. Each plant puts the
  // words back (in a field or in the message) and must be caught.
  const FINAL = 'src/agents/voice-agent/transcript-handler.ts';
  const LENGTH_ONLY = 'transcript: replyForLog(said, 100),';
  const NO_WORDS_MSG = 'User said (${event.transcript.length} chars)';
  it.each([
    ['a slice in the field', LENGTH_ONLY, 'transcript: said.slice(0, 100),'],
    ['the words whole in the field', LENGTH_ONLY, 'transcript: event.transcript,'],
    ['a slice in the message', NO_WORDS_MSG, 'User said: "${said.slice(0, 50)}..."'],
    ['the words whole in the message', NO_WORDS_MSG, 'User said: "${said}"'],
    ['a name added', "trace: 'E2E_USER_INPUT',", "trace: 'E2E_USER_INPUT',\n          userName,"],
  ])('the final-transcript trace logs a length, never words: %s is caught', (_, from, to) => {
    const src = readFileSync(FINAL, 'utf8');
    const planted = src.replace(from, to);
    expect(planted).not.toBe(src);
    expect(offences(FINAL, src, EXEMPT)).toEqual([]);
    expect(offences(FINAL, planted, EXEMPT)).not.toEqual([]);
  });

  it.each([
    ['src/services/trust-systems/small-wins.ts', 'replyForLog(intentionText)', 'intentionText'],
    [
      'src/services/superhuman/commitment-calendar-integration.ts',
      'replyForLog(commitment.text)',
      'commitment.text',
    ],
    [
      'src/agents/integrations/better-than-human-integration.ts',
      'replyForLog(userTranscript, 50)',
      'userTranscript.slice(0, 50)',
    ],
    [
      'src/services/superhuman/commitment-calendar-integration.ts',
      'repliesForLog(highPriorityConflicts.map((c) => c.commitmentText))',
      'highPriorityConflicts.map((c) => c.commitmentText)',
    ],
    [
      'src/agents/processors/injection-builders/safety-coaching-builders.ts',
      'replyForLog(coachingAnalysis.goalText)',
      'coachingAnalysis.goalText',
    ],
  ])('%s: the words put back are caught (#4392)', (path, from, to) => {
    const src = readFileSync(path, 'utf8');
    const planted = src.replace(from, to);
    expect(planted).not.toBe(src);
    expect(offences(path, planted, EXEMPT)).not.toEqual([]);
  });

  it('keeps covering every file a leak was fixed in', () => {
    expect(REQUIRED.filter((f) => !SURFACE.includes(f))).toEqual([]);
  });
});
