/**
 * Convert each tool set to Gemini function declarations once, not per request.
 *
 * The Google plugin converts every tool (Zod -> JSON Schema -> JSON copy ->
 * OpenAPI schema) inside LLMStream.run(): on every request, every SDK retry,
 * and again when the hedge backup starts. For the cascade's 64 tools that was
 * 64 conversions and 0.65-1.4 ms of CPU per request (median of 50,
 * docs/perf/llm-request-cost.md), for output that only changes when the tool
 * set does.
 *
 * DeclarationCache keeps the plugin's own conversion per tool set in a small
 * LRU, so an unchanged set costs no conversions. createCachedDeclarationsLLM builds
 * the plugin's LLM with that cache in front of it; the cascade's primary and
 * backup share one cache, so a hedge reuses the primary's declarations.
 *
 * @module agents/model-provider/gemini-declarations
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { llm } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'GeminiDeclarations' });

export interface FunctionDeclaration {
  name: string;
  description?: string;
  parameters?: unknown;
}
export type DeclarationConverter = (toolCtx: llm.ToolContext) => FunctionDeclaration[];

/** Tool sets one process keeps converted; a set is ~8k tokens of JSON. */
export const DEFAULT_MAX_TOOL_SETS = 32;

const schemaIds = new WeakMap<object, number>();
let nextSchemaId = 1;

function schemaKey(parameters: unknown): string | number {
  if (typeof parameters !== 'object' || parameters === null)
    return JSON.stringify(parameters ?? null);
  let id = schemaIds.get(parameters);
  if (id === undefined) {
    id = nextSchemaId++;
    schemaIds.set(parameters, id);
  }
  return id;
}

/**
 * A key that changes whenever the declarations would: each tool's name,
 * description and schema. A schema object converts the same way every time
 * (tool schemas are Zod objects, which are immutable), so its identity stands
 * in for a content hash without serializing it on every request; a rebuilt
 * schema gets a new id and is converted again.
 */
export function toolSetSignature(toolCtx: llm.ToolContext): string {
  return JSON.stringify(
    llm
      .sortedToolEntries(toolCtx)
      .map(([name, tool]) => [name, tool.description, schemaKey(tool.parameters)])
  );
}

export class DeclarationCache {
  private readonly sets = new Map<string, FunctionDeclaration[]>();
  /** Tool sets converted so far (cache misses). */
  conversions = 0;

  constructor(
    private readonly convert: DeclarationConverter,
    readonly maxSets: number = DEFAULT_MAX_TOOL_SETS
  ) {}

  get size(): number {
    return this.sets.size;
  }

  /** The declarations for this tool set: the same array for as long as the set is cached. */
  declarationsFor(toolCtx: llm.ToolContext): FunctionDeclaration[] {
    const key = toolSetSignature(toolCtx);
    const cached = this.sets.get(key);
    if (cached) {
      this.sets.delete(key); // most recently used goes last
      this.sets.set(key, cached);
      return cached;
    }
    const declarations = this.convert(toolCtx);
    this.conversions += 1;
    this.sets.set(key, declarations);
    if (this.sets.size > this.maxSets) {
      const oldest = this.sets.keys().next().value;
      if (oldest !== undefined) this.sets.delete(oldest);
    }
    return declarations;
  }
}

let pluginConverter: Promise<DeclarationConverter | null> | undefined;

/**
 * The plugin's own toFunctionDeclarations, so cached declarations are exactly
 * what the plugin would send. Its package index does not export it; the module
 * is the same file the plugin's LLM imports. null if it cannot be loaded (the
 * caller then keeps the plugin's per-request conversion).
 */
export async function loadPluginConverter(): Promise<DeclarationConverter | null> {
  pluginConverter ??= (async () => {
    try {
      const entry = createRequire(import.meta.url).resolve('@livekit/agents-plugin-google');
      const utils = (await import(pathToFileURL(join(dirname(entry), 'utils.js')).href)) as {
        toFunctionDeclarations?: unknown;
      };
      if (typeof utils.toFunctionDeclarations === 'function') {
        return utils.toFunctionDeclarations as DeclarationConverter;
      }
      log.warn('Google plugin has no toFunctionDeclarations; tool schemas convert per request');
    } catch (error) {
      log.warn(
        { error: String(error) },
        'Google plugin converter not loaded; tool schemas convert per request'
      );
    }
    return null;
  })();
  return pluginConverter;
}

let shared: Promise<DeclarationCache | null> | undefined;

/** One cache per process: sessions with the same tool set share its declarations. */
export async function sharedDeclarationCache(): Promise<DeclarationCache | null> {
  shared ??= loadPluginConverter().then((convert) =>
    convert ? new DeclarationCache(convert) : null
  );
  return shared;
}

type ChatOptions = Parameters<google.LLM['chat']>[0];
type GeminiLLMOptions = ConstructorParameters<typeof google.LLM>[0];
type CachedDeclarationsLLMClass = new (
  opts: GeminiLLMOptions,
  declarations: DeclarationCache
) => google.LLM;

let cachedDeclarationsLLMClass: CachedDeclarationsLLMClass | undefined;

/**
 * The subclass is built on first use, not at import. `extends google.LLM`
 * reads the plugin's class when the class statement runs; at module scope that
 * would happen for every importer of cartesia-cascade (most of the agent
 * graph), and a plugin without a usable LLM export would fail all of those
 * imports instead of only the cascade LLM that needs it.
 */
function cachedDeclarationsLLM(): CachedDeclarationsLLMClass {
  cachedDeclarationsLLMClass ??= class CachedDeclarationsLLM extends google.LLM {
    constructor(
      opts: GeminiLLMOptions,
      private readonly declarations: DeclarationCache
    ) {
      super(opts);
    }

    chat(opts: ChatOptions): google.LLMStream {
      const toolCtx = llm.toToolContext(opts.toolCtx);
      if (!toolCtx || Object.keys(toolCtx.functionTools).length === 0 || opts.geminiTools) {
        return super.chat(opts);
      }
      const functionDeclarations = this.declarations.declarationsFor(toolCtx);
      // With no tool context the plugin sends geminiTools as the request's only
      // tool entry: [{ functionDeclarations }], the same request it builds from a
      // tool context (pinned by gemini-declarations.test.ts). Its type leaves out
      // functionDeclarations because it expects them from the tool context.
      // Tool calls still run against the agent's own tool context; the stream's
      // copy is not used for that.
      return super.chat({
        ...opts,
        toolCtx: undefined,
        geminiTools: { functionDeclarations } as unknown as google.LLMTools,
      });
    }
  };
  return cachedDeclarationsLLMClass;
}

/** The plugin's Gemini LLM, sending cached function declarations. */
export function createCachedDeclarationsLLM(
  opts: GeminiLLMOptions,
  declarations: DeclarationCache
): google.LLM {
  const CachedDeclarationsLLM = cachedDeclarationsLLM();
  return new CachedDeclarationsLLM(opts, declarations);
}
