/**
 * Side-effect import for process entrypoints, used in place of
 * `import 'dotenv/config'`: it loads .env, then runs the guard, before any
 * later import can open Firestore. See production-data-guard.ts.
 */
import 'dotenv/config';
import { basename } from 'node:path';

import { refuseProductionDataOutsideProduction } from './production-data-guard.js';

refuseProductionDataOutsideProduction(basename(process.argv[1] ?? 'this process'));
