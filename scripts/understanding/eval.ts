#!/usr/bin/env npx tsx
/**
 * Turn-reading eval: each backend and today's rules over a JSONL golden set.
 *
 *   npx tsx scripts/understanding/eval.ts <golden.jsonl> [--backends single,parallel]
 *     [--timeout-ms 1500] [--teacher-out labels.jsonl] [--out report.json]
 *
 * A row: {"id", "input": TurnInput, "label"?: TurnReading v0.1, "opener"?: bool};
 * unlabelled rows are only teacher-labelled. Per backend: accuracy per field and
 * per-class precision/recall (95% Wilson), latency p50/p95, outcomes. The rules
 * are scored on the fields they share with the reading ("shared.*").
 * --teacher-out writes every teacher reading as JSONL: distillation data for the
 * student. The teacher backends need Vertex credentials (ADC).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { rulesRead } from '../../src/agents/personas/understanding-rules.js';
import {
  fieldValue,
  parseTurnReading,
  READING_FIELDS,
  readTurn,
} from '../../src/understanding/index.js';
import { sharedFromReading, sharedFromRules } from '../../src/understanding/index.js';
import type { ReadOutcome, SharedFields, TurnInput } from '../../src/understanding/index.js';
import type { TurnReader, TurnReading } from '../../src/understanding/index.js';
import { percentile, scoreField, type FieldScore } from './metrics.js';

export interface GoldenRow {
  id: string;
  input: TurnInput;
  label: TurnReading | null;
  opener: boolean;
}

export function loadGolden(text: string): GoldenRow[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l, i) => {
      const row = JSON.parse(l) as Omit<GoldenRow, 'label'> & { label?: unknown };
      const label = row.label === undefined ? null : parseTurnReading(row.label);
      if (row.label !== undefined && !label) throw new Error(`row ${i + 1}: not schema v0.1`);
      return { id: row.id ?? String(i + 1), input: row.input, label, opener: row.opener === true };
    });
}

export interface BackendReport {
  scored: number;
  outcomes: Partial<Record<ReadOutcome, number>>;
  latency_ms: { p50: number | null; p95: number | null };
  fields: Record<string, FieldScore>;
}
type Fields = Record<string, unknown>;
type Prediction = { fields: Fields; latencyMs: number; outcome: ReadOutcome };

const shared = (s: SharedFields): Fields =>
  Object.fromEntries(Object.entries(s).map(([k, v]) => [`shared.${k}`, v]));
const sharedGold = (r: TurnReading): Fields => shared(sharedFromReading(r));
const allGold = (r: TurnReading): Fields => ({
  ...Object.fromEntries(READING_FIELDS.map((f) => [f, fieldValue(r, f)])),
  ...sharedGold(r),
});

function report(
  rows: GoldenRow[],
  preds: Prediction[],
  gold: (r: TurnReading) => Fields
): BackendReport {
  const scored = rows.flatMap((r, i) =>
    r.label ? [[gold(r.label), preds[i].fields] as const] : []
  );
  const fields: Record<string, FieldScore> = {};
  for (const f of Object.keys(scored[0]?.[0] ?? {}))
    fields[f] = scoreField(scored.map(([g, p]) => [g[f], p[f]]));
  const outcomes: BackendReport['outcomes'] = {};
  for (const p of preds) outcomes[p.outcome] = (outcomes[p.outcome] ?? 0) + 1;
  const ms = preds.map((p) => p.latencyMs);
  return {
    scored: scored.length,
    outcomes,
    latency_ms: { p50: percentile(ms, 50), p95: percentile(ms, 95) },
    fields,
  };
}

type OnReading = (row: GoldenRow, id: string, r: TurnReading | null, o: ReadOutcome) => void;

/** Score each reader and the rules; `onReading` gets every teacher reading (--teacher-out). */
export async function evaluate(
  rows: GoldenRow[],
  readers: TurnReader[],
  timeoutMs: number,
  onReading: OnReading = () => undefined
): Promise<Record<string, BackendReport>> {
  const out: Record<string, BackendReport> = {};
  for (const reader of readers) {
    const preds: Prediction[] = [];
    for (const row of rows) {
      const { result, outcome, latencyMs } = await readTurn(reader, row.input, timeoutMs);
      onReading(row, reader.id, result?.reading ?? null, outcome);
      preds.push({ fields: result ? allGold(result.reading) : {}, latencyMs, outcome });
    }
    out[reader.id] = report(rows, preds, allGold);
  }
  const rulePreds = rows.map((row): Prediction => {
    const t0 = performance.now();
    const fields = shared(sharedFromRules(rulesRead(row.input, { opener: row.opener })));
    return { fields, latencyMs: Math.round((performance.now() - t0) * 100) / 100, outcome: 'ok' };
  });
  out.rules = report(rows, rulePreds, sharedGold);
  return out;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      backends: { type: 'string', default: 'single,parallel' },
      'timeout-ms': { type: 'string', default: '1500' },
      'teacher-out': { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (positionals.length !== 1) throw new Error('usage: eval.ts <golden.jsonl> [options]');
  const rows = loadGolden(readFileSync(positionals[0], 'utf8'));
  const { teacherOnUnderstanderClient: teacher } =
    await import('../../src/agents/personas/turn-reading-shadow.js');
  const modes = (values.backends ?? '').split(',').filter(Boolean);
  const readers = modes.map((mode) => teacher({ TURN_UNDERSTANDING_CALLS: mode }));
  const labels: string[] = [];
  const result = await evaluate(
    rows,
    readers,
    Number(values['timeout-ms']),
    (row, teacher, reading, outcome) =>
      labels.push(JSON.stringify({ id: row.id, input: row.input, teacher, outcome, reading }))
  );
  if (values['teacher-out']) writeFileSync(values['teacher-out'], `${labels.join('\n')}\n`);
  if (values.out) writeFileSync(values.out, JSON.stringify(result, null, 2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1]?.endsWith('eval.ts')) {
  // Exit when done: the rules' modules keep timers that would hold the process open.
  main().then(
    () => process.exit(0),
    (error: unknown) => {
      process.stderr.write(`${String(error)}\n`);
      process.exit(1);
    }
  );
}
