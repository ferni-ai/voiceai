/**
 * Offline end-of-turn bakeoff for ink-2: replay labelled caller pauses to ink
 * at several turn-end thresholds and measure, per pause, when ink ends the turn.
 *
 * usage: npx tsx scripts/audio-eval/ink-turn-sweep.ts <manifest.jsonl> <out.jsonl> [end,end,...]
 *   manifest rows: { id, ds, kind: 'hold'|'shift', dur, preMs, postMs, file, text? }
 *     file: 16 kHz mono s16le PCM. The caller stops speaking at preMs; a hold
 *     (mid-thought pause) resumes after dur ms, a shift (true end) does not.
 *   CARTESIA_API_KEY must be set. CONCURRENCY (default 12). Arms default to
 *   0.1,0.2,0.3,0.45 with the responsive profile's start/eager/timeout (ink
 *   accepts turn-end thresholds from 0.05 to 0.5 only).
 *   SUMMARY=1 skips the replay and summarizes an existing out.jsonl.
 *
 * Each window streams in real time (20 ms chunks), as a call would, and an
 * event's time is its arrival, so it includes the network round trip prod pays.
 * Labels come from the caller's next action (the 2026-10-10 item sets: eval
 * calls with scripted callers, and AMI meeting headsets for human speech).
 *
 * Summary per dataset x arm, with LiveKit's minimum endpointing floor added to
 * ink's end (prod: 300 ms): cut-off rate on holds (ink took the turn before the
 * caller resumed), by pause length; latency on shifts; precision/recall/F1 of
 * "turn is over" at 500/1000/1500 ms budgets (a cut-off is a false positive).
 */
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import WebSocket from 'ws';
import { INK_TURN_PROFILES } from '../../src/agents/model-provider/cartesia-cascade.js';

interface Item {
  id: string;
  ds: string;
  kind: 'hold' | 'shift';
  dur: number;
  preMs: number;
  postMs: number;
  file: string;
}
interface Result {
  id: string;
  ds: string;
  kind: string;
  dur: number;
  arm: number;
  /** First turn.end after the caller stopped, ms after they stopped; null: none in the window. */
  endMs: number | null;
  eagerMs: number | null;
  error?: string;
}

const FLOOR_MS = Number(process.env.FLOOR_MS ?? 300);
const MISSING_MS = 4000;
const BUDGETS = [500, 1000, 1500];
const [manifestPath, outPath, armsArg] = process.argv.slice(2);
if (!manifestPath || !outPath) {
  console.error('usage: ink-turn-sweep.ts <manifest.jsonl> <out.jsonl> [end,end,...]');
  process.exit(2);
}
const arms = (armsArg ?? '0.1,0.2,0.3,0.45').split(',').map(Number);
const base = INK_TURN_PROFILES.responsive;
const items: Item[] = readFileSync(manifestPath, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

async function replay(item: Item, end: number): Promise<Result> {
  const buf = readFileSync(item.file);
  const pcm = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1);
  const params = new URLSearchParams({
    model: 'ink-2',
    sample_rate: '16000',
    encoding: 'pcm_s16le',
    turn_start_threshold: String(base.startThreshold),
    turn_eager_end_threshold: String(Math.max(base.eagerEndThreshold, end + 0.05)),
    turn_end_threshold: String(end),
    turn_end_timeout_ms: String(base.endTimeoutMs),
  });
  const ws = new WebSocket(`wss://api.cartesia.ai/stt/turns/websocket?${params}`, {
    headers: { 'X-API-Key': process.env.CARTESIA_API_KEY!, 'Cartesia-Version': '2026-03-01' },
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  const res: Result = { ...pick(item), arm: end, endMs: null, eagerMs: null };
  const start = performance.now();
  const at = () => performance.now() - start - item.preMs; // ms after the caller stopped
  // ink rejects bad thresholds with a message and a 1008 close: never score that as "no end".
  let closed: string | null = null;
  ws.on('close', (code, reason) => {
    closed = `${code} ${String(reason)}`;
  });
  ws.on('message', (data) => {
    const m = JSON.parse(data.toString()) as { type: string; message?: string };
    if (m.message && !m.type) closed = m.message;
    const t = at();
    if (t < -50) return; // an end inside the context before the labelled pause
    if (m.type === 'turn.eager_end' && res.eagerMs === null) res.eagerMs = Math.round(t);
    if (m.type === 'turn.end' && res.endMs === null) res.endMs = Math.round(t);
  });
  const chunk = 320;
  for (let i = 0; i < pcm.length && closed === null; i += chunk) {
    const wait = start + (i / 16000) * 1000 - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    ws.send(Buffer.from(pcm.slice(i, i + chunk).buffer));
  }
  await new Promise((r) => setTimeout(r, 150)); // let an end that is in flight arrive
  ws.terminate();
  if (closed !== null) throw new Error(`ink closed the stream: ${closed}`);
  // After a hold's window the caller is speaking again: later ends don't count.
  if (res.endMs !== null && res.endMs > item.postMs + 150) res.endMs = null;
  return res;
}

const pick = (i: Item) => ({ id: i.id, ds: i.ds, kind: i.kind, dur: i.dur });

async function run(): Promise<void> {
  const done = new Set(
    existsSync(outPath)
      ? readFileSync(outPath, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l) as Result)
          .filter((r) => !r.error)
          .map((r) => `${r.id}|${r.arm}`)
      : []
  );
  const jobs = arms.flatMap((end) =>
    items.filter((it) => !done.has(`${it.id}|${end}`)).map((it) => [it, end] as const)
  );
  let next = 0;
  let n = 0;
  await Promise.all(
    Array.from({ length: Number(process.env.CONCURRENCY ?? 12) }, async () => {
      while (next < jobs.length) {
        const [it, end] = jobs[next++];
        const r = await replay(it, end).catch((e: unknown): Result => ({
          ...pick(it),
          arm: end,
          endMs: null,
          eagerMs: null,
          error: String(e),
        }));
        appendFileSync(outPath, JSON.stringify(r) + '\n');
        if (++n % 50 === 0) console.error(`${n}/${jobs.length}`);
      }
    })
  );
}

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : null;
};
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Decision time: ink's end plus LiveKit's endpointing floor; null when ink never ended it. */
const decided = (r: Result) => (r.endMs === null ? null : Math.max(r.endMs, 0) + FLOOR_MS);

export function summarize(results: Result[]) {
  const out: Record<string, unknown> = {};
  const keys = [...new Set(results.map((r) => `${r.ds}|${r.arm}`))].sort();
  for (const key of keys) {
    const rs = results.filter((r) => `${r.ds}|${r.arm}` === key && !r.error);
    const holds = rs.filter((r) => r.kind === 'hold');
    const shifts = rs.filter((r) => r.kind === 'shift');
    const cut = (r: Result) => {
      const d = decided(r);
      return d !== null && d < r.dur;
    };
    const lat = shifts.map((r) => decided(r) ?? MISSING_MS);
    const byPause = [
      [200, 500],
      [500, 1000],
      [1000, 3001],
    ].map(([lo, hi]) => {
      const h = holds.filter((r) => r.dur >= lo && r.dur < hi);
      return {
        pauseMs: `${lo}-${hi === 3001 ? 3000 : hi}`,
        n: h.length,
        cutOff: h.length ? r3(h.filter(cut).length / h.length) : null,
      };
    });
    const fp = holds.filter(cut).length;
    const atBudget = Object.fromEntries(
      BUDGETS.map((b) => {
        const tp = lat.filter((x) => x <= b).length;
        const precision = tp + fp ? tp / (tp + fp) : 0;
        const recall = shifts.length ? tp / shifts.length : 0;
        const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
        return [`${b}ms`, { precision: r3(precision), recall: r3(recall), f1: r3(f1) }];
      })
    );
    out[key] = {
      holds: holds.length,
      shifts: shifts.length,
      cutOffRate: holds.length ? r3(fp / holds.length) : null,
      byPause,
      endLatencyMs: {
        p50: pct(lat, 50),
        p90: pct(lat, 90),
        neverEnded: shifts.filter((r) => r.endMs === null).length,
      },
      atBudget,
    };
  }
  return out;
}

if (process.env.SUMMARY !== '1') {
  if (!process.env.CARTESIA_API_KEY) throw new Error('CARTESIA_API_KEY not set');
  await run();
}
const all = readFileSync(outPath, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Result);
const summary = summarize(all);
writeFileSync(outPath.replace(/\.jsonl$/, '.summary.json'), JSON.stringify(summary, null, 1));
console.log(
  JSON.stringify({ floorMs: FLOOR_MS, errors: all.filter((r) => r.error).length, summary }, null, 1)
);
process.exit(0);
