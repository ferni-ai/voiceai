/**
 * Class guard for the honest-promises sweep (#3121): no music reply may send
 * a caller somewhere that doesn't exist. Per-user Spotify will not be built
 * (Developer Policy III.3), and apps/web has no "Spotify Rooms" page, yet
 * three review rounds each found another sibling string ("connect Spotify?",
 * "Settings > Spotify Rooms", "Set up rooms in Settings first."). So this
 * reads every string literal and template in the entertainment tools and in
 * quickMusic, and fails on any of those phrasings. Comments are not read.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..', '..', '..');
const ENTERTAINMENT = join(ROOT, 'src/tools/domains/entertainment');
const SHORTCUTS = join(ROOT, 'src/tools/domains/simple-utilities/shortcuts-tools.ts');

/** A pointer to a Settings page, an offer to connect or link Spotify, or asking whether it is. */
const DEAD_POINTER =
  /in settings|connect (your )?spotify|link (your )?spotify|spotify rooms|is (your )?spotify connected/i;

/**
 * Strings allowed to match, each justified in the #3121 PR body: Sonos has a
 * real Settings card with an OAuth flow (apps/web smart-home-settings.ui.ts,
 * /api/smart-home/sonos/callback).
 */
const ALLOWED = new Set([
  "Sonos isn't connected. Set it up in settings to play favorites!",
  "Sonos isn't connected. Set it up in settings first!",
]);

type Found = { file: string; line: number; text: string };

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

/** Template text with each substitution shown as ${…}, so a phrase split by one still reads. */
function templateText(node: ts.TemplateExpression): string {
  return node.head.text + node.templateSpans.map((s) => '${…}' + s.literal.text).join('');
}

function stringsIn(file: string, within?: (node: ts.Node) => boolean): Found[] {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const found: Found[] = [];
  const visit = (node: ts.Node, inScope: boolean): void => {
    const scoped = inScope || (within?.(node) ?? true);
    if (scoped) {
      let text: string | undefined;
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text;
      else if (ts.isTemplateExpression(node)) text = templateText(node);
      if (text !== undefined) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        found.push({ file: relative(ROOT, file), line, text });
      }
    }
    ts.forEachChild(node, (child) => visit(child, scoped));
  };
  visit(source, false);
  return found;
}

const isQuickMusic = (node: ts.Node): boolean =>
  ts.isVariableDeclaration(node) &&
  ts.isIdentifier(node.name) &&
  node.name.text === 'quickMusicDef';

function allMusicStrings(): Found[] {
  return [
    ...sourceFiles(ENTERTAINMENT).flatMap((file) => stringsIn(file)),
    ...stringsIn(SHORTCUTS, isQuickMusic),
  ];
}

describe('music replies never point at a Settings page or a Spotify link', () => {
  it('no string in the entertainment tools or quickMusic matches, except the justified ones', () => {
    const offenders = allMusicStrings()
      .filter(({ text }) => DEAD_POINTER.test(text) && !ALLOWED.has(text))
      .map(({ file, line, text }) => `${file}:${line} ${text}`);

    expect(offenders).toEqual([]);
  });

  it('the scan reaches templates, quickMusic and every allow-listed string', () => {
    const strings = allMusicStrings();
    const texts = strings.map((s) => s.text);

    // Each allow-listed string is still in the code, so the list can't go stale.
    for (const allowed of ALLOWED) expect(texts).toContain(allowed);
    expect(texts).toContain("Music isn't available right now, so I can't play anything.");
    expect(texts.some((t) => t.includes('${…}'))).toBe(true);
    expect(strings.length).toBeGreaterThan(500);
  });
});
