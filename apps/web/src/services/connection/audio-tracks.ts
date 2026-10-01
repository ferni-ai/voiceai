/**
 * Connection Service - remote audio track handlers
 */

import { createLogger } from '../../utils/logger.js';
import type { ConnectionContext } from './context.js';
import { addPendingMusicTrack, handleTrackEnded } from './music-tracks.js';

const log = createLogger('Connection');

/**
 * Track subscribed (audio from agent) - use simple attach() like old frontend.
 * FIX: Support MULTIPLE audio tracks per participant (voice + background music)
 */
export function createTrackSubscribedHandler(ctx: ConnectionContext) {
  return (
    track: {
      kind: string;
      attach: () => HTMLMediaElement;
      mediaStreamTrack: MediaStreamTrack;
      sid?: string;
    },
    _publication: unknown,
    participant: { identity: string }
  ) => {
    if (track.kind === 'audio') {
      // Use track SID + participant identity to support multiple audio tracks
      // (e.g., agent voice track + BackgroundAudioPlayer music track)
      const trackKey = `${participant.identity}-${track.sid || track.mediaStreamTrack.id || Date.now()}`;

      // Check if we already have this specific track attached
      let audioEl = ctx.audioElements.get(trackKey);

      if (audioEl) {
        // Just fire the callback with existing element and track
        ctx.callbacks.onAudioTrack?.(audioEl, participant.identity, track.mediaStreamTrack);
        return;
      }

      // Create new audio element via LiveKit's track.attach()
      // Each track gets its own audio element (voice and music play simultaneously)
      audioEl = track.attach() as HTMLAudioElement;
      ctx.audioElements.set(trackKey, audioEl);

      // 🎚️ MUSIC TRACK IDENTIFICATION
      // Determine if this is a music track or voice track
      //
      // RACE CONDITION FIX:
      // Audio track might arrive BEFORE the music_state data message.
      // We now buffer unknown tracks and retroactively identify them
      // when expectMusicTrack() is called.
      let isMusicTrack = false;

      if (ctx.expectingMusicTrack) {
        // We received a music_state: playing message, so this is likely music
        isMusicTrack = true;
        ctx.expectingMusicTrack = false;
        if (ctx.expectingMusicTrackTimeout) {
          clearTimeout(ctx.expectingMusicTrackTimeout);
          ctx.expectingMusicTrackTimeout = null;
        }
        ctx.musicTrackIds.add(trackKey);
        log.info('🎚️ Music track identified (data message arrived first)', { trackKey });
      } else if (!ctx.voiceTrackId) {
        // First track is usually voice - mark it
        ctx.voiceTrackId = trackKey;
        log.debug('🎤 Voice track identified', { trackKey });
      } else if (!ctx.musicTrackIds.has(trackKey) && trackKey !== ctx.voiceTrackId) {
        // Additional track after voice - could be music
        // 🐛 FIX: Add to pending buffer instead of immediately treating as music
        // This allows expectMusicTrack() to retroactively identify it
        addPendingMusicTrack(ctx, trackKey, audioEl);

        // Still treat as music for now (fallback behavior)
        // The pending buffer is for cases where data message arrives late
        isMusicTrack = true;
        ctx.musicTrackIds.add(trackKey);
        log.info('🎚️ Additional track treated as music (added to pending for confirmation)', {
          trackKey,
        });
      }

      log.debug(`Audio track attached: ${trackKey} (isMusicTrack: ${isMusicTrack})`);

      // iOS/Safari specific attributes
      audioEl.setAttribute('playsinline', '');
      audioEl.setAttribute('autoplay', '');
      audioEl.setAttribute('webkit-playsinline', ''); // Legacy iOS
      (audioEl as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      audioEl.autoplay = true;
      audioEl.muted = false; // Explicitly unmuted for voice
      audioEl.volume = 1.0;

      // Add to DOM (required for iOS)
      audioEl.style.display = 'none';
      audioEl.style.position = 'absolute';
      audioEl.style.left = '-9999px';
      document.body.appendChild(audioEl);

      // iOS audio unlock: try to play immediately
      const playAudio = async () => {
        try {
          // iOS requires load() call before play() in some cases
          audioEl.load();
          await audioEl.play();
        } catch (err) {
          // iOS/mobile requires user gesture - set up handlers
          const unlock = () => {
            audioEl.play().catch((e) => log.warn('Audio unlock failed:', e));
            document.removeEventListener('touchstart', unlock);
            document.removeEventListener('touchend', unlock);
            document.removeEventListener('click', unlock);
          };
          document.addEventListener('touchstart', unlock, { once: true, passive: true });
          document.addEventListener('touchend', unlock, { once: true, passive: true });
          document.addEventListener('click', unlock, { once: true });
        }
      };

      // 🎚️ CRITICAL FIX: For music tracks, we need Web Audio attached BEFORE playing!
      // If we play first and attach Web Audio later, the audio bypasses our GainNode.
      //
      // For MUSIC tracks: Trigger attachment, wait briefly for Web Audio setup, then play
      // For VOICE tracks: Play immediately (ducking triggers from this callback)
      if (isMusicTrack) {
        // 🎚️ Attach to Web Audio FIRST, then play
        // This ensures the audio flows through our GainNode from the start
        const musicCallback = ctx.callbacks.onMusicTrack;
        if (musicCallback) {
          log.info('🎚️ Music track detected - starting Web Audio attachment BEFORE playback', {
            trackKey,
          });

          // Call the callback which will start async attachment
          // The callback's async work will complete in parallel with our timeout
          musicCallback(audioEl, trackKey);

          // Give Web Audio time to:
          // 1. Initialize AudioContext if needed (may require user gesture)
          // 2. Create MediaElementSource
          // 3. Connect the audio chain
          // 200ms should be enough for Web Audio initialization
          setTimeout(() => {
            log.info('🎚️ Starting music playback (Web Audio attachment should be complete)', {
              trackKey,
            });
            void playAudio();
          }, 200);
        } else {
          // No callback - just play directly
          void playAudio();
        }
      } else {
        // Voice tracks: Play immediately, fire callback for ducking trigger
        void playAudio();
        // Pass VOICE audio element AND track for visualization
        // Track-based visualization works better for WebRTC streams
        // NOTE: Only for voice tracks - music visualization is handled separately
        ctx.callbacks.onAudioTrack?.(audioEl, participant.identity, track.mediaStreamTrack);
      }
    }
  };
}

/**
 * Track unsubscribed - agent stopped speaking or music ended
 */
export function createTrackUnsubscribedHandler(ctx: ConnectionContext) {
  return (
    track: { kind: string; sid?: string; mediaStreamTrack?: MediaStreamTrack },
    _publication: unknown,
    participant: { identity: string; isLocal?: boolean }
  ) => {
    // Only care about remote audio tracks
    if (!participant.isLocal && track.kind === 'audio') {
      // Try to identify the track
      const trackKey = `${participant.identity}-${track.sid || track.mediaStreamTrack?.id || 'unknown'}`;

      // 🎚️ Check if this was a music track
      if (ctx.musicTrackIds.has(trackKey)) {
        handleTrackEnded(ctx, trackKey);
      }

      // Fire the voice track end callback
      ctx.callbacks.onAudioTrackEnd?.(participant.identity);

      // Release the <audio> element created in onTrackSubscribed
      const audioEl = ctx.audioElements.get(trackKey);
      if (audioEl) {
        audioEl.pause();
        audioEl.remove();
        ctx.audioElements.delete(trackKey);
      }
    }
  };
}
