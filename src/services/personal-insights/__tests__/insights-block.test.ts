import { describe, expect, it, vi } from 'vitest';
import {
  buildEvidence,
  generateInsights,
  ruleBasedOpeners,
  validateGrounded,
} from '../insight-generator.js';
import { buildPeopleModel } from '../people-model.js';
import { formatPersonNote, formatSessionBlock } from '../session-block.js';
import { buildLifeThreads } from '../topic-threads.js';
import type { Evidence, InsightBundle } from '../types.js';
import { NOW, fact, sources, summary } from './fixtures.js';

const evidence: Evidence[] = [
  {
    id: 'E1',
    text: "Linda (their mom): Check on mom's surgery next week (3 days ago)",
    at: NOW,
    personId: 'p_mom',
    sensitive: 'health',
    sourceConversationIds: ['c2'],
  },
  {
    id: 'E2',
    text: '"Sleep" came up in 3 conversations, last 1 days ago (rising)',
    at: NOW,
    sensitive: 'health',
    sourceConversationIds: ['c3', 'c4', 'c5'],
  },
  {
    id: 'E3',
    text: '"Marathon training" came up in 4 conversations, last 2 days ago (rising)',
    at: NOW,
    sourceConversationIds: ['c6'],
  },
];

describe('opener and insight grounding', () => {
  it('accepts grounded items and carries their provenance', () => {
    const out = validateGrounded(
      [{ text: "How did Linda's surgery go?", evidence: ['E1'] }],
      evidence,
      140,
      3
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      sensitive: 'health',
      personId: 'p_mom',
      sourceConversationIds: ['c2'],
    });
  });

  it('rejects outputs citing nonexistent facts', () => {
    expect(
      validateGrounded([{ text: 'How was the trip?', evidence: ['E9'] }], evidence, 140, 3)
    ).toEqual([]);
    expect(
      validateGrounded([{ text: 'How was the trip?', evidence: [] }], evidence, 140, 3)
    ).toEqual([]);
    expect(validateGrounded([{ text: 'How was the trip?' }], evidence, 140, 3)).toEqual([]);
  });

  it('rejects invented names and numbers', () => {
    expect(
      validateGrounded([{ text: 'Did your dad Robert visit?', evidence: ['E1'] }], evidence, 140, 3)
    ).toEqual([]);
    expect(
      validateGrounded(
        [{ text: 'Marathon training came up 7 times lately.', evidence: ['E3'] }],
        evidence,
        200,
        3
      )
    ).toEqual([]);
    expect(
      validateGrounded(
        [{ text: 'Marathon training came up in four conversations lately.', evidence: ['E3'] }],
        evidence,
        200,
        3
      )
    ).toHaveLength(1);
  });

  it('rejects gotcha phrasing and counting on sensitive topics', () => {
    expect(
      validateGrounded(
        [{ text: 'You said your mom has surgery, right?', evidence: ['E1'] }],
        evidence,
        200,
        3
      )
    ).toEqual([]);
    expect(
      validateGrounded(
        [{ text: "You've brought up sleep three times lately.", evidence: ['E2'] }],
        evidence,
        200,
        3
      )
    ).toEqual([]);
  });

  it('falls back to grounded rule-based openers when the LLM fails or invents', async () => {
    const llm = vi.fn().mockResolvedValue('{"openers":[{"text":"Hi Bob!","evidence":["E1"]}]}');
    const out = await generateInsights(evidence, { llm, maxInsights: 3, maxOpeners: 2 });
    expect(out.generator).toBe('rules');
    expect(out.openers[0].evidence).toEqual(['E1']);
    expect(out.openers[0].text).toMatch(/^Gently/);
    expect(ruleBasedOpeners([], 2)).toEqual([]);
  });

  it('uses valid LLM output', async () => {
    const llm = vi
      .fn()
      .mockResolvedValue(
        'Sure: {"insights":[{"text":"Marathon training seems to be picking up.","evidence":["E3"]}],"openers":[{"text":"How is the marathon training going?","evidence":["E3"]}]}'
      );
    const out = await generateInsights(evidence, { llm, maxInsights: 3, maxOpeners: 3 });
    expect(out.generator).toBe('llm');
    expect(out.insights[0].text).toMatch(/picking up/);
    expect(llm.mock.calls[0][0]).toContain('E3: "Marathon training"');
  });

  it('holds crisis material back from the LLM and flags a safety hold', () => {
    const src = sources({
      summaries: [
        summary('c1', 1, {
          mainTopics: ['Feeling hopeless'],
          keyPoints: ['They said they want to die'],
        }),
      ],
    });
    const { people } = buildPeopleModel(src, NOW);
    const threads = buildLifeThreads(src, people, NOW);
    const { evidence: ev, safetyHold } = buildEvidence({
      people,
      threads,
      upcomingDates: [],
      summaries: src.summaries,
      nowMs: NOW,
    });
    expect(safetyHold).toBe(true);
    expect(ev.some((e) => /want to die/.test(e.text))).toBe(false);
  });
});

function bundle(over: Partial<InsightBundle> = {}): InsightBundle {
  const long = 'x'.repeat(400);
  return {
    computedAt: NOW,
    predictions: [
      {
        key: 't1',
        kind: 'thread',
        label: 'Marathon training',
        confidence: 0.72,
        rawScore: 0.7,
        reason: 'came up in 4 conversations',
        matchTerms: [],
        components: {
          recency: 1,
          frequency: 1,
          cadence: 0,
          timePattern: 0,
          unresolved: 1,
          upcoming: 0,
        },
      },
      {
        key: 't2',
        kind: 'thread',
        label: long,
        confidence: 0.5,
        rawScore: 0.5,
        reason: long,
        matchTerms: [],
        components: {
          recency: 1,
          frequency: 1,
          cadence: 0,
          timePattern: 0,
          unresolved: 1,
          upcoming: 0,
        },
      },
    ],
    insights: [{ text: long, evidence: ['E1'], sourceConversationIds: [] }],
    openers: [
      {
        text: "How did your mom's surgery go?",
        evidence: ['E1'],
        sensitive: 'health',
        sourceConversationIds: [],
      },
      { text: long, evidence: ['E2'], sourceConversationIds: [] },
    ],
    upcomingDates: [{ title: "Linda's birthday", date: '--10-05', daysAway: 3, kind: 'birthday' }],
    nudges: [],
    people: [
      {
        id: 'p1',
        name: 'Linda',
        kind: 'person',
        relationship: 'mother',
        openThread: 'surgery next week',
      },
      { id: 'p2', name: 'Sam', kind: 'person', relationship: 'partner' },
    ],
    safetyHold: false,
    generator: 'llm',
    sourceConversationIds: [],
    ...over,
  };
}

describe('session-start block', () => {
  it('stays within the character budget, highest priority first', () => {
    for (const maxChars of [300, 600, 900]) {
      const block = formatSessionBlock(bundle(), { maxChars })!;
      expect(block.length).toBeLessThanOrEqual(maxChars);
      expect(block).toContain('People: Linda (mom): surgery next week');
    }
    const full = formatSessionBlock(bundle())!;
    expect(full).toContain("Linda's birthday in 3 days");
    expect(full).toContain('Opener idea (gently)');
  });

  it('is persona-agnostic: the persona name is injected, never assumed', () => {
    const maya = formatSessionBlock(bundle(), { personaName: 'Maya', maxChars: 5000 })!;
    const peter = formatSessionBlock(bundle(), { personaName: 'Peter', maxChars: 5000 })!;
    expect(maya).toContain('as Maya');
    expect(peter).toContain('as Peter');
    expect(maya.replace('Maya', 'Peter')).toBe(peter);
    expect(formatSessionBlock(bundle())!).not.toMatch(/ferni/i);
  });

  it('withholds openers under a safety hold and returns null when empty', () => {
    const held = formatSessionBlock(bundle({ safetyHold: true }))!;
    expect(held).not.toContain('Opener idea');
    expect(held).toContain('let them lead');
    expect(
      formatSessionBlock(
        bundle({ predictions: [], insights: [], openers: [], upcomingDates: [], people: [] })
      )
    ).toBeNull();
    expect(formatSessionBlock(null)).toBeNull();
  });

  it('formats a per-turn person note within budget', () => {
    const { people } = buildPeopleModel(
      sources({ facts: [fact('Mom', 'name', 'Linda'), fact('Linda', 'birthday', 'March 3')] }),
      NOW
    );
    const note = formatPersonNote(people[0], 200)!;
    expect(note.length).toBeLessThanOrEqual(200);
    expect(note).toMatch(/^\[ABOUT LINDA - their mom\]/);
  });
});
