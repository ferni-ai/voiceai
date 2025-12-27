/**
 * Webhook Config Store
 *
 * Firestore persistence for webhook configurations.
 * Uses in-memory cache with Firestore persistence.
 */

import crypto from 'node:crypto';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
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

// Encryption key for webhook URLs (32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.WEBHOOK_ENCRYPTION_KEY || '';

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirestoreType | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

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
    return null;
  }
}

// ============================================================================
// ENCRYPTION HELPERS
// ============================================================================

function getEncryptionKey(): Buffer | null {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
    log.warn('WEBHOOK_ENCRYPTION_KEY not set or too short, URLs stored unencrypted');
    return null;
  }
  return Buffer.from(ENCRYPTION_KEY.slice(0, 32), 'utf-8');
}

function encrypt(text: string): string {
  const key = getEncryptionKey();
  if (!key) return text;

  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `enc:${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    log.error({ error: String(error) }, 'Encryption failed');
    return text;
  }
}

function decrypt(text: string): string {
  if (!text.startsWith('enc:')) return text;

  const key = getEncryptionKey();
  if (!key) return text;

  try {
    const parts = text.split(':');
    if (parts.length !== 3) return text;

    const iv = Buffer.from(parts[1], 'hex');
    const encryptedText = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    log.error({ error: String(error) }, 'Decryption failed');
    return text;
  }
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
      const data = doc.data() as WebhookConfig;
      // Decrypt URL when loading
      data.url = decrypt(data.url);
      if (data.headers) {
        data.headers = JSON.parse(decrypt(JSON.stringify(data.headers)));
      }
      cache.set(data.id, data);
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

  // Store in cache (unencrypted)
  const cache = getUserWebhookCache(userId);
  cache.set(id, webhook);

  // Persist to Firestore (encrypted)
  if (firestore) {
    try {
      const encryptedWebhook = {
        ...webhook,
        url: encrypt(webhook.url),
        headers: webhook.headers ? encrypt(JSON.stringify(webhook.headers)) : undefined,
      };

      await firestore
        .collection(USERS_COLLECTION)
        .doc(userId)
        .collection(WEBHOOKS_COLLECTION)
        .doc(id)
        .set(removeUndefined(encryptedWebhook));

      log.info({ userId, webhookId: id, name: webhook.name }, 'Webhook created');
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Failed to persist webhook');
      return { success: false, error: 'Failed to save webhook' };
    }
  }

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

  cache.set(input.id, updated);

  // Persist to Firestore
  const firestore = await getFirestore();
  if (firestore) {
    try {
      const encryptedWebhook = {
        ...updated,
        url: encrypt(updated.url),
        headers: updated.headers ? encrypt(JSON.stringify(updated.headers)) : undefined,
      };

      await firestore
        .collection(USERS_COLLECTION)
        .doc(userId)
        .collection(WEBHOOKS_COLLECTION)
        .doc(input.id)
        .update(removeUndefined(encryptedWebhook));

      log.info({ userId, webhookId: input.id }, 'Webhook updated');
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Failed to update webhook');
      return { success: false, error: 'Failed to update webhook' };
    }
  }

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
        .update(cleanForFirestore({
          successCount: webhook.successCount,
          failureCount: webhook.failureCount,
          lastTriggeredAt: webhook.lastTriggeredAt,
        }));
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
      .update(cleanForFirestore({
        lastUsedAt: new Date().toISOString(),
        usageCount: (siriToken.usageCount || 0) + 1,
      }));

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
