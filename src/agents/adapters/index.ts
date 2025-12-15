/**
 * Agent Adapters
 *
 * Clean interfaces for external dependencies (LiveKit, Cartesia, etc.)
 * These adapters isolate the agent from SDK changes and enable testing.
 *
 * @module agents/adapters
 */

// LiveKit Room Adapter
export {
  LiveKitRoomAdapter,
  MockRoomAdapter,
  connectToRoom,
  createLiveKitAdapter,
} from './livekit.js';

// Cartesia TTS Adapter
export {
  CartesiaTTSAdapter,
  MockTTSAdapter,
  createLocalizedTTSAdapter,
  createTTSAdapter,
  warmTTSConnection,
  type CartesiaTTSConfig,
} from './cartesia.js';
