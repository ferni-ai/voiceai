/**
 * Teammate evals: a scenario names its teammate (#@persona), run.sh dispatches the
 * agent with that persona_id in the job metadata, and judge.mjs judges the call as
 * them. Before, every voice eval call was with Ferni.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCENARIOS = join(ROOT, 'scripts/voice-eval/scenarios');
const TEAMMATES = ['maya-santos', 'alex-chen', 'peter-john', 'jordan-taylor', 'nayan-patel'];
const hasZsh = existsSync('/bin/zsh');

const teammateScenarios = readdirSync(SCENARIOS).filter((f) => f.startsWith('teammate-'));
const personaOf = (file: string) =>
  readFileSync(join(SCENARIOS, file), 'utf8').match(/^#@persona\s+(\S+)/m)?.[1];

function dryRun(args: string[]) {
  const out = execFileSync('/bin/zsh', [join(ROOT, 'scripts/voice-eval/run.sh'), ...args], {
    env: { ...process.env, EVAL_DRY_RUN: '1', EVAL_PERSONA: '' },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

describe('teammate voice evals', () => {
  it('has one short scenario per core teammate, each naming a real bundle', () => {
    expect(teammateScenarios.map(personaOf).sort()).toEqual([...TEAMMATES].sort());
    for (const f of teammateScenarios) {
      const id = personaOf(f)!;
      expect(existsSync(join(ROOT, 'src/personas/bundles', id, 'persona.manifest.json'))).toBe(
        true
      );
      const lines = readFileSync(join(SCENARIOS, f), 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith('#'));
      expect(lines.length).toBeGreaterThanOrEqual(6);
      expect(lines.length).toBeLessThanOrEqual(8);
    }
  });

  it.skipIf(!hasZsh)("dispatches the agent as the scenario's teammate, or as --persona", () => {
    expect(dryRun(['dev', 'teammate-maya', 't']).metadata.persona_id).toBe('maya-santos');
    expect(
      dryRun(['--persona', 'alex-chen', 'dev', 'teammate-maya', 't']).metadata.persona_id
    ).toBe('alex-chen');
    expect(dryRun(['dev', 'dilemma', 't']).metadata).not.toHaveProperty('persona_id');
  });
});
