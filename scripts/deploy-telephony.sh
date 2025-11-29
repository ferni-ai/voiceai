#!/bin/bash
set -e

PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="bogle-voice-agent"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "📞 Deploying John Bogle Voice Agent for Telephony"
echo "Project: $PROJECT_ID | Region: $REGION"
echo ""

# Use the existing deploy.sh script
./deploy.sh

echo ""
echo "✅ Agent deployed! Next steps:"
echo "1. Get your service URL:"
echo "   gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'"
echo ""
echo "2. Configure LiveKit Cloud:"
echo "   - Go to https://cloud.livekit.io → Settings → Agents"
echo "   - Add agent with your Cloud Run URL"
echo ""
echo "3. Get a phone number:"
echo "   - Option A: LiveKit Cloud → Telephony → Purchase Phone Number"
echo "   - Option B: Use Twilio (see TELEPHONY.md for details)"
echo ""
echo "📖 Full instructions: See TELEPHONY.md"
