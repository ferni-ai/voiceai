/**
 * Twilio Webhook Routes for Two-Way Calls
 *
 * Handles:
 * - Stream connection/disconnection
 * - Call status callbacks
 * - AMD (Answering Machine Detection) callbacks
 * - Dynamic TwiML generation
 *
 * @module api/twilio-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import {
  getTwilioStreamBridge,
  generateStreamTwiml,
  type TwilioStreamBridge,
  type BridgeConfig,
} from '../services/voice/twilio-stream-bridge.js';
import {
  routeBasedOnDetection,
  parseAMDWebhook,
  type AMDWebhookPayload,
  type DetectionResult,
} from '../services/voice/call-detection.service.js';
import {
  recordCallOutcome,
  getCallSession,
} from '../services/voice/conversational-call.service.js';
import {
  createPhoneBridgeParticipant,
  cleanupBridgeSession,
} from '../services/voice/livekit-phone-bridge.js';
import { startOutboundAgent } from '../services/voice/outbound-call-agent.js';

const log = createLogger({ module: 'twilio-routes' });

// Store pending calls waiting for AMD detection
const pendingCalls = new Map<
  string,
  {
    recipientName: string;
    personaId: string;
    purpose: string;
    humanAnsweredAudioUrl?: string;
    voicemailMessage?: string;
    resolve?: (twiml: string) => void;
  }
>();

// ============================================================================
// CONFIGURATION
// ============================================================================

const TWILIO_STREAM_WEBHOOK_URL = process.env.TWILIO_STREAM_WEBHOOK_URL || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

// ============================================================================
// MAIN ROUTE HANDLER
// ============================================================================

/**
 * Handle all Twilio routes
 */
export async function handleTwilioRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // POST /api/twilio/twiml/:callId - Dynamic TwiML for a call
  if (pathname.startsWith('/api/twilio/twiml/') && req.method === 'POST') {
    const callId = pathname.split('/').pop() || '';
    await handleTwimlRequest(req, res, callId);
    return true;
  }

  // POST /api/twilio/amd - AMD callback
  if (pathname === '/api/twilio/amd' && req.method === 'POST') {
    await handleAMDCallback(req, res);
    return true;
  }

  // POST /api/twilio/status - Call status webhook
  if (pathname === '/api/twilio/status' && req.method === 'POST') {
    await handleStatusCallback(req, res);
    return true;
  }

  // WS /api/twilio/stream - WebSocket for audio stream (handled separately)
  // This is upgraded to WebSocket by the bridge, not handled here

  return false;
}

// ============================================================================
// TWIML GENERATION
// ============================================================================

/**
 * Generate TwiML for a call
 * Called by Twilio when call is answered to get instructions
 */
async function handleTwimlRequest(
  req: IncomingMessage,
  res: ServerResponse,
  callId: string
): Promise<void> {
  const body = await parseBody(req);
  log.info({ callId, answeredBy: body.AnsweredBy }, '📞 TwiML request');

  // Check if we have pending call info
  const callInfo = pendingCalls.get(callId);
  if (!callInfo) {
    log.warn({ callId }, 'No pending call info found');
    // Return a basic message
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, there was an issue with this call.</Say>
  <Hangup/>
</Response>`);
    return;
  }

  // Generate TwiML to stream audio to our bridge
  const roomName = `call_${callId}`;
  const twiml = generateStreamTwiml({
    websocketUrl: TWILIO_STREAM_WEBHOOK_URL,
    roomName,
    greeting: `Hi ${callInfo.recipientName}, this is Ferni. Just a moment while I connect.`,
  });

  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml);
}

// ============================================================================
// AMD (ANSWERING MACHINE DETECTION)
// ============================================================================

/**
 * Handle AMD callback from Twilio
 * Determines if human or machine answered and routes accordingly
 */
async function handleAMDCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = (await parseBody(req)) as unknown as AMDWebhookPayload;
  const detection = parseAMDWebhook(body);

  log.info(
    {
      callSid: detection.callSid,
      answeredBy: detection.answeredBy,
      duration: detection.machineDetectionDuration,
    },
    '🤖 AMD Detection result'
  );

  // Find the pending call
  let callInfo = pendingCalls.get(detection.callSid);

  // Try to find by looking through all pending calls
  if (!callInfo) {
    for (const [callId, info] of pendingCalls.entries()) {
      // Match by pattern if we stored the SID
      if (callId === detection.callSid) {
        callInfo = info;
        break;
      }
    }
  }

  if (!callInfo) {
    log.warn({ callSid: detection.callSid }, 'No pending call for AMD callback');
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    return;
  }

  // Route based on detection
  const routing = routeBasedOnDetection(detection, {
    recipientName: callInfo.recipientName,
    personaId: callInfo.personaId,
    purpose: callInfo.purpose,
    voicemailMessage: callInfo.voicemailMessage,
    humanAnsweredAudioUrl: callInfo.humanAnsweredAudioUrl,
  });

  log.info(
    { callSid: detection.callSid, action: routing.action, reason: routing.reason },
    '📞 Routing call'
  );

  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(routing.twiml);
}

// ============================================================================
// STATUS CALLBACKS
// ============================================================================

/**
 * Handle call status webhook from Twilio
 */
async function handleStatusCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseBody(req);

  const { CallSid, CallStatus, CallDuration, To, From, Direction } = body;

  log.info(
    {
      callSid: CallSid,
      status: CallStatus,
      duration: CallDuration,
      to: To,
      direction: Direction,
    },
    '📞 Call status update'
  );

  // Update call session if we have one
  const session = getCallSession(CallSid);
  if (session) {
    if (
      CallStatus === 'completed' ||
      CallStatus === 'failed' ||
      CallStatus === 'busy' ||
      CallStatus === 'no-answer'
    ) {
      recordCallOutcome(session.callId, {
        success: CallStatus === 'completed',
        summary: `Call ${CallStatus}. Duration: ${CallDuration || 0}s`,
      });
    }
  }

  // Clean up pending call
  pendingCalls.delete(CallSid);

  // Always respond 200 to Twilio
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
}

// ============================================================================
// BRIDGE INITIALIZATION
// ============================================================================

let bridgeInitialized = false;

function getBridgeConfig(): BridgeConfig {
  return {
    livekitUrl: LIVEKIT_URL,
    livekitApiKey: LIVEKIT_API_KEY,
    livekitApiSecret: LIVEKIT_API_SECRET,
  };
}

/**
 * Register bridge event handlers (shared between standalone and attached modes)
 */
function registerBridgeHandlers(bridge: TwilioStreamBridge): void {
  bridge.on(
    'callStarted',
    (event: { callSid: string; roomName: string; customParameters: Record<string, unknown> }) => {
      void (async () => {
        const { callSid, roomName, customParameters } = event;
        log.info({ callSid, roomName }, '📞 Stream call started');

        // Create phone bridge participant (connects Twilio audio to LiveKit room)
        try {
          const recipientName =
            (customParameters as Record<string, string>)?.recipientName || 'Phone';
          const phoneBridge = await createPhoneBridgeParticipant(
            callSid,
            roomName,
            bridge,
            recipientName
          );

          if (phoneBridge) {
            log.info({ callSid, roomName }, '✅ Phone bridge participant created');
          } else {
            log.warn({ callSid, roomName }, '⚠️ Failed to create phone bridge participant');
          }
        } catch (error) {
          log.error({ error: String(error), roomName }, 'Failed to create phone bridge');
        }

        // Dispatch the REAL Ferni voice agent (runs on GCE)
        const params = customParameters as Record<string, string>;
        try {
          const { AgentDispatchClient } = await import('livekit-server-sdk');

          const agentDispatch = new AgentDispatchClient(
            LIVEKIT_URL,
            LIVEKIT_API_KEY,
            LIVEKIT_API_SECRET
          );

          // Determine agent name based on environment
          const agentName = process.env.AGENT_NAME || 'voice-agent';

          // Dispatch with on_behalf_call metadata so the agent knows this is an outbound call
          await agentDispatch.createDispatch(roomName, agentName, {
            metadata: JSON.stringify({
              type: 'on_behalf_call',
              callId: params.callId || roomName,
              originalSessionId: params.sessionId || roomName,
              userId: params.userId || 'unknown',
              userName: params.userName || 'User',
              contact: {
                name: params.recipientName || 'Friend',
                phone: params.phone,
                relationship: params.relationship || 'contact',
              },
              purpose: params.purpose || 'Check in',
              objective: params.objective || 'Have a conversation',
              callType: params.callType || 'personal',
            }),
          });

          log.info({ roomName, callSid, agentName }, '✅ Voice agent dispatched for outbound call');
        } catch (error) {
          log.error(
            { error: String(error), roomName },
            'Failed to dispatch agent, falling back to local'
          );

          // Fall back to local agent if dispatch fails (e.g., no workers available)
          try {
            startOutboundAgent(
              {
                roomName,
                callId: params.callId || roomName,
                recipientName: params.recipientName || 'Friend',
                purpose: params.purpose || 'Check in',
                objective: params.objective || 'Have a conversation',
                callType: (params.callType as 'personal' | 'business' | 'emergency') || 'personal',
                userId: params.userId,
                userName: params.userName,
              },
              bridge,
              callSid
            ).catch((err: unknown) => log.error({ error: String(err) }, 'Local agent error'));

            log.info({ roomName, callSid }, '⚠️ Using local fallback agent');
          } catch (fallbackError) {
            log.error({ error: String(fallbackError), roomName }, 'Both agent strategies failed');
          }
        }
      })();
    }
  );

  bridge.on('callEnded', (event: { callSid: string }) => {
    void (async () => {
      const { callSid } = event;
      log.info({ callSid }, '📴 Stream call ended');
      pendingCalls.delete(callSid);

      // Clean up phone bridge session
      try {
        await cleanupBridgeSession(callSid);
      } catch (error) {
        log.debug({ error: String(error), callSid }, 'Error cleaning up bridge session');
      }
    })();
  });

  bridge.on('dtmf', (event: { callSid: string; digit: string }) => {
    const { callSid, digit } = event;
    log.info({ callSid, digit }, '🔢 DTMF digit received');
    // Could use this for IVR navigation
  });

  bridge.on('audioFromCaller', () => {
    // Audio is being forwarded to LiveKit room
    // The intelligent agent in that room will receive it
  });
}

/**
 * Initialize the Twilio Stream Bridge in standalone mode
 * Use this for local development on a separate port
 */
export function initializeTwilioStreamBridge(port = 8765): void {
  if (bridgeInitialized) {
    log.debug('Twilio Stream Bridge already initialized');
    return;
  }

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    log.warn('LiveKit credentials not configured - Twilio Stream Bridge disabled');
    return;
  }

  const bridge = getTwilioStreamBridge(getBridgeConfig());
  bridge.start(port);
  registerBridgeHandlers(bridge);
  bridgeInitialized = true;

  log.info({ port }, '✅ Twilio Stream Bridge initialized');
}

/**
 * Attach Twilio Stream Bridge to an existing HTTP server
 * Use this for Cloud Run where only one port is available
 */
export function attachTwilioStreamBridgeToServer(
  httpServer: import('http').Server,
  path = '/stream'
): void {
  if (bridgeInitialized) {
    log.debug('Twilio Stream Bridge already initialized');
    return;
  }

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    log.warn('LiveKit credentials not configured - Twilio Stream Bridge disabled');
    return;
  }

  const bridge = getTwilioStreamBridge(getBridgeConfig());
  bridge.attachToServer(httpServer, path);
  registerBridgeHandlers(bridge);
  bridgeInitialized = true;

  log.info({ path }, '✅ Twilio Stream Bridge attached to HTTP server');
}

// ============================================================================
// AGENT DISPATCH
// ============================================================================

/**
 * Dispatch an intelligent outbound agent to handle a call
 */
async function dispatchOutboundAgent(
  roomName: string,
  customParameters: Record<string, string>
): Promise<void> {
  log.info({ roomName, customParameters }, '🤖 Dispatching intelligent outbound agent');

  try {
    // Use LiveKit's agent dispatch mechanism
    const { AgentDispatchClient } = await import('livekit-server-sdk');

    const client = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

    // Create dispatch request
    await client.createDispatch(roomName, 'intelligent-outbound-agent', {
      metadata: JSON.stringify({
        type: 'conversational_call',
        roomName,
        ...customParameters,
      }),
    });

    log.info({ roomName }, '✅ Intelligent agent dispatched');
  } catch (error) {
    log.error({ error: String(error), roomName }, 'Failed to dispatch agent');

    // Fallback: The agent worker should pick up the room anyway
    // if it's registered for 'conversational_call' type jobs
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Register a pending call (called when initiating a conversational call)
 */
export function registerPendingCall(
  callSid: string,
  info: {
    recipientName: string;
    personaId: string;
    purpose: string;
    humanAnsweredAudioUrl?: string;
    voicemailMessage?: string;
  }
): void {
  pendingCalls.set(callSid, info);
  log.debug({ callSid, recipientName: info.recipientName }, 'Registered pending call');
}

// ============================================================================
// HELPERS
// ============================================================================

async function parseBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        // Twilio sends form-urlencoded data
        const params = new URLSearchParams(data);
        const result: Record<string, string> = {};
        for (const [key, value] of params.entries()) {
          result[key] = value;
        }
        resolve(result);
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  handleTwilioRoutes,
  initializeTwilioStreamBridge,
  registerPendingCall,
};
