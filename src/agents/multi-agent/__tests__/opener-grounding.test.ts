/**
 * End to end over the memory path, synthetic call in the prod shape of 2026-10-13: the
 * caller asks for a teammate by name, the teammate's greeting invents "the offer", the
 * after-call summary is written from that call, and the next call's opener must not ask
 * about the offer. The model is stubbed; everything between it and the opener note is real.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));

import { summarizeWithLLM } from '../../../memory/operations/summarizer.js';
import { callerHistory, greetingFacts } from '../greeting-direction.js';
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

  const afterTheClaim = (reply: string, model: object) =>
    summarizeWithLLM(
      's2',
      [
        { role: 'user', content: 'Can I talk to Jordan? I am off on Friday.' },
        { role: 'assistant', content: "Hey Sam! Ferni told me you're weighing the offer." },
        { role: 'user', content: reply },
      ],
      async () => JSON.stringify({ ...MODEL, ...model }),
      { generateEmbedding: false }
    );

  it('the caller echoing it ("What offer?") or a word like "off" does not make it theirs', async () => {
    for (const reply of [
      'What offer?',
      'what offer',
      'What offer.',
      'Sorry, what offer?',
      'Wait, what offer?',
      "What offer? I don't have any offer.",
      "I don't know what offer you mean.",
      "There's no offer.",
      "I haven't gotten an offer",
      "I'm not sure what offer you're talking about",
      'Ok.',
      'No, there is no offer.',
      "I'm confused, the offer.",
      "Where'd that offer come from",
      'Who said anything about an offer',
      'Nobody gave me an offer.',
      'I wish I had an offer.',
      'Forget the offer.',
      'Ugh, the offer.',
      'Cool, the offer.',
      'Funny you bring up the offer',
      'Yeah, the offer thing.',
      'Huh. Offer.',
    ]) {
      const summary = await afterTheClaim(reply, { followUps: ['Ask about the offer'] });
      expect(await nextCallOpener(summary), reply).not.toMatch(/offer/i);
    }
  });

  it('a paraphrase neither of them said never becomes "what you talked about last time"', async () => {
    const summary = await afterTheClaim('Ok.', {
      keyPoints: ['User is considering a new job opportunity'],
    });
    const history = callerHistory({
      totalConversations: 2,
      lastConversationSummary: summary.keyPoints.slice(0, 2).join('; '),
    });
    expect(JSON.stringify(greetingFacts('evening', 'Sam', history))).not.toMatch(/job|offer/i);
  });

  it("a teammate's invented job is not backed by the caller working a lot", async () => {
    const summary = await summarizeWithLLM(
      's3',
      [
        { role: 'user', content: 'Can I talk to Jordan?' },
        { role: 'assistant', content: "Ferni told me you're starting a new job!" },
        { role: 'user', content: "Yeah I'm working a lot." },
      ],
      async () => JSON.stringify({ ...MODEL, followUps: ['Ask about the new job'] }),
      { generateEmbedding: false }
    );
    expect(await nextCallOpener(summary)).not.toMatch(/job/i);
  });
});
