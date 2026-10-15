/**
 * Only what the caller said becomes a thread about them (synthetic call, prod shape of
 * 2026-10-13): the caller asks for a teammate by name, the teammate's handoff greeting
 * invents a topic ("the offer"), the after-call summary keeps it as the caller's, and the
 * next call opens with "did you hear back about the offer?".
 */
import { describe, expect, it } from 'vitest';
import { DISPLAY_NAMES } from '../../personas/persona-ids.js';
import {
  CALLER_PROVENANCE,
  TEAM_FIRST_NAMES,
  SPEAKER_RULE,
  saidByCaller,
  withCallerProvenance,
} from '../caller-assertions.js';
import {
  summarizeConversation,
  summarizeWithLLM,
  type ConversationTurn,
} from '../operations/summarizer.js';
import { formatRecall, loadRecallSnapshot, undisputed } from '../recall/session-recall.js';

const CALL: ConversationTurn[] = [
  { role: 'user', content: 'Hey, can I talk to Jordan?' },
  {
    role: 'assistant',
    content: "Hey Sam! Ferni told me you're weighing the offer. How's it looking?",
  },
  { role: 'user', content: 'Uh, sure. Can you help me do some planning for my sister’s visit?' },
  {
    role: 'assistant',
    content: 'Of course. When does she get in? And did you hear back on the offer?',
  },
  { role: 'user', content: 'She lands Friday.' },
];

/** What the model returned for that call: "the offer" is the teammate's, not Sam's. */
const MODEL_SUMMARY = {
  mainTopics: ["User's career offer", "Sister's visit"],
  keyPoints: ['User is weighing a job offer', 'Sister lands Friday'],
  emotionalArc: 'calm',
  openThreads: ['Whether to take the offer'],
  followUps: ['Did the user hear back about the offer?', "Ask how the sister's visit went"],
  userConcerns: ['the career offer'],
  relationshipProgress: 'met Jordan',
};

const summarize = (turns = CALL, json: object = MODEL_SUMMARY) => {
  let prompt = '';
  return summarizeWithLLM(
    's1',
    turns,
    async (p) => {
      prompt = p;
      return JSON.stringify(json);
    },
    { generateEmbedding: false }
  ).then((summary) => ({ summary, prompt }));
};

const storeOf = (summaries: Array<Record<string, unknown>>) => ({
  facts: async () => [],
  summaries: async () => summaries,
  forgotten: async () => [],
});

describe('after-call summary provenance', () => {
  it('tells the summarizer that what only the assistant said is not about the caller', async () => {
    const { prompt } = await summarize();
    expect(prompt).toContain(SPEAKER_RULE);
  });

  it("keeps only the caller's items, and labels the assistant's", async () => {
    const { summary } = await summarize();
    expect(summary.callerProvenance).toBe(CALLER_PROVENANCE);
    expect(
      JSON.stringify([summary.mainTopics, summary.keyPoints, summary.followUpItems])
    ).not.toMatch(/offer/i);
    expect(summary.questionsRemaining).toEqual([]);
    expect(summary.mainTopics).toEqual(["Sister's visit"]);
    expect(summary.followUpItems).toEqual(["Ask how the sister's visit went"]);
    expect(summary.assistantRaisedItems).toEqual(
      expect.arrayContaining([
        "User's career offer",
        'User is weighing a job offer',
        'Whether to take the offer',
        'Did the user hear back about the offer?',
      ])
    );
  });

  it("the next call's recall never asks about the invented topic", async () => {
    const { summary } = await summarize();
    const stored = JSON.parse(JSON.stringify(summary)) as Record<string, unknown>;
    const snap = await loadRecallSnapshot(storeOf([stored]), 'u1');
    expect(snap.followUps).toEqual(["Ask how the sister's visit went"]);
    expect(formatRecall(snap.facts, snap.followUps) ?? '').not.toMatch(/offer/i);
  });

  it('serves no threads from a summary written before provenance existed', async () => {
    const legacy = { followUpItems: ['Ask how the career offer is looking'] };
    const snap = await loadRecallSnapshot(storeOf([legacy]), 'u1');
    expect(snap.followUps).toEqual([]);
  });

  it('a reader never sees the labelled items, even if a writer left them in a field', () => {
    const s = undisputed({
      callerProvenance: 1,
      followUpItems: ['Ask about the offer', 'Ask about the visit'],
      assistantRaisedItems: ['Ask about the offer'],
    });
    expect(s.followUpItems).toEqual(['Ask about the visit']);
    expect(s).not.toHaveProperty('assistantRaisedItems');
  });

  it('the keyword summarizer keeps only topics from the caller and labels Ferni’s advice', async () => {
    const summary = await summarizeConversation(
      's1',
      [
        { role: 'user', content: 'Can I talk to Jordan?' },
        { role: 'assistant', content: 'Remember, the job offer is the key thing to weigh here.' },
      ],
      { generateEmbedding: false }
    );
    expect(summary.mainTopics).not.toContain('work');
    expect(summary.keyPoints.join(' ')).not.toContain('offer');
    expect(summary.assistantRaisedItems).toContain(
      'Remember, the job offer is the key thing to weigh here'
    );
    expect(summary.callerProvenance).toBe(CALLER_PROVENANCE);
  });
});

describe('saidByCaller', () => {
  it("backs an item with the caller's own words, give or take an ending", () => {
    expect(saidByCaller('Upcoming interview on Thursday', ['I have an interview Thursday'])).toBe(
      true
    );
    expect(saidByCaller("Sister's visit and the offer", ['My sister is visiting'])).toBe(false);
    expect(saidByCaller('Planning the move', ['We are moving and I need to plan'])).toBe(true);
    expect(saidByCaller("Sam's career offer", ['Hey, can I talk to Jordan?'])).toBe(false);
    // a teammate's name in the caller's line backs nothing up
    expect(saidByCaller('Plans with Jordan', ['Hey Jordan'])).toBe(false);
  });

  it("keeps the caller's real threads, said another way", () => {
    const keep: Array<[string, string]> = [
      ['How did the interview go?', "I've got a job interview Thursday"],
      ["Ask how the user's mom's surgery went", 'My mother has surgery on Monday'],
      ['Ask about the wedding plans', 'We are getting married in June and planning it all'],
      ['Ask how school went for the kids', 'The children start school tomorrow'],
      ['Ask how the move went', "We're moving on Saturday"],
    ];
    for (const [item, line] of keep) expect(saidByCaller(item, [line]), item).toBe(true);
  });

  it('never lets a different word with the same start vouch for one', () => {
    expect(saidByCaller('Ask about the offer', ["I'm off on Friday"])).toBe(false);
    expect(saidByCaller('Ask about the career', ['I really care about my sister'])).toBe(false);
    expect(saidByCaller('Ask about the offer', ['What offer?'], ['How is the offer?'])).toBe(false);
    const claim = ['How is the offer?'];
    expect(
      saidByCaller('Ask about the offer', ["No, that's wrong, there's no offer."], claim)
    ).toBe(false);
  });

  it('a word Ferni raised first never becomes theirs, whatever they say back', () => {
    const claim = ["Ferni told me you're weighing the offer."];
    const notTheirs = [
      'Um what offer',
      'So, um, what offer',
      'Hold on, what offer',
      'Excuse me, what offer',
      'Sorry, I mean, which offer',
      'Uh, what? The offer',
      'Wait. What. The offer',
      'Huh. Offer.',
      'Yeah, the offer thing.',
      'ok the offer',
      'Oh right, the offer.',
      'Hmm the offer',
      'The offer, I guess.',
      'Offer.',
      'Uh. The offer. Okay.',
      'Jordan, the offer',
      "I haven't gotten an offer",
    ];
    for (const reply of notTheirs) {
      expect(saidByCaller('Ask about the offer', [reply], claim), reply).toBe(false);
    }
    // even a reply that sounds like a claim: its words can't be told from an echo's
    expect(saidByCaller('Ask about the offer', ['I got the offer from Acme.'], claim)).toBe(false);
  });

  it("keeps what the caller adds when Ferni asks, not Ferni's own words", () => {
    const asked = ['How did the interview go?'];
    const answer = ['Great, I got the job at the bakery!'];
    expect(saidByCaller('Ask how the bakery job is going', answer, asked)).toBe(true);
    // the cost: Ferni's own "interview" isn't stored again from this call
    expect(saidByCaller('Ask how the interview went', answer, asked)).toBe(false);
  });

  it('labels what came from the assistant, and keeps a label the model chose for their talk', () => {
    const out = withCallerProvenance(
      { mainTopics: ['the offer'], keyPoints: [], followUpItems: ['the offer?'] },
      [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'How is the offer looking?' },
      ]
    );
    expect(out.mainTopics).toEqual([]);
    expect(out.followUpItems).toEqual([]);
    expect(out.assistantRaisedItems).toEqual(['the offer', 'the offer?']);
    const cooking = withCallerProvenance({ mainTopics: ['cooking'], keyPoints: [] }, [
      { role: 'user', content: 'I made risotto' },
    ]);
    expect(cooking.mainTopics).toEqual(['cooking']);
  });
});

describe('TEAM_FIRST_NAMES', () => {
  it('is the team in persona-ids', () => {
    const team = [
      'ferni',
      'peter-john',
      'alex-chen',
      'maya-santos',
      'jordan-taylor',
      'nayan-patel',
    ];
    expect([...TEAM_FIRST_NAMES]).toEqual(
      team.map((id) => DISPLAY_NAMES[id as keyof typeof DISPLAY_NAMES].toLowerCase())
    );
  });
});
