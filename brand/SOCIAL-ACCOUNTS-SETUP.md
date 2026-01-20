# Ferni Brand Social Accounts Setup

> **Goal:** Set up brand accounts (not personal) for automated social posting.

---

## Quick Status Check

```bash
# Check what's currently configured
pnpm ferni brand social status
```

---

## 1. Twitter/X Brand Account

### Step 1: Create Brand Account
1. Go to [twitter.com/signup](https://twitter.com/signup)
2. Create account with brand email (e.g., `social@ferni.ai`)
3. Choose handle (e.g., `@ferniai`, `@askferni`, `@ferniapp`)
4. Complete profile setup (bio, avatar, banner)

### Step 2: Apply for Developer Access
1. Go to [developer.twitter.com](https://developer.twitter.com)
2. Sign in with the brand Twitter account
3. Apply for **Basic** or **Pro** access
4. Wait for approval (usually 1-2 days)

### Step 3: Create App & Get Credentials
1. Go to [developer.twitter.com/en/portal/projects-and-apps](https://developer.twitter.com/en/portal/projects-and-apps)
2. Create a new Project + App
3. Enable **OAuth 2.0** with these scopes:
   - `tweet.read`
   - `tweet.write`
   - `users.read`
   - `offline.access` (for refresh tokens)
4. Set Callback URL: `https://your-domain.com/auth/twitter/callback`
5. Copy credentials to `.env`:

```bash
# Twitter Brand Account
TWITTER_CLIENT_ID=your_client_id
TWITTER_CLIENT_SECRET=your_client_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_REFRESH_TOKEN=your_refresh_token
TWITTER_ACCOUNT_NAME=ferniai
```

### Step 4: Generate Access Token
Run the OAuth flow to get access/refresh tokens:
```bash
pnpm ferni auth twitter
```

---

## 2. LinkedIn Company Page (CRITICAL FOR BRAND POSTING)

**⚠️ IMPORTANT**: LinkedIn has TWO different OAuth scopes:

| Scope | What it does | Posts as |
|-------|--------------|----------|
| `w_member_social` | Personal profile posting | **YOU** |
| `w_organization_social` | Company page posting | **Ferni** |

If your current token was created by logging in as yourself without the `--org` flag,
posts will go to YOUR profile, not the Ferni company page!

### Step 1: Create Company Page (if needed)
1. Go to [linkedin.com/company/setup/new](https://www.linkedin.com/company/setup/new/)
2. Choose "Company" type
3. Fill in:
   - **Name:** Ferni
   - **Website:** https://ferni.ai
   - **Industry:** Technology, Information and Internet
   - **Company size:** 1-10
4. Complete profile (logo, banner, about)
5. **Make sure you are an ADMIN of the company page**

### Step 2: Get API Access with Organization Scope
1. Go to [linkedin.com/developers/apps](https://www.linkedin.com/developers/apps)
2. Create a new app (or select existing)
3. Go to **Products** tab
4. **Request "Community Management API"** ← THIS IS CRITICAL
   - This unlocks `w_organization_social` scope
   - Takes 1-3 business days for LinkedIn to approve
5. Also request "Share on LinkedIn" and "Sign In with LinkedIn"
6. Add your Company Page as the associated page

### Step 3: Get Organization URN
1. Go to your Company Page on LinkedIn
2. Click **Admin tools** → **Advertising**
3. The URL will show: `linkedin.com/campaignmanager/accounts/XXXXXXX`
4. Your Organization URN is: `urn:li:organization:XXXXXXX`

**Ferni's Organization URN:** `urn:li:organization:110229625`

### Step 4: Generate Access Token (with Organization Scope!)
```bash
# Navigate to the OAuth helper
cd apps/website/ferni-website/scripts

# Generate OAuth URL for ORGANIZATION posting (not personal!)
node linkedin-oauth.js --auth-url --org

# Open the URL in your browser, authorize, then exchange the code:
node linkedin-oauth.js --exchange --code=YOUR_CODE_FROM_REDIRECT
```

**Common Mistake:** Running without `--org` gives you personal posting scope!

### Step 5: Add to `.env`
```bash
# LinkedIn Company Page - ORGANIZATION posting
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
LINKEDIN_ACCESS_TOKEN=your_access_token  # Must have w_organization_social scope!
LINKEDIN_REFRESH_TOKEN=your_refresh_token
LINKEDIN_ORGANIZATION_URN=urn:li:organization:110229625
LINKEDIN_ACCOUNT_NAME=ferni
SOCIAL_ACCOUNT_TYPE=brand  # ← REQUIRED for organization posting
```

### Step 6: Verify Configuration
```bash
ferni brand gtm verify

# Expected output:
# ✅ SOCIAL_ACCOUNT_TYPE: brand
# ✅ LinkedIn Organization: urn:li:organization:110229625
```

### Troubleshooting: Posts Going to Personal Profile

If posts appear on YOUR LinkedIn instead of Ferni's company page:

1. **Check your token's scope**: Your token probably has `w_member_social` (personal) instead of `w_organization_social` (org)

2. **Fix it**:
   ```bash
   # 1. Make sure "Community Management API" is approved for your app
   # 2. Re-generate token with --org flag:
   cd apps/website/ferni-website/scripts
   node linkedin-oauth.js --auth-url --org
   # 3. Follow the OAuth flow and update .env
   ```

3. **Verify SOCIAL_ACCOUNT_TYPE=brand** is set in `.env`

---

## 3. Discord Community Server

### Step 1: Create Server (if needed)
1. Open Discord
2. Click **+** → **Create My Own** → **For a club or community**
3. Name: "Ferni Community"
4. Set up channels (#general, #stories, #announcements)

### Step 2: Create Bot
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → Name: "Ferni Bot"
3. Go to **Bot** tab → **Add Bot**
4. Enable these intents:
   - **Message Content Intent**
   - **Server Members Intent**
5. Copy the **Bot Token**

### Step 3: Invite Bot to Server
1. Go to **OAuth2** → **URL Generator**
2. Select scopes: `bot`, `applications.commands`
3. Select permissions:
   - Send Messages
   - Embed Links
   - Attach Files
   - Read Message History
   - Add Reactions
4. Copy the generated URL and open it
5. Select your server and authorize

### Step 4: Get Channel/Server IDs
1. Enable Developer Mode: User Settings → App Settings → Advanced → Developer Mode
2. Right-click your server → **Copy Server ID**
3. Right-click the channel for announcements → **Copy Channel ID**

### Step 5: Add to `.env`
```bash
# Discord Bot
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_SERVER_ID=your_server_id
DISCORD_CHANNEL_ID=your_announcements_channel_id
```

### Alternative: Webhook (Simpler, No Bot)
1. Go to your Discord channel
2. Settings → Integrations → Webhooks → New Webhook
3. Name: "Ferni Announcements"
4. Copy Webhook URL

```bash
# Discord Webhook (alternative to bot)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/XXXXX/YYYYY
```

---

## 4. Instagram Business Account (Optional)

### Step 1: Create Business Account
1. Create Instagram account with brand email
2. Convert to **Professional Account** (Business)
3. Connect to a **Facebook Page**

### Step 2: Get API Access
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create new app → **Business** type
3. Add **Instagram Graph API** product
4. Connect your Instagram Business Account
5. Generate access token with:
   - `instagram_basic`
   - `instagram_content_publish`

### Step 3: Add to `.env`
```bash
# Instagram (via Facebook/Meta)
INSTAGRAM_ACCESS_TOKEN=your_access_token
INSTAGRAM_BUSINESS_ID=your_business_account_id
FACEBOOK_PAGE_ID=your_connected_page_id
```

---

## 5. Medium Publication (Optional)

### Step 1: Create Publication
1. Go to [medium.com](https://medium.com)
2. Create account with brand email
3. Click your avatar → **Manage publications** → **New publication**
4. Name: "Ferni" or "Ferni Blog"

### Step 2: Get Integration Token
1. Go to [medium.com/me/settings](https://medium.com/me/settings)
2. Scroll to **Integration tokens**
3. Generate a new token

### Step 3: Get Publication ID
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.medium.com/v1/me
# Find your publication ID in the response
```

### Step 4: Add to `.env`
```bash
# Medium
MEDIUM_ACCESS_TOKEN=your_integration_token
MEDIUM_PUBLICATION_ID=your_publication_id
```

---

## 6. Notion Integration (Optional)

### Step 1: Create Integration
1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **+ New integration**
3. Name: "Ferni Automation"
4. Select workspace
5. Copy the **Internal Integration Token**

### Step 2: Share Database with Integration
1. Open your Notion database
2. Click **Share** → **Invite**
3. Select your integration

### Step 3: Get Database ID
1. Open your database in Notion
2. Copy the URL: `notion.so/WORKSPACE/DATABASE_ID?v=...`
3. The DATABASE_ID is the 32-character string

### Step 4: Add to `.env`
```bash
# Notion
NOTION_API_KEY=secret_XXXXX
NOTION_DATABASE_ID=your_database_id
```

---

## Environment Variable Summary

```bash
# ============================================================================
# SOCIAL MEDIA BRAND ACCOUNTS
# ============================================================================

# Account type: 'brand' uses company pages, 'personal' uses personal profiles
SOCIAL_ACCOUNT_TYPE=brand

# Twitter/X Brand Account
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_REFRESH_TOKEN=
TWITTER_ACCOUNT_NAME=ferniai

# LinkedIn Company Page
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_REFRESH_TOKEN=
LINKEDIN_ORGANIZATION_URN=urn:li:organization:XXXXXXX
LINKEDIN_ACCOUNT_NAME=ferni

# Discord Bot
DISCORD_BOT_TOKEN=
DISCORD_SERVER_ID=
DISCORD_CHANNEL_ID=
# OR use webhook instead:
# DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/XXX/YYY

# Instagram (optional)
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ID=
FACEBOOK_PAGE_ID=

# Medium (optional)
MEDIUM_ACCESS_TOKEN=
MEDIUM_PUBLICATION_ID=

# Notion (optional)
NOTION_API_KEY=
NOTION_DATABASE_ID=
```

---

## Testing Your Setup

```bash
# Check configured platforms
pnpm ferni brand social status

# Test posting to all platforms
pnpm ferni brand social test "Hello from Ferni! 🌿"

# Test specific platform
pnpm ferni brand social test --platform twitter "Test tweet"
pnpm ferni brand social test --platform linkedin "Test post"
pnpm ferni brand social test --platform discord "Test message"
```

---

## Scheduled Automation Jobs

Once configured, these jobs will automatically post:

| Job | Schedule | What it Posts |
|-----|----------|---------------|
| `brand-milestone-check` | Daily 10 AM | Milestone celebrations |
| `brand-publish-stories` | Daily 11 AM | Approved user stories |
| `brand-weekly-report` | Monday 9 AM | Weekly summary (Slack only) |

Deploy the jobs:
```bash
ferni brand scheduler setup
```

---

## Troubleshooting

### "401 Unauthorized" on Twitter
- Token may have expired. Run: `pnpm ferni auth twitter --refresh`
- Check if app has correct permissions

### "403 Forbidden" on LinkedIn
- Organization URN may be wrong
- Ensure app is connected to Company Page
- Check if token has `w_organization_social` scope

### Discord webhook not working
- Verify webhook URL is correct
- Check if webhook was deleted in Discord
- Try creating a new webhook

### Posts appearing as personal, not brand
- Check `SOCIAL_ACCOUNT_TYPE=brand` in `.env`
- For LinkedIn: ensure `LINKEDIN_ORGANIZATION_URN` is set (not `LINKEDIN_PERSON_URN`)
- For Twitter: ensure you're logged into the brand account when generating tokens

---

*Last updated: January 2026*
