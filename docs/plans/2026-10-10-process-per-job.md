# One process per call (voice agent)

## Why

Every call in a worker shares one Node event loop (`src/agents/gce/job-executor.ts`
runs jobs in-process). A call uses about a fifth of a fast core, spread across
LiveKit's per-frame audio plumbing with no single hotspot (CPU profile,
2026-10-10: `voiceai-evidence/cpu-profile-2026-10-10/SUMMARY.md`). Two calls on one
loop starve each other: on dev, Silero VAD lag went from p50 0.5 s alone to
8–41 s with two calls. #562 caps a worker at one call, which wastes 3 of a prod
pod's 4 CPUs and caps prod at 8 concurrent calls (8 replicas).

The stock LiveKit worker runs each job in its own process from a prewarmed pool.
We keep our own worker (connection handling, fast join, readiness) and add the
same model behind a flag.

## Shape

`AGENT_JOB_EXECUTOR=process` (default `inproc`, unchanged behaviour).

- **Parent (worker).** Holds the LiveKit connection, health and readiness, the call
  quality monitor and pod-level background delivery. It does not warm call
  resources. It keeps `AGENT_IDLE_PROCESSES` (default 1) prewarmed children and
  hands each assigned job to one.
- **Child (`gce/job-child.ts`).** Runs the per-process runtime (the memory async
  events, the deep-extraction worker, knowledge capture, orphan cleanups: today's
  module-level setup in `gce-voice-worker.ts`) and `warmupResources`, then says
  `ready`. It runs exactly one job with `runJobInProcess`, drains its background
  queues (deep extraction, capped at 60 s), and exits. One call per process, so
  memory never accumulates across calls.
- **IPC** (`gce/job-process-protocol.ts`).
  - parent → child: `job` (Job proto as binary plus url, token, accept args) and `shutdown`.
  - child → parent: `ready`, `lifecycle` (started, completed, failed) and `load`
    (CPU micros, event-loop utilization), every 2 s.
- **Load.** The parent's load is the children's summed CPU share of the pod quota,
  or the busiest child's ELU, whichever is larger. `workerIsFull` uses it as today.
- **Termination.** LiveKit `termination` is forwarded to the job. Today it is only
  logged, in both modes. `shutdownJob(jobId)` in the executor closes the session.
- **Crash.** A child exiting while its job is active reports the job as failed. A
  dead idle child is replaced.

## Rollout

1. Extract the per-process runtime from `gce-voice-worker.ts` into
   `gce/process-runtime.ts`. No behaviour change.
2. Child, pool, protocol and the executor facade behind the flag, plus termination.
3. Dev: two concurrent calls on one pod with `AGENT_JOB_EXECUTOR=process`,
   `AGENT_MAX_JOBS_PER_WORKER=2`. Pass if both calls' VAD lag is near the
   single-call p50 (0.5 s), there are no errors, and memory stays under the pod limit.
4. Prod through the deploy-agent gates after the humanness session's `ship <sha>`,
   then raise `AGENT_MAX_JOBS_PER_WORKER` (prod 3 on 4 CPUs / 8 GB).

## Risks

- Background work cut off when a child exits: drain before exit, and log what was
  left behind.
- Child warmup competing with a live call for CPU: one idle child, spawned after
  a job starts. Prod has 4 CPUs.
- Memory: about 0.6 GB per warmed child. Dev (4 GB): parent, idle child and 2 calls
  is about 2.5 GB.
- Process-level singletons that assume one process per pod (Slack alerts,
  schedulers): stay in the parent; children skip them.
