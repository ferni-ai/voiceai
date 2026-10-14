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
// Bare numbers only a structured pass sees: arrays under phone keys, child bindings
const listed = { phoneNumbers: [{ value: '5555550123' }, '5555550123'], to: [['5555550123']] };
log().info(listed, 'sdk structured line');
log()
  .child({ recipients: ['5555550123', '5555550123'] })
  .info('sdk child line');
createLogger({ module: 'phone-log-child' }).info({ participant: identity }, 'app line');
createLogger({ module: 'phone-log-child' }).info(listed, 'app structured line');
createLogger({ module: 'phone-log-child', contactPhone: '5555550123' }).info('app child line');
console.log(`console line ${identity}`);
process.stderr.write(`[voice-agent-entry] Participant ready (wait): ${identity}\n`);

// The SDK's pretty printer flushes asynchronously
setTimeout(() => undefined, 300);
