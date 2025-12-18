# Production Deployment Guide

Complete guide for deploying Ferni AI to production on Google Cloud Platform.

## Prerequisites

- Google Cloud account with billing enabled
- gcloud CLI installed and authenticated
- Node.js 20+ and npm installed
- Domain name (optional but recommended)

## Quick Deploy

```bash
# 1. Set up GCP project
export PROJECT_ID="ferni-ai-prod"
gcloud config set project $PROJECT_ID

# 2. Enable required APIs
gcloud services enable run.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com

# 3. Set up Firestore
./scripts/setup-production-persistence.sh

# 4. Deploy backend
gcloud run deploy ferni-backend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production"

# 5. Deploy frontend to Firebase Hosting
cd apps/web
firebase deploy --only hosting
```

## Detailed Setup

### 1. GCP Project Configuration

```bash
# Create new project (if needed)
gcloud projects create $PROJECT_ID --name="Ferni AI Production"

# Set as default
gcloud config set project $PROJECT_ID

# Link billing account
gcloud billing projects link $PROJECT_ID --billing-account=BILLING_ACCOUNT_ID
```

### 2. Firestore Database

```bash
# Create Firestore database
gcloud firestore databases create --location=us-central1

# Create required indexes
gcloud firestore indexes composite create \
  --collection-group=userProfiles \
  --field-config field-path=userId,order=ASCENDING \
  --field-config field-path=updatedAt,order=DESCENDING
```

### 3. Secret Management

Store sensitive configuration in Secret Manager:

```bash
# Create secrets
echo -n "your-gemini-api-key" | gcloud secrets create GEMINI_API_KEY --data-file=-
echo -n "your-livekit-api-key" | gcloud secrets create LIVEKIT_API_KEY --data-file=-
echo -n "your-livekit-api-secret" | gcloud secrets create LIVEKIT_API_SECRET --data-file=-
echo -n "your-cartesia-api-key" | gcloud secrets create CARTESIA_API_KEY --data-file=-
echo -n "your-sentry-dsn" | gcloud secrets create SENTRY_DSN --data-file=-

# Grant Cloud Run access to secrets
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Repeat for other secrets...
```

### 4. Cloud Run Deployment

Create cloud-run.yaml for detailed configuration:

```yaml
# cloud-run.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: ferni-backend
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "10"
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      containers:
        - image: gcr.io/PROJECT_ID/ferni-backend
          ports:
            - containerPort: 8080
          resources:
            limits:
              memory: 2Gi
              cpu: "2"
          env:
            - name: NODE_ENV
              value: production
            - name: MEMORY_STORE_TYPE
              value: firestore
            - name: GCP_PROJECT_ID
              value: PROJECT_ID
            - name: GEMINI_API_KEY
              valueFrom:
                secretKeyRef:
                  name: GEMINI_API_KEY
                  key: latest
```

Deploy with:

```bash
gcloud run services replace cloud-run.yaml --region=us-central1
```

### 5. Custom Domain (Optional)

```bash
# Map custom domain
gcloud run domain-mappings create \
  --service ferni-backend \
  --domain api.ferni.ai \
  --region us-central1

# Get DNS records to configure
gcloud run domain-mappings describe \
  --domain api.ferni.ai \
  --region us-central1
```

### 6. Frontend Deployment

Firebase Hosting setup:

```bash
cd apps/web

# Initialize Firebase
firebase init hosting

# Build frontend
npm run build

# Deploy
firebase deploy --only hosting
```

Firebase hosting configuration (firebase.json):

```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "ferni-backend",
          "region": "us-central1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=31536000"
          }
        ]
      }
    ]
  }
}
```

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| NODE_ENV | Set to production |
| GEMINI_API_KEY | Google AI API key |
| LIVEKIT_API_KEY | LiveKit API key |
| LIVEKIT_API_SECRET | LiveKit secret |
| LIVEKIT_URL | LiveKit server URL |
| CARTESIA_API_KEY | Cartesia TTS key |
| MEMORY_STORE_TYPE | Set to firestore |
| GCP_PROJECT_ID | Your GCP project ID |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| SENTRY_DSN | - | Sentry error tracking |
| LOG_LEVEL | info | Logging verbosity |
| MAX_SESSIONS | 100 | Max concurrent sessions |

## Monitoring Setup

### Cloud Monitoring Dashboard

Create a dashboard with these metrics:

1. Request latency (p50, p95, p99)
2. Error rate
3. Active instances
4. Memory usage
5. CPU utilization

```bash
# Create uptime check
gcloud monitoring uptime create ferni-health \
  --display-name="Ferni Health Check" \
  --resource-type=uptime-url \
  --hostname=api.ferni.ai \
  --path=/health
```

### Alerting Policies

```bash
# High error rate alert
gcloud alpha monitoring policies create \
  --display-name="High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count"' \
  --aggregation-alignment-period=60s \
  --notification-channels=CHANNEL_ID
```

## Scaling Configuration

### Auto-scaling

Cloud Run auto-scales based on:
- CPU utilization (default: 60%)
- Request concurrency (configured: 80)
- Memory pressure

### Manual scaling for high traffic

```bash
# Increase min instances before expected traffic
gcloud run services update ferni-backend \
  --min-instances=5 \
  --max-instances=50 \
  --region=us-central1
```

## Rollback Procedure

```bash
# List revisions
gcloud run revisions list --service=ferni-backend --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic ferni-backend \
  --to-revisions=ferni-backend-00005-abc=100 \
  --region=us-central1
```

## Cost Optimization

1. Set appropriate min instances (1-2 for low traffic)
2. Use CPU throttling for non-latency-sensitive workloads
3. Configure request timeout appropriately
4. Use Cloud CDN for static assets

### Estimated Costs

| Component | Estimated Monthly Cost |
|-----------|----------------------|
| Cloud Run (2 instances avg) | $50-100 |
| Firestore (1M reads/writes) | $20-40 |
| Cloud Storage | $5-10 |
| Firebase Hosting | $0 (free tier) |
| **Total** | **$75-150** |

## Security Checklist

Before going live:

- [ ] Enable Cloud Armor for DDoS protection
- [ ] Configure VPC connector for internal services
- [ ] Set up Cloud IAP for admin endpoints
- [ ] Enable audit logging
- [ ] Configure CORS appropriately
- [ ] Review IAM permissions (least privilege)
- [ ] Enable SSL/TLS everywhere
- [ ] Set up backup schedule for Firestore

## Health Checks

The application exposes these health endpoints:

- GET /health - Basic health check
- GET /health/ready - Readiness probe
- GET /health/live - Liveness probe
- GET /api/metrics - Prometheus metrics

## Troubleshooting

### Common Issues

1. **502 Bad Gateway**: Check Cloud Run logs, increase timeout
2. **Cold start latency**: Increase min instances
3. **Memory errors**: Increase memory limit
4. **Firestore timeout**: Check indexes, use batch operations

### Useful Commands

```bash
# View logs
gcloud run services logs read ferni-backend --region=us-central1

# Check service status
gcloud run services describe ferni-backend --region=us-central1

# Test health endpoint
curl https://api.ferni.ai/health
```

