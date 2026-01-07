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
  type TurnCaptureInput,
  type CaptureResult,
} from './knowledge-capture.js';

export {
  executeNaturalQuery,
  detectQueryType,
  type QueryType,
  type QueryOptions,
  type NaturalQueryResult,
} from './natural-language-query.js';
