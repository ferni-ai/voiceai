/**
 * Webhook Config Store
 *
 * Firestore persistence for webhook configurations.
 * Uses in-memory cache with Firestore persistence.
 */

import crypto from 'node:crypto';
import { FieldValue, type Firestore as FirestoreType } from '@google-cloud/firestore';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { openTokens, resealStale, sealTokens } from '../../utils/token-at-rest.js';
import {
  assertTokenSealingAvailable,
  TokenSealingUnavailableError,
} from '../../utils/token-encryption.js';
import type {
  CreateSiriTokenInput,
  CreateSiriTokenResult,
  CreateWebhookInput,
  ListWebhooksResult,
  SiriToken,
  UpdateWebhookInput,
  WebhookConfig,
  WebhookServiceResult,
  WebhookStats,
} from './types.js';

const log = createLogger({ module: 'webhook-config-store' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const WEBHOOKS_COLLECTION = 'webhooks';
const SIRI_TOKENS_COLLECTION = 'siri_tokens';
const USERS_COLLECTION = 'bogle_users';

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirestoreType | null = null;
// FIX: Promise-based singleton to prevent race condition
let dbInitPromise: Promise<FirestoreType | null> | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = initializeFirestore();
  return dbInitPromise;
}

async function initializeFirestore(): Promise<FirestoreType | null> {
  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    log.info('Webhook Firestore initialized');
    return db;
  } catch (error) {
    log.warn({ error: String(error) }, 'Firestore not available for webhooks');
    dbInitPromise = null; // Allow retry
    return null;
  }
}

// ============================================================================
// SEALING
// ============================================================================

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
function sealedRecord(webhook: WebhookConfig): Record<string, unknown> {
  assertTokenSealingAvailable();
  const { url, headers, ...rest } = webhook;
  return { ...removeUndefined(rest), ...sealTokens<WebhookSecrets>({ url, headers }) };
}

function refusal<T>(userId: string): WebhookServiceResult<T> {
  log.error({ userId }, 'Webhook not saved: token sealing unavailable');
  return { success: false, error: WEBHOOK_SEALING_REFUSED, code: 'sealing_unavailable' };
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
function openWebhookDoc(doc: FirebaseFirestore.QueryDocumentSnapshot): WebhookConfig | null {
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

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const webhookCache = new Map<string, Map<string, WebhookConfig>>();
const siriTokenCache = new Map<string, Map<string, SiriToken>>();
const loadedUsers = new Set<string>();

function getUserWebhookCache(userId: string): Map<string, WebhookConfig> {
  if (!webhookCache.has(userId)) {
    webhookCache.set(userId, new Map());
  }
  return webhookCache.get(userId)!;
}

function getUserTokenCache(userId: string): Map<string, SiriToken> {
  if (!siriTokenCache.has(userId)) {
    siriTokenCache.set(userId, new Map());
  }
  return siriTokenCache.get(userId)!;
}

// ============================================================================
// WEBHOOK CRUD OPERATIONS
// ============================================================================

/**
 * Load webhooks from Firestore into cache
 */
async function loadUserWebhooks(userId: string): Promise<void> {
  if (loadedUsers.has(userId)) return;

  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    const snapshot = await firestore
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(WEBHOOKS_COLLECTION)
      .get();

    const cache = getUserWebhookCache(userId);
    for (const doc of snapshot.docs) {
      const webhook = openWebhookDoc(doc);
      if (!webhook) {
        log.warn({ userId, webhookId: doc.id }, 'Webhook record did not open; skipped');
        continue;
      }
      cache.set(webhook.id, webhook);
    }

    loadedUsers.add(userId);
    log.debug({ userId, count: snapshot.size }, 'Loaded webhooks from Firestore');
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to load webhooks');
  }
}

/**
 * Create a new webhook
 */
export async function createWebhook(
  userId: string,
  input: CreateWebhookInput
): Promise<WebhookServiceResult<WebhookConfig>> {
  const firestore = await getFirestore();

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const webhook: WebhookConfig = {
    id,
    name: input.name,
    url: input.url,
    method: input.method || 'POST',
    voiceTriggers: input.voiceTriggers.map((t) => t.toLowerCase().trim()),
    platform: input.platform,
    cooldownSeconds: input.cooldownSeconds,
    headers: input.headers,
    payloadTemplate: input.payloadTemplate,
    enabled: true,
    createdAt: now,
    updatedAt: now,
    successCount: 0,
    failureCount: 0,
  };

  let record: Record<string, unknown>;
  try {
    record = sealedRecord(webhook);
  } catch (error) {
    if (error instanceof TokenSealingUnavailableError) return refusal(userId);
    throw error;
  }

  if (firestore) {
    try {
      await firestore
        .collection(USERS_COLLECTION)
        .doc(userId)
        .collection(WEBHOOKS_COLLECTION)
        .doc(id)
        .set(record);

      log.info({ userId, webhookId: id, name: webhook.name }, 'Webhook created');
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Failed to persist webhook');
      return { success: false, error: 'Failed to save webhook' };
    }
  }

  getUserWebhookCache(userId).set(id, webhook);
  return { success: true, data: webhook };
}

/**
 * Get a webhook by ID
 */
export async function getWebhook(
  userId: string,
  webhookId: string
): Promise<WebhookServiceResult<WebhookConfig>> {
  await loadUserWebhooks(userId);

  const cache = getUserWebhookCache(userId);
  const webhook = cache.get(webhookId);

  if (!webhook) {
    return { success: false, error: 'Webhook not found' };
  }

  return { success: true, data: webhook };
}

/**
 * List all webhooks for a user
 */
export async function listWebhooks(
  userId: string
): Promise<WebhookServiceResult<ListWebhooksResult>> {
  await loadUserWebhooks(userId);

  const cache = getUserWebhookCache(userId);
  const webhooks = Array.from(cache.values());

  return {
    success: true,
    data: {
      webhooks,
      total: webhooks.length,
    },
  };
}

/**
 * Update a webhook
 */
export async function updateWebhook(
  userId: string,
  input: UpdateWebhookInput
): Promise<WebhookServiceResult<WebhookConfig>> {
  await loadUserWebhooks(userId);

  const cache = getUserWebhookCache(userId);
  const existing = cache.get(input.id);

  if (!existing) {
    return { success: false, error: 'Webhook not found' };
  }

  const updated: WebhookConfig = {
    ...existing,
    name: input.name ?? existing.name,
    url: input.url ?? existing.url,
    method: input.method ?? existing.method,
    voiceTriggers: input.voiceTriggers
      ? input.voiceTriggers.map((t) => t.toLowerCase().trim())
      : existing.voiceTriggers,
    platform: input.platform ?? existing.platform,
    cooldownSeconds: input.cooldownSeconds ?? existing.cooldownSeconds,
    headers: input.headers ?? existing.headers,
    payloadTemplate: input.payloadTemplate ?? existing.payloadTemplate,
    enabled: input.enabled ?? existing.enabled,
    updatedAt: new Date().toISOString(),
  };

  let record: Record<string, unknown>;
  try {
    record = sealedRecord(updated);
  } catch (error) {
    if (error instanceof TokenSealingUnavailableError) return refusal(userId);
    throw error;
  }

  // Persist to Firestore, dropping any legacy plaintext url/headers fields.
  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore
        .collection(USERS_COLLECTION)
        .doc(userId)
        .collection(WEBHOOKS_COLLECTION)
        .doc(input.id)
        .update({ ...record, url: FieldValue.delete(), headers: FieldValue.delete() });

      log.info({ userId, webhookId: input.id }, 'Webhook updated');
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Failed to update webhook');
      return { success: false, error: 'Failed to update webhook' };
    }
  }

  cache.set(input.id, updated);
  return { success: true, data: updated };
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(
  userId: string,
  webhookId: string
): Promise<WebhookServiceResult<void>> {
  await loadUserWebhooks(userId);

  const cache = getUserWebhookCache(userId);
  if (!cache.has(webhookId)) {
    return { success: false, error: 'Webhook not found' };
  }

  cache.delete(webhookId);

  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore
        .collection(USERS_COLLECTION)
        .doc(userId)
        .collection(WEBHOOKS_COLLECTION)
        .doc(webhookId)
        .delete();

      log.info({ userId, webhookId }, 'Webhook deleted');
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Failed to delete webhook');
      return { success: false, error: 'Failed to delete webhook' };
    }
  }

  return { success: true };
}

/**
 * Find webhook by voice trigger phrase
 */
export async function findWebhookByTrigger(
  userId: string,
  phrase: string
): Promise<WebhookConfig | null> {
  await loadUserWebhooks(userId);

  const cache = getUserWebhookCache(userId);
  const normalizedPhrase = phrase.toLowerCase().trim();

  for (const webhook of cache.values()) {
    if (!webhook.enabled) continue;

    for (const trigger of webhook.voiceTriggers) {
      if (normalizedPhrase.includes(trigger) || trigger.includes(normalizedPhrase)) {
        return webhook;
      }
    }
  }

  return null;
}

/**
 * Record webhook execution result
 */
export async function recordExecution(
  userId: string,
  webhookId: string,
  success: boolean
): Promise<void> {
  await loadUserWebhooks(userId);

  const cache = getUserWebhookCache(userId);
  const webhook = cache.get(webhookId);

  if (!webhook) return;

  if (success) {
    webhook.successCount++;
  } else {
    webhook.failureCount++;
  }
  webhook.lastTriggeredAt = new Date().toISOString();

  // Persist to Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      await firestore
        .collection(USERS_COLLECTION)
        .doc(userId)
        .collection(WEBHOOKS_COLLECTION)
        .doc(webhookId)
        .update(
          cleanForFirestore({
            successCount: webhook.successCount,
            failureCount: webhook.failureCount,
            lastTriggeredAt: webhook.lastTriggeredAt,
          })
        );
    } catch (error) {
      log.error({ userId, webhookId, error: String(error) }, 'Failed to record execution');
    }
  }
}

/**
 * Get webhook stats for a user
 */
export async function getWebhookStats(userId: string): Promise<WebhookStats> {
  await loadUserWebhooks(userId);

  const cache = getUserWebhookCache(userId);
  const webhooks = Array.from(cache.values());

  const totalExecutions = webhooks.reduce((sum, w) => sum + w.successCount + w.failureCount, 0);
  const successfulExecutions = webhooks.reduce((sum, w) => sum + w.successCount, 0);

  const lastExecution = webhooks
    .filter((w) => w.lastTriggeredAt)
    .sort((a, b) =>
      (b.lastTriggeredAt || '').localeCompare(a.lastTriggeredAt || '')
    )[0]?.lastTriggeredAt;

  return {
    totalWebhooks: webhooks.length,
    enabledWebhooks: webhooks.filter((w) => w.enabled).length,
    totalExecutions,
    successRate: totalExecutions > 0 ? successfulExecutions / totalExecutions : 0,
    lastExecutionAt: lastExecution,
  };
}

// ============================================================================
// SIRI TOKEN OPERATIONS
// ============================================================================

/**
 * Generate a secure token
 */
function generateToken(): string {
  const bytes = crypto.randomBytes(32);
  return `ferni_${bytes.toString('base64url')}`;
}

/**
 * Hash a token for storage
 */
async function hashToken(token: string): Promise<string> {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return hash;
}

/**
 * Create a token preview (first 6 and last 6 chars)
 */
function createTokenPreview(token: string): string {
  if (token.length < 20) return `${token.slice(0, 6)}...`;
  return `${token.slice(0, 10)}...${token.slice(-6)}`;
}

/**
 * Create a new Siri token
 */
export async function createSiriToken(
  userId: string,
  input: CreateSiriTokenInput
): Promise<WebhookServiceResult<CreateSiriTokenResult>> {
  const firestore = await getFirestore();

  const token = generateToken();
  const tokenHash = await hashToken(token);
  const id = crypto.randomUUID();

  const siriToken: SiriToken = {
    id,
    name: input.name,
    tokenHash,
    tokenPreview: createTokenPreview(token),
    scopes: input.scopes,
    enabled: true,
    createdAt: new Date().toISOString(),
    usageCount: 0,
  };

  // Store in cache
  const cache = getUserTokenCache(userId);
  cache.set(id, siriToken);

  // Persist to Firestore
  if (firestore) {
    try {
      await firestore
        .collection(USERS_COLLECTION)
        .doc(userId)
        .collection(SIRI_TOKENS_COLLECTION)
        .doc(id)
        .set(removeUndefined(siriToken));

      log.info({ userId, tokenId: id, name: input.name }, 'Siri token created');
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Failed to persist Siri token');
      return { success: false, error: 'Failed to save token' };
    }
  }

  return {
    success: true,
    data: {
      id,
      name: input.name,
      token, // Return plaintext token ONCE
      scopes: input.scopes,
    },
  };
}

/**
 * Validate a Siri token and return its details
 */
export async function validateSiriToken(userId: string, token: string): Promise<SiriToken | null> {
  const firestore = await getFirestore();
  if (!firestore) return null;

  const tokenHash = await hashToken(token);

  try {
    const snapshot = await firestore
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(SIRI_TOKENS_COLLECTION)
      .where('tokenHash', '==', tokenHash)
      .where('enabled', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const siriToken = snapshot.docs[0].data() as SiriToken;

    // Update usage stats
    await firestore
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(SIRI_TOKENS_COLLECTION)
      .doc(siriToken.id)
      .update(
        cleanForFirestore({
          lastUsedAt: new Date().toISOString(),
          usageCount: (siriToken.usageCount || 0) + 1,
        })
      );

    return siriToken;
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to validate Siri token');
    return null;
  }
}

/**
 * List all Siri tokens for a user
 */
export async function listSiriTokens(userId: string): Promise<SiriToken[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection(USERS_COLLECTION)
      .doc(userId)
      .collection(SIRI_TOKENS_COLLECTION)
      .get();

    return snapshot.docs.map((doc) => doc.data() as SiriToken);
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to list Siri tokens');
    return [];
  }
}

/**
 * Delete a Siri token
 */
export async function deleteSiriToken(
  userId: string,
  tokenId: string
): Promise<WebhookServiceResult<void>> {
  const firestore = await getFirestore();

  const cache = getUserTokenCache(userId);
  cache.delete(tokenId);

  if (firestore) {
    try {
      await firestore
        .collection(USERS_COLLECTION)
        .doc(userId)
        .collection(SIRI_TOKENS_COLLECTION)
        .doc(tokenId)
        .delete();

      log.info({ userId, tokenId }, 'Siri token deleted');
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Failed to delete Siri token');
      return { success: false, error: 'Failed to delete token' };
    }
  }

  return { success: true };
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear cache for a user (for testing or logout)
 */
export function clearUserCache(userId: string): void {
  webhookCache.delete(userId);
  siriTokenCache.delete(userId);
  loadedUsers.delete(userId);
}

/**
 * Clear all caches (for testing)
 */
export function clearAllCaches(): void {
  webhookCache.clear();
  siriTokenCache.clear();
  loadedUsers.clear();
}
