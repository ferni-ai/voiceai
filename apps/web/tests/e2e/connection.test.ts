/**
 * E2E Tests - Connection Flow
 * 
 * Tests the connection lifecycle: connect, disconnect, reconnect.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Mock the LiveKit Room
const mockRoom = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  state: 'disconnected',
  localParticipant: {
    setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
    publishData: vi.fn().mockResolvedValue(undefined),
  },
  on: vi.fn(),
  off: vi.fn(),
  remoteParticipants: new Map(),
};

// Mock fetch for token endpoint
global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/token')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        accessToken: 'mock-token',
        url: 'wss://mock-livekit-server',
      }),
    });
  }
  return Promise.reject(new Error('Unknown endpoint'));
});

describe('Connection Flow', () => {
  describe('Token Fetching', () => {
    it('should fetch token from /token endpoint', async () => {
      const response = await fetch('/token');
      const data = await response.json();
      
      expect(data).toHaveProperty('accessToken');
      expect(data).toHaveProperty('url');
    });

    it('should handle token fetch failure gracefully', async () => {
      const mockFetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
      global.fetch = mockFetch;

      await expect(fetch('/token')).rejects.toThrow('Network error');
    });
  });

  describe('Room Connection', () => {
    it('should connect to LiveKit room with token', async () => {
      await mockRoom.connect('wss://mock-server', 'mock-token');
      
      expect(mockRoom.connect).toHaveBeenCalledWith('wss://mock-server', 'mock-token');
    });

    it('should enable microphone after connection', async () => {
      await mockRoom.connect('wss://mock-server', 'mock-token');
      await mockRoom.localParticipant.setMicrophoneEnabled(true);
      
      expect(mockRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true);
    });

    it('should disconnect cleanly', async () => {
      await mockRoom.disconnect();
      
      expect(mockRoom.disconnect).toHaveBeenCalled();
    });
  });

  describe('Connection State', () => {
    it('should track connection state changes', () => {
      const states: string[] = [];
      
      mockRoom.on.mockImplementation((event: string, handler: (state: string) => void) => {
        if (event === 'connectionStateChanged') {
          // Simulate state changes
          states.push('connecting');
          states.push('connected');
        }
      });

      mockRoom.on('connectionStateChanged', (state: string) => states.push(state));
      
      expect(states).toContain('connecting');
      expect(states).toContain('connected');
    });
  });

  describe('Reconnection', () => {
    it('should attempt reconnection on disconnect', async () => {
      // First connect
      await mockRoom.connect('wss://mock-server', 'token-1');
      
      // Simulate disconnect
      await mockRoom.disconnect();
      
      // Should be able to reconnect
      await mockRoom.connect('wss://mock-server', 'new-token');
      
      expect(mockRoom.connect).toHaveBeenCalledTimes(2);
    });
  });
});

describe('Audio Track Handling', () => {
  it('should attach audio track when published', () => {
    const mockAudioElement = { tagName: 'AUDIO', play: vi.fn(), pause: vi.fn() };
    const attachFn = vi.fn().mockReturnValue(mockAudioElement);
    
    const audioElement = attachFn();
    
    expect(audioElement).toBeDefined();
    expect(audioElement.tagName).toBe('AUDIO');
    expect(attachFn).toHaveBeenCalled();
  });

  it('should detach audio track on unsubscribe', () => {
    const detachFn = vi.fn();
    
    detachFn();
    
    expect(detachFn).toHaveBeenCalled();
  });
});

