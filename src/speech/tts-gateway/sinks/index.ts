/**
 * Audio Sinks Module
 *
 * Exports audio sink implementations for different output targets.
 *
 * @module speech/tts-gateway/sinks
 */

export {
  LiveKitSessionSink,
  createSessionSink,
  type LiveKitSessionSinkConfig,
} from './livekit-session.js';

export {
  LiveKitTrackSink,
  createTrackSink,
  bufferToAudioFrames,
  type LiveKitTrackSinkConfig,
} from './livekit-track.js';
