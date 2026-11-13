/**
 * Run by sdk-logger-process.test.ts as its own process, set up the way the worker and
 * the job child start: the phone redaction first (instrument.ts imports it), then
 * initializeSdkLogger(), then the SDK logs to the real stdout. All text is invented.
 */
import '../../../utils/log-redaction-install.js';

import { initializeLogger, log } from '@livekit/agents';

import { initializeSdkLogger } from '../sdk-logger-options.js';

let before = 'none';
try {
  log();
  before = 'a logger existed';
} catch {
  // log() throws until initializeLogger runs: the SDK builds no logger earlier
}
process.stderr.write(`sdk logger before init: ${before}\n`);

initializeSdkLogger();
log().info(
  { 'lk.pii.user_input': 'the blue kettle sang softly', callerPhone: '+14155550123' },
  'sdk pii line'
);
log().child({ 'lk.pii.response': 'whispers from the orchard gate' }).warn('sdk child line');
initializeLogger({ pretty: false, level: 'info' }); // the SDK re-initializing, as job_proc does
log().info({ 'lk.pii.message': 'a paper boat drifted past' }, 'sdk line after re-init');
