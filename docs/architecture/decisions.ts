/**
 * Decision registry: each domain decision Ferni makes, the one module that should make
 * it, and the fingerprints of someone making it somewhere else.
 *
 * The 2026-10-23 code-health audit (voiceai-evidence/code-health-2026-10-23/ddd.md §2)
 * found these decisions computed in several places each, with different thresholds
 * and vocabularies: 12 crisis deciders, 4 voice resolvers, 14 quiet-hours predicates,
 * 7 forget checkers, 3 tool caps. The decision gate
 * (apps/cli/src/commands/quality/decision-gate.ts) counts fingerprint hits outside each
 * owner, per file, against decision-baseline.generated.json: today's hits are
 * grandfathered, a new one fails.
 *
 * Every owner is PROVISIONAL: today's best existing module, not the target. When the
 * target owner lands (ddd.md §5: `judgment/risk`, `identity.voiceFor`, `agency.tooling`,
 * `platform/telephony`), move `owner` and `ownerPaths` here in the same PR.
 *
 * A fingerprint hit is a line of production code under src/ (tests and comment-only
 * lines excluded) that matches `pattern`, in a file outside `ownerPaths` (and, when
 * `onlyIn` is set, only in files whose text matches it).
 *
 * @module docs/architecture/decisions
 */

export interface Fingerprint {
  /** Short name, shown when it fires. */
  readonly name: string;
  readonly pattern: RegExp;
  /** Only files whose whole text matches this count (e.g. Twilio, not Anthropic, messages.create). */
  readonly onlyIn?: RegExp;
}

export interface DomainDecision {
  readonly id: string;
  /** The question, as a caller would ask it. */
  readonly question: string;
  readonly owner: { readonly module: string; readonly fn: string; readonly provisional: boolean };
  /** Path prefixes where the decision's vocabulary is expected (the owner's own files). */
  readonly ownerPaths: readonly string[];
  /** Where the audit proposes the owner should end up. */
  readonly target: string;
  readonly fingerprints: readonly Fingerprint[];
}

export const DECISIONS: readonly DomainDecision[] = [
  {
    id: 'crisis-risk',
    question: 'Is this turn a crisis, and how acute?',
    owner: { module: 'src/services/safety/crisis-guard.ts', fn: 'detectCrisis', provisional: true },
    ownerPaths: ['src/services/safety/'],
    target: 'judgment/risk assessRisk(TurnFacts): RiskAssessment (ddd.md 2.1, S3)',
    fingerprints: [
      { name: 'crisis vocabulary', pattern: /suicid|self[- ]?harm|\b988\b|kill(?:ing)? (?:my|him|her)self/i },
    ],
  },
  {
    id: 'persona-voice',
    question: 'Which voice does persona X use?',
    owner: { module: 'src/config/voice-ids.ts', fn: 'getVoiceIdForPersona', provisional: true },
    ownerPaths: ['src/config/voice-ids.ts'],
    target: 'identity.voiceFor(personaId, opts): VoiceProfile (ddd.md 2.3, S6)',
    fingerprints: [{ name: 'voice id env name', pattern: /\b[A-Z][A-Z0-9_]*_VOICE_ID\b/ }],
  },
  {
    id: 'spoken-reply',
    question: 'What did Ferni actually say?',
    owner: { module: 'src/agents/voice-agent/agent-reply-recorder.ts', fn: 'recordCommittedAgentReply', provisional: true },
    ownerPaths: ['src/agents/voice-agent/agent-reply-recorder.ts', 'src/agents/voice-agent/assistant-transcript.ts'],
    target: 'expression emits SpokenReply; memory and relationship consume it (ddd.md 2.4, S2)',
    fingerprints: [
      { name: 'assistant turn written', pattern: /role:\s*['"]assistant['"]/ },
      { name: 'last reply assigned', pattern: /\blastAgentResponse\s*=(?!=)/ },
    ],
  },
  {
    id: 'minor-status',
    question: 'Is the caller a minor?',
    owner: { module: 'src/utils/minor-care.ts', fn: 'statesUnder18', provisional: true },
    ownerPaths: ['src/utils/minor-care.ts'],
    target: 'identity/member AgeStatus + a judgment minorGuard (ddd.md 2.2, S5)',
    fingerprints: [{ name: 'age threshold', pattern: /\bunder[ -]?(?:18|eighteen)\b|\bCOPPA\b|\bisMinor\b/i }],
  },
  {
    id: 'tool-grant',
    question: 'What tools can this caller use?',
    owner: { module: 'src/config/tool-config.ts', fn: 'capToolsToLimit', provisional: true },
    ownerPaths: ['src/config/tool-config.ts'],
    target: 'agency.tooling grantFor(caller, channel, verdict): ToolGrant (ddd.md 2.5)',
    fingerprints: [
      { name: 'tool cap', pattern: /function\s+(?:cap|limit|trim)\w*Tools\b/ },
      { name: 'tool allowlist', pattern: /\b[A-Z_]*(?:SAFE|ALLOWED|ALLOW|SELF_SERVICE|PERMITTED)_TOOLS?\b\s*(?::[^=]+)?=/ },
    ],
  },
  {
    id: 'memory-injection',
    question: 'What memories may be injected (and has the caller said forget that)?',
    owner: { module: 'src/memory/recall/session-recall.ts', fn: 'isForgotten', provisional: true },
    ownerPaths: ['src/memory/recall/'],
    target: 'memory selects MemoryCandidates; one admit(candidate, scope) runs last (ddd.md 2.6, S9)',
    fingerprints: [
      {
        name: 'forget checker',
        pattern: /(?:function|const)\s+(?:is\w*Forgotten\w*|\w*[Ff]orgotten\w*Filter|\w*[Ff]orget\w*Guard)\b/,
      },
    ],
  },
  {
    id: 'contact-permission',
    question: 'May Ferni contact this person now (consent, quiet hours, crisis quiet period)?',
    owner: { module: 'src/services/messaging/policy.ts', fn: 'decide', provisional: true },
    ownerPaths: ['src/services/messaging/'],
    target: 'messaging/policy decide(intent, ctx), wired behind every sender (ddd.md 2.7, P11)',
    fingerprints: [
      { name: 'quiet window', pattern: /(?:function|const|let)\s+\w*[Qq]uiet\w*\s*[=(]|\bQUIET_[A-Z_]+\s*[=:]/ },
    ],
  },
  {
    id: 'sms-send',
    question: 'Who calls Twilio to send a text?',
    owner: { module: 'src/services/external-apis/twilio-sms.ts', fn: 'sendSMS', provisional: true },
    ownerPaths: ['src/services/external-apis/twilio-sms.ts'],
    target: 'platform/telephony, the only Twilio caller; senders submit an Intent (ddd.md 2.7)',
    fingerprints: [{ name: 'twilio messages.create', pattern: /\.messages\.create\(/, onlyIn: /twilio/i }],
  },
];
