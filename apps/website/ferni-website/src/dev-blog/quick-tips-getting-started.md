---
title: "5 Patterns That Saved Our Production Voice Agent"
excerpt: "The code snippets we wish we'd known from day one - learned the hard way so you don't have to."
author: "Seth Ford"
authorInitials: "SF"
authorColor: "#4a6741"
date: 2026-01-10
category: "Quick Tips"
image: "quick-tips-essentials.png"
readTime: 5
---

# 5 Patterns That Saved Our Production Voice Agent

**At 2:47 AM on launch day, our voice agent stopped responding to every third user.**

No errors. No crashes. Just... silence. Users would say "Hey Ferni" and get nothing back. We spent four hours debugging before finding the culprit: a missing reconnection handler.

That night taught us something important: **voice AI has failure modes you've never seen in traditional web development.** Network blips that would be invisible in HTTP become conversation-ending silences. Rate limits don't show error pages - they just make your AI seem stupid.

Here are five patterns we learned the hard way. Copy-paste them into your codebase before you need them.

---

## 1. The Reconnection Handler That Would Have Saved Launch Night

Our original code looked innocent enough:

```typescript
const client = new FerniClient({ apiKey: process.env.FERNI_API_KEY });
await client.start();
// Done! ...right?
```

The problem? WebSocket connections drop. A lot. Mobile users walk through dead zones. Coffee shop WiFi hiccups. Home routers restart at 3 AM. And when that connection drops mid-sentence, your user gets silence.

**What we use now:**

```typescript
const client = new FerniClient({
  apiKey: process.env.FERNI_API_KEY,
  reconnect: true,
  reconnectAttempts: 3,
  reconnectDelay: 1000,  // Exponential backoff starts here
});

// This saved us on launch night
client.on('disconnected', (reason) => {
  analytics.track('connection_lost', { reason });
  // Show "reconnecting..." indicator
  ui.showReconnecting();
});

client.on('reconnecting', (attempt) => {
  if (attempt > 2) {
    ui.showMessage("Hold tight, I'm reconnecting...");
  }
});

client.on('connected', () => {
  ui.hideReconnecting();
  // User doesn't even know it happened
});
```

The key insight: **users forgive reconnection delays if they know what's happening.** What they won't forgive is unexplained silence.

---

## 2. The Webhook Signature Check That Prevented a $50K Fraud Attempt

Three weeks after launch, we got an unusual spike in "subscription upgraded" webhooks. All from the same IP. All with suspiciously similar timing.

Someone had found our webhook endpoint and was trying to spoof upgrade events to get free premium access.

Fortunately, we'd implemented signature verification. The fraudulent requests all failed validation and were logged (we forwarded them to our security team). Without this check, we would have accidentally granted free subscriptions to hundreds of spoofed accounts.

**This is not optional:**

```typescript
import { verifyWebhookSignature } from '@ferni/sdk';

app.post('/webhook', (req, res) => {
  const signature = req.headers['x-ferni-signature'];
  const timestamp = req.headers['x-ferni-timestamp'];

  // This check stopped the fraud attempt
  const isValid = verifyWebhookSignature({
    payload: req.body,
    signature,
    timestamp,
    secret: process.env.WEBHOOK_SECRET,
    maxAge: 300,  // Reject anything older than 5 minutes
  });

  if (!isValid) {
    // Log it - you'll want to know about these
    security.log('invalid_webhook', { ip: req.ip });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Safe to process
  handleWebhook(req.body);
  res.json({ received: true });
});
```

**Pro tip:** Set `maxAge` to prevent replay attacks. We learned this after someone tried to replay a legitimate webhook 1000 times.

---

## 3. The Handoff Pattern That Made Users Think Our AI Was Psychic

Users would start conversations with Ferni, then say "actually, can I talk to someone who knows about fitness?" We had Maya (our coaching persona), but the naive approach - just switching - felt jarring.

"Hi! I'm Maya! How can I help?"

...when Maya had no idea what the user had just spent 5 minutes explaining to Ferni.

**The context-preserving handoff:**

```typescript
async function handoffToSpecialist(context, targetPersona) {
  // Don't just switch - bring the conversation with you
  const summary = await context.summarizeConversation({
    maxLength: 500,
    focus: 'user_concerns_and_preferences',
  });

  return {
    action: 'handoff',
    target: targetPersona,
    context: {
      summary,
      userMood: context.detectedMood,
      pendingTopics: context.unaddressedTopics,
      // This is the magic
      continuationPrompt: `Continue from: "${context.lastUserMessage}"`,
    },
  };
}
```

Now Maya would say: "Ferni mentioned you're looking to start a morning workout routine and that you've struggled with consistency before. I totally get that - let's figure out something that actually fits your life."

Users thought our AI was psychic. It wasn't - it just remembered what they'd said.

---

## 4. The Streaming Handler That Made Our App Feel Instant

Our first implementation waited for the complete response before doing anything. The LLM would think for 800ms, then suddenly dump the entire response. It felt sluggish and robotic.

The fix was streaming - but not just for text. Voice AI streams emotions, actions, and transcript simultaneously.

```typescript
const stream = await client.streamResponse(userInput);

let fullTranscript = '';
for await (const chunk of stream) {
  switch (chunk.type) {
    case 'transcript':
      // Text starts appearing instantly
      fullTranscript += chunk.text;
      ui.updateTranscript(fullTranscript);
      break;

    case 'emotion':
      // Avatar reacts BEFORE words finish
      // This creates the "anticipation" effect
      updateAvatarExpression(chunk.emotion);
      break;

    case 'action':
      // Tools execute mid-sentence
      // "Let me check your calendar..." [calendar actually opens]
      executeAction(chunk.action);
      break;
  }
}
```

The result: responses feel 3x faster even though the actual latency is the same. Perception matters.

---

## 5. The Error Boundary That Turned Failures Into Features

Rate limits were killing our user experience. The LLM would hit its context limit mid-conversation, and users would get a generic "Something went wrong."

We turned this into a feature instead of a bug:

```typescript
async function safeVoiceInteraction(input) {
  try {
    return await client.process(input);
  } catch (error) {
    if (error.code === 'CONTEXT_LIMIT') {
      // Don't show an error - compress and continue
      await client.compactContext({
        preserveRecent: 10,  // Keep last 10 turns
        summarizeRest: true,  // Summarize older context
      });

      return await client.process(input);
    }

    if (error.code === 'RATE_LIMITED') {
      // Make the delay feel intentional
      return {
        response: "Give me just a second to think about that...",
        retry: true,
        retryAfter: error.retryAfter,
      };
    }

    // Unknown error - log it, show graceful message
    errorTracker.capture(error);
    return {
      response: "I got a bit confused there. Could you say that again?",
      retry: false,
    };
  }
}
```

Users don't know they hit a rate limit. They just think the AI is thoughtful.

---

## The Pattern Behind the Patterns

All five of these have something in common: **they anticipate failure modes that break the illusion of conversation.**

Traditional web apps can show loading spinners. They can display error messages. They can retry in the background while users read content.

Voice AI can't do any of that. When something goes wrong, there's just silence. And silence is the enemy of good conversation.

Build for the network dropping. Build for the API timing out. Build for the context overflowing. Build for the bad actor.

Your users will never know. They'll just think your AI is remarkably good at conversation.

---

## Start Here

1. **Copy the reconnection handler** - you will have network issues
2. **Implement webhook signatures** - you will have security issues
3. **Test the handoff flow** - your users will switch contexts
4. **Enable streaming** - perceived speed matters more than actual speed
5. **Write error boundaries** - graceful degradation is a feature

We learned all of this the hard way. You don't have to.

---

*Have a pattern that saved your production deployment? Share it on [Discord](https://discord.gg/ferni) - we're building a community cookbook.*
