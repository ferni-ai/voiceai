/**
 * Marketplace API Helpers
 *
 * Shared utilities for marketplace routes.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { AgentManifest, ToolManifest } from '../../marketplace/schema/types.js';
import { parseBody as parseBodyHelper, sendJSON } from '../helpers.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PublisherSession {
  publisherId: string;
  publisherName: string;
  verified: boolean;
}

// ============================================================================
// REQUEST HELPERS
// ============================================================================

/**
 * Parse raw body from request (for Stripe webhooks)
 */
export async function parseRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Parse JSON body using centralized helper
 */
export async function parseBody<T = unknown>(req: IncomingMessage): Promise<T> {
  return parseBodyHelper<T>(req);
}

/**
 * Send JSON response using centralized helper with swapped parameter order.
 * Wrapper for backward compatibility: sendJson(res, status, data)
 */
export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  sendJSON(res, data, status);
}

/**
 * Get user ID from request headers
 * SECURITY: Prioritizes Firebase auth (x-firebase-uid) over deprecated x-user-id
 */
export function getUserId(req: IncomingMessage): string | null {
  // SECURITY: Prioritize Firebase auth
  const firebaseUid = req.headers['x-firebase-uid'] as string | undefined;
  if (firebaseUid) return firebaseUid;

  // Legacy header (deprecated)
  return (req.headers['x-user-id'] as string) || null;
}

/**
 * Get publisher session from headers
 */
export function getPublisher(req: IncomingMessage): PublisherSession | null {
  const publisherId = req.headers['x-publisher-id'] as string;
  if (!publisherId) return null;

  return {
    publisherId,
    publisherName: (req.headers['x-publisher-name'] as string) || 'Unknown Publisher',
    verified: true,
  };
}

/**
 * Get subscription tier from headers (default: free)
 */
export function getSubscriptionTier(req: IncomingMessage): string {
  return (req.headers['x-subscription-tier'] as string) || 'free';
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateToolManifest(manifest: ToolManifest): string[] {
  const errors: string[] = [];

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('Tool ID is required');
  } else if (!/^[a-z0-9-]+$/.test(manifest.id)) {
    errors.push('Tool ID must be lowercase alphanumeric with hyphens');
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Tool name is required');
  }

  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('Valid semantic version required (e.g., 1.0.0)');
  }

  if (!manifest.publisher?.id) {
    errors.push('Publisher ID is required');
  }

  if (!manifest.description?.short) {
    errors.push('Short description is required');
  }

  if (!manifest.execution?.runtime?.type) {
    errors.push('Execution runtime type is required');
  }

  if (!manifest.interface?.llmDescription) {
    errors.push('LLM description is required for tool discovery');
  }

  return errors;
}

export function validateAgentManifest(manifest: AgentManifest): string[] {
  const errors: string[] = [];

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('Agent ID is required');
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Agent name is required');
  }

  if (!manifest.displayName) {
    errors.push('Display name is required');
  }

  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('Valid semantic version required');
  }

  if (!manifest.publisher?.id) {
    errors.push('Publisher ID is required');
  }

  return errors;
}
