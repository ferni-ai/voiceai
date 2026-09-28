/**
 * Per-turn tool selection for a voice session: send the model the tools this
 * turn needs, not every tool definition.
 *
 * Each turn's tool set = a fixed core (handoffs, safety, memory, music) + the
 * tools used or picked in the last few turns + the top-k tools retrieved for
 * the user's words (dense-index.ts). The embedding of the user's words is
 * computed while they are still talking, from interim transcripts, so the
 * ~200 ms embedding call is off the reply's critical path.
 *
 * Modes (TOOL_RETRIEVAL): off (default); shadow = pick and log, but send the
 * tools as before, then log whether each tool the model called was in the
 * pick; live = send only the pick. Selection happens inside llmNode on a copy:
 * the agent's own tool list never changes, so the SDK's preemptive reply is
 * kept and any tool the model calls can still be executed.
 *
 * @module tools/retrieval/turn-tool-retrieval
 */

import { llm } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import type { DenseToolIndex, Embedder } from './dense-index.js';
import type { RetrievedTool } from './tool-retriever.js';

const log = createLogger({ module: 'TurnToolRetrieval' });

export type ToolRetrievalMode = 'off' | 'shadow' | 'live';

export function toolRetrievalMode(
  env: Record<string, string | undefined> = process.env
): ToolRetrievalMode {
  const v = env.TOOL_RETRIEVAL;
  return v === 'shadow' || v === 'live' ? v : 'off';
}

/** Never left to retrieval: handoffs and every safety tool. */
export const CORE_DOMAINS = ['handoff', 'crisis', 'trauma-support', 'human-transfer'] as const;
export const CORE_TOOLS = [
  'recallFromMemory',
  'rememberAboutUser',
  'rememberImportantFact',
  'playMusic',
  'musicControl',
] as const;

export interface TurnToolRetrievalOptions {
  sessionId: string;
  embedder: Embedder;
  index: () => Promise<DenseToolIndex>;
  /** tool name → domain, to recognise core tools. */
  domainOf: (tool: string) => string | undefined;
  k?: number;
  /** User turns a used or picked tool stays in the set. */
  stickyTurns?: number;
  debounceMs?: number;
}

export interface ToolCoverage {
  tool: string;
  /** Position in the retrieved list, -1 when not retrieved. */
  rank: number;
  via: 'retrieved' | 'core' | 'sticky' | 'missed';
  covered: boolean;
}

interface Pick {
  text: string;
  tools: RetrievedTool[];
  embedMs: number;
  speculative: boolean;
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

export class TurnToolRetrieval {
  private readonly k: number;
  private readonly stickyTurns: number;
  private readonly debounceMs: number;
  /** Embeddings by normalised text; the last few only. */
  private readonly embeddings = new Map<string, Promise<Float32Array>>();
  private debounce: NodeJS.Timeout | null = null;
  private lastPick: Pick | null = null;
  private readonly picking = new Map<string, Promise<Pick | null>>();
  /** tool → turn it was last used or picked in. */
  private readonly sticky = new Map<string, number>();
  private turn = 0;

  constructor(private readonly opts: TurnToolRetrievalOptions) {
    this.k = opts.k ?? 20;
    this.stickyTurns = opts.stickyTurns ?? 3;
    this.debounceMs = opts.debounceMs ?? 250;
  }

  private embed(text: string): Promise<Float32Array> {
    const key = norm(text);
    let p = this.embeddings.get(key);
    if (!p) {
      p = this.opts.embedder.embed([text]).then((v) => v[0]);
      p.catch(() => this.embeddings.delete(key));
      this.embeddings.set(key, p);
      while (this.embeddings.size > 8) this.embeddings.delete(this.embeddings.keys().next().value!);
    }
    return p;
  }

  /** A user turn ended (the agent took the floor): ages the sticky set. */
  newTurn(): void {
    this.turn++;
  }

  /** Interim and final user transcripts: embed ahead of the reply. */
  onTranscript(text: string, isFinal: boolean): void {
    if (!text.trim()) return;
    if (this.debounce) clearTimeout(this.debounce);
    if (isFinal) {
      void this.embed(text).catch(() => undefined);
      return;
    }
    this.debounce = setTimeout(() => void this.embed(text).catch(() => undefined), this.debounceMs);
  }

  /** Retrieve for the user's words (once per distinct text). */
  pick(text: string): Promise<Pick | null> {
    const key = norm(text);
    let p = this.picking.get(key);
    if (p) return p;
    p = (async (): Promise<Pick | null> => {
      const started = Date.now();
      const speculative = this.embeddings.has(key);
      try {
        const [index, vector] = await Promise.all([this.opts.index(), this.embed(text)]);
        const pick = {
          text,
          tools: index.search(vector, this.k),
          embedMs: Date.now() - started,
          speculative,
        };
        this.lastPick = pick;
        for (const t of pick.tools) this.sticky.set(t.tool, this.turn);
        return pick;
      } catch (error) {
        log.warn({ sessionId: this.opts.sessionId, error: String(error) }, 'tool retrieval failed');
        return null;
      }
    })();
    this.picking.set(key, p);
    while (this.picking.size > 8) this.picking.delete(this.picking.keys().next().value!);
    return p;
  }

  isCore(tool: string): boolean {
    return (
      (CORE_TOOLS as readonly string[]).includes(tool) ||
      (CORE_DOMAINS as readonly string[]).includes(this.opts.domainOf(tool) ?? '')
    );
  }

  private isSticky(tool: string): boolean {
    const at = this.sticky.get(tool);
    return at !== undefined && this.turn - at < this.stickyTurns;
  }

  /** The tools to send: core + sticky + the pick, from what the agent has. */
  select(toolCtx: llm.ToolContext, pick: Pick): llm.ToolContext {
    const picked = new Set(pick.tools.map((t) => t.tool));
    const keep = Object.entries(toolCtx.functionTools)
      .filter(([name]) => picked.has(name) || this.isCore(name) || this.isSticky(name))
      .map(([, tool]) => tool);
    return new llm.ToolContext([...keep, ...toolCtx.providerTools, ...toolCtx.toolsets]);
  }

  /** Shadow mode: pick and log without changing what the model gets. */
  observe(text: string, toolCtx: llm.ToolContext): void {
    void this.pick(text).then((p) => {
      if (!p) return;
      const available = toolCtx.functionTools;
      const selected = Object.keys(available).filter(
        (n) => p.tools.some((t) => t.tool === n) || this.isCore(n) || this.isSticky(n)
      ).length;
      log.info(
        {
          sessionId: this.opts.sessionId,
          text: text.slice(0, 200),
          picked: p.tools.map((t) => t.tool),
          embedMs: p.embedMs,
          speculative: p.speculative,
          toolsNow: Object.keys(available).length,
          toolsWouldSend: selected,
        },
        'TOOL_RETRIEVAL_SHADOW'
      );
    });
  }

  /** After the model called tools: were they in the pick? Logged and returned. */
  onToolsExecuted(names: string[]): ToolCoverage[] {
    const pick = this.lastPick;
    return names.map((name) => {
      const rank = pick ? pick.tools.findIndex((t) => t.tool === name) : -1;
      const via: ToolCoverage['via'] =
        rank >= 0
          ? 'retrieved'
          : this.isCore(name)
            ? 'core'
            : this.isSticky(name)
              ? 'sticky'
              : 'missed';
      this.sticky.set(name, this.turn);
      const coverage: ToolCoverage = { tool: name, rank, via, covered: via !== 'missed' };
      log.info(
        { sessionId: this.opts.sessionId, text: pick?.text.slice(0, 200) ?? null, ...coverage },
        'TOOL_RETRIEVAL_COVERAGE'
      );
      return coverage;
    });
  }
}

// Keyed by the AgentSession object: agent setup and the agent's llmNode hold
// the same instance, while their "session id" fields come from different places.
const sessions = new WeakMap<object, TurnToolRetrieval>();

export function setTurnToolRetrieval(session: object, r: TurnToolRetrieval | null): void {
  if (r) sessions.set(session, r);
  else sessions.delete(session);
}

export function getTurnToolRetrieval(session: object | undefined): TurnToolRetrieval | undefined {
  return session ? sessions.get(session) : undefined;
}

/** The text of the latest user message in a chat context. */
export function latestUserText(chatCtx: llm.ChatContext): string | null {
  for (let i = chatCtx.items.length - 1; i >= 0; i--) {
    const item = chatCtx.items[i];
    if (item.type === 'message' && item.role === 'user') return item.textContent ?? null;
  }
  return null;
}
