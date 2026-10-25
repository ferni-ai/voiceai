/**
 * Side-effect import for process entrypoints, used in place of
 * `import 'dotenv/config'`: it loads .env, then runs the guard, before any
 * later import can open Firestore. See production-data-guard.ts,
 * utils/synthetic-write-guard.ts and utils/firestore-db-pin.ts.
 */
import 'dotenv/config';
import { basename } from 'node:path';

import { installFirestoreDbPin } from '../utils/firestore-db-pin.js';
import { installSyntheticWriteGuard } from '../utils/synthetic-write-guard.js';
import { refuseProductionDataOutsideProduction } from './production-data-guard.js';

refuseProductionDataOutsideProduction(basename(process.argv[1] ?? 'this process'));
// Before any client exists: production refuses test and eval users' writes.
installSyntheticWriteGuard();
// Every client must use FIRESTORE_DATABASE's database: a mismatch is logged
// (FIRESTORE_DB_PIN=report, the default) or refused (FIRESTORE_DB_PIN=refuse).
installFirestoreDbPin();
