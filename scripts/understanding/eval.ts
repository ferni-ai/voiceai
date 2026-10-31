#!/usr/bin/env npx tsx
/**
 * Turn-reading eval: each backend and today's rules over golden-set rows
 * (voiceai-evidence/golden-set-2026-10-22, schema v0.1).
 *
 *   npx tsx scripts/understanding/eval.ts <split_dev.jsonl> [--backends parallel,single]
 *     [--timeout-ms 1500] [--tz America/New_York] [--teacher-out labels.jsonl] [--out report.json]
 *
 * A row is scored on the fields its two labelling models agreed on (`agreed`),
 * against `consensus`. Per backend: accuracy per field and per-class
 * precision/recall (95% Wilson), latency p50/p95, outcomes. The rules are scored
 * on the fields they share with the reading ("shared.*"). --teacher-out writes
 * each teacher reading by row id (no turn text) for distilling the student.
 * The sealed test split is refused without --sealed. Teacher backends need ADC.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { rulesRead } from '../../src/agents/personas/understanding-rules.js';
import { fieldValue, READING_FIELDS, readTurn } from '../../src/understanding/index.js';
import { sharedFromReading, sharedFromRules } from '../../src/understanding/index.js';
import type { ReadOutcome, SharedFields, TurnInput } from '../../src/understanding/index.js';
import type { TurnReader, TurnReading } from '../../src/understanding/index.js';
import { percentile, scoreField, type FieldScore } from './metrics.js';

type Fields = Record<string, unknown>;
export interface GoldenRow {
  id: string;
  input: TurnInput;
  opener: boolean;
  /** The agreed fields' consensus values, reading fields and shared.* alike. */
  gold: Fields;
}
interface RawRow {
  id: string;
  split?: string;
  call_local_time: string;
  context: Array<{ speaker: string; text: string }>;
  text: string;
  agreed?: Record<string, boolean>;
  consensus?: Partial<TurnReading>;
}

/** Each shared field and the reading field it comes from. */
const SHARED_SOURCE: Record<keyof SharedFields, string> = {
  answered: 'answered_prior_question',
  affect: 'affect_text.label',
  bad_news: 'affect_situation.valence',
  crisis_risk: 'crisis_signal',
  humor: 'humor_cue',
  day_ahead: 'time_expressions',
};
const shared = (s: SharedFields): Fields =>
  Object.fromEntries(Object.entries(s).map(([k, v]) => [`shared.${k}`, v]));
const allFields = (r: TurnReading): Fields => ({
  ...Object.fromEntries(READING_FIELDS.map((f) => [f, fieldValue(r, f)])),
  ...shared(sharedFromReading(r)),
});

function goldOf(row: RawRow): Fields {
  const agreed = row.agreed ?? {};
  const c = row.consensus ?? {};
  // Disagreed parts are null in the consensus: fill them so the projection runs, then keep only agreed.
  const filled = {
    ...c,
    affect_text: c.affect_text ?? {},
    affect_situation: c.affect_situation ?? {},
    action_claim: c.action_claim ?? {},
    time_expressions: c.time_expressions ?? [],
  } as TurnReading;
  const all = allFields(filled);
  const keep = (f: string) =>
    agreed[f.startsWith('shared.') ? SHARED_SOURCE[f.slice(7) as keyof SharedFields] : f] === true;
  return Object.fromEntries(Object.entries(all).filter(([f]) => keep(f)));
}

/** The sealed test file is never opened without --sealed. */
export function guardSealed(path: string, sealed: boolean): void {
  if (!sealed && /sealed/.test(basename(path))) throw new Error(`${basename(path)}: pass --sealed`);
}

/** Golden-set rows; a sealed row is refused unless `sealed`. */
export function loadGolden(text: string, o: { tz: string; sealed?: boolean }): GoldenRow[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const row = JSON.parse(l) as RawRow;
      if (!o.sealed && row.split === 'test_sealed')
        throw new Error(`row ${row.id} is sealed: pass --sealed`);
      const said = (who: string) => row.context.filter((c) => c.speaker === who).map((c) => c.text);
      const firstFerni = row.context.findIndex((c) => c.speaker === 'ferni');
      const input: TurnInput = {
        ferniLast: said('ferni').at(-1) ?? '',
        callerTurn: row.text,
        priorCallerTurns: said('caller').slice(-2),
        callTimestamp: row.call_local_time,
        callerTimezone: o.tz,
      };
      const opener =
        firstFerni >= 0 && !row.context.slice(0, firstFerni).some((c) => c.speaker === 'caller');
      return { id: row.id, input, opener, gold: goldOf(row) };
    });
}

export interface BackendReport {
  outcomes: Partial<Record<ReadOutcome, number>>;
  latency_ms: { p50: number | null; p95: number | null };
  fields: Record<string, FieldScore>;
}
type Prediction = { fields: Fields; latencyMs: number; outcome: ReadOutcome };

function report(rows: GoldenRow[], preds: Prediction[], only?: RegExp): BackendReport {
  const names = [...new Set(rows.flatMap((r) => Object.keys(r.gold)))].filter(
    (f) => !only || only.test(f)
  );
  const fields: Record<string, FieldScore> = {};
  for (const f of names.sort()) {
    const scored = rows.flatMap((r, i) =>
      f in r.gold ? [[r.gold[f], preds[i].fields[f]] as [unknown, unknown]] : []
    );
    fields[f] = scoreField(scored);
  }
  const outcomes: BackendReport['outcomes'] = {};
  for (const p of preds) outcomes[p.outcome] = (outcomes[p.outcome] ?? 0) + 1;
  const ms = preds.map((p) => p.latencyMs);
  return { outcomes, latency_ms: { p50: percentile(ms, 50), p95: percentile(ms, 95) }, fields };
}

type OnReading = (row: GoldenRow, id: string, r: TurnReading | null, o: ReadOutcome) => void;

/** One teacher label for distillation: row id and reading, no turn or context text. */
export const teacherLine: (...a: Parameters<OnReading>) => string = (
  row,
  teacher,
  reading,
  outcome
) => JSON.stringify({ id: row.id, teacher, outcome, reading });

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
      preds.push({ fields: result ? allFields(result.reading) : {}, latencyMs, outcome });
    }
    out[reader.id] = report(rows, preds);
  }
  const rulePreds = rows.map((row): Prediction => {
    const t0 = performance.now();
    const fields = shared(sharedFromRules(rulesRead(row.input, { opener: row.opener })));
    return { fields, latencyMs: Math.round((performance.now() - t0) * 100) / 100, outcome: 'ok' };
  });
  out.rules = report(rows, rulePreds, /^shared\./);
  return out;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      backends: { type: 'string', default: 'parallel,single' },
      'timeout-ms': { type: 'string', default: '1500' },
      tz: { type: 'string', default: 'America/New_York' },
      sealed: { type: 'boolean', default: false },
      'teacher-out': { type: 'string' },
      out: { type: 'string' },
    },
  });
  const [path] = positionals;
  if (positionals.length !== 1) throw new Error('usage: eval.ts <golden.jsonl> [options]');
  guardSealed(path, values.sealed === true);
  const rows = loadGolden(readFileSync(path, 'utf8'), {
    tz: values.tz ?? '',
    sealed: values.sealed,
  });
  const { turnReadingTeacher } = await import('../../src/agents/personas/turn-reading-teacher.js');
  const modes = (values.backends ?? '').split(',').filter(Boolean);
  const readers = modes.map((mode) => turnReadingTeacher({ TURN_UNDERSTANDING_CALLS: mode }));
  const labels: string[] = [];
  const timeoutMs = Number(values['timeout-ms']);
  const result = await evaluate(rows, readers, timeoutMs, (...a) => labels.push(teacherLine(...a)));
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
