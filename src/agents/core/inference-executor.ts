/**
 * In-Process Inference Executor
 *
 * Runs the SDK's registered inference runners (end-of-turn models and the
 * like) inside the job process. LiveKit's own worker runs them in a separate
 * inference process; ours builds JobContext itself (gce/job-executor.ts), and
 * the executor it used to pass rejected every call. A turn-detector model
 * then failed silently ("Error predicting end of turn") and every turn fell
 * back to the minimum endpointing delay.
 *
 * A runner is loaded and initialised once per process, on first use, the way
 * the SDK's inference process does it (ipc/inference_proc_lazy_main.js):
 * import the registered path, construct its default export, initialize(),
 * then run(). Methods nobody registered still throw.
 *
 * @module agents/core/inference-executor
 */

import { InferenceRunner } from '@livekit/agents';

interface Runner {
  initialize(): Promise<void>;
  run(data: unknown): Promise<unknown>;
}

type Loader = (path: string) => Promise<{ default?: unknown }>;

/** One loaded runner per method for the whole process: models are large. */
const runners = new Map<string, Promise<Runner>>();

async function loadRunner(path: string, load: Loader): Promise<Runner> {
  const m = await load(path);
  const d = m.default as { default?: unknown } | undefined;
  const Ctor = (typeof d === 'function' ? d : d?.default) as (new () => Runner) | undefined;
  if (typeof Ctor !== 'function') {
    throw new Error(`Inference runner at ${path} has no default export class`);
  }
  const runner = new Ctor();
  await runner.initialize();
  return runner;
}

export class InProcessInferenceExecutor {
  constructor(
    private readonly registry: Readonly<Record<string, string>> = InferenceRunner.registeredRunners,
    private readonly load: Loader = (path) => import(path)
  ) {}

  async doInference(method: string, data: unknown): Promise<unknown> {
    const path = this.registry[method];
    if (!path) throw new Error(`No inference runner registered for ${method}`);
    let runner = runners.get(method);
    if (!runner) {
      runner = loadRunner(path, this.load);
      runners.set(method, runner);
      // A failed load must not poison the method for the rest of the process.
      runner.catch(() => runners.delete(method));
    }
    return (await runner).run(data);
  }
}

/** Tests only: forget loaded runners. */
export function resetInferenceRunnersForTests(): void {
  runners.clear();
}
