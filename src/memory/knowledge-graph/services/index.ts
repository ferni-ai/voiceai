/**
 * Knowledge Graph Services
 *
 * @module memory/knowledge-graph/services
 */

export {
  captureTurn,
  captureBatch,
  initializeKnowledgeCapture,
  setKnowledgeCaptureEnabled,
  isKnowledgeCaptureReady,
  isEntityStorePersistenceReady,
  type TurnCaptureInput,
  type CaptureResult,
} from './knowledge-capture.js';

export { queueTurnCapture, drainTurnCaptures } from './knowledge-capture-batch.js';

export {
  executeNaturalQuery,
  detectQueryType,
  getUnifiedQueryEngine,
  type UnifiedQueryEngine,
  type QueryType,
  type QueryOptions,
  type NaturalQueryResult,
} from './natural-language-query.js';
