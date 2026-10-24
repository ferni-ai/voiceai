/**
 * The setup job's answer to "will `vitest --changed` run the whole unit suite?"
 * decides whether a PR gets 1 unit shard or 4 (ci.yml). It must agree with vitest,
 * so these tests use the triggers vitest resolves from vitest.config.unit.ts and
 * the picomatch vitest matches with, and fall back to 4 shards on any failure.
 */
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { firstTrigger, fullSuiteNeeded, loadTriggers } from '../unit-full-suite-needed.mjs';

const root = join(__dirname, '..', '..', '..');

describe('which changed files make vitest --changed run the whole unit suite', () => {
  it('reads the triggers from vitest.config.unit.ts, not a copy', async () => {
    const triggers = await loadTriggers(root);
    expect(triggers).toEqual(
      expect.arrayContaining([
        '**/package.json', // vitest's default
        '**/pnpm-lock.yaml',
        '**/tsconfig*.json',
        '**/src/**/*.{md,json,yaml,yml,txt,csv}',
      ])
    );
  });

  it.each([
    // #2508's three persona bundles timed out the single shard three times.
    ['src/personas/bundles/ferni/content/behaviors/late-night-presence.json', true],
    ['package.json', true],
    ['apps/web/package.json', true],
    ['pnpm-lock.yaml', true],
    ['tsconfig.json', true],
    ['src/tests/setup.ts', true],
    ['src/personas/bundles/ferni/prompt.md', true],
    // Inside dot directories: vitest matches with { dot: true } (verify of #2715).
    ['src/personas/bundles/.templates/sage/persona.manifest.json', true],
    ['src/personas/bundles/shared/.backups-2026-01-18/voice-guidance.md', true],
    ['src/agents/shared/call-launch-hint.ts', false],
    ['src/agents/shared/__tests__/call-launch-hint.test.ts', false],
    ['docs/decisions/register.md', false],
    ['README.md', false],
    ['.github/workflows/ci.yml', false],
  ])('%s -> %s', async (file, expected) => {
    const triggers = await loadTriggers(root);
    expect(firstTrigger([file], triggers, root) !== undefined).toBe(expected);
  });

  it('one trigger among ordinary files is enough', async () => {
    const triggers = await loadTriggers(root);
    const files = ['src/a.ts', 'src/personas/bundles/alex-chen/content/x.json', 'src/b.ts'];
    expect(firstTrigger(files, triggers, root)).toBe(files[1]);
  });
});

describe('the decision ci.yml reads', () => {
  const triggers = async () => ['**/package.json', '**/src/**/*.json'];

  it('says false only when the diff was listed and nothing in it is a trigger', async () => {
    const ordinary = await fullSuiteNeeded({
      root,
      listFiles: () => ['src/a.ts'],
      readTriggers: triggers,
    });
    expect(ordinary.needed).toBe(false);
    const trigger = await fullSuiteNeeded({
      root,
      listFiles: () => ['src/x.json'],
      readTriggers: triggers,
    });
    expect(trigger).toEqual({ needed: true, reason: 'src/x.json is a forceRerunTriggers file' });
  });

  it('fails safe to the whole suite when it cannot tell', async () => {
    const gitFails = await fullSuiteNeeded({
      root,
      listFiles: () => {
        throw new Error('fatal: bad revision HEAD^1');
      },
      readTriggers: triggers,
    });
    expect(gitFails.needed).toBe(true);
    const configFails = await fullSuiteNeeded({
      root,
      listFiles: () => ['src/a.ts'],
      readTriggers: async () => {
        throw new Error('no forceRerunTriggers resolved');
      },
    });
    expect(configFails.needed).toBe(true);
    const empty = await fullSuiteNeeded({ root, listFiles: () => [], readTriggers: triggers });
    expect(empty.needed).toBe(true);
  });
});
