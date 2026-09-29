/**
 * Locale placeholder guard
 *
 * t() interpolates `{name}` placeholders only. Strings extracted from template
 * literals with `${expr}` left in them render verbatim to users
 * (e.g. "Imported ${count} contacts!").
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES_DIR = join(__dirname, '../../../src/i18n/locales');

function collectStrings(node: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof node === 'string') {
    out.push([path, node]);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      collectStrings(value, path ? `${path}.${key}` : key, out);
    }
  }
}

describe('locale placeholders', () => {
  const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));

  it.each(files)('%s has no JS template-literal placeholders', (file) => {
    const strings: Array<[string, string]> = [];
    collectStrings(JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8')), '', strings);

    const offenders = strings.filter(([, value]) => value.includes('${')).map(([key]) => key);
    expect(offenders).toEqual([]);
  });
});
