/**
 * Run by sdk-logger-process.test.ts as its own process. SDK_LOGGER_ORDER picks the setup:
 * - phone-first (default): as the worker and the job child start, the phone redaction
 *   (instrument.ts imports it) and then initializeSdkLogger();
 * - pii-first: initializeSdkLogger() and then the phone redaction;
 * - double: phone, pii, then both installed again.
 * Then the SDK logs to the real stdout, re-initializes, and logs again. Text is invented.
 */
import { initializeLogger, log } from '@livekit/agents';

let before = 'none';
try {
  log();
  before = 'a logger existed';
} catch {
  // log() throws until initializeLogger runs: the SDK builds no logger earlier
}
process.stderr.write(`sdk logger before init: ${before}\n`);

const order = process.env.SDK_LOGGER_ORDER ?? 'phone-first';
const phone = async (): Promise<void> => {
  const { installLogPhoneRedaction } = await import('../../../utils/log-redaction.js');
  installLogPhoneRedaction();
};
const pii = async (): Promise<void> => {
  const { initializeSdkLogger } = await import('../sdk-logger-options.js');
  initializeSdkLogger();
};
if (order === 'pii-first') {
  await pii();
  await phone();
} else {
  await phone();
  await pii();
  if (order === 'double') {
    await phone();
    await pii();
  }
}

log().info(
  { 'lk.pii.user_input': 'the blue kettle sang softly', callerPhone: '+14155550123' },
  'sdk pii line'
);
log().child({ 'lk.pii.response': 'whispers from the orchard gate' }).warn('sdk child line');
initializeLogger({ pretty: false, level: 'info' }); // the SDK re-initializing, as job_proc does
log().info(
  { 'lk.pii.message': 'a paper boat drifted past', calleePhone: '+14155550199' },
  'sdk line after re-init'
);
