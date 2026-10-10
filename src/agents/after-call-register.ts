/**
 * Registers the after-call tasks (services/session/after-call-tasks.ts) once
 * per process. Imported for its side effects by gce/job-executor.ts, the one
 * module that runs voice jobs, both in the worker and in a per-call job
 * process. Each module that wants work done after a call ends adds one import
 * of its own register file here, so the executor never changes for a new task.
 *
 * @module agents/after-call-register
 */
import '../intelligence/theory-of-mind/register.js';
