/**
 * Ferni Demo Widget - Talk to Ferni without signing up
 * 
 * Embeddable voice widget for the landing page that lets visitors
 * try Ferni with a rate-limited demo session.
 * 
 * Usage:
 *   <script src="/js/demo-widget.js"></script>
 *   <div id="ferni-demo-widget"></div>
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    tokenEndpoint: 'https://app.ferni.ai/demo-token',
    livekitUrl: null, // Will be set from token response
    containerId: 'ferni-demo-widget',
    upgradeUrl: 'https://app.ferni.ai',
  };

  // State
  let state = {
    isOpen: false,
    isConnecting: false,
    isConnected: false,
    isTalking: false,
    room: null,
    audioTrack: null,
    sessionTimeRemaining: 0,
    timerInterval: null,
    error: null,
  };

  // ============================================================================
  // STYLES
  // ============================================================================
  
  const styles = `
    .ferni-demo-trigger {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9998;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 24px;
      background: linear-gradient(135deg, #5a7751 0%, #4a6741 50%, #3d5a35 100%);
      color: white;
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      font-weight: 600;
      font-size: 16px;
      border: none;
      border-radius: 50px;
      cursor: pointer;
      box-shadow: 0 8px 32px rgba(74, 103, 65, 0.4), 0 4px 12px rgba(74, 103, 65, 0.2);
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    .ferni-demo-trigger:hover {
      transform: translateY(-3px) scale(1.02);
      box-shadow: 0 12px 40px rgba(74, 103, 65, 0.5), 0 6px 16px rgba(74, 103, 65, 0.3);
    }
    
    .ferni-demo-trigger:active {
      transform: translateY(0) scale(0.98);
    }
    
    .ferni-demo-trigger-icon {
      width: 24px;
      height: 24px;
      animation: ferni-pulse 2s ease-in-out infinite;
    }
    
    @keyframes ferni-pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    
    .ferni-demo-trigger-text {
      white-space: nowrap;
    }
    
    @media (max-width: 640px) {
      .ferni-demo-trigger {
        padding: 14px 20px;
        font-size: 14px;
        bottom: 80px; /* Above mobile nav */
      }
      .ferni-demo-trigger-text {
        display: none;
      }
      .ferni-demo-trigger {
        padding: 16px;
        border-radius: 50%;
      }
    }
    
    /* Modal Overlay */
    .ferni-demo-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      opacity: 0;
      visibility: hidden;
      transition: all 0.3s ease;
    }
    
    .ferni-demo-overlay.open {
      opacity: 1;
      visibility: visible;
    }
    
    .ferni-demo-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.6);
      backdrop-filter: blur(12px);
    }
    
    /* Modal Card */
    .ferni-demo-modal {
      position: relative;
      width: 100%;
      max-width: 400px;
      background: linear-gradient(180deg, #faf8f5 0%, #f5f0ea 100%);
      border-radius: 32px;
      box-shadow: 0 32px 64px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      transform: scale(0.9) translateY(20px);
      transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    
    .ferni-demo-overlay.open .ferni-demo-modal {
      transform: scale(1) translateY(0);
    }
    
    /* Modal Header */
    .ferni-demo-header {
      padding: 24px 24px 16px;
      text-align: center;
      border-bottom: 1px solid rgba(44, 37, 32, 0.08);
    }
    
    .ferni-demo-close {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(44, 37, 32, 0.05);
      border: none;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .ferni-demo-close:hover {
      background: rgba(44, 37, 32, 0.1);
    }
    
    .ferni-demo-close svg {
      width: 18px;
      height: 18px;
      color: #70605a;
    }
    
    .ferni-demo-timer {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      background: rgba(74, 103, 65, 0.1);
      border-radius: 20px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      font-weight: 500;
      color: #4a6741;
      margin-bottom: 16px;
    }
    
    .ferni-demo-timer.warning {
      background: rgba(196, 133, 106, 0.15);
      color: #a86d55;
    }
    
    .ferni-demo-title {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 20px;
      font-weight: 700;
      color: #2c2520;
      margin: 0 0 4px;
    }
    
    .ferni-demo-subtitle {
      font-size: 14px;
      color: #70605a;
      margin: 0;
    }
    
    /* Modal Body */
    .ferni-demo-body {
      padding: 32px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
    }
    
    /* Avatar */
    .ferni-demo-avatar {
      position: relative;
      width: 140px;
      height: 140px;
    }
    
    .ferni-demo-avatar-glow {
      position: absolute;
      inset: -30%;
      background: radial-gradient(circle, rgba(74, 103, 65, 0.25) 0%, transparent 70%);
      border-radius: 50%;
      animation: ferni-glow 3s ease-in-out infinite;
    }
    
    @keyframes ferni-glow {
      0%, 100% { opacity: 0.6; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.1); }
    }
    
    .ferni-demo-avatar-orb {
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, #5a7751 0%, #4a6741 50%, #3d5a35 100%);
      border-radius: 50%;
      box-shadow: 0 8px 32px rgba(74, 103, 65, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      animation: ferni-breathe 4s ease-in-out infinite;
    }
    
    @keyframes ferni-breathe {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.03); }
    }
    
    .ferni-demo-avatar-orb.listening {
      animation: ferni-listening 0.8s ease-in-out infinite;
    }
    
    @keyframes ferni-listening {
      0%, 100% { transform: scale(1); box-shadow: 0 8px 32px rgba(74, 103, 65, 0.4); }
      50% { transform: scale(1.05); box-shadow: 0 12px 40px rgba(74, 103, 65, 0.5); }
    }
    
    .ferni-demo-avatar-orb.speaking {
      animation: ferni-speaking 0.4s ease-in-out infinite;
    }
    
    @keyframes ferni-speaking {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }
    
    /* Eye in the orb */
    .ferni-demo-eye {
      width: 60%;
      height: 60%;
      background: linear-gradient(135deg, #faf8f5 0%, #f0ebe4 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    
    .ferni-demo-iris {
      width: 65%;
      height: 65%;
      background: linear-gradient(135deg, #5a8060 0%, #4a6741 50%, #3d5a35 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .ferni-demo-pupil {
      width: 50%;
      height: 50%;
      background: #2c2520;
      border-radius: 50%;
      position: relative;
    }
    
    .ferni-demo-pupil::before {
      content: '';
      position: absolute;
      top: 15%;
      left: 20%;
      width: 30%;
      height: 30%;
      background: white;
      border-radius: 50%;
      opacity: 0.9;
    }
    
    /* Waveform */
    .ferni-demo-waveform {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 40px;
      opacity: 0;
      transition: opacity 0.3s;
    }
    
    .ferni-demo-waveform.active {
      opacity: 1;
    }
    
    .ferni-demo-wave-bar {
      width: 4px;
      height: 8px;
      background: #4a6741;
      border-radius: 2px;
      animation: ferni-wave 1s ease-in-out infinite;
    }
    
    .ferni-demo-wave-bar:nth-child(1) { animation-delay: 0s; }
    .ferni-demo-wave-bar:nth-child(2) { animation-delay: 0.1s; }
    .ferni-demo-wave-bar:nth-child(3) { animation-delay: 0.2s; }
    .ferni-demo-wave-bar:nth-child(4) { animation-delay: 0.3s; }
    .ferni-demo-wave-bar:nth-child(5) { animation-delay: 0.4s; }
    
    @keyframes ferni-wave {
      0%, 100% { height: 8px; }
      50% { height: 24px; }
    }
    
    /* Status Text */
    .ferni-demo-status {
      font-size: 16px;
      font-weight: 500;
      color: #2c2520;
      text-align: center;
    }
    
    .ferni-demo-status.subtle {
      font-size: 14px;
      color: #70605a;
    }
    
    /* Action Button */
    .ferni-demo-action {
      width: 100%;
      padding: 16px 24px;
      background: linear-gradient(135deg, #5a7751 0%, #4a6741 100%);
      color: white;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 16px;
      font-weight: 600;
      border: none;
      border-radius: 16px;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
    }
    
    .ferni-demo-action:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(74, 103, 65, 0.3);
    }
    
    .ferni-demo-action:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .ferni-demo-action.end {
      background: rgba(44, 37, 32, 0.08);
      color: #70605a;
    }
    
    .ferni-demo-action.end:hover {
      background: rgba(196, 133, 106, 0.15);
      color: #a86d55;
    }
    
    /* Footer */
    .ferni-demo-footer {
      padding: 16px 24px;
      background: rgba(44, 37, 32, 0.03);
      text-align: center;
      border-top: 1px solid rgba(44, 37, 32, 0.08);
    }
    
    .ferni-demo-upgrade {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      color: #4a6741;
      text-decoration: none;
      font-weight: 500;
      transition: all 0.2s;
    }
    
    .ferni-demo-upgrade:hover {
      color: #3d5a35;
      gap: 10px;
    }
    
    /* Error State */
    .ferni-demo-error {
      padding: 16px;
      background: rgba(196, 133, 106, 0.1);
      border-radius: 12px;
      text-align: center;
    }
    
    .ferni-demo-error-title {
      font-weight: 600;
      color: #a86d55;
      margin: 0 0 8px;
    }
    
    .ferni-demo-error-message {
      font-size: 14px;
      color: #70605a;
      margin: 0;
    }
    
    /* Loading spinner */
    .ferni-demo-spinner {
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: ferni-spin 0.8s linear infinite;
    }
    
    @keyframes ferni-spin {
      to { transform: rotate(360deg); }
    }
  `;

  // ============================================================================
  // HTML TEMPLATES
  // ============================================================================
  
  function createTriggerButton() {
    return `
      <button class="ferni-demo-trigger" aria-label="Talk to Ferni">
        <svg class="ferni-demo-trigger-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
        <span class="ferni-demo-trigger-text">Try talking to Ferni</span>
      </button>
    `;
  }
  
  function createModal() {
    return `
      <div class="ferni-demo-overlay" role="dialog" aria-modal="true" aria-labelledby="ferni-demo-title">
        <div class="ferni-demo-backdrop"></div>
        <div class="ferni-demo-modal">
          <div class="ferni-demo-header">
            <button class="ferni-demo-close" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
            <div class="ferni-demo-timer" style="display: none;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
              <span class="ferni-demo-timer-text">3:00</span>
            </div>
            <h2 id="ferni-demo-title" class="ferni-demo-title">Talk to Ferni</h2>
            <p class="ferni-demo-subtitle">Try a quick conversation—no account needed</p>
          </div>
          
          <div class="ferni-demo-body">
            <div class="ferni-demo-avatar">
              <div class="ferni-demo-avatar-glow"></div>
              <div class="ferni-demo-avatar-orb">
                <div class="ferni-demo-eye">
                  <div class="ferni-demo-iris">
                    <div class="ferni-demo-pupil"></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="ferni-demo-waveform">
              <div class="ferni-demo-wave-bar"></div>
              <div class="ferni-demo-wave-bar"></div>
              <div class="ferni-demo-wave-bar"></div>
              <div class="ferni-demo-wave-bar"></div>
              <div class="ferni-demo-wave-bar"></div>
            </div>
            
            <p class="ferni-demo-status">Click the button below to start</p>
            
            <div class="ferni-demo-error" style="display: none;">
              <p class="ferni-demo-error-title">Oops!</p>
              <p class="ferni-demo-error-message"></p>
            </div>
            
            <button class="ferni-demo-action">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              </svg>
              Start Talking
            </button>
          </div>
          
          <div class="ferni-demo-footer">
            <a href="${CONFIG.upgradeUrl}" class="ferni-demo-upgrade">
              Create free account for unlimited access
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // DOM MANIPULATION
  // ============================================================================
  
  let container, trigger, overlay, modal;
  let statusEl, actionBtn, timerEl, waveformEl, avatarOrb, errorEl;
  
  function injectStyles() {
    if (document.getElementById('ferni-demo-styles')) return;
    
    const styleEl = document.createElement('style');
    styleEl.id = 'ferni-demo-styles';
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }
  
  function createDOM() {
    container = document.getElementById(CONFIG.containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = CONFIG.containerId;
      document.body.appendChild(container);
    }
    
    container.innerHTML = createTriggerButton() + createModal();
    
    // Cache DOM references
    trigger = container.querySelector('.ferni-demo-trigger');
    overlay = container.querySelector('.ferni-demo-overlay');
    modal = container.querySelector('.ferni-demo-modal');
    statusEl = container.querySelector('.ferni-demo-status');
    actionBtn = container.querySelector('.ferni-demo-action');
    timerEl = container.querySelector('.ferni-demo-timer');
    waveformEl = container.querySelector('.ferni-demo-waveform');
    avatarOrb = container.querySelector('.ferni-demo-avatar-orb');
    errorEl = container.querySelector('.ferni-demo-error');
    
    // Event listeners
    trigger.addEventListener('click', openModal);
    container.querySelector('.ferni-demo-backdrop').addEventListener('click', closeModal);
    container.querySelector('.ferni-demo-close').addEventListener('click', closeModal);
    actionBtn.addEventListener('click', handleActionClick);
    
    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isOpen) closeModal();
    });
  }
  
  function openModal() {
    state.isOpen = true;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    
    // Track event
    if (window.FerniExperiments) {
      window.FerniExperiments.trackConversionForAll('demo_modal_opened');
    }
  }
  
  function closeModal() {
    state.isOpen = false;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
    
    // Disconnect if connected
    if (state.isConnected) {
      disconnectSession();
    }
  }
  
  // ============================================================================
  // LIVEKIT CONNECTION
  // ============================================================================
  
  async function startSession() {
    state.isConnecting = true;
    state.error = null;
    updateUI();
    
    try {
      // Get demo token
      const response = await fetch(CONFIG.tokenEndpoint);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to start demo');
      }
      
      CONFIG.livekitUrl = data.url;
      state.sessionTimeRemaining = data.session_duration_minutes * 60;
      
      // Load LiveKit SDK dynamically if not loaded
      if (!window.LivekitClient) {
        await loadLivekitSDK();
      }
      
      // Connect to room
      const room = new window.LivekitClient.Room();
      
      room.on('trackSubscribed', (track, publication, participant) => {
        if (track.kind === 'audio' && participant.identity !== 'Visitor') {
          const audioEl = track.attach();
          audioEl.id = 'ferni-demo-audio';
          document.body.appendChild(audioEl);
          avatarOrb.classList.add('speaking');
        }
      });
      
      room.on('trackUnsubscribed', (track) => {
        if (track.kind === 'audio') {
          const audioEl = document.getElementById('ferni-demo-audio');
          if (audioEl) audioEl.remove();
          avatarOrb.classList.remove('speaking');
        }
      });
      
      room.on('disconnected', () => {
        state.isConnected = false;
        state.isTalking = false;
        updateUI();
      });
      
      // Connect
      await room.connect(CONFIG.livekitUrl, data.token);
      
      // Enable microphone
      await room.localParticipant.setMicrophoneEnabled(true);
      
      state.room = room;
      state.isConnected = true;
      state.isConnecting = false;
      state.isTalking = true;
      
      // Start timer
      startTimer();
      
      // Track conversion
      if (window.FerniExperiments) {
        window.FerniExperiments.trackConversionForAll('demo_session_started');
      }
      
      updateUI();
      
    } catch (error) {
      console.error('Demo session error:', error);
      state.isConnecting = false;
      state.error = error.message;
      updateUI();
    }
  }
  
  function disconnectSession() {
    if (state.room) {
      state.room.disconnect();
      state.room = null;
    }
    
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
    
    state.isConnected = false;
    state.isTalking = false;
    state.sessionTimeRemaining = 0;
    
    // Remove audio element
    const audioEl = document.getElementById('ferni-demo-audio');
    if (audioEl) audioEl.remove();
    
    updateUI();
  }
  
  function startTimer() {
    state.timerInterval = setInterval(() => {
      state.sessionTimeRemaining--;
      
      if (state.sessionTimeRemaining <= 0) {
        disconnectSession();
        state.error = 'Demo session ended. Create a free account for unlimited conversations!';
        updateUI();
      } else {
        updateTimerDisplay();
      }
    }, 1000);
    
    updateTimerDisplay();
  }
  
  function updateTimerDisplay() {
    const minutes = Math.floor(state.sessionTimeRemaining / 60);
    const seconds = state.sessionTimeRemaining % 60;
    const timerText = timerEl.querySelector('.ferni-demo-timer-text');
    timerText.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Warning state when under 30 seconds
    timerEl.classList.toggle('warning', state.sessionTimeRemaining <= 30);
  }
  
  async function loadLivekitSDK() {
    return new Promise((resolve, reject) => {
      if (window.LivekitClient) {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/livekit-client@2.0.0/dist/livekit-client.umd.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load voice SDK'));
      document.head.appendChild(script);
    });
  }
  
  // ============================================================================
  // UI UPDATES
  // ============================================================================
  
  function handleActionClick() {
    if (state.isConnected) {
      disconnectSession();
    } else if (!state.isConnecting) {
      startSession();
    }
  }
  
  function updateUI() {
    // Error state
    if (state.error) {
      errorEl.style.display = 'block';
      errorEl.querySelector('.ferni-demo-error-message').textContent = state.error;
      actionBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        </svg>
        Try Again
      `;
      actionBtn.disabled = false;
      actionBtn.classList.remove('end');
      statusEl.textContent = '';
      timerEl.style.display = 'none';
      waveformEl.classList.remove('active');
      avatarOrb.classList.remove('listening', 'speaking');
      return;
    }
    
    errorEl.style.display = 'none';
    
    // Connecting state
    if (state.isConnecting) {
      statusEl.textContent = 'Connecting to Ferni...';
      actionBtn.innerHTML = '<div class="ferni-demo-spinner"></div> Connecting...';
      actionBtn.disabled = true;
      timerEl.style.display = 'none';
      waveformEl.classList.remove('active');
      return;
    }
    
    // Connected state
    if (state.isConnected) {
      statusEl.textContent = 'Ferni is listening...';
      statusEl.classList.remove('subtle');
      actionBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="6" y="4" width="4" height="16"/>
          <rect x="14" y="4" width="4" height="16"/>
        </svg>
        End Demo
      `;
      actionBtn.disabled = false;
      actionBtn.classList.add('end');
      timerEl.style.display = 'inline-flex';
      waveformEl.classList.add('active');
      avatarOrb.classList.add('listening');
      return;
    }
    
    // Default state
    statusEl.textContent = 'Click the button below to start';
    statusEl.classList.add('subtle');
    actionBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      </svg>
      Start Talking
    `;
    actionBtn.disabled = false;
    actionBtn.classList.remove('end');
    timerEl.style.display = 'none';
    waveformEl.classList.remove('active');
    avatarOrb.classList.remove('listening', 'speaking');
  }
  
  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  function init() {
    injectStyles();
    createDOM();
    console.log('🎯 Ferni Demo Widget loaded');
  }
  
  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Expose for debugging
  window.FerniDemo = {
    open: openModal,
    close: closeModal,
    state: () => state,
  };
  
})();
