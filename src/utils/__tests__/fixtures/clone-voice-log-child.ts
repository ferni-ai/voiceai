/**
 * Child process for log-redaction-clone-voice.test.ts: starts the way every entry point
 * does (instrument.ts first, which installs the log redaction and loads the roster), then
 * writes a consented clone's voice id (ROSTER_VOICE_SETH, set by the test) through every
 * path that bypasses the app logger: the LiveKit SDK logger (plain, structured and a
 * child), console.log and console.error, and raw process.stderr / process.stdout writes,
 * as persona-tts.ts's DEBUG_TTS_PIPELINE tracing does. The app logger line is a control.
 */

import '../../../instrument.js';

import { initializeLogger, log } from '@livekit/agents';

import { createLogger } from '../../safe-logger.js';

const voiceId = process.env.ROSTER_VOICE_SETH ?? '';

initializeLogger({ pretty: true, level: 'info' });
log().info({ voiceId }, 'sdk structured line');
log().info(`sdk line voice=${voiceId}`);
log().child({ voiceId }).info('sdk child line');
createLogger({ module: 'clone-voice-log-child' }).info({ voiceId }, 'app line');
console.log(`console line ${voiceId}`);
console.error(`console error line preview-${voiceId}.mp3`);
process.stderr.write(`  🎙️ Voice: ${voiceId} raw stderr line\n`);
process.stdout.write(`raw stdout line ${voiceId.toUpperCase()}\n`);

// The SDK's pretty printer flushes asynchronously
setTimeout(() => undefined, 300);
