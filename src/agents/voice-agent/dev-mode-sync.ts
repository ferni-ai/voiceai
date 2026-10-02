/**
 * dev_mode_sync: the web dev panel asks the agent to skip team-unlock checks
 * and simulate a tier for this session. The caller's browser writes the
 * message, so it is honoured only where the deployment opts in.
 *
 * @module agents/voice-agent/dev-mode-sync
 */
import { log as livekitLog } from '@livekit/agents';
import type { SessionServices } from '../../services/index.js';
import type { DataChannelContext } from './data-channel-handler.js';

const getLogger = () => livekitLog();


/**
 * Handle dev_mode_sync messages from frontend dev panel.
 *
 * When the frontend dev panel is enabled, it sends this message to let the
 * backend know it should bypass team unlock checks. This allows testing of
 * all personas without needing environment variables.
 *
 * Message format:
 * {
 *   type: 'dev_mode_sync',
 *   enabled: boolean,
 *   bypassUnlocks: boolean,     // Bypass team member unlock checks
 *   simulatedTier?: string,     // 'free' | 'friend' | 'partner'
 *   timestamp: number
 * }
 */
/**
 * Whether this deployment trusts the browser's dev_mode_sync. Off unless
 * ALLOW_CLIENT_DEV_MODE=true: NODE_ENV can't tell dev from prod here, both
 * agents run the production image.
 */
export function clientDevModeAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['ALLOW_CLIENT_DEV_MODE'] === 'true';
}

export async function handleDevModeSync(
  message: {
    enabled: boolean;
    bypassUnlocks?: boolean;
    simulatedTier?: 'free' | 'friend' | 'partner';
    timestamp?: number;
  },
  ctx: DataChannelContext
): Promise<void> {
  const { services, sessionId, room } = ctx;

  // The caller's browser writes this message, so anyone could send it from
  // devtools and unlock every team member they haven't paid for. Honour it
  // only on a deployment that opts in (the dev agent).
  if (!clientDevModeAllowed()) {
    getLogger().warn({ sessionId }, 'Ignored dev_mode_sync: ALLOW_CLIENT_DEV_MODE is not set');
    return;
  }

  getLogger().info(
    {
      enabled: message.enabled,
      bypassUnlocks: message.bypassUnlocks,
      simulatedTier: message.simulatedTier,
      sessionId,
    },
    '🔧 Dev mode sync received from frontend'
  );

  try {
    // Store dev mode state in services for this session
    // This will be checked by handoff unlock validation
    if (services && typeof services === 'object') {
      // Use a type assertion to add the devMode property
      (services as SessionServices & { devMode?: DevModeState }).devMode = {
        enabled: message.enabled,
        bypassUnlocks: message.bypassUnlocks ?? message.enabled,
        simulatedTier: message.simulatedTier,
        syncedAt: Date.now(),
      };

      getLogger().info(
        {
          devModeEnabled: message.enabled,
          bypassUnlocks: message.bypassUnlocks ?? message.enabled,
        },
        '✅ Dev mode state stored in session services'
      );

      // Send acknowledgment back to frontend
      try {
        const ackMessage = JSON.stringify({
          type: 'dev_mode_sync_ack',
          success: true,
          bypassUnlocks: message.bypassUnlocks ?? message.enabled,
          timestamp: Date.now(),
        });
        await room.localParticipant?.publishData(new TextEncoder().encode(ackMessage), {
          reliable: true,
        });
      } catch (ackErr) {
        getLogger().debug({ error: String(ackErr) }, 'Failed to send dev mode ack');
      }
    }
  } catch (err) {
    getLogger().warn({ error: String(err) }, 'Failed to process dev mode sync');
  }
}

/**
 * Dev mode state stored in session services.
 * Exported for use by handoff unlock checks.
 */
export interface DevModeState {
  enabled: boolean;
  bypassUnlocks: boolean;
  simulatedTier?: 'free' | 'friend' | 'partner';
  syncedAt: number;
}

/**
 * Check if dev mode bypass is enabled for this session.
 * Used by handoff unlock validation.
 */
export function isDevModeBypassEnabled(services: SessionServices): boolean {
  const { devMode } = services as SessionServices & { devMode?: DevModeState };
  return devMode?.enabled === true && devMode?.bypassUnlocks === true;
}

/**
 * Get simulated tier from dev mode, if set.
 */
export function getDevModeSimulatedTier(
  services: SessionServices
): 'free' | 'friend' | 'partner' | undefined {
  const { devMode } = services as SessionServices & { devMode?: DevModeState };
  return devMode?.enabled ? devMode.simulatedTier : undefined;
}
