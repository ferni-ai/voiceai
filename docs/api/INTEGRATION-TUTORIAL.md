# Ferni Developer Platform Integration Tutorial

Build your first AI-powered voice experience in 15 minutes.

---

## What You'll Build

In this tutorial, you'll:

1. Create a Ferni developer account and API key
2. Build a custom AI persona
3. Set up webhooks to receive events
4. Handle session transcripts

**Prerequisites:**
- Node.js 18+ installed
- Basic TypeScript/JavaScript knowledge

---

## Step 1: Set Up Your Project

Create a new project and install the SDK:

```bash
mkdir my-ferni-app
cd my-ferni-app
npm init -y
npm install @ferni/sdk express dotenv
npm install -D typescript @types/node @types/express ts-node
```

Create a `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

Create a `.env` file:

```bash
FERNI_API_KEY=ferni_test_xxxxxxxxxxxxx
WEBHOOK_SECRET=your_webhook_secret
PORT=3000
```

---

## Step 2: Create Your First Persona

Create `src/setup-persona.ts`:

```typescript
import { FerniClient } from '@ferni/sdk';
import 'dotenv/config';

const ferni = new FerniClient({
  apiKey: process.env.FERNI_API_KEY!,
});

async function createWellnessCoach() {
  console.log('Creating wellness coach persona...');

  try {
    // Create the persona
    const { persona, validation } = await ferni.createPersona({
      identity: {
        id: 'wellness-coach-v1',
        name: 'Sage',
        tagline: 'Your mindful wellness companion',
        description: `Sage is a calm, supportive wellness coach who helps users
          build healthy habits through gentle guidance and evidence-based techniques.`,
        aliases: ['wellness guide', 'mindfulness coach', 'health companion'],
      },
      voice: {
        provider: 'cartesia',
        voice_id: 'a0e99841-438c-4a64-b679-ae501e7d6091', // Calm, warm voice
        name: 'Sage Voice',
      },
      personality: {
        warmth: 0.9,        // Very warm and empathetic
        humor_level: 0.3,   // Light, appropriate humor
        directness: 0.6,    // Balanced - supportive but clear
        formality: 0.4,     // Casual and approachable
        traits: [
          'empathetic',
          'patient',
          'encouraging',
          'knowledgeable',
          'non-judgmental',
        ],
      },
      knowledge: {
        category: 'wellness',
        domains: [
          'meditation',
          'mindfulness',
          'stress-management',
          'sleep-hygiene',
          'habit-formation',
        ],
        expertise_tags: [
          'breathwork',
          'guided-relaxation',
          'cognitive-reframing',
          'sleep-optimization',
        ],
      },
      behaviors: {
        greetings: [
          "Hey there! How are you feeling today?",
          "Hi! I'm here whenever you need a moment of calm.",
          "Hello! Ready to take a mindful moment together?",
        ],
        backchannels: [
          'mm-hmm',
          'I hear you',
          'that makes sense',
          'I understand',
        ],
        thinking_sounds: [
          'hmm',
          'let me think about that',
          "let's see",
        ],
      },
    });

    console.log('✅ Persona created:', persona.name);
    console.log('   ID:', persona.id);
    console.log('   Status:', persona.status);

    // Check validation results
    if (validation.errors.length > 0) {
      console.log('❌ Validation errors:', validation.errors);
    } else {
      console.log('✅ Validation passed');
    }

    if (validation.warnings.length > 0) {
      console.log('⚠️ Warnings:', validation.warnings);
    }

    // Validate before submission
    const { readyToSubmit } = await ferni.validatePersona(persona.id);

    if (readyToSubmit) {
      console.log('\n📤 Persona is ready to submit for review!');
      console.log('   Run: ferni.submitPersona("' + persona.id + '")');
    }

    return persona;
  } catch (error) {
    console.error('Failed to create persona:', error);
    throw error;
  }
}

// Run the setup
createWellnessCoach()
  .then(() => console.log('\nDone!'))
  .catch(() => process.exit(1));
```

Run it:

```bash
npx ts-node src/setup-persona.ts
```

---

## Step 3: Set Up Webhooks

Create `src/webhook-server.ts`:

```typescript
import express from 'express';
import { FerniClient, parseWebhookEvent, createWebhookRouter } from '@ferni/sdk';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 3000;

const ferni = new FerniClient({
  apiKey: process.env.FERNI_API_KEY!,
});

// Use raw body for webhook signature verification
app.use('/webhooks/ferni', express.raw({ type: 'application/json' }));
app.use(express.json());

// Create typed webhook router
const handleWebhook = createWebhookRouter({
  'session.started': async (event) => {
    console.log('🎙️ Session started:', {
      sessionId: event.data.sessionId,
      personaId: event.data.personaId,
      userId: event.data.userId,
    });

    // Example: Track session in your database
    // await db.sessions.create({ ...event.data });
  },

  'session.ended': async (event) => {
    console.log('👋 Session ended:', {
      sessionId: event.data.sessionId,
      duration: event.data.durationSeconds,
      turnCount: event.data.turnCount,
    });

    // Example: Update session record
    // await db.sessions.update(event.data.sessionId, { endedAt: new Date() });
  },

  'session.error': async (event) => {
    console.error('❌ Session error:', {
      sessionId: event.data.sessionId,
      error: event.data.error,
      code: event.data.errorCode,
    });

    // Example: Alert on critical errors
    // await alerting.send('Session error', event.data);
  },

  'persona.switched': async (event) => {
    console.log('🔄 Persona switched:', {
      sessionId: event.data.sessionId,
      fromPersona: event.data.fromPersonaId,
      toPersona: event.data.toPersonaId,
    });
  },

  'tool.executed': async (event) => {
    console.log('🔧 Tool executed:', {
      sessionId: event.data.sessionId,
      tool: event.data.toolName,
      success: event.data.success,
    });
  },

  'transcript.ready': async (event) => {
    console.log('📝 Transcript ready:', {
      sessionId: event.data.sessionId,
      turnCount: event.data.transcript.turns.length,
    });

    // Example: Store transcript
    // await storage.saveTranscript(event.data.sessionId, event.data.transcript);
  },
});

// Webhook endpoint
app.post('/webhooks/ferni', async (req, res) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const body = req.body.toString();

  try {
    // Verify and parse the webhook
    const event = await parseWebhookEvent(
      body,
      signature,
      process.env.WEBHOOK_SECRET!
    );

    console.log(`\n📨 Received ${event.type} event`);

    // Route to the appropriate handler
    await handleWebhook(event);

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(401).json({ error: 'Invalid signature' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Webhook server running on http://localhost:${port}`);
  console.log(`   Webhook endpoint: http://localhost:${port}/webhooks/ferni`);
});
```

---

## Step 4: Register Your Webhook

Create `src/register-webhook.ts`:

```typescript
import { FerniClient } from '@ferni/sdk';
import 'dotenv/config';

const ferni = new FerniClient({
  apiKey: process.env.FERNI_API_KEY!,
});

async function registerWebhook() {
  // Your public URL (use ngrok for local development)
  const webhookUrl = process.env.WEBHOOK_URL || 'https://your-domain.com/webhooks/ferni';

  console.log('Registering webhook...');

  const { data: webhook } = await ferni.createWebhook({
    name: 'My App Events',
    url: webhookUrl,
    events: [
      'session.started',
      'session.ended',
      'session.error',
      'persona.switched',
      'tool.executed',
      'transcript.ready',
    ],
    enabled: true,
  });

  console.log('✅ Webhook registered:');
  console.log('   ID:', webhook.id);
  console.log('   URL:', webhook.url);
  console.log('   Events:', webhook.events.join(', '));
  console.log('\n⚠️ Save this secret! Add to .env as WEBHOOK_SECRET=');
  console.log('   Secret:', webhook.secret);

  // Test the webhook
  console.log('\n📤 Sending test event...');
  const { data: testResult } = await ferni.testWebhook(webhook.id);

  if (testResult.success) {
    console.log('✅ Test event delivered successfully');
    console.log('   Status:', testResult.statusCode);
    console.log('   Time:', testResult.executionTimeMs, 'ms');
  } else {
    console.log('❌ Test event failed:', testResult.error);
  }
}

registerWebhook()
  .then(() => console.log('\nDone!'))
  .catch(console.error);
```

---

## Step 5: Local Development with ngrok

For local development, use [ngrok](https://ngrok.com/) to expose your webhook endpoint:

```bash
# Start your webhook server
npx ts-node src/webhook-server.ts

# In another terminal, expose it via ngrok
ngrok http 3000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`) and update your `.env`:

```bash
WEBHOOK_URL=https://abc123.ngrok.io/webhooks/ferni
```

Then register your webhook:

```bash
npx ts-node src/register-webhook.ts
```

---

## Step 6: Monitor Your Integration

Create `src/monitor.ts`:

```typescript
import { FerniClient } from '@ferni/sdk';
import 'dotenv/config';

const ferni = new FerniClient({
  apiKey: process.env.FERNI_API_KEY!,
});

async function showDashboard() {
  // Get analytics overview
  const { overview } = await ferni.getAnalyticsOverview('day');

  console.log('📊 Today\'s Stats:');
  console.log('   API Calls:', overview.totalApiCalls, `(${overview.totalApiCallsChange > 0 ? '+' : ''}${overview.totalApiCallsChange}%)`);
  console.log('   Unique Users:', overview.uniqueUsers, `(${overview.uniqueUsersChange > 0 ? '+' : ''}${overview.uniqueUsersChange}%)`);
  console.log('   Error Rate:', overview.errorRate.toFixed(1), '%');
  console.log('   Avg Response:', overview.avgResponseTime, 'ms');

  // Get persona usage
  const { personas } = await ferni.getPersonaUsage('day');

  if (personas.length > 0) {
    console.log('\n👥 Persona Usage:');
    for (const p of personas) {
      console.log(`   ${p.personaName}: ${p.totalCalls} calls, ${p.uniqueUsers} users`);
    }
  }

  // Check for errors
  const { errors } = await ferni.getErrorBreakdown('day');

  if (errors.length > 0) {
    console.log('\n⚠️ Recent Errors:');
    for (const e of errors) {
      console.log(`   ${e.code}: ${e.count} occurrences`);
    }
  }

  // Check webhook health
  const { items: webhooks } = await ferni.listWebhooks();

  console.log('\n🔔 Webhooks:');
  for (const wh of webhooks) {
    const status = wh.enabled ? '✅' : '❌';
    const failures = wh.failureCount > 0 ? ` (${wh.failureCount} failures)` : '';
    console.log(`   ${status} ${wh.name}${failures}`);
  }
}

showDashboard()
  .then(() => console.log('\nDone!'))
  .catch(console.error);
```

Run the monitor:

```bash
npx ts-node src/monitor.ts
```

---

## Complete Project Structure

```
my-ferni-app/
├── src/
│   ├── setup-persona.ts      # Create your persona
│   ├── webhook-server.ts     # Handle webhook events
│   ├── register-webhook.ts   # Register webhook endpoint
│   └── monitor.ts            # View analytics
├── .env                      # Environment variables
├── package.json
└── tsconfig.json
```

---

## Next Steps

1. **Submit your persona for review** once you're happy with it
2. **Switch to a live API key** for production
3. **Add more event handlers** for your specific use case
4. **Set up error alerting** for session.error events
5. **Store transcripts** for analytics and quality review

### Useful Resources

- [API Reference](/docs/api/DEVELOPER-API-REFERENCE.md)
- [Webhook Events](/docs/api/WEBHOOK-EVENTS.md)
- [Authentication Guide](/docs/api/AUTHENTICATION.md)
- [Error Codes](/docs/api/ERROR-CODES.md)

---

## Troubleshooting

### Webhook signature verification fails

- Ensure you're using the raw request body (not parsed JSON)
- Check that your `WEBHOOK_SECRET` matches the secret from webhook creation
- Verify your server clock is synchronized (signatures expire after 5 minutes)

### Persona validation fails

- Check all required fields are present (identity, voice, personality, knowledge)
- Ensure personality values are between 0 and 1
- Add at least 2 personality traits
- Add at least 1 knowledge domain

### Rate limit exceeded

- Upgrade your plan for higher limits
- Implement exponential backoff on retries
- Cache responses where appropriate

---

*Last updated: January 2025*
