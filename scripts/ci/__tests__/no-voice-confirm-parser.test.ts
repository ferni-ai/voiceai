/**
 * No spoken-confirm parser may come back into src.
 *
 * detectConfirmationIntent existed twice (action-approval-handler.ts and
 * tool-execution-wrapper.ts). Both matched a phrase anywhere in a short reply, so
 * "stop please" read as a yes via "please", and handleActionApprovalIntent used one to
 * approve a pending action before the turn's crisis read. Both had no live caller and
 * were deleted. A spoken yes goes through the action gate's read-back confirm
 * (docs/plans/2026-10-13-action-framework.md), never a word list. This fails if any
 * non-test file in src names either symbol again.
 */
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const BANNED = /\b(detectConfirmationIntent|handleActionApprovalIntent)\b/;
const isTest = (path: string): boolean => /(__tests__\/|\.test\.ts$|^src\/tests\/)/.test(path);

function offenders(): string[] {
  const files = execFileSync('git', ['ls-files', '-z', 'src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((path) => /\.(ts|tsx|js|mjs|cjs)$/.test(path) && !isTest(path));
  return files.filter((path) => BANNED.test(readFileSync(join(ROOT, path), 'utf8')));
}

describe('no spoken-confirm parser in src', () => {
  it('no non-test source file names detectConfirmationIntent or handleActionApprovalIntent', () => {
    expect(offenders()).toEqual([]);
  });

  it('the scan sees a re-added export (the pattern is live)', () => {
    expect(BANNED.test('export function detectConfirmationIntent(t: string) {}')).toBe(true);
    expect(BANNED.test('export { handleActionApprovalIntent } from "./x.js";')).toBe(true);
    expect(BANNED.test('export function detectCallIntent(t: string) {}')).toBe(false);
  });
});
