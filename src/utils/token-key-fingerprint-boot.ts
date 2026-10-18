/**
 * Imported once at boot by the web server and the agent: logs which token key
 * each runs with (key id only), since the agent reads tokens the web
 * server sealed and a key mismatch would make them unreadable.
 */
import { createLogger } from './safe-logger.js';
import { tokenKeyIdLine } from './token-at-rest.js';

createLogger({ module: 'TokenAtRest' }).info(tokenKeyIdLine());
