/**
 * MEMORY_TOOLS_HONEST: no memory tool claims to remember what the store recall reads
 * doesn't hold. The live tools write; the call-start recall's own reader
 * (loadRecallSnapshot over firestoreRecallStore) reads the same database. Only the
 * database, the memories service, the secret-check model and the search indexes are fakes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A Firestore holding documents by path: create, get, update, batches, and (unordered)
// collection reads, which is all the remember write, the update and recall use.
const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const depth = (p: string) => p.split('/').length;
  const apply = (path: string, data: Record<string, unknown>) => {
    const next = { ...docs.get(path) };
    // FieldValue.delete() and other sentinels: the field goes
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && v.constructor?.name !== 'Object') delete next[k];
      else next[k] = v;
    }
    docs.set(path, next);
  };
  const ref = (path: string): Record<string, unknown> => ({
    id: path.split('/').pop(),
    path,
    get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
    collection: (name: string) => col(`${path}/${name}`),
    create: async (data: Record<string, unknown>) => {
      if (docs.has(path)) throw Object.assign(new Error('already exists'), { code: 6 });
      docs.set(path, data);
    },
    set: async (data: Record<string, unknown>) => docs.set(path, data),
    update: async (data: Record<string, unknown>) => apply(path, data),
  });
  const col = (path: string) => {
    const eq: Array<[string, unknown]> = []; // where(field, '==', value), as the copies read uses
    const rows = () =>
      [...docs.keys()].filter(
        (p) =>
          p.startsWith(`${path}/`) &&
          depth(p) === depth(path) + 1 &&
          eq.every(([f, v]) => docs.get(p)?.[f] === v)
      );
    const q: Record<string, unknown> = {
      orderBy: () => q,
      where: (field: string, _op: string, value: unknown) => {
        eq.push([field, value]);
        return q;
      },
      limit: () => q,
      get: async () => {
        const paths = rows();
        const found = paths.map((p) => ({ id: p.split('/').pop(), data: () => docs.get(p) }));
        return { empty: paths.length === 0, docs: found };
      },
      doc: (id: string) => ref(`${path}/${id}`),
    };
    return q;
  };
  const batch = () => {
    const ops: Array<() => void> = [];
    return {
      update: (r: { path: string }, data: Record<string, unknown>) =>
        ops.push(() => apply(r.path, data)),
      create: (r: { path: string }, data: Record<string, unknown>) =>
        ops.push(() => docs.set(r.path, data)),
      commit: async () => ops.forEach((op) => op()),
    };
  };
  return { docs, db: { collection: (name: string) => col(name), batch } };
});
vi.mock('../../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fs.db,
}));
const memories = vi.hoisted(() => ({
  write: vi.fn(async () => ({ success: true, memoryId: 'mem_1' })),
  search: vi.fn(async (): Promise<string | null> => null),
  recordFeedback: vi.fn(),
}));
vi.mock('../../../../services/unified-memory-service.js', () => ({
  getUnifiedMemoryService: () => memories,
}));
// The secret check's model clears every fact here (remember-secret-check.test.ts)
vi.mock('../../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../config/gemini-config.js')>()),
  getGeminiClient: async () => ({
    models: { generateContent: async () => ({ text: '{"secret":false}' }) },
  }),
}));
// A forgotten fact's copies leave the search indexes; there are none here
vi.mock('../../../../memory/retrieval/conversation-index.js', () => ({
  removeConversationDocument: async () => undefined,
}));
vi.mock('../../../../memory/retrieval/semantic-memory-search.js', () => ({
  removeIndexedMemory: async () => undefined,
}));

// The agent process wires the Firestore fact store (gce/job-executor.ts loads this).
import '../../../../agents/remembered-fact-store-register.js';
import { firestoreRecallStore } from '../../../../agents/multi-agent/recall-firestore-store.js';
import { formatRecall, loadRecallSnapshot } from '../../../../memory/recall/session-recall.js';
import {
  predictUserNeedUnifiedDef,
  rememberAboutUserUnifiedDef,
  rememberImportantFactUnifiedDef,
} from '../tools-unified.js';
import { updateMemoryDef } from '../tools.js';
import { AMBIGUOUS, NO_MATCH, UPDATED } from '../honest-memory.js';
import { REMEMBERED, REMEMBERED_THIS_CALL } from '../remember-results.js';
import type { ToolDefinition } from '../../../registry/types.js';

let uid = 'u-honest-0';
let n = 0;

/** Runs the live tool as the agent would, for this test's caller. */
async function run(def: ToolDefinition, args: Record<string, unknown>): Promise<string> {
  const tool = def.create({ agentId: 'ferni' } as never) as unknown as {
    execute: (a: Record<string, unknown>, o: unknown) => Promise<string>;
  };
  return tool.execute(args, { ctx: { userData: { userId: uid } } });
}
const remember = async (fact: string) =>
  run(rememberAboutUserUnifiedDef, { fact, category: 'personal', importance: 'high' });

/** What the next call's recall holds: the call-start reader, over the same database. */
async function recalled(): Promise<string[]> {
  const snap = await loadRecallSnapshot(firestoreRecallStore, uid);
  return snap.facts.map((f) => f.value);
}
const factDocs = () => [...fs.docs.keys()].filter((p) => p.includes(`${uid}/dynamic_facts/`));

beforeEach(() => {
  uid = `u-honest-${++n}`; // the shared forgotten-topics read is per caller
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  fs.docs.clear();
});

describe('rememberAboutUser', () => {
  it('on: what it remembers is what the next call recalls, and only there', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    expect(await recalled()).toEqual([]);
    expect(await remember('my sister Dana is moving to Denver in June')).toBe(REMEMBERED);
    expect(await recalled()).toEqual(['my sister Dana is moving to Denver in June']);
    expect(memories.write).not.toHaveBeenCalled(); // one copy, where recall reads
  });

  it('off (the default): written to memories, and the next call recalls nothing', async () => {
    expect(await remember('my sister Dana is moving to Denver in June')).toBe(REMEMBERED);
    expect(memories.write).toHaveBeenCalledTimes(1);
    expect(await recalled()).toEqual([]);
  });

  it('on: a phone number is not kept, and the tool says so', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    const said = await remember("Dana's new number is (202) 555-0147");
    expect(said).toMatch(/^Not saved: phone numbers and emails/);
    expect(factDocs()).toEqual([]);
    expect(memories.write).not.toHaveBeenCalled();
  });

  it('on: a fact about a forgotten topic is not kept, and the tool says so', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    fs.docs.set(`bogle_users/${uid}/memory_state/forgotten`, { topics: ['divorce'] });
    const said = await remember('the divorce papers came through');
    expect(said).toMatch(/^Not saved: it's about something they asked you to forget/);
    expect(factDocs()).toEqual([]);
  });

  it('on: an anonymous caller is told it is kept for this call only', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    uid = 'anon:caller-1';
    expect(await remember('likes jazz')).toBe(REMEMBERED_THIS_CALL);
    expect(factDocs()).toEqual([]);
  });
});

describe('rememberImportantFact', () => {
  const important = async (fact: string) =>
    run(rememberImportantFactUnifiedDef, { fact, type: 'milestone', emotionalWeight: 'heavy' });

  it('on: the next call recalls it, and memories gets no copy', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    await important('finished chemo in March');
    expect(await recalled()).toEqual(['finished chemo in March']);
    expect(memories.write).not.toHaveBeenCalled();
  });

  it('off: written to memories only, as before', async () => {
    await important('finished chemo in March');
    expect(memories.write).toHaveBeenCalledTimes(1);
    expect(await recalled()).toEqual([]);
  });
});

/** A fact as the after-call extraction writes it (not one the caller asked to remember). */
const extracted = (entityName: string, key: string, value: string, source = 'deep_extraction') =>
  fs.docs.set(
    `bogle_users/${uid}/dynamic_facts/x_${entityName}_${key}_${value}`.replace(/\s/g, '_'),
    { entityName, key, value, confidence: 0.9, extractedAt: '2026-10-01T00:00:00.000Z', source }
  );

type Seed = [entity: string, key: string, value: string];

/** What recall holds, as entity|key|value, for "was anything else forgotten?". */
async function liveFacts(): Promise<string[]> {
  const snap = await loadRecallSnapshot(firestoreRecallStore, uid);
  return snap.facts.map((f) => `${f.entity}|${f.key}|${f.value}`).sort();
}

type Plant = Seed | { remember: string } | { forget: string } | { said: Seed; source: string };
async function plant(seeds: readonly Plant[]): Promise<void> {
  for (const p of seeds) {
    if (Array.isArray(p)) extracted(...p);
    else if ('remember' in p) await remember(p.remember);
    else if ('forget' in p)
      fs.docs.set(`bogle_users/${uid}/memory_state/forgotten`, { topics: [p.forget] }); // prettier-ignore
    else extracted(...p.said, p.source);
  }
}

const update = async (originalFact: string, updatedFact: string, userName?: string) => {
  const tool = updateMemoryDef.create({ agentId: 'ferni' } as never) as unknown as {
    execute: (a: Record<string, unknown>, o: unknown) => Promise<string>;
  };
  const userData = { userId: uid, ...(userName && { userName }) };
  return tool.execute({ originalFact, updatedFact, reason: 'correction' }, { ctx: { userData } });
};

describe('updateMemory: only the one fact quoted exactly', () => {
  beforeEach(() => vi.stubEnv('MEMORY_TOOLS_HONEST', 'on'));

  it('a remembered sentence, quoted: replaced; the next call recalls the new one only', async () => {
    await remember('my sister Dana lives in Denver');
    expect(await update('my sister Dana lives in Denver', 'my sister Dana lives in Boston')).toBe(UPDATED); // prettier-ignore
    expect(await recalled()).toEqual(['my sister Dana lives in Boston']);
  });

  it("the recall note's line, quoted with its [said ...] note: replaced", async () => {
    extracted('Dana', 'lives_in', 'Denver');
    extracted('user', 'lives_in', 'Denver');
    expect(await update('- Dana: lives in = Denver [said 28 days ago]', "the user's sister Dana lives in Boston")).toBe(UPDATED); // prettier-ignore
    expect(await liveFacts()).toEqual(["user|asked_to_remember|the user's sister Dana lives in Boston", 'user|lives_in|Denver']); // prettier-ignore
  });

  it("the caller's own line, under the name the recall note uses: replaced", async () => {
    extracted('user', 'job', 'nurse');
    expect(await update('Sam: job = nurse', "the user's job: teacher", 'Sam')).toBe(UPDATED);
    expect(await liveFacts()).toEqual(["user|asked_to_remember|the user's job: teacher"]);
  });

  it('case, spacing, quotes and a trailing full stop are ignored', async () => {
    await remember('my sister Dana lives in Denver');
    expect(await update('  "My sister  Dana lives in denver."', 'my sister Dana lives in Boston')).toBe(UPDATED); // prettier-ignore
  });

  it("the dog's name, quoted: only that; the dog-hair allergy is kept", async () => {
    extracted('user', 'allergic_to', 'dog hair');
    extracted('user', 'dog_name', 'Rex');
    expect(await update('dog name: Rex', "the user's dog is named Max")).toBe(UPDATED);
    expect(await liveFacts()).toEqual(["user|allergic_to|dog hair", "user|asked_to_remember|the user's dog is named Max"]); // prettier-ignore
  });

  it.each([
    ["the user's dog: Max", [['user', 'allergic_to', 'dog hair']] as Seed[]],
    ['my sister lives in Denver', [['Dana', 'lives_in', 'Denver']] as Seed[]],
    ['Dana lives in Denver', [['Dana', 'lives_in', 'Denver']] as Seed[]],
    ['Dana: lives in = Denve', [['Dana', 'lives_in', 'Denver']] as Seed[]],
    ['lives in = Denver and more', [['Dana', 'lives_in', 'Denver']] as Seed[]],
    ['Denv', [['Dana', 'lives_in', 'Denver']] as Seed[]],
    ['', [['Dana', 'lives_in', 'Denver']] as Seed[]],
  ])('a near miss (%j): nothing written, and it says so', async (was, seeds) => {
    seeds.forEach((f) => extracted(...f));
    const before = new Map(fs.docs);
    expect(await update(was, 'something new')).toBe(NO_MATCH);
    expect(fs.docs).toEqual(before);
  });

  it('two facts read exactly as quoted: refused, nothing changed', async () => {
    extracted('Dana', 'lives_in', 'Denver');
    extracted('user', 'lives_in', 'Denver');
    const before = new Map(fs.docs);
    expect(await update('Denver', 'Boston')).toBe(AMBIGUOUS);
    expect(fs.docs).toEqual(before);
  });

  it('a forgotten fact, quoted: nothing matched', async () => {
    extracted('Sam', 'lives_in', 'Boston');
    fs.docs.set(`bogle_users/${uid}/memory_state/forgotten`, { topics: ['Sam'] });
    expect(await update('Sam: lives in = Boston', 'Sam lives in Chicago')).toBe(NO_MATCH);
  });

  it('off: changes nothing recall reads and returns nothing, as before', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', '');
    vi.stubEnv('REMEMBER_TO_RECALL', 'on'); // so there is a fact to (not) update
    await remember('my sister Dana lives in Denver');
    await vi.waitFor(() => expect(factDocs()).toHaveLength(1));
    expect(await update('my sister Dana lives in Denver', 'my sister Dana lives in Boston')).toBe(
      ''
    );
    expect(await recalled()).toEqual(['my sister Dana lives in Denver']);
  });
});

const DANA_SISTER: Plant[] = [
  ['Dana', 'relation', 'sister'],
  ['Dana', 'lives_in', 'Denver'],
];

// The second independent verify of #3021 (/Volumes/Work/verify/3021-probes/v3021r2-subject):
// each may forget only the fact it names (`allowed`); 0 unrelated facts forgotten is the bar.
const ATTACKS: Array<[string, Plant[], string, string, string[]]> = [
  ['A1 coworker Dana, sister Dana on file', DANA_SISTER, 'my coworker Dana lives in Denver', 'my coworker Dana lives in Austin', []], // prettier-ignore
  ['A2 friend Dana, remembered sister Dana', [{ remember: 'my sister Dana lives in Denver' }], 'my friend Dana lives in Denver', 'my friend Dana lives in Austin', []], // prettier-ignore
  ['A3 brother Dana, sister Dana on file (caller said)', [{ said: ['Dana', 'relation', 'sister'], source: 'user-correction' }, ['Dana', 'lives_in', 'Denver']], 'my brother Dana lives in Denver', 'my brother Dana lives in Boston', []], // prettier-ignore
  ['A4 brother Dana, remembered sister Dana', [{ remember: 'my sister Dana lives in Denver' }], 'my brother Dana lives in Denver', 'my brother Dana lives in Boston', []], // prettier-ignore
  ['A5 lowercase name, owner fact', [['user', 'lives_in', 'Denver'], { remember: 'my sister dana lives in Denver' }], 'dana lives in Denver', 'dana lives in Boston', []], // prettier-ignore
  ['A6 lowercase unknown name, owner job', [['user', 'job', 'nurse at the hospital']], 'priya is a nurse at the hospital', 'priya is a doctor at the hospital', []], // prettier-ignore
  ['A7 Rose on file, "rose to manager"', [['Rose', 'job', 'manager at the bank'], ['user', 'job', 'teller at the bank']], 'rose to manager at the bank', 'promoted to director at the bank', []], // prettier-ignore
  ['A8 Will on file, "will be moving"', [['Will', 'moving_to', 'Denver in June'], ['user', 'moving_to', 'Denver in June']], 'will be moving to Denver in June', 'will be moving to Austin in June', []], // prettier-ignore
  ['A9 May on file, owner birthday in May', [['May', 'birthday', 'June 3'], ['user', 'birthday', 'May 3']], 'birthday is May 3', 'birthday is May 5', ['user|birthday|May 3']], // prettier-ignore
  ['A10 Bill on file, "bill owes"', [['Bill', 'owes', 'rent money'], ['user', 'owes', 'rent money to landlord']], 'bill owes rent money', 'bill paid the rent money', []], // prettier-ignore
  ['A11 "my hermana", owner fact', [['user', 'lives_in', 'Denver']], 'my hermana lives in Denver', 'my hermana lives in Boston', []], // prettier-ignore
  ['A12 "mi hermana", owner fact', [['user', 'lives_in', 'Denver']], 'mi hermana lives in Denver', 'mi hermana lives in Boston', []], // prettier-ignore
  ['A13 owner remembered as "Seth works as"', [{ remember: 'Seth works as a nurse at the hospital' }, ['user', 'name', 'Seth']], 'works as a nurse at the hospital', 'works as a doctor at the hospital', []], // prettier-ignore
  ['A14 Seth the dad on file', [['Seth', 'relation', 'father'], ['Seth', 'job', 'nurse at the hospital']], 'Seth works as a nurse at the hospital', 'Seth works as a doctor at the hospital', ['Seth|job|nurse at the hospital']], // prettier-ignore
  ['A15 forgotten person, lowercase', [['Sam', 'lives_in', 'Boston'], ['user', 'lives_in', 'Boston'], { forget: 'Sam' }], 'sam lives in Boston', 'sam lives in Chicago', []], // prettier-ignore
  ['A16 a relation an errand gave', [{ said: ['Priya', 'relation', 'wife'], source: 'errand' }, ['Priya', 'job', 'manager at the hospital']], 'my wife works at the hospital as a manager', 'my wife works at the clinic as a manager', []], // prettier-ignore
  ['A17 capitalised start, owner remembered', [{ remember: 'Works as a nurse at the hospital' }, ['Works', 'x', 'y']], 'Works as a nurse at the hospital', 'Works as a doctor at the hospital', ['user|asked_to_remember|Works as a nurse at the hospital']], // prettier-ignore
  ['A18 capitalised "Lives", a person fact', [['Sam', 'lives_in', 'Boston'], { remember: 'Lives in Boston' }], 'Lives in Boston', 'Lives in Chicago', ['user|asked_to_remember|Lives in Boston']], // prettier-ignore
  ['A19 "She", remembered sister', [{ remember: 'my sister Dana lives in Denver' }], 'She lives in Denver', 'She lives in Boston', []], // prettier-ignore
  ['A20 owner request, remembered other person', [{ remember: 'Dana lives in Denver' }, ['user', 'lives_in', 'Denver']], 'I live in Denver', 'I live in Boston', ['user|lives_in|Denver']], // prettier-ignore
];

// The third independent verify of #3021 (/Volumes/Work/verify/3021-probes/v3021r3-fresh)
const CITY: Plant[] = [['user', 'lives_in', 'Denver']];
const ATTACKS_R3: Array<[string, Plant[], string, string, string[]]> = [
  ['B1 "my bank", the caller\'s bank and Dana at a bank', [['user', 'bank', 'Chase downtown'], ['Dana', 'works_at', 'the bank downtown']], 'my bank is Chase downtown', 'my bank is Ally online', ['user|bank|Chase downtown']], // prettier-ignore
  ['B11 "my ex", the caller\'s city', CITY, 'my ex lives in Denver', 'my ex lives in Boston', []],
  ['B12 "my bf", the caller\'s city', CITY, 'my bf lives in Denver', 'my bf lives in Boston', []],
  [
    'B13 "my 妹妹", the caller\'s city',
    CITY,
    'my 妹妹 lives in Denver',
    'my 妹妹 lives in Boston',
    [],
  ],
  ['B14 "my сестра", the caller\'s city', CITY, 'my сестра lives in Denver', 'my сестра lives in Boston', []], // prettier-ignore
  ['B15 "my ex", the caller\'s job', [['user', 'job', 'nurse at the hospital']], 'my ex is a nurse at the hospital', 'my ex is a doctor at the hospital', []], // prettier-ignore
  ['B17 the caller gave Dana two relations, a bare Dana city', [{ said: ['Dana', 'relation', 'sister'], source: 'user-correction' }, { said: ['Dana', 'relation', 'brother'], source: 'user-correction' }, ['Dana', 'lives_in', 'Denver']], 'my brother Dana lives in Denver', 'my brother Dana lives in Boston', []], // prettier-ignore
  ['B17b extraction gave Dana two relations, a bare Dana city', [['Dana', 'relation', 'sister'], ['Dana', 'relation', 'brother'], ['Dana', 'lives_in', 'Denver']], 'my brother Dana lives in Denver', 'my brother Dana lives in Boston', []], // prettier-ignore
  ['B18 two remembered Danas, a bare Dana city', [{ remember: 'my sister Dana lives in Denver' }, { remember: 'my brother Dana works at the bank' }, ['Dana', 'lives_in', 'Denver']], 'my brother Dana lives in Denver', 'my brother Dana lives in Boston', []], // prettier-ignore
  ['B22 two people in one request', [{ said: ['Dana', 'relation', 'sister'], source: 'user-correction' }, ['Dana', 'lives_in', 'Denver'], ['user', 'lives_in', 'Denver']], 'my sister Dana and I live in Denver', 'we live in Boston', []], // prettier-ignore
];

// The first independent verify of #3021: shared words about another person
const R1: Array<[string, Plant[], string, string, string[]]> = [
  ["another relative's birthday", [['Dad', 'birthday', 'May 3']], "Mom's birthday is May 3", "Mom's birthday is May 5", []], // prettier-ignore
  ["a brother's city, correcting a sister's", [['Sam', 'lives_in', 'Boston'], ['Sam', 'relation', 'brother']], 'my sister lives in Boston', 'my sister lives in Chicago', []], // prettier-ignore
  ["the caller's job, correcting a spouse's", [['user', 'job', 'nurse at the hospital']], 'my husband is a nurse at the hospital', 'my husband is a doctor', []], // prettier-ignore
  ["the caller's allergy, correcting a child's", [['user', 'allergy', 'peanuts']], "my son's allergy is peanuts", "my son's allergy is shellfish", []], // prettier-ignore
];
// The fourth: one shared word, the right person's wrong fact
const R4: Array<[string, Plant[], string, string, string[]]> = [
  ["C2 the user's dog vs the dog-hair allergy", [['user', 'allergic_to', 'dog hair']], "the user's dog: Bella", "the user's dog: Max", []], // prettier-ignore
  ['C4 "I live in Denver" vs favorite city', [['user', 'favorite_city', 'Denver']], 'I live in Denver', 'I live in Boston', []], // prettier-ignore
  ['C7 me and dana', [['Dana', 'lives_in', 'Denver'], ['user', 'lives_in', 'Denver']], 'me and dana live in Denver', 'we live in Boston', []], // prettier-ignore
  ["C10 Mom's car vs Mom's car insurance", [['Mom', 'car_insurance', 'State Farm']], "Mom's car: Honda", "Mom's car: Toyota", []], // prettier-ignore
  ["C11 the user's favorite vs favorite color", [['user', 'favorite_color', 'blue']], "the user's favorite: pizza", "the user's favorite: tacos", []], // prettier-ignore
  ["C12 a partner's business partner", [['Lee', 'relation', 'partner'], ['Lee', 'business_partner', 'Kim'], ['user', 'business_partner', 'Kim']], "my partner's business partner: Kim", "my partner's business partner: Jo", []], // prettier-ignore
  ["C16 the user's car vs car insurance", [['user', 'car_insurance', 'Geico']], "the user's car: Honda", "the user's car: Toyota", []], // prettier-ignore
  ['C17 "I work downtown" vs gym', [['user', 'gym', 'downtown YMCA']], 'I work downtown', 'I work uptown', []], // prettier-ignore
];

describe('updateMemory forgets nothing it was not quoted: every verify round', () => {
  beforeEach(() => vi.stubEnv('MEMORY_TOOLS_HONEST', 'on'));

  it.each([...R1, ...ATTACKS, ...ATTACKS_R3, ...R4])('%s', async (_, seeds, was, now, allowed) => {
    await plant(seeds);
    const before = await liveFacts();
    await update(was, now);
    const after = await liveFacts();
    const forgotten = before.filter((f) => !after.includes(f));
    expect(forgotten.filter((f) => !allowed.includes(f))).toEqual([]);
  });
});

describe('updateMemory, quoting what recall showed (product check)', () => {
  beforeEach(() => vi.stubEnv('MEMORY_TOOLS_HONEST', 'on'));
  // A natural fact base; the model quotes each line of the recall note it was given
  const BASE: Plant[] = [
    ['Dana', 'relation', 'sister'], ['Dana', 'lives_in', 'Denver'], ['user', 'job', 'nurse'],
    ['user', 'favorite_color', 'blue'], ['Dana', 'birthday', 'May 3'], ['user', 'kids', 'two'],
    ['Rex', 'species', 'dog'], ['Rex', 'breed', 'beagle'], ['Mom', 'lives_in', 'Florida'],
    { remember: 'User is allergic to peanuts' }, { remember: 'Has a standing yoga class on Tuesdays' },
  ]; // prettier-ignore
  const NOTE_LINES: Array<[string, string]> = [
    ['Dana: lives in = Denver', 'Dana|lives_in|Denver'],
    ['Dana: birthday = May 3', 'Dana|birthday|May 3'],
    ['Dana: relation = sister', 'Dana|relation|sister'],
    ['them: job = nurse', 'user|job|nurse'],
    ['them: favorite color = blue', 'user|favorite_color|blue'],
    ['them: kids = two', 'user|kids|two'],
    ['Rex: species = dog', 'Rex|species|dog'],
    ['Rex: breed = beagle', 'Rex|breed|beagle'],
    ['Mom: lives in = Florida', 'Mom|lives_in|Florida'],
    ['them: asked to remember = User is allergic to peanuts', 'user|asked_to_remember|User is allergic to peanuts'], // prettier-ignore
    ['them: asked to remember = Has a standing yoga class on Tuesdays', 'user|asked_to_remember|Has a standing yoga class on Tuesdays'], // prettier-ignore
    ['beagle', 'Rex|breed|beagle'],
  ];

  it('every line the recall note shows reads as one of these quotes', async () => {
    await plant(BASE);
    const note =
      formatRecall((await loadRecallSnapshot(firestoreRecallStore, uid)).facts, []) ?? '';
    for (const [line] of NOTE_LINES.slice(0, -1)) expect(note).toContain(`- ${line} [said`);
  });

  it.each(NOTE_LINES)(
    'quoted %j: replaced, and only that fact is forgotten',
    async (line, fact) => {
      await plant(BASE);
      const note =
        formatRecall((await loadRecallSnapshot(firestoreRecallStore, uid)).facts, []) ?? '';
      const shown = note.split('\n').find((l) => l.startsWith(`- ${line} [`)) ?? line; // with its [said ...] note
      const before = await liveFacts();
      expect(await update(shown, 'the corrected detail')).toBe(UPDATED);
      const after = await liveFacts();
      expect(before.filter((f) => !after.includes(f))).toEqual([fact]);
    }
  );
});

describe('predictUserNeed', () => {
  const predict = async () =>
    run(predictUserNeedUnifiedDef, {
      context: 'mentioned a long day',
      prediction: 'might want help winding down',
      confidence: 'medium',
    });

  it('on: writes nothing anywhere, and labels the guess as a guess', async () => {
    vi.stubEnv('MEMORY_TOOLS_HONEST', 'on');
    const said = await predict();
    expect(said).toMatch(/^A guess, not something they told you: might want help winding down\./);
    expect(memories.write).not.toHaveBeenCalled();
    expect([...fs.docs.keys()]).toEqual([]);
  });

  it('off: stores the guess as a memory, as before', async () => {
    await predict();
    expect(memories.write).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringMatching(/^Prediction: /) })
    );
  });
});
