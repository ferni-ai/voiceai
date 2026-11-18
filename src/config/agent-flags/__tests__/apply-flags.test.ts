/**
 * applyAgentFlags: one apply request from the dev switchboard, against fakes of the dev agent
 * and the flag store. The order is fixed: validate, check the rooms (an update restarts the
 * agent and drops live calls), update, record. A LiveKit failure is never retried, because
 * LiveKit may already have applied the change and restarted the agent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }));
vi.mock('../../../utils/safe-logger.js', () => ({ createLogger: () => log }));

import type { ApplyRequest } from '../domain/apply-request.js';
import type { DevAgent } from '../ports/dev-agent.js';
import type { FlagChange, FlagStore } from '../ports/flag-store.js';
import { applyAgentFlags } from '../use-cases/apply-flags.js';

const NOW = new Date('2026-11-16T15:30:00.000Z');
const ACTOR = 'admin@example.test';
const BODY = { set: { SOUND_CONDUCTOR: 'shadow' }, reset: ['ABUSE_DISCLOSURE_PATTERNS'] };

interface FakeOptions {
  rooms?: Array<{ name: string; participants: number }>;
  roomsFail?: boolean;
  updateFails?: string;
  appendFails?: boolean;
}

function fakes(opts: FakeOptions = {}) {
  const calls: string[] = [];
  const changes: FlagChange[] = [];
  const agent: DevAgent = {
    flagSecretTimes: vi.fn(async () => ({})),
    occupiedRooms: vi.fn(async () => {
      calls.push('occupiedRooms');
      if (opts.roomsFail) throw new Error('room service timed out');
      return opts.rooms ?? [];
    }),
    updateFlags: vi.fn(async (_req: ApplyRequest) => {
      calls.push('updateFlags');
      if (opts.updateFails) throw new Error(opts.updateFails);
    }),
  };
  const store: FlagStore = {
    writeSnapshot: vi.fn(async () => undefined),
    readSnapshot: vi.fn(async () => null),
    appendChange: vi.fn(async (c: FlagChange) => {
      calls.push('appendChange');
      if (opts.appendFails) throw new Error('firestore unavailable');
      changes.push(c);
    }),
    recentChanges: vi.fn(async () => []),
  };
  return { agent, store, calls, changes, deps: { agent, store, now: () => NOW } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyAgentFlags', () => {
  it('checks the rooms, updates the agent, then records the change, and says when', async () => {
    const f = fakes();
    const result = await applyAgentFlags(BODY, ACTOR, f.deps);
    expect(result).toEqual({ status: 200, appliedAt: NOW.toISOString() });
    expect(f.calls).toEqual(['occupiedRooms', 'updateFlags', 'appendChange']);
    expect(f.agent.updateFlags).toHaveBeenCalledWith(BODY);
    expect(f.changes).toEqual([
      { at: NOW.toISOString(), actor: ACTOR, set: BODY.set, reset: BODY.reset, result: 'applied' },
    ]);
  });

  it('refuses an invalid body with 400 before touching the rooms or the agent', async () => {
    const f = fakes();
    const result = await applyAgentFlags(
      { set: { CARTESIA_MODEL: 'on' }, reset: [] },
      ACTOR,
      f.deps
    );
    expect(result).toEqual({
      status: 400,
      errors: ['CARTESIA_MODEL is not a switchable agent flag'],
    });
    expect(f.agent.occupiedRooms).not.toHaveBeenCalled();
    expect(f.agent.updateFlags).not.toHaveBeenCalled();
    expect(f.calls).toEqual([]);
  });

  it('refuses with 409 and the rooms while someone is on a call, and records the refusal', async () => {
    const rooms = [{ name: 'room-fictional-1', participants: 2 }];
    const f = fakes({ rooms });
    const result = await applyAgentFlags(BODY, ACTOR, f.deps);
    expect(result).toEqual({ status: 409, rooms });
    expect(f.agent.updateFlags).not.toHaveBeenCalled();
    expect(f.calls).toEqual(['occupiedRooms', 'appendChange']);
    expect(f.changes).toHaveLength(1);
    expect(f.changes[0]).toMatchObject({ actor: ACTOR, result: 'refused', set: BODY.set });
  });

  it('answers 502 when the rooms cannot be listed, without updating', async () => {
    const f = fakes({ roomsFail: true });
    const result = await applyAgentFlags(BODY, ACTOR, f.deps);
    expect(result.status).toBe(502);
    expect(f.agent.updateFlags).not.toHaveBeenCalled();
    expect(f.changes[0]).toMatchObject({ result: 'failed', actor: ACTOR });
  });

  it('answers 502 when LiveKit fails, records a failure, and does not retry', async () => {
    const livekitText = 'CloudAgent.UpdateAgentSecrets not confirmed: fictional-server-text';
    const f = fakes({ updateFails: livekitText });
    const result = await applyAgentFlags(BODY, ACTOR, f.deps);
    expect(result.status).toBe(502);
    expect(JSON.stringify(result)).not.toContain('fictional-server-text');
    expect(f.agent.updateFlags).toHaveBeenCalledTimes(1);
    expect(f.calls).toEqual(['occupiedRooms', 'updateFlags', 'appendChange']);
    expect(f.changes).toHaveLength(1);
    expect(f.changes[0]).toMatchObject({ actor: ACTOR, result: 'failed', set: BODY.set });
    expect(JSON.stringify(f.changes[0])).not.toContain('fictional-server-text');
  });

  it('still answers 200 with an audit warning when the change applied but was not recorded', async () => {
    const f = fakes({ appendFails: true });
    const result = await applyAgentFlags(BODY, ACTOR, f.deps);
    expect(result).toMatchObject({ status: 200, appliedAt: NOW.toISOString() });
    expect(result.status === 200 && result.auditWarning).toEqual(expect.any(String));
    expect(f.agent.updateFlags).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'applied', error: expect.any(Error) }),
      'Agent flag change not recorded'
    );
  });

  it('still refuses with 409 when the refusal cannot be recorded', async () => {
    const rooms = [{ name: 'room-fictional-2', participants: 1 }];
    const f = fakes({ rooms, appendFails: true });
    expect(await applyAgentFlags(BODY, ACTOR, f.deps)).toEqual({ status: 409, rooms });
    expect(f.agent.updateFlags).not.toHaveBeenCalled();
  });
});
