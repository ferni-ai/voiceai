# Voice Infrastructure Obfuscation Guide

> Hide third-party service details from casual inspection

## Current Status (Implemented)

### Easy Obfuscation ✅
- Script renamed: `livekit-client.umd.js` → `voice-engine.js`
- Bundle chunk renamed: `vendor-livekit` → `vendor-rtc`
- Console logs removed from SDK initialization
- No "LiveKit" visible in Network tab filenames

### What's Still Visible
- WebSocket connections to `*.livekit.cloud` domains
- Internal SDK variable names (requires deobfuscation to find)

---

## Next Steps: DNS-Level Masking

Your setup: **Squarespace DNS + Google Cloud**

### Option 1: Google Cloud Load Balancer (Recommended)
**Latency impact: ~5-10ms | Complexity: Medium**

Creates a custom endpoint like `voice.ferni.ai` that proxies to LiveKit.

```
User → voice.ferni.ai → GCP Load Balancer → livekit.cloud
```

**Steps:**
1. Create a Google Cloud External HTTPS Load Balancer
2. Configure backend to proxy to your LiveKit cloud URL
3. Add SSL certificate for `voice.ferni.ai`
4. In Squarespace DNS, add A record pointing to Load Balancer IP

**Pros:** Native WebSocket support, low latency, scales automatically
**Cons:** ~$20-30/month for load balancer

### Option 2: Cloud Run WebSocket Proxy
**Latency impact: ~10-30ms | Complexity: Low**

Simple Node.js proxy that forwards WebSocket connections.

```typescript
// voice-proxy/index.ts
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

const LIVEKIT_URL = process.env.LIVEKIT_WS_URL; // wss://your-project.livekit.cloud

const server = createServer();
const wss = new WebSocketServer({ server });

wss.on('connection', (clientWs, req) => {
  // Forward the connection to LiveKit
  const livekitWs = new WebSocket(LIVEKIT_URL + req.url);

  clientWs.on('message', (data) => livekitWs.send(data));
  livekitWs.on('message', (data) => clientWs.send(data));

  clientWs.on('close', () => livekitWs.close());
  livekitWs.on('close', () => clientWs.close());
});

server.listen(process.env.PORT || 8080);
```

**Pros:** Simple, cheap (~$5/month), full control
**Cons:** Adds latency, single point of failure

### Option 3: Move DNS to Cloudflare (Free)
**Latency impact: ~0ms | Complexity: Low**

Cloudflare's free tier includes WebSocket proxying.

**Steps:**
1. Add domain to Cloudflare (free tier)
2. Update Squarespace nameservers to Cloudflare
3. Create Cloudflare Worker for WebSocket proxy
4. Point `voice.ferni.ai` to the worker

**Pros:** Free, global edge network, minimal latency
**Cons:** Requires changing nameservers from Squarespace

### Option 4: Contact LiveKit for Custom Domain
**Latency impact: 0ms | Complexity: None (if supported)**

Some providers offer CNAME-based custom domains on enterprise plans.

**Action:** Email LiveKit support asking about custom domain/white-labeling options.

---

## Implementation Priority

| Option | Cost | Latency | Effort | Recommendation |
|--------|------|---------|--------|----------------|
| Cloudflare | Free | ~0ms | Low | Best if OK changing nameservers |
| GCP Load Balancer | ~$25/mo | ~5ms | Medium | Best for staying on GCP |
| Cloud Run Proxy | ~$5/mo | ~20ms | Low | Quick solution |
| LiveKit Custom Domain | Varies | 0ms | None | Ask them first |

---

## Token Server Changes Required

Once you have a proxy, update your token server to return the proxied URL:

```typescript
// token-server.js - Update the LiveKit URL
const LIVEKIT_URL = process.env.VOICE_PROXY_URL || 'wss://your-project.livekit.cloud';

// When generating tokens, use the proxy URL
const wsUrl = LIVEKIT_URL; // Now points to voice.ferni.ai
```

---

## Verification Checklist

After implementing proxy:
- [ ] WebSocket connects to your custom domain, not livekit.cloud
- [ ] Voice calls work normally (test latency)
- [ ] SSL certificate is valid for custom domain
- [ ] Failover: Consider what happens if proxy fails

---

## Security Notes

- This is obfuscation, not security. Determined attackers can still find the backend.
- The goal is preventing casual discovery by competitors or curious users.
- Keep your LiveKit API keys secure regardless of obfuscation.
