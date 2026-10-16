/**
 * Each Financial Legend has one name: the pseudonym in its manifest. The display
 * name and the team note must say the same thing.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DISPLAY_NAMES, FINANCIAL_LEGENDS } from '../persona-ids.js';

const manifestName = (id: string): string => {
  const manifest = JSON.parse(
    readFileSync(new URL(`../bundles/${id}/persona.manifest.json`, import.meta.url), 'utf8')
  ) as { identity: { name: string } };
  return manifest.identity.name;
};

describe('financial legends carry one name', () => {
  it.each(FINANCIAL_LEGENDS)('%s is displayed under its manifest name', (id) => {
    expect(DISPLAY_NAMES[id]).toBe(manifestName(id));
  });
});
