/**
 * Pick the tools a turn needs from an "intent manual": example user requests
 * per tool, searched with BM25.
 *
 * Sending every tool definition on every turn slowed the model's first word
 * (gemini-3.5-flash p50 7.7 s with 340 tools vs ~1 s with 120 or fewer,
 * 2026-09-28) and total input size, not the tool count as such, drives it.
 * Following Toollery (arXiv 2609.22218), each tool is indexed by requests a
 * user would make for it, not only by its description: users say "the pasta
 * needs ten minutes", not "createTimer". A tool's score averages its best few
 * matching requests, with a small bonus for how many matched, plus a weighted
 * match on its name and description. Everything is in-process: no network
 * call on the turn's critical path.
 *
 * @module tools/retrieval/tool-retriever
 */

import { BM25Index } from '../../memory/retrieval/bm25-search.js';

export interface IntentManual {
  tools: Record<string, { domain: string; description: string; queries: string[] }>;
}

export interface RetrieverOptions {
  /** Average the best `topC` matching requests of a tool. */
  topC: number;
  /** Evidence bonus per matching request, as a fraction of the score. */
  lambda: number;
  /** Matching requests beyond this add no bonus. */
  bonusCap: number;
  /** Weight of the name/description match. */
  specWeight: number;
  /** Request-level hits considered per query. */
  candidateDocs: number;
}

export const DEFAULT_RETRIEVER_OPTIONS: RetrieverOptions = {
  topC: 3,
  lambda: 0.05,
  bonusCap: 5,
  specWeight: 0.5,
  candidateDocs: 300,
};

export interface RetrievedTool {
  tool: string;
  score: number;
}

const SEP = '\u0000';

/** "setTimerForMinutes" → "set timer for minutes". */
function splitName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}

export class ToolRetriever {
  private readonly index = new BM25Index();
  private readonly opts: RetrieverOptions;

  constructor(
    readonly manual: IntentManual,
    opts: Partial<RetrieverOptions> = {}
  ) {
    this.opts = { ...DEFAULT_RETRIEVER_OPTIONS, ...opts };
    for (const [tool, entry] of Object.entries(manual.tools)) {
      entry.queries.forEach((q, i) => this.index.addDocument(`${tool}${SEP}q${i}`, q));
      this.index.addDocument(`${tool}${SEP}spec`, `${splitName(tool)} ${entry.description}`);
    }
  }

  get toolCount(): number {
    return Object.keys(this.manual.tools).length;
  }

  /** The `k` best tools for a user request, best first. */
  retrieve(query: string, k: number): RetrievedTool[] {
    const hits = this.index.search(query, { topK: this.opts.candidateDocs, boostExactMatch: 1 });
    const perTool = new Map<string, { queries: number[]; spec: number }>();
    for (const hit of hits) {
      const [tool, kind] = hit.id.split(SEP);
      let entry = perTool.get(tool);
      if (!entry) {
        entry = { queries: [], spec: 0 };
        perTool.set(tool, entry);
      }
      if (kind === 'spec') entry.spec = hit.score;
      else entry.queries.push(hit.score);
    }
    const { topC, lambda, bonusCap, specWeight } = this.opts;
    const scored: RetrievedTool[] = [];
    for (const [tool, { queries, spec }] of perTool) {
      queries.sort((a, b) => b - a);
      const best = queries.slice(0, topC);
      const queryScore = best.length ? best.reduce((a, b) => a + b, 0) / best.length : 0;
      const bonus = 1 + lambda * Math.min(queries.length, bonusCap);
      scored.push({ tool, score: queryScore * bonus + specWeight * spec });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }
}
