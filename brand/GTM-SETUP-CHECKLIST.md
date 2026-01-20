# GTM Setup Checklist

Quick reference for completing your GTM setup.

## ✅ Completed

- [x] Firestore persistence (content survives restarts)
- [x] Content calendar with 7 days of content generated
- [x] Unit tests (47 passing)
- [x] GTM documentation (`src/services/gtm/README.md`)
- [x] LinkedIn OAuth script with `--org` flag
- [x] Twitter OAuth helper script
- [x] CLI commands working with Firestore

## 🔄 Pending (Manual Steps Required)

### 1. LinkedIn Organization Posting (1-3 business days)

**Current state:** Your token has `w_member_social` (personal) scope.
**Needed:** `w_organization_social` (organization) scope.

```bash
# Step 1: Request Community Management API
# Go to: https://www.linkedin.com/developers/apps
# Select your app → Products → Request "Community Management API"
# Wait for approval (1-3 business days)

# Step 2: After approval, generate new token
cd apps/website/ferni-website/scripts
node linkedin-oauth.js --auth-url --org

# Step 3: Follow OAuth flow and update .env
# LINKEDIN_ACCESS_TOKEN="new_token_here"
```

### 2. Twitter Access Token

**Current state:** Has client credentials but no access token.
**Needed:** Access token from Ferni's Twitter account.

```bash
# Step 1: Log into Ferni's Twitter account in your browser

# Step 2: Run OAuth flow
cd apps/website/ferni-website/scripts
node twitter-oauth.js --auth-url

# Step 3: Open URL, authorize, copy code

# Step 4: Exchange code (use verifier from step 2)
node twitter-oauth.js --exchange --code=YOUR_CODE --verifier=YOUR_VERIFIER

# Step 5: Add to .env
# TWITTER_ACCESS_TOKEN="..."
# TWITTER_REFRESH_TOKEN="..."
# TWITTER_ACCOUNT_NAME="ferni"
```

### 3. Discord Webhook

**Current state:** Not configured.
**Needed:** Webhook URL from Ferni Community server.

```bash
# Step 1: Open Discord, go to Ferni Community server

# Step 2: Right-click announcements channel → Edit Channel
#         → Integrations → Webhooks → New Webhook

# Step 3: Name it "Ferni Announcements", copy URL

# Step 4: Add to .env
# DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/XXX/YYY"
```

## 📊 Current Content Status

```bash
# Check status
ferni brand gtm status

# View calendar
ferni brand gtm calendar

# Preview specific content
ferni brand gtm preview <content-id>
```

## 🚀 After Setup Complete

```bash
# Verify all platforms
ferni brand gtm verify

# Approve content for publishing
ferni brand gtm approve <content-id>

# Publish manually
ferni brand gtm publish

# Or enable auto-publish in .env
# GTM_AUTO_PUBLISH=true
```

## 📅 Automated Publishing (Cloud Scheduler)

Once setup is complete, the system will automatically:
- Generate daily content at 6 AM PST
- Publish approved content at 9 AM, 2 PM, and 6 PM PST
- Send Slack notifications on publish

---

*Last updated: January 2026*
