/**
 * The lines call start writes about the caller (voice-agent-entry/index.ts,
 * handler-setup.ts, metadata-parser.ts): whether something is known, never
 * what it says. They go to stderr, so to Cloud Logging, past the safe
 * logger's redaction; the caller's name, their last conversation, a phone
 * number in a participant identity, a tool call's values and the dispatch's
 * reasons, scripts and contacts stay out.
 *
 * @module agents/voice-agent-entry/startup-log
 */
import type { generateDiagnostics } from '../../services/identity/identity-error-handler.js';

type Diagnostics = ReturnType<typeof generateDiagnostics>;
interface Profile {
  lastConversationSummary?: string;
  lastContact?: unknown;
}

/** The identity diagnostics block: yes or no, and counts. */
export function identityDiagnosticsText(
  userId: string | null | undefined,
  profile: Profile | null | undefined,
  diagnostics: Diagnostics
): string {
  return (
    `[voice-agent-entry] 🔍 IDENTITY DIAGNOSTICS:\n` +
    `  - userId: ${userId || 'MISSING!'}\n` +
    `  - userIdFormat: ${diagnostics.userIdFormat}\n` +
    `  - hasProfile: ${diagnostics.hasProfile ? 'YES' : 'NO!'}\n` +
    `  - hasName: ${diagnostics.hasName ? 'YES' : 'NO!'}\n` +
    `  - hasVoiceSketch: ${diagnostics.hasVoiceSketch ? 'YES (cross-device ready)' : 'NO'}\n` +
    `  - isReturningUser: ${diagnostics.isReturningUser}\n` +
    `  - totalConversations: ${diagnostics.totalConversations}\n` +
    `  - onboardingComplete: ${diagnostics.onboardingComplete}\n` +
    `  - lastConversationSummary: ${profile?.lastConversationSummary ? `YES (${profile.lastConversationSummary.length} chars)` : 'NO!'}\n` +
    `  - lastContact: ${profile?.lastContact || 'NEVER'}\n` +
    `  - issues: ${diagnostics.issues.length > 0 ? diagnostics.issues.join(', ') : 'NONE ✅'}\n`
  );
}

/** The identity diagnostics, written (index.ts). */
export function writeIdentityDiagnostics(
  userId: string | null | undefined,
  profile: Profile | null | undefined,
  diagnostics: Diagnostics
): void {
  process.stderr.write(identityDiagnosticsText(userId, profile, diagnostics));
}

/** The participant-ready line, written (index.ts): the participant's kind only. */
export function writeParticipantReady(source: string, identity: string): void {
  process.stderr.write(
    `[voice-agent-entry] 👤 Participant ready (${source}): ${participantKind(identity)}\n`
  );
}

/** One collected tool call (handler-setup.ts): its name and argument keys, never the values. */
export function toolCallText(call: { name: string; arguments?: unknown }, i: number, n: number) {
  return `\n📞 Call ${i + 1}/${n}:\n   Tool Name: ${call.name}\n   Arguments: ${argumentKeys(call.arguments)}\n`;
}

function argumentKeys(args: unknown): string {
  let parsed = args;
  if (typeof args === 'string') {
    try {
      parsed = JSON.parse(args);
    } catch {
      return `(${args.length} chars)`;
    }
  }
  if (!parsed || typeof parsed !== 'object') return '(none)';
  return `keys ${Object.keys(parsed).join(', ') || '(none)'}`;
}

/**
 * What the call reviewer reads from the job metadata (the launchd job's
 * ferni_logs.py matches `Raw job\.metadata = (\{.*\})`): only these keys,
 * only short plain values. Eval calls are told apart by user_id, the
 * persona by persona_id; nothing else of the dispatch is logged.
 */
export const REVIEWER_METADATA_KEYS = [
  'type',
  'persona_id',
  'source',
  'user_id',
  'firebase_uid',
  'timezone',
] as const;

/** The reviewer's metadata line (metadata-parser.ts), from the parsed job metadata. */
export function jobMetadataLine(metadata: Record<string, unknown> | undefined): string {
  if (!metadata) return 'Raw job.metadata = (empty)';
  const kept: Record<string, string | number | boolean> = {};
  for (const key of REVIEWER_METADATA_KEYS) {
    const v = metadata[key];
    if (typeof v === 'number' || typeof v === 'boolean') kept[key] = v;
    else if (typeof v === 'string' && v.length <= 128) kept[key] = v;
  }
  return `Raw job.metadata = ${JSON.stringify(kept)}`;
}

/** A participant as the participant line names it: its kind (sip, app…), never the rest. */
export function participantKind(identity: string): string {
  return /^([a-z]+)_/.exec(identity)?.[1] ?? 'other';
}

/** For raw stderr lines: an error's class and message cut at its first quote. */
export { errorText } from '../../utils/error-text.js';
