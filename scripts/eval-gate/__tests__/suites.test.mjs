import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SUITES, suitesFor } from '../suites.mjs';

const cli = fileURLToPath(new URL('../suites.mjs', import.meta.url));
const baseline = fileURLToPath(new URL('../../../evals/baselines/model.json', import.meta.url));

describe('suitesFor', () => {
  it('runs nothing for a change no suite imports', () => {
    expect(suitesFor(['docs/README.md', 'web/src/app.ts'])).toEqual([]);
    // The PR path filter is wider (it also feeds the offline job); src/agents
    // code outside the crisis fixtures is not in any model suite.
    expect(suitesFor(['src/agents/voice-agent.ts', 'src/personas/ferni.ts'])).toEqual([]);
    expect(suitesFor([])).toEqual([]);
  });

  it('runs the crisis suite for safety code, its fixtures and its model config', () => {
    expect(suitesFor(['src/services/safety/crisis-classifier.ts'])).toEqual(['crisis_classifier']);
    expect(suitesFor(['src/agents/__tests__/fixtures/crisis-heldout.ts'])).toEqual([
      'crisis_classifier',
    ]);
    expect(suitesFor(['src/config/gemini-config.ts'])).toEqual(['crisis_classifier']);
    expect(suitesFor(['src/agents/safety/crisis-guard.ts'])).toEqual(['crisis_classifier']);
  });

  it('runs recall and tool retrieval for their own code', () => {
    expect(suitesFor(['src/memory/vectors/embeddings.ts'])).toEqual(['semantic_recall']);
    expect(suitesFor(['scripts/memory-eval/recall-cases.json'])).toEqual(['semantic_recall']);
    expect(suitesFor(['src/tools/semantic-router/tool-definitions/x.semantic.ts'])).toEqual([
      'tool_retrieval',
    ]);
    expect(suitesFor(['src/tools/retrieval/intent-manual.generated.json'])).toEqual([
      'tool_retrieval',
    ]);
  });

  it('runs every suite for the gate itself, shared config, or an unknown change set', () => {
    for (const f of [
      'scripts/eval-gate/model.ts',
      'evals/baselines/model.json',
      '.github/workflows/eval-gate.yml',
      'src/config/vertex-flag.ts',
      '*',
    ])
      expect(suitesFor(['docs/x.md', f])).toEqual(SUITES);
  });
});

describe('suites.mjs', () => {
  it('names exactly the suites in the committed model baseline', () => {
    const { metrics } = JSON.parse(readFileSync(baseline, 'utf8'));
    const prefixes = new Set(Object.keys(metrics).map((m) => m.split('.')[0]));
    expect([...prefixes].sort()).toEqual([...SUITES].sort());
  });

  it('reads paths on stdin and prints a comma list (empty when none apply)', () => {
    const run = (input) => execFileSync('node', [cli], { input, encoding: 'utf8' }).trim();
    expect(run('src/tools/retrieval/dense-index.ts\nsrc/services/safety/crisis-guard.ts\n')).toBe(
      'crisis_classifier,tool_retrieval'
    );
    expect(run('README.md\n')).toBe('');
  });
});
