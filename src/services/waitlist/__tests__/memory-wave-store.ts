/**
 * An in-memory WaveStore over the same docs as memoryStore(), with the
 * Firestore wave store's semantics: a leased, numbered-once wave doc with an
 * admitted counter; admitOne and lapse as atomic read-check-write steps (no
 * await between read and write, the in-memory equivalent of a transaction);
 * members with an active profile marked joined.
 */
import { queueFields, readEntry, type QueueEntry } from '../queue.js';
import { readSettings, SEAT_DAYS } from '../settings.js';
import type { WaveRecord, WaveStore } from '../wave.js';

type Docs = Map<string, Record<string, unknown>>;
const MEMBER = { status: 'joined', inQueue: false, joinedVia: 'active-profile' };

export function memoryWaveStore(
  docs: Docs,
  settings: Record<string, unknown> = {},
  profiles: Docs = new Map()
) {
  // prettier-ignore
  const waves = new Map<string, Record<string, unknown>>();
  const active = (id: string) => (profiles.get(id)?.subscription as { status?: string } | undefined)?.status === 'active'; // prettier-ignore
  const store: WaveStore = {
    settings: async () => readSettings(settings),
    claimWave: async (id, now, leaseUntil, fixed) => {
      const w = waves.get(id);
      const admitted = (w?.admitted as number | undefined) ?? 0;
      const held = w?.status === 'running' && (w.leaseUntil as Date).getTime() > now.getTime();
      if (w && (w.status === 'done' || held)) return { id, number: w.number as number, status: held ? 'busy' : 'done', admitted }; // prettier-ignore
      const numbers = [...waves.values()].map((v) => v.number as number).filter((n) => n >= 1);
      const number = (w?.number as number | undefined) ?? fixed ?? Math.max(0, ...numbers) + 1;
      waves.set(id, { ...w, number, status: 'running', leaseUntil, admitted });
      return { id, number, status: 'running', admitted } satisfies WaveRecord;
    },
    finishWave: async (id, summary) => void waves.set(id, { ...waves.get(id), ...summary, status: 'done' }), // prettier-ignore
    recordSkip: async (id, summary) => {
      const status = waves.get(id)?.status;
      if (status !== 'done' && status !== 'running') waves.set(id, { ...waves.get(id), ...summary, status: 'skipped' }); // prettier-ignore
    },
    nextInLine: async (limit) =>
      [...docs.entries()]
        .filter(([, d]) => d.inQueue === true)
        .sort(
          ([, a], [, b]) =>
            (a.laneRank as number) - (b.laneRank as number) ||
            (a.priorityKey as number) - (b.priorityKey as number)
        ) // prettier-ignore
        .slice(0, limit)
        .map(([id, d]) => readEntry(id, d)),
    lapsedSeats: async (now) =>
      [...docs.entries()]
        .filter(
          ([, d]) => d.status === 'admitted' && (d.seatExpiresAt as Date).getTime() < now.getTime()
        ) // prettier-ignore
        .map(([id, d]) => readEntry(id, d)),
    admitOne: async (e, wave, size, now) => {
      const w = waves.get(wave.id)!;
      if (((w.admitted as number | undefined) ?? 0) >= size) return 'full';
      const d = docs.get(e.id);
      if (!d || d.inQueue !== true) return 'skipped';
      if (active(e.id)) return (void docs.set(e.id, { ...d, ...MEMBER }), 'member');
      const founding = { foundingWaveMember: true, foundingWave: wave.number };
      const seatExpiresAt = new Date(now.getTime() + SEAT_DAYS * 86_400_000);
      docs.set(e.id, { ...d, status: 'admitted', waveId: wave.id, admittedAt: now, seatExpiresAt, inQueue: false, ...founding }); // prettier-ignore
      if (profiles.has(e.id)) profiles.set(e.id, { ...profiles.get(e.id), ...founding });
      w.admitted = ((w.admitted as number | undefined) ?? 0) + 1;
      return 'admitted';
    },
    lapse: async (e: QueueEntry, now) => {
      const d = docs.get(e.id);
      const fresh = d ? readEntry(e.id, d) : null;
      if (!fresh || fresh.status !== 'admitted' || (fresh.seatExpiresAt?.getTime() ?? Infinity) >= now.getTime()) return 'skipped'; // prettier-ignore
      if (active(e.id)) return (void docs.set(e.id, { ...d, ...MEMBER }), 'member');
      const rest = { ...d };
      for (const k of ['waveId', 'seatExpiresAt', 'foundingWaveMember', 'foundingWave'])
        delete rest[k];
      const back = { ...fresh, status: 'lapsed', requeuedAtMs: now.getTime() };
      docs.set(e.id, { ...rest, status: 'lapsed', lapsedAt: now, requeuedAt: now, ...queueFields(back) }); // prettier-ignore
      return 'lapsed';
    },
  };
  return { waves, store, profiles };
}
