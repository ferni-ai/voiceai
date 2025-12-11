/**
 * Ferni Sounds - Subtle Audio Feedback
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PHILOSOPHY: Sound should be felt, not heard.
 *
 * All sounds are extremely subtle - more like haptic feedback for your ears.
 * We use the Web Audio API for precise timing and dynamic volume control.
 *
 * Sounds are:
 * - Very quiet (< 10% volume)
 * - Short (< 200ms)
 * - Warm, organic tones (not synthetic beeps)
 * - Respects user preferences (muted by default on mobile)
 *
 * @module ferni-sounds
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  const CONFIG = {
    enabled: true,
    masterVolume: 0.08, // Very quiet - should be barely perceptible
    mobileEnabled: false, // Off by default on mobile (battery + surprise)
    respectsReducedMotion: true,

    // Sound durations (ms)
    durations: {
      tap: 30,
      hover: 50,
      success: 120,
      whoosh: 80,
      presence: 200,
    },
  };

  // Check for reduced motion preference
  if (CONFIG.respectsReducedMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    CONFIG.enabled = false;
  }

  // Check for mobile
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile && !CONFIG.mobileEnabled) {
    CONFIG.enabled = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIO CONTEXT & UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  let audioContext = null;
  let isInitialized = false;

  function getAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  // Must be called after user interaction (browser policy)
  function initAudio() {
    if (isInitialized) return;

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    isInitialized = true;
  }

  // Initialize on first user interaction
  ['click', 'touchstart', 'keydown'].forEach((event) => {
    document.addEventListener(event, initAudio, { once: true, passive: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SOUND GENERATORS (Web Audio API synthesis)
  // ═══════════════════════════════════════════════════════════════════════════

  const Sounds = {
    /**
     * Soft tap - like touching a wooden surface
     * Used for: Button hovers, link hovers
     */
    tap() {
      if (!CONFIG.enabled) return;

      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Warm, low frequency - like a soft knock
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(180, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.03);

      // Quick fade out
      gainNode.gain.setValueAtTime(CONFIG.masterVolume * 0.5, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.03);
    },

    /**
     * Gentle hover - like a breath
     * Used for: Card hovers, interactive element focus
     */
    hover() {
      if (!CONFIG.enabled) return;

      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      oscillator.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Filtered noise-like sound
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(400, ctx.currentTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, ctx.currentTime);

      // Soft swell
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(CONFIG.masterVolume * 0.3, ctx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.05);
    },

    /**
     * Success chime - warm, pleasant confirmation
     * Used for: Form submission, successful actions
     */
    success() {
      if (!CONFIG.enabled) return;

      const ctx = getAudioContext();

      // Two-note chord (C and E) for warmth
      [261.63, 329.63].forEach((freq, i) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

        // Stagger the second note slightly
        const startTime = ctx.currentTime + i * 0.03;
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(CONFIG.masterVolume * 0.4, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.12);
      });
    },

    /**
     * Soft whoosh - movement sound
     * Used for: Panel slides, modal opens
     */
    whoosh() {
      if (!CONFIG.enabled) return;

      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      oscillator.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Sweep down in frequency
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(600, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.08);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2000, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.08);

      gainNode.gain.setValueAtTime(CONFIG.masterVolume * 0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.08);
    },

    /**
     * Presence pulse - Ferni is here
     * Used for: Ferni awakening, connection moment
     */
    presence() {
      if (!CONFIG.enabled) return;

      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      oscillator.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Warm, resonant tone
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(220, ctx.currentTime); // A3

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, ctx.currentTime);

      // Gentle swell and fade
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(CONFIG.masterVolume * 0.5, ctx.currentTime + 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.2);
    },

    /**
     * Thinking pulse - subtle "processing" indication
     * Used for: When demo widget is processing
     */
    thinking() {
      if (!CONFIG.enabled) return;

      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, ctx.currentTime);
      oscillator.frequency.setValueAtTime(493.88, ctx.currentTime + 0.05); // A to B

      gainNode.gain.setValueAtTime(CONFIG.masterVolume * 0.2, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.1);
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-ATTACH TO ELEMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  function attachSounds() {
    // Buttons get tap sound on hover
    document.querySelectorAll('.btn, button').forEach((btn) => {
      btn.addEventListener('mouseenter', Sounds.tap, { passive: true });
    });

    // Cards get hover sound
    document.querySelectorAll('.team-card, .persona-card, .pricing-card').forEach((card) => {
      card.addEventListener('mouseenter', Sounds.hover, { passive: true });
    });

    // Demo widget gets special sounds
    const demoTrigger = document.querySelector('.ferni-demo-trigger');
    if (demoTrigger) {
      demoTrigger.addEventListener('click', Sounds.whoosh, { passive: true });
    }

    // FAQ accordion
    document.querySelectorAll('.faq-item__question').forEach((q) => {
      q.addEventListener('click', Sounds.tap, { passive: true });
    });

    // Ferni awakening event
    document.addEventListener('ferni:awakened', Sounds.presence);

    // Form success
    document.addEventListener('ferni:form-success', Sounds.success);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    attachSounds();

    // Expose for manual triggering and debugging
    window.FerniSounds = {
      play: Sounds,
      setEnabled: (enabled) => {
        CONFIG.enabled = enabled;
      },
      setVolume: (volume) => {
        CONFIG.masterVolume = Math.max(0, Math.min(1, volume));
      },
      isEnabled: () => CONFIG.enabled,
    };

    if (CONFIG.enabled) {
      console.log('%c🔊 Ferni Sounds loaded (subtle audio feedback)', 'color: #4a6741; font-weight: bold;');
    } else {
      console.log('%c🔇 Ferni Sounds loaded (disabled)', 'color: #756a5e;');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
