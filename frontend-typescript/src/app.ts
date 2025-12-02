/**
 * Voice AI Application
 *
 * Main application orchestrator that ties together all services and UI components.
 * A premium experience that rivals Apple and Google.
 */

import type { DataMessage, CelebrationEvent, EmotionEvent, ExpressionEvent } from './types/events.js';
import type { PersonaId } from './types/persona.js';
import { isCelebrationMessage, isEmotionMessage, isExpressionMessage } from './types/events.js';

// Theme system
import { initTheme, toggleTheme, setPersona as setThemePersona, onThemeChange } from './theme/index.js';

// State
import { appState, setUserName, setAudioState, setSelectedPersona } from './state/app.state.js';

// Services
import {
  connectionService,
  audioService,
  handoffService,
  spotifyService,
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
import { keyboardUI, initKeyboardUI } from './ui/keyboard.ui.js';
import { transcriptUI, initTranscriptUI } from './ui/transcript.ui.js';
import { thinkingUI, initThinkingUI } from './ui/thinking.ui.js';
import { connectionQualityUI, initConnectionQualityUI } from './ui/connection-quality.ui.js';
import { greetingUI } from './ui/greeting.ui.js';
import { moodUI, initMoodUI } from './ui/mood.ui.js';
// Agent particles disabled for cleaner UI
// import { agentParticlesUI, initAgentParticles } from './ui/agent-particles.ui.js';

// Config
import { getPersona } from './config/personas.js';

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
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('App already initialized');
      return;
    }

    console.log('🚀 Initializing Voice AI...');

    try {
      // Initialize theme system first (affects all UI)
      this.initializeTheme();

      // Initialize services
      await this.initializeServices();

      // Initialize UI components
      this.initializeUI();

      // Set up service callbacks
      this.setupServiceCallbacks();

      // Prompt for user name if needed
      this.promptForUserName();

      this.isInitialized = true;
      console.log('✅ Voice AI ready!');

    } catch (error) {
      console.error('❌ Initialization failed:', error);
      messageUI.show('Failed to initialize. Please refresh.', 'error');
    }
  }

  /**
   * Connect to the AI advisor with timeout handling.
   */
  async connect(): Promise<void> {
    const persona = appState.get('selectedPersona');
    console.log(`📞 Connecting to ${persona.name}...`);
    
    // Show immediate feedback - user tapped the button
    messageUI.show('Connecting...', 'info', 30000);
    
    // iOS CRITICAL: Create and resume AudioContext FIRST in user gesture
    // This must happen synchronously at the start of the click handler
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const tempCtx = new AudioCtx();
        await tempCtx.resume();
        console.log('🔊 iOS AudioContext unlocked');
      }
    } catch (e) {
      console.debug('AudioContext pre-init:', e);
    }
    
    // Play connect sound (both old and new systems)
    try {
      await audioService.playSound('connect');
      soundUI.play('connect');
    } catch (e) {
      console.debug('Sound play failed (OK on iOS):', e);
    }
    
    // Show thinking indicator and update waveform state
    thinkingUI.show('Connecting');
    waveformUI.setThinking(true);
    
    // Resume audio context (required after user interaction)
    try {
      await audioService.resumeContext();
    } catch (e) {
      console.debug('Audio resume failed:', e);
    }
    
    // Connect to LiveKit with timeout
    const CONNECTION_TIMEOUT = 30000; // 30 seconds
    let success = false;
    
    try {
      console.log('📡 Starting LiveKit connection...');
      messageUI.show('Establishing connection...', 'info', 30000);
      
      const connectionPromise = connectionService.connect();
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT);
      });
      
      success = await Promise.race([connectionPromise, timeoutPromise]);
      console.log('📡 Connection result:', success);
    } catch (error) {
      console.error('Connection failed:', error);
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
      return;
    }
    
    // Hide thinking indicator
    thinkingUI.hide();
    waveformUI.setThinking(false);
    
    if (success) {
      // Start waveform and set persona
      waveformUI.start();
      waveformUI.setPersona(persona.id);
      
      // Particles disabled for cleaner professional look
      // void agentParticlesUI.start(persona.id);
      
      // Update all UI systems
      presenceUI.setConnected(true);
      keyboardUI.setConnected(true);
      
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
      this.checkMicrophoneStatus();
      
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
    console.log('📴 Disconnecting...');
    
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
    keyboardUI.setConnected(false);
    connectionQualityUI.hide();
    transcriptUI.hide();
    
    // End session stats
    statsUI.endSession();
    
    // Pause Spotify if playing
    await spotifyService.pause();
    
    // Disconnect from LiveKit
    await connectionService.disconnect();
    
    // Play disconnect sound
    await audioService.playSound('disconnect');
    soundUI.play('disconnect');
    
    // Reset audio state
    setAudioState('idle');
    
    // Update delight state
    delightService.onDisconnect();
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
   * Initialize the theme system.
   * Sets up theme from localStorage/system preference and wires up toggle button.
   */
  private initializeTheme(): void {
    // Initialize theme from stored preference or system
    const theme = initTheme();
    console.log(`🎨 Theme initialized: ${theme}`);

    // Wire up theme toggle button
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const newTheme = toggleTheme();
        console.log(`🎨 Theme toggled to: ${newTheme}`);
      });
    }

    // Listen for theme changes (for analytics or other systems)
    onThemeChange((newTheme) => {
      console.log(`🎨 Theme changed: ${newTheme}`);
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
    // Map app persona IDs to theme persona IDs
    const themePersonaMap: Record<string, string> = {
      'jack-b': 'ferni',
      'jack-bogle': 'jack-bogle',
      'peter-lynch': 'peter-lynch',
      'comm-specialist': 'alex-chen',
      'spend-save': 'maya-santos',
      'event-planner': 'jordan-taylor',
    };
    const themePersona = themePersonaMap[personaId] || 'ferni';
    setThemePersona(themePersona as Parameters<typeof setThemePersona>[0]);
  }

  /**
   * Initialize all services.
   * IMPORTANT: Services should NOT block UI initialization, especially on iOS.
   */
  private async initializeServices(): Promise<void> {
    // Initialize audio service (non-blocking - loads sounds in background)
    try {
      await audioService.initialize();
    } catch (err) {
      console.warn('⚠️ Audio service init failed:', err);
      // Continue anyway - sounds are nice but not critical
    }

    // Initialize Spotify silently in the background
    // iTunes is the default for everyone, so no need to show Spotify status
    spotifyService.initialize().then((success) => {
      if (success) {
        console.log('🎵 Spotify ready (silent) - available as upgrade if user requests');
      } else {
        console.log('🎵 Spotify not available - using iTunes previews (default)');
      }
    }).catch((err) => {
      console.log('🎵 Spotify init skipped:', err);
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
    this.safeInit('TranscriptUI', () => initTranscriptUI());
    this.safeInit('ThinkingUI', () => initThinkingUI());
    this.safeInit('ConnectionQualityUI', () => initConnectionQualityUI());
    this.safeInit('EasterEggsUI', () => initEasterEggsUI());
    this.safeInit('MoodUI', () => initMoodUI());
    // Agent particles disabled for cleaner professional UI
    // this.safeInit('AgentParticlesUI', () => void initAgentParticles());
    
    // Show personalized greeting and track visit
    this.showWelcome();
    
    // Keyboard shortcuts with app callbacks
    initKeyboardUI({
      onConnect: () => { void this.connect(); },
      onDisconnect: () => { void this.disconnect(); },
      onSelectPersona: (personaId: PersonaId) => { this.selectPersona(personaId); },
    });
    
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
      onLongPress: (element) => {
        console.log('Long press on:', element);
        // Could show context menu in the future
      },
    });
  }
  
  /**
   * Select a persona (for keyboard shortcuts and gestures).
   */
  selectPersona(personaId: PersonaId): void {
    const persona = getPersona(personaId);

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

    // Play sound
    soundUI.play('switch');

    // If connected, request handoff
    if (appState.get('connection') === 'connected') {
      this.requestHandoff(personaId);
    }

    console.log(`✅ Persona selected: ${persona.name}`);
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
      // Celebrate streak milestone!
      setTimeout(() => {
        const message = greetingUI.getMilestoneMessage('streak', streakMilestone);
        messageUI.show(message, 'success', 4000);
        celebrationsUI.sparkles({ count: 30 });
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
      <span class="streak-fire">🔥</span>
      <span class="streak-count">${streak}</span>
      <span>day streak</span>
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
  private async checkMicrophoneStatus(): Promise<void> {
    try {
      // Check if we have an audio track enabled
      const room = connectionService.getRoom();
      const localParticipant = room?.localParticipant;
      
      if (localParticipant) {
        const audioTracks = localParticipant.getTrackPublications();
        const hasAudio = Array.from(audioTracks.values()).some(
          pub => pub.kind === 'audio' && pub.track
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
        console.log(`🔌 Connection state: ${state}`);
        
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

      onAgentConnected: (participantId) => {
        console.log(`🤖 Agent joined: ${participantId}`);
        const persona = appState.get('activePersona');
        messageUI.show(`${persona.name} joined`, 'success', 2000);
        
        // Avatar reaction
        presenceUI.bounce();
        soundUI.play('success');
      },

      onAgentDisconnected: () => {
        console.log('🤖 Agent left');
        messageUI.show('Advisor disconnected', 'info', 2000);
        presenceUI.setSpeaking(false);
      },

      onDataMessage: (message) => {
        this.handleDataMessage(message);
        statsUI.incrementMessages();
      },

      onAudioTrack: (audioElement, participantId, mediaStreamTrack) => {
        console.log(`🔊 Audio track from: ${participantId}`);
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

      onAudioTrackEnd: (participantId) => {
        console.log(`🔇 Audio track ended from: ${participantId}`);
        // Agent stopped speaking
        waveformUI.setSpeaking(false);
        presenceUI.setSpeaking(false);
        setAudioState('listening');
        // Now we're listening for user input
        waveformUI.setListening(true);
      },

      onLocalMicActive: (isActive) => {
        console.log(`🎤 User microphone: ${isActive ? 'active' : 'inactive'}`);
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
    handoffService.onHandoffStart((toPersona, fromPersona) => {
      console.log(`🔄 Handoff starting: ${fromPersona} → ${toPersona}`);
      // Show shimmer effect on waveform
      waveformUI.setTransitioning(true);
    });
    
    // When handoff completes - agent is ready to speak
    handoffService.onHandoffComplete((toPersona) => {
      console.log(`✅ Handoff complete: ${toPersona} ready`);
      // End shimmer, return to normal
      waveformUI.setTransitioning(false);
    });
    
    // Main handoff callback (plays sounds, updates UI)
    handoffService.onHandoff((handoff) => {
      // Get the NEW persona directly from the handoff, not from state
      const newPersona = getPersona(handoff.toPersona);
      const fromPersona = getPersona(handoff.fromPersona);
      const enhanced = handoff as { entrancePhrase?: string; isFirstMeeting?: boolean };

      console.log(`🔄 Handoff: ${fromPersona.name} → ${newPersona.name} (role: ${newPersona.role})`);

      // Flash the coach avatar
      coachUI.flash();
      presenceUI.bounce();

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
        // First time meeting - show dramatic entrance with sparkles
        messageUI.show(enhanced.entrancePhrase, 'success', 3000);
        celebrationsUI.sparkles({ count: 30 });
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

    // Handle other message types
    switch (message.type) {
      case 'spotify':
        // Spotify-related message
        console.log('Spotify message:', message);
        break;

      case 'status':
        // Status update
        if (typeof message['text'] === 'string') {
          messageUI.show(message['text'], 'info');
        }
        break;

      default:
        console.log('Unknown data message:', message);
    }
  }

  /**
   * Handle celebration events from the agent.
   * Uses fireworks for major achievements (professional, not gamified)
   * Uses sparkles for lighter moments
   */
  private handleCelebration(event: CelebrationEvent): void {
    console.log('🎆 Celebration event:', event);

    // Zen aesthetic - minimal visual effects, focus on the moment
    if (event.celebrationType === 'milestone' || event.celebrationType === 'achievement') {
      // Subtle celebration - just a small firework burst
      celebrationsUI.fireworks(1);
      delightService.haptic('light');
      
      // Waveform celebration effect (bar dance)
      waveformUI.celebrate();
      // void agentParticlesUI.burst(25);
      
      // Show milestone toast
      if (event.message) {
        celebrationsUI.celebrateMilestone(event.message);
      }
    }

    // Lighter celebration for aha moments and good news
    if (event.celebrationType === 'aha_moment' || event.celebrationType === 'good_news') {
      celebrationsUI.sparkles({ count: 20 });
      soundUI.play('success');
      delightService.haptic('medium');
      presenceUI.bounce();
      waveformUI.celebrate();
    }
  }

  /**
   * Handle emotion events from voice prosody analysis.
   * Updates waveform particles to reflect detected user emotion.
   */
  private handleEmotion(event: EmotionEvent): void {
    console.log('💭 Emotion detected:', event.emotion, `(${Math.round(event.confidence * 100)}% confidence)`);
    
    // Lower threshold (40%) for more responsive emotion display
    if (event.confidence < 0.4) return;
    
    // Update waveform with emotion shape (smile, frown, etc.)
    waveformUI.setEmotion(event.emotion, event.intensity);
    
    // Update coach avatar glow based on emotion
    coachUI.setEmotion?.(event.emotion);
  }

  /**
   * Handle expression events from agents.
   * (Emoji morphing disabled for now - may revisit later)
   */
  private handleExpression(event: ExpressionEvent): void {
    console.log(`✨ Expression: ${event.emoji}${event.meaning ? ` (${event.meaning})` : ''}`);
    // Future: could show emoji in UI or trigger visual effect
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
      console.log('🎵 Using MediaStreamTrack for visualization');
      this.audioCleanup = await audioService.attachVisualization(mediaStreamTrack, volumeCallback);
    } else {
      console.log('🎵 Using audio element for visualization');
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
    keyboardUI.dispose();
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

