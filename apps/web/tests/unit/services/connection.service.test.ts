/**
 * Connection Service Tests
 *
 * Comprehensive unit tests for LiveKit connection management.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { ConnectionCallbacks } from '../../../src/services/connection.service.js';
import type { ConnectionState } from '../../../src/types/events.js';
import type { TokenResponse } from '../../../src/types/livekit.js';

// Mock dependencies
vi.mock('../../../src/state/app.state.js', () => {
  const mockState = {
    userName: 'Test User',
    deviceId: 'test-device-123',
    selectedPersona: {
      id: 'ferni',
      name: 'Ferni',
      voice: 'alloy',
    },
  };

  return {
    appState: {
      getState: vi.fn(() => mockState),
      get: vi.fn((key: string) => mockState[key as keyof typeof mockState]),
    },
    setConnectionState: vi.fn(),
    updateAuthState: vi.fn(),
  };
});

vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../../../src/utils/platform.js', () => ({
  lockToPortrait: vi.fn(),
  unlockOrientation: vi.fn(),
  isNative: vi.fn(() => false),
}));

// Mock LiveKit Room
const createMockRoom = () => ({
  state: 'disconnected',
  name: '',
  localParticipant: {
    identity: 'test-user',
    setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    getTrackPublications: vi.fn(() => []),
    publishData: vi.fn().mockResolvedValue(undefined),
  },
  remoteParticipants: new Map(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(function(this: ReturnType<typeof createMockRoom>) { return this; }),
  off: vi.fn(function(this: ReturnType<typeof createMockRoom>) { return this; }),
});

// Mock window.LiveKit
const mockLiveKit = {
  Room: vi.fn(() => createMockRoom()),
  RoomEvent: {
    Connected: 'connected',
    Disconnected: 'disconnected',
    ConnectionStateChanged: 'connectionStateChanged',
    TrackSubscribed: 'trackSubscribed',
    DataReceived: 'dataReceived',
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
  },
  Track: { Kind: { Audio: 'audio', Video: 'video' } },
};

describe('ConnectionService', () => {
  let connectionService: any;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockRoom: ReturnType<typeof createMockRoom>;

  beforeEach(async () => {
    // Reset modules to get fresh singleton
    vi.resetModules();

    // Set up window.LiveKit
    (globalThis as any).window = {
      LiveKit: mockLiveKit,
      setInterval: vi.fn(globalThis.setInterval),
      clearInterval: vi.fn(globalThis.clearInterval),
    };

    // Mock fetch for token requests
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    // Reset mocked room
    mockRoom = createMockRoom();
    mockLiveKit.Room = vi.fn(() => mockRoom);

    // Import service fresh
    const module = await import('../../../src/services/connection.service.js');
    connectionService = module.connectionService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connect()', () => {
    it('should successfully connect to LiveKit room', async () => {
      // Mock token response
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      // Connect
      const result = await connectionService.connect();

      // Verify success
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();
      expect(mockRoom.connect).toHaveBeenCalledWith(
        mockTokenResponse.url,
        mockTokenResponse.token,
        { autoSubscribe: true }
      );
      expect(mockRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    });

    it('should handle token fetch failure', async () => {
      // Mock fetch failure
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Connect should fail
      const result = await connectionService.connect();

      expect(result).toBe(false);
      expect(mockRoom.connect).not.toHaveBeenCalled();
    });

    it('should handle invalid token response', async () => {
      // Mock invalid response (missing fields)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ token: 'test' }), // Missing url, room, username
      });

      const result = await connectionService.connect();

      expect(result).toBe(false);
      expect(mockRoom.connect).not.toHaveBeenCalled();
    });

    it('should handle room connection failure', async () => {
      // Mock successful token, failed room connection
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      mockRoom.connect.mockRejectedValueOnce(new Error('Connection failed'));

      const result = await connectionService.connect();

      expect(result).toBe(false);
      expect(mockRoom.connect).toHaveBeenCalled();
    });

    it('should fail on network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await connectionService.connect();

      expect(result).toBe(false);
    });

    it('should not retry on 4xx client errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('Bad Request'),
      });

      const result = await connectionService.connect();

      expect(result).toBe(false);
      expect(mockFetch).toHaveBeenCalledOnce(); // No retry
    });

    it('should fail on 5xx server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue('Server Error'),
      });

      const result = await connectionService.connect();

      expect(result).toBe(false);
    });

    it('should skip already connected rooms', async () => {
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      // First connection
      await connectionService.connect();
      mockRoom.state = 'connected';

      // Second connection attempt should skip
      const result = await connectionService.connect();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce(); // Only first call
    });
  });

  describe('disconnect()', () => {
    it('should cleanly disconnect from room', async () => {
      // First connect
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      await connectionService.connect();

      // Now disconnect
      await connectionService.disconnect();

      expect(mockRoom.disconnect).toHaveBeenCalled();
      expect(connectionService.isConnected()).toBe(false);
    });

    it('should handle disconnect when not connected', async () => {
      // Disconnect without connecting first
      await expect(connectionService.disconnect()).resolves.not.toThrow();
    });

    it('should clean up audio elements on disconnect', async () => {
      // Connect first
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      await connectionService.connect();

      // Mock document.body
      const mockAudioElement = {
        pause: vi.fn(),
        remove: vi.fn(),
        load: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        setAttribute: vi.fn(),
        style: {
          display: '',
          position: '',
          left: '',
        },
        autoplay: false,
        muted: false,
        volume: 1.0,
      };

      (globalThis as any).document = {
        body: {
          appendChild: vi.fn(),
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      // Simulate audio track subscription
      const onTrackSubscribed = mockRoom.on.mock.calls.find(
        (call) => call[0] === 'trackSubscribed'
      )?.[1];

      if (onTrackSubscribed) {
        onTrackSubscribed(
          {
            kind: 'audio',
            attach: () => mockAudioElement,
            mediaStreamTrack: { id: 'track-123' } as MediaStreamTrack,
            sid: 'track-sid-123',
          },
          {},
          { identity: 'agent-1' }
        );
      }

      // Disconnect
      await connectionService.disconnect();

      expect(mockAudioElement.pause).toHaveBeenCalled();
      expect(mockAudioElement.remove).toHaveBeenCalled();
    });

    it('should stop quality monitoring on disconnect', async () => {
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      await connectionService.connect();

      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      await connectionService.disconnect();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('Connection state transitions', () => {
    it('should transition from disconnected to connecting to connected', async () => {
      const states: ConnectionState[] = [];

      connectionService.setCallbacks({
        onStateChange: (state: ConnectionState) => states.push(state),
      });

      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      await connectionService.connect();

      expect(states).toContain('connecting');
      expect(states).toContain('connected');
    });

    it('should transition to error state on connection failure', async () => {
      const states: ConnectionState[] = [];

      connectionService.setCallbacks({
        onStateChange: (state: ConnectionState) => states.push(state),
      });

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await connectionService.connect();

      expect(states).toContain('error');
    });

    it('should fire onConnectionStateChanged callback', async () => {
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      await connectionService.connect();

      // Get the connectionStateChanged handler
      const handler = mockRoom.on.mock.calls.find(
        (call) => call[0] === 'connectionStateChanged'
      )?.[1];

      const onStateChange = vi.fn();
      connectionService.setCallbacks({ onStateChange });

      // Trigger state change
      handler?.('reconnecting');

      expect(onStateChange).toHaveBeenCalledWith('reconnecting');
    });
  });

  describe('Callback registration and firing', () => {
    it('should fire onAgentConnected when participant joins', async () => {
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      const onAgentConnected = vi.fn();
      connectionService.setCallbacks({ onAgentConnected });

      await connectionService.connect();

      // Get the participantConnected handler
      const handler = mockRoom.on.mock.calls.find(
        (call) => call[0] === 'participantConnected'
      )?.[1];

      // Trigger participant connected
      handler?.({ identity: 'agent-123', isLocal: false });

      expect(onAgentConnected).toHaveBeenCalledWith('agent-123');
    });

    it('should fire onAgentDisconnected when participant leaves', async () => {
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      const onAgentDisconnected = vi.fn();
      connectionService.setCallbacks({ onAgentDisconnected });

      await connectionService.connect();

      const handler = mockRoom.on.mock.calls.find(
        (call) => call[0] === 'participantDisconnected'
      )?.[1];

      handler?.({ identity: 'agent-123', isLocal: false });

      expect(onAgentDisconnected).toHaveBeenCalled();
    });

    it('should fire onAudioTrack when audio track is subscribed', async () => {
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      const onAudioTrack = vi.fn();
      connectionService.setCallbacks({ onAudioTrack });

      await connectionService.connect();

      // Mock document for audio element
      (globalThis as any).document = {
        body: {
          appendChild: vi.fn(),
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      };

      const mockAudioElement = {
        setAttribute: vi.fn(),
        load: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        remove: vi.fn(),
        style: {
          display: '',
          position: '',
          left: '',
        },
        autoplay: false,
        muted: false,
        volume: 1.0,
      };

      const handler = mockRoom.on.mock.calls.find(
        (call) => call[0] === 'trackSubscribed'
      )?.[1];

      const mockTrack = {
        kind: 'audio',
        attach: () => mockAudioElement,
        mediaStreamTrack: { id: 'track-123' } as MediaStreamTrack,
        sid: 'track-sid-123',
      };

      handler?.(mockTrack, {}, { identity: 'agent-123' });

      expect(onAudioTrack).toHaveBeenCalled();
      expect(onAudioTrack.mock.calls[0][1]).toBe('agent-123'); // participant ID
    });

    it('should fire onDataMessage when data is received', async () => {
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      const onDataMessage = vi.fn();
      connectionService.setCallbacks({ onDataMessage });

      await connectionService.connect();

      const handler = mockRoom.on.mock.calls.find(
        (call) => call[0] === 'dataReceived'
      )?.[1];

      const message = { type: 'handoff', newAgent: 'peter-john' };
      const encoder = new TextEncoder();
      const payload = encoder.encode(JSON.stringify(message));

      handler?.(payload, {}, {});

      expect(onDataMessage).toHaveBeenCalledWith(message);
    });

    it('should fire onLocalMicActive when microphone is published', async () => {
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      const onLocalMicActive = vi.fn();
      connectionService.setCallbacks({ onLocalMicActive });

      await connectionService.connect();

      const handler = mockRoom.on.mock.calls.find(
        (call) => call[0] === 'localTrackPublished'
      )?.[1];

      handler?.({ kind: 'audio', track: {} }, {});

      expect(onLocalMicActive).toHaveBeenCalledWith(true);
    });

    it('should fire onError on connection failures', async () => {
      const onError = vi.fn();
      connectionService.setCallbacks({ onError });

      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      await connectionService.connect();

      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    });
  });

  describe('getRoomState()', () => {
    it('should return disconnected state when no room', () => {
      const state = connectionService.getRoomState();

      expect(state).toEqual({
        isConnected: false,
        roomName: null,
        localParticipantId: null,
        remoteParticipantCount: 0,
        hasActiveAudio: false,
      });
    });

    it('should return connected state with room info', async () => {
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      await connectionService.connect();

      mockRoom.state = 'connected';
      mockRoom.name = 'voice-12345';

      const state = connectionService.getRoomState();

      expect(state.isConnected).toBe(true);
      expect(state.roomName).toBe('voice-12345');
      expect(state.localParticipantId).toBe('test-user');
    });
  });

  describe('isConnected()', () => {
    it('should return false when disconnected', () => {
      expect(connectionService.isConnected()).toBe(false);
    });

    it('should return true when connected', async () => {
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      await connectionService.connect();
      mockRoom.state = 'connected';

      expect(connectionService.isConnected()).toBe(true);
    });
  });

  describe('Multiple connect/disconnect cycles', () => {
    it('should handle multiple connection cycles without leaks', async () => {
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      // Connect/disconnect 3 times
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue(mockTokenResponse),
        });

        mockRoom = createMockRoom();
        mockLiveKit.Room = vi.fn(() => mockRoom);

        await connectionService.connect();
        await connectionService.disconnect();
      }

      // Verify clean state
      expect(connectionService.isConnected()).toBe(false);
      expect(connectionService.getRoomState().isConnected).toBe(false);
    });

    it('should properly clean up event handlers on each cycle', async () => {
      const mockTokenResponse: TokenResponse = {
        token: 'test-token',
        url: 'wss://test.livekit.cloud',
        room: 'voice-12345',
        username: 'Test User',
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockTokenResponse),
      });

      // First cycle
      await connectionService.connect();
      const firstOnCallCount = mockRoom.on.mock.calls.length;
      await connectionService.disconnect();
      const firstOffCallCount = mockRoom.off.mock.calls.length;

      // Second cycle
      mockRoom = createMockRoom();
      mockLiveKit.Room = vi.fn(() => mockRoom);

      await connectionService.connect();
      const secondOnCallCount = mockRoom.on.mock.calls.length;
      await connectionService.disconnect();
      const secondOffCallCount = mockRoom.off.mock.calls.length;

      // Both cycles should register same number of handlers
      expect(secondOnCallCount).toBe(firstOnCallCount);
      expect(secondOffCallCount).toBe(firstOffCallCount);
    });
  });

  // Note: getLocalAudioTrack() was removed from the service
});
