/**
 * Vitest sequencer for the unit shards: known-slow test files start first.
 *
 * Why: vitest's BaseSequencer runs files with a cached result longest-first, and files without
 * one largest-file-first. CI keeps no results cache (each unit shard restores only node_modules,
 * saved by the setup job before any test runs), so every file sorts by its size on disk. A small
 * file that runs for minutes then starts last and runs alone as a tail. #3842's CI (2a9369a386)
 * showed it: the 1.5 KB crisis-reply-never-lower-base-on.test.ts ran 317 s at the end of shard 1,
 * whose vitest time went from 594 s on main to 1,170 s, and the job to 23 of its 25 minutes. The
 * 6 KB -wall-clock file (285 s) started early on shard 4 and cost that shard 29 s.
 *
 * Only `sort` changes. `shard` is BaseSequencer's (sha1 of each path, sliced), so every file stays
 * on the shard it was on; a unit test holds that. SLOW_FIRST is one pattern for the whole family,
 * so a file split off or renamed within it still starts first.
 *
 * @module scripts/ci/vitest-slow-files-first
 */
import { BaseSequencer, type TestSpecification } from 'vitest/node';

/** The reply never-lower grid's test files: small files, minutes each under coverage. */
const SLOW_FIRST = /\/crisis-reply-never-lower[^/]*\.test\.ts$/;

const isSlow = (spec: TestSpecification): boolean =>
  SLOW_FIRST.test(spec.moduleId.replaceAll('\\', '/'));

export class SlowFilesFirstSequencer extends BaseSequencer {
  /** BaseSequencer's order, with the slow files moved to the front (in that order). */
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const sorted = await super.sort(files);
    return [...sorted.filter(isSlow), ...sorted.filter((spec) => !isSlow(spec))];
  }
}
