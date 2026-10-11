/**
 * t() called while a module is being imported runs before app.ts awaits
 * initI18n(), so it returns the raw key ("featureHints.journeyTitle") or the
 * English fallback, and a constant built from it keeps that forever. That is
 * how the feature hints, activity labels and growth-journey seasons shipped
 * raw keys. Build translated copy in a function, called at render time.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');
const TRANSLATORS = new Set(['t', 'tp']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

/** Code that runs later than import: function bodies and instance fields. */
function defersEvaluation(node: ts.Node): boolean {
  if (ts.isFunctionLike(node)) return true;
  if (ts.isPropertyDeclaration(node)) {
    return !(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Static);
  }
  return false;
}

/** Every t()/tp() call that runs while its module is imported. */
function findImportTimeTranslations(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const visit = (node: ts.Node, deferred: boolean): void => {
    if (
      !deferred &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      TRANSLATORS.has(node.expression.text)
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      hits.push(`${relative(SRC, file)}:${line + 1} ${node.getText().slice(0, 60)}`);
    }
    ts.forEachChild(node, (child) => visit(child, deferred || defersEvaluation(node)));
  };
  visit(source, false);
  return hits;
}

describe('no t() at import time', () => {
  it('the scanner flags module-scope calls and ignores deferred ones', () => {
    const sample = [
      "const LABELS = { a: t('x.a') };",
      'class C { static S = t(\'x.s\'); f = t(\'x.f\'); }',
      "const labels = () => ({ a: t('x.a') });",
      "function render() { return t('x.r'); }",
    ].join('\n');
    expect(findImportTimeTranslations(join(SRC, 'sample.ts'), sample)).toEqual([
      "sample.ts:1 t('x.a')",
      "sample.ts:2 t('x.s')",
    ]);
  });

  it('no module in src calls t() or tp() at import time', () => {
    const hits = sourceFiles(SRC).flatMap((file) =>
      findImportTimeTranslations(file, readFileSync(file, 'utf8'))
    );
    expect(hits).toEqual([]);
  });
});

describe('modules imported before initI18n render translated copy', () => {
  it('feature hints and the growth-journey season resolve to text, not keys', async () => {
    // Imported first, exactly as app.ts's static imports are.
    const { getFeatureHints } = await import('../src/ui/feature-hints.ui.js');
    const journey = await import('../src/services/growth-journey.service.js');
    const { setLocale } = await import('../src/i18n/index.js');
    await setLocale('en-US', { reload: false });

    const hints = getFeatureHints();
    expect(hints.length).toBeGreaterThan(0);
    for (const hint of hints) {
      expect(hint.title).not.toMatch(/^featureHints\./);
      expect(hint.message).not.toMatch(/^featureHints\./);
    }

    const season = journey.getCurrentSeason();
    expect(season.name).not.toMatch(/^growthJourney\./);
    for (const milestone of season.milestones) {
      expect(milestone.title).not.toMatch(/^growthJourney\./);
    }
  });
});
