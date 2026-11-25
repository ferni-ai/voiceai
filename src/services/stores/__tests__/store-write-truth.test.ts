/**
 * STORE_WRITES_TRUTHFUL (#4260, #4261): when a life-automation store cannot save to Firestore,
 * the tool on top says it couldn't and the next read still shows the state before the change.
 * Off, as on main: the tool reports the change done. Real stores and real tools over an
 * in-memory Firestore whose writes can be made to fail. Every name here is made up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const state = { failWrites: false, failReads: false, writes: 0 };
  const doc = (path: string): Record<string, unknown> => ({
    collection: (name: string) => ({ doc: (id: string) => doc(`${path}/${name}/${id}`) }),
    get: async () => {
      if (state.failReads) throw new Error('read failed');
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => structuredClone(data) };
    },
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      state.writes++;
      if (state.failWrites) throw new Error('write failed');
      const base = opts?.merge ? (docs.get(path) ?? {}) : {};
      docs.set(path, structuredClone({ ...base, ...data }));
    },
  });
  const db = { collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }) };
  return { docs, state, db };
});

vi.mock('../../../utils/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getFirestoreDb: () => fs.db,
}));

const workflows = await import('../workflow-store.js');
const subscriptions = await import('../subscription-store.js');
const meals = await import('../meal-store.js');
const documents = await import('../document-store.js');
const { routineToolDefinitions } = await import('../../../tools/domains/routines/index.js');
const { definitions: automationTools } = await import('../../../tools/domains/workflows/index.js');
const { definitions: commerceTools } = await import('../../../tools/domains/commerce/index.js');

const COULDNT = /\bcouldn't\b/i;
const saved = { ...process.env };
let n = 0;
let uid = '';

beforeEach(() => {
  uid = `riley-test-${++n}`;
  fs.state.failWrites = false;
  fs.state.failReads = false;
});
afterEach(() => {
  process.env = { ...saved };
});

const on = (): void => {
  process.env.STORE_WRITES_TRUTHFUL = 'on';
};

type Tools = ReadonlyArray<{ id: string; create: (ctx: never) => unknown }>;
async function run(tools: Tools, id: string, args: Record<string, unknown>): Promise<string> {
  const def = tools.find((d) => d.id === id);
  if (!def) throw new Error(`no tool ${id}`);
  const tool = def.create({ userId: uid } as never) as {
    execute: (a: unknown, o: unknown) => Promise<unknown>;
  };
  return String(await tool.execute(args, {}));
}

async function seedRoutine(): Promise<void> {
  await workflows.createWorkflow(uid, {
    name: 'Morning Ferns',
    status: 'active',
    trigger: { type: 'phrase', phrases: ['good morning'], requireExactMatch: false },
    conditions: [],
    actions: [],
    variables: {},
    tags: [],
    isTemplate: false,
  });
}

const routine = async () =>
  (await workflows.getWorkflowData(uid)).workflows.find((w) => w.name === 'Morning Ferns');

async function seedSubscription(): Promise<void> {
  await subscriptions.addSubscription(uid, {
    name: 'Fern Monthly',
    category: 'streaming',
    status: 'active',
    amount: 9,
    currency: 'USD',
    frequency: 'monthly',
    startDate: '2026-01-01',
    detectedFrom: 'manual',
    autoRenew: true,
    tags: [],
  });
}

const fernMonthly = async () =>
  (await subscriptions.getSubscriptionData(uid)).subscriptions.find(
    (s) => s.name === 'Fern Monthly'
  );

describe('routines: pause and remove when the save fails', () => {
  it("flag on: pause says it couldn't, and the routine is still active on the next read", async () => {
    await seedRoutine();
    on();
    fs.state.failWrites = true;
    const reply = await run(routineToolDefinitions, 'toggleRoutine', {
      routineName: 'Morning Ferns',
      action: 'pause',
    });
    expect(reply).toMatch(COULDNT);
    fs.state.failWrites = false;
    expect((await routine())?.status).toBe('active');
  });

  it('off: pause reports it done, as on main, though the next read shows it active', async () => {
    await seedRoutine();
    fs.state.failWrites = true;
    const reply = await run(routineToolDefinitions, 'toggleRoutine', {
      routineName: 'Morning Ferns',
      action: 'pause',
    });
    expect(reply).toBe(`Okay, I'll put "Morning Ferns" on hold for now.`);
    fs.state.failWrites = false;
    expect((await routine())?.status).toBe('active');
  });

  it("flag on: remove says it couldn't, and the routine is still there", async () => {
    await seedRoutine();
    on();
    fs.state.failWrites = true;
    const reply = await run(routineToolDefinitions, 'removeRoutine', {
      routineName: 'Morning Ferns',
    });
    expect(reply).toMatch(COULDNT);
    fs.state.failWrites = false;
    expect(await routine()).toBeDefined();
  });

  it('off: remove reports it removed, as on main', async () => {
    await seedRoutine();
    fs.state.failWrites = true;
    const reply = await run(routineToolDefinitions, 'removeRoutine', {
      routineName: 'Morning Ferns',
    });
    expect(reply).toBe(`Removed "Morning Ferns" - I won't do that anymore.`);
  });

  it('flag on, healthy store: pause pauses and says so', async () => {
    await seedRoutine();
    on();
    const reply = await run(routineToolDefinitions, 'toggleRoutine', {
      routineName: 'Morning Ferns',
      action: 'pause',
    });
    expect(reply).toBe(`Okay, I'll put "Morning Ferns" on hold for now.`);
    expect((await routine())?.status).toBe('paused');
  });

  it('a failed read is not called a failed save: the reply is the general error, flag on', async () => {
    await seedRoutine();
    on();
    fs.state.failReads = true;
    const reply = await run(routineToolDefinitions, 'toggleRoutine', {
      routineName: 'Morning Ferns',
      action: 'pause',
    });
    expect(reply).toBe('Something went wrong. Let me try again in a moment.');
  });
});

describe('automations: pause and delete when the save fails', () => {
  it("flag on: pause and delete say they couldn't, and the automation is unchanged", async () => {
    await seedRoutine();
    on();
    fs.state.failWrites = true;
    expect(await run(automationTools, 'pauseAutomation', { name: 'Morning Ferns' })).toMatch(
      COULDNT
    );
    expect(await run(automationTools, 'deleteAutomation', { name: 'Morning Ferns' })).toMatch(
      COULDNT
    );
    fs.state.failWrites = false;
    expect((await routine())?.status).toBe('active');
  });

  it('off: delete reports it deleted, as on main', async () => {
    await seedRoutine();
    fs.state.failWrites = true;
    const reply = await run(automationTools, 'deleteAutomation', { name: 'Morning Ferns' });
    expect(reply).not.toMatch(COULDNT);
    expect(reply).toMatch(/Deleted \*\*Morning Ferns\*\*/);
  });
});

describe('subscription cancel when the save fails', () => {
  it("flag on: says it couldn't, names the subscription, and it is still active", async () => {
    await seedSubscription();
    on();
    fs.state.failWrites = true;
    const reply = await run(commerceTools, 'cancelSubscription', { name: 'fern monthly' });
    expect(reply).toBe("I couldn't mark **Fern Monthly** as cancelled just now. Nothing changed.");
    fs.state.failWrites = false;
    expect((await fernMonthly())?.status).toBe('active');
  });

  it('off: reports it cancelled, as on main', async () => {
    await seedSubscription();
    fs.state.failWrites = true;
    const reply = await run(commerceTools, 'cancelSubscription', { name: 'fern monthly' });
    expect(reply).toMatch(/^I've marked \*\*Fern Monthly\*\* as cancelled\./);
  });

  it('flag on, healthy store: cancels and says so', async () => {
    await seedSubscription();
    on();
    const reply = await run(commerceTools, 'cancelSubscription', { name: 'fern monthly' });
    expect(reply).toMatch(/^I've marked \*\*Fern Monthly\*\* as cancelled\./);
    expect((await fernMonthly())?.status).toBe('cancelled');
  });
});

describe('meal and document stores: a person with nothing saved yet', () => {
  it('flag on: the meal save rejects and the next read has no trace of it', async () => {
    on();
    fs.state.failWrites = true;
    const save = meals.saveMealData(uid, { favoriteRecipeIds: ['recipe-fern-soup'] });
    await expect(save).rejects.toThrow('STORE_WRITES_TRUTHFUL: the meals change was not saved');
    fs.state.failWrites = false;
    expect((await meals.getMealData(uid)).favoriteRecipeIds).toEqual([]);
  });

  it('off: the meal save resolves and the change lives in memory, as on main', async () => {
    fs.state.failWrites = true;
    await meals.saveMealData(uid, { favoriteRecipeIds: ['recipe-fern-soup'] });
    fs.state.failWrites = false;
    expect((await meals.getMealData(uid)).favoriteRecipeIds).toEqual(['recipe-fern-soup']);
  });

  it('flag on: two failed saves in a row still leave nothing behind', async () => {
    on();
    fs.state.failWrites = true;
    await expect(meals.saveMealData(uid, { favoriteRecipeIds: ['a'] })).rejects.toThrow();
    await expect(meals.saveMealData(uid, { favoriteRecipeIds: ['b'] })).rejects.toThrow();
    fs.state.failWrites = false;
    expect((await meals.getMealData(uid)).favoriteRecipeIds).toEqual([]);
  });

  it('flag on: the document save rejects with a message that names only the domain', async () => {
    on();
    fs.state.failWrites = true;
    const settings = {
      defaultExpirationReminderDays: 45,
      autoExtractText: true,
      autoCategorizeTags: true,
    };
    const save = documents.saveDocumentData(uid, { settings });
    await expect(save).rejects.toThrow('STORE_WRITES_TRUTHFUL: the documents change was not saved');
    fs.state.failWrites = false;
    expect((await documents.getDocumentData(uid)).settings.defaultExpirationReminderDays).toBe(30);
  });
});
