/**
 * bq-events: the allowlist is the privacy boundary, so most of these pin what is refused.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn(() => {
    throw new Error('network must not be touched in tests');
  }),
}));

import { GoogleAuth } from 'google-auth-library';

import {
  BQ_TABLES,
  bqEnv,
  bqHash,
  buildRow,
  emitEvent,
  flushBqEvents,
  setBqTransportForTests,
  type BqTable,
} from '../bq-events.js';

const ON = { BQ_EVENTS: 'on', LOG_HASH_SECRET: 'test-secret' };
const NOW = new Date('2026-10-18T12:00:00Z');

describe('buildRow (the allowlist)', () => {
  it('keeps known fields, coerces types and stamps event_ts and env', () => {
    const built = buildRow(
      'call_events',
      { event_type: 'call_end', duration_ms: '1234.6', turns: 7, flags: ['A', 'B'] },
      {},
      { DEPLOY_ENV: 'production' },
      NOW
    );
    expect(built).toEqual({
      row: {
        event_ts: '2026-10-18T12:00:00.000Z',
        env: 'prod',
        event_type: 'call_end',
        duration_ms: 1235,
        turns: 7,
        flags: ['A', 'B'],
      },
    });
  });

  it('refuses the whole row for an unknown field', () => {
    expect(buildRow('outreach_events', { event_type: 'send', text: 'hi' })).toEqual({
      refused: 'field text',
    });
  });

  it('refuses any string over 64 characters, alone or in a list', () => {
    const long = 'x'.repeat(65);
    expect(buildRow('outreach_events', { event_type: 'send', reason: long })).toHaveProperty(
      'refused'
    );
    expect(buildRow('call_events', { event_type: 'e', flags: ['ok', long] })).toHaveProperty(
      'refused'
    );
    expect(
      buildRow('outreach_events', { event_type: 'send', reason: 'x'.repeat(64) })
    ).toHaveProperty('row');
  });

  it('refuses ids or hashes passed as fields, a wrong type, and a missing required field', () => {
    expect(buildRow('call_events', { event_type: 'e', user_hash: 'uid-1' })).toEqual({
      refused: 'field user_hash',
    });
    expect(buildRow('call_events', { event_type: 'e', turns: 'many' })).toEqual({
      refused: 'value of turns',
    });
    expect(buildRow('outreach_events', { event_type: 'send', third_party: 'yes' })).toHaveProperty(
      'refused'
    );
    expect(buildRow('call_events', { turns: 1 })).toEqual({ refused: 'missing event_type' });
  });

  it('hashes ids into user_hash and session_hash, never the raw id', () => {
    const built = buildRow(
      'call_events',
      { event_type: 'e' },
      { userId: 'uid-123', sessionId: 'RM_abc' },
      ON
    );
    expect('row' in built).toBe(true);
    const text = JSON.stringify(built);
    expect(text).not.toContain('uid-123');
    expect(text).not.toContain('RM_abc');
    if ('row' in built) {
      expect(built.row.user_hash).toBe(bqHash('user', 'uid-123', ON));
      expect(built.row.session_hash).toBe(bqHash('session', 'RM_abc', ON));
    }
  });
});

describe('bqHash', () => {
  it('is stable, 32 hex, never the id, and differs by purpose and by secret', () => {
    const h = bqHash('user', 'uid-123', ON);
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(bqHash('user', 'uid-123', ON)).toBe(h);
    expect(h).not.toBe('uid-123');
    expect(bqHash('session', 'uid-123', ON)).not.toBe(h);
    expect(bqHash('user', 'uid-123', { LOG_HASH_SECRET: 'other' })).not.toBe(h);
  });

  it('is null without LOG_HASH_SECRET, so no raw id is ever written', () => {
    expect(bqHash('user', 'uid-123', {})).toBeNull();
    const built = buildRow('outreach_events', { event_type: 'send' }, { userId: 'uid-123' }, {});
    expect(JSON.stringify(built)).not.toContain('uid-123');
  });
});

describe('bqEnv', () => {
  it('is prod only on an explicit prod signal', () => {
    expect(bqEnv({ DEPLOY_ENV: 'prod' })).toBe('prod');
    expect(bqEnv({ SENTRY_ENVIRONMENT: 'production' })).toBe('prod');
    expect(bqEnv({ LIVEKIT_URL: 'wss://test-rvg91u1z.livekit.cloud' })).toBe('prod');
    expect(bqEnv({ LIVEKIT_URL: 'wss://dev-8sm1ba0z.livekit.cloud', NODE_ENV: 'production' })).toBe(
      'dev'
    );
    expect(bqEnv({ DEPLOY_ENV: 'staging' })).toBe('dev');
  });
});

describe('emitEvent and flushing', () => {
  let sent: Array<{ table: BqTable; rows: Record<string, unknown>[] }>;
  beforeEach(() => {
    sent = [];
    setBqTransportForTests(async (table, rows) => {
      sent.push({ table, rows });
    });
  });
  afterEach(() => {
    setBqTransportForTests(null);
    vi.useRealTimers();
  });

  it('with BQ_EVENTS off queues nothing and touches no network', async () => {
    expect(emitEvent('outreach_events', { event_type: 'send' }, {}, {})).toBe(false);
    expect(emitEvent('outreach_events', { event_type: 'send' }, {}, { BQ_EVENTS: 'off' })).toBe(
      false
    );
    await flushBqEvents();
    expect(sent).toHaveLength(0);
    setBqTransportForTests(null); // the real transport: GoogleAuth is mocked to throw if reached
    emitEvent('outreach_events', { event_type: 'send' }, {}, { BQ_EVENTS: 'off' });
    await flushBqEvents();
    expect(vi.mocked(GoogleAuth)).not.toHaveBeenCalled();
  });

  it('batches rows per table and sends them on flush', async () => {
    expect(emitEvent('outreach_events', { event_type: 'send', channel: 'sms' }, {}, ON)).toBe(true);
    expect(emitEvent('call_events', { event_type: 'call_end' }, {}, ON)).toBe(true);
    expect(sent).toHaveLength(0);
    await flushBqEvents();
    expect(sent.map((s) => s.table).sort()).toEqual(['call_events', 'outreach_events']);
    await flushBqEvents();
    expect(sent).toHaveLength(2);
  });

  it('flushes by itself after 50 rows, and after the timer', async () => {
    for (let i = 0; i < 50; i++) emitEvent('call_events', { event_type: 'call_end' }, {}, ON);
    await vi.waitFor(() => expect(sent[0]?.rows).toHaveLength(50));

    vi.useFakeTimers();
    emitEvent('call_events', { event_type: 'call_end' }, {}, ON);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sent[1]?.rows).toHaveLength(1);
  });

  it('drops a failed batch without throwing, and the next batch still goes', async () => {
    setBqTransportForTests(async () => {
      throw new Error('403');
    });
    emitEvent('call_events', { event_type: 'call_end' }, {}, ON);
    await expect(flushBqEvents()).resolves.toBeUndefined();
    setBqTransportForTests(async (table, rows) => {
      sent.push({ table, rows });
    });
    emitEvent('call_events', { event_type: 'call_end' }, {}, ON);
    await flushBqEvents();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.rows).toHaveLength(1);
  });

  it('a refused row is not queued', async () => {
    expect(emitEvent('outreach_events', { event_type: 'send', body: 'hi' } as never, {}, ON)).toBe(
      false
    );
    await flushBqEvents();
    expect(sent).toHaveLength(0);
  });
});

describe('BQ_TABLES mirrors the dataset schemas', () => {
  it.each(Object.keys(BQ_TABLES) as BqTable[])('%s', (table) => {
    const file = join(__dirname, 'fixtures/ferni_events', `${table}.json`);
    const schema = JSON.parse(readFileSync(file, 'utf8')) as Array<{
      name: string;
      type: string;
      mode?: string;
    }>;
    const mirrored = Object.entries(BQ_TABLES[table]).map(([name, col]: [string, string]) => ({
      name,
      type: col.replace(/[![\]]/g, ''),
      ...(col.endsWith('!') && { mode: 'REQUIRED' }),
      ...(col.endsWith('[]') && { mode: 'REPEATED' }),
    }));
    expect(mirrored).toEqual(schema);
  });
});
