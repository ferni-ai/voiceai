/**
 * No new held-out set may be added to the repo.
 *
 * A held-out set measures a change on lines nobody tuned against, so it only works while
 * nobody but its holder can read it. src/agents/__tests__/fixtures/crisis-heldout.ts lived
 * here, the public Crisis Sweep CI logs printed its rows before #3637, and it was retired on
 * 2026-11-09 into the open corpus as crisis-heldout-retired.ts. The live held-out sets are
 * kept off-repo by the eval holder.
 *
 * This fails when a file under src/ or scripts/ is named like a held-out set (heldout,
 * held-out, held_out) unless its name says "retired" or it is on the list below. It also
 * fails for any file whose repo path contains "sealed" (any case), so a sealed/ directory of
 * plainly named files counts too: a sealed set is held off-repo the same way, and "retired"
 * does not excuse it. The list holds the files that existed on 2026-11-09, by
 * name; it may only shrink, so an entry whose file is gone fails too. No sealed-named file
 * path existed on 2026-11-10, so none is listed.
 */
import { execFileSync } from 'child_process';
import { basename, join } from 'path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const HELD_OUT_NAME = /held[-_]?out/i;
const SEALED_NAME = /sealed/i;

/** Held-out-named files that predate this guard (2026-11-09). Do not add to this list. */
const EXISTING: readonly string[] = [
  'scripts/persona-eval/fixtures/internals-heldout-a.json',
  'scripts/persona-eval/fixtures/internals-heldout-b.json',
  'scripts/persona-eval/fixtures/internals-heldout-c.json',
  'scripts/voice-eval/attunement/fixtures/heldout.json',
  'scripts/voice-eval/honest-friend/fixtures/heldout.json',
  'src/services/human-transfer/__tests__/fixtures/cant-see-heldout-1.json',
  'src/services/human-transfer/__tests__/fixtures/cant-see-heldout-2.json',
  'src/services/human-transfer/__tests__/fixtures/cant-see-heldout-3.json',
  'src/utils/__tests__/fixtures/minor-age-held-out.ts',
  'src/utils/__tests__/minor-care-detect-held-out.test.ts',
];

const MESSAGE =
  'Held-out sets live off-repo with the eval holder: a file in this repo is readable by ' +
  'everyone, and CI logs can print it. Hand new held-out lines to the holder instead of ' +
  'committing them (see src/agents/__tests__/fixtures/crisis-heldout-retired.ts).';

/** Tracked files plus untracked ones git doesn't ignore, so a file not yet added still counts. */
function repoFiles(): string[] {
  const args = ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'src', 'scripts'];
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
}

function heldOutOffenders(files: readonly string[]): string[] {
  return files.filter((path) => {
    const name = basename(path);
    if (EXISTING.includes(path)) return false;
    return SEALED_NAME.test(path) || (HELD_OUT_NAME.test(name) && !/retired/i.test(name));
  });
}

describe('no in-repo held-out sets', () => {
  it('no file under src/ or scripts/ is named like a new held-out or sealed set', () => {
    expect(heldOutOffenders(repoFiles()), MESSAGE).toEqual([]);
  });

  it('every listed existing file is still there (the list only shrinks)', () => {
    const files = new Set(repoFiles());
    expect(EXISTING.filter((path) => !files.has(path))).toEqual([]);
  });

  it('flags new held-out and sealed names, passes retired held-out ones (the pattern is live)', () => {
    expect(
      heldOutOffenders([
        'src/agents/__tests__/fixtures/crisis-heldout-new.ts',
        'scripts/x/fixtures/HELD_OUT.json',
        'src/a/held-out-cases.ts',
        'src/agents/__tests__/fixtures/crisis-sealed-new.ts',
        'scripts/x/SEALED-probes.json',
        'src/a/sealed-retired.ts',
        'src/x/sealed/rows.json',
        'src/agents/__tests__/fixtures/crisis-heldout-retired.ts',
        'src/agents/__tests__/fixtures/crisis-test-blind.ts',
        ...EXISTING,
      ])
    ).toEqual([
      'src/agents/__tests__/fixtures/crisis-heldout-new.ts',
      'scripts/x/fixtures/HELD_OUT.json',
      'src/a/held-out-cases.ts',
      'src/agents/__tests__/fixtures/crisis-sealed-new.ts',
      'scripts/x/SEALED-probes.json',
      'src/a/sealed-retired.ts',
      'src/x/sealed/rows.json',
    ]);
  });
});
