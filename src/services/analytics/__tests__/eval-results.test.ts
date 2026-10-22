/**
 * eval_results: the column allowlists the eval rows pass, and insertRowsOrThrow, the
 * insert path that fails loudly (emitEvent drops a failed batch; an eval must not).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(() => {
    throw new Error('network must not be touched in tests');
  }),
}));

import { GoogleAuth } from 'google-auth-library';

import {
  buildRow,
  emitEvent,
  flushBqEvents,
  insertRowsOrThrow,
  setBqTransportForTests,
  type BqTable,
} from '../bq-events.js';
import { BQ_ENUMS, FIELD_VALUE } from '../bq-fields.js';

const ON = { BQ_EVENTS: 'on', DEPLOY_ENV: 'dev' };
const ROW = { run_id: 'recall-20261021-a1b2c3', metric: 'recall_hit', value: 0.75 };

describe('eval_results allowlists', () => {
  const field = (f: string, v: string) => FIELD_VALUE[f]?.(v);

  it('run_id keeps only <bench>-<yyyymmdd>-<6 hex>, so a phone number or email cannot pass', () => {
    for (const ok of ['recall-20261021-a1b2c3', 'bar-20261021-000fff', 'longmem-20261021-abcdef'])
      expect(field('run_id', ok)).toBe(ok);
    for (const bad of [
      '+15551234567',
      '5551234567',
      'pat@example.com',
      'recall-5551234567-a1b2c3',
      'recall-20261021-a1b2c3d',
      'x-recall-20261021-a1b2c3',
      'recall-20261021-A1B2C3',
      'other-20261021-a1b2c3',
    ])
      expect(field('run_id', bad), bad).toBe('other');
  });

  it('arm keeps a short lower-case name and nothing else', () => {
    for (const ok of ['base', 'on', 'min-margin', 'voice_v2', 'a'.repeat(32)])
      expect(field('arm', ok)).toBe(ok);
    for (const bad of ['Base', '5551234567', 'pat@example.com', 'a'.repeat(33), '', '-x'])
      expect(field('arm', bad), bad).toBe('other');
  });

  it('metric and scenario keep their lists (benches and persona ids) and nothing else', () => {
    expect(field('metric', 'longmem_correct')).toBe('longmem_correct');
    expect(field('metric', 'what the caller said')).toBe('other');
    for (const s of ['bar', 'recall', 'longmem', ...BQ_ENUMS.persona])
      expect(field('scenario', s)).toBe(s);
    expect(field('scenario', 'pat@example.com')).toBe('other');
  });

  it('an eval row builds with env dev and every value through its allowlist', () => {
    const built = buildRow(
      'eval_results',
      { ...ROW, scenario: 'recall', arm: 'Base', flags: ['SEMANTIC_RECALL', '+15551234567'] },
      {},
      ON
    );
    expect(built).toMatchObject({
      row: { env: 'dev', ...ROW, scenario: 'recall', arm: 'other' },
    });
    expect('row' in built && built.row.flags).toEqual(['SEMANTIC_RECALL', 'other']);
  });
});

describe('insertRowsOrThrow', () => {
  let sent: Array<{ table: BqTable; rows: Array<Record<string, unknown>> }> = [];
  const capture = async (table: BqTable, rows: Array<Record<string, unknown>>) => {
    sent.push({ table, rows });
  };
  afterEach(() => {
    sent = [];
    setBqTransportForTests(null);
  });

  it('sends every row at once and returns the count', async () => {
    setBqTransportForTests(capture);
    await expect(insertRowsOrThrow('eval_results', [ROW, ROW], ON)).resolves.toBe(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.rows).toHaveLength(2);
    expect(sent[0]?.rows[0]).toMatchObject({ env: 'dev', ...ROW });
  });

  it('throws when the transport answers with insertErrors', async () => {
    setBqTransportForTests(async () => ({ insertErrors: [{ index: 0, errors: [] }] }));
    await expect(insertRowsOrThrow('eval_results', [ROW], ON)).rejects.toThrow(/1 rows rejected/);
  });

  it('throws on a transport error instead of dropping the batch', async () => {
    setBqTransportForTests(async () => {
      throw new Error('403');
    });
    await expect(insertRowsOrThrow('eval_results', [ROW], ON)).rejects.toThrow('403');
  });

  it('throws on a refused row, before anything is sent', async () => {
    setBqTransportForTests(capture);
    const bad = { ...ROW, value: Number.NaN };
    await expect(insertRowsOrThrow('eval_results', [ROW, bad], ON)).rejects.toThrow(
      'row refused (eval_results): value of value'
    );
    expect(sent).toHaveLength(0);
  });

  it('with BQ_EVENTS off sends nothing and says so, and never reaches the network', async () => {
    setBqTransportForTests(capture);
    await expect(insertRowsOrThrow('eval_results', [ROW], { DEPLOY_ENV: 'dev' })).rejects.toThrow(
      /BQ_EVENTS is off/
    );
    expect(sent).toHaveLength(0);
    setBqTransportForTests(null);
    await expect(insertRowsOrThrow('eval_results', [ROW], {})).rejects.toThrow(/BQ_EVENTS/);
    expect(vi.mocked(GoogleAuth)).not.toHaveBeenCalled();
  });

  it('the real insert throws on insertErrors too', async () => {
    const request = vi.fn(async () => ({ data: { insertErrors: [{ index: 0 }] } }));
    vi.mocked(GoogleAuth).mockImplementationOnce(function (this: unknown) {
      return { getClient: async () => ({ request }) };
    } as never);
    await expect(insertRowsOrThrow('eval_results', [ROW], ON)).rejects.toThrow('rows rejected');
    expect(request).toHaveBeenCalledOnce();
  });

  it('throws on a string its allowlist would write as other; emitEvent still writes other', async () => {
    setBqTransportForTests(capture);
    for (const [row, field] of [
      [{ ...ROW, metric: 'what the caller said' }, 'metric'],
      [{ ...ROW, flags: ['SEMANTIC_RECALL', '+15551234567'] }, 'flags'],
    ] as const) {
      await expect(insertRowsOrThrow('eval_results', [ROW, row], ON)).rejects.toThrow(
        `row refused (eval_results): ${field} is off its allowlist`
      );
    }
    expect(sent).toHaveLength(0);
    expect(emitEvent('eval_results', { ...ROW, metric: 'what the caller said' }, {}, ON)).toBe(
      true
    );
    await flushBqEvents();
    expect(sent[0]?.rows[0]).toMatchObject({ metric: 'other' });
  });

  it('sends nothing for no rows', async () => {
    setBqTransportForTests(capture);
    await expect(insertRowsOrThrow('eval_results', [], ON)).resolves.toBe(0);
    expect(sent).toHaveLength(0);
  });
});
