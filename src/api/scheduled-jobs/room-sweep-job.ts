/**
 * POST /api/jobs/room-sweep (every minute; ROOM_SWEEP_NO_AGENT, #4125): one pass of the sweep
 * that deletes LiveKit rooms with a person but no agent (servers/api/room-sweep.ts).
 *
 * The grace clocks are Firestore docs (ROOM_SWEEP_CLOCKS), one per 12-hex room hash, so a pass
 * on one instance sees the clocks a pass on another started. A doc holds only the time the room
 * was first seen alone and an expireAt; the pass deletes clocks whose room is gone, and expireAt
 * lets a TTL policy clear the rest if the job stops running.
 *
 * @module api/scheduled-jobs/room-sweep-job
 */

import type { ServerResponse } from 'http';
import { sendJson } from './helpers.js';
import type { SweepClocks } from '../../servers/api/room-sweep.js';

const ROOM_SWEEP_CLOCKS = 'livekit_room_sweep_clocks';
/** A clock outlives any grace period; this only bounds one the sweep stopped visiting. */
const CLOCK_KEEP_MS = 24 * 60 * 60 * 1000;

interface ClockDoc {
  aloneSince?: number;
}

async function firestoreSweepClocks(): Promise<SweepClocks> {
  const { getFirestoreDb } = await import('../../utils/firestore-utils.js');
  const { safeSet } = await import('../../utils/safe-firestore.js');
  const { Timestamp } = await import('@google-cloud/firestore');
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore unavailable');
  const clocks = db.collection(ROOM_SWEEP_CLOCKS);
  return {
    list: async () => {
      const snap = await clocks.get();
      const running = new Map<string, number>();
      for (const doc of snap.docs) {
        const { aloneSince } = doc.data() as ClockDoc;
        if (typeof aloneSince === 'number') running.set(doc.id, aloneSince);
      }
      return running;
    },
    start: async (roomHash, aloneSince) => {
      // expireAt is a Timestamp (safeSet would write a Date as a string) so a TTL policy can read it
      await safeSet(clocks.doc(roomHash), {
        aloneSince,
        expireAt: Timestamp.fromMillis(aloneSince + CLOCK_KEEP_MS),
      });
    },
    clear: async (roomHash) => {
      await clocks.doc(roomHash).delete();
    },
  };
}

/** One sweep pass, or why none ran. */
export async function runRoomSweepJob(
  env: Record<string, string | undefined> = process.env
): Promise<Record<string, unknown>> {
  const { roomSweepEnabled, sweepGraceMs, sweepRooms } =
    await import('../../servers/api/room-sweep.js');
  if (!roomSweepEnabled(env)) return { skipped: 'flag-off' };
  const { getRoomService } = await import('../../servers/token/livekit.js');
  const { deleteRoom } = await import('../../agents/shared/phone-goodbye.js');
  const service = getRoomService();
  const counts = await sweepRooms({
    rooms: {
      listRooms: async () => service.listRooms(),
      listParticipants: async (room) => service.listParticipants(room),
    },
    deleteRoom,
    clocks: await firestoreSweepClocks(),
    graceMs: sweepGraceMs(env),
  });
  return { counts };
}

/** A throw (Firestore unavailable) becomes a 500 in runScheduledJob. */
export async function handleRoomSweep(res: ServerResponse): Promise<void> {
  sendJson(res, 200, { success: true, job: 'room-sweep', ...(await runRoomSweepJob()) });
}
