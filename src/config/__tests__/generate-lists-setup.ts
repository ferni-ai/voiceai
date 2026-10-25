/**
 * vitest globalSetup: writes the gitignored generated lists (generated-lists.ts)
 * before any test file loads, so a fresh clone's tests can import FLAG_MANIFEST
 * and ENV_READ_NAMES without a prior `pnpm gen:lists`.
 *
 * @module config/__tests__/generate-lists-setup
 */
import { REPO_ROOT, writeGeneratedLists } from '../generated-lists.js';

export default function setup(): void {
  writeGeneratedLists(REPO_ROOT);
}
