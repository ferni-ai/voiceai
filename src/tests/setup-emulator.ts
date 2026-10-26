/**
 * Setup for runs against the Firestore emulator only. vitest.config.ts adds this
 * file to setupFiles when FIRESTORE_EMULATOR_HOST is set, so the unit path never
 * loads it.
 *
 * setup.ts fakes firebase-admin/firestore and firebase-admin/app for every test.
 * Its @google-cloud/firestore and firebase-admin mocks already step aside under
 * the emulator; these two did not, so getAdminFirestore() handed an emulator
 * test the in-memory stub. #2338 moved ttl-cleanup onto that helper, and its
 * dry-run .count() then failed the Data Layer E2E nightly. The pass-through
 * lives here, not in setup.ts: an async importOriginal factory there sat on the
 * path of all ~2,250 unit test files, and merge-queue batches carrying it ran
 * Unit Tests ~55% longer (1,947 s against 1,268 s) and timed out.
 *
 * Runs after setup.ts, before the test file is imported, so every import the
 * test makes resolves to the real module. A test's own vi.mock still wins.
 */
import { vi } from 'vitest';

vi.doUnmock('firebase-admin/firestore');
vi.doUnmock('firebase-admin/app');
