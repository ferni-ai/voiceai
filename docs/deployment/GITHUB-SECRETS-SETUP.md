# GitHub Secrets Setup for CI/CD

This guide explains how to set up the required secrets for the Ferni AI CI/CD pipeline.

## Required Secrets

### For Deployment to GCP Cloud Run

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `GCP_PROJECT_ID` | Your Google Cloud project ID | GCP Console → Project Settings |
| `GCP_SA_KEY` | Service account JSON key | See instructions below |
| `GCP_REGION` | Deployment region (optional) | Default: `us-central1` |

### For Firebase Hosting (Frontend)

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `FIREBASE_SERVICE_ACCOUNT` | Firebase service account JSON | Firebase Console → Project Settings → Service Accounts |

### For Code Coverage (Optional)

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `CODECOV_TOKEN` | Codecov upload token | codecov.io after connecting repo |

## Step-by-Step Setup

### 1. Create GCP Service Account

```bash
# Set your project ID
export PROJECT_ID="your-project-id"

# Create service account
gcloud iam service-accounts create ferni-deploy \
  --display-name="Ferni CI/CD Deploy" \
  --project=$PROJECT_ID

# Grant required roles
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ferni-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ferni-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ferni-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:ferni-deploy@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Generate key file
gcloud iam service-accounts keys create gcp-deploy-key.json \
  --iam-account=ferni-deploy@$PROJECT_ID.iam.gserviceaccount.com

# The contents of gcp-deploy-key.json is your GCP_SA_KEY secret
cat gcp-deploy-key.json
```

### 2. Add Secrets to GitHub

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret:

#### GCP_PROJECT_ID
- Name: `GCP_PROJECT_ID`
- Value: Your project ID (e.g., `ferni-ai-prod`)

#### GCP_SA_KEY
- Name: `GCP_SA_KEY`
- Value: The entire contents of `gcp-deploy-key.json` (including braces)

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "ferni-deploy@your-project-id.iam.gserviceaccount.com",
  ...
}
```

### 3. Set Up Firebase (Optional - for frontend hosting)

```bash
# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init hosting

# Get service account
# Go to Firebase Console → Project Settings → Service Accounts
# Click "Generate new private key"
# Copy the JSON contents to FIREBASE_SERVICE_ACCOUNT secret
```

### 4. Enable Required GCP APIs

```bash
# Enable Cloud Run
gcloud services enable run.googleapis.com --project=$PROJECT_ID

# Enable Artifact Registry
gcloud services enable artifactregistry.googleapis.com --project=$PROJECT_ID

# Enable Cloud Build
gcloud services enable cloudbuild.googleapis.com --project=$PROJECT_ID

# Create Artifact Registry repository
gcloud artifacts repositories create ferni-agents \
  --repository-format=docker \
  --location=us-central1 \
  --project=$PROJECT_ID
```

## Verify Setup

After adding secrets, verify the CI/CD pipeline:

1. Push a commit to `main`
2. Go to **Actions** tab in GitHub
3. Check that the workflow runs successfully

## Troubleshooting

### "Permission denied" errors
- Ensure the service account has all required roles
- Check that APIs are enabled

### "Project not found" errors
- Verify `GCP_PROJECT_ID` is correct
- Ensure the service account belongs to that project

### "Registry not found" errors
- Create the Artifact Registry repository first
- Verify the region matches

## Security Best Practices

1. **Rotate keys regularly** - Generate new keys every 90 days
2. **Use least privilege** - Only grant required permissions
3. **Audit access** - Review who has access to secrets
4. **Never commit secrets** - Keep them in GitHub Secrets only
5. **Use environments** - Set up staging/production environments

## Environment-Specific Secrets

For multi-environment deployments, create GitHub Environments:

1. Go to **Settings** → **Environments**
2. Create `staging` and `production` environments
3. Add environment-specific secrets
4. Update workflow to use environments:

```yaml
jobs:
  deploy:
    environment: production
    steps:
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}
```

## Quick Commands Reference

```bash
# List service accounts
gcloud iam service-accounts list --project=$PROJECT_ID

# Check roles
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:ferni-deploy@"

# Delete old keys (keep only newest)
gcloud iam service-accounts keys list \
  --iam-account=ferni-deploy@$PROJECT_ID.iam.gserviceaccount.com

# Revoke a specific key
gcloud iam service-accounts keys delete KEY_ID \
  --iam-account=ferni-deploy@$PROJECT_ID.iam.gserviceaccount.com
```

