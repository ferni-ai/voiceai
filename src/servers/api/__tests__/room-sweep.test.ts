/**
 * The room sweep (#4125): a room with a person and no agent past the grace
 * period is deleted; everything else is kept, including a phone still ringing
 * for an agent that hasn't joined and a room an agent just left. Each pass is
 * a separate call that shares nothing but the clocks store, as passes on
 * different instances do.
 */
import { createHash } from 'node:crypto';
import { ParticipantInfo_Kind as Kind, ParticipantInfo_State as State } from '@livekit/protocol';
import { describe, expect, it, vi } from 'vitest';
import { roomSweepEnabled, sweepGraceMs, sweepRooms, type SweepClocks } from '../room-sweep.js';

/** The participant fields the sweep reads (a LiveKit ParticipantInfo). */
interface SweepParticipant {
  kind?: number;
  state?: number;
  attributes?: Record<string, string>;
}
/** The room name as the logs and clock keys carry it: the first 12 hex of its sha256. */
const roomHash = (room: string): string =>
  createHash('sha256').update(room).digest('hex').slice(0, 12);

/** An in-memory clocks store, standing in for the Firestore one. */
function memoryClocks(): SweepClocks & { docs: Map<string, number> } {
  const docs = new Map<string, number>();
  return {
    docs,
    list: async () => new Map(docs),
    start: async (hash, since) => void docs.set(hash, since),
    clear: async (hash) => void docs.delete(hash),
  };
}
const quiet = { info: () => undefined, warn: () => undefined };

const MIN = 60_000;
const GRACE = 5 * MIN;
const ROOM = 'voice-riley-test-1';

const person: SweepParticipant = { kind: Kind.STANDARD, state: State.ACTIVE };
const agent: SweepParticipant = { kind: Kind.AGENT, state: State.ACTIVE };
const egress: SweepParticipant = { kind: Kind.EGRESS, state: State.ACTIVE };
const phone = (status?: string): SweepParticipant => ({
  kind: Kind.SIP,
  state: State.ACTIVE,
  attributes: status === undefined ? {} : { 'sip.callStatus': status },
});

/** A sweep over one room whose participants the test sets, on a clock the test moves. */
function setup(people: SweepParticipant[] = [person]) {
  const room = { people, listed: true };
  const deleted: string[] = [];
  const lines: Array<[Record<string, unknown>, string]> = [];
  const log = {
    info: (obj: Record<string, unknown>, msg: string) => void lines.push([obj, msg]),
    warn: (obj: Record<string, unknown>, msg: string) => void lines.push([obj, msg]),
  };
  const clocks = memoryClocks();
  const at = async (ms: number) =>
    sweepRooms({
      rooms: {
        listRooms: async () => (room.listed ? [{ name: ROOM }] : []),
        listParticipants: async () => room.people,
      },
      deleteRoom: async (name) => void deleted.push(name),
      clocks,
      graceMs: GRACE,
      now: () => ms,
      log,
    });
  return { room, deleted, lines, clocks, at };
}

describe('a person alone with no agent', () => {
  it('past the grace period: the room is deleted with the shared deleteRoom', async () => {
    const s = setup();
    expect(await s.at(0)).toEqual({ within_grace: 1 });
    expect(await s.at(4 * MIN)).toEqual({ within_grace: 1 });
    expect(s.deleted).toEqual([]);
    expect(await s.at(GRACE)).toEqual({ swept: 1 });
    expect(s.deleted).toEqual([ROOM]);
    expect(s.clocks.docs.size).toBe(0);
  });

  it('the clock is stored by room hash at the first pass that finds the room alone', async () => {
    const s = setup();
    await s.at(3 * MIN);
    expect([...s.clocks.docs]).toEqual([[roomHash(ROOM), 3 * MIN]]);
  });

  it('within the grace period: kept', async () => {
    const s = setup();
    await s.at(0);
    expect(await s.at(GRACE - 1)).toEqual({ within_grace: 1 });
    expect(s.deleted).toEqual([]);
  });

  it('an answered phone caller alone counts the same', async () => {
    const s = setup([phone('active')]);
    await s.at(0);
    expect(await s.at(GRACE)).toEqual({ swept: 1 });
    const inbound = setup([phone()]); // an inbound SIP leg with no call status
    await inbound.at(0);
    expect(await inbound.at(GRACE)).toEqual({ swept: 1 });
  });

  it('logs counts and a hashed room name, never the room name', async () => {
    const s = setup();
    await s.at(0);
    await s.at(GRACE);
    const text = JSON.stringify(s.lines);
    expect(text).not.toContain(ROOM);
    expect(s.lines).toContainEqual([
      { room: roomHash(ROOM), aloneMs: GRACE },
      'ROOM_SWEPT_NO_AGENT',
    ]);
    expect(s.lines).toContainEqual([{ counts: { swept: 1 } }, 'ROOM_SWEEP']);
    expect(roomHash(ROOM)).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('kept', () => {
  it('an agent in the room', async () => {
    const s = setup([person, agent]);
    await s.at(0);
    expect(await s.at(60 * MIN)).toEqual({ agent_present: 1 });
    expect(s.deleted).toEqual([]);
  });

  it('egress or a recorder only: no person, so LiveKit timeouts apply as before', async () => {
    const s = setup([egress]);
    await s.at(0);
    expect(await s.at(60 * MIN)).toEqual({ no_person: 1 });
    expect(await setup([]).at(0)).toEqual({ no_person: 1 });
    expect(s.deleted).toEqual([]);
  });

  it('a person who has disconnected is not a person', async () => {
    const s = setup([{ ...person, state: State.DISCONNECTED }]);
    await s.at(0);
    expect(await s.at(60 * MIN)).toEqual({ no_person: 1 });
  });

  it.each(['dialing', 'ringing'])(
    'an outbound phone still %s before its agent joins',
    async (status) => {
      const s = setup([phone(status)]);
      await s.at(0);
      expect(await s.at(60 * MIN)).toEqual({ ringing: 1 });
      expect(s.deleted).toEqual([]);
    }
  );

  it('a ringing room that is answered starts its clock at the answer, not at the dial', async () => {
    const s = setup([phone('ringing')]);
    await s.at(0);
    s.room.people = [phone('active')];
    expect(await s.at(2 * MIN)).toEqual({ within_grace: 1 });
    expect(await s.at(GRACE)).toEqual({ within_grace: 1 });
    expect(await s.at(2 * MIN + GRACE)).toEqual({ swept: 1 });
  });

  it('an agent that left within the grace window: a re-dispatch has the full grace to join', async () => {
    const s = setup([person, agent]);
    await s.at(0);
    s.room.people = [person]; // the agent left just after this pass
    expect(await s.at(MIN)).toEqual({ within_grace: 1 });
    expect(await s.at(MIN + GRACE - 1)).toEqual({ within_grace: 1 });
    s.room.people = [person, agent]; // re-dispatched agent joins
    expect(await s.at(MIN + GRACE)).toEqual({ agent_present: 1 });
    s.room.people = [person]; // and leaves again: the clock starts over
    expect(await s.at(MIN + GRACE + MIN)).toEqual({ within_grace: 1 });
    expect(await s.at(MIN + 2 * GRACE)).toEqual({ within_grace: 1 });
    expect(s.deleted).toEqual([]);
  });

  it('a room that closed and reopened under the same name starts a new clock', async () => {
    const s = setup();
    await s.at(0);
    s.room.listed = false;
    expect(await s.at(MIN)).toEqual({});
    expect(s.clocks.docs.size).toBe(0); // the gone room's clock is cleared
    s.room.listed = true;
    expect(await s.at(GRACE)).toEqual({ within_grace: 1 });
  });
});

describe('failures', () => {
  it('a failed delete is counted, keeps the clock and is retried on the next pass', async () => {
    let fail = true;
    const deleted: string[] = [];
    const clocks = memoryClocks();
    const pass = async (now: number) =>
      sweepRooms({
        rooms: { listRooms: async () => [{ name: ROOM }], listParticipants: async () => [person] },
        deleteRoom: async (name) => {
          if (fail) throw new Error('not found');
          deleted.push(name);
        },
        clocks,
        graceMs: GRACE,
        now: () => now,
        log: quiet,
      });
    await pass(0);
    expect(await pass(GRACE)).toEqual({ delete_failed: 1 });
    expect(clocks.docs.get(roomHash(ROOM))).toBe(0);
    fail = false;
    expect(await pass(GRACE + MIN)).toEqual({ swept: 1 });
    expect(deleted).toEqual([ROOM]);
  });

  it('a failed read never throws and deletes nothing', async () => {
    const deleteRoom = vi.fn();
    const pass = async (
      rooms: Parameters<typeof sweepRooms>[0]['rooms'],
      clocks = memoryClocks()
    ) => sweepRooms({ rooms, deleteRoom, clocks, graceMs: 1, log: quiet });
    const fails = () => Promise.reject(new Error('x'));
    expect(await pass({ listRooms: fails, listParticipants: async () => [] })).toEqual({
      read_failed: 1,
    });
    expect(
      await pass({ listRooms: async () => [{ name: ROOM }], listParticipants: fails })
    ).toEqual({ read_failed: 1 });
    const clocksFail = { ...memoryClocks(), list: fails };
    expect(
      await pass(
        { listRooms: async () => [{ name: ROOM }], listParticipants: async () => [person] },
        clocksFail
      )
    ).toEqual({ read_failed: 1 });
    expect(deleteRoom).not.toHaveBeenCalled();
  });
});

describe('the flag', () => {
  it('ROOM_SWEEP_NO_AGENT is off by default', () => {
    expect(roomSweepEnabled({})).toBe(false);
    expect(roomSweepEnabled({ ROOM_SWEEP_NO_AGENT: 'on' })).toBe(true);
  });

  it('the grace period is ROOM_SWEEP_GRACE_MINUTES, 5 by default', () => {
    expect(sweepGraceMs({})).toBe(5 * MIN);
    expect(sweepGraceMs({ ROOM_SWEEP_GRACE_MINUTES: '10' })).toBe(10 * MIN);
    for (const bad of ['0', '-3', 'soon', ''])
      expect(sweepGraceMs({ ROOM_SWEEP_GRACE_MINUTES: bad }), bad).toBe(5 * MIN);
  });
});
