/**
 * Imported once at boot by the web server and the agent: logs which token key
 * each runs with (key id only), since the agent reads tokens the web
 * server sealed and a key mismatch would make them unreadable.
 *
 * It also reports, at error level and by name only, the encryption secrets a
 * production process is missing. Without DATA_ENCRYPTION_KEY and
 * IDENTIFIER_HASH_SECRET every services/platform/privacy-crypto call throws in
 * production (smart-home credentials, developer MCP servers and OAuth clients),
 * and that went unnoticed because nothing said so at boot.
 */
import { createLogger } from './safe-logger.js';
import { tokenKeyIdLine } from './token-at-rest.js';

/** Secrets privacy-crypto needs in production (it throws without them). */
export const REQUIRED_PRODUCTION_SECRETS = [
  'DATA_ENCRYPTION_KEY',
  'IDENTIFIER_HASH_SECRET',
] as const;

/** The names (never the values) of required secrets a production process lacks. */
export function missingProductionSecrets(
  env: Readonly<Record<string, string | undefined>> = process.env
): string[] {
  if (env.NODE_ENV !== 'production') return [];
  return REQUIRED_PRODUCTION_SECRETS.filter((name) => !env[name]);
}

const log = createLogger({ module: 'TokenAtRest' });
log.info(tokenKeyIdLine());
const missing = missingProductionSecrets();
if (missing.length > 0) {
  log.error(
    { missing },
    'Encryption secrets missing in production: privacy-crypto calls will throw'
  );
}
