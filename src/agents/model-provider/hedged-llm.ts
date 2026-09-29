/**
 * Hedged LLM: cap how long the caller waits for the first word.
 *
 * Gemini's first-token time has a heavy tail. On 2026-09-28 gemini-3.5-flash
 * on Vertex global measured p50 7.2 s / p90 11 s to first text (20 calls, real
 * prompt + 340 tools), while gemini-3-flash-preview and 2.5-flash answered in
 * ~1-1.5 s; the day before 3.5-flash itself was ~0.9 s. Live calls hit the
 * 10 s request timeout twice in a row and went silent for 23 s.
 *
 * So: start the primary. If it has produced nothing useful after
 * `hedgeAfterMs`, also start the backup, and keep whichever produces text or a
 * tool call first; the other is closed. When the primary is healthy the backup
 * never starts, so it costs nothing; when the primary is slow the reply waits
 * at most about hedgeAfterMs + the backup's own first-token time ("The Tail at
 * Scale", Dean & Barroso 2013). A primary that errors before any output starts
 * the backup at once.
 *
 * @module agents/model-provider/hedged-llm
 */

import { llm, type APIConnectOptions } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'HedgedLLM' });

type ChatOptions = Parameters<llm.LLM['chat']>[0];

/** A chunk that commits the reply: text or a tool call, not an empty delta. */
export function isCommittingChunk(chunk: llm.ChatChunk): boolean {
  return Boolean(chunk.delta?.content?.trim() || chunk.delta?.toolCalls?.length);
}

export class HedgedLLM extends llm.LLM {
  constructor(
    readonly primary: llm.LLM,
    readonly backup: llm.LLM,
    readonly hedgeAfterMs: number
  ) {
    super();
    // A failed stream reports on its model's 'error' event and then just ends;
    // nothing else listens to the child models, and an unheard 'error' event
    // would crash the process.
    for (const model of [primary, backup]) {
      model.on('error', (ev: { error?: unknown }) =>
        log.warn({ model: model.label(), error: String(ev?.error) }, 'model error')
      );
    }
  }

  get model(): string {
    return this.primary.model;
  }

  label(): string {
    return `hedged(${this.primary.label()} | ${this.backup.label()})`;
  }

  chat(opts: ChatOptions): llm.LLMStream {
    return new HedgedLLMStream(this, opts);
  }
}

interface Candidate {
  name: 'primary' | 'backup';
  stream: llm.LLMStream;
  buffered: llm.ChatChunk[];
  next: Promise<Step>;
}

type Step =
  | { kind: 'chunk'; cand: Candidate; chunk: llm.ChatChunk }
  | { kind: 'done'; cand: Candidate }
  | { kind: 'error'; cand: Candidate; error: unknown }
  | { kind: 'hedge' };

class HedgedLLMStream extends llm.LLMStream {
  private readonly hedged: HedgedLLM;
  private readonly opts: ChatOptions;
  private readonly children: llm.LLMStream[] = [];

  constructor(hedged: HedgedLLM, opts: ChatOptions) {
    super(hedged, {
      chatCtx: opts.chatCtx,
      toolCtx: opts.toolCtx,
      connOptions: opts.connOptions as APIConnectOptions,
    });
    this.hedged = hedged;
    this.opts = opts;
  }

  close(): void {
    super.close(); // mark cancelled before the children fail with abort errors
    for (const child of this.children) child.close();
  }

  private start(name: Candidate['name']): Candidate {
    const model = name === 'primary' ? this.hedged.primary : this.hedged.backup;
    // Children don't retry on their own: the hedge fails over to the other
    // model and this stream keeps the SDK's retries. A child we close (the
    // loser, or both when the reply is cancelled) otherwise retried its
    // aborted request 3 more times, 2 s apart, then rejected unhandled.
    const stream = model.chat({ ...this.opts, connOptions: { ...this.connOptions, maxRetry: 0 } });
    this.children.push(stream);
    const cand: Candidate = { name, stream, buffered: [], next: undefined as never };
    cand.next = this.pull(cand);
    return cand;
  }

  private async pull(cand: Candidate): Promise<Step> {
    return cand.stream.next().then(
      (r): Step => (r.done ? { kind: 'done', cand } : { kind: 'chunk', cand, chunk: r.value }),
      (error): Step => ({ kind: 'error', cand, error })
    );
  }

  /** Closed by the caller (reply cancelled): children's abort errors are expected. */
  private get cancelled(): boolean {
    return this.abortController.signal.aborted;
  }

  protected async run(): Promise<void> {
    try {
      await this.race();
    } catch (error) {
      // Rethrowing would send the SDK into retries of a reply nobody wants.
      if (this.cancelled) return;
      throw error;
    }
  }

  private async race(): Promise<void> {
    const startedAt = Date.now();
    let timer: NodeJS.Timeout | undefined;
    const hedgeSignal = new Promise<Step>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'hedge' }), this.hedged.hedgeAfterMs);
    });
    let racing: Candidate[] = [this.start('primary')];
    let backupStarted = false;
    let lastError: unknown;
    let winner: Candidate | undefined;
    try {
      while (!winner) {
        const pending: Array<Promise<Step>> = racing.map(async (c) => c.next);
        if (!backupStarted) pending.push(hedgeSignal);
        const step = await Promise.race(pending);
        if (step.kind === 'hedge') {
          backupStarted = true;
          racing.push(this.start('backup'));
          log.info({ afterMs: Date.now() - startedAt }, 'primary slow, started backup');
          continue;
        }
        if (step.kind === 'chunk' && !isCommittingChunk(step.chunk)) {
          step.cand.buffered.push(step.chunk);
          step.cand.next = this.pull(step.cand);
          continue;
        }
        if (step.kind === 'chunk') {
          winner = step.cand;
          winner.buffered.push(step.chunk);
          winner.next = this.pull(winner);
          break;
        }
        // Ended or failed without a word. The SDK reports stream errors on the
        // model's 'error' event and then just ends the stream, so an empty end
        // usually IS a failure (e.g. the 10 s request timeout). Hedge now.
        if (step.kind === 'error') lastError = step.error;
        racing = racing.filter((c) => c !== step.cand);
        log.warn({ candidate: step.cand.name, error: lastError && String(lastError) }, 'no output');
        if (!backupStarted) {
          backupStarted = true;
          racing.push(this.start('backup'));
          continue;
        }
        if (racing.length === 0) {
          if (lastError) throw lastError;
          winner = step.cand; // both ended with nothing to say
        }
      }
    } finally {
      clearTimeout(timer);
    }

    for (const c of racing) if (c !== winner) c.stream.close();
    if (backupStarted) {
      log.info({ winner: winner.name, firstOutputMs: Date.now() - startedAt }, 'hedged reply');
    }
    for (const chunk of winner.buffered) this.queue.put(chunk);
    let step = await winner.next;
    while (step.kind === 'chunk') {
      this.queue.put(step.chunk);
      step = await this.pull(winner);
    }
    if (step.kind === 'error') throw step.error;
  }
}
