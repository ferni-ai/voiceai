/**
 * Side-effect import for process entrypoints: place it right after
 * `import 'dotenv/config'` so it runs before any module that may open
 * Firestore. See production-data-guard.ts.
 */
import { basename } from 'node:path';

import { refuseProductionDataOutsideProduction } from './production-data-guard.js';

refuseProductionDataOutsideProduction(basename(process.argv[1] ?? 'this process'));
