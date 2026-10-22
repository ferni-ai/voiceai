/**
 * The Google Cloud guard alone, for vitest configs that don't load
 * src/tests/setup.ts (apps/cli, whose commands build Firestore clients).
 */
import { guardRealFirestore, isolateGcpCredentials } from './gcp-test-guard.js';

isolateGcpCredentials();
guardRealFirestore();
