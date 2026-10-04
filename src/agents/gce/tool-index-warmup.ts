/**
 * Background warmup of the tool retrieval index, started by warmupResources.
 *
 * @module agents/gce/tool-index-warmup
 */
import type { LogFn } from './warmup.js';

/**
 * Tool retrieval index (TOOL_RETRIEVAL shadow or live, see toolRetrievalMode):
 * load it from the machine's disk cache, or build it (~25 s on a machine's
 * first boot) so the first call does not wait. Not awaited: warm-up keeps its
 * time budget.
 */
export function startToolIndexWarmup(log: LogFn): void {
  void import('../../tools/retrieval/turn-tool-retrieval.js')
    .then(async ({ toolRetrievalMode }) => {
      if (toolRetrievalMode() === 'off') return;
      const { createVertexEmbedder, getSharedToolIndex } =
        await import('../../tools/retrieval/dense-index.js');
      await getSharedToolIndex(createVertexEmbedder());
    })
    .catch((e: unknown) => log('⚠️ Tool index warm-up failed', { error: String(e) }));
}
