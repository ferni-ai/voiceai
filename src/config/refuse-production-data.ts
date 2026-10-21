/**
 * Side-effect import for process entrypoints, used in place of
 * `import 'dotenv/config'`: it loads .env, then runs the guard, before any
 * later import can open Firestore. See production-data-guard.ts and
 * utils/synthetic-write-guard.ts.
 */
import 'dotenv/config';
import { basename } from 'node:path';

import { installSyntheticWriteGuard } from '../utils/synthetic-write-guard.js';
import { refuseProductionDataOutsideProduction } from './production-data-guard.js';

refuseProductionDataOutsideProduction(basename(process.argv[1] ?? 'this process'));
// Before any client exists: production refuses test and eval users' writes.
installSyntheticWriteGuard();
