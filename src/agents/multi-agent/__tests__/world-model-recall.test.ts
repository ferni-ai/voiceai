/**
 * The world model on the live recall path: createMemoryRecall with the real
 * snapshot builder, the real profile/shard merge and the real formatter; only
 * the stores are fakes. Mirrors the world-seed / world-recall eval pair.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import {
  mergeProfileSignals,
  type WorldModelSources,
} from '../../../intelligence/world-model/sources.js';
import { buildWorldModelSnapshot } from '../../../intelligence/world-model/snapshot.js';
import {
  formatWorldNote,
  WORLD_NOTE_MAX_CHARS,
} from '../../../intelligence/world-model/recall-note.js';
import { EMPTY_GROUND, type CommonGround } from '../../personas/common-ground.js';

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
  summaries: async () => [
    { followUpItems: ['Ask whether things with her ex settled down', 'Ask how training is going'] },
  ],
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
    world: { env, load: loadWorldModel(sources) },
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** The first note with RECALL_PEOPLE on, the world model on or off. */
  async function firstNoteWithPeople(env: Record<string, string>): Promise<string> {
    const recall = createMemoryRecall({
      userId: 'u1',
      userName: 'Sam',
      store,
      people: true,
      world: { env, load: loadWorldModel(worldSources()) },
    });
    await recall.ready;
    return recall.noteFor(turns[0] ?? '') ?? '';
  }
  const PEOPLE_RULE = 'Never guess how someone is related to them';

  it('RECALL_PEOPLE, world model off: the who-is-who note is there, as before', async () => {
    const note = await firstNoteWithPeople({});
    expect(note).toContain(PEOPLE_RULE);
    expect(note).toContain('Mindy (sister)');
    expect(note).not.toContain('[THEIR WORLD]');
  });

  it('RECALL_PEOPLE, world model on: only the world note says who is who, and never to guess', async () => {
    const note = await firstNoteWithPeople(ON);
    expect(note).toContain('[THEIR WORLD]');
    expect(note).not.toContain(PEOPLE_RULE);
    expect(note.match(/People in their life:/g)).toHaveLength(1);
    expect(note).toContain(
      "If they mention someone not listed, or a relation isn't given, don't guess: ask."
    );
  });

  it('RECALL_PEOPLE, world model on but empty or failing: its note is there, as with the flag off', async () => {
    for (const load of [
      loadWorldModel(
        worldSources({ listEntities: async () => [], getHumanSignals: async () => null })
      ),
      async () => {
        throw new Error('entity store down');
      },
    ]) {
      const recall = createMemoryRecall({
        userId: 'u1',
        userName: 'Sam',
        store,
        people: true,
        world: { env: ON, load },
      });
      await recall.ready;
      const note = recall.noteFor(turns[0] ?? '') ?? '';
      expect(note).toContain(PEOPLE_RULE);
      expect(note).toContain('Mindy (sister)');
      expect(note).not.toContain('[THEIR WORLD]');
    }
  });

  it('RECALL_PEOPLE, world model on: the pets line still comes, beside the world note', async () => {
    const pets = {
      ...store,
      facts: async () => [
        ...(await store.facts()),
        // As the deep extractor writes them (pets.test.ts).
        {
          entityName: 'User',
          key: 'acquired_pet',
          value: 'got a golden retriever puppy named Biscuit',
          confidence: 1,
        },
        { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 1 },
      ],
    };
    const recall = createMemoryRecall({
      userId: 'u1',
      userName: 'Sam',
      store: pets,
      people: true,
      world: { env: ON, load: loadWorldModel(worldSources()) },
    });
    await recall.ready;
    const note = recall.noteFor(turns[0] ?? '') ?? '';
    expect(note).toContain('[THEIR WORLD]');
    expect(note).toContain('Biscuit');
    expect(note).not.toContain(PEOPLE_RULE);
  });

  it('world model still loading: recall waits, then the world note joins the next note, with no ex', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const slow = async (userId: string) => {
      await gate;
      return loadWorldModel(worldSources())(userId);
    };
    const recall = createMemoryRecall({
      userId: 'u1',
      userName: 'Sam',
      store,
      world: { env: ON, load: slow },
    });
    await new Promise((r) => setTimeout(r, 20)); // the recall snapshot is in; the world model is not
    expect(recall.noteFor(turns[0] ?? '')).toBeNull();
    recall.newTurn();
    release();
    await recall.ready;
    const note = recall.noteFor(turns[2] ?? '') ?? '';
    expect(note).toContain('[THEIR WORLD]');
    expect(note).not.toMatch(/ex settled down|Jake/);
  });

  it('no line of another recall block touches a topic to avoid (common ground shown)', async () => {
    vi.stubEnv('COMMON_GROUND', 'on');
    const ground = {
      ...EMPTY_GROUND,
      references: [
        { phrase: 'the ex files', meaning: 'their ex and the breakup' },
        { phrase: 'the spreadsheet goblin', meaning: 'their boss' },
      ],
    } as unknown as CommonGround;
    const recall = createMemoryRecall({
      userId: 'u1',
      userName: 'Sam',
      store,
      groundStore: { load: async () => ground, save: async () => undefined },
      world: { env: ON, load: loadWorldModel(worldSources()) },
    });
    await recall.ready;
    const note = recall.noteFor(turns[0] ?? '') ?? '';
    expect(note).toContain('the spreadsheet goblin');
    expect(note).not.toContain('the ex files');
    expect(note).toContain('Never bring up: their ex.'); // the world note's own line stays
  });

  it('flag off: recall is exactly what it was, and the world model is never loaded', async () => {
    const loader = vi.fn(loadWorldModel(worldSources()));
    const recall = createMemoryRecall({
      userId: 'u1',
      userName: 'Sam',
      store,
      world: { env: {}, load: loader },
    });
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
    expect(before.join('\n')).toContain('things with her ex settled down');
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
    // A thread from an earlier call about the ex is dropped; the others stay.
    expect(all).not.toContain('things with her ex');
    expect(all).toContain('Ask how training is going');
  });

  it('flag on with check-ins: the first note leads with them, then the world note, each once', async () => {
    const recall = createMemoryRecall({
      userId: 'u1',
      userName: 'Sam',
      store,
      world: { env: ON, load: loadWorldModel(worldSources()) },
      checkIns: async () => [
        {
          id: 'c1',
          statement: "I'm going to send my resume to Dana by Thursday.",
          createdAt: Date.now() - 3 * 86_400_000,
          followUpAfter: Date.now(),
          followUpCount: 0,
        },
      ],
    });
    await recall.ready;
    const first = recall.noteFor(turns[0] ?? '') ?? '';
    const blocks = first.split('\n\n');
    expect(blocks[0]?.startsWith('[THINGS THEY SAID THEY WOULD DO]')).toBe(true);
    expect(blocks[1]?.startsWith('[THEIR WORLD]')).toBe(true);
    recall.newTurn();
    const rest = turns.slice(1).map((t) => {
      const n = recall.noteFor(t);
      recall.newTurn();
      return n ?? '';
    });
    expect(rest.join('\n')).not.toMatch(/THINGS THEY SAID|\[THEIR WORLD\]/);
  });

  it('flag on with inside jokes: a bit about a topic to avoid is left out, the rest stay', async () => {
    vi.stubEnv('INSIDE_JOKES', 'on'); // read by the recall formatter, not the world model
    const env = ON;
    const jokes = {
      ...store,
      summaries: async () => [
        {
          followUpItems: [],
          insideJokes: ['the time her ex sang karaoke', 'Biscuit vs the vacuum'],
        },
      ],
    };
    const recall = createMemoryRecall({
      userId: 'u1',
      userName: 'Sam',
      store: jokes,
      world: { env, load: loadWorldModel(worldSources()) },
    });
    await recall.ready;
    const first = recall.noteFor(turns[0] ?? '') ?? '';
    expect(first).toContain('Biscuit vs the vacuum');
    expect(first).not.toContain('karaoke');
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
    // A dream that reads like an avoidance is still a dream.
    const same = mergeProfileSignals(
      {
        unspoken: { avoidances: [{ topic: 'moving abroad' }] },
        identity: { dreams: [{ description: 'moving abroad' }] },
      },
      null
    );
    expect(same.dreams?.map((d) => d.description)).toEqual(['moving abroad']);
    expect(mergeProfileSignals(undefined, null)).toEqual({
      avoidances: [],
      dreams: [],
      values: undefined,
    });
  });
});

describe('formatWorldNote under a tight budget', () => {
  it('keeps the guidance and as many avoidances as fit, never a bare header', () => {
    const negatives = Array.from({ length: 30 }, (_, i) => ({
      text: `a long and specific topic to avoid number ${i}`,
      source: 'user' as const,
    }));
    const snap = { people: [], relations: [], goals: [], negatives } as unknown as Parameters<
      typeof formatWorldNote
    >[0];
    const note = formatWorldNote(snap)?.note ?? '';
    expect(note.length).toBeLessThanOrEqual(WORLD_NOTE_MAX_CHARS);
    expect(note).toContain('Never list them.');
    expect(note).toContain("don't guess: ask");
    expect(note).toMatch(/Never bring up: a long and specific topic to avoid number 0/);
  });
});
