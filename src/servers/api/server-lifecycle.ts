/**
 * UI Server lifecycle
 *
 * WebSocket attachment, DDoS alerting, background services started once the
 * server is listening, and graceful shutdown.
 */

import type http from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { registerDDoSAlertCallback } from '../../utils/ddos-protection.js';
import { notifyDDoSAlert } from '../../services/slack-notifications.js';
import { shutdownWearablesRoutes } from './routes/index.js';

// Spotify auto-refresh
import {
  startAutoRefresh as startSpotifyAutoRefresh,
  shutdown as shutdownSpotify,
} from './services/spotify.js';
import { shutdown as shutdownPlaid } from './services/plaid.js';
import { shutdown as shutdownDemoSessions } from './services/demo-sessions.js';
import { shutdown as shutdownTokenRoutes } from './routes/token.js';
import { shutdown as shutdownGoogleCalendar } from '../token/oauth/google-calendar.js';
import { shutdown as shutdownSpotifyOAuth } from '../token/oauth/spotify.js';
import { shutdownPersistence } from '../../services/persistence/index.js';

// Calendar real-time sync services
import {
  startPolling as startApplePolling,
  loadRegisteredUsers as loadApplePollingUsers,
  stopPolling as shutdownApplePolling,
} from '../../services/calendar/polling/apple-polling.js';

// Proactive outreach scheduler ("Better Than Human" - thinking of you moments)
import {
  startScheduler as startProactiveScheduler,
  stopScheduler as stopProactiveScheduler,
  loadPendingOutreach,
} from '../../services/outreach/proactive-scheduler.js';
import { renewExpiringChannels as startGoogleWebhookRenewal } from '../../services/calendar/webhooks/google-webhook.js';
import { renewExpiringSubscriptions as startOutlookSubscriptionRenewal } from '../../services/calendar/webhooks/outlook-webhook.js';

import {
  initializeTwilioStreamBridge,
  attachTwilioStreamBridgeToServer,
} from '../../api/twilio-routes.js';

// WebSocket for real-time insights
import {
  initInsightsWebSocket,
  shutdownInsightsWebSocket,
} from '../../services/insights-websocket.js';

// WebSocket for life context (Phase 6)
import {
  initLifeContextWebSocket,
  shutdownLifeContextWebSocket,
} from '../../services/life-context-websocket.js';

// WebSocket for user events (voice-triggered theme/navigation changes)
import {
  initUserEventsWebSocket,
  shutdownUserEventsWebSocket,
} from '../../services/user-events-websocket.js';
// WebSocket for Director Mode (Qwen3-Omni ensemble control)
import { initDirectorWebSocket, shutdownDirectorWebSocket } from '../../api/director-routes.js';

// Life Automation workflow execution
import { initWorkflowExecutionHandler } from '../../api/life-automation-routes.js';

const log = createLogger({ module: 'APIServer' });

/**
 * Initialize WebSocket servers for real-time streaming.
 * All use the noServer:true pattern with manual upgrade routing to avoid conflicts.
 */
export function initRealtimeWebSockets(server: http.Server): void {
  initInsightsWebSocket(server);
  log.info('Insights WebSocket server initialized on /ws/insights');

  // Initialize WebSocket server for life context (Phase 6)
  // Now enabled: Uses noServer:true pattern with path-based upgrade routing
  initLifeContextWebSocket(server);
  log.info('Life Context WebSocket server initialized on /ws/life-context');

  // Initialize WebSocket server for user events (voice-triggered UI changes)
  initUserEventsWebSocket(server);
  log.info('User Events WebSocket server initialized on /ws/user-events');

  // Initialize WebSocket server for Director Mode (Qwen3-Omni ensemble control)
  const directorAuthorizedIds = (process.env.DIRECTOR_AUTHORIZED_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  initDirectorWebSocket(server, { authorizedDirectorIds: directorAuthorizedIds });
  log.info('Director WebSocket server initialized on /ws/director');
}

/** Register DDoS alerting to Slack. */
export function registerDDoSAlerting(): void {
  registerDDoSAlertCallback(async (details) => {
    await notifyDDoSAlert(details);
  });
}

/**
 * Start background services once the server is listening.
 * Every service is non-blocking: a failure is logged and startup continues.
 */
export async function startBackgroundServices(
  server: http.Server,
  info: { port: number; livekitUrl: string }
): Promise<void> {
  log.info(
    {
      port: info.port,
      livekitUrl: info.livekitUrl,
      ddosProtection: true,
    },
    'UI Server started'
  );

  // Start Spotify token auto-refresh
  startSpotifyAutoRefresh();

  // Start Calendar real-time sync services
  try {
    // Apple Calendar polling (CalDAV doesn't support webhooks)
    await loadApplePollingUsers();
    startApplePolling();
    log.info('🍎 Apple Calendar polling service started');

    // Google Calendar webhook renewal (watches expire after 7 days)
    void startGoogleWebhookRenewal();
    log.info('📅 Google Calendar webhook renewal service started');

    // Outlook subscription renewal (subscriptions expire after hours)
    void startOutlookSubscriptionRenewal();
    log.info('📧 Outlook Calendar subscription renewal service started');
  } catch (error) {
    log.warn({ error: String(error) }, 'Calendar sync services failed to start (non-blocking)');
  }

  // Start proactive outreach scheduler ("Better Than Human" - thinking of you moments)
  try {
    await loadPendingOutreach();
    startProactiveScheduler();
    log.info('💭 Proactive outreach scheduler started');
  } catch (error) {
    log.warn({ error: String(error) }, 'Proactive scheduler failed to start (non-blocking)');
  }

  // Initialize Life Automation workflow execution handler
  try {
    initWorkflowExecutionHandler();
    log.info('🔄 Life Automation workflow handler initialized');
  } catch (error) {
    log.warn({ error: String(error) }, 'Workflow handler failed to start (non-blocking)');
  }

  // Initialize Twilio Stream Bridge for two-way conversational calls
  // In production (Cloud Run), attach to the main HTTP server on /stream path
  // In development, use a separate port if TWILIO_STREAM_PORT is set
  try {
    const twilioStreamPort = process.env.TWILIO_STREAM_PORT;

    if (twilioStreamPort) {
      // Development mode: Use separate port
      initializeTwilioStreamBridge(parseInt(twilioStreamPort, 10));
      log.info({ port: twilioStreamPort }, '📞 Twilio Stream Bridge initialized (standalone)');
    } else {
      // Production mode: Attach to main HTTP server
      attachTwilioStreamBridgeToServer(server, '/stream');
      log.info({ path: '/stream' }, '📞 Twilio Stream Bridge initialized (attached)');
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Twilio Stream Bridge failed to start (non-blocking)');
  }
}

/**
 * Build the graceful shutdown routine for a server.
 */
export function createGracefulShutdown(
  server: http.Server,
  stopDDoSMonitoring: () => void
): () => Promise<void> {
  return async function gracefulShutdown(): Promise<void> {
    log.info('Initiating graceful shutdown...');

    // Stop accepting new connections
    server.close();

    // Stop DDoS monitoring
    stopDDoSMonitoring();

    // Shutdown WebSocket servers first
    shutdownInsightsWebSocket();
    shutdownLifeContextWebSocket();
    shutdownUserEventsWebSocket();
    shutdownDirectorWebSocket();

    // Stop proactive scheduler
    stopProactiveScheduler();

    // Shutdown all services in parallel (except persistence)
    try {
      await Promise.all([
        shutdownSpotify(),
        shutdownPlaid(),
        shutdownDemoSessions(),
        shutdownTokenRoutes(),
        shutdownGoogleCalendar(),
        shutdownSpotifyOAuth(),
        Promise.resolve(shutdownApplePolling()),
        Promise.resolve(shutdownWearablesRoutes()),
      ]);
      log.info('Services shutdown complete');

      // Shutdown persistence LAST - allows other services to persist final state
      await shutdownPersistence();
      log.info('Persistence shutdown complete');
    } catch (err) {
      log.error({ error: (err as Error).message }, 'Error during shutdown');
    }

    process.exit(0);
  };
}

/** Register SIGTERM / SIGINT handlers that run the graceful shutdown. */
export function registerShutdownSignals(gracefulShutdown: () => Promise<void>): void {
  process.on('SIGTERM', () => {
    log.info('Received SIGTERM, shutting down gracefully...');
    gracefulShutdown().catch((err) => {
      log.error({ error: (err as Error).message }, 'Shutdown error');
      process.exit(1);
    });
  });

  process.on('SIGINT', () => {
    log.info('Received SIGINT, shutting down gracefully...');
    gracefulShutdown().catch((err) => {
      log.error({ error: (err as Error).message }, 'Shutdown error');
      process.exit(1);
    });
  });
}
