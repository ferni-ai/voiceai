# Google Cloud Deployment Guide

## Architecture Options

| Option | Cost | Complexity | Best For |
|--------|------|------------|----------|
| **Cloud Run + Firestore** | 💰 Low | ⭐ Simple | Most users |
| **Cloud Run + Cloud SQL** | 💰💰 Medium | ⭐⭐ Medium | High-volume |
| **GKE + Cloud SQL** | 💰💰💰 Higher | ⭐⭐⭐ Complex | Enterprise |

## Recommended: Cloud Run + Firestore + Memorystore

This is the **most managed, lowest-maintenance** option.

### Why This Stack?

| Service | Role | Managed? | Auto-scales? |
|---------|------|----------|--------------|
| **Cloud Run** | Agent hosting | ✅ Fully | ✅ 0 to N |
| **Firestore** | User profiles, history | ✅ Fully | ✅ Automatic |
| **Memorystore (Redis)** | Session cache | ✅ Fully | Manual |

### Cost Estimate (per month)

```
Cloud Run:     ~$5-20  (scales to zero when idle)
Firestore:    ~$0-5   (free tier covers most usage)
Memorystore:  ~$35    (smallest instance)
────────────────────────────────────────────────
Total:        ~$40-60/month for typical usage
```

---

## Step-by-Step Deployment

### 1. Set Up Google Cloud Project

```bash
# Set your project
export PROJECT_ID="your-project-id"
gcloud config set project $PROJECT_ID

# Enable required APIs
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  firestore.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  vpcaccess.googleapis.com
```

### 2. Create Firestore Database

```bash
# Create Firestore in Native mode
gcloud firestore databases create \
  --location=us-central1 \
  --type=firestore-native
```

### 3. Create Memorystore (Redis) Instance

```bash
# Create a VPC connector for Cloud Run → Redis
gcloud compute networks vpc-access connectors create voiceai-connector \
  --region=us-central1 \
  --network=default \
  --range=10.8.0.0/28

# Create Redis instance (Basic tier, 1GB)
gcloud redis instances create voiceai-redis \
  --size=1 \
  --region=us-central1 \
  --redis-version=redis_7_0 \
  --network=default

# Get Redis IP
REDIS_HOST=$(gcloud redis instances describe voiceai-redis --region=us-central1 --format='value(host)')
echo "Redis IP: $REDIS_HOST"
```

### 4. Create Secrets

```bash
# Core API keys
echo -n "YOUR_GOOGLE_API_KEY" | gcloud secrets create google-api-key --data-file=-
echo -n "YOUR_CARTESIA_API_KEY" | gcloud secrets create cartesia-api-key --data-file=-
echo -n "wss://your-project.livekit.cloud" | gcloud secrets create livekit-url --data-file=-
echo -n "YOUR_LIVEKIT_API_KEY" | gcloud secrets create livekit-api-key --data-file=-
echo -n "YOUR_LIVEKIT_API_SECRET" | gcloud secrets create livekit-api-secret --data-file=-

# Redis URL (use the IP from step 3)
echo -n "redis://$REDIS_HOST:6379" | gcloud secrets create redis-url --data-file=-

# Grant Cloud Run access to secrets
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
for SECRET in google-api-key cartesia-api-key livekit-url livekit-api-key livekit-api-secret redis-url; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 5. Deploy to Cloud Run

```bash
# Build and push
gcloud builds submit --tag gcr.io/$PROJECT_ID/voiceai-agent:latest .

# Deploy with Firestore + Redis
gcloud run deploy voiceai-agent \
  --image gcr.io/$PROJECT_ID/voiceai-agent:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --concurrency 1 \
  --min-instances 0 \
  --max-instances 20 \
  --vpc-connector voiceai-connector \
  --set-env-vars "NODE_ENV=production,PERSONA_ID=jack-bogle,GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-secrets "GOOGLE_API_KEY=google-api-key:latest,CARTESIA_API_KEY=cartesia-api-key:latest,LIVEKIT_URL=livekit-url:latest,LIVEKIT_API_KEY=livekit-api-key:latest,LIVEKIT_API_SECRET=livekit-api-secret:latest,REDIS_URL=redis-url:latest"
```

### 6. Get Your Service URL

```bash
gcloud run services describe voiceai-agent --region us-central1 --format 'value(status.url)'
```

---

## Alternative: Cloud SQL (PostgreSQL)

If you need SQL queries or have existing PostgreSQL tooling:

```bash
# Create Cloud SQL instance (this takes ~5 minutes)
gcloud sql instances create voiceai-postgres \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --root-password=your-secure-password

# Create database
gcloud sql databases create voiceai --instance=voiceai-postgres

# Create user
gcloud sql users create voiceai \
  --instance=voiceai-postgres \
  --password=your-user-password

# Get connection name
CONNECTION_NAME=$(gcloud sql instances describe voiceai-postgres --format='value(connectionName)')
echo "Connection: $CONNECTION_NAME"

# Create secret for DATABASE_URL
echo -n "postgresql://voiceai:your-user-password@/$CONNECTION_NAME/voiceai?host=/cloudsql/$CONNECTION_NAME" | \
  gcloud secrets create database-url --data-file=-
```

Then deploy with `--add-cloudsql-instances` flag:

```bash
gcloud run deploy voiceai-agent \
  # ... other flags ...
  --add-cloudsql-instances $CONNECTION_NAME \
  --set-secrets "DATABASE_URL=database-url:latest,..."
```

---

## Comparison: Firestore vs Cloud SQL

| Feature | Firestore | Cloud SQL (PostgreSQL) |
|---------|-----------|------------------------|
| **Setup** | 1 command | ~5 minutes |
| **Cost** | Pay per operation | Pay for instance |
| **Scaling** | Automatic | Manual (or auto) |
| **Backups** | Automatic | Configure |
| **Complex queries** | Limited | Full SQL |
| **Best for** | Simple profiles | Analytics, reporting |

**Recommendation**: Start with **Firestore** - it's simpler and cheaper for typical voice AI usage. Migrate to Cloud SQL only if you need complex queries or reporting.

---

## Monitoring & Alerts

```bash
# View logs
gcloud run services logs read voiceai-agent --region us-central1 --limit 100

# Set up alerting for errors
gcloud alpha monitoring policies create \
  --display-name="VoiceAI Errors" \
  --condition-display-name="Error rate > 1%" \
  --condition-filter='resource.type="cloud_run_revision" AND severity>=ERROR'
```

---

## Cost Optimization Tips

1. **Cloud Run scales to zero** - No cost when idle
2. **Firestore free tier** - 50K reads, 20K writes/day free
3. **Memorystore** - Consider skipping for low-traffic apps (use in-memory)
4. **Preemptible/Spot VMs** - For batch processing (not real-time)

---

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLOUD_PROJECT` | Yes* | Enables Firestore auto-detect |
| `DATABASE_URL` | No | PostgreSQL connection string |
| `REDIS_URL` | No | Redis connection string |
| `MEMORY_STORE_TYPE` | No | Force: `memory`, `firestore`, `postgres` |
| `PERSONA_ID` | No | Default persona (default: `jack-bogle`) |

*Set automatically on Cloud Run

