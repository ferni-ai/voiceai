/**
 * The knowledge graph (Spanner knowledge_graph) is prod's. A process on a
 * non-prod Firestore database (the dev agent, PR previews) skips writing to it
 * unless GRAPH_WRITES_ON_DEV_DB is on, rather than mixing dev facts into real
 * people's graphs.
 *
 * @module memory/spanner-graph/graph-write-gate
 */
import { flagOn } from '../../config/env-flag.js';
import { skipOnNonProdDatabase } from '../../config/environment.js';

/** True when this graph write must be skipped here. */
export function graphWriteSkipped(op: string): boolean {
  return !flagOn('GRAPH_WRITES_ON_DEV_DB') && skipOnNonProdDatabase(`graph write ${op}`);
}
