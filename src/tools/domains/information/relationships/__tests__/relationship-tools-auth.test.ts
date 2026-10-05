/**
 * Guard: relationship tools must not trust LLM-supplied userId (see #218).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const indexPath = join(dirname(fileURLToPath(import.meta.url)), '../index.ts');

describe('relationship tools auth wiring', () => {
  it('wraps tool factories with withAuthenticatedUserId', () => {
    const source = readFileSync(indexPath, 'utf8');
    expect(source).toContain('withAuthenticatedUserId');
    const createLines = source.match(/create:\s*\(ctx[^)]*\)\s*=>\s*withAuthenticatedUserId/g) ?? [];
    expect(createLines.length).toBeGreaterThanOrEqual(8);
  });
});
