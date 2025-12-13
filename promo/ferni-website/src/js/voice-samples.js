/**
 * Voice Samples - Hear Ferni Without Full Demo
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Provides pre-recorded or TTS audio samples showcasing Ferni's voice
 * responses to common questions.
 *
 * Features:
 * - Pre-recorded audio snippets for common topics
 * - TTS fallback for dynamic samples
 * - Inline audio players throughout the page
 * - Voice waveform visualization
 *
 * @module voice-samples
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  const CONFIG = {
    // TTS endpoint (optional - uses browser TTS as fallback)
    ttsEndpoint: null, // '/api/landing/tts'
    
    // Pre-recorded samples (mp3 files)
    samplesPath: '/audio/samples/',
    
    // Whether to enable the feature
    enabled: true,
    
    // Use browser TTS as fallback
    useBrowserTTS: true,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SAMPLE DATA
  // ═══════════════════════════════════════════════════════════════════════════

  const VOICE_SAMPLES = {
    'career-advice': {
      question: "I'm thinking about changing careers but I'm scared",
      response: "That fear makes sense. A career change is a big deal. What is it specifically that scares you—the uncertainty, leaving something familiar, or something else? Let's unpack that together.",
      duration: 12,
      persona: 'ferni',
    },
    'stress': {
      question: "I'm feeling really overwhelmed lately",
      response: "I hear you. Overwhelm is heavy. Before we try to fix anything, can you just tell me—what's weighing on you the most right now? Sometimes naming it helps.",
      duration: 11,
      persona: 'ferni',
    },
    'habits': {
      question: "How do I actually stick to a habit?",
      response: "Here's the secret: make it embarrassingly small. Want to exercise? Start with putting on your shoes. That's it. Once that's automatic, we build from there. What habit are you working on?",
      duration: 13,
      persona: 'maya',
    },
    'relationship': {
      question: "I don't know if this relationship is working",
      response: "That's a heavy thing to sit with. When you say it's not working—what does that look like day to day? And more importantly, what would 'working' feel like to you?",
      duration: 12,
      persona: 'ferni',
    },
    'decision': {
      question: "I have a big decision to make and I'm stuck",
      response: "Being stuck usually means something. Either we're scared of the wrong choice, or part of us already knows and isn't ready to admit it. What's the decision you're wrestling with?",
      duration: 13,
      persona: 'peter',
    },
    'sleep': {
      question: "It's 3am and I can't stop thinking",
      response: "I'm here. 3am thoughts hit different, don't they? You don't have to figure anything out right now. Just tell me what's keeping you up. Sometimes that's enough.",
      duration: 11,
      persona: 'ferni',
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════════

  const state = {
    currentlyPlaying: null,
    audioContext: null,
    synthesis: window.speechSynthesis,
    preferredVoice: null,
    initialized: false,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIO UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  function initAudioContext() {
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return state.audioContext;
  }

  function findBestVoice() {
    if (!state.synthesis) return null;

    const voices = state.synthesis.getVoices();
    
    // Prefer these voices for a warm, natural sound
    const preferred = [
      'Samantha', // macOS
      'Karen', // Australian English
      'Google US English', // Chrome
      'Microsoft Aria Online', // Windows
    ];

    for (const name of preferred) {
      const voice = voices.find(v => v.name.includes(name));
      if (voice) return voice;
    }

    // Fall back to any English voice
    return voices.find(v => v.lang.startsWith('en')) || voices[0];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TTS PLAYBACK
  // ═══════════════════════════════════════════════════════════════════════════

  async function playAudio(sampleId, buttonEl) {
    const sample = VOICE_SAMPLES[sampleId];
    if (!sample) return;

    // Stop any currently playing audio
    if (state.currentlyPlaying) {
      stopAudio();
    }

    // Update button state
    buttonEl.classList.add('is-playing');
    state.currentlyPlaying = { sampleId, button: buttonEl };

    // Try pre-recorded audio first
    const audioUrl = CONFIG.samplesPath + sampleId + '.mp3';
    
    try {
      const audio = new Audio(audioUrl);
      audio.addEventListener('ended', () => stopAudio());
      audio.addEventListener('error', () => {
        // Fall back to TTS
        playTTS(sample.response, buttonEl);
      });
      
      await audio.play();
    } catch {
      // Fall back to TTS
      playTTS(sample.response, buttonEl);
    }
  }

  function playTTS(text, buttonEl) {
    if (!state.synthesis || !CONFIG.useBrowserTTS) {
      stopAudio();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    
    if (state.preferredVoice) {
      utterance.voice = state.preferredVoice;
    }
    
    utterance.rate = 0.95; // Slightly slower for warmth
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.addEventListener('end', () => stopAudio());
    utterance.addEventListener('error', () => stopAudio());

    state.synthesis.speak(utterance);
  }

  function stopAudio() {
    if (state.synthesis) {
      state.synthesis.cancel();
    }

    if (state.currentlyPlaying?.button) {
      state.currentlyPlaying.button.classList.remove('is-playing');
    }

    state.currentlyPlaying = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UI COMPONENTS
  // ═══════════════════════════════════════════════════════════════════════════

  function createSamplePlayer(sampleId, options = {}) {
    const sample = VOICE_SAMPLES[sampleId];
    if (!sample) return null;

    const player = document.createElement('div');
    player.className = 'voice-sample';
    player.dataset.sampleId = sampleId;

    const personas = {
      ferni: { name: 'Ferni', color: '#4a6741', initials: 'FE' },
      maya: { name: 'Maya', color: '#a67a6a', initials: 'MY' },
      peter: { name: 'Peter', color: '#3a6b73', initials: 'PL' },
      alex: { name: 'Alex', color: '#5a6b8a', initials: 'AX' },
      jordan: { name: 'Jordan', color: '#c4856a', initials: 'JD' },
      nayan: { name: 'Nayan', color: '#b8956a', initials: 'NP' },
    };

    const persona = personas[sample.persona] || personas.ferni;

    player.innerHTML = `
      <div class="voice-sample__header">
        <div class="voice-sample__avatar" style="--persona-color: ${persona.color}">
          ${persona.initials}
        </div>
        <div class="voice-sample__info">
          <span class="voice-sample__persona">${persona.name}</span>
          <span class="voice-sample__topic">${options.topic || 'Sample Response'}</span>
        </div>
        <button class="voice-sample__play" aria-label="Play voice sample">
          <svg class="voice-sample__icon-play" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <svg class="voice-sample__icon-pause" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
        </button>
      </div>
      
      ${options.showQuestion ? `
        <div class="voice-sample__question">
          <span class="voice-sample__q-label">Q:</span>
          "${sample.question}"
        </div>
      ` : ''}
      
      <div class="voice-sample__waveform">
        ${Array(20).fill(0).map(() => '<div class="voice-sample__bar"></div>').join('')}
      </div>
      
      ${options.showTranscript ? `
        <div class="voice-sample__transcript">
          <span class="voice-sample__a-label">Response:</span>
          "${sample.response}"
        </div>
      ` : ''}
    `;

    // Bind play button
    const playBtn = player.querySelector('.voice-sample__play');
    playBtn.addEventListener('click', () => {
      if (state.currentlyPlaying?.sampleId === sampleId) {
        stopAudio();
      } else {
        playAudio(sampleId, player);
      }
    });

    return player;
  }

  function createInlinePlayButton(sampleId, label) {
    const sample = VOICE_SAMPLES[sampleId];
    if (!sample) return null;

    const btn = document.createElement('button');
    btn.className = 'voice-sample-inline';
    btn.dataset.sampleId = sampleId;
    btn.innerHTML = `
      <svg class="voice-sample-inline__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
      <span class="voice-sample-inline__label">${label}</span>
    `;

    btn.addEventListener('click', () => {
      if (state.currentlyPlaying?.sampleId === sampleId) {
        stopAudio();
      } else {
        playAudio(sampleId, btn);
      }
    });

    return btn;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-ENHANCEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  function enhanceFeatureSection() {
    // Add voice samples to relevant features
    const voiceFeature = document.querySelector('.feature:has(.feature__title:contains("Voice"))');
    if (voiceFeature) {
      const sample = createInlinePlayButton('stress', '🔊 Hear Ferni respond');
      voiceFeature.appendChild(sample);
    }
  }

  function addVoiceSamplesSection() {
    // Create a dedicated voice samples showcase
    const showcaseSection = document.querySelector('.use-cases, #use-cases');
    if (!showcaseSection) return;

    const voiceShowcase = document.createElement('div');
    voiceShowcase.className = 'voice-samples-showcase';
    voiceShowcase.innerHTML = `
      <div class="voice-samples-showcase__header">
        <h3 class="voice-samples-showcase__title">Hear how Ferni responds</h3>
        <p class="voice-samples-showcase__subtitle">No signup required—just listen</p>
      </div>
      <div class="voice-samples-showcase__grid"></div>
    `;

    const grid = voiceShowcase.querySelector('.voice-samples-showcase__grid');

    // Add sample players
    const samplesToShow = ['stress', 'habits', 'decision', 'sleep'];
    samplesToShow.forEach((sampleId) => {
      const player = createSamplePlayer(sampleId, {
        showQuestion: true,
        showTranscript: false,
        topic: VOICE_SAMPLES[sampleId].question.slice(0, 30) + '...',
      });
      if (player) grid.appendChild(player);
    });

    showcaseSection.parentNode.insertBefore(voiceShowcase, showcaseSection);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════════════

  function injectStyles() {
    if (document.getElementById('voice-samples-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'voice-samples-styles';
    styles.textContent = `
      /* ═══════════════════════════════════════════════════════════════════════════
         VOICE SAMPLE PLAYER
         ═══════════════════════════════════════════════════════════════════════════ */
      
      .voice-sample {
        background: white;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
        transition: box-shadow 0.3s ease;
      }
      
      .voice-sample:hover {
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
      }
      
      .voice-sample.is-playing {
        box-shadow: 0 8px 32px rgba(74, 103, 65, 0.2);
      }
      
      .voice-sample__header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .voice-sample__avatar {
        width: 44px;
        height: 44px;
        background: linear-gradient(135deg, var(--persona-color, #4a6741), color-mix(in srgb, var(--persona-color, #4a6741) 80%, black));
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 12px;
        font-weight: 700;
        flex-shrink: 0;
      }
      
      .voice-sample__info {
        flex: 1;
      }
      
      .voice-sample__persona {
        display: block;
        font-weight: 600;
        color: #2c2520;
        font-size: 15px;
      }
      
      .voice-sample__topic {
        display: block;
        font-size: 12px;
        color: #70605a;
      }
      
      .voice-sample__play {
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, #5a7751, #4a6741);
        border: none;
        border-radius: 50%;
        cursor: pointer;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      
      .voice-sample__play:hover {
        transform: scale(1.05);
        box-shadow: 0 4px 16px rgba(74, 103, 65, 0.3);
      }
      
      .voice-sample__icon-play,
      .voice-sample__icon-pause {
        width: 20px;
        height: 20px;
      }
      
      .voice-sample__icon-pause {
        display: none;
      }
      
      .voice-sample.is-playing .voice-sample__icon-play {
        display: none;
      }
      
      .voice-sample.is-playing .voice-sample__icon-pause {
        display: block;
      }
      
      /* Waveform */
      .voice-sample__waveform {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        height: 32px;
        margin: 16px 0;
        opacity: 0.3;
        transition: opacity 0.3s;
      }
      
      .voice-sample.is-playing .voice-sample__waveform {
        opacity: 1;
      }
      
      .voice-sample__bar {
        width: 3px;
        height: 8px;
        background: #4a6741;
        border-radius: 2px;
        transition: height 0.1s ease;
      }
      
      .voice-sample.is-playing .voice-sample__bar {
        animation: waveBar 0.6s ease-in-out infinite;
      }
      
      .voice-sample.is-playing .voice-sample__bar:nth-child(odd) {
        animation-delay: 0.1s;
      }
      
      .voice-sample.is-playing .voice-sample__bar:nth-child(3n) {
        animation-delay: 0.2s;
      }
      
      @keyframes waveBar {
        0%, 100% { height: 8px; }
        50% { height: 24px; }
      }
      
      /* Question */
      .voice-sample__question {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(44, 37, 32, 0.08);
        font-size: 14px;
        color: #2c2520;
        font-style: italic;
      }
      
      .voice-sample__q-label {
        font-weight: 600;
        font-style: normal;
        color: #70605a;
        margin-right: 4px;
      }
      
      /* Transcript */
      .voice-sample__transcript {
        margin-top: 12px;
        font-size: 13px;
        color: #70605a;
        line-height: 1.6;
      }
      
      .voice-sample__a-label {
        font-weight: 600;
        display: block;
        margin-bottom: 4px;
        color: #4a6741;
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         INLINE PLAY BUTTON
         ═══════════════════════════════════════════════════════════════════════════ */
      
      .voice-sample-inline {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: rgba(74, 103, 65, 0.1);
        border: 1px solid rgba(74, 103, 65, 0.2);
        border-radius: 20px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        color: #4a6741;
        transition: all 0.2s;
      }
      
      .voice-sample-inline:hover {
        background: rgba(74, 103, 65, 0.15);
        border-color: rgba(74, 103, 65, 0.3);
      }
      
      .voice-sample-inline.is-playing {
        background: #4a6741;
        color: white;
        border-color: #4a6741;
      }
      
      .voice-sample-inline__icon {
        width: 14px;
        height: 14px;
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         VOICE SAMPLES SHOWCASE
         ═══════════════════════════════════════════════════════════════════════════ */
      
      .voice-samples-showcase {
        padding: 60px 24px;
        background: linear-gradient(180deg, rgba(74, 103, 65, 0.05) 0%, transparent 100%);
      }
      
      .voice-samples-showcase__header {
        text-align: center;
        margin-bottom: 40px;
      }
      
      .voice-samples-showcase__title {
        font-size: 28px;
        font-weight: 700;
        color: #2c2520;
        margin: 0 0 8px;
      }
      
      .voice-samples-showcase__subtitle {
        font-size: 16px;
        color: #70605a;
        margin: 0;
      }
      
      .voice-samples-showcase__grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 20px;
        max-width: 1200px;
        margin: 0 auto;
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         RESPONSIVE
         ═══════════════════════════════════════════════════════════════════════════ */
      
      @media (max-width: 768px) {
        .voice-samples-showcase__grid {
          grid-template-columns: 1fr;
        }
        
        .voice-sample {
          padding: 16px;
        }
      }
      
      /* ═══════════════════════════════════════════════════════════════════════════
         REDUCED MOTION
         ═══════════════════════════════════════════════════════════════════════════ */
      
      @media (prefers-reduced-motion: reduce) {
        .voice-sample.is-playing .voice-sample__bar {
          animation: none;
          height: 16px;
        }
      }
    `;

    document.head.appendChild(styles);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  function init() {
    if (!CONFIG.enabled || state.initialized) return;

    injectStyles();

    // Find the best TTS voice
    if (state.synthesis) {
      state.preferredVoice = findBestVoice();
      
      // Voices may load asynchronously
      state.synthesis.addEventListener('voiceschanged', () => {
        state.preferredVoice = findBestVoice();
      });
    }

    // Add voice samples section
    addVoiceSamplesSection();

    // Enhance existing sections
    enhanceFeatureSection();

    state.initialized = true;

    console.log('%c🔊 Voice Samples initialized', 'color: #4a6741; font-weight: bold;');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════════════════════

  window.FerniVoiceSamples = {
    init,
    createPlayer: createSamplePlayer,
    createInlineButton: createInlinePlayButton,
    play: playAudio,
    stop: stopAudio,
    samples: VOICE_SAMPLES,
    state: () => ({ ...state }),
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 200);
  }
})();

