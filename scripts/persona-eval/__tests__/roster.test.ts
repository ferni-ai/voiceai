import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { bundlePersonas, PERSONAS, personaNames, personaParagraph } from '../roster.js';

const BAR = readFileSync(fileURLToPath(new URL('../bar.ts', import.meta.url)), 'utf8');

describe('the persona roster the evals iterate', () => {
  it('is exactly the bundle registry, the legends included', () => {
    expect([...PERSONAS].sort()).toEqual(bundlePersonas());
    expect(PERSONAS).toHaveLength(8);
    expect(PERSONAS).toEqual(expect.arrayContaining(['john-bogle', 'joel-dickson']));
    expect(PERSONAS).not.toContain('peter-lynch'); // Tom, retired 2026-11-08
  });

  it('is what bar.ts scores, with a description for every persona', () => {
    expect(BAR).toMatch(/import \{ PERSONAS, personaNames \} from '\.\/roster\.js'/);
    expect(BAR).not.toMatch(/const PERSONAS\b/);
    const descriptions = BAR.slice(
      BAR.indexOf('const DESCRIPTIONS'),
      BAR.indexOf('};', BAR.indexOf('const DESCRIPTIONS'))
    );
    for (const p of PERSONAS) expect(descriptions).toMatch(new RegExp(`(^|\\s)'?${p}'?:`, 'm'));
  });

  it("reads each persona's name from its own bundle", () => {
    expect(personaNames('john-bogle')).toEqual(['Henry', 'Caldwell']);
    expect(personaNames('joel-dickson')[0]).toBe('Nate');
  });

  it('reads the bundles of the repo it is given, skipping dirs with no manifest', () => {
    const repo = mkdtempSync(join(tmpdir(), 'roster-'));
    const bundle = (id: string, name?: string): void => {
      const dir = join(repo, 'src/personas/bundles', id);
      mkdirSync(dir, { recursive: true });
      if (name)
        writeFileSync(join(dir, 'persona.manifest.json'), JSON.stringify({ identity: { name } }));
    };
    bundle('zed', 'Zed Fictional');
    bundle('amy', 'Amy');
    bundle('shared');
    try {
      expect(bundlePersonas(repo)).toEqual(['amy', 'zed']);
      expect(personaNames('zed', repo)).toEqual(['Zed', 'Fictional']);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('describes each persona by one paragraph of its own character.md', () => {
    for (const p of PERSONAS) {
      const text = personaParagraph(p);
      expect(text.length).toBeGreaterThan(80);
      expect(text).not.toMatch(/\n|^#/);
    }
    const repo = mkdtempSync(join(tmpdir(), 'roster-'));
    const md = (body: string): void => {
      const dir = join(repo, 'src/personas/bundles/zed/identity');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'character.md'), body);
    };
    try {
      md(
        '# Zed\n\n## How you are with people\n\nWarm and\n  quick.\n\nSecond paragraph.\n\n## Next\n'
      );
      expect(personaParagraph('zed', repo)).toBe('Warm and quick.');
      md('# Zed\n\n## Something else\n\nText.\n');
      expect(() => personaParagraph('zed', repo)).toThrow(/no "How you are with people"/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
