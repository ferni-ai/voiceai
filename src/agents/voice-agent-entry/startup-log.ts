/**
 * The lines call start writes about the caller (voice-agent-entry/index.ts):
 * whether something is known, never what it says. They go to stderr, so to
 * Cloud Logging, past the safe logger's redaction; the caller's name, their
 * last conversation and a phone number in a participant identity stay out.
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

/** A participant as the participant line names it: its kind (sip, app…), never the rest. */
export function participantKind(identity: string): string {
  return /^([a-z]+)_/.exec(identity)?.[1] ?? 'other';
}
