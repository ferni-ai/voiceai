/**
 * A consented clone's voice id never reaches the process's output, even on paths that
 * bypass the app logger: the LiveKit SDK's logger, console, and raw stdout/stderr writes
 * (persona-tts.ts's DEBUG_TTS_PIPELINE tracing prints the voice id that way). The text
 * pass that masks phone numbers (log-redaction.ts) applies the same registered values
 * (redacted-log-values.ts) the app logger does.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { redactWrites } from '../log-redaction.js';
import { registerRedactedLogValues } from '../redacted-log-values.js';

const CLONE = 'fake-seth-id';
const REDACTED = '[consented-clone]';

describe('every path that bypasses the app logger (child process, real SDK logger)', () => {
  const child = fileURLToPath(new URL('./fixtures/clone-voice-log-child.ts', import.meta.url));
  const run = (env: Record<string, string>) =>
    spawnSync(process.execPath, ['--import', 'tsx', child], {
      encoding: 'utf8',
      timeout: 60_000,
      // VITEST unset so the app sink is the real fd-2 SonicBoom destination, as deployed
      env: { ...process.env, SENTRY_DSN: '', VITEST: '', ...env },
    });
  const LINES = [
    'sdk structured line',
    'sdk line',
    'sdk child line',
    'app line',
    'console line',
    'console error line',
    'raw stderr line',
    'raw stdout line',
  ];

  it('no line carries the clone id; each says it was redacted', () => {
    const r = run({ ROSTER_VOICE_SETH: CLONE });
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status).toBe(0);
    for (const line of LINES) expect(out).toContain(line);
    expect(out.toLowerCase()).not.toContain(CLONE);
    expect(out.split(REDACTED).length - 1).toBeGreaterThanOrEqual(LINES.length);
  });

  it('with no clone configured, nothing is redacted', () => {
    const r = run({ ROSTER_VOICE_SETH: '' });
    const out = `${r.stdout}\n${r.stderr}`;
    expect(r.status).toBe(0);
    for (const line of LINES) expect(out).toContain(line);
    expect(out).not.toContain(REDACTED);
  });
});

describe('redactWrites: a clone id split across writes', () => {
  let configured: string[] = [];
  registerRedactedLogValues(() => configured);
  // The values are read again once a second: each test starts a second later, so it sees its own.
  let clock = Date.now();
  beforeEach(() => {
    clock += 2000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(clock);
    configured = [CLONE];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function sink() {
    const chunks: unknown[] = [];
    const target = {
      write: (chunk: unknown, ...rest: unknown[]) => {
        chunks.push(chunk);
        const cb = rest.find((r) => typeof r === 'function') as (() => void) | undefined;
        cb?.();
        return true;
      },
    };
    redactWrites(target);
    return { target, chunks, text: () => chunks.map(String).join('') };
  }

  it('is still redacted when one write ends inside it', () => {
    const s = sink();
    s.target.write('voice fake-se');
    s.target.write('th-id ready\n');
    expect(s.text()).toBe(`voice ${REDACTED} ready\n`);
  });

  it('in a long unfinished line, a write that ends inside it still leaves it whole', () => {
    const s = sink();
    s.target.write(`${'x'.repeat(600)} voice fake-se`);
    s.target.write('th-id ok\n');
    expect(s.text()).toBe(`${'x'.repeat(600)} voice ${REDACTED} ok\n`);
  });

  it('is replaced whole before the phone pass could mask part of it', () => {
    configured = ['voice-415-555-0123'];
    const s = sink();
    s.target.write('using voice-415-555-0123 now\n');
    expect(s.text()).toBe(`using ${REDACTED} now\n`);
  });

  it('a Buffer write is redacted too', () => {
    const s = sink();
    s.target.write(Buffer.from(`{"voiceId":"${CLONE}"}\n`));
    expect(s.text()).toBe(`{"voiceId":"${REDACTED}"}\n`);
  });

  it('leaves a line with an ordinary voice id as the same chunk', () => {
    const s = sink();
    const line = Buffer.from('{"voiceId":"fake-maya-id"}\n');
    s.target.write(line);
    expect(s.chunks[0]).toBe(line);
  });
});
