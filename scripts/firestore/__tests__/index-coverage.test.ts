/**
 * Every query in src that needs a composite index has one in
 * firestore.indexes.json (collection-group queries since #1863, plain
 * collection queries since the 2026-10-18 audit). Prod lacked the deferred_calls (status, scheduledFor)
 * index for weeks; the deferred-call job threw FAILED_PRECONDITION every minute
 * and nothing noticed. Declared is not deployed: scripts/firestore/check-indexes.ts
 * compares this file against prod.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  describeNeed,
  databaseOf,
  diffIndexes,
  type IndexFile,
  type IndexNeed,
  indexNeedsInSource,
  isResolved,
  serves,
} from '../index-needs.js';

const ROOT = process.cwd();

/**
 * Queries the scan cannot resolve, and why each is still covered. Keyed by file
 * and how the query was found, so a moved line doesn't break it but a new
 * unresolved query in the same file still has to be looked at.
 */
const UNRESOLVED_OK: Record<string, string> = {
  'src/services/scheduling/due-items.ts:collectionGroup':
    'claimDueItems itself; each caller is scanned with its own collection and dueField',
};

/**
 * Plain collection queries with no composite index declared OR live in prod
 * when the collection scan was added (2026-10-18): each throws
 * FAILED_PRECONDITION if it runs. Kept as a baseline so the test can guard new
 * code now; each entry is either dead code to delete or an index to add (add
 * it to firestore.indexes.json and deploy it before removing the entry).
 * Keyed by file, collection and index fields, without line numbers.
 */
const KNOWN_UNINDEXED = new Set([
  'src/agents/shared/tool-executors/productivity-executor.ts tasks (completed asc, completedAt asc)',
  'src/api/garden-routes.ts founder_stories (approved asc, createdAt desc)',
  'src/api/habit-routes.ts habit_completions (userId asc, habitId asc, date desc)',
  'src/api/review-queue.ts marketplace_review_submissions (itemId asc, version desc)',
  'src/api/roadmap-routes.ts feature_votes (userId asc, createdAt desc)',
  'src/api/routes/practice-view.ts outreach (userId asc, status asc, scheduledFor asc)',
  'src/api/v1/developers/analytics-routes.ts publisher_errors (publisherId asc, timestamp desc)',
  'src/api/v1/developers/analytics-routes.ts publisher_usage (publisherId asc, date asc)',
  'src/api/v1/developers/personas-routes.ts publisher_personas (publisherId asc, updatedAt desc)',
  'src/api/visual-storytelling-routes.ts sessions (userId asc, startTime desc)',
  'src/intelligence/surfacing/proactive-surfacing-engine.ts surfaced_content (status asc, deliveredAt desc)',
  'src/intelligence/surfacing/proactive-surfacing-engine.ts surfaced_content (status asc, priority desc)',
  'src/intelligence/surfacing/proactive-surfacing-engine.ts unified_entities (type asc, salience asc)',
  'src/memory/dynamic/voice-context-capture.ts voice_contexts (sessionId asc, turnNumber desc)',
  'src/memory/entity-store/store.ts entities (userId asc, lastSeen desc)',
  'src/services/admin-activity.ts admin_activity_log (type asc, timestamp desc)',
  'src/services/analytics/outreach-analytics.ts outreach_events (userId asc, timestamp desc)',
  'src/services/automation/audit-log.ts audit_log (status asc, canUndo asc, executedAt desc)',
  'src/services/automation/insight-action-bridge.ts action_executions (ruleId asc, status asc, createdAt asc)',
  'src/services/automation/trust-level-system.ts pending_actions (status asc, expiresAt asc)',
  'src/services/better-than-human-validation/production-telemetry.ts bth_production_events (capability asc, timestamp asc)',
  'src/services/calendar/local-calendar-store.ts local_calendar_events (userId asc, startTime asc)',
  'src/services/calendar/meeting-followup-automation.ts meeting_outcomes (processedAt asc, endTime asc)',
  'src/services/calendar/meeting-memory-service.ts meeting_interactions (personEmail asc, date desc)',
  'src/services/cameo/cameo-analytics.ts history (personaId asc, timestamp desc)',
  'src/services/concierge/tracker/task-tracker.ts concierge_requests (userId asc, status asc, createdAt desc)',
  'src/services/contacts/contact-relationship-service.ts contact_interactions (userId asc, contactId asc, type asc, date desc)',
  'src/services/contacts/gift-suggestions.ts gift_history (contactId asc, date desc)',
  'src/services/engagement/gamification-store.ts items (status asc, endDate desc)',
  'src/services/engagement/gamification-store.ts items (toolType asc, createdAt desc)',
  'src/services/external-apis/food-delivery.ts delivery_order_history (userId asc, completedAt desc)',
  'src/services/family/family-context-sharing.ts family_shared_context (toUserId asc, delivered asc, expiresAt asc, createdAt desc)',
  'src/services/family/family-messages.ts family_messages (status asc, createdAt asc)',
  'src/services/family/family-messages.ts family_messages (toUserId asc, status asc, createdAt desc)',
  'src/services/feedback/conversation-feedback-store.ts conversationFeedback (personaId asc, promptedAtMs desc)',
  'src/services/gtm/gtm-storage.ts gtm_calendar (status asc, date asc)',
  'src/services/gtm/gtm-storage.ts gtm_content (status asc, createdAt desc)',
  'src/services/life-thesis/thesis-service.ts life_theses (domain asc, createdAt desc)',
  'src/services/memory/voice-conversation-memory.ts voice_conversations (userId asc, startedAt desc)',
  'src/services/memory/voice-conversation-memory.ts voice_conversations (userId asc, topics asc, startedAt desc)',
  'src/services/message-validation/message-validation-service.ts message_drafts (userId asc, status asc, createdAt desc)',
  'src/services/outreach/scheduled-multi-outreach.ts scheduled_outreach (status asc, updatedAt asc)',
  'src/services/superhuman/causal-inference-engine.ts causal_timeseries (variable asc, timestamp asc)',
  'src/services/superhuman/future-self.ts future_self_letters (timeframe asc, generatedAt desc)',
  'src/services/visual-memory/visual-memory-store.ts visual_memories (deletedAt asc, createdAt desc)',
  'src/tools/domains/life-coaching-shared/analytics.ts life_coaching_analytics (eventType asc, timestamp desc)',
  'src/tools/domains/referral/voice-referral.ts voice_referrals (referrerId asc, createdAt desc)',
]);

const isTest = (path: string): boolean =>
  /(?:^|\/)__tests__\//.test(path) || /\.(?:test|spec)\.ts$/.test(path);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sourceFiles(path);
    return e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && !isTest(path) ? [path] : [];
  });
}

function repoNeeds(): IndexNeed[] {
  return sourceFiles(join(ROOT, 'src')).flatMap((path) =>
    indexNeedsInSource(relative(ROOT, path), readFileSync(path, 'utf8'))
  );
}

const declared = (): IndexFile =>
  JSON.parse(readFileSync(join(ROOT, 'firestore.indexes.json'), 'utf8')) as IndexFile;

const missing = (needs: IndexNeed[], file: IndexFile): string[] =>
  needs
    .filter(isResolved)
    .filter((n) => !file.indexes.some((i) => serves(i, n)))
    .map(describeNeed);

/** describeNeed without the line number, so a moved query keeps its key. */
const needKey = (described: string): string => described.replace(/:\d+ /, ' ');

describe('index-needs scanner', () => {
  const scan = (body: string): IndexNeed[] => indexNeedsInSource('x.ts', body);

  it('finds a collection-group where + orderBy chain across lines', () => {
    const [need] = scan(`
      const C = 'reminders';
      await db.collectionGroup(C)
        .where('status', '==', 'pending')
        .where('scheduledFor', '<=', now)
        .orderBy('scheduledFor')
        .limit(5).get();`);
    expect(need).toMatchObject({
      collection: 'reminders',
      equality: ['status'],
      ordered: [{ field: 'scheduledFor', order: 'ASCENDING' }],
    });
  });

  it('puts a range field first and keeps a desc orderBy', () => {
    const [need] = scan(`db.collectionGroup('h').where('n', '!=', null).orderBy('t', 'desc')`);
    expect(need.ordered).toEqual([
      { field: 'n', order: 'ASCENDING' },
      { field: 't', order: 'DESCENDING' },
    ]);
  });

  it('leaves out queries a single-field index serves', () => {
    expect(scan(`db.collectionGroup('a').where('id', '==', x).limit(1)`)).toEqual([]);
    expect(scan(`db.collectionGroup('a').where('t', '<', x)`)).toEqual([]);
    expect(scan(`db.collectionGroup('a').where('s', '==', 1).where('k', '==', 2)`)).toEqual([]);
    expect(scan(`db.collectionGroup('a').orderBy('__name__').limit(9)`)).toEqual([]);
  });

  it('finds a plain collection query under a document path, at COLLECTION scope', () => {
    const [need] = scan(`
      db.collection('bogle_users').doc(uid).collection('memories')
        .where('archived', '!=', true).orderBy('archived').orderBy('createdAt', 'desc').get();`);
    expect(need).toMatchObject({
      via: 'collection',
      scope: 'COLLECTION',
      collection: 'memories',
      equality: [],
      ordered: [
        { field: 'archived', order: 'ASCENDING' },
        { field: 'createdAt', order: 'DESCENDING' },
      ],
    });
  });

  it('does not read past .doc() into the next path segment', () => {
    expect(
      scan(`db.collection('users').doc(id).collection('x').where('a', '==', 1).get()`)
    ).toEqual([]);
  });

  it("reads claimDueItems' collection and dueField, through a const", () => {
    const [need] = scan(`
      const COLLECTION = 'deferred_calls';
      await claimDueItems(db, { collection: COLLECTION, dueField: 'scheduledFor', dueType: 'iso' });`);
    expect(need).toMatchObject({
      via: 'claimDueItems',
      collection: 'deferred_calls',
      equality: ['status'],
      ordered: [{ field: 'scheduledFor', order: 'ASCENDING' }],
    });
  });

  it('marks a field it cannot read as unresolved', () => {
    const [need] = scan(`db.collectionGroup(opts.c).where('s', '==', 1).orderBy(opts.f)`);
    expect(isResolved(need)).toBe(false);
  });

  it('matches an index only on scope, fields and direction', () => {
    const [need] = scan(`db.collectionGroup('h').where('p', '==', 1).orderBy('t', 'desc')`);
    const idx = (scope: 'COLLECTION' | 'COLLECTION_GROUP', order: 'ASCENDING' | 'DESCENDING') => ({
      collectionGroup: 'h',
      queryScope: scope,
      fields: [
        { fieldPath: 'p', order: 'ASCENDING' as const },
        { fieldPath: 't', order },
      ],
    });
    expect(serves(idx('COLLECTION_GROUP', 'DESCENDING'), need)).toBe(true);
    expect(serves(idx('COLLECTION_GROUP', 'ASCENDING'), need)).toBe(false);
    expect(serves(idx('COLLECTION', 'DESCENDING'), need)).toBe(false);

    const [plain] = scan(`db.collection('h').where('p', '==', 1).orderBy('t', 'desc')`);
    expect(serves(idx('COLLECTION', 'DESCENDING'), plain)).toBe(true);
    expect(serves(idx('COLLECTION_GROUP', 'DESCENDING'), plain)).toBe(false);
  });
});

describe('firestore.indexes.json covers every indexed query in src', () => {
  const needs = repoNeeds();

  it('finds the queries behind the scheduled jobs (the scan is not empty)', () => {
    const found = new Set(needs.filter(isResolved).map((n) => n.collection));
    for (const c of ['deferred_calls', 'scheduled_outreach', 'reminders', 'follow_through']) {
      expect(found, c).toContain(c);
    }
  });

  it('declares an index for each one (apart from the known-unindexed baseline)', () => {
    const keys = missing(needs, declared()).map(needKey);
    expect(keys.filter((k) => !KNOWN_UNINDEXED.has(k))).toEqual([]);
  });

  it('keeps no stale known-unindexed entries', () => {
    const keys = new Set(missing(needs, declared()).map(needKey));
    expect([...KNOWN_UNINDEXED].filter((k) => !keys.has(k))).toEqual([]);
  });

  it('would have caught a missing index on the memory lifecycle query', () => {
    const file = declared();
    const without: IndexFile = {
      indexes: file.indexes.filter((i) => i.collectionGroup !== 'memories'),
    };
    expect(missing(needs, without).join('\n')).toMatch(
      /lifecycle-integration\.ts:\d+ memories \(archived asc, createdAt desc\)/
    );
  });

  it('would have caught the missing deferred_calls index', () => {
    const file = declared();
    const without: IndexFile = {
      indexes: file.indexes.filter((i) => i.collectionGroup !== 'deferred_calls'),
    };
    expect(missing(needs, without).join('\n')).toMatch(
      /deferred-calls\.ts:\d+ deferred_calls \(status asc, scheduledFor asc\)/
    );
  });

  it('allow-lists each query it cannot read, and no stale entries', () => {
    // A plain collection named by a parameter is out of scope (see index-needs.ts).
    const unresolved = needs
      .filter((n) => !isResolved(n) && n.via !== 'collection')
      .map((n) => `${n.file}:${n.via}`);
    expect(unresolved.filter((k) => !(k in UNRESOLVED_OK))).toEqual([]);
    expect(Object.keys(UNRESOLVED_OK).filter((k) => !unresolved.includes(k))).toEqual([]);
  });
});

describe('diffIndexes (check-indexes.ts)', () => {
  const field = (fieldPath: string, order: 'ASCENDING' | 'DESCENDING' = 'ASCENDING') => ({
    fieldPath,
    order,
  });
  const repo = [
    {
      collectionGroup: 'deferred_calls',
      queryScope: 'COLLECTION_GROUP',
      fields: [field('status'), field('scheduledFor')],
    },
    {
      collectionGroup: 'reminders',
      queryScope: 'COLLECTION_GROUP',
      fields: [field('status'), field('scheduledFor')],
    },
  ];
  const prodRow = (cg: string, state = 'READY') => ({
    name: `projects/p/databases/(default)/collectionGroups/${cg}/indexes/X1`,
    queryScope: 'COLLECTION_GROUP',
    fields: [field('status'), field('scheduledFor'), field('__name__')],
    state,
  });

  it('reports a declared index prod lacks, ignoring the __name__ Firestore appends', () => {
    expect(diffIndexes(repo, [prodRow('reminders')])).toEqual({
      missing: ['deferred_calls COLLECTION_GROUP (status:ASCENDING, scheduledFor:ASCENDING)'],
      notReady: [],
      undeclared: [],
    });
  });

  it('reads a ferni-dev listing the same way, and names its database', () => {
    const dev = {
      ...prodRow('reminders'),
      name: prodRow('reminders').name.replace('(default)', 'ferni-dev'),
    };
    expect(diffIndexes(repo, [dev]).missing).toEqual(
      diffIndexes(repo, [prodRow('reminders')]).missing
    );
    expect(databaseOf(dev)).toBe('ferni-dev');
    expect(databaseOf(prodRow('reminders'))).toBe('(default)');
    expect(databaseOf(repo[0])).toBeUndefined();
  });

  it('reports one still building, and counts prod-only ones apart', () => {
    const diff = diffIndexes(repo, [
      prodRow('reminders'),
      prodRow('deferred_calls', 'CREATING'),
      prodRow('other'),
    ]);
    expect(diff.missing).toEqual([]);
    expect(diff.notReady).toEqual([
      'deferred_calls COLLECTION_GROUP (status:ASCENDING, scheduledFor:ASCENDING) [CREATING]',
    ]);
    expect(diff.undeclared).toEqual([
      'other COLLECTION_GROUP (status:ASCENDING, scheduledFor:ASCENDING)',
    ]);
  });
});
