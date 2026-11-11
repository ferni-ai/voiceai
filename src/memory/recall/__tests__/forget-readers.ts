/**
 * Every memory reader that can say a stored memory back, and whether it honours "forget that".
 *
 * forget.ts records what a caller asked Ferni to forget; each reader below either checks it on
 * every read (`always`), checks it only with FORGET_EVERY_READER=on (`flag`), or doesn't (`none`).
 * Rows that say `none` are today's leaks: each names the PR that wires it. A fix changes its row,
 * and the probes (forget-probe-*.test.ts) then expect zero surfaces from it.
 *
 * forget-readers-coverage.test.ts keeps this honest: every non-test file that touches a memory
 * store must be a reader here, in NOT_A_READER with a reason, or in UNCLASSIFIED, a list that may
 * only shrink. Tracking: https://github.com/ferni-ai/voiceai/issues/3682
 *
 * @module memory/recall/__tests__/forget-readers
 */

export type ForgetCheck = 'always' | 'flag' | 'none';
/** Who hears it: the model (prompt, greeting, tool result), the caller on the web, or a text/call out. */
export type Reach = 'prompt' | 'greeting' | 'tool' | 'web' | 'outbound' | 'third-party';
/** The PR that makes a `none` reader check, in the forget plan's order (outbound first). */
export type FixPr = 'PR2a' | 'PR2b' | 'PR2c';

export interface ForgetReader {
  id: string;
  file: string;
  /** Text at the read site, so a moved or deleted reader fails the coverage test. */
  site: string;
  reaches: Reach;
  check: ForgetCheck;
  /** For `none`: the PR that adds the check. */
  fix?: FixPr;
  /** The probe test that reads it with a forgotten topic seeded, when there is one yet. */
  probe?: string;
}

const PROBE_OUTBOUND = 'src/memory/recall/__tests__/forget-probe-outbound.test.ts';
const PROBE_PROMPT = 'src/memory/recall/__tests__/forget-probe-prompt.test.ts';
const EVERY_READER = 'src/memory/recall/__tests__/forget-every-reader.test.ts';

export const FORGET_READERS: readonly ForgetReader[] = [
  // ── Always checked ─────────────────────────────────────────────────────────
  {
    id: 'recall.snapshot',
    file: 'src/agents/multi-agent/recall-firestore-store.ts',
    site: 'snapshotTopics',
    reaches: 'prompt',
    check: 'always',
  },
  {
    id: 'recall.callSummaries',
    file: 'src/memory/recall/call-summaries.ts',
    site: 'isForgotten',
    reaches: 'prompt',
    check: 'always',
  },
  {
    id: 'recall.episodes',
    file: 'src/memory/recall/episodes.ts',
    site: 'isForgotten',
    reaches: 'prompt',
    check: 'always',
  },
  {
    id: 'vector.search',
    file: 'src/memory/firestore-vector-store/core.ts',
    site: 'withoutForgotten',
    reaches: 'prompt',
    check: 'always',
  },
  {
    id: 'tool.recallFromMemory',
    file: 'src/agents/shared/tool-executors/memory-executor.ts',
    site: 'recallfrommemory',
    reaches: 'tool',
    check: 'always',
  },
  {
    id: 'tool.recentContext',
    file: 'src/tools/domains/simple-utilities/essentials-tools.ts',
    site: 'forgottenFor',
    reaches: 'tool',
    check: 'always',
  },
  {
    id: 'profile.lastSummaryRefill',
    file: 'src/services/memory/last-call-summary.ts',
    site: 'checkedText',
    reaches: 'prompt',
    check: 'always',
  },
  {
    id: 'turn.revived',
    file: 'src/intelligence/revived/revived-intelligence.ts',
    site: 'rememberable',
    reaches: 'prompt',
    check: 'always',
  },
  {
    id: 'greeting.followThrough',
    file: 'src/services/follow-through/opener-pick.ts',
    site: 'orgot',
    reaches: 'greeting',
    check: 'always',
  },
  {
    id: 'prompt.callerCard',
    file: 'src/agents/multi-agent/caller-card/wiring.ts',
    site: 'forgottenAt',
    reaches: 'prompt',
    check: 'always',
  },
  {
    id: 'prompt.worldFacts',
    file: 'src/intelligence/world-model/temporal/in-call-load.ts',
    site: 'orgot',
    reaches: 'prompt',
    check: 'always',
  },
  {
    id: 'commitments.store',
    file: 'src/services/superhuman/commitment-store.ts',
    site: 'commitmentsShown',
    reaches: 'web',
    check: 'always',
  },
  {
    id: 'commitments.followUp',
    file: 'src/services/superhuman/commitment-follow-up.ts',
    site: 'shownRows',
    reaches: 'prompt',
    check: 'always',
  },
  {
    id: 'outbound.commitmentTriggers',
    file: 'src/services/outreach/proactive-channels/more-triggers.ts',
    site: 'shownRows',
    reaches: 'outbound',
    check: 'always',
  },
  {
    id: 'outbound.briefCommitments',
    file: 'src/services/outreach/morning-brief/default-deps.ts',
    site: 'forgottenTopicsOrNull',
    reaches: 'outbound',
    check: 'always',
  },
  {
    id: 'outbound.followUpTexts',
    file: 'src/services/outreach/follow-up-texts.ts',
    site: 'isForgotten',
    reaches: 'outbound',
    check: 'always',
  },
  {
    id: 'outbound.heldTexts',
    file: 'src/services/outreach/held-texts.ts',
    site: 'orgot',
    reaches: 'outbound',
    check: 'always',
  },
  {
    id: 'prompt.recentTexts',
    file: 'src/services/outreach/recent-texts.ts',
    site: 'forgottenWithin',
    reaches: 'prompt',
    check: 'always',
  },
  {
    id: 'web.known',
    file: 'src/intelligence/memory-view/known.ts',
    site: 'orgot',
    reaches: 'web',
    check: 'always',
  },
  {
    id: 'web.remembered',
    file: 'src/memory/recall/memory-control.ts',
    site: 'forgottenAt',
    reaches: 'web',
    check: 'always',
  },
  {
    id: 'web.promises',
    file: 'src/api/routes/promises.ts',
    site: 'orgot',
    reaches: 'web',
    check: 'always',
  },

  // ── Checked only with FORGET_EVERY_READER=on (off in prod) ─────────────────
  {
    id: 'prompt.profile',
    file: 'src/agents/multi-agent/setup-profile.ts',
    site: 'profileForPrompt',
    reaches: 'prompt',
    check: 'flag',
    probe: EVERY_READER,
  },
  {
    id: 'greeting.multiAgent',
    file: 'src/agents/multi-agent/greeting-direction.ts',
    site: 'callerHistory',
    reaches: 'greeting',
    check: 'flag',
    probe: EVERY_READER,
  },
  {
    id: 'prompt.singleAgentAwareness',
    file: 'src/agents/voice-agent-entry/user-awareness-injection.ts',
    site: 'profileForPrompt',
    reaches: 'prompt',
    check: 'flag',
    probe: EVERY_READER,
  },
  {
    id: 'handoff.summary',
    file: 'src/agents/multi-agent/agent-setup.ts',
    site: 'rememberedText',
    reaches: 'prompt',
    check: 'flag',
  },
  {
    id: 'tool.relationshipSummary',
    file: 'src/tools/domains/memory/tools.ts',
    site: 'profileForCaller',
    reaches: 'tool',
    check: 'flag',
    probe: EVERY_READER,
  },
  {
    id: 'prompt.hybridKeywordLegs',
    file: 'src/memory/retrieval/hybrid-search.ts',
    site: 'forgottenCheck',
    reaches: 'prompt',
    check: 'flag',
    probe: EVERY_READER,
  },
  {
    id: 'prompt.unifiedRecall',
    file: 'src/memory/unified-store/facade.ts',
    site: 'keepRemembered',
    reaches: 'prompt',
    check: 'flag',
    probe: EVERY_READER,
  },
  {
    id: 'prompt.entitySurfacing',
    file: 'src/memory/entity-store/integration.ts',
    site: 'keepRemembered',
    reaches: 'prompt',
    check: 'flag',
  },
  {
    id: 'prompt.recallNotesInChat',
    file: 'src/agents/personas/context-packet/turn-packet.ts',
    site: 'forgottenCheckNow',
    reaches: 'prompt',
    check: 'flag',
    probe: EVERY_READER,
  },

  // ── Not checked: PR2a, outbound and third-party first ──────────────────────
  {
    id: 'thirdParty.outreachTopics',
    file: 'src/tools/domains/communication/outreach/unified-outreach.ts',
    site: 'contact.topics',
    reaches: 'third-party',
    check: 'none',
    fix: 'PR2a',
    probe: PROBE_OUTBOUND,
  },
  {
    id: 'outbound.promiseTriggers',
    file: 'src/services/outreach/proactive-channels/triggers.ts',
    site: 'relatedTopic',
    reaches: 'outbound',
    check: 'none',
    fix: 'PR2a',
    probe: PROBE_OUTBOUND,
  },
  {
    id: 'outbound.reminderTriggers',
    file: 'src/services/outreach/proactive-channels/more-triggers.ts',
    site: 'I was meant to remind you',
    reaches: 'outbound',
    check: 'none',
    fix: 'PR2a',
    probe: PROBE_OUTBOUND,
  },
  {
    id: 'outbound.ponderedNotes',
    file: 'src/services/outreach/proactive-channels/pondered-triggers.ts',
    site: 'userLines',
    reaches: 'outbound',
    check: 'none',
    fix: 'PR2a',
  },
  {
    id: 'outbound.briefReminders',
    file: 'src/services/outreach/morning-brief/default-deps.ts',
    site: 'remindersDueToday',
    reaches: 'outbound',
    check: 'none',
    fix: 'PR2a',
    probe: PROBE_OUTBOUND,
  },
  {
    id: 'outbound.briefTasks',
    file: 'src/services/outreach/morning-brief/default-deps.ts',
    site: 'openTasks',
    reaches: 'outbound',
    check: 'none',
    fix: 'PR2a',
    probe: PROBE_OUTBOUND,
  },
  {
    id: 'greeting.singleAgent',
    file: 'src/agents/voice-agent/greeting-handler.ts',
    site: 'lastConversationSummary: services.userProfile',
    reaches: 'greeting',
    check: 'none',
    fix: 'PR2a',
    probe: PROBE_PROMPT,
  },
  {
    id: 'greeting.threadStarter',
    file: 'src/agents/voice-agent/greeting-proactive-context.ts',
    site: 'threadStarter',
    reaches: 'greeting',
    check: 'none',
    fix: 'PR2a',
  },
  {
    id: 'tool.getUserContext',
    file: 'src/tools/domains/awareness/index.ts',
    site: 'last_conversation',
    reaches: 'tool',
    check: 'none',
    fix: 'PR2a',
    probe: PROBE_PROMPT,
  },
  {
    id: 'prompt.taskWisdom',
    file: 'src/agents/processors/turn-processor/context-injections.ts',
    site: 'lastSummary: services.userProfile',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2a',
  },
  {
    id: 'prompt.taskWisdomBuilder',
    file: 'src/agents/processors/context-injection-builder.ts',
    site: 'lastSummary: services.userProfile',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2a',
  },
  {
    id: 'prompt.conversationRecap',
    file: 'src/intelligence/context-builders/session/conversation-recap.ts',
    site: 'lastConversationSummary',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2a',
  },
  {
    id: 'prompt.sharedContent',
    file: 'src/personas/shared/content-injector.ts',
    site: 'context.lastConversationSummary',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2a',
  },
  {
    id: 'prompt.crossSessionThreading',
    file: 'src/intelligence/context-builders/session/cross-session-threading.ts',
    site: 'getConversationStarter',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2a',
  },

  // ── Not checked: PR2b ──────────────────────────────────────────────────────
  {
    id: 'prompt.sessionPrimer',
    file: 'src/memory/orchestrator.ts',
    site: 'generatePrimingContext',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2b',
  },
  {
    id: 'prompt.recallTriggerGaps',
    file: 'src/intelligence/triggers/recall-trigger-engine.ts',
    site: 'entity',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2b',
  },
  {
    id: 'handoff.brief',
    file: 'src/agents/multi-agent/handoff-brief.ts',
    site: 'readConversation',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2b',
  },
  {
    id: 'handoff.trustContext',
    file: 'src/services/trust-systems/handoff-context.ts',
    site: 'export',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2b',
  },
  {
    id: 'prompt.predictive',
    file: 'src/intelligence/predictive/predictive-intelligence.ts',
    site: 'conversations',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2b',
  },
  {
    id: 'internal.trajectory',
    file: 'src/services/superhuman/life-trajectory-engine.ts',
    site: 'readCallSummaries',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2b',
  },
  {
    id: 'internal.crossDomain',
    file: 'src/services/superhuman/cross-domain-synthesis.ts',
    site: 'readCallSummaries',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2b',
  },
  {
    id: 'internal.deepAnalysis',
    file: 'src/api/scheduled-jobs/intelligence-jobs.ts',
    site: 'readCallSummaries',
    reaches: 'prompt',
    check: 'none',
    fix: 'PR2b',
  },

  // ── Not checked: PR2c ──────────────────────────────────────────────────────
  {
    id: 'web.conversations',
    file: 'src/api/routes/conversations.ts',
    site: 'highlights',
    reaches: 'web',
    check: 'none',
    fix: 'PR2c',
  },
  {
    id: 'web.threads',
    file: 'src/api/routes/conversation-threads.ts',
    site: "collection('conversation_threads')",
    reaches: 'web',
    check: 'none',
    fix: 'PR2c',
  },
  {
    id: 'web.voiceAuthMemory',
    file: 'src/api/voice-auth/memory-routes.ts',
    site: 'export',
    reaches: 'web',
    check: 'none',
    fix: 'PR2c',
  },
  {
    id: 'web.yearInReview',
    file: 'src/api/year-in-review-routes.ts',
    site: "collection('summaries')",
    reaches: 'web',
    check: 'none',
    fix: 'PR2c',
  },
  {
    id: 'web.creativeYou',
    file: 'src/services/creative-you/better-than-human-memory.ts',
    site: "collection('summaries')",
    reaches: 'web',
    check: 'none',
    fix: 'PR2c',
  },
  {
    id: 'sms.threadTurns',
    file: 'src/services/conversation-thread/thread-manager.ts',
    site: 'buildAgentContext',
    reaches: 'outbound',
    check: 'none',
    fix: 'PR2c',
  },
];

/** Files that touch a memory store but say nothing back from it, and why. */
export const NOT_A_READER: Readonly<Record<string, string>> = {
  'src/agents/multi-agent/greeting-topic-once.ts': 'comment only',
  'src/agents/multi-agent/turn-intelligence.ts': 'wires revived-intelligence (turn.revived)',
  'src/agents/voice-agent-entry/startup-log.ts': 'logs whether a summary exists, and its length',
  'src/agents/voice-agent/phases/user-awareness.ts':
    'formats the profile user-awareness-injection scrubs (prompt.singleAgentAwareness)',
  'src/agents/shared/tool-executors/scheduling-executor.ts':
    "writes this turn's purpose into a call context",
  'src/api/health/data-integrity.ts': 'counts documents',
  'src/api/routes/known-action-store.ts': 'writes forget and dispute actions',
  'src/api/routes/known-store.ts': 'store behind web.known',
  'src/context/types.ts': 'type',
  'src/types/user-profile.ts': 'type',
  'src/types/migration/profile-migrator.ts': 'migrates profile shape',
  'src/intelligence/user-learning-engine/engine.ts': 'writes the profile summary',
  'src/intelligence/pondering/ponder-user.ts': 'writes pondered items, checking forget at write',
  'src/intelligence/revived/revived-builders.ts': 'uses the summary only to avoid repeating it',
  'src/intelligence/memory-intelligence/core.ts':
    'calls UnifiedStore.recall (prompt.unifiedRecall)',
  'src/intelligence/world-model/temporal/store.ts': 'store behind prompt.worldFacts',
  'src/memory/dynamic/deep-extraction-worker.ts': 'writer',
  'src/memory/facts/facts-store.ts': 'store; forgottenAt filtered on read',
  'src/memory/index.ts': 'comment only',
  'src/memory/unified-store/index.ts': 'comment only',
  'src/memory/recall/forget.ts': 'forget itself',
  'src/memory/retrieval/bm25-search.ts': 'keyword leg read through prompt.hybridKeywordLegs',
  'src/memory/signals/user-memory-indexer.ts': 'indexer; checks forget before indexing',
  'src/memory/spanner-graph/fact-sync-ops.ts': 'graph sync; skips forgotten facts',
  'src/memory/storage/call-summaries.ts': 'store behind recall.callSummaries',
  'src/memory/storage/episode-store.ts': 'store behind recall.episodes',
  'src/memory/storage/dispute-store.ts': 'writes disputes',
  'src/memory/storage/memory-control-store.ts': 'store behind web.remembered',
  'src/memory/storage/remembered-fact-store.ts': 'writer',
  'src/memory/storage/revived-store.ts': 'store behind turn.revived',
  'src/memory/storage/supersession-store.ts': 'internal supersession job',
  'src/memory/storage/sweep-store.ts': 'internal sweep job',
  'src/memory/storage/lifecycle-integration.ts': 'writes memories and their vectors',
  'src/scripts/query-threads.ts': 'developer script',
  'src/services/session/last-mood-note.ts': 'comment only',
  'src/services/session/last-summary.ts': 'writes the last summary, checking forget',
  'src/services/session/session-manager.ts':
    'loads the profile; refills go through profile.lastSummaryRefill',
  'src/services/memory/realtime-memory.ts':
    'store behind profile.lastSummaryRefill and web.voiceAuthMemory',
  'src/services/stores/follow-through-sources.ts': 'imports commitments, checking forget',
  'src/services/stores/person-model-store.ts':
    'call sheet store; its prompt reader is new (call-sheet)',
  'src/services/superhuman/after-call-commitments.ts': 'writes commitments, checking forget',
  'src/services/superhuman/judged-commitments.ts': 'writes judged commitments, checking forget',
  'src/services/superhuman/wins.ts': 'writes wins, checking forget',
  'src/tasks/scheduled/memory-jobs.ts': 'internal maintenance',
  'src/tasks/scheduled/transcript-cleanup-job.ts': 'deletes old transcripts',
  'src/workers/summarization-worker.ts': 'writes summaries',
  'src/memory/entity-store/person-phone.ts': 'resolves a contact the caller names this turn',
  'src/conversation/proactive-starters.ts':
    'renders the profile greeting-handler passes (greeting.singleAgent)',
  'src/personas/greetings.ts': 'renders the profile greeting-handler passes (greeting.singleAgent)',
  'src/intelligence/context-builders/engagement/shared-content.ts':
    'passes the profile to content-injector (prompt.sharedContent)',
};

/**
 * Files that touch a memory store and are not yet traced: reader or not, live or not. Triaged in
 * PR2b/PR2c; the list may only shrink (forget-readers-coverage.test.ts).
 */
export const UNCLASSIFIED: readonly string[] = [
  'src/agents/personas/friend-repair-store.ts',
  'src/agents/personas/life-ledger.ts',
  'src/agents/shared/tool-executors/legacy-fallback-executor.ts',
  'src/api/reply-reports/reply-report-lookup.ts',
  'src/api/scheduled-jobs/superhuman-jobs.ts',
  'src/api/superhuman-metrics-routes.ts',
  'src/context/context-builders.ts',
  'src/context/context-manager.class.ts',
  'src/intelligence/context-builders/memory/dynamic-memory-context.ts',
  'src/intelligence/core/context-service.ts',
  'src/intelligence/surfacing/proactive-surfacing-engine.ts',
  'src/memory/operations/memory-lifecycle.ts',
  'src/memory/storage/conversation-days.ts',
  'src/memory/storage/firestore-store.ts',
  'src/memory/storage/summary-joke-retention.ts',
  'src/personas/shared/welcome-back.ts',
  'src/services/data-layer/name-sync.ts',
  'src/services/intelligence/ferni-awareness.ts',
  'src/services/journal/index.ts',
  'src/services/outreach/context-aggregator.ts',
  'src/services/outreach/conversational-calls.ts',
  'src/services/outreach/engagement/personalization-engine.ts',
  'src/services/outreach/engagement/voice-adapter.ts',
  'src/services/outreach/message-enrichment.ts',
  'src/services/outreach/proactive-call-scheduler.ts',
  'src/services/outreach/semantic-message-system.ts',
  'src/services/persona/profile-personalizer.ts',
  'src/services/superhuman/commitment-keeper.ts',
  'src/services/superhuman/insight-generation/generators/persona-voiced-observations.ts',
  'src/services/superhuman/semantic-intelligence/ferni-commitments.ts',
  'src/services/superhuman/semantic-intelligence/promise-keeper.ts',
  'src/services/superhuman/unified-user-knowledge.ts',
  'src/services/trust-systems/commitment-follow-through.ts',
  'src/services/trust-systems/commitment-tracking.ts',
  'src/services/trust-systems/together-store.ts',
  'src/tools/domains/referral/voice-referral.ts',
];

/**
 * What marks a file as touching a memory store: a direct collection read or the profile's
 * last-summary fields. A file that reads through a store module is caught at that module.
 */
export const STORE_SIGNATURE = new RegExp(
  [
    `collection\\(['"](?:summaries|conversation_summaries|conversation_threads|memories|unified_memories|dynamic_facts|extracted_facts|facts|world_facts|commitments|ferni_commitments|turns|person_model|entity_store|dynamic_entities|follow_ups|vectors)['"]\\)`,
    'lastConversationSummary',
    'lastCallerSummary',
    'readCallSummaries\\(',
    'getUnifiedStore\\(',
  ].join('|')
);
