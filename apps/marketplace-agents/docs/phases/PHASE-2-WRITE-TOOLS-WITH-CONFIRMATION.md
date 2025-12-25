# Phase 2: Write Tools with Confirmation

> **Timeline:** 3-4 weeks  
> **Risk Level:** Medium  
> **Dependencies:** Phase 1 complete

## Goals

1. Enable tools that make changes (trades, bookings, etc.)
2. Implement voice confirmation flow
3. Add basic permission checking
4. Support API key authentication (simple case)
5. Implement risk controls

---

## Scope

**In Scope:**
- Write operations (POST, PUT, DELETE)
- Voice confirmation before execution
- API key authentication (stored per-user)
- Basic risk controls (max values, blocked items)
- Permission checking (simple grant/deny)

**Out of Scope:**
- OAuth flows (Phase 3)
- Full permission management UI (Phase 3)
- Integration marketplace (Phase 3)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Agent Runtime                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  LLM: "I'll buy 50 shares of AAPL for you"                 │  │
│  │  → calls: place_trade({ symbol: 'AAPL', qty: 50, ... })    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                 Custom Tool Executor                        │  │
│  │  1. Validate parameters ✓                                  │  │
│  │  2. Check permissions ← NEW                                │  │
│  │  3. Apply risk controls ← NEW                              │  │
│  │  4. Check rate limits ✓                                    │  │
│  │  5. ══► CONFIRMATION REQUIRED ◄══  ← NEW                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│                              ▼                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Confirmation Service (NEW)                     │  │
│  │  - Pauses agent                                             │  │
│  │  - Speaks confirmation prompt                               │  │
│  │  - Waits for "yes"/"no"                                     │  │
│  │  - Returns decision                                         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                    │
│            ┌─────────────────┴─────────────────┐                 │
│            ▼                                   ▼                  │
│       [User: "Yes"]                     [User: "No"]             │
│            │                                   │                  │
│            ▼                                   ▼                  │
│  ┌──────────────────┐              ┌──────────────────┐         │
│  │  Execute Trade   │              │  Cancel & Report │         │
│  │  → Broker API    │              │  "Cancelled"     │         │
│  └──────────────────┘              └──────────────────┘         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. Confirmation Service

**File:** `src/services/confirmation/index.ts`

```typescript
/**
 * Confirmation Service
 * 
 * Handles voice and UI confirmation for high-risk tool executions.
 */

import { EventEmitter } from 'events';
import { getLogger } from '../../utils/safe-logger.js';
import { v4 as uuid } from 'uuid';

// Types
export interface ConfirmationRequest {
  id: string;
  sessionId: string;
  userId: string;
  toolId: string;
  prompt: string;
  parameters: Record<string, unknown>;
  timeoutMs: number;
  method: 'voice' | 'ui' | 'both';
  createdAt: Date;
}

export interface ConfirmationResult {
  confirmed: boolean;
  method?: 'voice' | 'ui';
  respondedAt?: Date;
  timedOut?: boolean;
  cancelled?: boolean;
}

// Pending confirmations store
const pendingConfirmations = new Map<string, {
  request: ConfirmationRequest;
  resolve: (result: ConfirmationResult) => void;
  timeoutId: NodeJS.Timeout;
}>();

// Event emitter for voice confirmation
export const confirmationEvents = new EventEmitter();

/**
 * Request confirmation from user
 */
export async function requestConfirmation(
  sessionId: string,
  userId: string,
  toolId: string,
  promptTemplate: string,
  parameters: Record<string, unknown>,
  options: {
    timeoutMs?: number;
    method?: 'voice' | 'ui' | 'both';
  } = {}
): Promise<ConfirmationResult> {
  const logger = getLogger();
  const { timeoutMs = 30000, method = 'voice' } = options;
  
  // Build prompt by substituting parameters
  const prompt = buildPrompt(promptTemplate, parameters);
  
  const request: ConfirmationRequest = {
    id: uuid(),
    sessionId,
    userId,
    toolId,
    prompt,
    parameters,
    timeoutMs,
    method,
    createdAt: new Date(),
  };
  
  logger.info({ requestId: request.id, toolId, prompt }, 'Requesting confirmation');
  
  return new Promise((resolve) => {
    // Set timeout
    const timeoutId = setTimeout(() => {
      logger.warn({ requestId: request.id }, 'Confirmation timed out');
      pendingConfirmations.delete(request.id);
      resolve({ confirmed: false, timedOut: true });
    }, timeoutMs);
    
    // Store pending confirmation
    pendingConfirmations.set(request.id, { request, resolve, timeoutId });
    
    // Emit event for voice handler to speak the prompt
    confirmationEvents.emit('confirmation_requested', request);
  });
}

/**
 * Handle user response to confirmation
 * Called by voice recognition or UI
 */
export function handleConfirmationResponse(
  sessionId: string,
  response: 'yes' | 'no' | 'cancel'
): boolean {
  const logger = getLogger();
  
  // Find pending confirmation for this session
  for (const [id, pending] of pendingConfirmations) {
    if (pending.request.sessionId === sessionId) {
      clearTimeout(pending.timeoutId);
      pendingConfirmations.delete(id);
      
      const confirmed = response === 'yes';
      logger.info({ requestId: id, response, confirmed }, 'Confirmation response received');
      
      pending.resolve({
        confirmed,
        method: 'voice',
        respondedAt: new Date(),
        cancelled: response === 'cancel',
      });
      
      return true;
    }
  }
  
  logger.warn({ sessionId, response }, 'No pending confirmation for session');
  return false;
}

/**
 * Cancel all pending confirmations for a session
 */
export function cancelPendingConfirmations(sessionId: string): void {
  for (const [id, pending] of pendingConfirmations) {
    if (pending.request.sessionId === sessionId) {
      clearTimeout(pending.timeoutId);
      pendingConfirmations.delete(id);
      pending.resolve({ confirmed: false, cancelled: true });
    }
  }
}

/**
 * Check if session has pending confirmation
 */
export function hasPendingConfirmation(sessionId: string): boolean {
  for (const pending of pendingConfirmations.values()) {
    if (pending.request.sessionId === sessionId) {
      return true;
    }
  }
  return false;
}

/**
 * Get pending confirmation for session
 */
export function getPendingConfirmation(sessionId: string): ConfirmationRequest | null {
  for (const pending of pendingConfirmations.values()) {
    if (pending.request.sessionId === sessionId) {
      return pending.request;
    }
  }
  return null;
}

/**
 * Build prompt by substituting parameters
 */
function buildPrompt(template: string, params: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result;
}
```

### 2. Voice Integration for Confirmation

**File:** `src/services/confirmation/voice-handler.ts`

```typescript
/**
 * Voice Handler for Confirmations
 * 
 * Integrates confirmation service with LiveKit voice agent.
 */

import { confirmationEvents, handleConfirmationResponse } from './index.js';
import type { ConfirmationRequest } from './index.js';
import { getLogger } from '../../utils/safe-logger.js';

// Store for TTS queue injection
let ttsQueueCallback: ((text: string, sessionId: string) => void) | null = null;

/**
 * Register TTS queue callback
 * Called during agent initialization
 */
export function registerTTSCallback(
  callback: (text: string, sessionId: string) => void
): void {
  ttsQueueCallback = callback;
}

/**
 * Initialize voice confirmation handler
 */
export function initializeVoiceConfirmation(): void {
  const logger = getLogger();
  
  confirmationEvents.on('confirmation_requested', (request: ConfirmationRequest) => {
    logger.debug({ requestId: request.id }, 'Voice confirmation requested');
    
    if (!ttsQueueCallback) {
      logger.error('TTS callback not registered');
      return;
    }
    
    // Inject confirmation prompt into TTS queue
    // This will interrupt the agent and speak the confirmation
    const confirmationPrompt = buildVoicePrompt(request);
    ttsQueueCallback(confirmationPrompt, request.sessionId);
  });
  
  logger.info('Voice confirmation handler initialized');
}

/**
 * Build voice-friendly confirmation prompt
 */
function buildVoicePrompt(request: ConfirmationRequest): string {
  // Add voice-friendly prefix and suffix
  return `Just to confirm: ${request.prompt} Say "yes" to proceed, or "no" to cancel.`;
}

/**
 * Process voice transcript for confirmation responses
 * Call this from the voice recognition pipeline
 */
export function processTranscriptForConfirmation(
  sessionId: string,
  transcript: string
): boolean {
  const lower = transcript.toLowerCase().trim();
  
  // Check for yes
  if (isYesResponse(lower)) {
    return handleConfirmationResponse(sessionId, 'yes');
  }
  
  // Check for no
  if (isNoResponse(lower)) {
    return handleConfirmationResponse(sessionId, 'no');
  }
  
  // Check for cancel
  if (isCancelResponse(lower)) {
    return handleConfirmationResponse(sessionId, 'cancel');
  }
  
  return false;
}

function isYesResponse(text: string): boolean {
  const yesPatterns = [
    'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay',
    'do it', 'go ahead', 'proceed', 'confirm', 'affirmative',
    'yes please', 'please do', 'that\'s right', 'correct'
  ];
  return yesPatterns.some(p => text.includes(p));
}

function isNoResponse(text: string): boolean {
  const noPatterns = [
    'no', 'nope', 'nah', 'don\'t', 'do not', 'stop',
    'negative', 'no thanks', 'never mind', 'forget it'
  ];
  return noPatterns.some(p => text.includes(p));
}

function isCancelResponse(text: string): boolean {
  const cancelPatterns = [
    'cancel', 'abort', 'stop', 'nevermind', 'never mind',
    'wait', 'hold on', 'scratch that'
  ];
  return cancelPatterns.some(p => text.includes(p));
}
```

### 3. Simple Permission Service

**File:** `src/services/permissions/index.ts`

```typescript
/**
 * Permission Service
 * 
 * Phase 2: Simple permission checking based on grants stored in Firestore.
 * Full UI management comes in Phase 3.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';

const db = getFirestore();

export interface PermissionGrant {
  user_id: string;
  agent_id: string;
  tool_id?: string;  // null = all tools
  scopes: string[];
  granted_at: Date;
  expires_at?: Date;
}

/**
 * Check if user has permission for a tool
 */
export async function hasPermission(
  userId: string,
  agentId: string,
  toolId: string,
  requiredScopes: string[]
): Promise<boolean> {
  const logger = getLogger();
  
  // Check for explicit tool grant
  const toolGrant = await getGrant(userId, agentId, toolId);
  if (toolGrant && hasRequiredScopes(toolGrant.scopes, requiredScopes)) {
    return true;
  }
  
  // Check for agent-wide grant (tool_id = null)
  const agentGrant = await getGrant(userId, agentId, null);
  if (agentGrant && hasRequiredScopes(agentGrant.scopes, requiredScopes)) {
    return true;
  }
  
  logger.debug({ userId, agentId, toolId }, 'Permission denied');
  return false;
}

/**
 * Grant permission
 */
export async function grantPermission(
  userId: string,
  agentId: string,
  toolId: string | null,
  scopes: string[],
  expiresAt?: Date
): Promise<void> {
  const docId = toolId 
    ? `${userId}_${agentId}_${toolId}`
    : `${userId}_${agentId}_all`;
  
  await db.collection('tool_permissions').doc(docId).set({
    user_id: userId,
    agent_id: agentId,
    tool_id: toolId,
    scopes,
    granted_at: Timestamp.now(),
    expires_at: expiresAt ? Timestamp.fromDate(expiresAt) : null,
    revoked_at: null,
  });
  
  getLogger().info({ userId, agentId, toolId, scopes }, 'Permission granted');
}

/**
 * Revoke permission
 */
export async function revokePermission(
  userId: string,
  agentId: string,
  toolId?: string
): Promise<void> {
  const docId = toolId 
    ? `${userId}_${agentId}_${toolId}`
    : `${userId}_${agentId}_all`;
  
  await db.collection('tool_permissions').doc(docId).update({
    revoked_at: Timestamp.now(),
  });
  
  getLogger().info({ userId, agentId, toolId }, 'Permission revoked');
}

/**
 * List all permissions for a user
 */
export async function listPermissions(userId: string): Promise<PermissionGrant[]> {
  const snapshot = await db.collection('tool_permissions')
    .where('user_id', '==', userId)
    .where('revoked_at', '==', null)
    .get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      user_id: data.user_id,
      agent_id: data.agent_id,
      tool_id: data.tool_id,
      scopes: data.scopes,
      granted_at: data.granted_at.toDate(),
      expires_at: data.expires_at?.toDate(),
    };
  });
}

// Helper functions

async function getGrant(
  userId: string,
  agentId: string,
  toolId: string | null
): Promise<PermissionGrant | null> {
  const docId = toolId 
    ? `${userId}_${agentId}_${toolId}`
    : `${userId}_${agentId}_all`;
  
  const doc = await db.collection('tool_permissions').doc(docId).get();
  
  if (!doc.exists) return null;
  
  const data = doc.data()!;
  
  // Check if revoked
  if (data.revoked_at) return null;
  
  // Check if expired
  if (data.expires_at && data.expires_at.toDate() < new Date()) return null;
  
  return {
    user_id: data.user_id,
    agent_id: data.agent_id,
    tool_id: data.tool_id,
    scopes: data.scopes,
    granted_at: data.granted_at.toDate(),
    expires_at: data.expires_at?.toDate(),
  };
}

function hasRequiredScopes(grantedScopes: string[], requiredScopes: string[]): boolean {
  return requiredScopes.every(required => 
    grantedScopes.includes(required) || grantedScopes.includes('*')
  );
}
```

### 4. Credential Manager (API Keys)

**File:** `src/services/credentials/index.ts`

```typescript
/**
 * Credential Manager
 * 
 * Phase 2: Simple API key storage with encryption.
 * OAuth support added in Phase 3.
 */

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';
import { encrypt, decrypt } from './encryption.js';

const db = getFirestore();

export interface StoredCredentials {
  user_id: string;
  integration_id: string;
  credentials: Record<string, string>;  // encrypted values
  created_at: Date;
  updated_at: Date;
}

/**
 * Store API credentials for an integration
 */
export async function storeCredentials(
  userId: string,
  integrationId: string,
  credentials: Record<string, string>
): Promise<void> {
  const logger = getLogger();
  
  // Encrypt each credential value
  const encrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    encrypted[key] = await encrypt(value);
  }
  
  const docId = `${userId}_${integrationId}`;
  
  await db.collection('user_credentials').doc(docId).set({
    user_id: userId,
    integration_id: integrationId,
    credentials: encrypted,
    created_at: Timestamp.now(),
    updated_at: Timestamp.now(),
  });
  
  logger.info({ userId, integrationId }, 'Credentials stored');
}

/**
 * Get credentials for an integration
 */
export async function getCredentials(
  userId: string,
  integrationId: string
): Promise<Record<string, string> | null> {
  const docId = `${userId}_${integrationId}`;
  const doc = await db.collection('user_credentials').doc(docId).get();
  
  if (!doc.exists) return null;
  
  const data = doc.data()!;
  
  // Decrypt each credential value
  const decrypted: Record<string, string> = {};
  for (const [key, value] of Object.entries(data.credentials as Record<string, string>)) {
    decrypted[key] = await decrypt(value);
  }
  
  return decrypted;
}

/**
 * Delete credentials for an integration
 */
export async function deleteCredentials(
  userId: string,
  integrationId: string
): Promise<void> {
  const docId = `${userId}_${integrationId}`;
  await db.collection('user_credentials').doc(docId).delete();
  getLogger().info({ userId, integrationId }, 'Credentials deleted');
}

/**
 * Check if user has credentials for an integration
 */
export async function hasCredentials(
  userId: string,
  integrationId: string
): Promise<boolean> {
  const docId = `${userId}_${integrationId}`;
  const doc = await db.collection('user_credentials').doc(docId).get();
  return doc.exists;
}
```

**File:** `src/services/credentials/encryption.ts`

```typescript
/**
 * Encryption utilities for credential storage
 * 
 * Uses Google Cloud KMS for encryption.
 * Fallback to AES-256-GCM with local key for development.
 */

import { KeyManagementServiceClient } from '@google-cloud/kms';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const USE_CLOUD_KMS = process.env.NODE_ENV === 'production';
const LOCAL_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || randomBytes(32).toString('hex');

// Cloud KMS client (production)
let kmsClient: KeyManagementServiceClient | null = null;
const KMS_KEY_NAME = process.env.KMS_KEY_NAME;

function getKmsClient(): KeyManagementServiceClient {
  if (!kmsClient) {
    kmsClient = new KeyManagementServiceClient();
  }
  return kmsClient;
}

/**
 * Encrypt a string value
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (USE_CLOUD_KMS && KMS_KEY_NAME) {
    return encryptWithKms(plaintext);
  }
  return encryptLocal(plaintext);
}

/**
 * Decrypt a string value
 */
export async function decrypt(ciphertext: string): Promise<string> {
  if (USE_CLOUD_KMS && KMS_KEY_NAME) {
    return decryptWithKms(ciphertext);
  }
  return decryptLocal(ciphertext);
}

// Cloud KMS encryption
async function encryptWithKms(plaintext: string): Promise<string> {
  const client = getKmsClient();
  const [result] = await client.encrypt({
    name: KMS_KEY_NAME,
    plaintext: Buffer.from(plaintext),
  });
  return Buffer.from(result.ciphertext as Uint8Array).toString('base64');
}

async function decryptWithKms(ciphertext: string): Promise<string> {
  const client = getKmsClient();
  const [result] = await client.decrypt({
    name: KMS_KEY_NAME,
    ciphertext: Buffer.from(ciphertext, 'base64'),
  });
  return Buffer.from(result.plaintext as Uint8Array).toString('utf-8');
}

// Local encryption (development)
function encryptLocal(plaintext: string): string {
  const key = Buffer.from(LOCAL_KEY, 'hex');
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decryptLocal(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
  const key = Buffer.from(LOCAL_KEY, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

### 5. Risk Controls

**File:** `src/tools/custom/risk-controls.ts`

```typescript
/**
 * Risk Controls for Custom Tools
 * 
 * Validates tool executions against user-defined limits.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { getLogger } from '../../utils/safe-logger.js';
import type { CustomToolDefinition } from './types.js';

const db = getFirestore();

export interface RiskControlConfig {
  max_value?: number;
  max_quantity?: number;
  require_confirmation_above?: number;
  allowed_symbols?: string[];
  blocked_symbols?: string[];
  max_per_day?: number;
}

export interface RiskCheckResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

/**
 * Check risk controls for a tool execution
 */
export async function checkRiskControls(
  userId: string,
  agentId: string,
  tool: CustomToolDefinition,
  parameters: Record<string, unknown>
): Promise<RiskCheckResult> {
  const logger = getLogger();
  
  // Get user's risk controls for this tool
  const controls = await getUserRiskControls(userId, agentId, tool.id);
  if (!controls) {
    // No custom controls, use tool defaults
    return { allowed: true, requiresConfirmation: tool.confirmation?.required ?? false };
  }
  
  // Check max value
  if (controls.max_value && parameters.value !== undefined) {
    const value = Number(parameters.value);
    if (value > controls.max_value) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: `Value ${value} exceeds maximum allowed ${controls.max_value}`,
      };
    }
  }
  
  // Check max quantity
  if (controls.max_quantity && parameters.quantity !== undefined) {
    const qty = Number(parameters.quantity);
    if (qty > controls.max_quantity) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: `Quantity ${qty} exceeds maximum allowed ${controls.max_quantity}`,
      };
    }
  }
  
  // Check blocked symbols
  if (controls.blocked_symbols && parameters.symbol !== undefined) {
    const symbol = String(parameters.symbol).toUpperCase();
    if (controls.blocked_symbols.includes(symbol)) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: `Symbol ${symbol} is blocked`,
      };
    }
  }
  
  // Check allowed symbols (whitelist)
  if (controls.allowed_symbols && parameters.symbol !== undefined) {
    const symbol = String(parameters.symbol).toUpperCase();
    if (!controls.allowed_symbols.includes(symbol)) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: `Symbol ${symbol} is not in allowed list`,
      };
    }
  }
  
  // Check if confirmation required based on value threshold
  let requiresConfirmation = tool.confirmation?.required ?? false;
  
  if (controls.require_confirmation_above && parameters.value !== undefined) {
    const value = Number(parameters.value);
    if (value > controls.require_confirmation_above) {
      requiresConfirmation = true;
    }
  }
  
  return { allowed: true, requiresConfirmation };
}

/**
 * Get user's risk controls for a tool
 */
async function getUserRiskControls(
  userId: string,
  agentId: string,
  toolId: string
): Promise<RiskControlConfig | null> {
  // Check tool-specific controls
  const toolDocId = `${userId}_${agentId}_${toolId}`;
  const toolDoc = await db.collection('tool_permissions').doc(toolDocId).get();
  
  if (toolDoc.exists && toolDoc.data()?.risk_controls) {
    return toolDoc.data()!.risk_controls as RiskControlConfig;
  }
  
  // Check agent-wide controls
  const agentDocId = `${userId}_${agentId}_all`;
  const agentDoc = await db.collection('tool_permissions').doc(agentDocId).get();
  
  if (agentDoc.exists && agentDoc.data()?.risk_controls) {
    return agentDoc.data()!.risk_controls as RiskControlConfig;
  }
  
  return null;
}

/**
 * Set risk controls for a user
 */
export async function setRiskControls(
  userId: string,
  agentId: string,
  toolId: string | null,
  controls: RiskControlConfig
): Promise<void> {
  const docId = toolId 
    ? `${userId}_${agentId}_${toolId}`
    : `${userId}_${agentId}_all`;
  
  await db.collection('tool_permissions').doc(docId).update({
    risk_controls: controls,
  });
  
  getLogger().info({ userId, agentId, toolId, controls }, 'Risk controls updated');
}
```

### 6. Updated Executor with Confirmation

**File:** `src/tools/custom/executor.ts` (additions)

```typescript
// Add imports
import { requestConfirmation } from '../../services/confirmation/index.js';
import { hasPermission } from '../../services/permissions/index.js';
import { getCredentials } from '../../services/credentials/index.js';
import { checkRiskControls } from './risk-controls.js';

// Update executeCustomTool function:

export async function executeCustomTool(
  tool: CustomToolDefinition,
  parameters: Record<string, unknown>,
  context: ToolExecutionContext
): Promise<ToolExecutionResult> {
  const startTime = Date.now();
  const logger = getLogger();
  
  try {
    // 1. Validate parameters
    const paramValidation = validateParameters(tool.parameters, parameters);
    if (!paramValidation.valid) {
      return { success: false, error: { code: 'INVALID_PARAMETERS', message: '...' }, execution_time_ms: 0 };
    }
    
    // 2. Check permissions (NEW)
    const requiredScopes = tool.requires?.permissions || [];
    if (requiredScopes.length > 0) {
      const hasPermit = await hasPermission(
        context.userId,
        context.agentId,
        tool.id,
        requiredScopes
      );
      if (!hasPermit) {
        return {
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: `You haven't granted permission for ${tool.name}. Would you like to enable it?`,
          },
          execution_time_ms: Date.now() - startTime,
        };
      }
    }
    
    // 3. Check risk controls (NEW)
    const riskCheck = await checkRiskControls(context.userId, context.agentId, tool, parameters);
    if (!riskCheck.allowed) {
      return {
        success: false,
        error: {
          code: 'RISK_LIMIT_EXCEEDED',
          message: riskCheck.reason || 'Risk limit exceeded',
        },
        execution_time_ms: Date.now() - startTime,
      };
    }
    
    // 4. Check rate limits
    const rateLimitCheck = await checkRateLimit(context.userId, tool.id, tool.rate_limits);
    if (!rateLimitCheck.allowed) {
      return { success: false, error: { code: 'RATE_LIMITED', message: '...' }, execution_time_ms: 0 };
    }
    
    // 5. Request confirmation if needed (NEW)
    if (riskCheck.requiresConfirmation || tool.confirmation?.required) {
      const confirmResult = await requestConfirmation(
        context.sessionId,
        context.userId,
        tool.id,
        tool.confirmation?.prompt || `Proceed with ${tool.name}?`,
        parameters,
        {
          timeoutMs: (tool.confirmation?.timeout_seconds || 30) * 1000,
          method: tool.confirmation?.method || 'voice',
        }
      );
      
      if (!confirmResult.confirmed) {
        return {
          success: false,
          error: {
            code: confirmResult.timedOut ? 'CONFIRMATION_TIMEOUT' : 'CONFIRMATION_DENIED',
            message: confirmResult.timedOut 
              ? 'Confirmation timed out. Please try again.'
              : 'Action cancelled.',
          },
          execution_time_ms: Date.now() - startTime,
          confirmation_used: true,
        };
      }
    }
    
    // 6. Get credentials if needed (NEW)
    let credentials: Record<string, string> | null = null;
    if (tool.requires?.integration) {
      credentials = await getCredentials(context.userId, tool.requires.integration);
      if (!credentials) {
        return {
          success: false,
          error: {
            code: 'CREDENTIALS_MISSING',
            message: `Please connect your ${tool.requires.integration} account first.`,
          },
          execution_time_ms: Date.now() - startTime,
        };
      }
    }
    
    // 7. Execute
    const result = await executeImplementation(tool, parameters, credentials);
    
    // 8. Increment rate limit
    await incrementRateLimit(context.userId, tool.id);
    
    // 9. Log execution
    await logToolExecution({ /* ... */ });
    
    return {
      success: true,
      data: result,
      execution_time_ms: Date.now() - startTime,
    };
    
  } catch (error) {
    // ... error handling
  }
}

/**
 * Execute implementation with credentials
 */
async function executeImplementation(
  tool: CustomToolDefinition,
  parameters: Record<string, unknown>,
  credentials: Record<string, string> | null
): Promise<unknown> {
  const { url, method = 'POST', headers = {}, timeout_ms = 30000 } = tool.implementation;
  
  if (!url) throw new Error('URL required');
  
  // Build headers with auth
  const finalHeaders = { ...headers };
  
  if (credentials) {
    // Support common auth patterns
    if (credentials.api_key) {
      finalHeaders['Authorization'] = `Bearer ${credentials.api_key}`;
    }
    if (credentials.api_secret) {
      finalHeaders['X-API-Secret'] = credentials.api_secret;
    }
  }
  
  const finalUrl = substituteUrlParams(url, parameters);
  const body = method !== 'GET' ? JSON.stringify(parameters) : undefined;
  
  const response = await fetch(finalUrl, {
    method,
    headers: { 'Content-Type': 'application/json', ...finalHeaders },
    body,
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  return response.json();
}
```

---

## Example: Place Trade Tool

```json
{
  "id": "place-trade",
  "name": "Place Stock Trade",
  "description": "Execute a buy or sell order for stocks",
  "category": "trading",
  "risk_level": "high",
  "requires": {
    "integration": "alpaca",
    "permissions": ["trading:execute"],
    "user_confirmation": true
  },
  "parameters": {
    "type": "object",
    "properties": {
      "symbol": { "type": "string" },
      "action": { "type": "string", "enum": ["buy", "sell"] },
      "quantity": { "type": "integer", "minimum": 1 },
      "order_type": { "type": "string", "enum": ["market", "limit"] },
      "limit_price": { "type": "number" }
    },
    "required": ["symbol", "action", "quantity"]
  },
  "confirmation": {
    "required": true,
    "prompt": "I'm about to {action} {quantity} shares of {symbol}. Should I proceed?",
    "timeout_seconds": 30,
    "method": "voice"
  },
  "implementation": {
    "type": "rest_api",
    "url": "https://paper-api.alpaca.markets/v2/orders",
    "method": "POST",
    "headers": {
      "APCA-API-KEY-ID": "${credentials.api_key}",
      "APCA-API-SECRET-KEY": "${credentials.api_secret}"
    }
  },
  "rate_limits": {
    "per_minute": 5,
    "per_day": 50
  }
}
```

---

## Acceptance Criteria

- [ ] Write tools execute with POST/PUT/DELETE methods
- [ ] Voice confirmation interrupts agent and speaks prompt
- [ ] User "yes" proceeds with execution
- [ ] User "no" cancels and returns friendly message
- [ ] Confirmation timeout handled gracefully
- [ ] Permission check blocks unauthorized tools
- [ ] Risk controls block exceeding limits
- [ ] API key credentials stored securely (encrypted)
- [ ] Credentials injected into requests
- [ ] All executions logged with confirmation status

---

## Estimated Effort

| Task | Hours |
|------|-------|
| Confirmation service | 20 |
| Voice integration | 16 |
| Permission service | 12 |
| Credential manager | 16 |
| Risk controls | 12 |
| Executor updates | 16 |
| Testing | 24 |
| Documentation | 8 |
| **Total** | **124 hours (~3 weeks)** |

