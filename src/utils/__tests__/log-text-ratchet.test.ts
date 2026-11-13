/**
 * #2689 / #3215 ratchet: no log call carries conversation text or a memory record's
 * words. log-text-shapes.ts says which calls do: a slice of text, a content key, a
 * text value under any key or interpolated, and a memory record's words (a goal's
 * title, a commitment's description, an entity's name). Log `.length`, a count or an
 * id instead. Ids (`userId.slice(0, 8)`) and error text stay allowed.
 *
 * It reads logger calls with call-log-surface-guard's reader (log-guard.ts), over
 * every production file. ALLOWED lists reviewed calls per file; PENDING_3215B lists
 * the calls PR (b) of #3215 fixes, each by what it logs. A new call fails, and so
 * does a count that drops or a pending call that is gone (remove it here).
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';
import { type Leak, textLeaksInLogs } from './log-text-shapes.js';

const ROOT = join(__dirname, '..', '..', '..');
const SKIP_DIR = /^(__tests__|__mocks__|node_modules|tests|cli)$/;
const SKIP_FILE = /\.(test|spec)\.ts$|\.d\.ts$/;

/** Reviewed calls per file. Each group says why its calls may stay. */
const PENDING_2656: Record<string, number> = {
  // Held as pending Seth's call in call-log-surface-guard.test.ts EXEMPT (#2656): the call
  // reviewer reads what the caller said (E2E_USER_INPUT) and Ferni's words (E2E_TTS_OUTPUT).
  'src/agents/integrations/better-than-human-integration.ts': 1, // resonance transcript (#2663)
  'src/agents/multi-agent/agent-setup.ts': 3, // AGENT SPEECH, TEXT DONE, say() textPreview
  'src/agents/multi-agent/orchestrator.ts': 6, // greeting x4 and goodbye x2 previews
  'src/agents/shared/tts-wrapper.ts': 5, // LLM chunk x2, first-chunk x2, E2E_TTS_OUTPUT ttsText
  'src/agents/voice-agent/transcript-handler.ts': 3, // E2E_USER_INPUT, cached response x2
};
const FERNI_SPOKEN_TEXT: Record<string, number> = {
  // Ferni's own spoken text, logged whole by the TTS and audio paths: the same pending call
  // as E2E_TTS_OUTPUT (#2656). Not changed here; lower these when it is decided.
  'src/agents/integrations/live-backchanneling-integration.ts': 1,
  'src/agents/integrations/slow-turn-sound.ts': 1,
  'src/agents/integrations/turn-opening-sound.ts': 2,
  'src/agents/shared/greeting-audio-cache.ts': 2,
  'src/agents/shared/performance/cache-aware-tts.ts': 2,
  'src/agents/shared/sanitizer/index.ts': 1,
  'src/agents/shared/voiced-take-render.ts': 2,
  'src/audio/dj-speech-engine.ts': 1,
  'src/audio/music-humanization.ts': 1,
  'src/personas/bundles/ferni/llm-expression-generator.ts': 1,
  'src/services/performance/speculative-tts.ts': 1,
  'src/speech/coordination/coordinated-tool-executor.ts': 1,
  'src/speech/coordination/speech-coordinator.ts': 1,
  'src/speech/tts-gateway/gateway-tts-node.ts': 9,
  'src/speech/tts-gateway/gateway.ts': 4,
  'src/speech/tts-gateway/index.ts': 2,
};
const NOT_ANYONES_WORDS: Record<string, number> = {
  'src/tools/domains/marketing/content-generator.ts': 1, // LLM marketing copy that failed to parse
  'src/services/performance/performance-metrics.ts': 1, // contextInjections: builder timings
  'src/services/experiments/hypothesis-generator.ts': 1, // marketing variant copy
  'src/services/landing-intelligence/variant-generator.ts': 1, // marketing CTA copy
  'src/config/gemini-config.ts': 1, // a fixed test prompt
  'src/speech/tts-gateway/providers/cartesia.ts': 1, // HTTP statusText
  'src/agents/shared/e2e-latency-tracker.ts': 1, // timeSinceUserSpeech: ms
  'src/agents/shared/performance/reply-audio-stage.ts': 1, // speech: a sample rate
  'src/agents/voice-agent/turn-handler.ts': 1, // hasGrowthReflection: a boolean
  'src/audio/music-transition-analytics.ts': 1, // timeToSpeech: ms
  // #3215: the wider shapes also match these. None holds anything a caller said or a record of it.
  'src/agents/session/event-cleanup-registry.ts': 1, // a cleanup handler's label, set in code
  'src/agents/shared/conversation-priming.ts': 1, // the fixed label of a synthetic priming turn
  'src/agents/shared/disconnect-diagnostics.ts': 1, // the fixed text for a disconnect reason
  'src/agents/integrations/unified-intelligence-integration.ts': 1, // milestone catalog title ('One Week')
  'src/services/superhuman/relationship-milestones.ts': 1, // the same milestone catalog
  'src/api/monetization-routes.ts': 1, // a JOURNEY_MILESTONES catalog title
  'src/api/scheduled-jobs/brand-jobs.ts': 1, // a company brand milestone, not a user's
  'src/intelligence/context-builders/humanization/humanizing-debug.ts': 1, // stage and mood enums
  'src/intelligence/context-builders/personas/physical-presence.ts': 1, // a persona's stage direction
  'src/services/custom-agent/voice-clone-service.ts': 1, // clip.speech: seconds of audio
  'src/services/data-layer/index.ts': 1, // context.summary: counts and totals
  'src/services/data-layer/session-integration.ts': 1, // the same counts
  // #3724: the topic shape also matches these, which are no one's words
  'src/services/pubsub/pubsub-workers.ts': 1, // Pub/Sub topic names, set in code
  'src/services/gtm/content-generator.ts': 1, // a GTM marketing brief's topic
};
/**
 * #3215 PR (b) fixes these and then deletes this list: memory-record words and caller text
 * logged whole, each listed by what it logs (log-text-shapes' Leak.what), not by line, so
 * edits elsewhere in a file don't move it. Never move one of these to NOT_ANYONES_WORDS.
 */
const PENDING_3215B: Record<string, string[]> = {
  'src/agents/processors/injection-builders/safety-coaching-builders.ts': [
    'goal: coachingAnalysis.goalText',
  ],
  'src/agents/processors/injection-builders/trust-builders.ts': [
    'description: trustContext.celebrationOpportunity.win.description',
    'topic: vuln.topic',
  ],
  'src/agents/processors/turn-processor/process-turn.ts': ['topic: reflectionMoment.topic'],
  'src/api/habit-routes.ts': ['name: habit.name'],
  'src/conversation/curiosity-engine.ts': ['detail: detail.content'],
  'src/conversation/superhuman/story-continuity.ts': ['name: person.name'],
  'src/diagnostics/memory-pipeline-diagnostics.ts': [
    'summary: moment.summary',
    'topics: analysis.topics',
  ],
  'src/intelligence/coaching/dynamic-questions.ts': ['context.recentTopics.slice('],
  'src/intelligence/collective/agent-evolution.ts': ['trigger: adjustment.trigger.description'],
  'src/intelligence/context-builders/memory/memory-enhancement.ts': [
    'topic: thinkingMoment.record.topic',
    'name: followUp.mention.name',
    'topic: tonalInsight.topic',
    'topic: growthMoment.record.topic',
  ],
  'src/intelligence/context-builders/memory/thinking-of-you.ts': [
    'topic: thinkingMoment.record.topic',
    'topic: callback.topic',
  ],
  'src/intelligence/context-builders/session/cross-session-reflection.ts': [
    'topic: newMoment.topic',
  ],
  'src/intelligence/context-builders/superhuman/conversational-superpowers.ts': [
    'person: person.name',
    'person: followUp.person.name',
  ],
  'src/intelligence/data-capture/index.ts': [
    'name: contact.name || contact.relationship',
    'name: contact.name',
    'name: contact.name',
    'name: contact.name',
  ],
  'src/intelligence/deep-understanding/life-rhythm.ts': ['description: anniversary.description'],
  'src/intelligence/deep-understanding/relationships.ts': [
    'personName: person.name',
    'personName: mentionedPerson.name',
  ],
  'src/intelligence/tracking/cross-session.ts': ['topic: thread.topic', 'topic: thread.topic'],
  'src/intelligence/triggers/temporal-pattern-detector.ts': [
    'nearDate: result.nearSignificantDate?.description',
  ],
  'src/intelligence/triggers/voice-agent-integration.ts': [
    'nearSignificantDate: temporalBoost.nearSignificantDate?.description',
  ],
  'src/intelligence/user-learning-engine/engine.ts': ['summary: moment.summary'],
  'src/memory/dynamic/fast-capture.ts': [
    'entities: mentionedEntities.map((e) => e.name).slice(0, 5)',
  ],
  'src/memory/dynamic/stm-promotion.ts': ['entity: entity.name'],
  'src/memory/entity-store/entity-resolver.ts': [
    'input: nameOrText',
    'name: newEntity.canonicalName',
  ],
  'src/memory/knowledge-graph/services/knowledge-capture.ts': [
    'entityNames: entityExtractionResult.entities.map((e) => e.name).slice(0, 5)',
  ],
  'src/memory/knowledge-graph/storage/thread-store.ts': ['topic: thread.topic'],
  'src/memory/spanner-graph/client.ts': ['name: entity.name'],
  'src/personas/bundles/ferni/superhuman-memory-integration.ts': ['topic: insight.topic'],
  'src/services/coaching/goal-tracking.ts': [
    'title: goal.title',
    'title: goal.title',
    'title: milestone.title',
  ],
  'src/services/concierge/outreach/phone-caller.ts': ['summary: result.summary'],
  'src/services/contacts/personalized-outreach.ts': ['contactName: context.contact.name'],
  'src/services/creative-you/intelligent-curator.ts': ['this.userContext.recentTopics.slice('],
  'src/services/goal-outreach-integration.ts': ['title: goal.title'],
  'src/services/identity/google-calendar-oauth.ts': ['summary: event.summary'],
  'src/services/outreach/context-aggregator.ts': [
    'description: win.description',
    'description: struggle.description',
    'topics: conversation.topics',
  ],
  'src/services/outreach/conversation-extractor.ts': [
    'event: event.description',
    'extraction.topics.slice(',
    'milestone: milestone.description',
    'progress: milestone.description',
    'anniversary: milestone.description',
    'count: milestone.description',
  ],
  'src/services/outreach/superhuman-outreach-bridge.ts': [
    'commitment: commitment.summary',
    'commitment: commitment.summary',
    'topic: insight.topic',
    'commitment: commitment.summary',
    'topic: roundtable.topic',
  ],
  'src/services/outreach/superhuman-outreach-integration.ts': ['struggle: memory.content'],
  'src/services/outreach/timing-intelligence.ts': [
    'rule: rule.description',
    'period: period.description',
    'event: event.description',
  ],
  'src/services/persona/per-persona-relationship.ts': ['data?.frequentTopics.slice('],
  'src/services/stores/life-data-store.ts': ['name: milestone.name', 'title: goal.title'],
  'src/services/superhuman/commitment-calendar-integration.ts': ['commitment: commitment.text'],
  'src/services/superhuman/commitment-keeper.ts': [
    'commitment: commitment.summary',
    'summary: commitment.summary',
  ],
  'src/services/superhuman/relationship-network.ts': ['personName: newPerson.name'],
  'src/services/superhuman/semantic-intelligence/relationship-graph.ts': ['person: person.name'],
  'src/services/trust-systems/small-wins.ts': ['intention: intentionText'],
  'src/tools/domains/communication/outreach/multi-outreach.ts': [
    'contact: contact.name',
    'contact: contact.name',
  ],
  'src/tools/domains/communication/outreach/unified-outreach.ts': [
    'contactName: contact.name',
    'contactName: contact.name',
  ],
  'src/tools/domains/habits/habits.ts': ['name: habit.name'],
  'src/tools/domains/information/relationships/storage.ts': [
    'name: relationship.name',
    'description: date.description',
  ],
  'src/tools/domains/life-planning/milestone-proactive.ts': ['milestone: milestone.name'],
  'src/tools/domains/research/superhuman-tools/predictive-modeling.ts': [
    'goal: goal.name',
    'habit: habit.name',
  ],
  'src/tools/domains/research/user-data/user-data-service.ts': [
    'goalName: goal.name',
    'topic: gap.topic',
    'topic: gap.topic',
  ],
  // #3724: the topic, canonicalName and bound-name shapes found these as well
  'src/agents/group-conversation/group-conversation-manager.ts': ['topic: config.topic'],
  'src/agents/group-conversation/team-roundtable.ts': ['topic: config.roundtable.topic'],
  'src/agents/group-conversation/voice-integration.ts': ['topic: message.topic'],
  'src/agents/processors/injection-builders/better-than-human-builders.ts': [
    'topic: boundary.topic',
  ],
  'src/agents/voice-agent/turn-learning.ts': ['topic: learningContext.topic'],
  'src/conversation/emotional-arc/momentum/tracker.ts': ['topic: turningPoint.topic'],
  'src/intelligence/collective/community-insights.ts': ['context: signal.context.topic'],
  'src/intelligence/context-builders/awareness/career-awareness.ts': [
    'topics: careerDetection.topics',
  ],
  'src/intelligence/context-builders/coaching/topic-guidance.ts': [
    'topic: bestMatch.trigger.topic',
  ],
  'src/intelligence/context-builders/personas/jordan-milestone-insights/index.ts': [
    'handoffTopic: handoffBriefing?.topic',
  ],
  'src/intelligence/context-builders/personas/mortality-perspective.ts': ['topic: relevance.topic'],
  'src/intelligence/context-builders/personas/peter-research-insights/index.ts': [
    'handoffTopic: handoffBriefing?.topic',
  ],
  'src/intelligence/context-builders/session/natural-discovery.ts': [
    'topics: prompts.map((p) => p.topic)',
  ],
  'src/intelligence/predictive/conversation-preparation.ts': ['topic: entry.topic'],
  'src/intelligence/predictive/embeddings/breakthrough-embeddings.ts': [
    'topic: breakthrough.topic',
  ],
  'src/intelligence/predictive/embeddings/entity-embedding-sync.ts': [
    'entityName: entity.canonicalName',
    'entityName: entity.canonicalName',
  ],
  'src/intelligence/predictive/index.ts': ['topic: params.topic'],
  'src/intelligence/predictive/signal-integration.ts': ['topic: breakthrough.topic'],
  'src/memory/entity-store/integration.ts': ['name: resolved.entity.canonicalName'],
  'src/memory/entity-store/migration.ts': ['name: entityData.canonicalName'],
  'src/memory/entity-store/storage.ts': ['name: fullEntity.canonicalName'],
  'src/memory/operations/memory-lifecycle.ts': ['topic: consolidated.topic'],
  'src/personas/bundles/runtime.ts': ['context: context.topic'],
  'src/services/conversation-thread/group-outreach.ts': ['topic: options.topic'],
  'src/services/data-layer/integrations/trust-integration.ts': [
    'topic: boundary.topic',
    'topic: thinking.topic',
  ],
  'src/services/handoff/handoff-state.ts': ['topics: state.conversationContext.topics'],
  'src/services/humanization/relationship-artifacts.ts': ['topic: bt.topic'],
  'src/services/intelligence/cross-agent-awareness.ts': ['topics: summary.topics'],
  'src/services/memory/voice-conversation-memory.ts': ['topics: conversation.topics'],
  'src/services/personal-journey/seasonal-memory.ts': ['topics: data.topics'],
  'src/services/superhuman/protective-silence.ts': ['topic: boundary.topic'],
  'src/services/trust-systems/between-session-thinking.ts': ['topic: record.topic'],
  'src/services/trust-systems/thinking-of-you.ts': ['topic: share.topic'],
  'src/tools/domains/communication/superhuman-tools/unsaid-words-detector.ts': [
    'topic: topic.topic',
  ],
  'src/tools/domains/research/superhuman-tools/external-data.ts': ['topic: params.topic'],
  'src/tools/domains/research/superhuman-tools/research-synthesis.ts': ['topic: params.topic'],
  'src/workers/analytics-worker.ts': ['topic: data.topic'],
};
const ALLOWED: Record<string, number> = {
  ...PENDING_2656,
  ...FERNI_SPOKEN_TEXT,
  ...NOT_ANYONES_WORDS,
};

function productionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIR.test(entry.name)) productionFiles(join(dir, entry.name), out);
    } else if (entry.name.endsWith('.ts') && !SKIP_FILE.test(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

/**
 * What the ratchet reports for `found` (every leaking call, per file): a call no list
 * covers, a per-file count that dropped, and a pending call that is no longer there.
 */
export function unreviewed(
  found: Record<string, Leak[]>,
  allowed: Record<string, number>,
  pending: Record<string, string[]>
): string[] {
  const out: string[] = [];
  for (const [rel, leaks] of Object.entries(found)) {
    const waiting = [...(pending[rel] ?? [])];
    const rest = leaks.filter((leak) => {
      const at = waiting.indexOf(leak.what);
      if (at === -1) return true;
      waiting.splice(at, 1);
      return false;
    });
    out.push(...waiting.map((what) => `${rel}: '${what}' is gone, remove it from PENDING_3215B`));
    if (rest.length !== (allowed[rel] ?? 0)) {
      out.push(...rest.map((leak) => `${rel}:${leak.line} ${leak.what}`));
    }
  }
  for (const rel of Object.keys(allowed)) {
    if (!found[rel]?.length) out.push(`${rel}: prune from ALLOWED`);
  }
  for (const [rel, whats] of Object.entries(pending)) {
    if (!found[rel]?.length)
      out.push(...whats.map((w) => `${rel}: '${w}' is gone, remove it from PENDING_3215B`));
  }
  return out;
}

const lines = (code: string): number[] => textLeaksInLogs(code).map((leak) => leak.line);

describe('textLeaksInLogs', () => {
  it.each([
    // leading slices
    "log.debug({ role, preview: turn.content.slice(0, 40) }, 'Turn persisted');",
    "getLogger().debug({ contentPreview: content.slice(0, 50) }, 'Turn added');",
    'logger.info({ said: userTranscript?.substring(0, 30) });',
    'this.log.warn(`Heard "${text.slice(0, 50)}..."`);',
    "console.log('said', message.substr(0, 20));",
    "log.info({ q: ctx.query.slice(0, 50), n: 1 }, 'search');",
    // negative and later starts (llm-backchannel recentUserSpeech.slice(-50))
    "log.debug({ recent: context.recentUserSpeech.slice(-50) }, 'backchannel');",
    "log.info({ tail: userText.slice(-30) }, 'tail');",
    // wrapped receivers (trust-builders String(reflection).slice)
    "log.info({ r: String(reflection).slice(0, 50) }, 'reflected');",
    "log.info({ u: String(userText).slice(0, 30) }, 'wrapped');",
    // substring of a lowered utterance (contact-onboarding)
    "log.debug({ t: lower.substring(0, 50) }, 'onboarding');",
    // a content field logged whole
    "log.debug('rejected', { transcript: trimmed });",
    "logger.error({ error: String(error), text }, 'slash');",
    "log.info({ suggestedStarter: insight.suggestedConversationStarter }, 'starter');",
    "log.info({ reflection }, 'r');",
    "log.info({ utterance: u, speech: s }, 'u');",
    "log.info({ ttsText: truncateForLog(buffer, 300) }, 'tts');",
    'log.info({ content: `${memory.content}!` }, "interp");',
    // #3215: a slice behind a fallback or a call, and of a record's words
    "log.info({ t: (text || '').slice(0, 40) }, 'fallback');",
    "log.info({ t: userText.trim().toLowerCase().slice(0, 40) }, 'chain');",
    "log.debug({ description: commitment.description.slice(0, 50) }, 'commitment');",
    "log.info({ action: item.action.slice(0, 50) }, 'Action created');",
    "log.info({ item: item.slice(0, 50) }, 'Cross-persona item added');",
    "log.info({ subject: sanitizedSubject.slice(0, 50) }, 'Email sent');",
    "log.warn({ bodyPreview: result.body.slice(0, 100) }, 'Invalid JSON body');",
    "log.info({ topics: extraction.topics.slice(0, 5) }, 'Topics extracted');",
    "log.info({ commitments: due.map((c) => c.description.slice(0, 50)) }, 'due');",
    // #3215: a text value under a key that doesn't say so, or interpolated
    "log.info({ preview: userText }, 'heard');",
    'log.info(`heard ${userTranscript}`);',
    "log.error({ lastUserMessage: ctx.lastUserMessage }, 'crash');",
    // #3215: a memory record's words, logged whole or mapped into a list
    "log.info({ userId, goalId: goal.id, title: goal.title }, 'Goal created');",
    "log.info({ userId, personName: person.name }, 'Person tracked');",
    "log.info({ topic: thread.topic }, 'Thread resumed');",
    "log.info({ s: moment.summary }, 'Key moment');",
    "log.info({ d: win.description }, 'Added win');",
    "log.info({ entities: mentionedEntities.map((e) => e.name).slice(0, 5) }, 'capture');",
    "log.info({ names: entities.map((e) => e.name) }, 'entities');",
    "log.info({ name: contact.name || contact.relationship }, 'contact');",
    // #3724 verify row 4: a topic under any owner, an entity's canonical name, and a bare
    // `{ name }` bound from names extracted from the turn
    "diag.debug('Frequent topics', { topics: frequentTopics.map((t) => t.topic) });",
    "log.info({ userId, topic: context.topic, from: context.sharedBy }, 'Context shared');",
    "log.debug({ userId, entityId: entity.id, name: entity.canonicalName }, 'Integrated');",
    "for (const { name, context } of turn.extractedNames) { log.warn({ error: String(error), name }, 'Failed'); }",
    "const name = person.fullName; log.info({ name }, 'tracked');",
  ])('flags %s', (code) => {
    expect(lines(code)).toEqual([1]);
  });

  it.each([
    "log.debug({ role, contentLen: turn.content.length }, 'Turn persisted');",
    "log.info({ userId: userId.slice(0, 8), key: key.slice(0, 8) }, 'hit');",
    "log.warn({ error: errorText.slice(0, 200) }, 'vendor error');",
    'const preview = content.slice(0, 40); doSomething(preview);',
    "log.info({ context, contentType: 'json', textLen: text.length }, 'shape');",
    "log.info({ hasText: !text, transcriptLen: t?.length ?? 0 }, 'shape');",
    // an id at the end of a chain whose owner's name looks like text (personality-context)
    "log.warn({ userId: input.services?.userId?.slice(0, 8) }, 'builder failed');",
    "log.info({ ids: extraction.ids.slice(0, 3), n: interactions.slice(0, 3).length }, 'x');",
    // a persona or an identity is not a person or an entity
    'log.info(`instructions restored to ${hostPersona.name}`);',
    "log.info({ personaName: persona.manifest.identity.name }, 'draft');",
    // lengths and ids of a record
    "log.info({ goalId: goal.id, titleLen: goal.title.length }, 'Goal created');",
    "log.debug({ descriptionLen: commitment.description.length }, 'commitment');",
    "log.error({ lastUserMessageLen: ctx.lastUserMessageLen }, 'crash');",
    // counts of topics, and a bare `{ name }` bound from a tool, a worker or a persona
    "diag.debug('Frequent topics', { topicCount: frequentTopics.length });",
    "const name = tool.name; log.info({ name }, 'tool ran');",
    "for (const { name } of workers) { log.info({ name, status }, 'worker'); }",
    "for (const { name } of personas) { log.info({ name }, 'persona loaded'); }",
    "log.info({ entityId: entity.id, nameLen: entity.canonicalName.length }, 'Integrated');",
  ])('leaves %s alone', (code) => {
    expect(lines(code)).toEqual([]);
  });

  it('keys each call by what it logs, not by its line', () => {
    const code = "\n\nlog.info({ userId, title: goal.title }, 'Goal created');";
    expect(textLeaksInLogs(code)).toEqual([{ line: 3, what: 'title: goal.title' }]);
  });
});

describe('unreviewed', () => {
  const leak = (what: string, line = 1): Leak => ({ line, what });

  it('fails a pending list that grows past the calls it names', () => {
    const found = { 'src/a.ts': [leak('title: goal.title'), leak('topic: thread.topic', 9)] };
    expect(unreviewed(found, {}, { 'src/a.ts': ['title: goal.title'] })).toEqual([
      'src/a.ts:9 topic: thread.topic',
    ]);
  });

  it('fails a pending call that is already fixed', () => {
    const found = { 'src/a.ts': [leak('title: goal.title')] };
    const pending = {
      'src/a.ts': ['title: goal.title', 'name: habit.name'],
      'src/b.ts': ['x: y.title'],
    };
    expect(unreviewed(found, {}, pending)).toEqual([
      "src/a.ts: 'name: habit.name' is gone, remove it from PENDING_3215B",
      "src/b.ts: 'x: y.title' is gone, remove it from PENDING_3215B",
    ]);
  });

  it('covers only the call a pending entry names, not another in the same file', () => {
    const found = { 'src/a.ts': [leak('topic: thread.topic', 4)] };
    expect(unreviewed(found, {}, { 'src/a.ts': ['title: goal.title'] })).toEqual([
      "src/a.ts: 'title: goal.title' is gone, remove it from PENDING_3215B",
      'src/a.ts:4 topic: thread.topic',
    ]);
  });

  it('counts a pending call once per listing, so a copy of it fails', () => {
    const found = { 'src/a.ts': [leak('title: goal.title'), leak('title: goal.title', 7)] };
    expect(unreviewed(found, {}, { 'src/a.ts': ['title: goal.title'] })).toEqual([
      'src/a.ts:7 title: goal.title',
    ]);
  });

  it('passes when every call is listed exactly', () => {
    const found = { 'src/a.ts': [leak('title: goal.title')], 'src/c.ts': [leak('text')] };
    expect(unreviewed(found, { 'src/c.ts': 1 }, { 'src/a.ts': ['title: goal.title'] })).toEqual([]);
  });
});

describe('log calls in src/ carry no conversation text (#2689, #3215)', () => {
  it('has no call outside the reviewed lists, and every listed call is still there', () => {
    const found: Record<string, Leak[]> = {};
    for (const file of productionFiles(join(ROOT, 'src'))) {
      const leaks = textLeaksInLogs(readFileSync(file, 'utf8'));
      if (leaks.length) found[relative(ROOT, file)] = leaks;
    }
    expect(unreviewed(found, ALLOWED, PENDING_3215B)).toEqual([]);
  });

  it('holds exactly the 18 calls call-log-surface-guard keeps pending (#2656)', () => {
    expect(Object.values(PENDING_2656).reduce((a, b) => a + b, 0)).toBe(18);
  });

  // 82 at first, plus 47 found by the topic, canonicalName and bound-name shapes (#3724),
  // less the 2 query-threads.ts calls #3744 removed
  it('holds exactly the 127 calls #3215 PR (b) fixes: lower it as they go, never raise it', () => {
    expect(Object.values(PENDING_3215B).flat()).toHaveLength(127);
  });

  it('keeps pending calls out of the other lists', () => {
    expect(Object.keys(PENDING_3215B).filter((rel) => rel in ALLOWED)).toEqual([]);
  });
});
