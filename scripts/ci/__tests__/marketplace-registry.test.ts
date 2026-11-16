/**
 * The marketplace registry check: the real file passes, and each kind of break the
 * server's reader would turn into a broken card is reported by name.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PATH, registryProblems } from '../marketplace-registry.js';

const SCRIPT = join(__dirname, '..', 'marketplace-registry.ts');

type Registry = ReturnType<typeof validRegistry>;

function validRegistry() {
  return {
    version: '1.0.0',
    name: 'Example Marketplace',
    description: 'Made-up agents for this test',
    repository: 'https://example.com/agents',
    updated_at: '2026-01-01T00:00:00Z',
    categories: [{ id: 'health', name: 'Health', description: 'Sleep and rest' }],
    agents: [
      {
        id: 'test-sleep-guide',
        name: 'Testa',
        display_name: 'Testa, a made-up sleep guide',
        description: 'A fictional agent.',
        short_description: 'Fictional.',
        category: 'health',
        tags: ['sleep'],
        icon: 'moon',
        version: '1.0.0',
        author: 'Ferni',
        license: 'free',
        colors: { primary: '#336699', secondary: '#abc' },
      },
    ],
  };
}

function runScript(registry: unknown) {
  const dir = mkdtempSync(join(tmpdir(), 'registry-'));
  try {
    const file = join(dir, 'registry.json');
    writeFileSync(file, JSON.stringify(registry));
    return spawnSync(process.execPath, ['--experimental-strip-types', SCRIPT, file], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('marketplace registry check', () => {
  it('passes the registry in the repo', () => {
    const file = join(__dirname, '..', '..', '..', DEFAULT_PATH);
    expect(registryProblems(JSON.parse(readFileSync(file, 'utf8')))).toEqual([]);
  });

  it('passes a minimal valid registry', () => {
    expect(registryProblems(validRegistry())).toEqual([]);
  });

  it.each([
    [
      'a missing agent field',
      (r: Registry) => Reflect.deleteProperty(r.agents[0], 'short_description'),
      'short_description: missing',
    ],
    [
      'an empty agent field',
      (r: Registry) => (r.agents[0].author = ' '),
      'author: missing or empty',
    ],
    [
      'an unlisted category',
      (r: Registry) => (r.agents[0].category = 'helth'),
      'category: "helth" is not a listed category',
    ],
    [
      'a licence the UI has no badge for',
      (r: Registry) => (r.agents[0].license = 'paid'),
      'license: must be one of',
    ],
    [
      'a colour that is not hex',
      (r: Registry) => (r.agents[0].colors.primary = 'orange'),
      'colors.primary: "orange" is not a hex colour',
    ],
    [
      'no colours',
      (r: Registry) => Reflect.deleteProperty(r.agents[0], 'colors'),
      'colors: missing',
    ],
    ['empty tags', (r: Registry) => (r.agents[0].tags = []), 'tags: must be a non-empty list'],
    [
      'a version that is not x.y.z',
      (r: Registry) => (r.agents[0].version = 'v1'),
      'version: "v1" is not x.y.z',
    ],
    [
      'an id that is not kebab-case',
      (r: Registry) => (r.agents[0].id = 'Test_Guide'),
      'id: not lower-case kebab-case',
    ],
    [
      'a duplicate agent id',
      (r: Registry) => r.agents.push({ ...r.agents[0] }),
      'id: appears twice',
    ],
    [
      'a duplicate category id',
      (r: Registry) => r.categories.push({ ...r.categories[0] }),
      'categories[1].id: "health" appears twice',
    ],
    [
      'a missing top-level field',
      (r: Registry) => Reflect.deleteProperty(r, 'updated_at'),
      'registry.updated_at: missing',
    ],
    ['no agents', (r: Registry) => (r.agents = []), 'registry.agents: missing or empty'],
  ])('reports %s', (_name, breakIt, expected) => {
    const registry = validRegistry();
    breakIt(registry);
    const problems = registryProblems(registry);
    expect(
      problems.some((p) => p.includes(expected)),
      problems.join('\n')
    ).toBe(true);
  });

  it('reports a registry that is not an object', () => {
    expect(registryProblems([])).toEqual(['registry: not a JSON object']);
  });

  it('exits 0 on a valid file and 1 with an annotation on a broken one', () => {
    const ok = runScript(validRegistry());
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('1 agents, all fields present and valid');

    const broken = validRegistry();
    broken.agents[0].category = 'helth';
    const bad = runScript(broken);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toMatch(/^::error file=.*::agents\[0\] \(test-sleep-guide\)\.category/m);
  });
});
