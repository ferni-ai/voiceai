/**
 * The SDK's own lk.pii.* log values reach stdout as lengths outside dev. Drives the real
 * SDK logger (initializeSdkLogger, then log() as agent_activity gets it) and reads the
 * bytes the SDK writes to process.stdout. All text here is invented.
 */
import { initializeLogger, log } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initializeSdkLogger } from '../../agents/gce/sdk-logger-options.js';

const PROD = { NODE_ENV: 'production' }; // no FIRESTORE_DATABASE: counts as prod
const DEV = { NODE_ENV: 'production', FIRESTORE_DATABASE: 'ferni-dev' };

const SAID = 'the blue kettle sang softly by the window';
const REPLY = 'a paper boat drifted past the quiet harbor';
const ARGS = { city: 'marmalade springs', note: 'bring the striped umbrella' };
const LIST = ['lanterns over the meadow', 'seven tin soldiers'];
const DEEP = 'pebbles hidden under a mossy log';
const FUTURE = 'a heron counting raindrops';
const BOUND = 'whispers from the orchard gate';
const INVENTED = [SAID, REPLY, DEEP, FUTURE, BOUND, ...LIST, ...Object.values(ARGS)];

let written: string[] = [];
const realWrite = process.stdout.write;

beforeEach(() => {
  written = [];
  process.stdout.write = ((chunk: string | Uint8Array) => {
    written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;
});

afterEach(() => {
  process.stdout.write = realWrite;
});

/** Every 8-character piece of the invented text that is found in the output. */
function leakedPieces(out: string): string[] {
  const found = new Set<string>();
  for (const text of INVENTED) {
    for (let i = 0; i + 8 <= text.length; i++) {
      const piece = text.slice(i, i + 8);
      if (out.includes(piece)) found.add(piece);
    }
  }
  return [...found];
}

function records(): Array<Record<string, unknown>> {
  const out = written.join('');
  const lines = out.split('\n').filter((l) => l.trim() !== '');
  return lines.map((l) => JSON.parse(l) as Record<string, unknown>);
}

function logEveryShape(): void {
  const logger = log();
  logger.info(
    { 'lk.pii.new_transcript': SAID, speech_id: 'sp_1' },
    'starting preemptive generation'
  );
  logger.info({ 'lk.pii.message': REPLY }, 'playout completed');
  logger.warn({ 'lk.pii.arguments': ARGS, 'lk.pii.output': LIST }, 'tool output');
  logger.info({ 'lk.pii.user_input': undefined, 'lk.pii.error': null }, 'empty values');
  logger.info({ outer: { inner: { 'lk.pii.deep_text': DEEP } } }, 'nested');
  logger.info({ 'lk.pii.added_in_a_later_sdk': FUTURE }, 'future key');
  logger.child({ 'lk.pii.response': BOUND, jobID: 'AJ_1' }).warn('received unexpected response');
}

describe('the SDK logger on a prod process', () => {
  it('writes only lengths: no 8-character piece of the words reaches stdout', () => {
    initializeSdkLogger(PROD);
    logEveryShape();
    const out = written.join('');
    expect(leakedPieces(out)).toEqual([]);
    const [preemptive, playout, tool, empty, nested, future, child] = records();
    expect(preemptive['lk.pii.new_transcript']).toBe(`[${SAID.length} chars]`);
    expect(playout['lk.pii.message']).toBe(`[${REPLY.length} chars]`);
    expect(tool['lk.pii.arguments']).toBe(`[${JSON.stringify(ARGS).length} chars]`);
    expect(tool['lk.pii.output']).toBe(`[${JSON.stringify(LIST).length} chars]`);
    expect(empty).not.toHaveProperty('lk.pii.user_input'); // undefined: pino drops it, as before
    expect(empty['lk.pii.error']).toBeNull();
    expect(nested.outer).toEqual({ inner: { 'lk.pii.deep_text': `[${DEEP.length} chars]` } });
    expect(future['lk.pii.added_in_a_later_sdk']).toBe(`[${FUTURE.length} chars]`);
    expect(child['lk.pii.response']).toBe(`[${BOUND.length} chars]`);
  });

  it('a key a later SDK version adds: covered with no change here', () => {
    initializeSdkLogger(PROD);
    log().info({ 'lk.pii.added_in_a_later_sdk': FUTURE }, 'future key');
    expect(written.join('')).not.toContain(FUTURE.slice(0, 8));
    expect(records()[0]['lk.pii.added_in_a_later_sdk']).toBe(`[${FUTURE.length} chars]`);
  });

  it('a pii key nested at depth 2', () => {
    initializeSdkLogger(PROD);
    log().info({ outer: { inner: { 'lk.pii.deep_text': DEEP } } }, 'nested');
    expect(written.join('')).not.toContain(DEEP.slice(0, 8));
    expect(records()[0].outer).toEqual({ inner: { 'lk.pii.deep_text': `[${DEEP.length} chars]` } });
  });

  it('keeps one JSON line per record, with the message, level and other fields unchanged', () => {
    initializeSdkLogger(PROD);
    logEveryShape();
    const lines = written
      .join('')
      .split('\n')
      .filter((l) => l !== '');
    expect(lines).toHaveLength(7);
    const [preemptive, , tool, , , , child] = records();
    expect(preemptive).toMatchObject({
      level: 30,
      msg: 'starting preemptive generation',
      speech_id: 'sp_1',
    });
    expect(tool).toMatchObject({ level: 40, msg: 'tool output' });
    expect(child).toMatchObject({ level: 40, msg: 'received unexpected response', jobID: 'AJ_1' });
  });

  it('covers a logger the SDK sets later: a re-init and a per-job child put in the slot', () => {
    initializeSdkLogger(PROD);
    initializeLogger({ pretty: false, level: 'info' }); // as cli.js and job_proc_lazy_main.js do
    log().info({ 'lk.pii.user_input': SAID }, 'after re-init');
    const slot = Symbol.for('@livekit/agents:logger');
    (globalThis as Record<symbol, unknown>)[slot] = log().child({ jobID: 'AJ_2' }); // setLoggerState
    log().info({ 'lk.pii.message': REPLY }, 'per-job child');
    expect(leakedPieces(written.join(''))).toEqual([]);
    const [reinit, perJob] = records();
    expect(reinit['lk.pii.user_input']).toBe(`[${SAID.length} chars]`);
    expect(perJob).toMatchObject({ jobID: 'AJ_2', 'lk.pii.message': `[${REPLY.length} chars]` });
  });

  it('covers a logger captured before the redaction was installed (agent_activity keeps log())', () => {
    const g = globalThis as Record<symbol, unknown>;
    delete g[Symbol.for('ferni:sdk-pii-key-redaction')]; // as in a process where nothing is
    delete g[Symbol.for('@livekit/agents:logger')]; //       installed yet (earlier tests did)
    initializeLogger({ pretty: false, level: 'info' });
    const kept = log();
    initializeSdkLogger(PROD); // installs on the slot's current logger, then re-inits
    kept.info({ 'lk.pii.message': REPLY }, 'kept logger');
    expect(leakedPieces(written.join(''))).toEqual([]);
    expect(records()[0]['lk.pii.message']).toBe(`[${REPLY.length} chars]`);
  });
});

describe('the SDK logger on a dev process', () => {
  it('writes the words (positive control for the prod tests above)', () => {
    initializeSdkLogger(DEV);
    logEveryShape();
    const out = written.join('');
    for (const text of INVENTED) expect(out).toContain(text);
    const [preemptive, , tool, , nested, , child] = records();
    expect(preemptive['lk.pii.new_transcript']).toBe(SAID);
    expect(tool['lk.pii.arguments']).toEqual(ARGS);
    expect(nested.outer).toEqual({ inner: { 'lk.pii.deep_text': DEEP } });
    expect(child['lk.pii.response']).toBe(BOUND);
  });
});

/** One record through the real SDK logger on a prod process, read back from stdout. */
function logOne(obj: Record<string, unknown>): Record<string, unknown> {
  initializeSdkLogger(PROD);
  written = [];
  log().info(obj, 'one record');
  return records()[0];
}

describe('what a pii value is logged as', () => {
  it('measures each kind of value, and leaves null and undefined', () => {
    const r = logOne({
      'lk.pii.a': 'abc',
      'lk.pii.b': ['ab'],
      'lk.pii.c': { a: 1 },
      'lk.pii.d': new Error('four'),
      'lk.pii.e': 12345,
      'lk.pii.f': true,
      'lk.pii.g': null,
      'lk.pii.h': { n: 1n },
    });
    expect(r).toMatchObject({
      'lk.pii.a': '[3 chars]',
      'lk.pii.b': '[6 chars]',
      'lk.pii.c': '[7 chars]',
      'lk.pii.d': '[4 chars]',
      'lk.pii.e': '[5 chars]',
      'lk.pii.f': '[4 chars]',
      'lk.pii.g': null,
      'lk.pii.h': '[unserializable]',
    });
  });

  it('matches a pii key segment, inside arrays too, and never edits the caller object', () => {
    const obj = {
      items: [{ 'lk.pii.x': SAID }],
      'lk.piidata': 'kept',
      lk: { pii: DEEP },
      pipe: 'kept',
    };
    expect(logOne(obj)).toMatchObject({
      items: [{ 'lk.pii.x': `[${SAID.length} chars]` }],
      'lk.piidata': 'kept',
      lk: { pii: `[${DEEP.length} chars]` },
      pipe: 'kept',
    });
    expect(obj.items[0]['lk.pii.x']).toBe(SAID);
    expect(obj.lk.pii).toBe(DEEP);
  });

  it('marks a cycle instead of letting pino print the uncopied original', () => {
    const inner: Record<string, unknown> = { 'lk.pii.x': SAID };
    inner.self = inner;
    const r = logOne({ wrap: inner });
    expect(written.join('')).not.toContain(SAID.slice(0, 8));
    expect(r.wrap).toEqual({ 'lk.pii.x': `[${SAID.length} chars]`, self: '[Circular]' });
  });
});
