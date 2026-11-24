/**
 * The API server's listen, then its background services (#3853).
 *
 * Every start of the server used to start its background senders, with nothing but missing
 * provider credentials to stop a local or preview run from texting, calling, emailing or pushing
 * from whatever database it points at. Two settings, both read once at listen:
 *
 * - API_BACKGROUND_SENDERS (kill switch, default on): off starts none of the senders. That is
 *   the proactive scheduler and its pending-outreach load, Apple calendar polling and its user load,
 *   the Google and Outlook calendar renewals, the workflow handler and Spotify token refresh. The
 *   server still listens and serves, attaches the Twilio /stream bridge, installs the outreach
 *   ports and loads the voice registry.
 * - API_LISTEN_HOST (default 0.0.0.0): the interface the server listens on. Set 127.0.0.1 to keep a
 *   local run off the network.
 *
 * With both unset, the server listens and starts exactly as it did inside index.ts.
 *
 * @module servers/api/api-listen
 */
import type { Server } from 'node:http';

import { flagOn, type Env } from '../../config/env-flag.js';
import { initializeVoiceRegistry } from '../../personas/voice-registry.js';
import {
  attachTwilioStreamBridgeToServer,
  initializeTwilioStreamBridge,
} from '../../api/twilio-routes.js';
import { initWorkflowExecutionHandler } from '../../api/life-automation-routes.js';
import {
  loadRegisteredUsers as loadApplePollingUsers,
  startPolling as startApplePolling,
} from '../../services/calendar/polling/index.js';
import { renewExpiringChannels as startGoogleWebhookRenewal } from '../../services/calendar/webhooks/google-webhook.js';
import { renewExpiringSubscriptions as startOutlookSubscriptionRenewal } from '../../services/calendar/webhooks/outlook-webhook.js';
import {
  loadPendingOutreach,
  startScheduler as startProactiveScheduler,
} from '../../services/outreach/proactive-scheduler.js';
import { installUiServerPorts } from '../../services/outreach/ui-server-ports.js';
import { fireAndForget } from '../../utils/safe-fire-and-forget.js';
import { createLogger } from '../../utils/safe-logger.js';
import { runBackgroundServices, type StartupStep } from './background-services.js';
import { startAutoRefresh as startSpotifyAutoRefresh } from './services/spotify.js';

// The module name index.ts logs these lines under, so prod log queries keep matching.
const log = createLogger({ module: 'APIServer' });

/** The interface the server listens on: API_LISTEN_HOST, else every interface, as before. */
const listenHost = (env: Env): string => env.API_LISTEN_HOST?.trim() || '0.0.0.0';

/** The calendar, outreach and workflow senders, in the order index.ts started them. */
const SENDER_STEPS: readonly StartupStep[] = [
  {
    // Apple Calendar polling (CalDAV doesn't support webhooks)
    name: 'apple-calendar-polling',
    load: loadApplePollingUsers,
    start: startApplePolling,
  },
  {
    // Google watches expire after 7 days; Outlook subscriptions after hours.
    name: 'calendar-renewals',
    start: () => {
      fireAndForget(startGoogleWebhookRenewal, 'google-webhook-renewal');
      fireAndForget(startOutlookSubscriptionRenewal, 'outlook-subscription-renewal');
    },
  },
  {
    // "Better Than Human" - thinking of you moments
    name: 'proactive-scheduler',
    load: loadPendingOutreach,
    start: startProactiveScheduler,
  },
  { name: 'workflow-handler', start: initWorkflowExecutionHandler },
];

async function startBackgroundServices(
  server: Server,
  port: number,
  livekitUrl: string,
  env: Env
): Promise<void> {
  log.info({ port, livekitUrl, ddosProtection: true }, 'UI Server started');
  const senders = flagOn('API_BACKGROUND_SENDERS', env);
  if (!senders) log.info({}, 'Background senders off (API_BACKGROUND_SENDERS)');

  // Outreach reaches only verified phones; a forgotten topic closes its follow-ups.
  installUiServerPorts();
  if (senders) startSpotifyAutoRefresh();
  fireAndForget(initializeVoiceRegistry, 'voice-registry'); // bundle voices win over fallbacks

  // The /stream bridge attaches before any Firestore load is awaited: a cold
  // boot once spent ~40s in those loads with inbound calls unable to connect.
  await runBackgroundServices({
    attachStreamBridge: () => {
      const twilioStreamPort = env.TWILIO_STREAM_PORT;
      if (twilioStreamPort) {
        // Development mode: Use separate port
        initializeTwilioStreamBridge(parseInt(twilioStreamPort, 10));
        log.info({ port: twilioStreamPort }, '📞 Twilio Stream Bridge initialized (standalone)');
      } else {
        // Production (Cloud Run): attach to the main HTTP server
        attachTwilioStreamBridgeToServer(server, '/stream');
        log.info({ path: '/stream' }, '📞 Twilio Stream Bridge initialized (attached)');
      }
    },
    steps: senders ? [...SENDER_STEPS] : [],
  });
}

/** Listen on `port`, then start the background services (index.ts, once). */
export function listenAndStart(
  server: Server,
  { port, livekitUrl, env = process.env }: { port: number; livekitUrl: string; env?: Env }
): void {
  server.listen(port, listenHost(env), () =>
    fireAndForget(async () => startBackgroundServices(server, port, livekitUrl, env), 'api-startup')
  );
}
