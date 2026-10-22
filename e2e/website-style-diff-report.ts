/**
 * Global setup for e2e/website-style-diff.spec.ts: clears the old fragments,
 * and once every test has run, merges them into style-diff-report/report.json
 * and report.md (also appended to $GITHUB_STEP_SUMMARY when it is set).
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export const WEBSITE = 'apps/website/ferni-website';
export const REPORT_DIR = `${WEBSITE}/style-diff-report`;
export const FRAGMENTS = `${REPORT_DIR}/fragments`;
const MODES = ['light', 'dark', 'night'] as const;

/** Every page built into `dir`, as a URL path. */
export function builtPages(dir: string, prefix = '/'): string[] {
  const pages: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      pages.push(...builtPages(join(dir, entry.name), `${prefix}${entry.name}/`));
    } else if (entry.name.endsWith('.html')) {
      pages.push(entry.name === 'index.html' ? prefix : `${prefix}${entry.name}`);
    }
  }
  return pages.sort();
}

interface Difference {
  element: string;
  label: string;
  property: string;
  base: string;
  pr: string;
}

interface ModeResult {
  elements: number;
  changed: number;
  added: number;
  removed: number;
  differences: number;
  byProperty: Record<string, number>;
  samples: Difference[];
}

interface Fragment {
  page: string;
  inBase: boolean;
  audit: Record<string, number>;
  modes: Partial<Record<(typeof MODES)[number], ModeResult>>;
}

function summarize(): void {
  const fragments: Fragment[] = existsSync(FRAGMENTS)
    ? readdirSync(FRAGMENTS).map((file) => JSON.parse(readFileSync(join(FRAGMENTS, file), 'utf8')))
    : [];
  fragments.sort((a, b) => a.page.localeCompare(b.page));
  const read = new Set(fragments.map((f) => f.page));
  const prPages = builtPages(`${WEBSITE}/_site`);
  const basePages = existsSync(`${WEBSITE}/_site-base`) ? builtPages(`${WEBSITE}/_site-base`) : [];

  const totals = Object.fromEntries(
    MODES.map((mode) => {
      const results = fragments.flatMap((f) => (f.modes[mode] ? [f.modes[mode]] : []));
      const sum = (field: 'changed' | 'added' | 'removed' | 'differences'): number =>
        results.reduce((n, r) => n + r[field], 0);
      return [
        mode,
        {
          pagesCompared: results.length,
          pagesWithDifferences: results.filter((r) => r.differences > 0).length,
          changedElements: sum('changed'),
          addedElements: sum('added'),
          removedElements: sum('removed'),
          differences: sum('differences'),
        },
      ];
    })
  );
  const audit: Record<string, { pages: number; elements: number }> = {};
  for (const fragment of fragments) {
    for (const [sheet, count] of Object.entries(fragment.audit ?? {})) {
      audit[sheet] ??= { pages: 0, elements: 0 };
      audit[sheet].pages++;
      audit[sheet].elements += count;
    }
  }
  const report = {
    totals,
    pages: { built: prPages.length, read: read.size, unread: prPages.filter((p) => !read.has(p)) },
    newPages: fragments.filter((f) => !f.inBase).map((f) => f.page),
    removedPages: basePages.filter((p) => !prPages.includes(p)),
    audit,
    results: fragments,
  };
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, 'report.json'), JSON.stringify(report, null, 1));

  const md = ['## Computed-style diff against the base build', ''];
  md.push(`${read.size} of ${prPages.length} built pages read.`);
  if (report.pages.unread.length)
    md.push(`Not read (the test failed or was filtered out): ${report.pages.unread.join(', ')}`);
  if (report.newPages.length)
    md.push(`New pages (no base to compare): ${report.newPages.join(', ')}`);
  if (report.removedPages.length) md.push(`Removed pages: ${report.removedPages.join(', ')}`);
  md.push(
    '',
    '| Mode | Pages with differences | Changed elements | Added | Removed |',
    '|---|---|---|---|---|'
  );
  for (const mode of MODES) {
    const t = totals[mode];
    md.push(
      `| ${mode} | ${t.pagesWithDifferences} of ${t.pagesCompared} | ${t.changedElements} | ${t.addedElements} | ${t.removedElements} |`
    );
  }
  for (const mode of MODES) {
    const changed = fragments.filter((f) => f.modes[mode]?.differences);
    if (!changed.length) continue;
    md.push('', `<details><summary>${mode}: ${changed.length} pages</summary>`, '');
    md.push('| Page | Changed | Added | Removed | Example |', '|---|---|---|---|---|');
    for (const f of changed.slice(0, 40)) {
      const r = f.modes[mode] as ModeResult;
      const s = r.samples[0];
      const example = s ? `\`${s.label}\` ${s.property}: \`${s.base}\` → \`${s.pr}\`` : '';
      md.push(
        `| ${f.page} | ${r.changed} | ${r.added} | ${r.removed} | ${example.replaceAll('|', '\\|')} |`
      );
    }
    md.push('', '</details>');
  }
  md.push('', '### Dark-mode override audit (PR build)', '');
  md.push(
    'Elements whose computed colours change in dark mode when the sheet is disabled. Delete a sheet when its count is 0.',
    ''
  );
  md.push('| Stylesheet | Pages that load it | Elements that depend on it |', '|---|---|---|');
  for (const [sheet, { pages, elements }] of Object.entries(audit).sort(
    (a, b) => b[1].elements - a[1].elements
  )) {
    md.push(`| ${sheet} | ${pages} | ${elements} |`);
  }
  md.push('', 'Full report: the website-style-diff artifact (report.json).', '');
  writeFileSync(join(REPORT_DIR, 'report.md'), md.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n'));
}

export default function setup(): () => void {
  rmSync(FRAGMENTS, { recursive: true, force: true });
  return summarize;
}
