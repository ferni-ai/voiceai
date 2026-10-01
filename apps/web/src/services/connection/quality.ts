/**
 * Connection Service - connection quality monitoring
 */

import type { ConnectionContext } from './context.js';

/**
 * Check if there's an active audio track.
 */
export function hasActiveAudioTrack(ctx: ConnectionContext): boolean {
  if (!ctx.room) return false;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  for (const participant of ctx.room.remoteParticipants.values()) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    for (const publication of participant.audioTrackPublications.values()) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (publication.isSubscribed && !publication.isMuted) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Start monitoring connection quality.
 * Uses round-trip time estimation based on WebRTC stats.
 */
export function startQualityMonitoring(ctx: ConnectionContext): void {
  if (ctx.qualityMonitorInterval) return;

  // Check quality every 5 seconds
  ctx.qualityMonitorInterval = window.setInterval(() => {
    void measureConnectionQuality(ctx);
  }, 5000);

  // Initial measurement
  void measureConnectionQuality(ctx);
}

/**
 * Stop monitoring connection quality.
 */
export function stopQualityMonitoring(ctx: ConnectionContext): void {
  if (ctx.qualityMonitorInterval) {
    clearInterval(ctx.qualityMonitorInterval);
    ctx.qualityMonitorInterval = null;
  }
}

/**
 * Measure connection quality using available metrics.
 */
function measureConnectionQuality(ctx: ConnectionContext): void {
  if (!ctx.room || ctx.room.state !== 'connected') return;

  try {
    // Try to get RTT from the room's engine if available
    // LiveKit exposes connection stats through the engine
    const engine = (ctx.room as unknown as { engine?: { client?: { currentRTT?: number } } })
      .engine;
    const rtt = engine?.client?.currentRTT;

    if (typeof rtt === 'number' && rtt > 0) {
      // RTT is in milliseconds
      ctx.callbacks.onConnectionQuality?.(rtt);
    } else {
      // Fallback: estimate based on connection state
      // If we're connected and everything works, assume good quality
      const hasAudio = hasActiveAudioTrack(ctx);
      const estimatedLatency = hasAudio ? 150 : 200;
      ctx.callbacks.onConnectionQuality?.(estimatedLatency);
    }
  } catch {
    // If we can't measure, assume fair quality
    ctx.callbacks.onConnectionQuality?.(300);
  }
}
