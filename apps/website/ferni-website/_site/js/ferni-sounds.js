/**
 * Ferni Sounds - On-Brand Audio Presence
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PHILOSOPHY: Sounds should feel like sitting with a wise friend.
 *
 * Ferni's brand is warm, grounded, human, present. Our sounds reflect this:
 * - Earthy, wooden textures (not metallic or electronic)
 * - Breath-like movements (not beeps or chimes)
 * - Low, warm frequencies (like a cozy room)
 * - Natural decay (like sound in a forest)
 *
 * These aren't UI sounds. They're moments of presence.
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
    masterVolume: 0.06, // Barely perceptible - felt more than heard
    mobileEnabled: false, // Off by default on mobile
    respectsReducedMotion: true,
  };

  // Respect user preferences
  if (
    CONFIG.respectsReducedMotion &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    CONFIG.enabled = false;
  }

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  if (isMobile && !CONFIG.mobileEnabled) {
    CONFIG.enabled = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIO CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════

  let audioContext = null;
  let isInitialized = false;

  function getAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  function initAudio() {
    if (isInitialized) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    isInitialized = true;
  }

  ['click', 'touchstart', 'keydown'].forEach((event) => {
    document.addEventListener(event, initAudio, { once: true, passive: true });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ORGANIC SOUND GENERATORS
  // Designed to feel natural, warm, and human
  // ═══════════════════════════════════════════════════════════════════════════

  const Sounds = {
    /**
     * Soft touch - like a hand resting on warm wood
     * A gentle, grounding moment of acknowledgment
     */
    touch() {
      if (!CONFIG.enabled) return;

      const ctx = getAudioContext();
      const t = ctx.currentTime;

      // Base: deep, warm resonance (like a wooden table)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, t); // Low A - grounding
      osc.frequency.exponentialRampToValueAtTime(65, t + 0.08); // Settle lower

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(200, t);
      filter.Q.setValueAtTime(1, t);

      // Natural decay like wood absorbing sound
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(CONFIG.masterVolume * 0.4, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      osc.start(t);
      osc.stop(t + 0.12);
    },

    /**
     * Breath - someone sitting down beside you
     * A soft exhale, presence arriving
     */
    breath() {
      if (!CONFIG.enabled) return;

      const ctx = getAudioContext();
      const t = ctx.currentTime;

      // Filtered noise for breath texture
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Pink-ish noise (warmer than white)
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.0990460;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(400, t);
      filter.Q.setValueAtTime(0.5, t);

      const gain = ctx.createGain();

      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      // Gentle swell and release like an exhale
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(CONFIG.masterVolume * 0.25, t + 0.04);
      gain.gain.linearRampToValueAtTime(CONFIG.masterVolume * 0.15, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

      source.start(t);
      source.stop(t + 0.15);
    },

    /**
     * Warmth - a moment of connection
     * Like sunlight touching your face through a window
     */
    warmth() {
      if (!CONFIG.enabled) return;

      const ctx = getAudioContext();
      const t = ctx.currentTime;

      // Layered warm tones (like a singing bowl, very gentle)
      const frequencies = [174, 261]; // F3 and C4 - warm interval

      frequencies.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 2, t);
        filter.Q.setValueAtTime(0.5, t);

        const startOffset = i * 0.02;
        const vol = CONFIG.masterVolume * (i === 0 ? 0.35 : 0.2);

        gain.gain.setValueAtTime(0, t + startOffset);
        gain.gain.linearRampToValueAtTime(vol, t + startOffset + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, t + startOffset + 0.25);

        osc.start(t + startOffset);
        osc.stop(t + startOffset + 0.25);
      });
    },

    /**
     * Settle - coming to rest
     * Like leaves settling after a gentle breeze
     */
    settle() {
      if (!CONFIG.enabled) return;

      const ctx = getAudioContext();
      const t = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.15);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, t);
      filter.frequency.exponentialRampToValueAtTime(100, t + 0.15);

      gain.gain.setValueAtTime(CONFIG.masterVolume * 0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

      osc.start(t);
      osc.stop(t + 0.15);
    },

    /**
     * Presence - Ferni is here
     * A deep, grounding tone like a Tibetan bowl from another room
     */
    presence() {
      if (!CONFIG.enabled) return;

      const ctx = getAudioContext();
      const t = ctx.currentTime;

      // Deep fundamental with gentle harmonics
      const fundamental = 82.4; // Low E - very grounding

      [1, 2, 3].forEach((harmonic, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(fundamental * harmonic, t);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(fundamental * harmonic * 1.5, t);

        // Higher harmonics quieter
        const vol = CONFIG.masterVolume * (0.4 / (i + 1));

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

        osc.start(t);
        osc.stop(t + 0.5);
      });
    },

    /**
     * Acknowledge - I hear you
     * A gentle wooden knock, like knuckles on oak
     */
    acknowledge() {
      if (!CONFIG.enabled) return;

      const ctx = getAudioContext();
      const t = ctx.currentTime;

      // Short, woody thud
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.04);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(180, t);

      gain.gain.setValueAtTime(CONFIG.masterVolume * 0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

      osc.start(t);
      osc.stop(t + 0.06);
    },
  };

  // Backwards compatibility aliases
  Sounds.tap = Sounds.touch;
  Sounds.hover = Sounds.breath;
  Sounds.success = Sounds.warmth;
  Sounds.whoosh = Sounds.settle;
  Sounds.thinking = Sounds.acknowledge;

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-ATTACH TO ELEMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  function attachSounds() {
    // Buttons get gentle touch on hover
    document.querySelectorAll('.btn, button').forEach((btn) => {
      btn.addEventListener('mouseenter', Sounds.touch, { passive: true });
    });

    // Cards get breath sound - someone noticing
    document.querySelectorAll('.team-card, .persona-card, .connect-option, .garden__card').forEach((card) => {
      card.addEventListener('mouseenter', Sounds.breath, { passive: true });
    });

    // Interactive panels get settle sound
    const demoTrigger = document.querySelector('.ferni-demo-trigger');
    if (demoTrigger) {
      demoTrigger.addEventListener('click', Sounds.settle, { passive: true });
    }

    // FAQ accordion gets acknowledge
    document.querySelectorAll('.faq-item summary, .faq-item__question').forEach((q) => {
      q.addEventListener('click', Sounds.acknowledge, { passive: true });
    });

    // Ferni awakening - full presence
    document.addEventListener('ferni:awakened', Sounds.presence);

    // Form success - warmth
    document.addEventListener('ferni:form-success', Sounds.warmth);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    attachSounds();

    // Expose for manual triggering
    window.FerniSounds = {
      play: Sounds,
      setEnabled: (enabled) => { CONFIG.enabled = enabled; },
      setVolume: (volume) => { CONFIG.masterVolume = Math.max(0, Math.min(0.15, volume)); },
      isEnabled: () => CONFIG.enabled,
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
