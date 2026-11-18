import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bundlePersonas, PERSONAS, personaNames, personaParagraph } from '../roster.js';

const BAR = readFileSync(fileURLToPath(new URL('../bar.ts', import.meta.url)), 'utf8');

describe('the persona roster the evals iterate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /** The roster as a fresh import sees it, with Seth's gate (SETH_TEAMMATE) open or closed. */
  async function rosterWithGate(open: boolean): Promise<readonly string[]> {
    vi.stubEnv('SETH_TEAMMATE', open ? 'on' : 'off');
    vi.stubEnv('ROSTER_VOICE_SETH', open ? 'fake-seth-id' : '');
    vi.resetModules();
    return (await import('../roster.js')).PERSONAS;
  }

  it('is exactly the bundle registry, the legends included, Seth only behind his gate', async () => {
    const closed = await rosterWithGate(false);
    expect([...closed].sort()).toEqual(bundlePersonas().filter((id) => id !== 'seth'));
    expect(closed).toHaveLength(8);
    expect(closed).toEqual(expect.arrayContaining(['john-bogle', 'joel-dickson']));
    expect(closed).not.toContain('peter-lynch'); // Tom, retired 2026-11-08
    const open = await rosterWithGate(true);
    expect([...open].sort()).toEqual(bundlePersonas());
    expect(open).toEqual([...closed, 'seth']);
  });

  it("describes every bundle without sound words or another persona's name", () => {
    // The text judge must get no hint of audio, and a blanked name leaves a hole in the choice.
    const names = bundlePersonas().flatMap((id) => personaNames(id));
    for (const id of bundlePersonas()) {
      const paragraph = personaParagraph(id);
      expect(paragraph, id).not.toMatch(/hear/);
      const own = personaNames(id);
      const others = names.filter((n) => !own.includes(n));
      expect(
        others.filter((n) => new RegExp(`\\b${n}\\b`).test(paragraph)),
        id
      ).toEqual([]);
    }
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
