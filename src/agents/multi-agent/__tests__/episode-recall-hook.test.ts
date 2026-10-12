import { describe, expect, it, vi } from 'vitest';
import { createMemoryRecall } from '../memory-recall-hook.js';
import type { RetrievalEmbedder } from '../../../memory/recall/semantic-recall.js';

// Nothing was extracted about Pete's number: only the call's own words have it.
const store = { facts: async () => [], summaries: async () => [] };
const episodeStore = {
  calls: async () => [
    {
      id: 'c1',
      at: '2026-01-05T18:00:00.000Z',
      lines: [
        'Hey, could you call my brother?',
        'This name is Pete.',
        "Uh, yes. It's uh 435 339 7687.",
      ],
    },
  ],
};
const embed: RetrievalEmbedder = async (texts) =>
  texts.map((t) =>
    /brother|pete|phone|number/i.test(t) ? [1, 0.05, 0.05, 0.05] : [0.05, 1, 0.05, 0.05]
  );
const settle = () => new Promise((r) => setTimeout(r, 0));
const noLedger = { save: async () => undefined, recent: async () => [] };

async function ask(episodes: boolean): Promise<string> {
  const recall = createMemoryRecall({
    userId: 'u-pete',
    store,
    ledgerStore: noLedger,
    checkIns: async () => [],
    semantic: true,
    episodes,
    episodeStore,
    embed,
  });
  await recall.ready;
  await settle();
  await settle(); // the episode index
  recall.noteFor('hey there');
  recall.newTurn();
  const early = recall.noteFor("what's my brother's number");
  await settle();
  return [early, recall.noteFor("what's my brother's number again?")].join('\n');
}

describe('episode recall in the live hook', () => {
  it("quotes the caller's own words when no fact holds the answer", async () => {
    const note = await ask(true);
    expect(note).toContain("It's uh 435 339 7687.");
    expect(note).toContain('in their own words');
  });

  it('is off unless asked for', async () => {
    expect(await ask(false)).not.toContain('435 339 7687');
  });
});

describe('summary snippets in the live hook (RECALL_SUMMARIES)', () => {
  const withSummary = {
    facts: async () => [],
    // Keyed on the caller: the hook must read its own user's summaries.
    summaries: vi.fn(async (uid: string) =>
      uid === 'u-sum'
        ? [
            {
              timestamp: '2026-01-09T18:00:00.000Z',
              keyPoints: ['User is moving his Vanguard account into a Roth IRA'],
            },
          ]
        : []
    ),
  };

  it('quotes the dated key point a turn is about; off, never', async () => {
    const on = createMemoryRecall({ userId: 'u-sum', store: withSummary, summaries: true });
    await on.ready;
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
    expect(on.noteFor('what did I decide about the Roth')).toContain(
      '- From our call on Jan 9: "User is moving his Vanguard account into a Roth IRA"'
    );
    expect(withSummary.summaries).toHaveBeenCalledWith('u-sum');

    const off = createMemoryRecall({ userId: 'u-sum', store: withSummary, summaries: false });
    await off.ready;
    expect(off.noteFor('what did I decide about the Roth') ?? '').not.toContain('From our call');
  });
});
