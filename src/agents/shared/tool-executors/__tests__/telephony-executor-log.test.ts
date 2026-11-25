/**
 * The telephony executor's log lines (#4442): who the caller asked to reach and why used to be
 * logged as words (contactQuery, purpose, contact), with the user id, at info on every attempt.
 * Now the lines carry yes/no and lengths and the session id. Fictional data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execLog = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../utils/safe-logger.js')>();
  return {
    ...actual,
    createLogger: (bindings: Record<string, unknown>) =>
      bindings.module === 'TelephonyExecutor' ? execLog : actual.createLogger(bindings),
  };
});
const callTool = vi.hoisted(() => ({
  execute: vi.fn(async (): Promise<unknown> => 'Calling now'),
}));
vi.mock('../../../../tools/domains/telephony/call-on-behalf.js', () => ({
  createCallOnBehalfTool: () => ({ execute: callTool.execute }),
}));
const multi = vi.hoisted(() => ({ execute: vi.fn(async (): Promise<unknown> => 'Reaching out') }));
vi.mock('../../../../tools/domains/communication/outreach/multi-outreach.js', () => ({
  createMultiOutreachTool: () => ({ execute: multi.execute }),
}));
vi.mock('../../../../services/outreach/on-behalf-call-orchestrator.js', () => ({
  getOnBehalfCallOrchestrator: () => ({}),
}));

import { telephonyExecutor } from '../telephony-executor.js';
import type { ToolExecutionContext } from '../types.js';

const WORDS = 'zorbleflax-fictional-contact';
const PURPOSE = 'return the fictional ladder';
const ID_LENGTH = 40;
const ctx: ToolExecutionContext = {
  userId: 'user-fic1',
  sessionId: 'session-fic1',
  personaId: 'ferni',
};

const logged = () =>
  JSON.stringify([execLog.info.mock.calls, execLog.error.mock.calls, execLog.warn.mock.calls]);

beforeEach(() => {
  vi.stubEnv('OUTBOUND_CONFIRM', 'off');
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const fn of [execLog.info, execLog.warn, execLog.error, execLog.debug]) fn.mockReset();
  callTool.execute.mockClear();
});

describe('callOnBehalf', () => {
  it('the "Initiating phone call" line says yes/no and lengths, with the session id and no user id', async () => {
    await telephonyExecutor.execute('callonbehalf', { contactQuery: WORDS, purpose: PURPOSE }, ctx);
    const line = execLog.info.mock.calls.find((c) => c[1] === '📞 Initiating phone call');
    expect(line?.[0]).toEqual({
      hasName: true,
      hasPhone: false,
      purposeChars: PURPOSE.length,
      sessionId: 'session-fic1',
    });
    expect(callTool.execute).toHaveBeenCalledOnce();
  });

  it('no logger call carries the contact, the purpose or the user id, whichever argument names are used', async () => {
    await Promise.all(
      [
        { contactQuery: WORDS, purpose: PURPOSE },
        { contact: WORDS, objective: PURPOSE },
        { name: WORDS, phoneNumber: '+15555550123', purpose: PURPOSE },
      ].map((args) => telephonyExecutor.execute('callonbehalf', args, ctx))
    );
    expect(logged()).not.toContain('zorbleflax');
    expect(logged()).not.toContain('ladder');
    expect(logged()).not.toContain('user-fic1');
    expect(logged()).not.toContain('5555550123');
  });

  it('a call that fails logs no contact either', async () => {
    callTool.execute.mockRejectedValueOnce(new Error(`could not reach ${WORDS}`));
    await telephonyExecutor.execute('callonbehalf', { contactQuery: WORDS, purpose: PURPOSE }, ctx);
    expect(execLog.error).toHaveBeenCalled();
    expect(logged()).not.toContain('zorbleflax');
  });
});

describe('multi-outreach', () => {
  it('a failure logs its class and status, not a message that names a number (#4445)', async () => {
    multi.execute.mockRejectedValueOnce(
      Object.assign(new Error('refused To=+12025550142'), { status: 403 })
    );
    await telephonyExecutor.execute(
      'multioutreach',
      { targets: [{ contact: WORDS }], defaultPurpose: PURPOSE },
      ctx
    );
    const line = execLog.error.mock.calls.find((c) => c[1] === '🤝 Multi-outreach failed');
    expect(line?.[0]).toEqual({ error: 'Error', status: 403, targets: 1 });
    expect(logged()).not.toContain('5550142');
  });
});

describe('the other tools in the file', () => {
  it('reachOut, scheduleCallback and checkVoicemail log lengths, yes/no and the session id', async () => {
    vi.stubEnv('OUTBOUND_CONFIRM', 'off');
    await telephonyExecutor.execute('reachout', { contact: WORDS, purpose: PURPOSE }, ctx);
    await telephonyExecutor.execute(
      'schedulecallback',
      { contact: WORDS, when: 'next fictional week' },
      ctx
    );
    await telephonyExecutor.execute('checkvoicemail', {}, ctx);
    expect(execLog.info.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(logged()).not.toContain('zorbleflax');
    expect(logged()).not.toContain('ladder');
    expect(logged()).not.toContain('fictional week');
    expect(logged()).not.toContain('user-fic1');
  });

  it('no string field on any line is longer than an id', async () => {
    await telephonyExecutor.execute('callonbehalf', { contactQuery: WORDS, purpose: PURPOSE }, ctx);
    await telephonyExecutor.execute('reachout', { contact: WORDS, purpose: PURPOSE }, ctx);
    const strings: string[] = [];
    for (const call of execLog.info.mock.calls) {
      JSON.stringify(call[0], (_k, v) => (typeof v === 'string' && strings.push(v), v));
    }
    expect(strings.length).toBeGreaterThan(0);
    for (const s of strings) expect(s.length).toBeLessThanOrEqual(ID_LENGTH);
  });
});
