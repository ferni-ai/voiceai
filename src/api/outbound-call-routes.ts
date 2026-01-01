/**
 * Outbound Call API Routes
 *
 * Webhook handlers for conversational outbound calls.
 * Twilio calls these endpoints for call status updates and voicemail detection.
 *
 * @module outbound-call-routes
 */

import type { Request, Response, Router } from 'express';
import { getLogger } from '../utils/safe-logger.js';
import {
  getConversationalCallService,
  makeConversationalCall,
  isConversationalCallsConfigured,
  type OutboundCallContext,
  type CallResult,
} from '../services/outreach/conversational-calls.js';

const log = getLogger().child({ module: 'outbound-call-routes' });

// ============================================================================
// ROUTE SETUP
// ============================================================================

/**
 * Register outbound call routes
 */
export function registerOutboundCallRoutes(router: Router): void {
  // Health check for outbound calls
  router.get('/api/outbound-call/health', healthCheck);

  // Twilio status callback
  router.post('/api/outbound-call/status/:callId', handleStatusCallback);

  // Twilio machine detection callback
  router.post('/api/outbound-call/machine/:callId', handleMachineDetection);

  // Initiate a conversational call (internal API)
  router.post('/api/outbound-call/initiate', initiateCall);

  // Get active calls
  router.get('/api/outbound-call/active', getActiveCalls);

  // Get call by ID
  router.get('/api/outbound-call/:callId', getCall);

  // End a call
  router.post('/api/outbound-call/:callId/end', endCall);

  // Update call summary (called by voice agent after conversation)
  router.post('/api/outbound-call/:callId/summary', updateSummary);

  log.info('📞 Outbound call routes registered');
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * Health check for outbound call system
 */
async function healthCheck(_req: Request, res: Response): Promise<void> {
  const configured = isConversationalCallsConfigured();

  res.json({
    status: configured ? 'ready' : 'not_configured',
    conversationalCallsEnabled: configured,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Handle Twilio status callback
 */
async function handleStatusCallback(req: Request, res: Response): Promise<void> {
  const { callId } = req.params;
  const { CallStatus, CallSid, Duration, CallDuration, AnsweredBy } = req.body;

  log.debug({ callId, CallStatus, CallSid }, 'Received status callback');

  try {
    const service = getConversationalCallService();
    if (service.handleStatusCallback) {
      await service.handleStatusCallback(callId, CallStatus, {
        callSid: CallSid,
        duration: Duration || CallDuration,
        answeredBy: AnsweredBy,
      });
    }

    // Twilio expects empty 200 response
    res.status(200).send('');
  } catch (error) {
    log.error({ error, callId }, 'Error handling status callback');
    res.status(200).send(''); // Still return 200 to prevent Twilio retries
  }
}

/**
 * Handle Twilio machine detection (voicemail)
 */
async function handleMachineDetection(req: Request, res: Response): Promise<void> {
  const { callId } = req.params;
  const { AnsweredBy } = req.body;

  log.debug({ callId, AnsweredBy }, 'Received machine detection');

  try {
    const service = getConversationalCallService();
    const twiml = service.handleMachineDetection
      ? await service.handleMachineDetection(callId, AnsweredBy)
      : undefined;

    if (twiml) {
      // Return TwiML for voicemail message
      res.type('text/xml').send(twiml);
    } else {
      // Continue with normal call
      res.status(200).send('');
    }
  } catch (error) {
    log.error({ error, callId }, 'Error handling machine detection');
    res.status(200).send('');
  }
}

/**
 * Initiate a conversational call (internal API)
 */
async function initiateCall(req: Request, res: Response): Promise<void> {
  const context = req.body as OutboundCallContext;

  // Basic validation
  if (!context.user?.phone || !context.user?.name) {
    res.status(400).json({
      error: 'Missing required fields: user.phone and user.name',
    });
    return;
  }

  if (!isConversationalCallsConfigured()) {
    res.status(503).json({
      error: 'Conversational calls not configured',
      hint: 'Check TWILIO_* and LIVEKIT_* environment variables',
    });
    return;
  }

  try {
    const call = await makeConversationalCall(context);

    res.json({
      success: true,
      callId: call.id,
      status: call.status,
      twilioCallSid: call.twilioCallSid,
      livekitRoom: call.livekitRoomName,
    });
  } catch (error) {
    log.error({ error }, 'Failed to initiate call');
    res.status(500).json({
      error: 'Failed to initiate call',
      details: String(error),
    });
  }
}

/**
 * Get all active calls
 */
async function getActiveCalls(_req: Request, res: Response): Promise<void> {
  try {
    const service = getConversationalCallService();
    const calls: CallResult[] = service.getActiveCalls ? await service.getActiveCalls() : [];

    res.json({
      count: calls.length,
      calls: calls.map((call) => ({
        id: call.id,
        status: call.status,
        userId: call.context?.user?.id,
        userName: call.context?.user?.name,
        persona: call.context?.persona,
        initiatedAt: call.initiatedAt,
        answeredAt: call.answeredAt,
      })),
    });
  } catch (error) {
    log.error({ error }, 'Failed to get active calls');
    res.status(500).json({ error: 'Failed to get active calls' });
  }
}

/**
 * Get a specific call
 */
async function getCall(req: Request, res: Response): Promise<void> {
  const { callId } = req.params;

  try {
    const service = getConversationalCallService();
    const call = service.getActiveCall ? await service.getActiveCall(callId) : null;

    if (!call) {
      res.status(404).json({ error: 'Call not found' });
      return;
    }

    res.json({
      id: call.id,
      status: call.status,
      user: {
        id: call.context?.user?.id,
        name: call.context?.user?.name,
      },
      persona: call.context?.persona,
      trigger: call.context?.trigger,
      timing: {
        initiated: call.initiatedAt,
        answered: call.answeredAt,
        completed: call.completedAt,
        durationSeconds: call.callDurationSeconds,
      },
      results: {
        voicemailLeft: call.voicemailLeft,
        conversationSummary: call.conversationSummary,
        followUpActions: call.followUpActions,
      },
    });
  } catch (error) {
    log.error({ error, callId }, 'Failed to get call');
    res.status(500).json({ error: 'Failed to get call' });
  }
}

/**
 * End an active call
 */
async function endCall(req: Request, res: Response): Promise<void> {
  const { callId } = req.params;
  const { reason } = req.body;

  try {
    const service = getConversationalCallService();
    if (service.endCall) {
      await service.endCall(callId, reason);
    }

    res.json({
      success: true,
      message: `Call ${callId} ended`,
    });
  } catch (error) {
    log.error({ error, callId }, 'Failed to end call');
    res.status(500).json({ error: 'Failed to end call' });
  }
}

/**
 * Update call summary (called by voice agent after conversation ends)
 *
 * This captures the conversation summary and makes it available for
 * future context injection - so Ferni can naturally mention how the call went.
 */
async function updateSummary(req: Request, res: Response): Promise<void> {
  const { callId } = req.params;
  const { conversationSummary, followUpActions, userMood, keyTopics, receptivity } = req.body;

  if (!conversationSummary) {
    res.status(400).json({ error: 'conversationSummary is required' });
    return;
  }

  try {
    const service = getConversationalCallService();
    if (service.updateCallSummary) {
      await service.updateCallSummary(callId, {
        conversationSummary,
        followUpActions,
        userMood,
        keyTopics,
        receptivity, // 'warm' | 'curious' | 'hesitant' | 'not_interested'
      });
    }

    res.json({
      success: true,
      message: `Summary updated for call ${callId}`,
    });

    log.info({ callId, receptivity }, '📝 Call summary captured');
  } catch (error) {
    log.error({ error, callId }, 'Failed to update summary');
    res.status(500).json({ error: 'Failed to update summary' });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  registerOutboundCallRoutes,
};
