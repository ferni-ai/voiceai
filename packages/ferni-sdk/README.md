# @ferni/sdk

Official TypeScript SDK for the Ferni Developer Platform. Build AI-powered voice experiences with human-like conversational capabilities.

## Installation

```bash
npm install @ferni/sdk
# or
pnpm add @ferni/sdk
# or
yarn add @ferni/sdk
```

## Quick Start

```typescript
import { FerniClient } from '@ferni/sdk';

const ferni = new FerniClient({
  apiKey: 'ferni_live_xxxxxxxxxxxxx',
});

// List your personas
const { personas } = await ferni.listPersonas();
console.log('My personas:', personas);
```

## API Reference

### FerniClient

The main client for interacting with the Ferni API.

```typescript
const ferni = new FerniClient({
  apiKey: 'ferni_live_xxxxxxxxxxxxx',
  baseUrl: 'https://api.ferni.ai', // Optional, this is the default
  timeout: 30000, // Optional, request timeout in ms
});
```

### API Keys

```typescript
// List all API keys
const { keys } = await ferni.listApiKeys();

// Create a new key (save the returned apiKey immediately!)
const { key } = await ferni.createApiKey({ type: 'live', name: 'Production' });
console.log('New key:', key.apiKey); // Only shown once!

// Rotate a key
const { key: newKey } = await ferni.rotateApiKey(keyId);

// Revoke a key
await ferni.revokeApiKey(keyId);
```

### Personas

```typescript
// List personas
const { personas } = await ferni.listPersonas();

// Create a persona
const { persona, validation } = await ferni.createPersona({
  identity: {
    id: 'wellness-guide',
    name: 'Aria',
    tagline: 'Your personal wellness companion',
  },
  voice: {
    provider: 'cartesia',
    voice_id: 'your-voice-id',
  },
  personality: {
    warmth: 0.9,
    humor_level: 0.3,
    directness: 0.6,
    formality: 0.4,
    traits: ['empathetic', 'patient', 'encouraging'],
  },
  knowledge: {
    category: 'wellness',
    domains: ['meditation', 'mindfulness', 'stress-management'],
  },
});

// Get full persona details
const { persona: full } = await ferni.getPersona(personaId);

// Update a draft persona
await ferni.updatePersona(personaId, updatedManifest);

// Validate before submission
const { validation, readyToSubmit } = await ferni.validatePersona(personaId);

// Submit for review
await ferni.submitPersona(personaId);

// Delete a draft
await ferni.deletePersona(personaId);
```

### Webhooks

```typescript
// List webhooks
const { items, pagination } = await ferni.listWebhooks();

// Create a webhook
const { data: webhook } = await ferni.createWebhook({
  name: 'Session Events',
  url: 'https://api.yourapp.com/webhooks/ferni',
  events: ['session.started', 'session.ended', 'transcript.ready'],
});

// Update a webhook
await ferni.updateWebhook(webhookId, { enabled: false });

// Test a webhook
const { data: result } = await ferni.testWebhook(webhookId);
console.log('Test result:', result.success, result.statusCode);

// Get delivery logs
const { data: { items: logs } } = await ferni.getWebhookLogs(webhookId);

// Delete a webhook
await ferni.deleteWebhook(webhookId);
```

### Analytics

```typescript
// Get overview with comparison to previous period
const { overview } = await ferni.getAnalyticsOverview('week');
console.log('Total API calls:', overview.totalApiCalls);
console.log('Change from last week:', overview.totalApiCallsChange);

// Get usage over time
const { usage } = await ferni.getUsageOverTime('month');

// Get per-persona usage
const { personas } = await ferni.getPersonaUsage('week');

// Get error breakdown
const { errors } = await ferni.getErrorBreakdown('day');
```

### MCP Servers (v2)

Register external Model Context Protocol servers to extend your personas with custom tools.

```typescript
// List MCP servers
const { data: servers } = await ferni.listMCPServers();

// Create an MCP server
const { data: server } = await ferni.createMCPServer({
  name: 'My CRM Tools',
  description: 'Tools for CRM integration',
  transport: 'http',
  endpoint: 'https://my-mcp-server.example.com',
  autoConnect: true,
});

// Test connection and discover tools
const { data: result } = await ferni.testMCPServer(serverId);
console.log('Connected:', result.connected);
console.log('Available tools:', result.tools);

// Get server tools
const { data: { tools } } = await ferni.getMCPServerTools(serverId);

// Update server
await ferni.updateMCPServer(serverId, { enabled: false });

// Delete server
await ferni.deleteMCPServer(serverId);
```

### Custom Tools (v2)

Create custom tools that can be called by your personas.

```typescript
// List custom tools
const { data: tools } = await ferni.listTools();

// Create a webhook-based tool
const { data: tool } = await ferni.createTool({
  name: 'lookup-customer',
  displayName: 'Look Up Customer',
  description: 'Look up customer information by email',
  llmDescription: 'Use this tool to find customer details when the user mentions their email',
  type: 'webhook',
  config: {
    url: 'https://api.yourapp.com/customers/lookup',
    method: 'POST',
  },
  parameters: {
    type: 'object',
    properties: {
      email: { type: 'string', description: 'Customer email address' },
    },
    required: ['email'],
  },
});

// Test a tool
const { data: result } = await ferni.testTool(toolId, { email: 'test@example.com' });
console.log('Result:', result.result);

// Update tool
await ferni.updateTool(toolId, { enabled: false });

// Delete tool
await ferni.deleteTool(toolId);
```

### Activities (v2)

Track custom activities and events.

```typescript
// List activities
const { data: activities } = await ferni.listActivities({ type: 'checkout' });

// Create an activity
const { data: activity } = await ferni.createActivity({
  type: 'checkout',
  name: 'User completed checkout',
  data: { cartTotal: 99.99, items: 3 },
  status: 'completed',
});

// Get activity statistics
const { data: stats } = await ferni.getActivityStats({ type: 'checkout' });
console.log('Total checkouts:', stats.totalCount);
console.log('By status:', stats.byStatus);

// Update activity
await ferni.updateActivity(activityId, { status: 'completed' });

// Delete activity
await ferni.deleteActivity(activityId);
```

### Workflows (v2)

Create multi-step automation workflows.

```typescript
// List workflows
const { data: workflows } = await ferni.listWorkflows();

// Create a workflow
const { data: workflow } = await ferni.createWorkflow({
  name: 'Customer Onboarding',
  description: 'Automated customer onboarding flow',
  trigger: { type: 'api', config: {} },
  nodes: [
    { id: 'start', name: 'Start', type: 'start', config: {} },
    { id: 'lookup', name: 'Lookup Customer', type: 'mcp_call', config: {
      serverId: 'mcp_123',
      toolName: 'lookup-customer',
    }},
    { id: 'end', name: 'End', type: 'end', config: {} },
  ],
  edges: [
    { id: 'e1', sourceId: 'start', targetId: 'lookup' },
    { id: 'e2', sourceId: 'lookup', targetId: 'end' },
  ],
  entryNodeId: 'start',
  exitNodeIds: ['end'],
});

// Execute workflow
const { data: execution } = await ferni.executeWorkflow(workflowId, {
  email: 'customer@example.com',
});
console.log('Execution status:', execution.status);

// List workflow executions
const { data: executions } = await ferni.listWorkflowExecutions(workflowId);

// Update workflow
await ferni.updateWorkflow(workflowId, { enabled: false });

// Delete workflow
await ferni.deleteWorkflow(workflowId);
```

### OAuth Providers (v2)

Manage OAuth providers for BYOC (Bring Your Own Credentials) pattern.

```typescript
// List OAuth providers
const { data: providers } = await ferni.listOAuthProviders();

// Create an OAuth provider
const { data: provider } = await ferni.createOAuthProvider({
  name: 'GitHub',
  authorizationUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  scopes: ['read:user', 'repo'],
});

// Start OAuth flow
const { data: { authorizationUrl, state } } = await ferni.authorizeOAuth(
  providerId,
  'https://yourapp.com/callback'
);
// Redirect user to authorizationUrl

// List stored tokens
const { data: tokens } = await ferni.listOAuthTokens({ providerId });

// Get access token (auto-refreshes if expired)
const { data: { accessToken } } = await ferni.getOAuthAccessToken(tokenId);

// Revoke token
await ferni.revokeOAuthToken(tokenId);

// Update provider
await ferni.updateOAuthProvider(providerId, { enabled: false });

// Delete provider
await ferni.deleteOAuthProvider(providerId);
```

## Webhook Verification

Verify webhook signatures to ensure requests are from Ferni:

```typescript
import { verifyWebhookSignature, parseWebhookEvent } from '@ferni/sdk';

// In your webhook handler
app.post('/webhooks/ferni', async (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = process.env.WEBHOOK_SECRET;

  try {
    const event = await parseWebhookEvent(req.body, signature, secret);

    switch (event.type) {
      case 'session.started':
        console.log('Session started:', event.data);
        break;
      case 'session.ended':
        console.log('Session ended:', event.data);
        break;
      case 'transcript.ready':
        console.log('Transcript:', event.data.transcript);
        break;
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Invalid webhook signature');
    res.status(401).send('Invalid signature');
  }
});
```

### Typed Event Router

For type-safe event handling:

```typescript
import { createWebhookRouter, parseWebhookEvent } from '@ferni/sdk';

const router = createWebhookRouter({
  'session.started': async (event) => {
    await analytics.trackSessionStart(event.data);
  },
  'session.ended': async (event) => {
    await analytics.trackSessionEnd(event.data);
  },
  'transcript.ready': async (event) => {
    await saveTranscript(event.data.sessionId, event.data.transcript);
  },
});

// In your handler
const event = await parseWebhookEvent(body, signature, secret);
await router(event);
```

## Error Handling

```typescript
import { FerniClient, FerniApiError } from '@ferni/sdk';

try {
  await ferni.getPersona('invalid-id');
} catch (error) {
  if (error instanceof FerniApiError) {
    console.error('API Error:', error.message);
    console.error('Status:', error.status);
    console.error('Code:', error.code);
  }
}
```

## Webhook Event Types

| Event | Description |
|-------|-------------|
| `session.started` | Voice session began |
| `session.ended` | Session completed |
| `session.error` | Error occurred during session |
| `persona.switched` | Persona handoff occurred |
| `tool.executed` | Tool was called during session |
| `transcript.ready` | Session transcript is available |

## Persona Status Lifecycle

```
draft → validating → submitted → approved → published
                              ↘ rejected (can update and resubmit)
```

## Rate Limits

| Tier | Requests/min | Concurrent Sessions |
|------|--------------|---------------------|
| Free | 100 | 5 |
| Pro | 500 | 25 |
| Enterprise | Custom | Custom |

## Publishing (Maintainers)

The SDK is published to npm via GitHub Actions.

### Automatic Publishing

1. **Tag-based**: Push a tag starting with `sdk-v` (e.g., `sdk-v0.2.0`)
   ```bash
   git tag sdk-v0.2.0
   git push origin sdk-v0.2.0
   ```

2. **Manual Dispatch**: Go to Actions → SDK Publish → Run workflow
   - Select version bump type (patch, minor, major)

### Requirements

- `NPM_TOKEN` secret must be configured in GitHub repository settings
- npm organization `@ferni` must exist with publish permissions

### Local Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm typecheck

# Build
pnpm build
```

## License

MIT
