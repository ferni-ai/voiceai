/**
 * Voice Demo - Live Voice Interaction with Ferni
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Allows users to speak to Ferni and hear a real AI response.
 * Uses Web Speech API for recognition and TTS for response.
 *
 * @module voice-demo
 */

(function () {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const CONFIG = {
    apiEndpoint: '/api/landing/voice-demo',
    maxRecordingTime: 30000, // 30 seconds max
    silenceTimeout: 2000, // 2 seconds of silence to auto-stop
    useBrowserTTS: true, // Use browser TTS as fallback
    enableWaveform: true,
  };

  // ============================================================================
  // STATE
  // ============================================================================

  const state = {
    isListening: false,
    isProcessing: false,
    isSpeaking: false,
    recognition: null,
    transcript: '',
    audioContext: null,
    analyser: null,
    mediaStream: null,
    animationFrame: null,
    sessionId: null,
  };

  // ============================================================================
  // DOM ELEMENTS
  // ============================================================================

  let elements = {
    container: null,
    trigger: null,
    panel: null,
    waveform: null,
    status: null,
    transcript: null,
    response: null,
    insights: null,
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function init() {
    // Generate session ID
    state.sessionId =
      'vd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

    // Check for Speech Recognition support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[VoiceDemo] Speech Recognition not supported');
      return;
    }

    // Create the UI
    createUI();

    // Setup speech recognition
    setupSpeechRecognition();

    // Setup audio context for waveform
    if (CONFIG.enableWaveform) {
      setupAudioContext();
    }

    console.log('%c🎤 Voice Demo initialized', 'color: #4a6741; font-weight: bold;');
  }

  // ============================================================================
  // UI CREATION
  // ============================================================================

  function createUI() {
    // Find the memory demo section
    const memoryDemo = document.querySelector('.memory-demo');
    if (!memoryDemo) return;

    // Create container
    elements.container = document.createElement('div');
    elements.container.className = 'voice-demo';
    elements.container.innerHTML = `
      <button class="voice-demo__trigger" aria-label="Try talking to Ferni">
        <span class="voice-demo__trigger-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" x2="12" y1="19" y2="22"/>
          </svg>
        </span>
        <span class="voice-demo__trigger-text">Tell me what's on your mind</span>
        <span class="voice-demo__trigger-hint">Try it live</span>
      </button>

      <div class="voice-demo__panel" aria-hidden="true">
        <div class="voice-demo__panel-inner">
          <button class="voice-demo__close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>

          <div class="voice-demo__avatar">
            <div class="voice-demo__avatar-orb">FE</div>
            <div class="voice-demo__avatar-ring"></div>
          </div>

          <div class="voice-demo__status">
            <span class="voice-demo__status-text">Click the mic to start</span>
          </div>

          <div class="voice-demo__waveform">
            <canvas class="voice-demo__waveform-canvas" width="300" height="60"></canvas>
          </div>

          <div class="voice-demo__transcript" aria-live="polite"></div>

          <button class="voice-demo__mic" aria-label="Start listening">
            <svg class="voice-demo__mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" x2="12" y1="19" y2="22"/>
            </svg>
            <svg class="voice-demo__stop-icon" viewBox="0 0 24 24" fill="currentColor" width="28" height="28" style="display: none;">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          </button>

          <div class="voice-demo__response">
            <div class="voice-demo__response-card">
              <div class="voice-demo__response-header">
                <span class="voice-demo__response-avatar">FE</span>
                <span>Ferni</span>
              </div>
              <p class="voice-demo__response-text"></p>
            </div>
          </div>

          <div class="voice-demo__insights">
            <h4 class="voice-demo__insights-title">What I noticed:</h4>
            <div class="voice-demo__insights-list"></div>
          </div>
        </div>
      </div>
    `;

    // Insert after memory demo showcase
    const showcase = memoryDemo.querySelector('.memory-demo__showcase');
    if (showcase) {
      showcase.after(elements.container);
    } else {
      memoryDemo.appendChild(elements.container);
    }

    // Cache element references
    elements.trigger = elements.container.querySelector('.voice-demo__trigger');
    elements.panel = elements.container.querySelector('.voice-demo__panel');
    elements.waveform = elements.container.querySelector('.voice-demo__waveform-canvas');
    elements.status = elements.container.querySelector('.voice-demo__status-text');
    elements.transcript = elements.container.querySelector('.voice-demo__transcript');
    elements.response = elements.container.querySelector('.voice-demo__response');
    elements.insights = elements.container.querySelector('.voice-demo__insights');

    // Bind events
    bindEvents();

    // Inject styles
    injectStyles();
  }

  function bindEvents() {
    // Trigger button opens panel
    elements.trigger.addEventListener('click', openPanel);

    // Close button
    elements.container.querySelector('.voice-demo__close').addEventListener('click', closePanel);

    // Mic button
    elements.container.querySelector('.voice-demo__mic').addEventListener('click', toggleListening);

    // Click outside to close
    elements.panel.addEventListener('click', (e) => {
      if (e.target === elements.panel) {
        closePanel();
      }
    });

    // Escape to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.panel.classList.contains('is-open')) {
        closePanel();
      }
    });
  }

  // ============================================================================
  // PANEL MANAGEMENT
  // ============================================================================

  function openPanel() {
    elements.panel.classList.add('is-open');
    elements.panel.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Track analytics
    if (window.gtag) {
      window.gtag('event', 'voice_demo_open', { event_category: 'engagement' });
    }
  }

  function closePanel() {
    // Stop any active recording
    if (state.isListening) {
      stopListening();
    }

    // Stop any speech
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    elements.panel.classList.remove('is-open');
    elements.panel.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    // Reset state
    resetUI();
  }

  function resetUI() {
    elements.transcript.textContent = '';
    elements.response.classList.remove('is-visible');
    elements.insights.classList.remove('is-visible');
    updateStatus('Click the mic to start');
  }

  // ============================================================================
  // SPEECH RECOGNITION
  // ============================================================================

  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    state.recognition = new SpeechRecognition();
    state.recognition.continuous = true;
    state.recognition.interimResults = true;
    state.recognition.lang = 'en-US';

    state.recognition.onstart = () => {
      state.isListening = true;
      updateUIForListening(true);
      updateStatus('Listening...');
    };

    state.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      state.transcript = finalTranscript || interimTranscript;
      elements.transcript.textContent = `"${state.transcript}"`;
    };

    state.recognition.onerror = (event) => {
      console.warn('[VoiceDemo] Recognition error:', event.error);
      if (event.error === 'no-speech') {
        updateStatus('No speech detected. Try again.');
      } else if (event.error === 'not-allowed') {
        updateStatus('Microphone access denied. Please allow microphone access.');
      } else {
        updateStatus('Error occurred. Try again.');
      }
      stopListening();
    };

    state.recognition.onend = () => {
      if (state.isListening) {
        // Auto-stopped, process the result
        processTranscript();
      }
    };
  }

  function toggleListening() {
    if (state.isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  function startListening() {
    if (state.isProcessing || state.isSpeaking) return;

    state.transcript = '';
    elements.transcript.textContent = '';
    elements.response.classList.remove('is-visible');
    elements.insights.classList.remove('is-visible');

    try {
      state.recognition.start();
      startWaveformAnimation();
    } catch (error) {
      console.error('[VoiceDemo] Failed to start recognition:', error);
      updateStatus('Failed to start. Please try again.');
    }
  }

  function stopListening() {
    state.isListening = false;
    updateUIForListening(false);
    stopWaveformAnimation();

    try {
      state.recognition.stop();
    } catch (error) {
      // Ignore if already stopped
    }
  }

  function updateUIForListening(isListening) {
    const mic = elements.container.querySelector('.voice-demo__mic');
    const micIcon = elements.container.querySelector('.voice-demo__mic-icon');
    const stopIcon = elements.container.querySelector('.voice-demo__stop-icon');
    const avatar = elements.container.querySelector('.voice-demo__avatar');

    if (isListening) {
      mic.classList.add('is-listening');
      micIcon.style.display = 'none';
      stopIcon.style.display = 'block';
      avatar.classList.add('is-listening');
    } else {
      mic.classList.remove('is-listening');
      micIcon.style.display = 'block';
      stopIcon.style.display = 'none';
      avatar.classList.remove('is-listening');
    }
  }

  // ============================================================================
  // PROCESS & RESPOND
  // ============================================================================

  async function processTranscript() {
    if (!state.transcript.trim()) {
      updateStatus('No speech detected. Try again.');
      return;
    }

    state.isProcessing = true;
    updateStatus('Thinking...');
    elements.container.querySelector('.voice-demo__avatar').classList.add('is-thinking');

    try {
      const response = await fetchAIResponse(state.transcript);
      displayResponse(response);
    } catch (error) {
      console.error('[VoiceDemo] API error:', error);
      // Fallback to local response
      displayResponse(generateLocalResponse(state.transcript));
    } finally {
      state.isProcessing = false;
      elements.container.querySelector('.voice-demo__avatar').classList.remove('is-thinking');
    }
  }

  async function fetchAIResponse(transcript) {
    const response = await fetch(CONFIG.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript,
        sessionId: state.sessionId,
      }),
    });

    if (!response.ok) {
      throw new Error('API request failed');
    }

    return response.json();
  }

  function generateLocalResponse(transcript) {
    // Intelligent local fallback responses
    const lowerTranscript = transcript.toLowerCase();

    let response = {
      response: '',
      insights: [],
    };

    if (
      lowerTranscript.includes('stress') ||
      lowerTranscript.includes('overwhelm') ||
      lowerTranscript.includes('anxious')
    ) {
      response.response =
        'I hear that weight in your words. Stress has a way of making everything feel heavier than it needs to be. What if we started with just one small thing you could take off your plate right now?';
      response.insights = [
        { label: 'Emotion', value: 'Feeling overwhelmed' },
        { label: 'Pattern', value: 'Taking on too much' },
        { label: 'Suggestion', value: 'Start with one small win' },
      ];
    } else if (
      lowerTranscript.includes('sleep') ||
      lowerTranscript.includes('tired') ||
      lowerTranscript.includes('exhausted')
    ) {
      response.response =
        "Rest isn't just about sleep—it's about giving your mind permission to pause. What's keeping your thoughts running even when you're tired?";
      response.insights = [
        { label: 'Concern', value: 'Rest and recovery' },
        { label: 'Connection', value: 'Mind-body balance' },
        { label: 'Focus', value: 'What needs settling' },
      ];
    } else if (
      lowerTranscript.includes('work') ||
      lowerTranscript.includes('job') ||
      lowerTranscript.includes('career')
    ) {
      response.response =
        "Work takes up so much of our lives. I'm curious—when you think about your work, what's the feeling that comes up first?";
      response.insights = [
        { label: 'Topic', value: 'Career & purpose' },
        { label: 'Approach', value: 'Exploring feelings' },
        { label: 'Goal', value: 'Understanding your relationship with work' },
      ];
    } else if (
      lowerTranscript.includes('relationship') ||
      lowerTranscript.includes('partner') ||
      lowerTranscript.includes('friend')
    ) {
      response.response =
        "Relationships are where we do some of our deepest growing—and sometimes our hardest work. Tell me more about what's on your mind.";
      response.insights = [
        { label: 'Topic', value: 'Relationships' },
        { label: 'Strength', value: 'Seeking understanding' },
        { label: 'Next step', value: 'Exploring dynamics' },
      ];
    } else {
      response.response = `I'm listening. "${transcript.slice(0, 50)}${transcript.length > 50 ? '...' : ''}"—that sounds important. Can you tell me more about what's behind that?`;
      response.insights = [
        { label: 'Approach', value: 'Curious exploration' },
        { label: 'Style', value: 'Open-ended listening' },
        { label: 'Goal', value: 'Understanding your perspective' },
      ];
    }

    return response;
  }

  function displayResponse(data) {
    const responseText = elements.response.querySelector('.voice-demo__response-text');
    const insightsList = elements.insights.querySelector('.voice-demo__insights-list');

    // Show response with typewriter effect
    responseText.textContent = '';
    elements.response.classList.add('is-visible');

    typewriterEffect(responseText, data.response, () => {
      // After typewriter, speak the response
      if (CONFIG.useBrowserTTS) {
        speakResponse(data.response);
      }
    });

    // Show insights
    if (data.insights && data.insights.length > 0) {
      insightsList.innerHTML = data.insights
        .map(
          (insight) => `
        <div class="voice-demo__insight-item">
          <span class="voice-demo__insight-label">${insight.label}</span>
          <span class="voice-demo__insight-value">${insight.value}</span>
        </div>
      `
        )
        .join('');

      setTimeout(() => {
        elements.insights.classList.add('is-visible');
      }, 500);
    }

    updateStatus('');

    // Track analytics
    if (window.gtag) {
      window.gtag('event', 'voice_demo_response', { event_category: 'engagement' });
    }
  }

  function typewriterEffect(element, text, callback) {
    let index = 0;
    const speed = 20;

    function type() {
      if (index < text.length) {
        element.textContent += text.charAt(index);
        index++;
        setTimeout(type, speed);
      } else if (callback) {
        callback();
      }
    }

    type();
  }

  function speakResponse(text) {
    if (!window.speechSynthesis) return;

    state.isSpeaking = true;
    updateStatus('');

    const avatar = elements.container.querySelector('.voice-demo__avatar');
    avatar.classList.add('is-speaking');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to find a good voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoices = ['Samantha', 'Karen', 'Google US English', 'Microsoft Aria'];
    for (const name of preferredVoices) {
      const voice = voices.find((v) => v.name.includes(name));
      if (voice) {
        utterance.voice = voice;
        break;
      }
    }

    utterance.onend = () => {
      state.isSpeaking = false;
      avatar.classList.remove('is-speaking');
      updateStatus('Tap mic to continue');
    };

    window.speechSynthesis.speak(utterance);
  }

  // ============================================================================
  // WAVEFORM VISUALIZATION
  // ============================================================================

  function setupAudioContext() {
    // Will be initialized on first use (requires user interaction)
  }

  function startWaveformAnimation() {
    if (!elements.waveform) return;

    const ctx = elements.waveform.getContext('2d');
    const width = elements.waveform.width;
    const height = elements.waveform.height;

    // Simple animated waveform (no actual audio analysis for privacy)
    let phase = 0;

    function draw() {
      if (!state.isListening) return;

      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = 'rgba(74, 103, 65, 0.6)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';

      ctx.beginPath();

      const bars = 30;
      const barWidth = width / bars;

      for (let i = 0; i < bars; i++) {
        const x = i * barWidth + barWidth / 2;
        const amplitude = Math.sin(phase + i * 0.3) * 0.5 + 0.5;
        const noise = Math.random() * 0.3;
        const barHeight = (amplitude + noise) * (height * 0.7);
        const y = (height - barHeight) / 2;

        ctx.moveTo(x, y);
        ctx.lineTo(x, y + barHeight);
      }

      ctx.stroke();

      phase += 0.15;
      state.animationFrame = requestAnimationFrame(draw);
    }

    draw();
  }

  function stopWaveformAnimation() {
    if (state.animationFrame) {
      cancelAnimationFrame(state.animationFrame);
      state.animationFrame = null;
    }

    // Clear canvas
    if (elements.waveform) {
      const ctx = elements.waveform.getContext('2d');
      ctx.clearRect(0, 0, elements.waveform.width, elements.waveform.height);
    }
  }

  // ============================================================================
  // UI HELPERS
  // ============================================================================

  function updateStatus(text) {
    if (elements.status) {
      elements.status.textContent = text;
    }
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'voice-demo-styles';
    style.textContent = `
      /* ═══════════════════════════════════════════════════════════════════════════
         VOICE DEMO - Apple-Bold Interactive Experience
         ═══════════════════════════════════════════════════════════════════════════ */
      
      .voice-demo {
        margin-top: clamp(48px, 8vh, 80px);
        display: flex;
        justify-content: center;
      }
      
      /* Trigger Button */
      .voice-demo__trigger {
        display: flex;
        align-items: center;
        gap: var(--space-4, 16px);
        padding: 20px 32px;
        background: linear-gradient(145deg, #4a6741, #3d5a35);
        border: none;
        border-radius: 100px;
        color: white;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.125rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        box-shadow: 
          0 4px 20px rgba(74, 103, 65, 0.3),
          0 2px 8px rgba(74, 103, 65, 0.2);
        position: relative;
        overflow: hidden;
      }
      
      .voice-demo__trigger::before {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse at 30% 0%, rgba(255,255,255,0.15) 0%, transparent 60%);
        pointer-events: none;
      }
      
      .voice-demo__trigger:hover {
        transform: translateY(-2px) scale(1.02);
        box-shadow: 
          0 8px 32px rgba(74, 103, 65, 0.4),
          0 4px 12px rgba(74, 103, 65, 0.25);
      }
      
      .voice-demo__trigger:active {
        transform: translateY(0) scale(0.98);
      }
      
      .voice-demo__trigger-icon {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .voice-demo__trigger-text {
        flex: 1;
      }
      
      .voice-demo__trigger-hint {
        font-size: 0.75rem;
        font-weight: 500;
        opacity: 0.7;
        padding: 4px 10px;
        background: rgba(255,255,255,0.15);
        border-radius: 100px;
      }
      
      /* Panel Overlay */
      .voice-demo__panel {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(44, 37, 32, 0.7);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.4s ease, visibility 0.4s ease;
      }
      
      .voice-demo__panel.is-open {
        opacity: 1;
        visibility: visible;
      }
      
      .voice-demo__panel-inner {
        position: relative;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: 32px;
        padding: clamp(32px, 6vw, 48px);
        max-width: 480px;
        width: 100%;
        max-height: 90vh;
        overflow-y: auto;
        text-align: center;
        transform: scale(0.9) translateY(20px);
        transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        box-shadow: 
          0 24px 80px rgba(0, 0, 0, 0.25),
          0 8px 32px rgba(0, 0, 0, 0.15);
      }
      
      .voice-demo__panel.is-open .voice-demo__panel-inner {
        transform: scale(1) translateY(0);
      }
      
      /* Close Button */
      .voice-demo__close {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(44, 37, 32, 0.05);
        border: none;
        border-radius: 50%;
        color: var(--color-text-muted, #9a8f84);
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .voice-demo__close:hover {
        background: rgba(44, 37, 32, 0.1);
        color: var(--color-text-primary, #2c2520);
      }
      
      /* Avatar */
      .voice-demo__avatar {
        position: relative;
        width: 80px;
        height: 80px;
        margin: 0 auto 24px;
      }
      
      .voice-demo__avatar-orb {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: linear-gradient(145deg, #4a6741, #3d5a35);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.5rem;
        font-weight: 800;
        transition: transform 0.3s ease, box-shadow 0.3s ease;
      }
      
      .voice-demo__avatar-ring {
        position: absolute;
        inset: -8px;
        border-radius: 50%;
        border: 2px solid rgba(74, 103, 65, 0.2);
        transition: all 0.3s ease;
      }
      
      /* Avatar States */
      .voice-demo__avatar.is-listening .voice-demo__avatar-ring {
        animation: voice-ring-pulse 1.5s ease-in-out infinite;
        border-color: rgba(74, 103, 65, 0.5);
      }
      
      .voice-demo__avatar.is-thinking .voice-demo__avatar-orb {
        animation: voice-avatar-think 2s ease-in-out infinite;
      }
      
      .voice-demo__avatar.is-speaking .voice-demo__avatar-orb {
        animation: voice-avatar-speak 0.8s ease-in-out infinite;
      }
      
      @keyframes voice-ring-pulse {
        0%, 100% { transform: scale(1); opacity: 0.5; }
        50% { transform: scale(1.1); opacity: 0.8; }
      }
      
      @keyframes voice-avatar-think {
        0%, 100% { transform: scale(1) rotate(0deg); }
        25% { transform: scale(1.02) rotate(-2deg); }
        75% { transform: scale(1.02) rotate(2deg); }
      }
      
      @keyframes voice-avatar-speak {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      
      /* Status */
      .voice-demo__status {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 0.9375rem;
        color: var(--color-text-secondary, #5c544a);
        margin-bottom: 24px;
        min-height: 24px;
      }
      
      /* Waveform */
      .voice-demo__waveform {
        margin-bottom: 24px;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .voice-demo__waveform-canvas {
        width: 100%;
        max-width: 300px;
        height: 60px;
      }
      
      /* Transcript */
      .voice-demo__transcript {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 1.125rem;
        font-style: italic;
        color: var(--color-text-primary, #2c2520);
        margin-bottom: 24px;
        min-height: 1.5em;
        line-height: 1.5;
      }
      
      /* Mic Button */
      .voice-demo__mic {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: linear-gradient(145deg, #4a6741, #3d5a35);
        border: none;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        margin: 0 auto 32px;
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        box-shadow: 
          0 4px 20px rgba(74, 103, 65, 0.3),
          0 2px 8px rgba(74, 103, 65, 0.2);
      }
      
      .voice-demo__mic:hover {
        transform: scale(1.05);
        box-shadow: 
          0 8px 32px rgba(74, 103, 65, 0.4),
          0 4px 12px rgba(74, 103, 65, 0.25);
      }
      
      .voice-demo__mic:active {
        transform: scale(0.95);
      }
      
      .voice-demo__mic.is-listening {
        background: #c4856a;
        animation: mic-pulse 1.5s ease-in-out infinite;
      }
      
      @keyframes mic-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(196, 133, 106, 0.4); }
        50% { box-shadow: 0 0 0 15px rgba(196, 133, 106, 0); }
      }
      
      /* Response */
      .voice-demo__response {
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        margin-bottom: 24px;
      }
      
      .voice-demo__response.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      
      .voice-demo__response-card {
        background: linear-gradient(145deg, #4a6741, #3d5a35);
        border-radius: 20px;
        padding: 24px;
        text-align: left;
        color: white;
      }
      
      .voice-demo__response-header {
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-weight: 700;
        font-size: 0.9375rem;
        margin-bottom: 12px;
        opacity: 0.9;
      }
      
      .voice-demo__response-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(255,255,255,0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: 800;
      }
      
      .voice-demo__response-text {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 1.0625rem;
        line-height: 1.6;
        margin: 0;
        font-style: italic;
      }
      
      /* Insights */
      .voice-demo__insights {
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s;
        text-align: left;
      }
      
      .voice-demo__insights.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      
      .voice-demo__insights-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 0.875rem;
        font-weight: 700;
        color: var(--color-text-secondary, #5c544a);
        margin: 0 0 12px;
      }
      
      .voice-demo__insights-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      
      .voice-demo__insight-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: rgba(74, 103, 65, 0.08);
        border-radius: 100px;
        font-size: 0.8125rem;
      }
      
      .voice-demo__insight-label {
        font-weight: 600;
        color: var(--color-ferni, #4a6741);
      }
      
      .voice-demo__insight-value {
        color: var(--color-text-secondary, #5c544a);
      }
      
      /* Mobile */
      @media (max-width: 640px) {
        .voice-demo__trigger {
          padding: 16px 24px;
          font-size: 1rem;
        }
        
        .voice-demo__trigger-hint {
          display: none;
        }
        
        .voice-demo__panel-inner {
          padding: 24px;
          border-radius: 24px;
        }
        
        .voice-demo__avatar {
          width: 64px;
          height: 64px;
        }
        
        .voice-demo__avatar-orb {
          font-size: 1.25rem;
        }
      }
      
      /* Reduced Motion */
      @media (prefers-reduced-motion: reduce) {
        .voice-demo__trigger,
        .voice-demo__panel,
        .voice-demo__panel-inner,
        .voice-demo__mic,
        .voice-demo__response,
        .voice-demo__insights {
          transition: none;
        }
        
        .voice-demo__avatar.is-listening .voice-demo__avatar-ring,
        .voice-demo__avatar.is-thinking .voice-demo__avatar-orb,
        .voice-demo__avatar.is-speaking .voice-demo__avatar-orb,
        .voice-demo__mic.is-listening {
          animation: none;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // ============================================================================
  // INITIALIZE
  // ============================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for debugging
  window.FerniVoiceDemo = {
    state: () => ({ ...state }),
    open: openPanel,
    close: closePanel,
  };
})();
