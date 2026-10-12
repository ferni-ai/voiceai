/**
 * Child process for log-redaction.test.ts: starts the way every entry point does
 * (instrument.ts first), then logs a phone caller's participant identity through each
 * path that reached the agent log: the LiveKit SDK logger (its pretty printer writes
 * to fd 1 directly), our pino sink, console and a raw process.stderr.write.
 * The number is a reserved fictional one (555-01xx).
 */

import '../../../instrument.js';

import { initializeLogger, log } from '@livekit/agents';

import { createLogger } from '../../safe-logger.js';

const identity = 'sip_+15555550123';

initializeLogger({ pretty: true, level: 'info' });
log().info({ participantValue: identity }, 'sdk line');
createLogger({ module: 'phone-log-child' }).info({ participant: identity }, 'app line');
console.log(`console line ${identity}`);
process.stderr.write(`[voice-agent-entry] Participant ready (wait): ${identity}\n`);

// The SDK's pretty printer flushes asynchronously
setTimeout(() => undefined, 300);
