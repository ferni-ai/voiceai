/**
 * Publisher Authentication - Usage Examples
 *
 * This file demonstrates how to use the publisher authentication system.
 * Run these examples in a test environment to understand the API.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  registerPublisher,
  createApiKey,
  validateApiKey,
  rotateApiKey,
  listApiKeys,
  deleteApiKey,
  requirePublisherAuth,
  getPublisherSession,
} from '../publisher-auth.js';

// ============================================================================
// EXAMPLE 1: Register a New Publisher
// ============================================================================

async function exampleRegisterPublisher() {
  console.log('=== EXAMPLE 1: Register Publisher ===\n');

  const { publisher, apiKey } = await registerPublisher(
    'john@example.com',
    'John Doe'
  );

  console.log('Publisher created:');
  console.log('  ID:', publisher.id);
  console.log('  Email:', publisher.email);
  console.log('  Name:', publisher.name);
  console.log('  Verified:', publisher.verified);
  console.log('\nInitial API Key (test):', apiKey);
  console.log('  Keep this secret!\n');

  return { publisher, apiKey };
}

// ============================================================================
// EXAMPLE 2: Create Additional API Keys
// ============================================================================

async function exampleCreateApiKeys(publisherId: string) {
  console.log('=== EXAMPLE 2: Create API Keys ===\n');

  // Create a test key
  const testKey = await createApiKey(publisherId, 'test');
  console.log('Test API Key created:');
  console.log('  Key ID:', testKey.keyId);
  console.log('  API Key:', testKey.apiKey);
  console.log('  (Starts with: pk_test_)\n');

  // Try to create a live key (will fail if publisher not verified)
  try {
    const liveKey = await createApiKey(publisherId, 'live');
    console.log('Live API Key created:');
    console.log('  Key ID:', liveKey.keyId);
    console.log('  API Key:', liveKey.apiKey);
    console.log('  (Starts with: pk_live_)\n');
  } catch (error) {
    console.log('Live key creation failed:', error instanceof Error ? error.message : String(error));
    console.log('  (Publisher must be verified first)\n');
  }

  return testKey;
}

// ============================================================================
// EXAMPLE 3: Validate API Key
// ============================================================================

async function exampleValidateApiKey(apiKey: string) {
  console.log('=== EXAMPLE 3: Validate API Key ===\n');

  const session = await validateApiKey(apiKey);

  if (session) {
    console.log('API Key is valid!');
    console.log('  Publisher ID:', session.publisherId);
    console.log('  Publisher Name:', session.publisherName);
    console.log('  Verified:', session.verified);
    console.log('  Key Type:', session.keyType);
  } else {
    console.log('API Key is INVALID');
  }
  console.log('');

  return session;
}

// ============================================================================
// EXAMPLE 4: List API Keys
// ============================================================================

async function exampleListApiKeys(publisherId: string) {
  console.log('=== EXAMPLE 4: List API Keys ===\n');

  const keys = await listApiKeys(publisherId);

  console.log(`Found ${keys.length} API key(s):`);
  for (const key of keys) {
    console.log('\n  Key ID:', key.id);
    console.log('  Prefix:', key.keyPrefix);
    console.log('  Type:', key.type);
    console.log('  Created:', key.createdAt.toISOString());
    if (key.lastUsedAt) {
      console.log('  Last Used:', key.lastUsedAt.toISOString());
    }
  }
  console.log('');

  return keys;
}

// ============================================================================
// EXAMPLE 5: Rotate API Key
// ============================================================================

async function exampleRotateApiKey(publisherId: string, keyId: string) {
  console.log('=== EXAMPLE 5: Rotate API Key ===\n');

  const { apiKey: newApiKey, keyId: newKeyId } = await rotateApiKey(publisherId, keyId);

  console.log('API Key rotated successfully:');
  console.log('  Old Key ID:', keyId, '(deleted)');
  console.log('  New Key ID:', newKeyId);
  console.log('  New API Key:', newApiKey);
  console.log('  (Update your application with the new key)\n');

  return { newApiKey, newKeyId };
}

// ============================================================================
// EXAMPLE 6: Delete API Key
// ============================================================================

async function exampleDeleteApiKey(publisherId: string, keyId: string) {
  console.log('=== EXAMPLE 6: Delete API Key ===\n');

  await deleteApiKey(publisherId, keyId);

  console.log('API Key deleted successfully:');
  console.log('  Key ID:', keyId);
  console.log('  (This key can no longer be used)\n');
}

// ============================================================================
// EXAMPLE 7: Using Middleware in HTTP Handlers
// ============================================================================

async function exampleMiddleware() {
  console.log('=== EXAMPLE 7: Middleware Usage ===\n');

  // Simulate an HTTP request with API key
  const mockRequest = {
    headers: {
      authorization: 'Bearer pk_test_abc123xyz',
    },
  } as IncomingMessage;

  const mockResponse = {
    writeHead: (status: number, headers: Record<string, string>) => {
      console.log('Response:', status, headers);
    },
    end: (body: string) => {
      console.log('Body:', body);
    },
  } as unknown as ServerResponse;

  // Use middleware
  const session = await requirePublisherAuth(mockRequest, mockResponse);

  if (session) {
    console.log('\nAuthentication successful!');
    console.log('  Publisher:', session.publisherName);
    console.log('  ID:', session.publisherId);

    // Later in your handler, retrieve session
    const retrievedSession = getPublisherSession(mockRequest);
    console.log('\nRetrieved session:', retrievedSession?.publisherId);
  } else {
    console.log('\nAuthentication failed (see response above)');
  }
  console.log('');
}

// ============================================================================
// EXAMPLE 8: Integration with Marketplace Routes
// ============================================================================

async function exampleMarketplaceIntegration() {
  console.log('=== EXAMPLE 8: Marketplace Route Integration ===\n');

  console.log('Example route handler:\n');
  console.log(`
async function handlePublisherSubmit(req: IncomingMessage, res: ServerResponse) {
  // Authenticate publisher
  const session = await requirePublisherAuth(req, res);
  if (!session) return; // Response already sent by middleware

  // Parse request body
  const body = await parseBody(req);

  // Verify publisher owns the manifest
  if (body.manifest.publisher.id !== session.publisherId) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Publisher ID mismatch' }));
    return;
  }

  // Process submission
  registerTool(body.manifest);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}
  `.trim());
  console.log('\n');
}

// ============================================================================
// EXAMPLE 9: API Key Formats
// ============================================================================

function exampleApiKeyFormats() {
  console.log('=== EXAMPLE 9: API Key Formats ===\n');

  console.log('API Key Formats:');
  console.log('  Test keys: pk_test_<32-char-random>');
  console.log('  Live keys: pk_live_<32-char-random>\n');

  console.log('Header Options:');
  console.log('  Authorization: Bearer pk_test_abc123...');
  console.log('  x-api-key: pk_test_abc123...\n');

  console.log('Security:');
  console.log('  - Keys are hashed (SHA-256) before storage');
  console.log('  - Only key prefix (first 8 chars) stored for display');
  console.log('  - Full key shown only once at creation\n');
}

// ============================================================================
// MAIN DEMO (Run all examples)
// ============================================================================

async function runAllExamples() {
  try {
    // 1. Register publisher
    const { publisher, apiKey } = await exampleRegisterPublisher();

    // 2. Create additional keys
    const { keyId } = await exampleCreateApiKeys(publisher.id);

    // 3. Validate API key
    await exampleValidateApiKey(apiKey);

    // 4. List all keys
    const keys = await exampleListApiKeys(publisher.id);

    // 5. Rotate a key
    if (keys.length > 0) {
      await exampleRotateApiKey(publisher.id, keys[0].id);
    }

    // 6. Delete a key
    if (keys.length > 1) {
      await exampleDeleteApiKey(publisher.id, keys[1].id);
    }

    // 7. Middleware example
    await exampleMiddleware();

    // 8. Integration example
    await exampleMarketplaceIntegration();

    // 9. Key formats
    exampleApiKeyFormats();

    console.log('✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('❌ Error running examples:', error);
  }
}

// Uncomment to run all examples:
// runAllExamples();

export {
  exampleRegisterPublisher,
  exampleCreateApiKeys,
  exampleValidateApiKey,
  exampleListApiKeys,
  exampleRotateApiKey,
  exampleDeleteApiKey,
  exampleMiddleware,
  exampleMarketplaceIntegration,
  exampleApiKeyFormats,
  runAllExamples,
};
