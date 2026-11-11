import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SUITES, suitesFor } from '../suites.mjs';

const cli = fileURLToPath(new URL('../suites.mjs', import.meta.url));
const baselines = ['model', 'persona'].map((b) =>
  fileURLToPath(new URL(`../../../evals/baselines/${b}.json`, import.meta.url))
);

describe('suitesFor', () => {
  it('runs nothing for a change no suite imports', () => {
    expect(suitesFor(['docs/README.md', 'web/src/app.ts'])).toEqual([]);
    // The PR path filter is wider (it also feeds the offline job); src/agents
    // code outside the crisis fixtures is not in any model suite.
    expect(
      suitesFor(['src/agents/voice-agent.ts', 'src/agents/shared/close-agent-session.ts'])
    ).toEqual([]);
    expect(suitesFor([])).toEqual([]);
  });

  it('runs the crisis suite for safety code, its fixtures and its model config', () => {
    expect(suitesFor(['src/services/safety/crisis-classifier.ts'])).toEqual(['crisis_classifier']);
    expect(suitesFor(['src/agents/__tests__/fixtures/crisis-heldout-retired.ts'])).toEqual([
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

  it('runs the persona suite for the prompt path, the bar and its data', () => {
    for (const f of [
      'src/personas/bundles/ferni/identity/character.md',
      'src/personas/bundles/shared/voice-base-character.md',
      'src/agents/personas/prompt-loader.ts',
      'src/agents/personas/turn-request.ts',
      'src/agents/shared/time-context.ts',
      'scripts/persona-eval/bar.ts',
      'scripts/persona-eval/fixtures/bar-lines.json',
      'evals/persona-flags.json',
      'evals/baselines/persona.json',
    ])
      expect(suitesFor([f])).toEqual(['persona']);
    // The recall note's formatter is in both suites.
    expect(suitesFor(['src/memory/recall/session-recall.ts'])).toEqual([
      'semantic_recall',
      'persona',
    ]);
    // Persona tools the gate does not run, and the multi-turn fixture (not gated yet).
    expect(suitesFor(['scripts/persona-eval/ai-honesty-probe.ts'])).toEqual([]);
    expect(suitesFor(['scripts/persona-eval/fixtures/bar-conversations.json'])).toEqual([]);
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

  it('runs every suite when the installed dependencies can change', () => {
    for (const f of ['pnpm-lock.yaml', 'package.json', 'pnpm-workspace.yaml', '.npmrc'])
      expect(suitesFor([f])).toEqual(SUITES);
  });

  it('matches the dependency files exactly, not their neighbours', () => {
    expect(suitesFor(['docs/x.md'])).toEqual([]);
    for (const f of [
      'apps/web/package.json',
      'package.json.bak',
      'packages/shared-types/package.json',
      'apps/web/.npmrc',
      'docs/pnpm-lock.yaml',
      'pnpm-workspace.yaml.orig',
    ])
      expect(suitesFor([f])).toEqual([]);
  });
});

describe('suites.mjs', () => {
  it('names exactly the suites in the committed model and persona baselines', () => {
    const names = baselines.flatMap((b) =>
      Object.keys(JSON.parse(readFileSync(b, 'utf8')).metrics)
    );
    const prefixes = new Set(names.map((m) => m.split('.')[0]));
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
