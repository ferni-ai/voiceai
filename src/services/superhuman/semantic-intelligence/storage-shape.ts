/**
 * What semantic-intelligence documents look like in Firestore.
 *
 * Correlations and emotional arcs carried every observation's embedding: two
 * per correlation (domainA/domainB) and one per arc waypoint (up to 50). Nothing
 * reads those back (similarity uses the in-memory observation buffer, arc
 * matching uses `themeEmbedding`), but every turn re-encoded them: up to 50
 * correlations x 2 embeddings, and a whole arc's waypoints. On dev (2026-10-12,
 * returning caller) saveCorrelations and saveArc blocked the event loop for
 * 415-793 ms at a time, mostly while Ferni was speaking, which the caller hears
 * as his voice hanging.
 *
 * The stored copies leave those embeddings out; the in-memory objects keep them.
 *
 * @module services/superhuman/semantic-intelligence/storage-shape
 */
import type { EmotionalArc, SemanticCorrelation } from './types.js';

/** The correlation as stored: its two domains without their embeddings. */
export function correlationForStorage(c: SemanticCorrelation): SemanticCorrelation {
  const { embedding: _a, ...domainA } = c.domainA;
  const { embedding: _b, ...domainB } = c.domainB;
  return { ...c, domainA, domainB };
}

/** The arc as stored: waypoints without their embeddings (themeEmbedding stays). */
export function arcForStorage(arc: EmotionalArc): EmotionalArc {
  return {
    ...arc,
    waypoints: arc.waypoints.map(({ embedding: _e, ...waypoint }) => waypoint),
  };
}
