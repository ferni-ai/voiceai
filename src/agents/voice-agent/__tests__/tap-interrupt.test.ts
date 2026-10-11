import { ParticipantKind } from '@livekit/rtc-node';
import { describe, expect, it, vi } from 'vitest';
import {
  TAP_INTERRUPT_ATTRIBUTE,
  advertiseTapInterrupt,
  handleTapInterrupt,
  tapInterruptEnabled,
  type InterruptibleSession,
  type TapInterruptRoom,
} from '../tap-interrupt.js';

const ON = { TAP_INTERRUPT: 'on' };
const OFF = {};
const CALLER = 'user-123';
const OTHER_AGENT = 'agent-teammate';

function makeRoom(): TapInterruptRoom & { setAttributes: ReturnType<typeof vi.fn> } {
  const setAttributes = vi.fn().mockResolvedValue(undefined);
  return {
    setAttributes,
    localParticipant: { setAttributes },
    remoteParticipants: new Map([
      [CALLER, { kind: ParticipantKind.STANDARD }],
      [OTHER_AGENT, { kind: ParticipantKind.AGENT }],
    ]),
  };
}

function makeSession(agentState: string): InterruptibleSession & {
  interrupt: ReturnType<typeof vi.fn>;
} {
  return { agentState, interrupt: vi.fn(() => ({ await: Promise.resolve() })) };
}

const tap = { type: 'user_interrupt', timestamp: 1_760_000_000_000 };

describe('tapInterruptEnabled', () => {
  it('is off unless TAP_INTERRUPT is exactly "on"', () => {
    expect(tapInterruptEnabled(OFF)).toBe(false);
    expect(tapInterruptEnabled({ TAP_INTERRUPT: 'off' })).toBe(false);
    expect(tapInterruptEnabled({ TAP_INTERRUPT: 'true' })).toBe(false);
    expect(tapInterruptEnabled(ON)).toBe(true);
  });
});

describe('advertiseTapInterrupt', () => {
  it('does not set the attribute when the flag is off', () => {
    const room = makeRoom();
    advertiseTapInterrupt(room, OFF);
    expect(room.setAttributes).not.toHaveBeenCalled();
  });

  it('sets ferni.tap_interrupt=on when the flag is on', () => {
    const room = makeRoom();
    advertiseTapInterrupt(room, ON);
    expect(room.setAttributes).toHaveBeenCalledWith({ [TAP_INTERRUPT_ATTRIBUTE]: 'on' });
  });

  it('logs rather than throws when setting the attribute fails', async () => {
    const room = makeRoom();
    room.setAttributes.mockRejectedValueOnce(new Error('not connected'));
    expect(() => advertiseTapInterrupt(room, ON)).not.toThrow();
    await Promise.resolve();
  });
});

describe('handleTapInterrupt', () => {
  it('ignores the message when the flag is off, even while speaking', async () => {
    const session = makeSession('speaking');
    const outcome = await handleTapInterrupt(tap, makeRoom(), session, CALLER, OFF);
    expect(outcome).toBe('disabled');
    expect(session.interrupt).not.toHaveBeenCalled();
  });

  it('interrupts when the flag is on and Ferni is speaking', async () => {
    const session = makeSession('speaking');
    const outcome = await handleTapInterrupt(tap, makeRoom(), session, CALLER, ON);
    expect(outcome).toBe('interrupted');
    expect(session.interrupt).toHaveBeenCalledTimes(1);
  });

  it.each(['listening', 'thinking', 'idle', 'initializing'])(
    'does not interrupt while the agent is %s',
    async (state) => {
      const session = makeSession(state);
      const outcome = await handleTapInterrupt(tap, makeRoom(), session, CALLER, ON);
      expect(outcome).toBe('not_speaking');
      expect(session.interrupt).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['null', null],
    ['a string', 'user_interrupt'],
    ['no timestamp', { type: 'user_interrupt' }],
    ['a string timestamp', { type: 'user_interrupt', timestamp: 'now' }],
    ['a NaN timestamp', { type: 'user_interrupt', timestamp: Number.NaN }],
    ['the wrong type', { type: 'user_reaction', timestamp: 1 }],
  ])('ignores a malformed message (%s)', async (_label, message) => {
    const session = makeSession('speaking');
    const outcome = await handleTapInterrupt(message, makeRoom(), session, CALLER, ON);
    expect(outcome).toBe('malformed');
    expect(session.interrupt).not.toHaveBeenCalled();
  });

  it.each([
    ['another agent', OTHER_AGENT],
    ['someone not in the room', 'stranger'],
    ['no sender', undefined],
  ])('ignores a tap from %s', async (_label, senderIdentity) => {
    const session = makeSession('speaking');
    const outcome = await handleTapInterrupt(tap, makeRoom(), session, senderIdentity, ON);
    expect(outcome).toBe('not_caller');
    expect(session.interrupt).not.toHaveBeenCalled();
  });

  it('reports failure instead of throwing when the session cannot interrupt', async () => {
    const session = makeSession('speaking');
    session.interrupt.mockImplementation(() => {
      throw new Error('AgentSession is not running');
    });
    const outcome = await handleTapInterrupt(tap, makeRoom(), session, CALLER, ON);
    expect(outcome).toBe('failed');
  });
});
