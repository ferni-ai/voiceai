# Infrastructure Configuration

DDoS protection and Cloud Run scaling configurations.

## Files

- `cloud-armor-policy.yaml` - GCP Cloud Armor WAF rules for DDoS protection
- `cloudrun-service-ui.yaml` - Cloud Run scaling config for UI server
- `cloudrun-service-agent.yaml` - Cloud Run scaling config for voice agent

## Deploy Cloud Armor (requires External Load Balancer)

Cloud Armor requires setting up a Serverless NEG and External HTTP(S) Load Balancer.
This is more complex but provides cloud-level DDoS protection.

```bash
# 1. Create the security policy
gcloud compute security-policies create ferni-ddos-policy \
  --file-name=infra/cloud-armor-policy.yaml

# 2. Create a Serverless NEG for Cloud Run
gcloud compute network-endpoint-groups create ferni-neg \
  --region=us-central1 \
  --network-endpoint-type=serverless \
  --cloud-run-service=ferni-ui

# 3. Create a backend service and attach Cloud Armor
gcloud compute backend-services create ferni-backend \
  --global \
  --load-balancing-scheme=EXTERNAL_MANAGED

gcloud compute backend-services add-backend ferni-backend \
  --global \
  --network-endpoint-group=ferni-neg \
  --network-endpoint-group-region=us-central1

gcloud compute backend-services update ferni-backend \
  --global \
  --security-policy=ferni-ddos-policy

# 4. Create URL map and HTTPS proxy (requires SSL cert)
# See: https://cloud.google.com/load-balancing/docs/https/setting-up-https-serverless
```

## Deploy Cloud Run with Scaling Limits

```bash
# UI Server
gcloud run services replace infra/cloudrun-service-ui.yaml \
  --region=us-central1

# Voice Agent
gcloud run services replace infra/cloudrun-service-agent.yaml \
  --region=us-central1
```

## Quick Alternative (No Load Balancer)

If you don't want to set up a load balancer, the application-level protections
in `src/utils/ddos-protection.ts` provide:

- Request size limits (1MB body, 512KB JSON)
- Socket timeouts (30s)
- Health endpoint rate limiting
- Request ID tracing
- DDoS pattern detection
- Rate limit monitoring

Import and use in server files:

```javascript
import {
  hardenServer,
  parseJsonBodySafe,
  handleHealthEndpoint,
  addRequestId,
} from './dist/utils/ddos-protection.js';

// After creating server
hardenServer(server);

// In request handler
const requestId = addRequestId(req, res);

// Handle health endpoints with rate limiting
if (handleHealthEndpoint(req, res, pathname, 'ferni-ui')) return;

// Safe body parsing
const body = await parseJsonBodySafe(req, res);
if (!body) return; // Already sent error response
```

## Monitoring

Access security monitoring (admin only):
```bash
curl -H "X-Admin-Key: your-key" https://your-server/api/security/status
```

Response includes:
- DDoS pattern detection (confidence: low/medium/high)
- Rate limit statistics (last minute)
- Top rate-limited IPs and endpoints
