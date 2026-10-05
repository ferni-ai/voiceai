/**
 * Deep-extraction telemetry counters (Memory SOTA audit item 10).
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

let extractionItemsDropped = 0;
let vectorPersistWarnings = 0;

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
}
