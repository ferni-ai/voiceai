/**
 * Connect Flow
 *
 * Connecting to the AI coach: subscription check, audio unlock, LiveKit
 * connection with timeout, and the UI updates once connected.
 */

import { appState } from '../state/app.state.js';
import { delightService } from '../services/delight.service.js';
import { cancelOneTap } from '../services/google-one-tap.service.js';
import { audioService, connectionService } from '../services/index.js';
import { messageUI } from '../ui/message.ui.js';
import { waveformUI } from '../ui/waveform.ui.js';
import { gesturesUI } from '../ui/gestures.ui.js';
import { presenceUI } from '../ui/presence.ui.js';
import { soundUI } from '../ui/sound.ui.js';
import { statsUI } from '../ui/stats.ui.js';
import { avatarFeedback } from '../ui/avatar-feedback.ui.js';
import { greetingUI } from '../ui/greeting.ui.js';
import { thinkingUI } from '../ui/thinking.ui.js';
import { getDirectorConsole } from '../ui/director-console.ui.js';
import { engagementTriggerUI } from '../ui/engagement-trigger.ui.js';
import { conversationTracker } from '../services/conversation-tracker.service.js';
import { toast } from '../ui/whisper.ui.js';
import { showUsageIndicator } from '../ui/subscription.ui.js';
import { modalCoordinator } from '../services/modal-coordinator.service.js';
import { appRuntime } from './app-runtime-state.js';
import { checkSubscriptionBeforeConnect } from './subscription-gating.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Connect to the AI coach with timeout handling.
 *
 * Philosophy: Gating should feel like natural breaks, not walls.
 * We check subscription limits but present them warmly.
 */
export async function connectToCoach(): Promise<void> {
  // Ignore re-entrant calls (double tap, check-in handler, auto-retry)
  if (appRuntime.isConnecting) return;
  appRuntime.isConnecting = true;
  try {
    await connectInternal();
  } finally {
    appRuntime.isConnecting = false;
  }
}

async function connectInternal(): Promise<void> {
  // Cancel One-Tap if showing - never interrupt voice connection
  cancelOneTap();

  const persona = appState.get('selectedPersona');

  // Check subscription limits FIRST (before any audio context setup)
  // This ensures we don't waste user's permission tap if they're at limit
  const subscriptionCheck = await checkSubscriptionBeforeConnect();
  if (!subscriptionCheck.allowed) {
    return; // Modal already shown by checkSubscriptionBeforeConnect
  }

  // Show gentle reminder if approaching limit (but still allow)
  if (subscriptionCheck.approaching && subscriptionCheck.remaining !== null) {
    // Don't block - just show a subtle indicator after connecting
    setTimeout(() => {
      showUsageIndicator();
      // Also show a warm toast message
      const remaining = subscriptionCheck.remaining;
      if (remaining !== null) {
        if (remaining <= 1) {
          toast.info("This is your last conversation this month. Let's make it count.");
        } else if (remaining <= 2) {
          toast.info(`${remaining} conversations left. I'm here whenever you need me.`);
        }
      }
    }, 3000);
  }

  // Show immediate feedback - user tapped the button
  messageUI.show('Getting ready...', 'info', 30000);

  // iOS CRITICAL: Create and resume AudioContext FIRST in user gesture
  // This must happen synchronously at the start of the click handler
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const tempCtx = new AudioCtx();
      await tempCtx.resume();
      // Only needed to unlock audio; iOS caps the number of live contexts
      void tempCtx.close();
    }
  } catch (e) {
    log.debug('AudioContext pre-init:', e);
  }

  // Play connect sound (soundUI only - has debouncing for mobile)
  try {
    soundUI.play('connect');
  } catch (e) {
    log.debug('Sound play failed (OK on iOS):', e);
  }

  // Show thinking indicator with connection progress
  thinkingUI.show('Connecting');
  thinkingUI.showProgress(0); // Step 0: Authenticating
  waveformUI.setThinking(true);

  // Resume audio context (required after user interaction)
  try {
    await audioService.resumeContext();
  } catch (e) {
    log.debug('Audio resume failed:', e);
  }

  // Step 1: Joining room
  thinkingUI.showProgress(1);

  // Connect to LiveKit with timeout
  const CONNECTION_TIMEOUT = 30000; // 30 seconds
  let success = false;

  try {
    // Step 2: Connecting audio
    thinkingUI.showProgress(2);
    messageUI.show('Almost there...', 'info', 30000);

    const connectionPromise = connectionService.connect();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<boolean>((_, reject) => {
      timeoutId = setTimeout(() => {
        // The attempt keeps running after we give up on it - tear it down
        // once it settles so a late success doesn't leave a live mic behind
        // (unless a retry has since adopted the same in-flight attempt)
        void connectionPromise.then(() => {
          if (!appRuntime.isConnecting) void connectionService.disconnect();
        });
        reject(new Error('Connection timeout'));
      }, CONNECTION_TIMEOUT);
    });

    try {
      success = await Promise.race([connectionPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    log.error('Connection failed:', error);
    thinkingUI.hideProgress();
    thinkingUI.hide();
    waveformUI.setThinking(false);

    // Human-friendly error messages (not robotic!)
    let errorMessage = "Hmm, couldn't connect. Let's try that again.";
    if (error instanceof Error) {
      if (error.message === 'Connection timeout') {
        errorMessage = 'Taking longer than usual... check your internet connection?';
      } else if (error.message.includes('permission') || error.message.includes('Permission')) {
        errorMessage = "I'll need microphone access to hear you. Mind enabling it?";
      } else if (error.message.includes('network') || error.message.includes('Network')) {
        errorMessage = 'Having trouble reaching the server. Is your internet working?';
      } else {
        errorMessage = 'Something went wrong on our end. Try again in a moment?';
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

    // Show engagement triggers ONLY for returning users
    // First conversation should be pure - just Ferni, nothing else
    if (modalCoordinator.hasMinimumConversations(1)) {
      setTimeout(() => engagementTriggerUI.show(), 500);
    }

    // Show success message
    messageUI.show(`Connected to ${persona.name}!`, 'success', 2000);

    // 📝 Start tracking this conversation for history
    conversationTracker.startSession(persona.id, persona.name);

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
    void checkMicrophoneStatus();

    // Director Console: init with current session; open via menu (Director Console) or Cmd+Shift+E / Cmd+Shift+D
    const roomState = connectionService.getRoomState();
    if (roomState.roomName && roomState.localParticipantId) {
      getDirectorConsole({
        sessionId: roomState.roomName,
        userId: roomState.localParticipantId,
      });
      // Director button removed from control bar; use menu (Settings → Director Console) or keyboard shortcut
    }

    // 🎉 Dispatch conversation start event for all systems to track
    // This is the SINGLE SOURCE OF TRUTH for conversation tracking
    // All services listen to this event - no direct recordConversation() calls needed
    window.dispatchEvent(new CustomEvent('ferni:conversation-start'));

    // Check conversation milestones - zen aesthetic, no visual effects
    const convCount = greetingUI.getConversationCount();
    if ([5, 10, 25, 50, 100].includes(convCount)) {
      setTimeout(() => {
        const message = greetingUI.getMilestoneMessage('conversations', convCount);
        messageUI.show(message, 'success', 4000);
      }, 5000);
    }
  } else {
    messageUI.show("Couldn't connect this time. Want to try again?", 'error');
    soundUI.play('disconnect');
  }
}

/**
 * Check microphone permission and show helpful message if denied.
 */
function checkMicrophoneStatus(): void {
  try {
    // Check if we have an audio track enabled
    const room = connectionService.getRoom();
    const localParticipant = room?.localParticipant;

    if (localParticipant) {
      const audioTracks = localParticipant.getTrackPublications() as Array<{
        kind?: string;
        track?: unknown;
      }>;
      const hasAudio = audioTracks.some((pub) => pub.kind === 'audio' && pub.track);

      if (!hasAudio) {
        // Mic permission was likely denied - show subtle prompt
        setTimeout(() => {
          messageUI.show("I'd love to hear your voice - enable mic access?", 'info', 4000);
        }, 3000);
      }
    }
  } catch {
    // Ignore errors in permission check
  }
}
