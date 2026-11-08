/**
 * The design-system rules (design-system/eslint-plugin) through the config `pnpm lint:design`
 * and CI use (eslint.design.config.mjs), and the per-rule ratchet over their results.
 * Until 2026-11-02 lint:design passed flags flat-config ESLint doesn't have, so it exited 2
 * and none of these rules ran anywhere.
 */
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { eslintSilentRules, otherModes } from '../ratchet.js';

const ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));
const RATCHET = join(ROOT, 'apps/cli/src/commands/quality/ratchet.ts');
const TSX = join(ROOT, 'node_modules/.bin/tsx');
const P = '@ferni/design-system/';

const eslint = new ESLint({
  cwd: ROOT,
  overrideConfigFile: join(ROOT, 'eslint.design.config.mjs'),
});
/**
 * Rule ids reported for `code` as if it lived at `path` (relative to the repo root). The
 * ratchet counts errors only, so a warning shows up marked as one, with its message when it
 * has no rule.
 */
async function rulesFor(code: string, path = 'apps/web/src/ui/probe.ui.ts'): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, path) });
  return result!.messages.map((m) =>
    m.ruleId
      ? m.severity === 2
        ? m.ruleId
        : `warning: ${m.ruleId}`
      : `${m.fatal ? 'fatal' : 'warning'}: ${m.message}`
  );
}

describe('lint:design config', () => {
  it.each([
    ['no-hardcoded-colors', "export const s = { backgroundColor: '#4a6741' };"],
    ['no-hardcoded-durations', "export const t = { transition: 'all 0.3s ease' };"],
    ['no-banned-words', "export const copy = { title: 'Talk to our chatbot' };"],
    ['prefer-design-tokens', "export const box = { padding: '16px' };"],
    ['no-console-in-ui', "console.log('opened');"],
    ['no-direct-persona-colors', "export const label = { color: 'var(--persona-primary)' };"],
  ])('%s fires on a planted violation', async (rule, code) => {
    expect(await rulesFor(code)).toEqual([P + rule]);
  });

  it('covers packages/ferni-react, including .tsx', async () => {
    const code = "export const Dot = () => <span style={{ backgroundColor: '#4a6741' }} />;";
    expect(await rulesFor(code, 'packages/ferni-react/src/Dot.tsx')).toEqual([
      P + 'no-hardcoded-colors',
    ]);
  });

  it('reports a color in an object property once, and a numeric key does not crash the run', async () => {
    expect(await rulesFor("export const m = { 413: 'too large', color: '#fff' };")).toEqual([
      P + 'no-hardcoded-colors',
    ]);
  });

  it('reports an animate() duration once', async () => {
    expect(await rulesFor('el.animate([], { duration: 150 });')).toEqual([
      P + 'no-hardcoded-durations',
    ]);
  });

  const ignoredComment = expect.stringMatching(
    /^warning: .* has no effect because .*noInlineConfig/
  );

  it('ignores eslint-disable comments, so none can hide a design violation', async () => {
    const animate = 'el.animate([], { duration: 150 });';
    for (const comment of [
      `// eslint-disable-next-line ${P}no-hardcoded-durations`,
      '/* eslint-disable */',
    ])
      expect(await rulesFor(`${comment}\n${animate}`)).toEqual([
        ignoredComment,
        P + 'no-hardcoded-durations',
      ]);
  });

  it("reads the code's comments for rules it doesn't run as warnings, never errors", async () => {
    const code =
      '// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const x: any = 1;';
    expect(await rulesFor(code)).toEqual([ignoredComment]);
  });
});

describe('design-system ESLint ratchet', () => {
  const dir = mkdtempSync(join(tmpdir(), 'design-eslint-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const { designEslint: baseline, webEslint: webBaseline } = JSON.parse(
    readFileSync(join(ROOT, 'apps/cli/src/commands/quality/ratchet-baseline.json'), 'utf8')
  ) as Record<'designEslint' | 'webEslint', Record<string, number>>;
  /** ESLint JSON results holding `counts` errors per rule. */
  const run = (counts: Record<string, number>, as = 'designEslint') => {
    const messages = Object.entries(counts).flatMap(([ruleId, n]) =>
      Array.from({ length: n }, () => ({ ruleId, severity: 2 }))
    );
    const file = join(dir, `${as}-${Object.values(counts).join('-')}.json`);
    writeFileSync(file, JSON.stringify([{ messages }]));
    return spawnSync(TSX, [RATCHET, '--eslint', file, '--as', as], { cwd: ROOT, encoding: 'utf8' });
  };

  it('has a baseline for every rule', () => {
    expect(Object.keys(baseline).sort()).toEqual(
      [
        'no-banned-words',
        'no-console-in-ui',
        'no-direct-persona-colors',
        'no-hardcoded-colors',
        'no-hardcoded-durations',
        'prefer-design-tokens',
      ].map((r) => P + r)
    );
  });

  it('passes the existing violations and fails a new one, naming the rule', () => {
    expect(run(baseline).status).toBe(0);
    const more = run({
      ...baseline,
      [P + 'no-console-in-ui']: baseline[P + 'no-console-in-ui']! + 1,
    });
    expect(more.status).toBe(1);
    expect(more.stdout).toContain(`"${P}no-console-in-ui" errors rose`);
  });

  it('fails when every rule goes quiet (all turned off or set to warn)', () => {
    const quiet = run({});
    expect(quiet.status).toBe(1);
    for (const rule of Object.keys(baseline))
      expect(quiet.stdout).toContain(`"${rule}" reported nothing`);
  });

  it('fails when one baselined rule goes quiet, naming only that rule', () => {
    const { [P + 'no-hardcoded-colors']: _off, ...rest } = baseline;
    const quiet = run(rest);
    expect(quiet.status).toBe(1);
    expect(quiet.stdout).toContain(`"${P}no-hardcoded-colors" reported nothing`);
    expect(quiet.stdout.match(/reported nothing/g)).toHaveLength(1);
  });

  it('lets a rule really fixed to zero (baseline 0 after --update) report nothing', () => {
    expect(eslintSilentRules({ fixed: 0, open: 2 }, { open: 2 })).toEqual([]);
    expect(eslintSilentRules({ fixed: 0, open: 2 }, {})).toHaveLength(1);
  });

  it('fails a rule with a single baselined error that goes quiet', () => {
    expect(eslintSilentRules({ once: 1 }, {})).toEqual([
      'ESLint "once" reported nothing (baseline 1): turned off, set to warn, or matching no files. If every violation is really fixed, run --update.',
    ]);
  });

  it('holds the web baseline the same way: a quiet rule there fails too', () => {
    expect(run(webBaseline, 'webEslint').status).toBe(0);
    const { 'prefer-const': _off, ...rest } = webBaseline;
    const quiet = run(rest, 'webEslint');
    expect(quiet.status).toBe(1);
    expect(quiet.stdout).toContain('"prefer-const" reported nothing (baseline 1)');
  });

  it('survives the main ratchet rewriting the baseline file (--init / --update)', () => {
    const file = {
      designEslint: { r: 1 },
      webEslint: { w: 2 },
      bundle: { totalKB: 1, initialKB: 1, maxChunkKB: 1 },
    };
    expect(otherModes(file)).toEqual(file);
  });

  it('fails on an unknown baseline name', () => {
    const wrong = run(baseline, 'nope');
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain('--as must be one of webEslint, designEslint');
  });
});

describe('the CI steps', () => {
  const lines = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8').split('\n');
  /** A step's text, the job it is in, and that job's header (everything before `steps:`). */
  function step(name: string) {
    const at = lines.findIndex((l) => l.trim() === `- name: ${name}`);
    const end = lines.findIndex((l, i) => i > at && /^ {6}- |^ {2}[a-z][a-z0-9-]*:$/.test(l));
    const job = lines
      .slice(0, at)
      .filter((l) => /^ {2}[a-z][a-z0-9-]*:$/.test(l))
      .pop()
      ?.trim();
    const header = lines
      .slice(lines.indexOf(`  ${job}`), at)
      .join('\n')
      .split(/^ {4}steps:$/m)[0]!;
    return { at, text: lines.slice(at, end).join('\n'), job, header };
  }
  const design = step('Design-system ESLint (ratchet)');
  const web = step('ESLint (ratchet)');

  it('run in Frontend Quality, each against its own baseline', () => {
    expect(design.at).toBeGreaterThan(0);
    expect(design.job).toBe('frontend-quality:');
    expect(design.text).toContain('pnpm lint:design --format json');
    expect(design.text).toContain('--as designEslint');
    expect(web.at).toBeGreaterThan(0);
    expect(web.job).toBe('frontend-quality:');
    expect(web.text).toContain('pnpm lint --format json --output-file eslint.json');
    expect(web.text).toContain('ratchet.ts --eslint apps/web/eslint.json');
  });

  it.each([
    ['design', design],
    ['web', web],
  ])('%s: lets only ESLint exit 1 (findings) through, and nothing can mark it passed', (_, s) => {
    expect(s.text).toContain('|| [ $? -eq 1 ]');
    expect(s.text).not.toMatch(/\|\|\s*true|continue-on-error|set \+e/);
    expect(s.header).not.toContain('continue-on-error');
  });
});
