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
 * Modes (TOOL_RETRIEVAL): off (the default under tests); shadow (default) = pick and log, but send the
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
import { RetrievalStats, isLiveCovered } from './retrieval-stats.js';
import type { RetrievedTool } from './tool-retriever.js';

const log = createLogger({ module: 'TurnToolRetrieval' });

/** Candidates ranked per sent slot, so unavailable tools don't leave slots empty. */
const CANDIDATES_PER_SLOT = 4;

/** Largest tool set sent whole when there is no pick (see withoutPick). */
export const ALL_TOOLS_LIMIT = 150;

/** A fallback embedding must carry at least this share of the turn's words. */
const FALLBACK_MIN_SHARE = 0.4;

export type ToolRetrievalMode = 'off' | 'shadow' | 'live';

export function toolRetrievalMode(
  env: Record<string, string | undefined> = process.env
): ToolRetrievalMode {
  const v = env.TOOL_RETRIEVAL?.trim().toLowerCase();
  if (v === 'off' || v === 'shadow' || v === 'live') return v;
  return env.VITEST || env.NODE_ENV === 'test' ? 'off' : 'shadow';
}

/** Never left to retrieval: handoffs and every safety tool. */
export const CORE_DOMAINS = ['handoff', 'crisis', 'trauma-support', 'human-transfer'] as const;
export const CORE_TOOLS = [
  // Date, time and location: the model reaches for it before many requests
  // (e.g. "weather tomorrow?"), whatever the topic (dev shadow run, 2026-09-29).
  'getCurrentContext',
  'recallFromMemory',
  'rememberAboutUser',
  'rememberImportantFact',
  'playMusic',
  'musicControl',
  // The fallback when retrieval ranked the right tool too low (find-tools-tool.ts).
  'findTools',
  // Stands in for handoffs to locked teammates (tools/handoff/locked-teammates.ts).
  'askForTeammate',
  // Hanging up an on-behalf phone call (agents/outbound-call/call-control.ts); a
  // goodbye's words never point retrieval at it.
  'endCall',
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
  /** A precomputed embedding counts when its words cover this share of the turn's. */
  nearCoverage?: number;
}

export interface ToolCoverage {
  tool: string;
  /** Position in the retrieved list, -1 when not retrieved. */
  rank: number;
  via: 'retrieved' | 'core' | 'sticky' | 'missed';
  covered: boolean;
  /** Core, sticky, or in the top k of the whole index (see retrieval-stats.ts). */
  liveCovered: boolean;
}

interface Pick {
  text: string;
  tools: RetrievedTool[];
  embedMs: number;
  /** exact: embedded during speech; near: a slightly earlier transcript's; none: embedded now. */
  speculative: 'exact' | 'near' | 'none';
}

interface Embedding {
  text: string;
  words: Set<string>;
  vector: Promise<Float32Array>;
  /** Set once the embedding has arrived. */
  ready?: Float32Array;
  /** User turn it was requested in. */
  turn: number;
}

/** What live mode sends: a pick for these words, a close one from this turn, or every tool. */
export interface LiveChoice {
  pick: Pick | null;
  source: 'fresh' | 'fallback' | 'all';
}

/**
 * Key for matching a transcript to its precomputed embedding: final
 * transcripts gain punctuation and casing the interim one lacked.
 */
export const matchKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const norm = matchKey;

export class TurnToolRetrieval {
  private readonly k: number;
  private readonly stickyTurns: number;
  private readonly nearCoverage: number;
  /** Embeddings by match key, oldest first; the last few only. */
  private readonly embeddings = new Map<string, Embedding>();
  /** The index, once loaded. */
  private readyIndex: DenseToolIndex | null = null;
  private inFlight = false;
  private pending: string | null = null;
  private lastPick: Pick | null = null;
  /** The retrieved tools last sent (or, in shadow mode, that would have been). */
  private lastChosen = new Set<string>();
  private readonly picking = new Map<string, Promise<Pick | null>>();
  /** tool → turn it was last used or picked in. */
  private readonly sticky = new Map<string, number>();
  private turn = 0;
  private readonly logged = new WeakSet<object>();
  /** The agent's full tool set as of the last request (what findTools can offer). */
  private available: Record<string, { description?: string }> | null = null;
  private readonly stats = new RetrievalStats();

  constructor(private readonly opts: TurnToolRetrievalOptions) {
    this.k = opts.k ?? 20;
    this.stickyTurns = opts.stickyTurns ?? 3;
    this.nearCoverage = opts.nearCoverage ?? 0.7;
  }

  private embed(text: string): Promise<Float32Array> {
    const key = norm(text);
    const have = this.embeddings.get(key);
    if (have) return have.vector;
    const vector = this.opts.embedder.embed([text]).then((v) => v[0]);
    const entry: Embedding = { text, words: new Set(key.split(' ')), vector, turn: this.turn };
    vector.then(
      (v) => {
        entry.ready = v;
      },
      () => this.embeddings.delete(key)
    );
    this.embeddings.set(key, entry);
    while (this.embeddings.size > 8) this.embeddings.delete(this.embeddings.keys().next().value!);
    return vector;
  }

  /**
   * Throttle, not debounce: embed at once when nothing is in flight, else keep
   * only the newest text for when the current call returns. A debounce kept
   * resetting while the user talked and rarely fired before the pick.
   */
  private schedule(text: string): void {
    if (this.embeddings.has(norm(text))) return;
    if (this.inFlight) {
      this.pending = text;
      return;
    }
    this.inFlight = true;
    void this.embed(text)
      .catch(() => undefined)
      .finally(() => {
        this.inFlight = false;
        const next = this.pending;
        this.pending = null;
        if (next) this.schedule(next);
      });
  }

  /** A user turn ended (the agent took the floor): ages the sticky set. */
  newTurn(): void {
    this.turn++;
  }

  /** Interim and final user transcripts: embed ahead of the reply. */
  onTranscript(text: string, _isFinal: boolean): void {
    if (text.trim()) this.schedule(text);
  }

  /** The newest precomputed embedding whose words cover most of `key`'s. */
  private near(key: string): Promise<Float32Array> | null {
    const words = key.split(' ');
    for (const [, e] of [...this.embeddings].reverse()) {
      const covered = words.filter((w) => e.words.has(w)).length / words.length;
      if (covered >= this.nearCoverage) return e.vector;
    }
    return null;
  }

  /** Retrieve for the user's words (once per distinct text). */
  pick(text: string): Promise<Pick | null> {
    const key = norm(text);
    let p = this.picking.get(key);
    if (p) return p;
    p = (async (): Promise<Pick | null> => {
      const started = Date.now();
      const exact = this.embeddings.get(key)?.vector;
      const near = exact ? null : this.near(key);
      const speculative: Pick['speculative'] = exact ? 'exact' : near ? 'near' : 'none';
      try {
        const [index, vector] = await Promise.all([
          this.opts.index().then((i) => {
            this.readyIndex = i;
            return i;
          }),
          exact ?? near ?? this.embed(text),
        ]);
        const pick = {
          text,
          tools: index.search(vector, this.k * CANDIDATES_PER_SLOT),
          embedMs: Date.now() - started,
          speculative,
        };
        this.lastPick = pick;
        this.stats.pick(pick.embedMs);
        return pick;
      } catch (error) {
        this.stats.pick(null);
        log.warn({ sessionId: this.opts.sessionId, error: String(error) }, 'tool retrieval failed');
        return null;
      }
    })();
    this.picking.set(key, p);
    while (this.picking.size > 8) this.picking.delete(this.picking.keys().next().value!);
    return p;
  }

  /**
   * Live mode: the pick for `text` if it's ready within `waitMs`. Otherwise a
   * pick from the newest finished embedding of an earlier transcript of this
   * same utterance: one made this turn whose words are mostly in `text` and
   * that carries a fair share of it. The final transcript often adds words
   * the last interim lacked, so its own embedding (~200 ms) is still in
   * flight while the interim's is done. Failing that, null: send every tool
   * rather than guess.
   */
  async pickLive(text: string, waitMs: number): Promise<LiveChoice> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fresh = await Promise.race([
      this.pick(text),
      new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), waitMs);
      }),
    ]).finally(() => clearTimeout(timer));
    if (fresh && fresh !== 'timeout') return { pick: fresh, source: 'fresh' };
    const index = this.readyIndex;
    if (!index) return { pick: null, source: 'all' };
    const words = new Set(norm(text).split(' '));
    for (const [, e] of [...this.embeddings].reverse()) {
      if (!e.ready || e.turn !== this.turn) continue;
      const inText = [...e.words].filter((w) => words.has(w)).length;
      const contained = inText / e.words.size >= this.nearCoverage;
      const substantial = inText >= Math.max(3, words.size * FALLBACK_MIN_SHARE);
      if (!contained || !substantial) continue;
      const pick: Pick = {
        text: e.text,
        tools: index.search(e.ready, this.k * CANDIDATES_PER_SLOT),
        embedMs: 0,
        speculative: 'near',
      };
      return { pick, source: 'fallback' };
    }
    return { pick: null, source: 'all' };
  }

  /** Live mode: the tools to send this request (see pickLive), logged. */
  async selectLive(
    text: string,
    toolCtx: llm.ToolContext,
    waitMs: number
  ): Promise<llm.ToolContext> {
    const started = Date.now();
    const { pick, source } = await this.pickLive(text, waitMs);
    const sent = pick ? this.select(toolCtx, pick) : this.withoutPick(toolCtx);
    log.info(
      {
        sessionId: this.opts.sessionId,
        textChars: text.length,
        source,
        pickedForChars: pick && source === 'fallback' ? pick.text.length : undefined,
        waitMs: Date.now() - started,
        toolsNow: Object.keys(toolCtx.functionTools).length,
        toolsSent: Object.keys(sent.functionTools).length,
        pickedUnavailable: pick
          ? pick.tools.slice(0, this.k).filter((t) => !(t.tool in toolCtx.functionTools)).length
          : 0,
      },
      'TOOL_RETRIEVAL_LIVE'
    );
    return sent;
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

  /**
   * The best k retrieved tools the agent has. The index covers the whole
   * catalog, but only tools the agent has loaded can be sent or run: sending
   * the top k regardless dropped the unavailable ones, and "keep an eye on
   * the time" reached the model with no timer or reminder tool at all (dev
   * A/B, 2026-09-29). These become sticky for the next few turns.
   */
  private choose(toolCtx: llm.ToolContext, pick: Pick): Set<string> {
    const available = toolCtx.functionTools;
    this.available = available;
    const chosen = new Set<string>();
    for (const t of pick.tools) {
      if (chosen.size >= this.k) break;
      if (t.tool in available) chosen.add(t.tool);
    }
    for (const t of chosen) this.sticky.set(t, this.turn);
    this.lastChosen = chosen;
    return chosen;
  }

  /**
   * No pick in time: send everything only while the agent's set is small.
   * Once the whole catalog is loaded (~1,160 tools) that would take seconds
   * to the first word (340 tools: 7.7 s, dev 2026-09-28), so send the core,
   * the recent tools and findTools, which reaches the rest.
   */
  withoutPick(toolCtx: llm.ToolContext): llm.ToolContext {
    this.available = toolCtx.functionTools;
    if (Object.keys(toolCtx.functionTools).length <= ALL_TOOLS_LIMIT) return toolCtx;
    const keep = Object.entries(toolCtx.functionTools)
      .filter(([name]) => this.isCore(name) || this.isSticky(name))
      .map(([, tool]) => tool);
    return new llm.ToolContext([...keep, ...toolCtx.providerTools, ...toolCtx.toolsets]);
  }

  /** The tools to send: core + sticky + the pick, from what the agent has. */
  select(toolCtx: llm.ToolContext, pick: Pick): llm.ToolContext {
    const picked = this.choose(toolCtx, pick);
    const keep = Object.entries(toolCtx.functionTools)
      .filter(([name]) => picked.has(name) || this.isCore(name) || this.isSticky(name))
      .map(([, tool]) => tool);
    return new llm.ToolContext([...keep, ...toolCtx.providerTools, ...toolCtx.toolsets]);
  }

  /**
   * findTools: search the whole index for what the model says it needs and
   * make the best matches the agent has part of every request for the next
   * few turns, starting with the model's next step in this same reply.
   */
  async find(need: string, n = 5): Promise<Array<{ name: string; description: string }>> {
    const started = Date.now();
    const [index, vector] = await Promise.all([this.opts.index(), this.embed(need)]);
    const available = this.available;
    const found: Array<{ name: string; description: string }> = [];
    for (const t of index.search(vector, n * CANDIDATES_PER_SLOT * 2)) {
      if (found.length >= n) break;
      if (available && !(t.tool in available)) continue;
      this.sticky.set(t.tool, this.turn);
      const description = (available?.[t.tool]?.description ?? '').split(/(?<=[.!?])\s/)[0];
      found.push({ name: t.tool, description: description.slice(0, 140) });
    }
    log.info(
      {
        sessionId: this.opts.sessionId,
        needChars: need.length,
        found: found.map((f) => f.name),
        ms: Date.now() - started,
      },
      'TOOL_RETRIEVAL_FIND'
    );
    return found;
  }

  /** Shadow mode: pick and log without changing what the model gets. */
  observe(text: string, toolCtx: llm.ToolContext): void {
    void this.pick(text).then((p) => {
      // llmNode runs several times per turn (preemptive, final, after tools).
      if (!p || this.logged.has(p)) return;
      this.logged.add(p);
      const available = toolCtx.functionTools;
      const chosen = this.choose(toolCtx, p);
      const selected = Object.keys(available).filter(
        (n) => chosen.has(n) || this.isCore(n) || this.isSticky(n)
      ).length;
      log.info(
        {
          sessionId: this.opts.sessionId,
          textChars: text.length,
          picked: [...chosen],
          unavailable: p.tools
            .slice(0, this.k)
            .filter((t) => !(t.tool in available))
            .map((t) => t.tool),
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
      const via: ToolCoverage['via'] = this.lastChosen.has(name)
        ? 'retrieved'
        : this.isCore(name)
          ? 'core'
          : this.isSticky(name)
            ? 'sticky'
            : 'missed';
      this.sticky.set(name, this.turn);
      const mode = toolRetrievalMode();
      const c = { tool: name, rank, via, covered: via !== 'missed' };
      const coverage: ToolCoverage = { ...c, liveCovered: isLiveCovered(c, this.k, mode) };
      this.stats.call(coverage);
      const textChars = pick?.text.length ?? null;
      log.info(
        { sessionId: this.opts.sessionId, mode, textChars, ...coverage },
        'TOOL_RETRIEVAL_COVERAGE'
      );
      return coverage;
    });
  }

  /** Session end: one line of counts for shadow-to-live promotion. Never text. */
  logSummary(): void {
    const { sessionId } = this.opts;
    const counts = { turns: this.turn, k: this.k, ...this.stats.summary() };
    log.info({ sessionId, mode: toolRetrievalMode(), ...counts }, 'TOOL_RETRIEVAL_SUMMARY');
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

/**
 * The user's words for the current turn: every user message since the agent
 * last spoke. A turn with a pause arrives as several user messages, and the
 * request can be in an earlier one ("what's the weather tomorrow?" then
 * "I'm thinking of going for a hike").
 */
export function latestUserText(chatCtx: llm.ChatContext): string | null {
  const parts: string[] = [];
  for (let i = chatCtx.items.length - 1; i >= 0; i--) {
    const item = chatCtx.items[i];
    if (item.type !== 'message') continue;
    if (item.role === 'assistant') break;
    if (item.role === 'user' && item.textContent) parts.unshift(item.textContent);
  }
  return parts.length ? parts.join(' ') : null;
}
