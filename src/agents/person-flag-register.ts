/**
 * Wires config/person-flag.ts into the agent process, as
 * api/scheduled-jobs/index.ts does for the UI server. Imported for its side
 * effect by gce/job-executor.ts, which every process that runs a call loads.
 * A person's flag is as their call had it (envForCaller): after the call
 * process.env may hold the next caller's flags.
 *
 * @module agents/person-flag-register
 */
import { usePersonFlagLookup } from '../config/person-flag.js';
import { callerFlag } from '../services/platform/caller-flag.js';

usePersonFlagLookup(callerFlag);
