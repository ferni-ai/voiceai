/**
 * The world model on the live recall path: createMemoryRecall with the real
 * snapshot builder, the real profile/shard merge and the real formatter; only
 * the stores are fakes. Mirrors the world-seed / world-recall eval pair.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => [] as Array<{ msg: string; data: Record<string, unknown> }>);
vi.mock('../../../utils/safe-logger.js', () => {
  const logger: Record<string, unknown> = {
    info: (data: Record<string, unknown>, msg: string) => logged.push({ msg, data }),
    warn: () => undefined,
    debug: () => undefined,
    error: () => undefined,
  };
  logger.child = () => logger;
  return { createLogger: () => logger, getLogger: () => logger };
});
// No Firestore: the ledger and life updates load nothing.
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

import { createMemoryRecall } from '../memory-recall-hook.js';
import { mergeProfileSignals, type WorldModelSources } from '../../../intelligence/world-model/sources.js';
import { buildWorldModelSnapshot } from '../../../intelligence/world-model/snapshot.js';
import { WORLD_NOTE_MAX_CHARS } from '../../../intelligence/world-model/recall-note.js';

const ON = { WORLD_MODEL_SNAPSHOT: 'on' };

/** What a world-seed call leaves behind, in the shapes the stores hold. */
const entities = [
  { id: 'm', canonicalName: 'Mindy', type: 'person', attributes: { relationship: 'sister' } },
  { id: 'd', canonicalName: 'Dana', type: 'person', attributes: { relationship: 'coworker' } },
  { id: 'f', canonicalName: 'Ferni', type: 'person' },
  { id: 'a', canonicalName: 'AI Assistant', type: 'person' },
  { id: 'g', canonicalName: 'Run a half marathon', type: 'goal' },
];
/** human_memory/profile as the live writer fills it; the shards are empty. */
const profile = {
  unspoken: { avoidances: [{ topic: 'their ex', approach: 'never_raise' }] },
  identity: { dreams: [{ description: 'Run a half marathon' }] },
};
const worldSources = (over: Partial<WorldModelSources> = {}): WorldModelSources => ({
  listEntities: async () => entities,
  listRelationships: async () => [],
  getHumanSignals: async () => mergeProfileSignals(profile, { avoidances: [], dreams: [] }),
  getUserModel: async () => null,
  getSessionTopics: () => [],
  ...over,
});
const loadWorldModel = (sources: WorldModelSources) => (userId: string) =>
  buildWorldModelSnapshot({ userId, sources });

/** dynamic_facts, what per-turn recall reads. */
const store = {
  facts: async () => [
    { entityName: 'Mindy', key: 'relationship', value: 'sister', confidence: 1 },
    { entityName: 'Mindy', key: 'job', value: 'nurse in Denver', confidence: 1 },
    { entityName: 'Jake', key: 'relationship', value: 'ex-boyfriend', confidence: 1 },
    { entityName: 'Jake', key: 'still_texts', value: 'sometimes on weekends', confidence: 1 },
    { entityName: 'user', key: 'goal', value: 'run a half marathon in the spring', confidence: 1 },
    { entityName: 'Dana', key: 'behavior', value: 'takes credit for my work', confidence: 1 },
  ],
  summaries: async () => [],
};

const turns = [
  "Hey, it's me again.",
  "How's Mindy doing these days, you think?",
  'Jake texted me again this weekend.',
  "I've been training for the half marathon.",
  'Dana did it again at work.',
];

async function run(env: Record<string, string>, sources = worldSources()) {
  const recall = createMemoryRecall({
    userId: 'u1',
    userName: 'Sam',
    store,
    env,
    loadWorldModel: loadWorldModel(sources),
  });
  await recall.ready;
  return turns.map((t) => {
    const note = recall.noteFor(t);
    recall.newTurn();
    return note;
  });
}

const events = (msg: string) => logged.filter((l) => l.msg === msg);

describe('world model in the live recall hook', () => {
  beforeEach(() => {
    logged.length = 0;
  });

  it('flag off: recall is exactly what it was, and the world model is never loaded', async () => {
    const loader = vi.fn(loadWorldModel(worldSources()));
    const recall = createMemoryRecall({ userId: 'u1', userName: 'Sam', store, env: {}, loadWorldModel: loader });
    await recall.ready;
    const off = turns.map((t) => {
      const n = recall.noteFor(t);
      recall.newTurn();
      return n;
    });
    const plain = createMemoryRecall({ userId: 'u1', userName: 'Sam', store });
    await plain.ready;
    const before = turns.map((t) => {
      const n = plain.noteFor(t);
      plain.newTurn();
      return n;
    });
    expect(off).toEqual(before);
    expect(loader).not.toHaveBeenCalled();
    expect(events('WORLD_MODEL_INJECTED')).toHaveLength(0);
    // Without the world model, recall restates Mindy's relationship and surfaces the ex.
    expect(before.join('\n')).toContain('Mindy: relationship = sister');
    expect(before.join('\n')).toContain('Jake');
  });

  it('flag on: one note names the people, the goal and the ex to avoid, once a call', async () => {
    const notes = await run(ON);
    const first = notes[0] ?? '';
    expect(first).toContain('[THEIR WORLD]');
    expect(first).toContain('Never bring up: their ex.');
    expect(first).toContain('Mindy (sister)');
    expect(first).toContain('Dana (coworker)');
    expect(first.match(/half marathon/gi)).toHaveLength(1);
    expect(first).not.toMatch(/Ferni|AI Assistant/);
    expect(notes.slice(1).join('\n')).not.toContain('[THEIR WORLD]');
    const injected = events('WORLD_MODEL_INJECTED');
    expect(injected).toHaveLength(1);
    expect(injected[0]?.data).toMatchObject({ people: 2, relations: 2, goals: 1, avoids: 1 });
    expect(injected[0]?.data.chars).toBe(first.split('\n\n')[0]?.length);
    expect(Number(injected[0]?.data.chars)).toBeLessThanOrEqual(WORLD_NOTE_MAX_CHARS);
  });

  it('flag on: each person appears once, and recall never surfaces the ex', async () => {
    const all = (await run(ON)).filter(Boolean).join('\n');
    // Mindy's relationship comes from the world note only; her other facts still recall.
    expect(all.match(/sister/g)).toHaveLength(1);
    expect(all).toContain('Mindy: job = nurse in Denver');
    // Both facts about the ex go, not just the one that says "ex".
    expect(all).not.toContain('Jake');
    // The goal is in the world note; the recall row that repeats it is left out.
    expect(all).not.toContain('goal = run a half marathon');
    expect(all).toContain('Dana: behavior = takes credit for my work');
  });

  it('flag on with empty stores: logs WORLD_MODEL_EMPTY once and recall is unchanged', async () => {
    const empty = worldSources({
      listEntities: async () => [],
      getHumanSignals: async () => mergeProfileSignals(undefined, null),
    });
    const notes = await run(ON, empty);
    expect(events('WORLD_MODEL_EMPTY')).toHaveLength(1);
    expect(events('WORLD_MODEL_INJECTED')).toHaveLength(0);
    expect(notes.join('\n')).not.toContain('[THEIR WORLD]');
    expect(notes.join('\n')).toContain('Mindy: relationship = sister');
  });
});

describe('mergeProfileSignals', () => {
  it('reads avoidances and dreams from human_memory/profile when the shards are empty', () => {
    const merged = mergeProfileSignals(profile, { avoidances: [], dreams: [] });
    expect(merged.avoidances?.map((a) => a.topic)).toEqual(['their ex']);
    expect(merged.dreams?.map((d) => d.description)).toEqual(['Run a half marathon']);
    expect(mergeProfileSignals(undefined, null)).toEqual({ avoidances: [], dreams: [], values: undefined });
  });
});
