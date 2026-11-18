/**
 * Deletes LiveKit rooms that have a person in them but no agent (#4125).
 * ROOM_SWEEP_NO_AGENT=on (default off).
 *
 * A room stays open, and billed, while a person is connected, even with no
 * agent. LiveKit's emptyTimeout never fires because the room isn't empty, and
 * departureTimeout only starts once the last participant has left. Two paths
 * leave such a room open with no limit: an agent session that failed (the job
 * keeps the room so a recoverable failure never becomes a hang-up), and a worker
 * that was killed before its cleanup ran.
 *
 * Cloud Scheduler runs one pass a minute (POST /api/jobs/room-sweep). A room
 * counts as alone when it has a connected person (STANDARD, or SIP whose call
 * is answered) and no agent. One seen alone on every pass for the grace period
 * (ROOM_SWEEP_GRACE_MINUTES, default 5) is deleted with the shared deleteRoom.
 * The clock starts at the first pass that finds no agent, so an agent that just
 * left gives a re-dispatch the whole grace period to join. A SIP leg still
 * dialing or ringing doesn't count as a person, so an outbound room waiting on
 * its agent is never swept. A room with no person (empty, or egress/recorder
 * only) is left to LiveKit's own timeouts.
 *
 * The clocks live in SweepClocks, not in memory: the server scales to zero and
 * each pass may land on a different instance. They are keyed by a hash of the
 * room name. Logs carry counts and reason codes, and that hash on each delete:
 * never room names or participant identities.
 *
 * @module servers/api/room-sweep
 */
import { createHash } from 'node:crypto';
import { ParticipantInfo_Kind, ParticipantInfo_State } from '@livekit/protocol';
import { flagOn, type Env } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const defaultLog = createLogger({ module: 'room-sweep' });

/** How long a room is alone before it is deleted, unless ROOM_SWEEP_GRACE_MINUTES says otherwise. */
const DEFAULT_GRACE_MINUTES = 5;

/** Why a room was kept, or that it was swept. */
type SweepReason =
  | 'agent_present'
  | 'no_person'
  | 'ringing'
  | 'within_grace'
  | 'swept'
  | 'delete_failed'
  | 'read_failed';

/** The fields of a LiveKit participant the sweep reads. */
interface SweepParticipant {
  kind?: number;
  state?: number;
  attributes?: Record<string, string>;
}

/** The RoomServiceClient reads the sweep needs. */
interface SweepRooms {
  listRooms: () => Promise<Array<{ name: string }>>;
  listParticipants: (room: string) => Promise<SweepParticipant[]>;
}

/** When each room was first seen alone, by room hash, kept between passes. */
export interface SweepClocks {
  /** Every running clock: room hash → first pass that found the room alone (ms). */
  list: () => Promise<Map<string, number>>;
  start: (roomHash: string, aloneSince: number) => Promise<void>;
  clear: (roomHash: string) => Promise<void>;
}

/** Rooms counted by why each was kept, or that it was swept. */
type SweepCounts = Partial<Record<SweepReason, number>>;

interface SweepLogger {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

interface RoomSweepDeps {
  rooms: SweepRooms;
  deleteRoom: (room: string) => Promise<void>;
  clocks: SweepClocks;
  graceMs: number;
  now?: () => number;
  log?: SweepLogger;
}

/** ROOM_SWEEP_NO_AGENT=on, true or 1 (flagOn). */
export function roomSweepEnabled(env: Env = process.env): boolean {
  return flagOn('ROOM_SWEEP_NO_AGENT', env);
}

/** ROOM_SWEEP_GRACE_MINUTES as milliseconds; anything not a positive number is the default. */
export function sweepGraceMs(env: Env = process.env): number {
  const minutes = Number(env.ROOM_SWEEP_GRACE_MINUTES);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_GRACE_MINUTES) * 60_000;
}

/** A short one-way hash of a room name: the clock's key and the only room id logged. */
function roomHash(room: string): string {
  return createHash('sha256').update(room).digest('hex').slice(0, 12);
}

/** What a room's participants say: agent there, a person alone, a phone still ringing, or nobody. */
function roomState(
  people: SweepParticipant[]
): 'agent_present' | 'alone' | 'ringing' | 'no_person' {
  const connected = people.filter((p) => p.state !== ParticipantInfo_State.DISCONNECTED);
  if (connected.some((p) => p.kind === ParticipantInfo_Kind.AGENT)) return 'agent_present';
  const human = connected.filter(
    (p) => p.kind === ParticipantInfo_Kind.STANDARD || p.kind === ParticipantInfo_Kind.SIP
  );
  // A dialed SIP leg joins while it rings; only an answered one ('active') is a person.
  const ringing = (p: SweepParticipant): boolean => {
    const status = p.attributes?.['sip.callStatus'];
    return p.kind === ParticipantInfo_Kind.SIP && status !== undefined && status !== 'active';
  };
  if (human.some((p) => !ringing(p))) return 'alone';
  return human.length > 0 ? 'ringing' : 'no_person';
}

async function sweepRoom(
  room: string,
  since: number | undefined,
  at: number,
  deps: RoomSweepDeps
): Promise<SweepReason> {
  const hash = roomHash(room);
  const state = roomState(await deps.rooms.listParticipants(room));
  if (state !== 'alone') {
    if (since !== undefined) await deps.clocks.clear(hash);
    return state;
  }
  if (since === undefined) {
    await deps.clocks.start(hash, at);
    return 'within_grace';
  }
  if (at - since < deps.graceMs) return 'within_grace';
  try {
    await deps.deleteRoom(room);
  } catch {
    return 'delete_failed'; // still alone: the next pass tries again
  }
  await deps.clocks.clear(hash);
  (deps.log ?? defaultLog).info({ room: hash, aloneMs: at - since }, 'ROOM_SWEPT_NO_AGENT');
  return 'swept';
}

/** Reads every room once, sweeps the ones alone past the grace period, and returns the counts. Never throws. */
export async function sweepRooms(deps: RoomSweepDeps): Promise<SweepCounts> {
  const log = deps.log ?? defaultLog;
  const counts: SweepCounts = {};
  const add = (reason: SweepReason): void => {
    counts[reason] = (counts[reason] ?? 0) + 1;
  };
  let names: string[];
  let clocks: Map<string, number>;
  try {
    [names, clocks] = await Promise.all([
      deps.rooms.listRooms().then((rooms) => rooms.map((r) => r.name)),
      deps.clocks.list(),
    ]);
  } catch {
    add('read_failed');
    log.warn({ counts }, 'ROOM_SWEEP');
    return counts;
  }
  const at = (deps.now ?? Date.now)();
  const reasons = await Promise.all(
    names.map(async (room) =>
      sweepRoom(room, clocks.get(roomHash(room)), at, deps).catch((): SweepReason => 'read_failed')
    )
  );
  reasons.forEach(add);
  // A clock whose room is gone would restart a reused name part-way through its grace period.
  const listed = new Set(names.map(roomHash));
  const gone = [...clocks.keys()].filter((hash) => !listed.has(hash));
  await Promise.all(gone.map(async (hash) => deps.clocks.clear(hash).catch(() => undefined)));
  const acted = (counts.swept ?? 0) + (counts.delete_failed ?? 0) + (counts.read_failed ?? 0);
  if (acted > 0) log.info({ counts }, 'ROOM_SWEEP');
  return counts;
}
