/**
 * Voice AI Application
 *
 * Main application orchestrator that ties together all services and UI components.
 * A premium experience that rivals Apple and Google.
 */

import type { DataMessage, CelebrationEvent, EmotionEvent, ExpressionEvent, MoodEvent, MusicEvent } from './types/events.js';
import type { PersonaId } from './types/persona.js';
import { isCelebrationMessage, isEmotionMessage, isExpressionMessage, isMoodMessage, isMusicMessage } from './types/events.js';

// Theme system
import {
  initTheme,
  toggleTheme,
  setPersona as setThemePersona,
  onThemeChange,
  startAmbientCycle,
} from './theme/index.js';

// State
import { appState, setUserName, setAudioState, setSelectedPersona } from './state/app.state.js';

// Services
import {
  connectionService,
  audioService,
  handoffService,
  spotifyService,
  moodService,
} from './services/index.js';
import { delightService } from './services/delight.service.js';

// Core UI Components
import { coachUI, initCoachUI } from './ui/coach.ui.js';
import { teamUI, initTeamUI } from './ui/team.ui.js';
import { messageUI, initMessageUI } from './ui/message.ui.js';
import { waveformUI, initWaveformUI } from './ui/waveform.ui.js';
import { controlsUI, initControlsUI } from './ui/controls.ui.js';
import { initSpotifyUI } from './ui/spotify.ui.js';

// Premium UI Features
import { soundUI, initSoundUI } from './ui/sound.ui.js';
import { gesturesUI, initGesturesUI } from './ui/gestures.ui.js';
import { celebrationsUI, initCelebrationsUI } from './ui/celebrations.ui.js';
import { statsUI, initStatsUI } from './ui/stats.ui.js';
import { presenceUI, initPresenceUI } from './ui/presence.ui.js';
import { rippleUI, initRippleUI } from './ui/ripple.ui.js';
import { easterEggsUI, initEasterEggsUI } from './ui/easter-eggs.ui.js';
// ✨ Micro-Interactions - Pixar-quality button & interactive effects
import { microInteractionsUI, initMicroInteractions } from './ui/micro-interactions.ui.js';
// import { keyboardUI, initKeyboardUI } from './ui/keyboard.ui.js'; // Disabled for now
import { transcriptUI, initTranscriptUI } from './ui/transcript.ui.js';
import { thinkingUI, initThinkingUI } from './ui/thinking.ui.js';
import { connectionQualityUI, initConnectionQualityUI } from './ui/connection-quality.ui.js';
import { greetingUI } from './ui/greeting.ui.js';
import { moodUI, initMoodUI } from './ui/mood.ui.js';
import { skeletonUI, initSkeletonUI } from './ui/skeleton.ui.js';
import { avatarFeedback, initAvatarFeedback } from './ui/avatar-feedback.ui.js';
// Marketplace UI
import { marketplaceUI } from './ui/marketplace.ui.js';
// Admin UI
import { initAdminDashboard, injectAdminStyles } from './ui/admin.ui.js';
// 🎬 Pixar-quality Animation Orchestrator
import { 
  initAnimationOrchestrator, 
  animatePersonaTransition,
  playPixarReaction,
} from './ui/animation-orchestrator.ui.js';
// ⚡ GSAP Performance Utilities
import { initGSAP, promoteAllToGPU } from './utils/gsap-animations.js';
// Agent particles disabled for cleaner UI
// import { agentParticlesUI, initAgentParticles } from './ui/agent-particles.ui.js';

// Config
import { getPersona } from './config/personas.js';

// ============================================================================
// MAGNETIC HOVER EFFECT (WALL-E curiosity)
// Buttons "reach" toward the cursor like WALL-E's curious head tilts
// ============================================================================

function initMagneticHover(): void {
  const magneticStrength = 0.4; // How much buttons "reach" toward cursor
  const magneticRadius = 100; // Pixels - how far the magnetic effect extends

  document.addEventListener('mousemove', (e) => {
    const magneticElements = document.querySelectorAll('.btn-magnetic, .btn-primary, .btn-connect');

    magneticElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const deltaX = e.clientX - centerX;
      const deltaY = e.clientY - centerY;
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance < magneticRadius) {
        // Within magnetic range - calculate pull
        const pull = (1 - distance / magneticRadius) * magneticStrength;
        const moveX = deltaX * pull;
        const moveY = deltaY * pull;

        (el as HTMLElement).style.setProperty('--magnetic-x', moveX.toString());
        (el as HTMLElement).style.setProperty('--magnetic-y', moveY.toString());
        el.classList.add('magnetic-active');
      } else {
        // Outside range - reset
        (el as HTMLElement).style.setProperty('--magnetic-x', '0');
        (el as HTMLElement).style.setProperty('--magnetic-y', '0');
        el.classList.remove('magnetic-active');
      }
    });
  });

  // Reset all on mouse leave
  document.addEventListener('mouseleave', () => {
    const magneticElements = document.querySelectorAll('.btn-magnetic, .btn-primary, .btn-connect');
    magneticElements.forEach((el) => {
      (el as HTMLElement).style.setProperty('--magnetic-x', '0');
      (el as HTMLElement).style.setProperty('--magnetic-y', '0');
      el.classList.remove('magnetic-active');
    });
  });
}

// ============================================================================
// APPLICATION CLASS
// ============================================================================

/**
 * Main application class.
 * Coordinates all services and UI components.
 */
class VoiceAIApp {
  private isInitialized = false;
  private audioCleanup: (() => void) | null = null;

  /**
   * Initialize the application.
   * Must be called after DOM is ready.
   */
  initialize(): void {
    if (this.isInitialized) {
      console.warn('App already initialized');
      return;
    }

    // Check for admin route
    if (window.location.pathname === '/admin') {
      void this.initializeAdmin();
      return;
    }

    // Show loading skeleton while initializing
    initSkeletonUI();

    try {
      // Initialize theme system first (affects all UI)
      this.initializeTheme();

      // Initialize services (non-blocking)
      this.initializeServices();

      // Initialize UI components
      this.initializeUI();

      // Set up service callbacks
      this.setupServiceCallbacks();

      // Prompt for user name if needed
      this.promptForUserName();

      this.isInitialized = true;

      // Hide skeleton after a brief delay for smooth transition
      requestAnimationFrame(() => {
        setTimeout(() => {
          skeletonUI.hide();
          // Trigger entrance animations
          document.body.classList.add('app-loaded');

          // CRITICAL: Lock visibility after entrance animations complete.
          // The avatar is our "WALL-E" and must NEVER disappear!
          // The team roster must ALWAYS be clickable!
          // Entrance animations: avatar 700ms, roster up to 1030ms (730ms delay + 300ms anim)
          setTimeout(() => {
            const avatarContainer = document.querySelector('.avatar-container');
            avatarContainer?.classList.add('entrance-complete');

            const rosterContainer = document.querySelector('.entrance-roster');
            rosterContainer?.classList.add('entrance-complete');
          }, 1100); // Buffer after all animations complete
        }, 100);
      });

    } catch (error) {
      console.error('❌ Initialization failed:', error);
      skeletonUI.hide();
      messageUI.show('Failed to initialize. Please refresh.', 'error');
    }
  }

  /**
   * Connect to the AI advisor with timeout handling.
   */
  async connect(): Promise<void> {
    const persona = appState.get('selectedPersona');
    
    // Show immediate feedback - user tapped the button
    messageUI.show('Connecting...', 'info', 30000);
    
    // iOS CRITICAL: Create and resume AudioContext FIRST in user gesture
    // This must happen synchronously at the start of the click handler
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const tempCtx = new AudioCtx();
        await tempCtx.resume();
      }
    } catch (e) {
      console.debug('AudioContext pre-init:', e);
    }
    
    // Play connect sound (soundUI only - has debouncing for mobile)
    try {
      soundUI.play('connect');
    } catch (e) {
      console.debug('Sound play failed (OK on iOS):', e);
    }
    
    // Show thinking indicator with connection progress
    thinkingUI.show('Connecting');
    thinkingUI.showProgress(0); // Step 0: Authenticating
    waveformUI.setThinking(true);
    
    // Resume audio context (required after user interaction)
    try {
      await audioService.resumeContext();
    } catch (e) {
      console.debug('Audio resume failed:', e);
    }

    // Step 1: Joining room
    thinkingUI.showProgress(1);

    // Connect to LiveKit with timeout
    const CONNECTION_TIMEOUT = 30000; // 30 seconds
    let success = false;

    try {
      // Step 2: Connecting audio
      thinkingUI.showProgress(2);
      messageUI.show('Establishing connection...', 'info', 30000);

      const connectionPromise = connectionService.connect();
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT);
      });
      
      success = await Promise.race([connectionPromise, timeoutPromise]);
    } catch (error) {
      console.error('Connection failed:', error);
      thinkingUI.hideProgress();
      thinkingUI.hide();
      waveformUI.setThinking(false);
      
      // More helpful error messages
      let errorMessage = 'Connection failed. Please try again.';
      if (error instanceof Error) {
        if (error.message === 'Connection timeout') {
          errorMessage = 'Connection timed out. Check your internet.';
        } else if (error.message.includes('permission') || error.message.includes('Permission')) {
          errorMessage = 'Please allow microphone access.';
        } else if (error.message.includes('network') || error.message.includes('Network')) {
          errorMessage = 'Network error. Check your connection.';
        } else {
          errorMessage = `Error: ${error.message.slice(0, 50)}`;
        }
      }
      
      messageUI.show(errorMessage, 'error');
      soundUI.play('disconnect');

      // Error recovery animation - shake the connect button
      const connectBtn = document.getElementById('connectBtn');
      if (connectBtn) {
        connectBtn.classList.remove('error-shake');
        void connectBtn.offsetWidth; // Force reflow
        connectBtn.classList.add('error-shake');
        setTimeout(() => connectBtn.classList.remove('error-shake'), 400);
      }

      // Pulse the message for attention
      const messageContainer = document.getElementById('messageContainer');
      if (messageContainer) {
        messageContainer.classList.add('error-pulse');
        setTimeout(() => messageContainer.classList.remove('error-pulse'), 3000);
      }
      return;
    }
    
    // Step 3: Ready! Hide thinking indicator
    thinkingUI.showProgress(3);
    setTimeout(() => {
      thinkingUI.hideProgress();
      thinkingUI.hide();
    }, 300);
    waveformUI.setThinking(false);

    if (success) {
      // Start waveform and set persona
      waveformUI.start();
      waveformUI.setPersona(persona.id);
      avatarFeedback.setPersona(persona.id);
      
      // Particles disabled for cleaner professional look
      // void agentParticlesUI.start(persona.id);
      
      // Update all UI systems
      presenceUI.setConnected(true);
      // keyboardUI.setConnected(true);
      
      // Connection quality indicator disabled for clean UI
      // connectionQualityUI.show();
      // connectionQualityUI.setQuality('good');
      
      // Start session stats
      statsUI.startSession();
      statsUI.setPersona(persona.name);
      
      // Update gesture system
      gesturesUI.setCurrentPersona(persona.id);
      
      // Show success message
      messageUI.show(`Connected to ${persona.name}!`, 'success', 2000);
      
      // Celebrate the connection! 🎉
      delightService.celebrateConnection();
      delightService.haptic('medium');
      
      // First connection gets extra celebration
      // Minimal, zen aesthetic - no celebration effects on connection
      try {
        if (!localStorage.getItem('voiceai_first_connection')) {
          localStorage.setItem('voiceai_first_connection', 'true');
          // First connection noted silently
        }
      } catch {
        // Private browsing - continue without celebration
      }
      
      // Check microphone permission and show helpful message if denied
      void this.checkMicrophoneStatus();
      
      // Record conversation for engagement tracking
      greetingUI.recordConversation();
      
      // Check conversation milestones - zen aesthetic, no visual effects
      const convCount = greetingUI.getConversationCount();
      if ([5, 10, 25, 50, 100].includes(convCount)) {
        setTimeout(() => {
          const message = greetingUI.getMilestoneMessage('conversations', convCount);
          messageUI.show(message, 'success', 4000);
        }, 5000);
      }
    } else {
      messageUI.show('Connection failed. Try again.', 'error');
      soundUI.play('disconnect');
    }
  }

  /**
   * Disconnect from the AI advisor.
   */
  async disconnect(): Promise<void> {
    
    // Stop waveform visualization
    waveformUI.stop();
    
    // Clean up audio visualization
    if (this.audioCleanup) {
      this.audioCleanup();
      this.audioCleanup = null;
    }
    
    // Update all UI systems
    presenceUI.setConnected(false);
    presenceUI.setSpeaking(false);
    presenceUI.setListening(false);
    // keyboardUI.setConnected(false);
    connectionQualityUI.hide();
    transcriptUI.hide();
    
    // End session stats
    statsUI.endSession();
    
    // Pause Spotify if playing
    await spotifyService.pause();
    
    // Disconnect from LiveKit
    await connectionService.disconnect();
    
    // FIX BUG: Reset handoff service to clear stuck transition states
    handoffService.resetSession();
    
    // Play disconnect sound (soundUI only - has debouncing for mobile)
    soundUI.play('disconnect');
    
    // Reset audio state
    setAudioState('idle');
    
    // Update delight state
    delightService.onDisconnect();
    
    // Clear mood state (persona back to neutral)
    moodService.clearMood();
  }

  /**
   * Toggle microphone mute.
   */
  toggleMute(): void {
    const room = connectionService.getRoom();
    if (!room) return;

    const currentMuted = appState.get('isMuted');
    const newMuted = !currentMuted;

    // Toggle local audio track
    void room.localParticipant?.setMicrophoneEnabled(!newMuted);
    appState.set('isMuted', newMuted);

    messageUI.show(newMuted ? 'Microphone muted' : 'Microphone unmuted', 'info', 1500);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Initialize admin dashboard (alternate route).
   */
  private async initializeAdmin(): Promise<void> {
    console.log('🔧 Initializing Admin Dashboard...');
    
    // Clear the main app content and show admin container
    const appContent = document.getElementById('app') || document.body;
    appContent.innerHTML = `
      <div id="adminDashboard" style="min-height: 100vh; background: #0d0d1a; color: #fff;"></div>
      <a href="/" style="position: fixed; top: 1rem; left: 1rem; color: #4a6741; text-decoration: none; font-size: 0.875rem;">
        ← Back to App
      </a>
    `;
    
    // Inject admin styles
    injectAdminStyles();
    
    // Initialize the admin dashboard
    await initAdminDashboard();
    
    this.isInitialized = true;
  }

  /**
   * Initialize the theme system.
   * Sets up theme from localStorage/system preference and wires up toggle button.
   */
  private initializeTheme(): void {
    // Initialize theme from stored preference or system
    initTheme();

    // Start ambient warmth cycle (WALL-E style time-aware lighting)
    startAmbientCycle();

    // Initialize magnetic hover effect (WALL-E curiosity)
    initMagneticHover();

    // Wire up theme toggle button
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        toggleTheme();
      });

      // Add keyboard shortcut (T) for theme toggle
      document.addEventListener('keydown', (e) => {
        if (e.key === 't' || e.key === 'T') {
          // Don't toggle if user is typing in an input
          if (
            document.activeElement?.tagName !== 'INPUT' &&
            document.activeElement?.tagName !== 'TEXTAREA'
          ) {
            toggleTheme();
          }
        }
      });
    }

    // Listen for theme changes (for analytics or other systems)
    onThemeChange((_newTheme) => {
      // Reserved for future analytics/telemetry
    });

    // Set initial persona theme
    const persona = appState.get('selectedPersona');
    if (persona?.id) {
      this.updatePersonaTheme(persona.id);
    }
  }

  /**
   * Update the persona theme colors.
   */
  private updatePersonaTheme(personaId: PersonaId): void {
    // Use canonical persona IDs (CSS selectors now use these)
    const validIds = ['ferni', 'peter-lynch', 'alex-chen', 'maya-santos', 'jordan-taylor', 'nayan-patel'];
    const themePersona = validIds.includes(personaId) ? personaId : 'ferni';
    setThemePersona(themePersona as Parameters<typeof setThemePersona>[0]);
  }

  /**
   * Initialize all services.
   * IMPORTANT: Services should NOT block UI initialization, especially on iOS.
   */
  private initializeServices(): void {
    // Initialize audio service (non-blocking - loads sounds in background)
    try {
      audioService.initialize();
    } catch (err) {
      console.warn('⚠️ Audio service init failed:', err);
      // Continue anyway - sounds are nice but not critical
    }

    // Initialize mood service (connects humanizing system to UI)
    moodService.init();

    // Initialize Spotify silently in the background
    // iTunes is the default for everyone, so no need to show Spotify status
    void spotifyService.initialize().then((_success) => {
      // Spotify integration ready (or fell back to iTunes)
    }).catch((_err) => {
      // No error shown - iTunes is the default anyway
    });
  }

  /**
   * Safe UI initialization wrapper - catches errors so one module doesn't break the app.
   */
  private safeInit(name: string, initFn: () => void): void {
    try {
      initFn();
    } catch (error) {
      console.error(`Failed to initialize ${name}:`, error);
      // Continue loading other modules
    }
  }

  /**
   * Initialize all UI components.
   */
  private initializeUI(): void {
    // ⚡ Initialize GSAP for GPU-accelerated animations
    this.safeInit('GSAP', () => {
      initGSAP();
      // Promote frequently animated elements to GPU layers
      promoteAllToGPU('.waveform-bar, .team-avatar, .btn, #coachAvatar');
    });

    // Core UI - Initialize in order of dependency (these are critical)
    this.safeInit('MessageUI', () => initMessageUI());
    this.safeInit('WaveformUI', () => initWaveformUI());
    this.safeInit('CoachUI', () => initCoachUI());
    this.safeInit('TeamUI', () => initTeamUI());
    this.safeInit('SpotifyUI', () => initSpotifyUI());
    this.safeInit('ControlsUI', () => initControlsUI({
      onConnect: () => { void this.connect(); },
      onDisconnect: () => { void this.disconnect(); },
      onMuteToggle: () => this.toggleMute(),
    }));
    
    // Premium Features - Initialize all the delightful extras (non-critical)
    this.safeInit('SoundUI', () => initSoundUI());
    this.safeInit('CelebrationsUI', () => initCelebrationsUI());
    this.safeInit('StatsUI', () => initStatsUI());
    this.safeInit('PresenceUI', () => initPresenceUI());
    this.safeInit('RippleUI', () => initRippleUI());
    this.safeInit('MicroInteractionsUI', () => initMicroInteractions()); // ✨ Pixar button effects
    this.safeInit('TranscriptUI', () => initTranscriptUI());
    this.safeInit('ThinkingUI', () => initThinkingUI());
    this.safeInit('ConnectionQualityUI', () => initConnectionQualityUI());
    this.safeInit('EasterEggsUI', () => initEasterEggsUI());
    this.safeInit('MoodUI', () => initMoodUI());
    this.safeInit('AvatarFeedback', () => initAvatarFeedback()); // ✨ For music dancing!
    // 🎬 Animation Orchestrator - Pixar-quality coordinated animations
    this.safeInit('AnimationOrchestrator', () => initAnimationOrchestrator());
    // Agent particles disabled for cleaner professional UI
    // this.safeInit('AgentParticlesUI', () => void initAgentParticles());
    
    // Show personalized greeting and track visit
    this.showWelcome();
    
    // Keyboard shortcuts with app callbacks (disabled for now)
    // initKeyboardUI({
    //   onConnect: () => { void this.connect(); },
    //   onDisconnect: () => { void this.disconnect(); },
    //   onSelectPersona: (personaId: PersonaId) => { this.selectPersona(personaId); },
    // });
    
    // Gesture support for mobile with swipe navigation
    initGesturesUI({
      onSwipeLeft: () => { 
        const next = gesturesUI.getNextPersona();
        this.selectPersona(next);
        soundUI.play('switch');
      },
      onSwipeRight: () => { 
        const prev = gesturesUI.getPreviousPersona();
        this.selectPersona(prev);
        soundUI.play('switch');
      },
      onLongPress: (_element) => {
        // Could show context menu in the future
      },
    });
    
    // 🏪 Marketplace button - opens agent marketplace modal
    const marketplaceBtn = document.getElementById('marketplaceBtn');
    if (marketplaceBtn) {
      marketplaceBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent team roster from handling this
        marketplaceUI.open();
      });
    }
  }
  
  /**
   * Select a persona (for keyboard shortcuts and gestures).
   * Now with Pixar-quality transition animations!
   */
  selectPersona(personaId: PersonaId): void {
    const currentPersona = appState.get('selectedPersona');
    const persona = getPersona(personaId);

    // 🎬 Animate the transition with Pixar principles
    void animatePersonaTransition(currentPersona.id, personaId);

    // Update state
    setSelectedPersona(personaId);

    // Update theme persona colors
    this.updatePersonaTheme(personaId);

    // Update UI
    coachUI.updatePersona(persona);
    waveformUI.setPersona(personaId);
    teamUI.setActive(personaId);
    gesturesUI.setCurrentPersona(personaId);
    statsUI.setPersona(persona.name);
    thinkingUI.setPersona(personaId); // Persona-specific thinking messages
    avatarFeedback.setPersona(personaId); // Persona-specific idle behaviors

    // Play sound
    soundUI.play('switch');

    // If connected, request handoff
    if (appState.get('connection') === 'connected') {
      this.requestHandoff(personaId);
    }

  }
  
  /**
   * Show personalized welcome message and track engagement.
   */
  private showWelcome(): void {
    // Record visit
    greetingUI.recordVisit();
    
    // Get personalized greeting
    const greeting = greetingUI.getGreeting();
    
    // Show greeting as helper text
    messageUI.setHelper(greeting);
    
    // Check for streak milestone
    const streakMilestone = greetingUI.checkStreakMilestone();
    if (streakMilestone) {
      // Celebrate streak milestone - warm acknowledgement
      setTimeout(() => {
        const message = greetingUI.getMilestoneMessage('streak', streakMilestone);
        messageUI.show(message, 'success', 4000);
        celebrationsUI.warmthGlow({ intensity: 'warm' });
        soundUI.play('success');
      }, 2000);
    }
    
    // Show streak badge if streak >= 3
    const streak = greetingUI.getStreak();
    if (streak >= 3) {
      this.showStreakBadge(streak);
    }
    
    // Create ambient particles for atmosphere
    moodUI.createAmbientParticles();
  }
  
  /**
   * Show streak badge.
   */
  private showStreakBadge(streak: number): void {
    // Check if badge already exists
    if (document.getElementById('streakBadge')) return;
    
    const badge = document.createElement('div');
    badge.id = 'streakBadge';
    badge.className = 'streak-badge';
    badge.innerHTML = `
      <span class="streak-count">${streak}</span>
      <span class="streak-label">day streak</span>
    `;
    
    document.body.appendChild(badge);
    
    // Animate in after a delay
    setTimeout(() => {
      badge.classList.add('visible');
    }, 1000);
  }

  /**
   * Check microphone permission and show helpful message if denied.
   */
  private checkMicrophoneStatus(): void {
    try {
      // Check if we have an audio track enabled
      const room = connectionService.getRoom();
      const localParticipant = room?.localParticipant;
      
      if (localParticipant) {
        const audioTracks = localParticipant.getTrackPublications() as Array<{ kind?: string; track?: unknown }>;
        const hasAudio = audioTracks.some(
          (pub) => pub.kind === 'audio' && pub.track
        );
        
        if (!hasAudio) {
          // Mic permission was likely denied - show subtle prompt
          setTimeout(() => {
            messageUI.show('Microphone access enables conversation', 'info', 4000);
          }, 3000);
        }
      }
    } catch {
      // Ignore errors in permission check
    }
  }

  /**
   * Request handoff to a different persona while connected.
   */
  private requestHandoff(targetPersonaId: PersonaId): void {
    const room = connectionService.getRoom();
    if (!room?.localParticipant) return;
    
    const message = JSON.stringify({
      type: 'handoff_request',
      target: targetPersonaId,
      timestamp: Date.now(),
    });
    
    room.localParticipant.publishData(
      new TextEncoder().encode(message),
      { reliable: true }
    ).catch(err => console.error('Handoff request failed:', err));
  }

  /**
   * Set up callbacks for service events.
   */
  private setupServiceCallbacks(): void {
    // Connection service callbacks
    connectionService.setCallbacks({
      onStateChange: (state) => {
        
        // Update presence and waveform based on connection state
        if (state === 'connecting') {
          thinkingUI.show('Connecting');
          waveformUI.setThinking(true);
        } else if (state === 'connected') {
          thinkingUI.hide();
          waveformUI.setThinking(false);
        } else if (state === 'disconnected') {
          presenceUI.setConnected(false);
          connectionQualityUI.hide();
          waveformUI.stop();
          // agentParticlesUI.stop();
        }
      },

      onAgentConnected: () => {
        const persona = appState.get('activePersona');
        messageUI.show(`${persona.name} joined`, 'success', 2000);
        
        // Avatar reaction
        presenceUI.bounce();
        soundUI.play('success');
      },

      onAgentDisconnected: () => {
        messageUI.show('Advisor disconnected', 'info', 2000);
        presenceUI.setSpeaking(false);
      },

      onDataMessage: (message) => {
        this.handleDataMessage(message);
        statsUI.incrementMessages();
      },

      onAudioTrack: (audioElement, _participantId, mediaStreamTrack) => {
        // Enable audio visualization using the MediaStreamTrack (works better for WebRTC)
        // Falls back to audio element if track not available
        void this.attachAudioVisualization(audioElement, mediaStreamTrack);
        setAudioState('speaking');
        // Set speaking state directly - don't rely only on volume detection
        waveformUI.setSpeaking(true);
        presenceUI.setSpeaking(true);
        // Agent is speaking, so we're not in listening mode
        waveformUI.setListening(false);
      },

      onAudioTrackEnd: (_participantId) => {
        // Agent stopped speaking
        waveformUI.setSpeaking(false);
        presenceUI.setSpeaking(false);
        setAudioState('listening');
        // Now we're listening for user input
        waveformUI.setListening(true);
      },

      onLocalMicActive: (isActive) => {
        // When user's mic is active, show listening state
        waveformUI.setListening(isActive);
        presenceUI.setListening(isActive);
      },

      // Connection quality monitoring disabled for clean UI
      // onConnectionQuality: (latencyMs) => {
      //   connectionQualityUI.updateFromLatency(latencyMs);
      // },

      onError: (error) => {
        console.error('Connection error:', error);
        messageUI.show(`Error: ${error.message}`, 'error');
        thinkingUI.hide();
        waveformUI.setThinking(false);
      },
    });

    // Handoff service callbacks
    
    // When handoff starts - show transitioning state
    // FIX BUG: Store timeout ID for cleanup
    let handoffUITimeout: ReturnType<typeof setTimeout> | null = null;
    
    handoffService.onHandoffStart((toPersona, _fromPersona) => {
      console.log(`🚀 [App] onHandoffStart: toPersona=${toPersona}`);
      // Show shimmer effect on waveform
      waveformUI.setTransitioning(true);
      
      // Show handoff progress indicator
      const handoffProgress = document.getElementById('handoffProgress');
      const handoffTargetName = document.getElementById('handoffTargetName');
      if (handoffProgress && handoffTargetName) {
        const persona = getPersona(toPersona);
        handoffTargetName.textContent = persona.name;
        handoffProgress.classList.remove('hidden');
        console.log(`📍 [App] Showing handoff progress for ${persona.name}`);
      } else {
        console.warn(`⚠️ [App] handoffProgress element not found!`);
      }
      
      // FIX BUG: Safety timeout - force hide UI after 20 seconds max
      if (handoffUITimeout) clearTimeout(handoffUITimeout);
      handoffUITimeout = setTimeout(() => {
        console.warn(`⏰ [App] Safety timeout - forcing handoff UI cleanup`);
        waveformUI.setTransitioning(false);
        const progress = document.getElementById('handoffProgress');
        if (progress) progress.classList.add('hidden');
        thinkingUI.hide();
      }, 20000);
    });
    
    // When handoff completes - agent is ready to speak
    handoffService.onHandoffComplete((toPersona) => {
      console.log(`✅ [App] onHandoffComplete: toPersona=${toPersona}`);
      // FIX BUG: Clear safety timeout
      if (handoffUITimeout) { clearTimeout(handoffUITimeout); handoffUITimeout = null; }
      
      // End shimmer, return to normal
      waveformUI.setTransitioning(false);
      
      // Hide handoff progress indicator
      const handoffProgress = document.getElementById('handoffProgress');
      if (handoffProgress) {
        handoffProgress.classList.add('hidden');
        console.log(`📍 [App] Hiding handoff progress`);
      }
      // Also make sure thinking is hidden
      thinkingUI.hide();
    });
    
    // When handoff fails - hide indicator and show error
    handoffService.onHandoffFailed((error, targetPersona) => {
      console.log(`❌ [App] onHandoffFailed: error=${error}, target=${targetPersona}`);
      // FIX BUG: Clear safety timeout
      if (handoffUITimeout) { clearTimeout(handoffUITimeout); handoffUITimeout = null; }
      
      waveformUI.setTransitioning(false);
      
      const handoffProgress = document.getElementById('handoffProgress');
      if (handoffProgress) {
        handoffProgress.classList.add('hidden');
      }
      thinkingUI.hide();
      messageUI.show(`Transfer failed: ${error}`, 'error', 3000);
    });
    
    // When handoff is cancelled - hide indicator
    handoffService.onHandoffCancelled((targetPersona, reason) => {
      console.log(`🚫 [App] onHandoffCancelled: target=${targetPersona}, reason=${reason}`);
      // FIX BUG: Clear safety timeout
      if (handoffUITimeout) { clearTimeout(handoffUITimeout); handoffUITimeout = null; }
      
      waveformUI.setTransitioning(false);
      
      const handoffProgress = document.getElementById('handoffProgress');
      if (handoffProgress) {
        handoffProgress.classList.add('hidden');
      }
      thinkingUI.hide();
    });
    
    // Main handoff callback (plays sounds, updates UI)
    handoffService.onHandoff((handoff) => {
      console.log(`🎉 [App] onHandoff: toPersona=${handoff.toPersona}, fromPersona=${handoff.fromPersona}`);
      
      // Get the NEW persona directly from the handoff, not from state
      const newPersona = getPersona(handoff.toPersona);
      const enhanced = handoff as { entrancePhrase?: string; isFirstMeeting?: boolean };

      // FIX BUG: Clean up any stuck transition UI state
      // This handles legacy single-message handoffs that don't have separate start/complete
      waveformUI.setTransitioning(false);
      const handoffProgress = document.getElementById('handoffProgress');
      if (handoffProgress) {
        handoffProgress.classList.add('hidden');
      }
      // Also hide thinking indicator in case it's stuck
      thinkingUI.hide();

      // 🎬 Pixar-style celebration on handoff
      const avatarContainer = document.querySelector('.avatar-container');
      if (avatarContainer instanceof HTMLElement) {
        void playPixarReaction(avatarContainer, 'joy', newPersona.id);
      }
      coachUI.flash();

      // Update theme persona colors
      this.updatePersonaTheme(newPersona.id);

      // Update all UI systems
      waveformUI.setPersona(newPersona.id);
      gesturesUI.setCurrentPersona(newPersona.id);
      statsUI.setPersona(newPersona.name);
      // Particles disabled for cleaner look
      // void agentParticlesUI.setPersona(newPersona.id);
      
      // Play switch sound
      soundUI.play('switch');
      
      // Show entrance phrase or welcome message
      if (enhanced.isFirstMeeting && enhanced.entrancePhrase) {
        // First time meeting - warm welcome
        messageUI.show(enhanced.entrancePhrase, 'success', 3000);
        celebrationsUI.connectionWarmth();
      } else {
        // Returning - show shorter message
        messageUI.show(`${newPersona.name} is back!`, 'success', 2000);
      }
      
      // Update waveform colors to match persona
      if (newPersona.colors) {
        waveformUI.setEmotion('neutral', 0.7);
      }
    });

    // Spotify state changes
    spotifyService.onStateChange((state, trackInfo) => {
      if (state === 'playing' && trackInfo) {
        messageUI.show(`Now playing: ${trackInfo.name}`, 'info', 3000);
      }
    });
  }

  /**
   * Handle incoming data messages from the agent.
   */
  private handleDataMessage(message: DataMessage): void {
    // Try to process as handoff (async - fire and forget)
    void handoffService.processDataMessage(message);

    // Try to process as mood update (from humanizing system)
    if (moodService.isMoodUpdate(message)) {
      moodService.processMoodUpdate(message);
      return;
    }

    // Try to process as celebration
    if (isCelebrationMessage(message)) {
      this.handleCelebration(message);
      return;
    }

    // Try to process as emotion update
    if (isEmotionMessage(message)) {
      this.handleEmotion(message);
      return;
    }

    // Try to process as expression (emoji morph)
    if (isExpressionMessage(message)) {
      this.handleExpression(message);
      return;
    }

    // Try to process as persona mood update
    if (isMoodMessage(message)) {
      this.handleMood(message);
      return;
    }

    // ✨ Try to process as music event (for avatar dancing)
    if (isMusicMessage(message)) {
      this.handleMusic(message);
      return;
    }

    // Handle other message types
    switch (message.type) {
      case 'spotify':
        // Spotify-related message
        break;

      case 'status':
        // Status update
        if (typeof message['text'] === 'string') {
          messageUI.show(message['text'], 'info');
        }
        break;

      default:
    }
  }

  /**
   * Handle celebration events from the agent.
   * Zen aesthetic: warmth and breathing, not explosions.
   */
  private handleCelebration(event: CelebrationEvent): void {

    // Milestone/achievement - warm acknowledgement
    if (event.celebrationType === 'milestone' || event.celebrationType === 'achievement') {
      celebrationsUI.warmthGlow({ intensity: 'warm' });
      delightService.haptic('light');
      waveformUI.celebrate();
      
      if (event.message) {
        celebrationsUI.celebrateMilestone(event.message);
      }
    }

    // Aha moment / good news - gentle recognition
    if (event.celebrationType === 'aha_moment' || event.celebrationType === 'good_news') {
      celebrationsUI.gentleBounce();
      celebrationsUI.warmthGlow({ intensity: 'gentle' });
      soundUI.play('success');
      delightService.haptic('light');
      presenceUI.bounce();
      // Flash encouraging emotion for aha moments
      presenceUI.flashEmotion('encouraging', 800);
    }
  }

  /**
   * Handle emotion events from voice prosody analysis.
   * Updates waveform particles to reflect detected user emotion.
   */
  private handleEmotion(event: EmotionEvent): void {
    
    // Lower threshold (40%) for more responsive emotion display
    if (event.confidence < 0.4) return;
    
    // Update waveform with emotion shape (smile, frown, etc.)
    waveformUI.setEmotion(event.emotion, event.intensity);
    
    // Update coach avatar glow based on emotion
    coachUI.setEmotion?.(event.emotion);
    
    // Update presence glow to reflect voice emotion (design system integration)
    // Map event emotions to design system voice emotions
    const emotionMap: Record<string, 'neutral' | 'happy' | 'excited' | 'calm' | 'thoughtful' | 'empathetic' | 'serious' | 'anxious' | 'encouraging'> = {
      'neutral': 'neutral',
      'happy': 'happy',
      'sad': 'empathetic',      // Sad → empathetic glow (supportive)
      'anxious': 'anxious',
      'excited': 'excited',
      'frustrated': 'serious',   // Frustrated → serious glow (grounded)
      'calm': 'calm',
    };
    const voiceEmotion = emotionMap[event.emotion] || 'neutral';
    presenceUI.setVoiceEmotion(voiceEmotion);
    
    // Also update intensity based on event intensity
    if (event.intensity > 0.8) {
      presenceUI.setSpeakingIntensity('exclamation');
    } else if (event.intensity > 0.6) {
      presenceUI.setSpeakingIntensity('emphasis');
    } else if (event.intensity < 0.3) {
      presenceUI.setSpeakingIntensity('whisper');
    } else {
      presenceUI.setSpeakingIntensity('normal');
    }
  }

  /**
   * Handle expression events from agents.
   * (Emoji morphing disabled for now - may revisit later)
   */
  private handleExpression(_event: ExpressionEvent): void {
    // Future: could show emoji in UI or trigger visual effect
  }

  /**
   * Handle persona mood events from the humanizing system.
   * Creates subtle UI changes to reflect the AI's "emotional" state.
   */
  private handleMood(event: MoodEvent): void {
    // Update mood UI with new state
    moodUI.setPersonaMood(
      event.state,
      event.energyLevel,
      event.relationshipStage,
      event.hasTransition || false
    );

    // If there's a relationship transition, also show a delight moment
    if (event.hasTransition) {
      delightService.haptic('medium');
    }
  }

  /**
   * ✨ Handle music events from the agent.
   * Makes the avatar DANCE when music is playing - pure magic!
   */
  private handleMusic(event: MusicEvent): void {
    console.log('[App] 🎵 Music event:', event.state, event.trackName);
    
    if (event.state === 'playing') {
      // ✨ START DANCING! ✨
      avatarFeedback.dancing();
      
      // Also pulse the waveform with excitement
      waveformUI.celebrate();
      
      // Subtle haptic for music start
      delightService.haptic('light');
      
      // Show track info briefly (optional)
      if (event.trackName && event.artistName) {
        messageUI.show(`Now playing: ${event.trackName} - ${event.artistName}`, 'info', 3000);
      }
      
      console.log('[App] ✨ Avatar is now dancing to:', event.trackName);
    } else if (event.state === 'paused' || event.state === 'stopped' || event.state === 'idle') {
      // Stop dancing
      avatarFeedback.stopDancing();
      console.log('[App] Avatar stopped dancing');
    }
  }

  /**
   * Attach audio visualization to an audio element or track.
   * Uses MediaStreamTrack for better WebRTC support, falls back to audio element.
   */
  private async attachAudioVisualization(audioElement: HTMLAudioElement, mediaStreamTrack?: MediaStreamTrack): Promise<void> {
    // Clean up previous
    if (this.audioCleanup) {
      this.audioCleanup();
    }

    const volumeCallback = (volume: number) => {
      waveformUI.setVolume(volume);
      coachUI.setVolume(volume);
    };

    // Prefer MediaStreamTrack - works better for WebRTC streams
    if (mediaStreamTrack) {
      this.audioCleanup = await audioService.attachVisualization(mediaStreamTrack, volumeCallback);
    } else {
      this.audioCleanup = audioService.attachAudioElementVisualization(audioElement, volumeCallback);
    }
  }

  /**
   * Prompt for user name if not set.
   */
  private promptForUserName(): void {
    const currentName = appState.get('userName');
    if (currentName) return;

    // For now, use a default name
    // In production, you'd show a modal or use the name input
    const defaultName = 'User';
    setUserName(defaultName);
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    // Clean up audio
    if (this.audioCleanup) {
      this.audioCleanup();
      this.audioCleanup = null;
    }

    // Dispose services
    audioService.dispose();
    spotifyService.dispose();

    // Disconnect if connected
    void connectionService.disconnect();

    // Dispose core UI components
    teamUI.dispose();
    messageUI.dispose();
    controlsUI.dispose();
    waveformUI.dispose();
    
    // Dispose premium UI features
    soundUI.dispose();
    gesturesUI.dispose();
    celebrationsUI.dispose();
    statsUI.dispose();
    presenceUI.dispose();
    rippleUI.dispose();
    easterEggsUI.dispose();
    microInteractionsUI.dispose(); // ✨ Clean up Pixar button effects
    // keyboardUI.dispose();
    transcriptUI.dispose();
    thinkingUI.dispose();
    connectionQualityUI.dispose();
    moodUI.dispose();

    this.isInitialized = false;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton application instance.
 */
export const app = new VoiceAIApp();

// ============================================================================
// AUTO-INITIALIZE ON DOM READY
// ============================================================================

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void app.initialize();
    });
  } else {
    // DOM already ready
    void app.initialize();
  }
}

