/**
 * Registers the after-call tasks (services/session/after-call-tasks.ts) once
 * per process. Imported for its side effects by gce/job-executor.ts, the one
 * module that runs voice jobs, both in the worker and in a per-call job
 * process. Each module that wants work done after a call ends adds one import
 * of its own register file here, so the executor never changes for a new task.
 *
 * @module agents/after-call-register
 */
import './integrations/quirk-memory-register.js';
import './theory-of-mind-register.js';
import './fact-sweep-register.js';
import './personas/common-ground-register.js';
import '../intelligence/world-model/extraction/register.js';
import './dates-register.js';
import '../services/outreach/after-call-checkin-register.js';
import './fact-supersession-register.js';
import './personas/move-outcomes-register.js';
import './wellbeing-register.js';
import './summary-joke-retention-register.js';
import './personas/persona-growth-register.js';
