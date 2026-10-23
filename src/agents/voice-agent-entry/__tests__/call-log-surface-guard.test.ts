/**
 * A guard over the whole call-start, on-behalf and call-result surface: no
 * logger call there (the safe logger, diag, console, or a raw stderr/stdout
 * write) may carry a name, a reason, a purpose or script, a summary, a
 * transcript, a payload, tool arguments, a participant identity, a city or a
 * slice of any text. Kinds, counts, lengths and yes/no are fine. It reads the
 * source, so a call site no behaviour test reaches (voice-agent-entry/index.ts
 * is outside every test's import closure) is still held to it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SURFACE = [
  'src/agents/voice-agent-entry/index.ts',
  'src/agents/voice-agent-entry/metadata-parser.ts',
  'src/agents/voice-agent-entry/startup-log.ts',
  'src/agents/voice-agent-entry/handler-setup.ts',
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
];

/**
 * Lines the call reviewer (~/.claude/jobs/ferni-call-reviewer) reads that still
 * carry caller words, each waiting on a decision recorded in its issue. Listed
 * by exact source text so a new leak beside one is still caught.
 */
const PENDING = [
  'E2E_USER_INPUT', // transcript-handler.ts: 100 chars of each final transcript (#2656, owner decision)
];

/** Any logger: `log`, `log()`, `getLogger()`, `childLog`, `this.logger`, diag's channels, console, raw writes. */
const CALL =
  /(?:\b\w*(?:log|Log|logger|Logger)(?:\(\))?|\bdiag|\bconsole)\.(?:info|warn|error|debug|trace|log|user|session|entry|prewarm|stt|tts|tool|state|memory|perf|health|handoff|processing|filler|music)\s*\(|process\.std(?:err|out)\.write\s*\(/g;

/**
 * What a logged value may not be: caller or contact content, or a slice of
 * text. Case-insensitive and matched anywhere in the expression, so
 * `services.userProfile?.preferredName` and `ctx.job.metadata` are caught as
 * well as `userName`.
 */
const CONTENT = new RegExp(
  [
    String.raw`(?:user|contact|recipient|caller|metadata|profile|expected|confirmed|matched|from|member|participant|preferred)_?names?\b`,
    String.raw`(?:profile|contact|caller|recipient|participant|member|person(?!a)|user)\w*\??\.(?:name|\w*Name)\b`,
    String.raw`\bgeo\??\.(?:name|admin1|country|latitude|longitude)\b`,
    String.raw`\bmetadata\b(?!\??\.)`,
    String.raw`\b(?:purpose|triggerReason|handoffReason|script|notes?|objective|quote|payload|identity|arguments|args|city|cityOnly|location|locationName|latitude|longitude|locales?|facts?|enriched\w*|phone\w*|text|query|utterance)\b`,
    String.raw`\w*(?:transcript|summary|accent|userText|userInput|userMessage|originalMessage|assessment|topics)\w*`,
    String.raw`\b(?:region|country)(?:Code)?\b`,
    String.raw`\brequest\??\.reason\b`,
    String.raw`\.(?:slice|substring|substr|join)\(`,
    String.raw`JSON\.stringify\(`,
  ].join('|'),
  'i'
);

/** A value that says only whether, how many, how long or which kind; or names a helper that does. */
const SHAPE =
  /^!|^[^'`]*\?\s*'[^']*'\s*:\s*(?:[^'`]*\?\s*'[^']*'\s*:\s*)*'[^']*'$|^Boolean\(|\.length\b|Object\.keys\(|\.size\b|\? '(?:yes|YES)'|^(?:participantKind|errorClass|jobMetadataLine|toolCallText|identityDiagnosticsText|awarenessKind|maskPhone|redactPhone)\(/;

/** A logged argument written as-is (not an object, not a string): it must be a shape too. */
function bareArgs(args: string): string[] {
  const inner = args.slice(1, -1);
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i <= inner.length; i++) {
    const c = inner[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if ((c === ',' && depth === 0) || i === inner.length) {
      const arg = inner.slice(start, i).trim();
      start = i + 1;
      if (arg && !/^[{'"`]/.test(arg) && !/^\d/.test(arg)) out.push(arg);
    }
  }
  return out;
}

/** Logged values that match CONTENT but aren't caller content, each with why. */
const NOT_CONTENT: Array<string | RegExp> = [
  'JSON.stringify(summary.turnProfiling', // timing numbers, not a call summary
  'JSON.stringify(timings', // setup timing numbers
  'JSON.stringify(error', // SDK error objects
  'transcript.callId', // an id
  'JSON.stringify({\n        callSid: metadata.callSid', // inbound: a call id and a masked number (inbound-call-trust.test.ts)
  'enrichedMessage.metadata.enrichmentType', // a kind
  /^(?:\w*tool\w*|missingCritical|audioEventNames|essentialDomains)\b/i, // tool, setting and event names
  'result.contradiction.emotions.join', // emotion labels
  'JSON.stringify(handlersStatus)', // which handlers are attached: booleans
  'analysis.detectedArgs', // argument key names found in leaked JSON, never values
];

/** Objects logged whole that hold only numbers, ids and kinds, each with why. */
const BARE_OK = [
  'record', // TURN_METRICS: a TurnMetricsRecord (latencies, token counts)
  'summary', // e2e-latency-tracker: latencies, a bottleneck kind and the transcript's length
];

/**
 * Ferni's own words (TTS chunks, the greeting, what it says): not caller text,
 * though they can repeat it. The call reviewer reads them (E2E_TTS_OUTPUT), so
 * they wait on the same decision as E2E_USER_INPUT (#2656). Listed by exact
 * source text so caller text beside them is still caught.
 */
const AGENT_WORDS: Array<[file: string, prefix: string]> = [
  ['tts-wrapper.ts', 'chunk.slice('],
  ['tts-wrapper.ts', 'fallback.slice('],
  ['tts-wrapper.ts', 'jsonLeakBuffer.slice('],
  ['tts-wrapper.ts', 'ttsOutputBuffer.slice('],
  ['orchestrator.ts', 'textToSpeak'],
  ['orchestrator.ts', 'greeting.slice('],
  ['transcript-handler.ts', 'cached.response.slice('],
  ['agent-setup.ts', 'text.slice(0'], // say(): textPreview
  ['agent-setup.ts', 'evt.text?.slice('], // AGENT SPEECH, TEXT DONE (DEBUG_GEMINI_ALL)
];

/** The arguments of one logger call starting at `at`, through its closing paren. */
function argsAt(src: string, at: number): string {
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(at, i + 1);
  }
  return src.slice(at);
}

/** Interpolations, object values and shorthand keys: the expressions a call logs. */
function loggedValues(args: string): string[] {
  const out: string[] = [];
  for (const m of args.matchAll(/\$\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g)) out.push(m[1].trim());
  const objects = args.replace(/`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'/g, "''");
  for (const m of objects.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*(?::\s*([^,}]+))?(?=\s*[,}])/g)) {
    const value = (m[2] ?? m[1]).trim();
    out.push(value);
    // `transcript: cleaned` names what it carries in the key.
    if (m[2] && CONTENT.test(m[1]) && !CONTENT.test(value) && !SHAPE.test(value)) {
      out.push(`${m[1]}: ${value}`);
    }
  }
  return out;
}

function offences(path: string, src = readFileSync(path, 'utf8')): string[] {
  const found: string[] = [];
  for (const m of src.matchAll(CALL)) {
    const at = (m.index ?? 0) + m[0].length - 1;
    const args = argsAt(src, at);
    if (PENDING.some((p) => args.includes(p))) continue;
    const line = src.slice(0, m.index).split('\n').length;
    for (const value of loggedValues(args)) {
      if (
        NOT_CONTENT.some((ok) => (typeof ok === 'string' ? value.startsWith(ok) : ok.test(value)))
      )
        continue;
      if (AGENT_WORDS.some(([f, w]) => path.endsWith(f) && value.startsWith(w))) continue;
      if (SHAPE.test(value) || !CONTENT.test(value)) continue;
      found.push(`${path}:${line}: ${value.slice(0, 80)}`);
    }
    // A bare argument (`write(line)`, `log.info(text)`) hides what it carries.
    for (const value of bareArgs(args)) {
      if (!SHAPE.test(value) && !BARE_OK.includes(value))
        found.push(`${path}:${line}: written as-is: ${value.slice(0, 80)}`);
    }
  }
  return found;
}

describe('the call-start, on-behalf and call-result logs', () => {
  it.each(SURFACE)('%s logs no caller or contact content', (path) => {
    expect(offences(path)).toEqual([]);
  });

  // Each of these got past the name list this guard replaced (#2656).
  it.each([
    "log.info({ callId, contactName: request.resolvedContact?.name }, 'x');",
    'process.stderr.write(`[x] caller ${services.userProfile?.name}\\n`);',
    'process.stderr.write(`[x] ${services.userProfile?.preferredName}\\n`);',
    'process.stderr.write(`[x] meta ${ctx.job.metadata}\\n`);',
    "log.info({ facts: awareness.facts.join('; ') }, 'x');",
    'process.stderr.write(awareness.facts.join());',
    'process.stderr.write(line);',
    "log.info({ callId, message: enrichedMessage.message }, 'x');",
    "log.info({ callId, to: contact.phoneNumber }, 'x');",
    "diag.state('x', { transcript: cleaned });",
    "log().info({ transcript: t.slice(0, 50) }, 'x');",
    "turnLog.debug({ accent: userAccent }, 'x');",
  ])('the guard catches a planted leak: %s', (planted) => {
    expect(offences('planted.ts', planted)).not.toEqual([]);
  });
});
