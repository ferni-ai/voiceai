/**
 * An in-memory WaveStore over the same docs as memoryStore(), with the
 * Firestore wave store's semantics: numbered-once wave docs, queue order by
 * (laneRank, priorityKey), seats, lapses back to the pool.
 */
import { queueFields, readEntry, type QueueEntry } from '../queue.js';
import { readSettings, SEAT_DAYS } from '../settings.js';
import type { WaveRecord, WaveStore } from '../wave.js';

type Docs = Map<string, Record<string, unknown>>;

export function memoryWaveStore(docs: Docs, settings: Record<string, unknown> = {}) {
  const waves = new Map<string, Record<string, unknown>>();
  const all = (pred: (d: Record<string, unknown>) => boolean): QueueEntry[] =>
    [...docs.entries()].filter(([, d]) => pred(d)).map(([id, d]) => readEntry(id, d));
  const store: WaveStore = {
    settings: async () => readSettings(settings),
    claimWave: async (id, at, fixed) => {
      const w = waves.get(id);
      if (w && (w.status === 'running' || w.status === 'done')) {
        return { id, number: w.number as number, status: w.status } as WaveRecord;
      }
      const numbers = [...waves.values()].map((v) => v.number as number).filter((n) => n >= 1);
      const number = fixed ?? Math.max(0, ...numbers) + 1;
      waves.set(id, { number, status: 'running', startedAt: at });
      return { id, number, status: 'running' };
    },
    finishWave: async (id, summary) => void waves.set(id, { ...waves.get(id), ...summary, status: 'done' }), // prettier-ignore
    recordSkip: async (id, summary) => {
      if (waves.get(id)?.status !== 'done') waves.set(id, { ...waves.get(id), ...summary, status: 'skipped' }); // prettier-ignore
    },
    admittedIn: async (waveId) => all((d) => d.waveId === waveId).length,
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
      all((d) => d.status === 'admitted' && (d.seatExpiresAt as Date).getTime() < now.getTime()),
    admit: async (e, wave, now) => {
      const seatExpiresAt = new Date(now.getTime() + SEAT_DAYS * 86_400_000);
      docs.set(e.id, { ...docs.get(e.id), status: 'admitted', waveId: wave.id, admittedAt: now, seatExpiresAt, foundingMember: true, foundingWave: wave.number, inQueue: false }); // prettier-ignore
    },
    lapse: async (e, now) => {
      const d = { ...docs.get(e.id) };
      for (const k of ['waveId', 'seatExpiresAt', 'foundingMember', 'foundingWave']) delete d[k];
      const back = { ...e, status: 'lapsed', requeuedAtMs: now.getTime() };
      docs.set(e.id, { ...d, status: 'lapsed', lapsedAt: now, requeuedAt: now, ...queueFields(back) }); // prettier-ignore
    },
  };
  return { waves, store };
}
