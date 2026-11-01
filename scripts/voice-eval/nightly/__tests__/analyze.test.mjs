// analyze.py's tool_reply_gaps (superhuman-bar.json tool-turn-p50), from synthetic Cloud Logging
// lines: the answer's first audio on a tool turn, not a "let me look" lead-in.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ANALYZE = join(dirname(fileURLToPath(import.meta.url)), '..', 'analyze.py');

/** One call's agent log: a session line, then TURN_RECEIPTs (and `more` lines) on one host and pid. */
function analyze(receipts, more = [], run = {}) {
  const t = mkdtempSync(join(tmpdir(), 'analyze-'));
  const runs = join(t, 'runs');
  mkdirSync(runs);
  const line = (o) => ({
    textPayload: `x ${JSON.stringify({ hostname: 'h', pid: 1, ...o })}`,
    labels: { worker_id: 'w1' },
  });
  const logs = [
    line({ time: 1000, sessionId: 'AJ_t1', roomName: 'eval-r1', msg: 'session-AJ_t1-start' }),
    ...receipts.map((r, i) =>
      line({ time: 2000 + i, msg: 'TURN_RECEIPT', personaId: 'ferni', turn: i + 1, ...r })
    ),
    ...more.map(line),
  ];
  writeFileSync(join(t, 'logs.json'), JSON.stringify(logs));
  writeFileSync(join(t, 'boot.json'), '[]');
  writeFileSync(
    join(runs, 'lookups-s1.json'),
    JSON.stringify({ meta: { scenario: 'lookups', room: 'eval-r1' }, ...run })
  );
  const r = spawnSync(
    'python3',
    ['-I', ANALYZE, join(t, 'logs.json'), join(t, 'boot.json'), runs, join(t, 'summary.json')],
    { encoding: 'utf8' }
  );
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(readFileSync(join(t, 'summary.json'), 'utf8'))[0];
}

describe('analyze.py tool_reply_gaps', () => {
  it('reads the answer audio on a tool turn, not the lead-in', () => {
    const row = analyze([
      // #2850 receipt: "let me look" at 700 ms, the answer at 1900 ms.
      {
        tools: { called: ['weather'] },
        timing: { firstAudioMs: 700 },
        audio: { answerAudioMs: 1900 },
      },
      // A handoff: no request after the tool, so no answer time; left out, not read as 700.
      {
        tools: { called: ['handoffToMaya'] },
        timing: { firstAudioMs: 650 },
        audio: { answerAudioMs: null },
      },
      // No tool called: not a tool turn.
      { tools: { called: [] }, timing: { firstAudioMs: 400 }, audio: { answerAudioMs: null } },
      // A receipt from before #2850 (no audio.answerAudioMs): its first audio.
      { tools: { called: ['lookup'] }, timing: { firstAudioMs: 1300 } },
    ]);
    expect(row.receipts).toBe(4);
    expect(row.tool_reply_gaps).toEqual([1900, 1300]);
  });
});

describe('analyze.py tool_outputs (tool-grounding.mjs)', () => {
  const executed = (time, outputs) => ({
    time,
    msg: 'FUNCTION TOOLS EXECUTED',
    event: { type: 'function_tools_executed', functionCallOutputs: outputs },
  });

  it('keeps each tool output with its time on the run clock', () => {
    const row = analyze(
      [{ tools: { called: ['getWeather'] } }],
      [executed(2500, [{ name: 'getWeather', output: '"39°F"', isError: false }])],
      { wallT0: 1000 }
    );
    expect(row.tool_outputs).toEqual([
      { name: 'getWeather', isError: false, output: '"39°F"', atMs: 1500 },
    ]);
  });

  it('has no time without the run clock, and an empty list on a call with no tools', () => {
    const row = analyze([], [executed(2500, [{ name: 'searchWeb', output: '""', isError: true }])]);
    expect(row.tool_outputs).toEqual([
      { name: 'searchWeb', isError: true, output: '""', atMs: null },
    ]);
    expect(analyze([{ tools: { called: [] } }]).tool_outputs).toEqual([]);
  });
});
