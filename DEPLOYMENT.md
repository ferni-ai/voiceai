# Deploying Bogle Voice Agent to Google Cloud Run

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **gcloud CLI** installed and authenticated
3. **API Keys**:
   - `GOOGLE_API_KEY` - Google AI Studio API key
   - `CARTESIA_API_KEY` - Cartesia TTS API key
   - `LIVEKIT_URL` - Your LiveKit Cloud URL (e.g., `wss://your-project.livekit.cloud`)
   - `LIVEKIT_API_KEY` - LiveKit API key
   - `LIVEKIT_API_SECRET` - LiveKit API secret

## Quick Deploy

```bash
# Set your project ID
export GCP_PROJECT_ID="your-project-id"

# Run the deploy script
./deploy.sh
```

## Manual Deployment Steps

### 1. Set Up Google Cloud Project

```bash
# Set your project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

### 2. Create Secrets in Secret Manager

```bash
# Create each secret (you'll be prompted to enter the value)
echo -n "YOUR_GOOGLE_API_KEY" | gcloud secrets create google-api-key --data-file=-
echo -n "YOUR_CARTESIA_API_KEY" | gcloud secrets create cartesia-api-key --data-file=-
echo -n "wss://your-project.livekit.cloud" | gcloud secrets create livekit-url --data-file=-
echo -n "YOUR_LIVEKIT_API_KEY" | gcloud secrets create livekit-api-key --data-file=-
echo -n "YOUR_LIVEKIT_API_SECRET" | gcloud secrets create livekit-api-secret --data-file=-
```

### 3. Grant Cloud Run Access to Secrets

```bash
PROJECT_ID=$(gcloud config get-value project)
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

# Grant access for each secret
for SECRET in google-api-key cartesia-api-key livekit-url livekit-api-key livekit-api-secret; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
done
```

### 4. Build and Deploy

```bash
# Build the image using Cloud Build
gcloud builds submit --tag gcr.io/$PROJECT_ID/bogle-voice-agent:latest .

# Deploy to Cloud Run
gcloud run deploy bogle-voice-agent \
  --image gcr.io/$PROJECT_ID/bogle-voice-agent:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 3600 \
  --concurrency 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "GOOGLE_API_KEY=google-api-key:latest,CARTESIA_API_KEY=cartesia-api-key:latest,LIVEKIT_URL=livekit-url:latest,LIVEKIT_API_KEY=livekit-api-key:latest,LIVEKIT_API_SECRET=livekit-api-secret:latest"
```

### 5. Get Your Service URL

```bash
gcloud run services describe bogle-voice-agent --region us-central1 --format 'value(status.url)'
```

## Configure LiveKit to Use Your Agent

In your LiveKit Cloud dashboard:

1. Go to **Settings** → **Agents**
2. Add a new agent with your Cloud Run URL
3. The agent will automatically connect when participants join rooms

## Local Docker Testing

```bash
# Build locally
npm run docker:build

# Run locally (requires .env file)
npm run docker:run
```

## Updating the Deployment

After making changes:

```bash
# Rebuild and redeploy
gcloud builds submit --tag gcr.io/$PROJECT_ID/bogle-voice-agent:latest .
gcloud run deploy bogle-voice-agent --image gcr.io/$PROJECT_ID/bogle-voice-agent:latest --region us-central1
```

## Monitoring

View logs in Google Cloud Console:
- Go to **Cloud Run** → **bogle-voice-agent** → **Logs**

Or via CLI:
```bash
gcloud run services logs read bogle-voice-agent --region us-central1 --limit 100
```

## Cost Optimization

- The agent scales to 0 when not in use (no cost when idle)
- Each instance handles 1 concurrent connection
- Typical cost: ~$0.00002400 per second when running

## Troubleshooting

**Agent not connecting:**
- Check that all secrets are created and accessible
- Verify LiveKit URL is correct (should start with `wss://`)
- Check Cloud Run logs for errors

**Audio issues:**
- Ensure Cartesia API key is valid
- Check that the voice ID exists in your Cartesia account

**Timeout errors:**
- The timeout is set to 3600s (1 hour) for long conversations
- Increase if needed for longer sessions

