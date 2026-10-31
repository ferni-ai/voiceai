/**
 * #2651 ratchet: no new caller id defaulted to a shared placeholder. `ctx.userId || 'anon'`
 * (or ?? 'anonymous' / 'unknown' / 'guest' / 'default' ...) puts every caller without an id in
 * one bucket: one stored doc, one cache entry. Use the call's own id instead (trustedUserId or
 * toolCallerId in tools/registry, callerIdFor elsewhere), or refuse the write
 * (isSharedPlaceholderId). BASELINE holds today's sites per file; a file may not gain one, and
 * a file that loses one lowers its count here.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const SKIP_DIR = /^(__tests__|__mocks__|node_modules|tests|cli)$/;
const SKIP_FILE = /\.(test|spec)\.ts$|\.d\.ts$/;
const FALLBACK =
  /\b[\w$.?]*(?:userId|UserId|uid|Uid|ownerId|OwnerId|callerId|CallerId)\)?\s*(?:\|\||\?\?)\s*['"`](?:anon|anonymous|unknown|default|guest|session|shared|gateway|null|undefined|user)['"`]/g;

/** Sites on 2026-10-31, file -> count. Lower a count when you fix one; never raise it. */
const BASELINE: Record<string, number> = {
  'src/agents/group-conversation/roundtable-start.ts': 1,
  'src/agents/group-conversation/voice-integration.ts': 1,
  'src/agents/integrations/conversation-session-integration.ts': 1,
  'src/agents/multi-agent/agent-setup.ts': 7,
  'src/agents/multi-agent/essential-tool-set.ts': 1,
  'src/agents/personas/nayan-agent.ts': 1,
  'src/agents/processors/advanced-humanization.ts': 1,
  'src/agents/processors/context-injection-builder.ts': 9,
  'src/agents/processors/injection-builders/humanization-builders.ts': 1,
  'src/agents/processors/injection-builders/intelligence-builders.ts': 1,
  'src/agents/processors/injection-builders/trust-builders.ts': 1,
  'src/agents/processors/turn-processor/context-injections.ts': 10,
  'src/agents/processors/turn-processor/process-turn.ts': 6,
  'src/agents/shared/static-core-tools.ts': 1,
  'src/agents/shared/tool-executors/concierge-executor.ts': 1,
  'src/agents/shared/tool-executors/dynamic-domain-executor.ts': 1,
  'src/agents/shared/tool-executors/legacy-fallback-executor.ts': 2,
  'src/agents/shared/tool-executors/productivity-time-bridge.ts': 3,
  'src/agents/shared/tool-executors/reflection-games-executor.ts': 1,
  'src/agents/shared/tool-executors/research-executor.ts': 1,
  'src/agents/shared/tool-executors/scheduling-executor.ts': 1,
  'src/agents/shared/tool-executors/settings-executor.ts': 2,
  'src/agents/shared/tool-executors/telephony-executor.ts': 1,
  'src/agents/voice-agent-entry/handler-setup.ts': 6,
  'src/agents/voice-agent-entry/index.ts': 3,
  'src/agents/voice-agent-entry/session-creator.ts': 3,
  'src/agents/voice-agent/cleanup-handler.ts': 5,
  'src/agents/voice-agent/data-channel-handler.ts': 2,
  'src/agents/voice-agent/session-init-handler.ts': 5,
  'src/agents/voice-agent/tool-tracking-handler.ts': 1,
  'src/agents/voice-agent/transcript-handler.ts': 1,
  'src/agents/voice-agent/turn-handler.ts': 10,
  'src/agents/voice-agent/user-identification-handler.ts': 1,
  'src/agents/voice-agent/voice-humanization-init-handler.ts': 1,
  'src/api/admin-routes.ts': 1,
  'src/conversation/humanization/voice-pattern-session.ts': 1,
  'src/intelligence/context-builders/awareness/contact-awareness.ts': 1,
  'src/intelligence/context-builders/awareness/domain-awareness.ts': 1,
  'src/intelligence/context-builders/awareness/message-review-awareness.ts': 1,
  'src/intelligence/context-builders/awareness/outreach-awareness.ts': 1,
  'src/intelligence/context-builders/awareness/world-awareness.ts': 1,
  'src/intelligence/context-builders/coaching/cognitive-insights.ts': 1,
  'src/intelligence/context-builders/coaching/cognitive.ts': 1,
  'src/intelligence/context-builders/emotional/voice-emotion.ts': 1,
  'src/intelligence/context-builders/external/personal-journey.ts': 1,
  'src/intelligence/context-builders/intelligence/deep-understanding.ts': 1,
  'src/intelligence/context-builders/intelligence/semantic-intent-guidance.ts': 1,
  'src/intelligence/context-builders/memory/memory-enhancement.ts': 1,
  'src/intelligence/context-builders/personas/alex-communication-insights/index.ts': 1,
  'src/intelligence/context-builders/personas/ferni-coordinator-insights.ts': 1,
  'src/intelligence/context-builders/personas/joel-dickson-insights/index.ts': 1,
  'src/intelligence/context-builders/personas/jordan-milestone-insights/index.ts': 1,
  'src/intelligence/context-builders/personas/maya-coaching-insights/index.ts': 1,
  'src/intelligence/context-builders/personas/nayan-wisdom-insights/index.ts': 1,
  'src/intelligence/context-builders/personas/peter-research-insights/index.ts': 1,
  'src/intelligence/context-builders/superhuman/conversational-superpowers.ts': 1,
  'src/intelligence/context-builders/superhuman/superhuman-intelligence-context.ts': 1,
  'src/intelligence/context-builders/team/handoff.ts': 1,
  'src/intelligence/tracking/communication-style.ts': 1,
  'src/personas/bundles/extensibility-integration.ts': 2,
  'src/personas/bundles/ferni/personality-integration.ts': 1,
  'src/servers/api/routes/push.ts': 1,
  'src/services/analytics/tool-usage-analytics.ts': 1,
  'src/services/billing/subscription-metrics.ts': 1,
  'src/services/outreach/on-behalf-dispatch.ts': 1,
  'src/services/session/session-manager.ts': 6,
  'src/services/superhuman/insight-generation/generators/cross-domain-correlation.ts': 1,
  'src/services/voice/voice-audit-log.ts': 1,
  'src/services/voice/voice-rate-limit.ts': 1,
  'src/tools/builder.ts': 4,
  'src/tools/domains/communication/communication-tools.ts': 3,
  'src/tools/domains/communication/index.ts': 1,
  'src/tools/domains/communication/notifications.ts': 10,
  'src/tools/domains/engagement/analytics-games.ts': 1,
  'src/tools/domains/engagement/emotional-games.ts': 1,
  'src/tools/domains/engagement/financial-games.ts': 1,
  'src/tools/domains/engagement/productivity-games.ts': 1,
  'src/tools/domains/engagement/team-challenges.ts': 1,
  'src/tools/domains/event-intelligence/index.ts': 7,
  'src/tools/domains/finance/bills.ts': 7,
  'src/tools/domains/habits/gamification.ts': 9,
  'src/tools/domains/habits/habit-voice-tools.ts': 4,
  'src/tools/domains/habits/habits.ts': 7,
  'src/tools/domains/habits/intelligence.ts': 8,
  'src/tools/domains/home/packages.ts': 6,
  'src/tools/domains/home/shopping.ts': 8,
  'src/tools/domains/information/daily-briefing.ts': 4,
  'src/tools/domains/information/traffic.ts': 1,
  'src/tools/domains/pattern-analytics/index.ts': 7,
  'src/tools/domains/proactive/coaching/proactive-coaching.ts': 6,
  'src/tools/domains/proactive/index.ts': 1,
  'src/tools/domains/proactive/outreach/service.ts': 5,
  'src/tools/domains/productivity/notes.ts': 8,
  'src/tools/domains/productivity/routines.ts': 6,
  'src/tools/domains/productivity/tasks.ts': 7,
  'src/tools/domains/referral/index.ts': 2,
  'src/tools/domains/scheduling/index.ts': 9,
  'src/tools/domains/settings/language-tools.ts': 2,
  'src/tools/domains/simple-utilities/decision-tools.ts': 1,
  'src/tools/domains/simple-utilities/device-tools.ts': 8,
  'src/tools/domains/simple-utilities/knowledge-tools.ts': 1,
  'src/tools/domains/simple-utilities/math-tools.ts': 1,
  'src/tools/domains/simple-utilities/notes-tools.ts': 3,
  'src/tools/domains/simple-utilities/shortcuts-tools.ts': 18,
  'src/tools/domains/simple-utilities/timer-tools.ts': 2,
  'src/tools/domains/simple-utilities/timezone-tools.ts': 1,
  'src/tools/domains/travel/travel.ts': 4,
  'src/tools/domains/wellness/medications.ts': 8,
  'src/tools/domains/wisdom/intelligence.ts': 3,
  'src/tools/dynamic-loader/essential-domain-loader.ts': 1,
  'src/tools/habit-coaching/tools.ts': 25,
  'src/tools/registry/index.ts': 1,
  'src/tools/scheduling/appointments-tools.ts': 8,
  'src/tools/utils/tool-execution-wrapper.ts': 1,
  'src/utils/synthetic-user.ts': 1,
  'src/workers/analytics-worker.ts': 1,
};

export function placeholderFallbacks(source: string): number {
  return source.match(FALLBACK)?.length ?? 0;
}

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

describe('placeholderFallbacks', () => {
  it.each([
    "save(ctx.userId || 'anon', x);",
    "const userId = userData?.userId ?? 'anonymous';",
    'const uid = user.uid || "guest";',
    "key(`${services.userId || 'unknown'}-${sessionId}`);",
  ])('counts %s', (code) => {
    expect(placeholderFallbacks(code)).toBe(1);
  });

  it.each([
    'const userId = trustedUserId(ctx, opts);',
    "const name = profile.name || 'friend';",
    "const id = callerIdFor(ctx.userId, ctx.sessionId) || 'anon:x';",
  ])('leaves %s alone', (code) => {
    expect(placeholderFallbacks(code)).toBe(0);
  });
});

describe('caller ids defaulted to a shared placeholder in src/ (#2651)', () => {
  it('match the baseline: none added, and a fixed one lowers its count', () => {
    const drift: string[] = [];
    const seen = new Set<string>();
    for (const file of productionFiles(join(ROOT, 'src'))) {
      const count = placeholderFallbacks(readFileSync(file, 'utf8'));
      const rel = relative(ROOT, file);
      if (count) seen.add(rel);
      if (count !== (BASELINE[rel] ?? 0)) drift.push(`${rel}: ${BASELINE[rel] ?? 0} -> ${count}`);
    }
    for (const rel of Object.keys(BASELINE)) if (!seen.has(rel)) drift.push(`${rel}: prune`);
    expect(drift).toEqual([]);
  });
});
