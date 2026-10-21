/**
 * A read-back waiting on the caller's yes is kept as a follow-up
 * (THREADS_PENDING_CONFIRM), so a dropped call doesn't lose it.
 *
 * Drives the real gate (withOutreachConfirmation and its transcript
 * listeners) around a stand-in outbound tool. The port gets an in-memory
 * FollowUpStore in place of Firestore.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FollowUp,
  FollowUpStore,
  NewFollowUp,
} from '../../../../../services/follow-through/index.js';

const saved = new Map<string, FollowUp>();
const memoryStore: FollowUpStore = {
  open: vi.fn(async (f: NewFollowUp, now: Date) => {
    const at = now.toISOString();
    const id = `ft-${saved.size + 1}`;
    const made: FollowUp = { ...f, id, status: 'open', surfaced: [], createdAt: at, updatedAt: at };
    saved.set(id, made);
    return made;
  }),
  live: async (userId) => [...saved.values()].filter((f) => f.userId === userId),
  due: async () => [],
  changedBetween: async () => [],
  save: vi.fn(async (next: FollowUp, expected: string) => {
    if (saved.get(next.id)?.updatedAt !== expected) return false;
    saved.set(next.id, next);
    return true;
  }),
};

import type { ToolDefinition } from '../../../../registry/types.js';
import {
  openConfirmThread,
  outcomeOf,
  setConfirmThreadPort,
  threadTitle,
} from '../confirm-thread.js';
import {
  outreachConfirmListeners,
  PLAN_ONLY,
  PLANNED,
  withOutreachConfirmation,
  type ConfirmSpec,
} from '../outreach-confirm.js';

const MOM_NUMBER = '+15551230001';
const sends: Array<Record<string, unknown>> = [];

const callDef: ToolDefinition = {
  id: 'callOnBehalf',
  name: 'callOnBehalf',
  description: 'call someone',
  domain: 'communication',
  create: () =>
    ({
      execute: async (args: Record<string, unknown>) => {
        if (PLAN_ONLY in args) return 'plan';
        sends.push(args);
        return 'Calling Mom now.';
      },
    }) as never,
};

const callSpec: ConfirmSpec = {
  prepare: async (args) => ({
    args: {
      ...args,
      phoneNumber: MOM_NUMBER,
      [PLANNED]: { contactId: 'c-mom', to: MOM_NUMBER, channel: 'call' },
    },
    readBack: `a call to Mom at ${MOM_NUMBER}, to check in`,
  }),
};

const ctx = { userId: 'owner-1', agentId: 'ferni', agentDisplayName: 'Ferni' };

/** `null`: no owner check on this session, so the speaker is not known to be the owner. */
function liveCall(speakerIsOwner: (() => boolean) | null = () => true) {
  const session = { agentState: 'listening' };
  const listeners = outreachConfirmListeners(session, speakerIsOwner ?? undefined);
  const tool = withOutreachConfirmation(callDef, callSpec).create(ctx);
  return {
    /** The model calls the tool; its output then reaches the model. */
    call: async (callId: string) => {
      const out = await (tool as { execute: (a: unknown, o: unknown) => Promise<unknown> }).execute(
        { contactQuery: 'Mom', purpose: 'check in' },
        { ctx: { session }, toolCallId: callId }
      );
      listeners.onToolsExecuted({ functionCalls: [{ callId }] });
      return String(out);
    },
    caller: (text: string) => listeners.onTranscript({ transcript: text, isFinal: true }),
  };
}

/** Let background writes run. */
const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
const threads = (): FollowUp[] => [...saved.values()];
const waitingOnYou = (f: FollowUp): boolean => f.status === 'open' && f.action?.waitingOn === 'you';

describe('THREADS_PENDING_CONFIRM: no promise without a thread', () => {
  beforeEach(() => {
    vi.stubEnv('THREADS_PENDING_CONFIRM', 'on');
    setConfirmThreadPort({ store: () => memoryStore, zoneOf: async () => 'America/Denver' });
  });
  afterEach(() => {
    setConfirmThreadPort(undefined);
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    saved.clear();
    sends.length = 0;
  });

  it('a read-back is kept for the owner as waiting on you, with the contact id and no number', async () => {
    // A fixed clock, so no timestamp (like 14:28:30.555Z) can contain '555'.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T14:00:00.000Z'));
    const call = liveCall();
    expect(await call.call('c1')).toContain('NOT SENT YET');
    await vi.waitFor(() => expect(threads()).toHaveLength(1));
    const [thread] = threads();
    expect(waitingOnYou(thread)).toBe(true);
    expect(thread).toMatchObject({
      userId: 'owner-1',
      kind: 'promise',
      text: 'Call Mom',
      zone: 'America/Denver',
      action: { tool: 'callOnBehalf', contactId: 'c-mom', waitingOn: 'you' },
    });
    // The number itself, in each form it could be stored: a bare '555' also matched a
    // random thread ref (…954555d4e6) and failed about one run in a hundred.
    const stored = JSON.stringify(thread).replace(/[^0-9]/g, '');
    expect(stored).not.toContain(MOM_NUMBER.replace(/[^0-9]/g, '').slice(1));
    expect(sends).toHaveLength(0);
  });

  it('the yes that sends it closes it as done with the outcome', async () => {
    const call = liveCall();
    await call.call('c1');
    call.caller('Yes, go ahead.');
    await call.call('c2');
    expect(sends).toHaveLength(1);
    await vi.waitFor(() => expect(threads()[0]?.status).toBe('done'));
    expect(threads()[0].action).toEqual({
      tool: 'callOnBehalf',
      contactId: 'c-mom',
      outcome: 'unknown',
    });
  });

  it('a no drops it and nothing is sent', async () => {
    const call = liveCall();
    await call.call('c1');
    await vi.waitFor(() => expect(threads()).toHaveLength(1));
    call.caller("No, don't call her.");
    await vi.waitFor(() => expect(threads()[0].status).toBe('released'));
    expect(threads()[0].action?.waitingOn).toBeUndefined();
    expect(sends).toHaveLength(0);
  });

  it('a newer read-back in its place releases the old one', async () => {
    const call = liveCall();
    await call.call('c1');
    await vi.waitFor(() => expect(threads()).toHaveLength(1));
    await call.call('c2'); // asked again before any answer: a new read-back
    await vi.waitFor(() => expect(threads().map((f) => f.status)).toEqual(['released', 'open']));
    expect(waitingOnYou(threads()[1])).toBe(true);
  });

  it('a call that ends while it waits leaves it waiting on you', async () => {
    let call: ReturnType<typeof liveCall> | undefined = liveCall();
    await call.call('c1');
    call.caller('Hmm, let me think about it.');
    call = undefined; // the call drops: no yes, no no
    await vi.waitFor(() => expect(threads()).toHaveLength(1));
    await settle();
    expect(threads().map(waitingOnYou)).toEqual([true]);
    expect(memoryStore.save).not.toHaveBeenCalled();
  });

  it('flag off: nothing is written, and the yes still sends as before', async () => {
    vi.stubEnv('THREADS_PENDING_CONFIRM', 'off');
    const call = liveCall();
    await call.call('c1');
    call.caller('Yes.');
    await call.call('c2');
    expect(sends).toHaveLength(1);
    await settle();
    expect(memoryStore.open).not.toHaveBeenCalled();
    expect(memoryStore.save).not.toHaveBeenCalled();
  });

  it('owner only: no record when the speaker is not known to be the owner', async () => {
    const call = liveCall(null);
    expect(await call.call('c1')).toContain('NOT SENT YET');
    await settle();
    expect(memoryStore.open).not.toHaveBeenCalled();
  });
});

describe('confirm-thread helpers', () => {
  it('a title says what and who, never the number', () => {
    expect(threadTitle('reachOut', { contact: 'Dana' }, { channel: 'text' })).toBe('Text Dana');
    expect(threadTitle('makePhoneCall', { contactName: MOM_NUMBER })).toBe('Call them');
    expect(threadTitle('makePhoneCall', { contactName: '5-5-5 0199' })).toBe('Call them');
    expect(threadTitle('makePhoneCall', { contactName: 'five five five, zero one' })).toBe(
      'Call them'
    );
    expect(threadTitle('sendTextMessage', { contactName: 'Aunt Jo' })).toBe('Text Aunt Jo');
  });

  it('keeps a contact id only in a saved contact id shape, never a number', async () => {
    vi.stubEnv('THREADS_PENDING_CONFIRM', 'on');
    setConfirmThreadPort({ store: () => memoryStore, zoneOf: async () => 'UTC' });
    const open = (contactId: string): void =>
      openConfirmThread(
        {},
        {
          userId: 'owner-1',
          toolId: 'reachOut',
          args: {},
          planned: { contactId },
          ownerVerified: true,
        }
      );
    open('contact_1797512345678_k3x9a1b');
    open(MOM_NUMBER);
    open('555-123-0001');
    await vi.waitFor(() => expect(saved.size).toBe(3));
    expect(threads().map((f) => f.action?.contactId)).toEqual([
      'contact_1797512345678_k3x9a1b',
      undefined,
      undefined,
    ]);
    setConfirmThreadPort(undefined);
    vi.unstubAllEnvs();
    saved.clear();
  });

  it("the gate's own 'Nothing was' reply counts as failed", () => {
    expect(outcomeOf('Nothing was dialed: no number.')).toBe('failed');
    expect(outcomeOf({ success: true })).toBe('sent');
    expect(outcomeOf('Calling Mom now.')).toBe('unknown');
  });
});
