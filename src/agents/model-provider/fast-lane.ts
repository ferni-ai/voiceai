/**
 * Fast lane: chit-chat turns go to a faster model.
 *
 * Ferni's reply waits ~1 s for gemini-3.5-flash's first text; people answer in
 * ~200 ms. gemini-3.5-flash-lite answers in ~650 ms but picks the right tool
 * only 44% of the time (3.5-flash: 85%; eval-choice.ts, 2026-10-09). Most turns
 * need no tool ("it's been a long day"), so those go to the fast model and
 * anything that may need one (a request, a question about the world, the reply
 * after a tool result) stays on the main model. A missed request still has the
 * tools, and the fast lane is itself hedged by the main model.
 *
 * CASCADE_FAST_LANE=on turns it on (off by default); CASCADE_FAST_LANE_MODEL
 * picks the fast model.
 *
 * @module agents/model-provider/fast-lane
 */

import { llm, type APIConnectOptions } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';

const log = createLogger({ module: 'FastLane' });

type ChatOptions = Parameters<llm.LLM['chat']>[0];
type Env = Record<string, string | undefined>;

export function fastLaneEnabled(env: Env = process.env): boolean {
  return env.CASCADE_FAST_LANE === 'on';
}

/**
 * Words that may mean the turn needs a tool, as whole words. Too many is safe
 * (that turn just waits for the main model); too few is not.
 */
const MAY_NEED_TOOL =
  /\b(remind(?:er|ers)?|timer|timers|alarm|weather|forecast|rain(?:ing)?|snow(?:ing)?|play|playing|music|song|songs|playlist|spotify|pause|skip|volume|louder|quieter|schedule|calendar|appointment|meeting|call|text|message|email|remember|forget|note|notes|list|add|cancel|delete|look up|search|find|google|news|score|scores|stock|stocks|price|what time|time is it|date|book|order|directions|traffic|translate|convert|calculate|turn on|turn off|lights?|set|minutes?|hours?|tomorrow|tonight|next week|recipe|define|meaning of)\b/i;

/** Whether these words may ask for something a tool does (a timer, a reminder, music). */
export function mayNeedTool(text: string): boolean {
  return MAY_NEED_TOOL.test(text);
}

/** A question to Ferni about himself ("what are you up to?") needs no tool. */
const ABOUT_FERNI = /\b(you|your|you're|yourself)\b/i;

interface ItemView {
  type?: string;
  role?: string;
  textContent?: string;
}

/**
 * The caller's words this reply answers, or null when the reply follows a tool
 * call (that one stays on the main model). Pure, so it is tested directly.
 */
export function callerTurn(items: readonly ItemView[]): string | null {
  const said: string[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type === 'function_call' || item.type === 'function_call_output') return null;
    if (item.type !== 'message') continue;
    if (item.role === 'assistant') break;
    // Per-turn reminders ride on the caller's message after a blank line
    // (withTurnStyleReminder); spoken words never hold a newline. Live, the
    // reminder's "a friend on a call" sent every turn to the main model.
    const text = (item.textContent ?? '').split('\n')[0];
    if (item.role === 'user' && !text.startsWith(TURN_CONTEXT_HEADER)) said.unshift(text);
  }
  return said.join(' ').trim();
}

/** Whether a reply to these words can go to the fast model. */
export function chitChat(text: string | null): boolean {
  if (!text) return false;
  if (mayNeedTool(text)) return false;
  if (text.includes('?') && !ABOUT_FERNI.test(text)) return false;
  return true;
}

export class FastLaneLLM extends llm.LLM {
  constructor(
    readonly fast: llm.LLM,
    readonly main: llm.LLM
  ) {
    super();
    // As in HedgedLLM: a failed child stream reports on its model's 'error'
    // event, and an unheard 'error' event would crash the process.
    for (const model of [fast, main]) {
      model.on('error', (ev: { error?: unknown }) =>
        log.warn({ model: model.label(), error: String(ev?.error) }, 'model error')
      );
    }
  }

  get model(): string {
    return this.main.model;
  }

  label(): string {
    return `fast-lane(${this.fast.label()} | ${this.main.label()})`;
  }

  chat(opts: ChatOptions): llm.LLMStream {
    const lane = chitChat(callerTurn(opts.chatCtx.items as readonly ItemView[])) ? 'fast' : 'main';
    log.info({ lane }, 'FAST_LANE');
    return new LaneStream(this, opts, lane === 'fast' ? this.fast : this.main);
  }
}

/** Passes the chosen model's chunks through, so metrics are this LLM's. */
class LaneStream extends llm.LLMStream {
  private child?: llm.LLMStream;

  constructor(
    owner: FastLaneLLM,
    private readonly opts: ChatOptions,
    private readonly target: llm.LLM
  ) {
    super(owner, {
      chatCtx: opts.chatCtx,
      toolCtx: opts.toolCtx,
      connOptions: opts.connOptions as APIConnectOptions,
    });
  }

  close(): void {
    super.close();
    this.child?.close();
  }

  protected async run(): Promise<void> {
    this.child = this.target.chat({ ...this.opts, connOptions: this.connOptions });
    try {
      for await (const chunk of this.child) this.queue.put(chunk);
    } catch (error) {
      if (this.abortController.signal.aborted) return;
      throw error;
    }
  }
}
