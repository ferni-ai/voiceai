/**
 * App State Tests
 * 
 * Tests for the centralized state management.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  appState,
  setConnectionState,
  setActivePersona,
  setSelectedPersona,
  setUserName,
  setMessage,
  setSpotifyState,
  setAudioState,
} from '../../../src/state/app.state.js';

describe('AppState', () => {
  beforeEach(() => {
    appState.reset();
  });

  describe('initial state', () => {
    it('should have disconnected connection state', () => {
      expect(appState.get('connection')).toBe('disconnected');
    });

    it('should have coach as default persona', () => {
      expect(appState.get('activePersona').role).toBe('coach');
    });

    it('should have idle audio state', () => {
      expect(appState.get('audio')).toBe('idle');
    });

    it('should have uninitialized spotify state', () => {
      expect(appState.get('spotify')).toBe('uninitialized');
    });

    it('should have a device ID', () => {
      expect(appState.get('deviceId')).toBeTruthy();
      expect(typeof appState.get('deviceId')).toBe('string');
    });
  });

  describe('getState', () => {
    it('should return immutable snapshot', () => {
      const state1 = appState.getState();
      const state2 = appState.getState();
      
      // Should be equal but different objects
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });
  });

  describe('set', () => {
    it('should update state', () => {
      appState.set('connection', 'connected');
      expect(appState.get('connection')).toBe('connected');
    });

    it('should not trigger update if value unchanged', () => {
      const callback = vi.fn();
      appState.subscribe('connection', callback);
      
      appState.set('connection', 'disconnected'); // Same as initial
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('subscribe', () => {
    it('should notify on state change', () => {
      const callback = vi.fn();
      appState.subscribe('connection', callback);
      
      appState.set('connection', 'connecting');
      
      expect(callback).toHaveBeenCalledWith('connecting', 'disconnected');
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = appState.subscribe('connection', callback);
      
      unsubscribe();
      appState.set('connection', 'connected');
      
      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple subscribers', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      appState.subscribe('connection', callback1);
      appState.subscribe('connection', callback2);
      
      appState.set('connection', 'connected');
      
      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update multiple values at once', () => {
      appState.update({
        connection: 'connected',
        audio: 'speaking',
      });
      
      expect(appState.get('connection')).toBe('connected');
      expect(appState.get('audio')).toBe('speaking');
    });
  });

  describe('action helpers', () => {
    it('setConnectionState should update connection', () => {
      setConnectionState('reconnecting');
      expect(appState.get('connection')).toBe('reconnecting');
    });

    it('setActivePersona should update activePersona', () => {
      setActivePersona('peter-john');
      expect(appState.get('activePersona').id).toBe('peter-john');
    });

    it('setSelectedPersona should update both selected and active', () => {
      setSelectedPersona('maya-santos');
      expect(appState.get('selectedPersona').id).toBe('maya-santos');
      expect(appState.get('activePersona').id).toBe('maya-santos');
    });

    it('setUserName should update userName', () => {
      setUserName('Test User');
      expect(appState.get('userName')).toBe('Test User');
    });

    it('setMessage should update currentMessage', () => {
      setMessage('Hello World');
      expect(appState.get('currentMessage')).toBe('Hello World');
    });

    it('setSpotifyState should update spotify', () => {
      setSpotifyState('playing');
      expect(appState.get('spotify')).toBe('playing');
    });

    it('setAudioState should update audio', () => {
      setAudioState('listening');
      expect(appState.get('audio')).toBe('listening');
    });
  });

  describe('persistence', () => {
    it('should persist userName to localStorage', () => {
      setUserName('Persisted User');
      expect(localStorage.getItem('voiceai_userName')).toBe('Persisted User');
    });

    it('should persist deviceId to localStorage', () => {
      const deviceId = appState.get('deviceId');
      expect(localStorage.getItem('voiceai_deviceId')).toBe(deviceId);
    });

    it('should persist selectedPersona to localStorage', () => {
      setSelectedPersona('peter-john');
      expect(localStorage.getItem('voiceai_selectedPersona')).toBe('peter-john');
    });
  });

  describe('reset', () => {
    it('should reset state to initial values', () => {
      // Modify state
      appState.set('connection', 'connected');
      appState.set('audio', 'speaking');
      
      // Reset
      appState.reset();
      
      // Should be back to initial
      expect(appState.get('connection')).toBe('disconnected');
      expect(appState.get('audio')).toBe('idle');
    });
  });
});

