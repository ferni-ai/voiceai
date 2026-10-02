import { describe, expect, it } from 'vitest';
import {
  dedupeFacts,
  factId,
  formatRecall,
  loadRecallSnapshot,
  mentions,
  recallForTurn,
  type RecallSnapshot,
} from '../session-recall.js';

// Shapes as written by deep extraction (bogle_users/{id}/dynamic_facts), 2026-09-27.
const biscuitBreed = { entity: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 1 };
const biscuitShoes = {
  entity: 'Biscuit',
  key: 'action',
  value: "chewed through 2 of Speaker's shoes",
  confidence: 0.9,
};
const austinJob = { entity: 'Austin', key: 'job_offer', value: 'new job in Austin', confidence: 0.8 };
const selfFact = { entity: 'Speaker', key: 'feeling', value: 'rough week, not sleeping', confidence: 0.7 };

const snapshot: RecallSnapshot = {
  facts: [biscuitBreed, biscuitShoes, austinJob, selfFact],
  followUps: ['Ask how the shoe situation with Biscuit is going'],
};

describe('mentions', () => {
  it('matches whole words only', () => {
    expect(mentions('How is Biscuit doing?', 'Biscuit')).toBe(true);
    expect(mentions("I've been exhausting myself", 'Austin')).toBe(false);
    expect(mentions('we went to Austin, it was great', 'austin')).toBe(true);
    expect(mentions('my golden retriever', 'golden retriever')).toBe(true);
  });
});

describe('recallForTurn', () => {
  it('brings facts about the entity the user names, best first', () => {
    const facts = recallForTurn(snapshot, 'Biscuit ate another shoe today');
    expect(facts.map((f) => f.key)).toEqual(['action', 'breed']);
  });

  it('matches on shared content words when no entity is named', () => {
    expect(recallForTurn(snapshot, "I still haven't been sleeping")).toEqual([selfFact]);
  });

  it('returns nothing for an unrelated turn', () => {
    expect(recallForTurn(snapshot, 'What is the weather tomorrow?')).toEqual([]);
  });

  it('does not match an entity hidden inside another word', () => {
    expect(recallForTurn(snapshot, 'Work has been exhausting')).toEqual([]);
  });

  it('skips facts already surfaced this session', () => {
    const surfaced = new Set([factId(biscuitShoes)]);
    expect(recallForTurn(snapshot, 'Biscuit is so funny', surfaced)).toEqual([biscuitBreed]);
  });
});

describe('dedupeFacts', () => {
  it('keeps one copy of a fact extracted in several sessions, at its highest confidence', () => {
    const facts = dedupeFacts([
      { ...biscuitBreed, confidence: 0.6 },
      biscuitBreed,
      { ...biscuitBreed, entity: 'biscuit', confidence: 0.7 },
    ]);
    expect(facts).toEqual([biscuitBreed]);
  });
});

describe('formatRecall', () => {
  it('writes the facts and open threads, naming the caller for self facts', () => {
    const note = formatRecall([biscuitBreed, selfFact], snapshot.followUps, 'Sam');
    expect(note).toContain('[WHAT YOU REMEMBER ABOUT SAM]');
    expect(note).toContain('- Biscuit: breed = golden retriever');
    expect(note).toContain('- Sam: feeling = rough week, not sleeping');
    expect(note).toContain('- Ask how the shoe situation with Biscuit is going');
  });

  it('returns null when there is nothing to recall', () => {
    expect(formatRecall([], [])).toBeNull();
  });
});

describe('loadRecallSnapshot', () => {
  it('maps stored facts, dedupes them and collects follow-ups from summaries', async () => {
    const snap = await loadRecallSnapshot(
      {
        facts: async () => [
          { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 1 },
          { entityName: 'Biscuit', key: 'breed', value: 'golden retriever', confidence: 0.8 },
        ],
        summaries: async () => [
          { followUpItems: ['Ask about the vet visit', 'Ask about the shoes'] },
          { followUpItems: ['Ask about the vet visit', 'Ask about Austin'] },
        ],
      },
      'u1'
    );
    expect(snap.facts).toEqual([biscuitBreed]);
    expect(snap.followUps).toEqual([
      'Ask about the vet visit',
      'Ask about the shoes',
      'Ask about Austin',
    ]);
  });

  it('returns an empty snapshot when the store fails', async () => {
    const snap = await loadRecallSnapshot(
      {
        facts: async () => {
          throw new Error('unavailable');
        },
        summaries: async () => {
          throw new Error('unavailable');
        },
      },
      'u1'
    );
    expect(snap).toEqual({ facts: [], followUps: [] });
  });
});
