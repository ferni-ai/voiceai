/**
 * Pass/fail rules and report rendering for the live speech harness
 * (speech-e2e.ts). Pure: takes measured results, returns verdicts and text.
 *
 * @module scripts/audio-eval/speech-e2e-report
 */

import { median, type WerResult } from './speech-e2e-lib.js';
import type { Scenario, TranscriptWord } from './speech-e2e-scenarios.js';

export const RULES = {
  maxWer: 0.15,
  maxTtfsRegressionMs: 250,
  maxInternalSilenceMs: 1200,
  reportSilenceMs: 700,
} as const;

export const RULE_TEXT = [
  'R1 no Cartesia errors: no error event / failed socket / empty audio on any reply (BASELINE or FULL)',
  'R2 no stage directions spoken in FULL: the transcript (sound annotations like "(sighs)" excluded) has no smiles/sighs/laughs/asterisk...',
  `R3 WER <= ${RULES.maxWer} for every scenario in FULL (best of the scenario's acceptable readings)`,
  `R4 FULL median time-to-first-speech <= BASELINE median + ${RULES.maxTtfsRegressionMs} ms`,
  `R5 no internal silence > ${RULES.maxInternalSilenceMs} ms in FULL (silence = 10 ms windows under -45 dBFS between first and last sound)`,
];

export type ConfigName = 'BASELINE' | 'FULL';

export interface ReplyResult {
  scenario: string;
  config: ConfigName;
  repeat: number;
  sessionId: string;
  pushedText: string;
  pushes: string[];
  wireModel?: string;
  wireVoice?: string;
  errors: string[];
  ttfaMs: number | null;
  ttfsMs: number | null;
  wireTtfbMs: number | null;
  durationMs: number;
  stage2LeadMs: number;
  stage2: { renderNonverbal: number; tempoStretchers: number };
  leadingEnergyMs: number | null;
  firstWordMs: number | null;
  silences: { startMs: number; durationMs: number }[];
  longestSilenceMs: number;
  transcript: string;
  sttError?: string;
  wer: WerResult | null;
  stageWords: string[];
  soundAnnotations: string[];
  flags: string[];
  words: TranscriptWord[];
  plan?: Record<string, unknown>;
  warnings: string[];
  wav: string;
}

export interface RuleResult {
  rule: string;
  pass: boolean;
  detail: string;
}

/** Apply R1-R5 to a run. `orphanErrors` are Cartesia errors seen outside any reply. */
export function judge(
  results: readonly ReplyResult[],
  orphanErrors: readonly string[] = []
): { rules: RuleResult[]; pass: boolean } {
  const full = results.filter((r) => r.config === 'FULL');
  const base = results.filter((r) => r.config === 'BASELINE');
  const baseTtfs = median(base.map((r) => r.ttfsMs ?? NaN));
  const fullTtfs = median(full.map((r) => r.ttfsMs ?? NaN));
  const failsOf = (
    rows: readonly ReplyResult[],
    bad: (r: ReplyResult) => string | null
  ): string[] =>
    rows
      .map((r) => {
        const why = bad(r);
        return why ? `${r.scenario}/${r.config}: ${why}` : '';
      })
      .filter(Boolean);

  const r1 = failsOf(results, (r) => (r.errors.length ? r.errors.join('; ') : null));
  if (orphanErrors.length) r1.push(`outside a reply: ${orphanErrors.join('; ')}`);
  const r2 = failsOf(full, (r) =>
    r.stageWords.length ? `spoke "${r.stageWords.join(', ')}"` : null
  );
  const r3 = failsOf(full, (r) =>
    r.wer === null
      ? `no transcript (${r.sttError ?? 'no audio'})`
      : r.wer.wer > RULES.maxWer
        ? `WER ${r.wer.wer.toFixed(3)}`
        : null
  );
  const r5 = failsOf(full, (r) =>
    r.longestSilenceMs > RULES.maxInternalSilenceMs ? `${r.longestSilenceMs} ms silence` : null
  );
  const delta = baseTtfs !== null && fullTtfs !== null ? fullTtfs - baseTtfs : null;
  const rules: RuleResult[] = [
    { rule: 'R1 no Cartesia errors', pass: r1.length === 0, detail: r1.join(' | ') || 'none' },
    {
      rule: 'R2 no stage directions spoken (FULL)',
      pass: r2.length === 0,
      detail: r2.join(' | ') || 'none',
    },
    {
      rule: `R3 WER <= ${RULES.maxWer} (FULL)`,
      pass: r3.length === 0,
      detail: r3.join(' | ') || 'all within',
    },
    {
      rule: `R4 TTFS regression <= ${RULES.maxTtfsRegressionMs} ms`,
      pass: delta !== null && delta <= RULES.maxTtfsRegressionMs,
      detail: `median TTFS BASELINE ${baseTtfs ?? 'n/a'} ms, FULL ${fullTtfs ?? 'n/a'} ms (delta ${
        delta !== null ? Math.round(delta) : 'n/a'
      } ms)`,
    },
    {
      rule: `R5 no silence > ${RULES.maxInternalSilenceMs} ms (FULL)`,
      pass: r5.length === 0,
      detail: r5.join(' | ') || 'none',
    },
  ];
  return { rules, pass: rules.every((r) => r.pass) };
}

const fmt = (v: number | null | undefined, unit = ''): string =>
  v === null || v === undefined ? '-' : `${v}${unit}`;

const HEADER = [
  'scenario',
  'cfg',
  'err',
  'TTFA',
  'TTFS',
  'dur',
  'lead',
  `sil>${RULES.reportSilenceMs}`,
  'WER',
  'stage',
  'flags',
  'P/F',
];

/** One summary row; FULL rows say PASS/FAIL, BASELINE rows ok/FAIL (R1 only). */
export function resultRow(r: ReplyResult): string[] {
  const isFull = r.config === 'FULL';
  const ok =
    r.errors.length === 0 &&
    (!isFull ||
      (r.stageWords.length === 0 &&
        r.wer !== null &&
        r.wer.wer <= RULES.maxWer &&
        r.longestSilenceMs <= RULES.maxInternalSilenceMs));
  return [
    r.scenario,
    isFull ? 'FULL' : 'BASE',
    String(r.errors.length),
    fmt(r.ttfaMs),
    fmt(r.ttfsMs),
    fmt(r.durationMs),
    fmt(r.leadingEnergyMs),
    r.silences.length
      ? `${r.silences.length}@${r.silences.map((x) => `${x.startMs}+${x.durationMs}`).join(',')}`
      : '0',
    r.wer ? r.wer.wer.toFixed(3) : 'n/a',
    r.stageWords.join(',') || '-',
    r.flags.join('; ') || '-',
    isFull ? (ok ? 'PASS' : 'FAIL') : ok ? 'ok' : 'FAIL',
  ];
}

/** The compact console table. */
export function renderTable(results: readonly ReplyResult[]): string {
  const rows = results.map(resultRow);
  const widths = HEADER.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]): string => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [line(HEADER), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

export interface ReportMeta {
  runId: string;
  commit: string;
  branch: string;
  voiceId: string;
  voiceSource: string;
  codeFerniVoiceId: string;
  wireModels: string[];
  levers: Array<{ lever: string; status: string }>;
  fullEnv: Record<string, string>;
  stage2Note: string;
  calls: { tts: number; stt: number };
  thinkMs: number;
  speechDb: number;
}

const mdRow = (cells: string[]): string =>
  `| ${cells.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`;

/** The markdown report: rules, verdict, levers, the table, then per-scenario detail. */
export function renderMarkdown(
  meta: ReportMeta,
  verdict: { rules: RuleResult[]; pass: boolean },
  results: readonly ReplyResult[],
  scenarios: readonly Scenario[]
): string {
  const md: string[] = [
    `# Speech E2E — ${verdict.pass ? 'PASS' : 'FAIL'}`,
    '',
    `Run \`${meta.runId}\` on \`${meta.branch}@${meta.commit}\`. Voice \`${meta.voiceId}\` (${meta.voiceSource}; code's VOICE_IDS.FERNI = \`${meta.codeFerniVoiceId}\`), model on the wire: ${meta.wireModels.map((m) => `\`${m}\``).join(', ')}. ${meta.calls.tts} TTS replies, ${meta.calls.stt} STT calls.`,
    '',
    '## Pass/fail rules',
    '',
    ...RULE_TEXT.map((r) => `- ${r}`),
    '- BASELINE rows are the comparison point: they are held only to R1 (a broken baseline invalidates the comparison). Scenario flags (numbers misread, REALLY spelled, code not spelled, <spell>/markdown not reaching Cartesia as intended, a planned sigh/breath Stage 2 never rendered) are reported, not gated.',
    `- Timing: TTFA/TTFS are measured from the first scripted text push (after ${meta.thinkMs} ms of simulated LLM thinking) to the first output frame / first non-Stage-2-lead frame >= ${meta.speechDb} dBFS, after post-TTS + Stage 2. "lead" = sound before the first transcribed word (minus 150 ms), i.e. an opening breath/sigh.`,
    '',
    '## Verdict',
    '',
    mdRow(['rule', 'result', 'detail']),
    mdRow(['---', '---', '---']),
    ...verdict.rules.map((r) => mdRow([r.rule, r.pass ? 'PASS' : 'FAIL', r.detail])),
    '',
    '## Levers',
    '',
    mdRow(['lever', 'status']),
    mdRow(['---', '---']),
    ...meta.levers.map((l) => mdRow([l.lever, l.status])),
    '',
    `Stage 2: ${meta.stage2Note}.`,
    '',
    `FULL env: \`${Object.entries(meta.fullEnv)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')}\``,
    '',
    '## Results',
    '',
    mdRow(HEADER),
    mdRow(HEADER.map(() => '---')),
    ...results.map((r) => mdRow(resultRow(r))),
    '',
    '## Per scenario',
    '',
  ];
  for (const s of scenarios) {
    md.push(`### ${s.id} — ${s.what}`, '', `LLM reply: \`${s.reply}\``, '');
    for (const r of results.filter((x) => x.scenario === s.id)) {
      const wer = r.wer ? `${r.wer.wer.toFixed(3)} (${r.wer.errors}/${r.wer.refWords})` : 'n/a';
      const sounds = r.soundAnnotations.length ? ` (sounds: ${r.soundAnnotations.join(', ')})` : '';
      md.push(
        `- **${r.config}** (${r.wav}): pushed to Cartesia: \`${r.pushedText.trim()}\``,
        `  - heard: "${r.transcript}"${sounds}`,
        `  - WER ${wer}; TTFS ${fmt(r.ttfsMs, ' ms')}; wire TTFB ${fmt(r.wireTtfbMs, ' ms')}; Stage 2 lead ${r.stage2LeadMs} ms; Stage 2 native calls ${r.stage2.renderNonverbal} nonverbal / ${r.stage2.tempoStretchers} tempo${r.flags.length ? `; flags: ${r.flags.join('; ')}` : ''}${r.errors.length ? `; ERRORS: ${r.errors.join('; ')}` : ''}`
      );
      if (r.plan) md.push(`  - director plan: \`${JSON.stringify(r.plan)}\``);
    }
    md.push('');
  }
  return md.join('\n');
}
