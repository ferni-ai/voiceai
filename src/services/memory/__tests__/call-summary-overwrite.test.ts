/**
 * The next call's "Last time:" must be the LLM's key points, never the fallback's quotes.
 *
 * Prod 2026-10-17: the session-end save wrote the LLM summary to the profile, then the
 * background summarizer (summarizeConversationAsync) ran a second LLM pass that kept no
 * key points and wrote "Discussed: Yep; Just checking you out" over it. The next call
 * opened on that quote list.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory Firestore: documents by path. Nothing here may reach Google Cloud.
const docs = new Map<string, Record<string, unknown>>();
const turnsOf = (path: string) =>
  [...docs.entries()]
    .filter(([p]) => p.startsWith(`${path}/turns/`))
    .map(([, data]) => ({ data: () => data }));
const docRef = (path: string): Record<string, unknown> => ({
  collection: (name: string) => collectionRef(`${path}/${name}`),
  get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
  set: async (data: Record<string, unknown>) => void docs.set(path, data),
  update: async (data: Record<string, unknown>) =>
    void docs.set(path, { ...(docs.get(path) ?? {}), ...data }),
});
const collectionRef = (path: string): Record<string, unknown> => {
  const query = {
    orderBy: () => query,
    limit: () => query,
    get: async () => ({ docs: turnsOf(path.replace(/\/turns$/, '')) }),
  };
  return { doc: (id: string) => docRef(`${path}/${id}`), ...query };
};
vi.mock('@google-cloud/firestore', () => ({
  Firestore: class {
    collection = (name: string) => collectionRef(name);
  },
  FieldValue: { increment: (n: number) => n },
}));

// The background summarizer's LLM pass: each test sets what it returns.
const llm = vi.hoisted(() => ({ keyPoints: [] as string[], fail: false }));
vi.mock('../../../memory/index.js', () => ({
  summarizeWithLLM: async () => {
    if (llm.fail) throw new Error('LLM timeout');
    return { keyPoints: llm.keyPoints };
  },
}));
vi.mock('../../llm-utils.js', () => ({ createSummarizationLLMCaller: () => async () => '' }));

const { summarizeConversationAsync } = await import('../realtime-memory.js');
const { buildRelationshipContext } = await import('../../../context/context-builders.js');
const { createUserProfile } = await import('../../../types/user-profile.js');

const USER = 'voice-eval-user';
const CONV = 'conv_1';
const KEY_POINTS = 'USER is planning a trip to Lisbon; USER starts a new job Monday';

/** A call where the caller only said filler, and the session-end save already ran. */
function callWithFillerAfterSessionSave(): void {
  docs.set(`bogle_users/${USER}`, { lastConversationSummary: KEY_POINTS });
  docs.set(`bogle_users/${USER}/conversations/${CONV}`, { summarized: false });
  const lines: Array<[string, string]> = [
    ['assistant', 'Hey, good to hear from you.'],
    ['user', 'Yep'],
    ['assistant', 'What brings you by?'],
    ['user', 'Just checking you out'],
  ];
  lines.forEach(([role, content], i) =>
    docs.set(`bogle_users/${USER}/conversations/${CONV}/turns/t${i}`, {
      role,
      content,
      timestamp: new Date(2026, 9, 17, 6, 0, i),
    })
  );
}

const stored = () => docs.get(`bogle_users/${USER}`)?.lastConversationSummary;

beforeEach(() => {
  docs.clear();
  llm.keyPoints = [];
  llm.fail = false;
});

describe('summarizeConversationAsync after the session-end save', () => {
  it('leaves the stored LLM summary when its own LLM pass keeps no key points', async () => {
    callWithFillerAfterSessionSave();

    await summarizeConversationAsync(USER, CONV);

    expect(stored()).toBe(KEY_POINTS);
    // The conversation is still marked summarized, with no filler quote list
    const conv = docs.get(`bogle_users/${USER}/conversations/${CONV}`);
    expect(conv?.summarized).toBe(true);
    expect(conv?.summary).toBe('Brief conversation');
  });

  it('leaves the stored LLM summary when its own LLM pass fails', async () => {
    callWithFillerAfterSessionSave();
    llm.fail = true;

    await summarizeConversationAsync(USER, CONV);

    expect(stored()).toBe(KEY_POINTS);
  });

  it('still stores its own LLM key points', async () => {
    callWithFillerAfterSessionSave();
    llm.keyPoints = ['USER adopted a dog named Biscuit', 'USER moves house in May', 'third'];

    await summarizeConversationAsync(USER, CONV);

    expect(stored()).toBe('USER adopted a dog named Biscuit; USER moves house in May');
  });

  it("gives the next call's context the key points, not the caller's filler", async () => {
    callWithFillerAfterSessionSave();

    await summarizeConversationAsync(USER, CONV);

    const profile = {
      ...createUserProfile(USER),
      lastConversationSummary: stored() as string,
    };
    const context = buildRelationshipContext(profile);
    expect(context).toContain(`Last time: ${KEY_POINTS}`);
    expect(context).not.toContain('Discussed:');
    expect(context).not.toContain('Just checking you out');
  });
});
