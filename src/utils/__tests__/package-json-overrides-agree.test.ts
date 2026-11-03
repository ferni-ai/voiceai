/**
 * Every package.json in the workspace declares the version its pnpm override ships.
 *
 * A plain `name: version` override replaces the declared range everywhere, and the
 * lockfile records the override. So a package.json that says 1.9.5 under an override
 * of 1.9.3 installs 1.9.3, and `pnpm install --frozen-lockfile` still passes. #3427
 * bumped three livekit pins that way; package.json misstated what ships until #3430,
 * and no check could go red on it. This one can.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..');
const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

interface Mismatch {
  file: string;
  dep: string;
  declared: string;
  override: string;
}

/**
 * Mismatches that predate this test, each with the exact range and override. A
 * change to either side fails a test below, so this list can only shrink.
 */
// The Firestore override exists to pull firebase-admin's own copy up to 8.0.0 (it
// brought 7.x, and two copies clash with TS6200). Each ^8.0.0 below admits 8.0.0.
const KNOWN: ReadonlyArray<Mismatch & { reason: string }> = [
  {
    file: 'package.json',
    dep: '@google-cloud/firestore',
    declared: '^8.0.0',
    override: '8.0.0',
    reason: 'the caret range admits the exact pin that dedupes firebase-admin',
  },
  {
    file: 'apps/async/package.json',
    dep: '@google-cloud/firestore',
    declared: '^8.0.0',
    override: '8.0.0',
    reason: 'same root override; the caret range admits it',
  },
  {
    file: 'apps/intelligence-worker/package.json',
    dep: '@google-cloud/firestore',
    declared: '^8.0.0',
    override: '8.0.0',
    reason: 'same root override; the caret range admits it',
  },
];

const workspaceYaml = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8').split('\n');

/** The lines of a top-level YAML block (`packages:`, `overrides:`), comments dropped. */
function block(key: string): string[] {
  const start = workspaceYaml.indexOf(`${key}:`);
  const end = workspaceYaml.findIndex((line, i) => i > start && /^\S/.test(line));
  return workspaceYaml
    .slice(start + 1, end === -1 ? undefined : end)
    .filter((line) => line.trim() !== '' && !line.trim().startsWith('#'));
}

const unquote = (s: string): string => s.trim().replace(/^(['"])(.*)\1$/, '$2');

const packageFiles = block('packages').map((line) => {
  const dir = unquote(line.replace(/^\s*-\s*/, ''));
  return dir === '.' ? 'package.json' : `${dir}/package.json`;
});

const readJson = (file: string): Record<string, Record<string, string> | undefined> =>
  JSON.parse(readFileSync(join(ROOT, file), 'utf8'));

const rootPnpm = readJson('package.json').pnpm as
  { overrides?: Record<string, string> } | undefined;
const overrides: Record<string, string> = {
  // pnpm 11 reads only pnpm-workspace.yaml, but an override left here still applies on 10.
  ...rootPnpm?.overrides,
  ...Object.fromEntries(
    block('overrides').map((line) => {
      const [, key = '', value = ''] =
        /^\s*('[^']+'|"[^"]+"|[^:]+):\s*(.*?)\s*(?:#.*)?$/.exec(line) ?? [];
      return [unquote(key), unquote(value)];
    })
  ),
};

/** True for an override that pins every copy of one package to one version. */
function pinsEveryCopy(key: string, value: string): boolean {
  // `parent>child` pins the child only under that parent, and `name@<range` only the
  // copies whose range matches: neither says what a direct dependency installs.
  if (key.includes('>') || /^(@[^/]+\/)?[^@/]+@/.test(key)) return false;
  // link: and npm: install something else, and `-` removes the package: no version.
  return !/^(link:|npm:)/.test(value) && value !== '-';
}

const pinned = Object.entries(overrides).filter(([key, value]) => pinsEveryCopy(key, value));

const declarations = packageFiles.flatMap((file) => {
  const json = readJson(file);
  return SECTIONS.flatMap((section) =>
    pinned
      .filter(([dep]) => json[section]?.[dep] !== undefined)
      .map(([dep, override]) => ({
        file,
        section,
        dep,
        declared: json[section]?.[dep] as string,
        override,
      }))
  );
});
const mismatches = declarations.filter((d) => d.declared !== d.override);

const sameAs = (a: Mismatch) => (b: Mismatch) =>
  a.file === b.file && a.dep === b.dep && a.declared === b.declared && a.override === b.override;

describe('package.json agrees with the pnpm overrides', () => {
  it('reads the real workspace and overrides', () => {
    expect(packageFiles).toContain('apps/web/package.json');
    expect(overrides['@livekit/agents-plugin-openai']).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pinned.length).toBeGreaterThan(0);
    expect(declarations.map((d) => d.dep)).toContain('@livekit/agents-plugin-openai');
  });

  it('declares exactly the version each plain-name override installs', () => {
    const unexpected = mismatches
      .filter((m) => !KNOWN.some(sameAs(m)))
      .map(
        (m) =>
          `${m.file} ${m.section} "${m.dep}": declares ${m.declared}, but pnpm-workspace.yaml ` +
          `overrides it to ${m.override}, which is what installs. Make them agree.`
      );
    expect(unexpected).toEqual([]);
  });

  it('lists only mismatches that still exist (KNOWN can only shrink)', () => {
    const stale = KNOWN.filter((k) => !mismatches.some(sameAs(k))).map(
      (k) =>
        `${k.file} "${k.dep}" ${k.declared} vs ${k.override} no longer differs: drop it from KNOWN`
    );
    expect(stale).toEqual([]);
  });
});
