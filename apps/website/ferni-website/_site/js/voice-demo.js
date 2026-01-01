/**
 * Voice-Activated Demo
 * Real voice interaction on the landing page using WebSpeech API
 * 
 * Click the mic, speak, and Ferni responds. This is the "wow" moment.
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  const CONFIG = {
    language: 'en-US',
    continuous: false,
    interimResults: true,
    maxAlternatives: 1,
    silenceTimeout: 2000,    // Stop listening after 2s of silence
    maxDuration: 10000,      // Max 10s of recording
    debugMode: false
  };

  // ============================================================================
  // VOICE RESPONSES - Contextual responses based on what user says
  // ============================================================================
  
  const VOICE_RESPONSES = {
    greetings: {
      triggers: ['hello', 'hi', 'hey', 'good morning', 'good evening', 'good afternoon'],
      responses: [
        "Hey. It's nice to hear your voice. What's on your mind?",
        "Hi there. I'm listening. What would you like to talk about?",
        "Hello. I'm here. Take your time."
      ]
    },
    
    feelings: {
      triggers: ['feeling', 'feel', 'stressed', 'anxious', 'worried', 'sad', 'happy', 'tired', 'overwhelmed'],
      responses: [
        "I hear that. Want to tell me more about what's going on?",
        "That sounds like a lot. What's weighing on you most right now?",
        "Thank you for sharing that. I'm here to listen."
      ]
    },
    
    questions: {
      triggers: ['what', 'how', 'why', 'can you', 'will you', 'do you'],
      responses: [
        "That's a thoughtful question. Let me think about that with you.",
        "Good question. What made you think of that?",
        "I'd love to explore that together. Tell me more."
      ]
    },
    
    help: {
      triggers: ['help', 'need', 'want', 'trying', 'struggling'],
      responses: [
        "I'm here for you. What kind of support would feel most helpful right now?",
        "Let's work through this together. Start wherever feels right.",
        "I want to help. What's the first thing that comes to mind?"
      ]
    },
    
    default: {
      triggers: [],
      responses: [
        "I'm listening. Tell me more.",
        "That's interesting. What else is on your mind?",
        "I hear you. Keep going if you'd like."
      ]
    }
  };

  // ============================================================================
  // STATE
  // ============================================================================
  
  const state = {
    isListening: false,
    isSupported: false,
    recognition: null,
    finalTranscript: '',
    interimTranscript: '',
    silenceTimer: null,
    maxDurationTimer: null,
    initialized: false
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    // Check for WebSpeech API support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      logDebug('WebSpeech API not supported');
      state.isSupported = false;
      hideVoiceButtons();
      return;
    }
    
    state.isSupported = true;
    state.recognition = new SpeechRecognition();
    
    // Configure recognition
    state.recognition.lang = CONFIG.language;
    state.recognition.continuous = CONFIG.continuous;
    state.recognition.interimResults = CONFIG.interimResults;
    state.recognition.maxAlternatives = CONFIG.maxAlternatives;
    
    // Set up event handlers
    setupRecognitionHandlers();
    
    // Set up voice button listeners
    setupVoiceButtons();
    
    state.initialized = true;
    logDebug('Voice Demo initialized');
  }

  // ============================================================================
  // RECOGNITION HANDLERS
  // ============================================================================
  
  function setupRecognitionHandlers() {
    state.recognition.onstart = () => {
      state.isListening = true;
      updateUIState('listening');
      logDebug('Started listening');
      
      // Start max duration timer
      state.maxDurationTimer = setTimeout(() => {
        if (state.isListening) {
          stopListening();
        }
      }, CONFIG.maxDuration);
    };
    
    state.recognition.onresult = (event) => {
      // Reset silence timer on any result
      resetSilenceTimer();
      
      let interim = '';
      let final = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      
      state.finalTranscript += final;
      state.interimTranscript = interim;
      
      // Update UI with transcript
      updateTranscriptDisplay(state.finalTranscript + state.interimTranscript);
      
      // Trigger predictive emotions based on interim results
      if (interim) {
        triggerPredictiveEmotion(interim);
      }
      
      logDebug('Transcript', { final: state.finalTranscript, interim });
    };
    
    state.recognition.onerror = (event) => {
      logDebug('Recognition error', event.error);
      
      if (event.error === 'not-allowed') {
        showMicrophonePermissionError();
      } else if (event.error === 'no-speech') {
        // No speech detected - that's okay
        updateUIState('no-speech');
      }
      
      stopListening();
    };
    
    state.recognition.onend = () => {
      state.isListening = false;
      clearTimers();
      
      // Process the final transcript
      if (state.finalTranscript.trim()) {
        processVoiceInput(state.finalTranscript.trim());
      } else {
        updateUIState('idle');
      }
      
      logDebug('Stopped listening');
    };
  }

  // ============================================================================
  // VOICE INPUT PROCESSING
  // ============================================================================
  
  function processVoiceInput(transcript) {
    updateUIState('processing');
    
    // Find matching response category
    const response = findResponse(transcript.toLowerCase());
    
    // Simulate Ferni "thinking"
    setTimeout(() => {
      // Add user message to chat
      addMessageToChat('user', transcript);
      
      // Show typing indicator
      showTypingIndicator();
      
      // Add Ferni's response after typing delay
      const typingDelay = 1000 + (response.length * 20);
      setTimeout(() => {
        hideTypingIndicator();
        addMessageToChat('ferni', response);
        updateUIState('idle');
        
        // Speak the response (optional)
        speakResponse(response);
      }, typingDelay);
    }, 500);
  }
  
  function findResponse(transcript) {
    for (const [category, data] of Object.entries(VOICE_RESPONSES)) {
      if (category === 'default') continue;
      
      for (const trigger of data.triggers) {
        if (transcript.includes(trigger)) {
          const responses = data.responses;
          return responses[Math.floor(Math.random() * responses.length)];
        }
      }
    }
    
    // Default response
    const defaults = VOICE_RESPONSES.default.responses;
    return defaults[Math.floor(Math.random() * defaults.length)];
  }
  
  function speakResponse(text) {
    // Optional: Use speech synthesis to speak Ferni's response
    if (!window.speechSynthesis) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    
    // Try to find a nice voice
    const voices = speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
      v.name.includes('Samantha') || 
      v.name.includes('Karen') ||
      v.name.includes('Google US English')
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    // Don't speak by default - can be enabled
    // speechSynthesis.speak(utterance);
  }

  // ============================================================================
  // UI STATE MANAGEMENT
  // ============================================================================
  
  function updateUIState(state) {
    const voiceButtons = document.querySelectorAll('.demo-widget__voice, [data-voice-trigger]');
    const widget = document.querySelector('.demo-widget');
    
    voiceButtons.forEach(btn => {
      btn.classList.remove('is-listening', 'is-processing', 'is-error');
      
      switch (state) {
        case 'listening':
          btn.classList.add('is-listening');
          btn.setAttribute('aria-label', 'Listening... Click to stop');
          break;
        case 'processing':
          btn.classList.add('is-processing');
          btn.setAttribute('aria-label', 'Processing...');
          break;
        case 'no-speech':
        case 'error':
          btn.classList.add('is-error');
          btn.setAttribute('aria-label', 'Try again');
          setTimeout(() => btn.classList.remove('is-error'), 2000);
          break;
        default:
          btn.setAttribute('aria-label', 'Use voice');
      }
    });
    
    if (widget) {
      widget.classList.toggle('is-voice-active', state === 'listening');
    }
  }
  
  function updateTranscriptDisplay(text) {
    // Update the input field with what was said
    const input = document.querySelector('.demo-widget__input');
    if (input && text) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  
  function showMicrophonePermissionError() {
    const widget = document.querySelector('.demo-widget');
    if (!widget) return;
    
    // Show a friendly error message
    const error = document.createElement('div');
    error.className = 'demo-widget__mic-error';
    error.innerHTML = `
      <p>Microphone access needed</p>
      <small>Click the lock icon in your browser's address bar to enable</small>
    `;
    
    const header = widget.querySelector('.demo-widget__header');
    if (header) {
      header.after(error);
      setTimeout(() => error.remove(), 5000);
    }
  }

  // ============================================================================
  // CHAT MESSAGE HELPERS
  // ============================================================================
  
  function addMessageToChat(sender, text) {
    const messagesContainer = document.querySelector('.demo-widget__messages');
    if (!messagesContainer) return;
    
    const message = document.createElement('div');
    message.className = `demo-message demo-message--${sender}`;
    message.textContent = text;
    
    messagesContainer.appendChild(message);
    
    // Animate in
    requestAnimationFrame(() => {
      message.classList.add('is-visible');
    });
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  function showTypingIndicator() {
    const messagesContainer = document.querySelector('.demo-widget__messages');
    if (!messagesContainer) return;
    
    // Remove existing indicator
    const existing = messagesContainer.querySelector('.demo-widget__typing');
    if (existing) existing.remove();
    
    const indicator = document.createElement('div');
    indicator.className = 'demo-widget__typing';
    indicator.innerHTML = `
      <div class="demo-widget__typing-dot"></div>
      <div class="demo-widget__typing-dot"></div>
      <div class="demo-widget__typing-dot"></div>
    `;
    
    messagesContainer.appendChild(indicator);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  function hideTypingIndicator() {
    const indicator = document.querySelector('.demo-widget__typing');
    if (indicator) indicator.remove();
  }

  // ============================================================================
  // VOICE BUTTON SETUP
  // ============================================================================
  
  function setupVoiceButtons() {
    // Demo widget voice button
    document.addEventListener('click', (e) => {
      const voiceBtn = e.target.closest('.demo-widget__voice, [data-voice-trigger]');
      if (!voiceBtn) return;
      
      e.preventDefault();
      
      if (state.isListening) {
        stopListening();
      } else {
        startListening();
      }
    });
  }
  
  function hideVoiceButtons() {
    // Hide voice buttons if not supported
    document.querySelectorAll('.demo-widget__voice, [data-voice-trigger]').forEach(btn => {
      btn.style.display = 'none';
    });
  }

  // ============================================================================
  // LISTENING CONTROL
  // ============================================================================
  
  function startListening() {
    if (!state.isSupported || state.isListening) return;
    
    // Reset state
    state.finalTranscript = '';
    state.interimTranscript = '';
    
    // Clear input
    const input = document.querySelector('.demo-widget__input');
    if (input) input.value = '';
    
    try {
      state.recognition.start();
    } catch (e) {
      logDebug('Failed to start recognition', e);
    }
  }
  
  function stopListening() {
    if (!state.isListening) return;
    
    clearTimers();
    
    try {
      state.recognition.stop();
    } catch (e) {
      logDebug('Failed to stop recognition', e);
    }
  }

  // ============================================================================
  // TIMERS
  // ============================================================================
  
  function resetSilenceTimer() {
    if (state.silenceTimer) {
      clearTimeout(state.silenceTimer);
    }
    
    state.silenceTimer = setTimeout(() => {
      if (state.isListening && state.finalTranscript.trim()) {
        stopListening();
      }
    }, CONFIG.silenceTimeout);
  }
  
  function clearTimers() {
    if (state.silenceTimer) {
      clearTimeout(state.silenceTimer);
      state.silenceTimer = null;
    }
    if (state.maxDurationTimer) {
      clearTimeout(state.maxDurationTimer);
      state.maxDurationTimer = null;
    }
  }

  // ============================================================================
  // PREDICTIVE EMOTION TRIGGER
  // ============================================================================
  
  function triggerPredictiveEmotion(text) {
    // Dispatch to predictive typing system
    if (window.FerniPredictiveTyping) {
      // The predictive typing system will handle this via input events
    }
  }

  // ============================================================================
  // UTILITY
  // ============================================================================
  
  function logDebug(...args) {
    if (CONFIG.debugMode) {
      console.log('[VoiceDemo]', ...args);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  window.FerniVoiceDemo = {
    init,
    start: startListening,
    stop: stopListening,
    isSupported: () => state.isSupported,
    isListening: () => state.isListening,
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
