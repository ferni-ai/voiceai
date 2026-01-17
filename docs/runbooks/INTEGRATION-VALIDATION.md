# Integration Validation Runbook

> How to validate all "Better than Human" integrations work E2E locally and in production.

## Quick Start

```bash
# 1. Check integration health
pnpm test:integrations

# 2. Validate specific integration
node -e "require('./dist/services/finance/sec-edgar.js').getCompanyFilings('AAPL').then(console.log)"

# 3. Full E2E suite
pnpm test:e2e
```

---

## Environment Setup

### Required Environment Variables

Create/update your `.env` file with these variables:

```bash
# ====== CORE (Required) ======
NODE_ENV=development
LIVEKIT_URL=wss://dev-8sm1ba0z.livekit.cloud
LIVEKIT_API_KEY=your-dev-key
LIVEKIT_API_SECRET=your-dev-secret

# ====== BIOMETRICS ======
# Oura Ring
OURA_CLIENT_ID=your-oura-client-id
OURA_CLIENT_SECRET=your-oura-client-secret
OURA_REDIRECT_URI=http://localhost:3002/api/v1/integrations/biometrics/callback/oura

# Whoop
WHOOP_CLIENT_ID=your-whoop-client-id
WHOOP_CLIENT_SECRET=your-whoop-client-secret
WHOOP_REDIRECT_URI=http://localhost:3002/api/v1/integrations/biometrics/callback/whoop

# Google Fit
GOOGLE_FIT_CLIENT_ID=your-google-fit-client-id
GOOGLE_FIT_CLIENT_SECRET=your-google-fit-client-secret
GOOGLE_FIT_REDIRECT_URI=http://localhost:3002/api/v1/integrations/biometrics/callback/googlefit

# Terra (aggregates 300+ wearables including Apple Health)
TERRA_API_KEY=your-terra-api-key
TERRA_DEV_ID=your-terra-dev-id
TERRA_WEBHOOK_SECRET=your-terra-webhook-secret

# ====== FINANCIAL DATA ======
# Alpha Vantage (market data)
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-key

# FRED (macro economics)
FRED_API_KEY=your-fred-api-key

# SEC EDGAR (insider trading)
SEC_USER_AGENT="Ferni AI (contact@ferni.ai)"

# ====== RESTAURANT RESERVATIONS ======
OPENTABLE_API_KEY=your-opentable-key
RESY_API_KEY=your-resy-key
YELP_API_KEY=your-yelp-key

# ====== GOOGLE SERVICES ======
# Calendar & Gmail (shared OAuth)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3002/api/auth/google/callback

# Maps (travel time)
GOOGLE_MAPS_API_KEY=your-maps-api-key

# ====== SPOTIFY ======
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
```

### Get API Keys

| Service | Where to Get Key |
|---------|------------------|
| Alpha Vantage | https://www.alphavantage.co/support/#api-key (free) |
| FRED | https://fred.stlouisfed.org/docs/api/api_key.html (free) |
| SEC EDGAR | No key needed, just User-Agent header |
| Oura | https://cloud.ouraring.com/v2/docs |
| Whoop | https://developer.whoop.com/ |
| Terra | https://tryterra.co/ (aggregates 300+ wearables) |
| OpenTable | https://platform.opentable.com/ |
| Resy | Contact Resy for API access |
| Google | https://console.cloud.google.com/apis |

---

## Local Validation

### Step 1: Start Dev Servers

```bash
# Terminal 1: Token Server (port 3001)
node token-server.js

# Terminal 2: UI Server (port 3002)
PORT=3002 node ui-server.js

# Terminal 3: Frontend (port 3004)
cd apps/web && pnpm dev
```

### Step 2: Run Integration Tests

```bash
# All integration tests
pnpm test:integrations

# Specific integration tests
pnpm vitest run src/tests/integration/

# Wearable integrations
pnpm vitest run src/tests/wearable-integrations.test.ts
```

### Step 3: Manual API Validation

#### SEC EDGAR (Peter)
```bash
# Build first
pnpm build:fast

# Test SEC filings
node -e "
  import('./dist/services/finance/sec-edgar.js').then(sec => {
    sec.getCompanyFilings('AAPL', { forms: ['8-K'], limit: 3 })
      .then(r => console.log('SEC Filings:', JSON.stringify(r, null, 2)))
  })
"

# Test insider trading
node -e "
  import('./dist/services/finance/sec-edgar.js').then(sec => {
    sec.getInsiderTradingSummary('TSLA', 30)
      .then(r => console.log('Insider Trading:', JSON.stringify(r, null, 2)))
  })
"
```

#### Gmail (Alex)
```bash
# Test requires OAuth - use browser flow
open http://localhost:3004/settings/integrations

# After connecting Google account:
curl http://localhost:3002/api/v1/integrations/gmail/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Biometrics (Maya)
```bash
# Check if biometrics connected
curl http://localhost:3002/api/v1/integrations/biometrics/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get biometric snapshot
curl http://localhost:3002/api/v1/integrations/biometrics/snapshot \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Life Expectancy (Nayan)
```bash
# Test mortality calculations
node -e "
  import('./dist/services/wisdom/life-expectancy.js').then(le => {
    const result = le.calculateLifeExpectancy({
      birthDate: new Date('1985-06-15'),
      sex: 'male'
    });
    console.log('Life Expectancy:', JSON.stringify(result, null, 2));
  })
"

# Test parent visits calculation
node -e "
  import('./dist/intelligence/context-builders/mortality-perspective.js').then(mp => {
    const result = mp.calculateParentVisitsRemaining(70, 'monthly');
    console.log('Parent Visits:', JSON.stringify(result, null, 2));
  })
"
```

#### Restaurant Reservations (Jordan)
```bash
# Search restaurants (requires API keys)
curl "http://localhost:3002/api/v1/reservations/search?query=italian&location=San+Francisco&partySize=2" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### Market Data (Peter)
```bash
# Test stock quote
curl "http://localhost:3002/api/v1/market/quote?symbol=AAPL" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test FRED data
node -e "
  import('./dist/tools/domains/research/external-apis.js').then(api => {
    api.getFREDData('GDP').then(r => console.log('FRED GDP:', r));
  })
"
```

---

## Production Validation

### Step 1: Deploy

```bash
# Deploy all services
ferni deploy all

# Or deploy specific service
ferni deploy gce      # Voice agent
ferni deploy ui       # UI backend
ferni deploy frontend # Frontend
```

### Step 2: Health Checks

```bash
# Voice Agent (GCE)
curl http://34.134.186.63:8080/health
curl http://34.134.186.63:8080/health/ready

# UI Backend (Cloud Run)
curl https://app.ferni.ai/health
curl https://app.ferni.ai/api/agents

# Integration Status
curl https://app.ferni.ai/api/v1/integrations/status \
  -H "Authorization: Bearer YOUR_PROD_TOKEN"
```

### Step 3: Feature Validation

```bash
# SEC EDGAR in production
curl "https://app.ferni.ai/api/v1/market/sec/filings?ticker=AAPL" \
  -H "Authorization: Bearer YOUR_PROD_TOKEN"

# Biometrics status
curl "https://app.ferni.ai/api/v1/integrations/biometrics/status" \
  -H "Authorization: Bearer YOUR_PROD_TOKEN"
```

### Step 4: Voice Agent Testing

1. Open https://app.ferni.ai
2. Connect to voice session
3. Test each integration via voice:

| Integration | Test Phrase | Expected Response |
|-------------|-------------|-------------------|
| SEC EDGAR | "What's the insider trading activity for Apple?" | Peter surfaces recent insider buys/sells |
| Gmail | "Do I have any urgent emails?" | Alex triages inbox |
| Biometrics | "How did I sleep last night?" | Maya surfaces sleep data |
| Life Expectancy | "I'll visit my parents someday" | Nayan provides mortality perspective |
| Reservations | "Book a table for 2 at an Italian place tonight" | Jordan searches OpenTable/Resy |
| Market Data | "How is Tesla stock doing?" | Peter provides real-time quote |

---

## Automated E2E Tests

### Run Full Suite

```bash
# All E2E tests
pnpm test:e2e

# Specific persona tests
pnpm vitest run src/tests/peter-quant-e2e.test.ts
pnpm vitest run src/tests/maya-santos-persona-e2e.test.ts
pnpm vitest run src/tests/alex-chen-persona-e2e.test.ts

# Integration E2E
pnpm vitest run src/tests/integration/integrations-e2e.test.ts
```

### CI/CD Integration

The GitHub Actions workflow runs these automatically on PR:
- `pnpm typecheck` - Type safety
- `pnpm lint` - Code quality
- `pnpm test` - Unit tests
- Integration tests (with mocked APIs in CI)

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| SEC API 403 | Missing User-Agent | Set `SEC_USER_AGENT` env var |
| Alpha Vantage rate limit | Free tier limit (5/min) | Wait or upgrade to paid |
| Gmail 401 | OAuth token expired | Re-authenticate via settings |
| Biometrics empty | No wearable connected | Connect via Terra widget |
| OpenTable 404 | API key invalid | Check `OPENTABLE_API_KEY` |

### Debug Mode

```bash
# Enable debug logging
DEBUG=* pnpm dev

# Check specific module
DEBUG=SEC-EDGAR,Gmail pnpm dev
```

### Check Integration Status

```bash
# Run integration health check
pnpm ops:integration-health

# Or manually
curl http://localhost:3002/api/v1/integrations/health
```

---

## Integration Matrix

| Integration | Local Test | Prod Test | Mock Available | API Key Required |
|-------------|------------|-----------|----------------|------------------|
| SEC EDGAR | ✅ | ✅ | ✅ | ❌ (just User-Agent) |
| Alpha Vantage | ✅ | ✅ | ✅ | ✅ |
| FRED | ✅ | ✅ | ✅ | ✅ |
| Gmail | ✅ | ✅ | ✅ | OAuth |
| Oura | ✅ | ✅ | ✅ | OAuth |
| Whoop | ✅ | ✅ | ✅ | OAuth |
| Terra | ✅ | ✅ | ✅ | ✅ |
| OpenTable | ✅ | ✅ | ✅ | ✅ |
| Resy | ✅ | ✅ | ✅ | ✅ |
| Google Calendar | ✅ | ✅ | ✅ | OAuth |
| Google Maps | ✅ | ✅ | ✅ | ✅ |
| Life Expectancy | ✅ | ✅ | N/A | ❌ (local calc) |

---

## Next Steps After Validation

1. **Monitor in Production**
   ```bash
   pnpm ops:diagnose
   pnpm ops:logs
   ```

2. **Set Up Alerts**
   ```bash
   pnpm ops:setup-scheduler  # GCP uptime checks
   ```

3. **Track Usage**
   - Check Firebase Analytics for integration usage
   - Monitor API rate limits in each service dashboard
