/**
 * Outreach API: Twilio call status and machine-detection callbacks.
 * Extracted from outreach.routes.ts.
 */

import { getConversationalCallService } from '../../services/outreach/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import type { TwilioCallbackContext } from './types.js';

const log = getLogger().child({ module: 'outreach-handler' });

export async function handleTwilioCallbackRoutes(ctx: TwilioCallbackContext): Promise<boolean> {
  const { res, method, route, twilioParams } = ctx;

  // POST /api/outreach/call/status/:callId
  if (route.startsWith('/call/status/') && method === 'POST') {
    const callId = route.replace('/call/status/', '');
    const body = twilioParams;
    const { CallStatus, AnsweredBy } = body as { CallStatus: string; AnsweredBy?: string };

    log.debug({ callId, CallStatus, AnsweredBy }, 'Call status callback');

    try {
      const callService = getConversationalCallService();
      if (callService.handleStatusCallback) {
        await callService.handleStatusCallback(
          callId,
          CallStatus,
          body as { callSid?: string; duration?: number; answeredBy?: string }
        );
      }

      // Validate machine detection result
      const validMachineResults = [
        'human',
        'machine_start',
        'machine_end_beep',
        'machine_end_silence',
        'machine_end_other',
        'fax',
        'unknown',
      ] as const;
      type MachineResult = (typeof validMachineResults)[number];

      if (AnsweredBy && AnsweredBy !== 'human') {
        const machineResult = validMachineResults.includes(AnsweredBy as MachineResult)
          ? (AnsweredBy as MachineResult)
          : 'unknown';
        const twiml = callService.handleMachineDetection
          ? await callService.handleMachineDetection(callId, machineResult)
          : undefined;
        if (twiml) {
          res.setHeader('Content-Type', 'text/xml');
          res.writeHead(200);
          res.end(twiml);
          return true;
        }
      }

      res.writeHead(200);
      res.end('OK');
      return true;
    } catch (error) {
      log.error({ error, callId }, 'Error handling call status');
      res.writeHead(500);
      res.end('Error');
      return true;
    }
  }

  // POST /api/outreach/call/machine/:callId
  if (route.startsWith('/call/machine/') && method === 'POST') {
    const callId = route.replace('/call/machine/', '');
    const body = twilioParams;
    const { AnsweredBy } = body as { AnsweredBy: string };

    log.debug({ callId, AnsweredBy }, 'Machine detection callback');

    try {
      const callService = getConversationalCallService();

      // Validate machine detection result
      const validMachineResults = [
        'human',
        'machine_start',
        'machine_end_beep',
        'machine_end_silence',
        'machine_end_other',
        'fax',
        'unknown',
      ] as const;
      type MachineResult = (typeof validMachineResults)[number];
      const machineResult = validMachineResults.includes(AnsweredBy as MachineResult)
        ? (AnsweredBy as MachineResult)
        : 'unknown';

      const twiml = callService.handleMachineDetection
        ? await callService.handleMachineDetection(callId, machineResult)
        : undefined;

      if (twiml) {
        res.setHeader('Content-Type', 'text/xml');
        res.writeHead(200);
        res.end(twiml);
      } else {
        res.writeHead(200);
        res.end('OK');
      }
      return true;
    } catch (error) {
      log.error({ error, callId }, 'Error handling machine detection');
      res.writeHead(500);
      res.end('Error');
      return true;
    }
  }

  return false;
}
