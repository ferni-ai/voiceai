/**
 * End to end over the memory path, synthetic call in the prod shape of 2026-10-13: the
 * caller asks for a teammate by name, the teammate's greeting invents "the offer", the
 * after-call summary is written from that call, and the next call's opener must not ask
 * about the offer. The model is stubbed; everything between it and the opener note is real.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

import { summarizeWithLLM } from '../../../memory/operations/summarizer.js';
import { createMemoryRecall } from '../memory-recall-hook.js';

const CALL = [
  { role: 'user' as const, content: 'Hey, can I talk to Jordan?' },
  {
    role: 'assistant' as const,
    content: "Hey Sam! Ferni told me you're weighing the offer. How's it looking?",
  },
  { role: 'user' as const, content: 'Uh, sure. Can you help me plan my sister’s visit?' },
  { role: 'assistant' as const, content: 'Of course! And did you hear back on the offer?' },
];

/** What a summarizer that ignored who said what returned (the prod summary's shape). */
const MODEL = {
  mainTopics: ["User's career offer", "Sister's visit"],
  keyPoints: ['User is weighing a job offer'],
  emotionalArc: 'calm',
  openThreads: ['Whether to take the offer'],
  followUps: ['Did the user hear back about the offer?', "Ask how the sister's visit went"],
  userConcerns: [],
  relationshipProgress: 'met Jordan',
};

async function nextCallOpener(summary: object): Promise<string> {
  const stored = JSON.parse(JSON.stringify(summary)) as Record<string, unknown>;
  const recall = createMemoryRecall({
    userId: 'u-synthetic',
    userName: 'Sam',
    store: { facts: async () => [], summaries: async () => [stored], forgotten: async () => [] },
    opener: true,
    checkIns: async () => [],
  });
  await recall.ready;
  return recall.noteFor('Hey Ferni!') ?? '';
}

describe('an invented topic never reaches the next call', () => {
  it("the opener follows up on the caller's thread and never on the offer", async () => {
    const summary = await summarizeWithLLM('s1', CALL, async () => JSON.stringify(MODEL), {
      generateEmbedding: false,
    });
    const note = await nextCallOpener(summary);
    expect(note).toContain("Ask how the sister's visit went");
    expect(note).not.toMatch(/offer/i);
  });

  it('a summary from before provenance opens with no thread at all', async () => {
    const note = await nextCallOpener({
      followUpItems: ['Did the user hear back about the offer?'],
    });
    expect(note).not.toMatch(/offer/i);
  });
});
