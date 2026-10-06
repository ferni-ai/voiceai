import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAPABILITIES, CAPABILITY_GROUPS } from '../src/services/capability-registry';

const SRC = join(__dirname, '..', 'src');
const EN_US = JSON.parse(readFileSync(join(SRC, 'i18n', 'locales', 'en-US.json'), 'utf8'));

function hasKey(key: string): boolean {
  let node: unknown = EN_US;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string';
}

describe('capability-registry i18n keys', () => {
  it('every capability has required nameKey and descriptionKey', () => {
    const missing = CAPABILITIES.filter(c => !c.nameKey || !c.descriptionKey);
    expect(missing).toEqual([]);
  });

  it('every capability group has required nameKey and descriptionKey', () => {
    const missing = CAPABILITY_GROUPS.filter(g => !g.nameKey || !g.descriptionKey);
    expect(missing).toEqual([]);
  });

  it('all capability nameKey values exist in en-US', () => {
    const missing = CAPABILITIES.filter(c => !hasKey(c.nameKey));
    expect(missing.map(c => `${c.id}: ${c.nameKey}`)).toEqual([]);
  });

  it('all capability descriptionKey values exist in en-US', () => {
    const missing = CAPABILITIES.filter(c => !hasKey(c.descriptionKey));
    expect(missing.map(c => `${c.id}: ${c.descriptionKey}`)).toEqual([]);
  });

  it('all capability detailsKey values exist in en-US when present', () => {
    const missing = CAPABILITIES.filter(c => c.detailsKey && !hasKey(c.detailsKey));
    expect(missing.map(c => `${c.id}: ${c.detailsKey}`)).toEqual([]);
  });

  it('all capability humanLimitationKey values exist in en-US when present', () => {
    const missing = CAPABILITIES.filter(c => c.humanLimitationKey && !hasKey(c.humanLimitationKey));
    expect(missing.map(c => `${c.id}: ${c.humanLimitationKey}`)).toEqual([]);
  });

  it('all capability group nameKey values exist in en-US', () => {
    const missing = CAPABILITY_GROUPS.filter(g => !hasKey(g.nameKey));
    expect(missing.map(g => `${g.id}: ${g.nameKey}`)).toEqual([]);
  });

  it('all capability group descriptionKey values exist in en-US', () => {
    const missing = CAPABILITY_GROUPS.filter(g => !hasKey(g.descriptionKey));
    expect(missing.map(g => `${g.id}: ${g.descriptionKey}`)).toEqual([]);
  });

  it('no capability has deprecated name, description, details, or humanLimitation fields', () => {
    const withOldFields = CAPABILITIES.filter(
      c => ('name' in c && c.name !== undefined) ||
           ('description' in c && c.description !== undefined) ||
           ('details' in c && c.details !== undefined) ||
           ('humanLimitation' in c && c.humanLimitation !== undefined)
    );
    expect(withOldFields).toEqual([]);
  });

  it('no capability group has deprecated name or description fields', () => {
    const withOldFields = CAPABILITY_GROUPS.filter(
      g => ('name' in g && g.name !== undefined) ||
           ('description' in g && g.description !== undefined)
    );
    expect(withOldFields).toEqual([]);
  });
});
