/**
 * Webhook records at rest: url and headers sealed through utils/token-at-rest.
 *
 * @module services/webhooks/webhook-sealing
 */

import { FieldValue } from '@google-cloud/firestore';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { openTokens, resealStale, sealTokens } from '../../utils/token-at-rest.js';
import { assertTokenSealingAvailable } from '../../utils/token-encryption.js';
import type { WebhookConfig } from './types.js';

const log = createLogger({ module: 'webhook-sealing' });
const WEBHOOKS_COLLECTION = 'webhooks';

/**
 * A webhook's URL and headers can carry credentials (tokens in the query
 * string, Authorization headers). They are stored only as one sealed envelope
 * (utils/token-at-rest, the repo's token key chain). With no key configured,
 * in any environment, a save is refused rather than written in plaintext.
 */
type WebhookSecrets = Pick<WebhookConfig, 'url' | 'headers'>;

export const WEBHOOK_SEALING_REFUSED =
  "Webhooks can't be saved right now: secure storage isn't set up on this server. Nothing was saved.";

/** The Firestore record: everything but url/headers, plus the sealed envelope. */
export function sealedRecord(webhook: WebhookConfig): Record<string, unknown> {
  assertTokenSealingAvailable();
  const { url, headers, ...rest } = webhook;
  return { ...removeUndefined(rest), ...sealTokens<WebhookSecrets>({ url, headers }) };
}

/** Legacy headers were written as a JSON string; current ones live in the envelope. */
function legacyHeaders(raw: unknown): Record<string, string> | undefined {
  if (typeof raw !== 'string') return (raw as Record<string, string> | undefined) ?? undefined;
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return undefined;
  }
}

/**
 * A stored doc as a WebhookConfig. Sealed docs are opened (and moved to
 * TOKEN_SEALING_KEY when sealed under an older key). Legacy docs, written in
 * plaintext before sealing, are sealed in place on read when a key exists.
 * Null when the doc cannot be opened.
 */
export function openWebhookDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): WebhookConfig | null {
  const data = doc.data() as WebhookConfig & { encrypted?: unknown };
  const { encrypted, ...rest } = data;
  if (typeof encrypted === 'string') {
    const secrets = openTokens<WebhookSecrets>({ encrypted }, WEBHOOKS_COLLECTION);
    if (!secrets?.url) return null;
    void resealStale({
      store: WEBHOOKS_COLLECTION,
      stored: encrypted,
      value: secrets,
      swap: async (next) => {
        await doc.ref.update({ encrypted: next }, { lastUpdateTime: doc.updateTime });
        return 'updated';
      },
    });
    return { ...rest, url: secrets.url, headers: secrets.headers };
  }
  if (typeof data.url !== 'string' || data.url.startsWith('enc:')) return null;
  const webhook: WebhookConfig = { ...rest, url: data.url, headers: legacyHeaders(data.headers) };
  try {
    assertTokenSealingAvailable();
    const sealed = sealTokens<WebhookSecrets>({ url: webhook.url, headers: webhook.headers });
    void doc.ref
      .update(
        { ...sealed, url: FieldValue.delete(), headers: FieldValue.delete() },
        { lastUpdateTime: doc.updateTime }
      )
      .catch((err: unknown) => {
        log.warn({ error: (err as Error).message }, 'Legacy webhook not re-sealed');
      });
  } catch {
    // No key: the legacy doc stays as it was until one exists.
  }
  return webhook;
}
