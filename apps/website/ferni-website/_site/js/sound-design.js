/**
 * Sound Design System
 * Subtle, tasteful ambient sounds that enhance interactions
 * 
 * Philosophy: Sound should enhance, never distract.
 * Default is muted - user must opt-in.
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    defaultVolume: 0.3,
    fadeInDuration: 0.1,
    fadeOutDuration: 0.2,
    soundEnabled: false,       // Default: sounds OFF
    preloadSounds: false,      // Don't preload by default
    debugMode: false
  };

  // ============================================================================
  // SOUND DEFINITIONS - Using Web Audio API synthesis
  // We synthesize sounds rather than loading files for smaller bundle
  // ============================================================================
  
  const SOUND_TYPES = {
    // UI Feedback
    click: {
      type: 'click',
      frequency: 440,
      duration: 0.08,
      volume: 0.15
    },
    hover: {
      type: 'hover',
      frequency: 880,
      duration: 0.05,
      volume: 0.08
    },
    success: {
      type: 'success',
      notes: [523, 659, 784],  // C5, E5, G5 chord
      duration: 0.15,
      volume: 0.2
    },
    send: {
      type: 'send',
      frequency: 660,
      duration: 0.1,
      volume: 0.15
    },
    receive: {
      type: 'receive',
      notes: [440, 523],      // A4 to C5
      duration: 0.2,
      volume: 0.15
    },
    
    // Ambient
    ambientPulse: {
      type: 'ambient',
      frequency: 220,
      duration: 2,
      volume: 0.05
    }
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    audioContext: null,
    masterGain: null,
    enabled: CONFIG.soundEnabled,
    initialized: false,
    unlocked: false  // Audio needs user interaction to unlock
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    // Check for Web Audio API support
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      logDebug('Web Audio API not supported');
      return;
    }
    
    // Create audio context (but don't start it - needs user gesture)
    state.audioContext = new AudioContext();
    
    // Create master gain node
    state.masterGain = state.audioContext.createGain();
    state.masterGain.gain.value = CONFIG.defaultVolume;
    state.masterGain.connect(state.audioContext.destination);
    
    // Set up unlock listener
    setupUnlock();
    
    // Check for saved preference
    const savedPreference = localStorage.getItem('ferni_sound_enabled');
    if (savedPreference !== null) {
      state.enabled = savedPreference === 'true';
    }
    
    // Set up event listeners for automatic sounds
    setupEventListeners();
    
    state.initialized = true;
    logDebug('Sound Design initialized (enabled:', state.enabled, ')');
  }

  // ============================================================================
  // UNLOCK - Audio context needs user interaction
  // ============================================================================
  
  function setupUnlock() {
    const unlock = async () => {
      if (state.unlocked) return;
      
      try {
        if (state.audioContext.state === 'suspended') {
          await state.audioContext.resume();
        }
        state.unlocked = true;
        logDebug('Audio context unlocked');
        
        // Remove listeners
        document.removeEventListener('click', unlock);
        document.removeEventListener('touchstart', unlock);
        document.removeEventListener('keydown', unlock);
      } catch (e) {
        logDebug('Failed to unlock audio context', e);
      }
    };
    
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('touchstart', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
  }

  // ============================================================================
  // SOUND SYNTHESIS
  // ============================================================================
  
  function playSound(soundType) {
    if (!state.enabled || !state.unlocked || !state.audioContext) return;
    
    const sound = SOUND_TYPES[soundType];
    if (!sound) {
      logDebug('Unknown sound type:', soundType);
      return;
    }
    
    try {
      if (sound.notes) {
        // Multi-note sound (chord or sequence)
        sound.notes.forEach((freq, index) => {
          setTimeout(() => {
            synthesizeTone(freq, sound.duration, sound.volume);
          }, index * 50);
        });
      } else {
        // Single tone
        synthesizeTone(sound.frequency, sound.duration, sound.volume);
      }
    } catch (e) {
      logDebug('Error playing sound:', e);
    }
  }
  
  function synthesizeTone(frequency, duration, volume) {
    const ctx = state.audioContext;
    const now = ctx.currentTime;
    
    // Oscillator
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    
    // Gain envelope
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + CONFIG.fadeInDuration);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);
    
    // Connect
    oscillator.connect(gainNode);
    gainNode.connect(state.masterGain);
    
    // Play
    oscillator.start(now);
    oscillator.stop(now + duration + 0.1);
  }

  // ============================================================================
  // AUTO-PLAY SOUNDS ON EVENTS
  // ============================================================================
  
  function setupEventListeners() {
    // Click sounds on buttons
    document.addEventListener('click', (e) => {
      if (e.target.closest('button, .btn, a')) {
        playSound('click');
      }
    });
    
    // Hover sounds on important elements
    document.addEventListener('mouseenter', (e) => {
      if (e.target.closest('[data-sound-hover], .btn--primary')) {
        playSound('hover');
      }
    }, true);
    
    // Demo widget message sounds
    document.addEventListener('ferni:message-sent', () => {
      playSound('send');
    });
    
    document.addEventListener('ferni:message-received', () => {
      playSound('receive');
    });
    
    // Success sounds
    document.addEventListener('ferni:success', () => {
      playSound('success');
    });
  }

  // ============================================================================
  // CONTROL API
  // ============================================================================
  
  function enable() {
    state.enabled = true;
    localStorage.setItem('ferni_sound_enabled', 'true');
    logDebug('Sound enabled');
    
    // Play a confirmation sound
    if (state.unlocked) {
      playSound('success');
    }
  }
  
  function disable() {
    state.enabled = false;
    localStorage.setItem('ferni_sound_enabled', 'false');
    logDebug('Sound disabled');
  }
  
  function toggle() {
    if (state.enabled) {
      disable();
    } else {
      enable();
    }
    return state.enabled;
  }
  
  function setVolume(volume) {
    if (state.masterGain) {
      state.masterGain.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function logDebug(...args) {
    if (CONFIG.debugMode) {
      console.log('[SoundDesign]', ...args);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniSound = {
    init,
    play: playSound,
    enable,
    disable,
    toggle,
    isEnabled: () => state.enabled,
    setVolume,
    setDebug: (enabled) => { CONFIG.debugMode = enabled; }
  };

  // ============================================================================
  // AUTO-INIT
  // ============================================================================
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

