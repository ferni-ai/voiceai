/**
 * Infrastructure Layer Index
 *
 * Implements the domain interfaces (ports) with concrete adapters.
 * Contains Firestore, in-memory, and other implementations.
 *
 * @module personality/infrastructure
 */

export {
  FirestorePersonalityRepository,
  getFirestorePersonalityRepository,
} from './firestore-personality-repository.js';

export { InMemoryPersonalityRepository } from './in-memory-personality-repository.js';

// Adapters
export {
  VoiceAnalyzerAdapter,
  getVoiceAnalyzerAdapter,
  EmotionDetectorAdapter,
  getEmotionDetectorAdapter,
} from './adapters/index.js';
