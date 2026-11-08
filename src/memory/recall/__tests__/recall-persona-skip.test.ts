/**
 * Persona canon already in a caller's dynamic_facts never surfaces in recall (right-moment
 * memory §5.3, ruling 6, read side). With ENTITY_HYGIENE on, loadRecallSnapshot hides a
 * fact whose subject is a persona: Ferni whatever is stored, or a teammate name ("Maya")
 * with no relation the caller's facts state. A stored row holds no relationship field;
 * the relation is a fact on file ("Priya | relation to user = sister"), as the write side
 * reads it. One PERSONA_FACT_HIDDEN line per snapshot, counts only. Fictional rows only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const seen = vi.hoisted(() => ({ info: [] as unknown[][] }));

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = {
    debug: () => undefined,
    info: (...args: unknown[]) => seen.info.push(args),
    warn: () => undefined,
    error: () => undefined,
  };
  return { createLogger: () => logger, getLogger: () => logger };
});

import { loadRecallSnapshot, type RecallStore } from '../session-recall.js';

const row = (entityName: string, key: string, value: string) => ({
  entityName,
  key,
  value,
  confidence: 0.9,
  extractedAt: '2026-10-30T12:00:00Z',
});
const FERNI = row('Ferni', 'location', 'lives by the lake');
const MAYA = row('Maya', 'hobby', 'pottery');
const PRIYA = row('Priya', 'relation to user', 'sister');
const PRIYA_JOB = row('Priya', 'job', 'teacher');

const storeOf = (facts: Array<Record<string, unknown>>): RecallStore => ({
  facts: async () => facts,
  summaries: async () => [],
  forgotten: async () => [],
});
const hiddenLines = () =>
  seen.info.filter(([fields]) => (fields as { event?: string }).event === 'PERSONA_FACT_HIDDEN');
const entities = async (facts: Array<Record<string, unknown>>) =>
  (await loadRecallSnapshot(storeOf(facts), 'riley-test-1')).facts.map((f) => f.entity);

beforeEach(() => {
  seen.info.length = 0;
  vi.stubEnv('ENTITY_HYGIENE', 'on');
});
afterEach(() => vi.unstubAllEnvs());

describe('loadRecallSnapshot, persona subjects (ENTITY_HYGIENE on)', () => {
  it('hides Ferni and a bare Maya, keeps Priya the sister, and logs the count once', async () => {
    expect(await entities([FERNI, MAYA, PRIYA, PRIYA_JOB])).toEqual(['Priya', 'Priya']);
    expect(hiddenLines()).toHaveLength(1);
    const [fields] = hiddenLines()[0] as [Record<string, unknown>];
    expect(fields).toMatchObject({ event: 'PERSONA_FACT_HIDDEN', reason: 'persona', count: 2 });
    // Counts only: no names, places or fact text in the line.
    expect(JSON.stringify(hiddenLines())).not.toMatch(/Ferni|Maya|Priya|lake|pottery|sister/);
  });

  it('keeps Maya when a fact on file says she is their friend', async () => {
    const friend = row('Maya', 'relation to user', 'friend');
    expect(await entities([MAYA, friend])).toEqual(['Maya', 'Maya']);
    expect(hiddenLines()).toHaveLength(0);
  });

  it('keeps Maya when the caller row names her ("User | coworker = Maya")', async () => {
    expect(await entities([MAYA, row('User', 'coworker', 'Maya')])).toEqual(['Maya', 'User']);
  });

  it('hides Ferni even with a relation on file', async () => {
    expect(await entities([FERNI, row('Ferni', 'relation to user', 'friend')])).toEqual([]);
    expect(hiddenLines()[0]?.[0]).toMatchObject({ count: 2 });
  });

  it('logs nothing when no persona fact is on file', async () => {
    expect(await entities([PRIYA, PRIYA_JOB])).toEqual(['Priya', 'Priya']);
    expect(hiddenLines()).toHaveLength(0);
  });
});

describe('loadRecallSnapshot, ENTITY_HYGIENE off', () => {
  it('returns every fact as before and logs nothing', async () => {
    vi.stubEnv('ENTITY_HYGIENE', 'off');
    expect(await entities([FERNI, MAYA, PRIYA, PRIYA_JOB])).toEqual([
      'Ferni',
      'Maya',
      'Priya',
      'Priya',
    ]);
    expect(hiddenLines()).toHaveLength(0);
  });
});
