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
];

const CALL =
  /\b(?:log|logger|diag|console|getLogger\(\)|safeLog\(\))\.(?:info|warn|error|debug|trace|log|user|session)\s*\(|process\.std(?:err|out)\.write\s*\(/g;

/** What a logged value may not be: caller or contact content, or a slice of text. */
const CONTENT =
  /\b(?:userName|contactName|recipientName|callerName|metadataName|profileName|expectedName|confirmedName|matchedName|fromNames?|purpose|triggerReason|script|transcript|lastConversationSummary|summary|notes|objective|quote|payload|identity|arguments|city)\b|resolvedContact\??\.name|profile\??\.(?:name|preferredName)|\.slice\(|\.substring\(|JSON\.stringify\(/;

/** A value that says only whether, how many or how long. */
const SHAPE = /^Boolean\(|\.length\b|Object\.keys\(|\.size\b|\? '(?:yes|YES)'|^participantKind\(/;

/** Logged values that match CONTENT but aren't caller content, each with why. */
const NOT_CONTENT = [
  'JSON.stringify(summary.turnProfiling', // timing numbers, not a call summary
  'transcript.callId', // an id
  'JSON.stringify({\n        callSid: metadata.callSid', // inbound: a call id and a masked number (inbound-call-trust.test.ts)
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
    out.push((m[2] ?? m[1]).trim());
  }
  return out;
}

function offences(path: string): string[] {
  const src = readFileSync(path, 'utf8');
  const found: string[] = [];
  for (const m of src.matchAll(CALL)) {
    const at = (m.index ?? 0) + m[0].length - 1;
    for (const value of loggedValues(argsAt(src, at))) {
      if (NOT_CONTENT.some((ok) => value.startsWith(ok))) continue;
      if (SHAPE.test(value) || !CONTENT.test(value)) continue;
      const line = src.slice(0, m.index).split('\n').length;
      found.push(`${path}:${line}: ${value.slice(0, 80)}`);
    }
  }
  return found;
}

describe('the call-start, on-behalf and call-result logs', () => {
  it.each(SURFACE)('%s logs no caller or contact content', (path) => {
    expect(offences(path)).toEqual([]);
  });

  it('the guard sees a leak (a planted one is caught)', () => {
    const planted = "log.info({ callId, contactName: request.resolvedContact?.name }, 'x');";
    const args = argsAt(planted, planted.indexOf('('));
    expect(loggedValues(args).some((v) => CONTENT.test(v) && !SHAPE.test(v))).toBe(true);
  });
});
