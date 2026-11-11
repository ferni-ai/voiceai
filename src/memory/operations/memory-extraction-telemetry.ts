/**
 * Deep-extraction telemetry counters (Memory SOTA audit item 10).
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

let extractionItemsDropped = 0;
let vectorPersistWarnings = 0;
const factsRefused = new Map<string, number>();

/** Malformed deep-extraction items dropped before Firestore write. */
export function recordExtractionDrop(count: number): void {
  if (count <= 0) return;
  extractionItemsDropped += count;
  log.debug(
    { count, totalDropped: extractionItemsDropped },
    '🧠 [MEMORY-AUDIT] extraction_items_dropped'
  );
}

/** Non-blocking vector persist failure during deep extraction. */
export function recordVectorPersistWarn(): void {
  vectorPersistWarnings++;
  log.debug({ total: vectorPersistWarnings }, '🧠 [MEMORY-AUDIT] vector_persist_warn');
}

/** A fact the memory writer refused: about Ferni or a teammate, or for an erased person. */
export function recordFactRefused(reason: 'persona' | 'erased', source: string): void {
  const total = (factsRefused.get(reason) ?? 0) + 1;
  factsRefused.set(reason, total);
  log.info({ reason, source, total }, '🧠 [MEMORY-AUDIT] fact_refused');
}

export const getFactRefusedCount = (reason: 'persona' | 'erased'): number =>
  factsRefused.get(reason) ?? 0;

export function getExtractionDropCount(): number {
  return extractionItemsDropped;
}

export function getVectorPersistWarnCount(): number {
  return vectorPersistWarnings;
}

/** Reset counters (tests). */
export function resetMemoryExtractionTelemetry(): void {
  extractionItemsDropped = 0;
  vectorPersistWarnings = 0;
  factsRefused.clear();
}
