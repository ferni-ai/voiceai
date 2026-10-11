/**
 * Work that runs once a call has ended and its summary is saved: extracting
 * what the caller said about their life, updating a model of the person, and
 * so on. Modules in higher layers register a task; endSession starts them all.
 *
 * Why a registry, and why fire-and-forget: endSession runs inside the 10 s
 * session-cleanup race (cleanup-handler.ts SESSION_CLEANUP_TIMEOUT_MS) and the
 * summary LLM call already spends part of it. Awaiting several more seconds of
 * LLM work there would let the timeout win and skip the steps after it. So
 * runAfterCallTasks starts every task and returns at once; each task has its
 * own timeout, and its errors are logged, never thrown. A per-call job process
 * (AGENT_JOB_EXECUTOR=process) waits for pendingAfterCallTasks() to reach 0
 * before it exits (job-child.ts), so the work isn't killed mid-flight.
 *
 * @module services/session/after-call-tasks
 */
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'after-call-tasks' });

export interface AfterCallTurn {
  role: string;
  content: string;
}

export interface AfterCallContext {
  userId: string;
  sessionId: string;
  personaId?: string;
  turns: readonly AfterCallTurn[];
  /** The saved call summary (ConversationSummary), when there was one. */
  summary?: unknown;
  /** When the call started. */
  startedAt: Date;
  /** The caller's IANA timezone, when known. */
  timezone?: string;
}

export type AfterCallTask = (ctx: AfterCallContext) => Promise<void>;

interface Registered {
  task: AfterCallTask;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const tasks = new Map<string, Registered>();
const inFlight = new Set<Promise<void>>();

/** Adds (or replaces) a named task. Registering the same name twice keeps one. */
export function registerAfterCallTask(
  name: string,
  task: AfterCallTask,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {}
): void {
  tasks.set(name, { task, timeoutMs });
}

export function registeredAfterCallTasks(): string[] {
  return [...tasks.keys()];
}

/** For tests: forgets registered tasks and stops counting ones still running. */
export function clearAfterCallTasks(): void {
  tasks.clear();
  inFlight.clear();
}

/** Tasks started and not yet settled (finished, failed or timed out). */
export function pendingAfterCallTasks(): number {
  return inFlight.size;
}

async function runOne(
  name: string,
  { task, timeoutMs }: Registered,
  ctx: AfterCallContext
): Promise<void> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    const outcome = await Promise.race([task(ctx).then(() => 'done' as const), timeout]);
    if (outcome === 'timeout') {
      log.warn({ task: name, sessionId: ctx.sessionId, timeoutMs }, 'After-call task timed out');
    } else {
      log.info(
        { task: name, sessionId: ctx.sessionId, ms: Date.now() - started },
        'After-call task done'
      );
    }
  } catch (error) {
    log.warn(
      { task: name, sessionId: ctx.sessionId, error: String(error) },
      'After-call task failed'
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Starts every registered task for this call and returns without waiting. */
export function runAfterCallTasks(ctx: AfterCallContext): void {
  for (const [name, reg] of tasks) {
    const p = runOne(name, reg, ctx);
    inFlight.add(p);
    void p.finally(() => inFlight.delete(p));
  }
}

/** Resolves when every started task has settled, or after maxMs; returns how many were left. */
export async function drainAfterCallTasks(maxMs: number): Promise<number> {
  if (inFlight.size === 0) return 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled([...inFlight]),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, maxMs);
    }),
  ]);
  clearTimeout(timer);
  return inFlight.size;
}

/**
 * endSession's one-line entry: builds the context from what it has in scope
 * (session-manager.ts is over the 500-line ratchet, so the call must stay one
 * line).
 */
export function runAfterCall(
  userId: string,
  sessionId: string,
  turns: readonly AfterCallTurn[],
  summary: unknown,
  tracker: { getDurationSeconds: () => number },
  profile: { contactInfo?: { timezone?: string } } | null | undefined
): void {
  runAfterCallTasks({
    userId,
    sessionId,
    turns,
    summary,
    startedAt: new Date(Date.now() - tracker.getDurationSeconds() * 1000),
    timezone: profile?.contactInfo?.timezone,
  });
}
