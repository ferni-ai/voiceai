/**
 * Transition Matrix Module
 *
 * Tracks and predicts tool sequence patterns from user sessions.
 *
 * @module tools/intelligence/transitions
 */

// Core matrix
export {
  TransitionMatrix,
  getTransitionMatrix,
  resetTransitionMatrix,
} from './transition-matrix.js';

// Learner
export {
  TransitionLearner,
  getTransitionLearner,
  resetTransitionLearner,
} from './transition-learner.js';

// Firestore sync
export {
  TransitionFirestoreSync,
  getTransitionSync,
  initializeTransitionSync,
  resetTransitionSync,
} from './firestore-sync.js';

// Types
export type {
  TimeOfDay,
  ToolTransition,
  ToolSequence,
  SequenceContext,
  TransitionPrediction,
  TransitionMatrixConfig,
  TransitionMatrixStats,
  FirestoreTransition,
  FirestoreSequence,
} from './types.js';

export { DEFAULT_TRANSITION_CONFIG, getTimeOfDay, getTransitionKey } from './types.js';
