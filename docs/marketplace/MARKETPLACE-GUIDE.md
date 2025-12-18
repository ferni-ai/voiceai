# Ferni Marketplace Guide

> Discover coaches and capabilities that grow with you

## Overview

The Ferni Marketplace is where you find new ways to grow:

- **Discover** coaches and capabilities curated for you
- **Add** what resonates, with clear permission choices
- **Share** your experience to help others
- **Create** your own contributions (for developers)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend UI                              │
├─────────────────────────────────────────────────────────────────┤
│  marketplace.ui.ts     │  Permission consent  │  Admin panel    │
│  (browse, install)     │  (consent modal)     │  (review queue) │
└────────────┬───────────┴──────────┬──────────┴────────┬────────┘
             │                      │                    │
             ▼                      ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Routes                               │
├─────────────────────────────────────────────────────────────────┤
│  /api/marketplace/*    │  /api/marketplace/   │  /api/admin/    │
│  (browse, install)     │  reviews/*           │  marketplace/*  │
└────────────┬───────────┴──────────┬──────────┴────────┬────────┘
             │                      │                    │
             ▼                      ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Backend Modules                            │
├──────────────┬──────────────┬──────────────┬───────────────────┤
│   Registry   │   Executor   │   Reviews    │      Billing      │
│  (manifests) │  (sandbox)   │  (ratings)   │  (usage, quotas)  │
└──────────────┴──────────────┴──────────────┴───────────────────┘
```

---

## For You

### Finding What You Need

1. Open Settings → **Marketplace**
2. Browse by what matters to you, or search
3. See what others say, and what access is needed
4. Click **Add** when something feels right

### Understanding Permissions

Before adding anything, you'll see exactly what it needs:

| Badge        | Meaning                          |
| ------------ | -------------------------------- |
| 🛡️ Verified  | Publisher identity confirmed     |
| ⭐ Trusted   | Extensively tested by Ferni team |
| 👥 Community | Community contribution           |

**Required** – Needed for it to work
**Optional** – Your choice, for enhanced experience

### Your Voice Matters

After spending time with something, you can:

- Share how it's helped you (1-5 stars)
- Write about your experience
- Help others by marking helpful reviews
- Let us know if something feels off

---

## For Developers

### Publishing Tools & Agents

#### 1. Create a Manifest

**Tool Manifest** (`tool.manifest.json`):

```json
{
  "manifestVersion": "1.0.0",
  "id": "my-tool",
  "name": "My Awesome Tool",
  "version": "1.0.0",
  "publisher": {
    "id": "pub_yourname",
    "name": "Your Name"
  },
  "description": {
    "short": "One-line description",
    "long": "Detailed description of what your tool does..."
  },
  "metadata": {
    "category": "productivity",
    "tags": ["automation", "workflow"]
  },
  "permissions": {
    "required": [
      {
        "scope": "profile:read",
        "reason": "Access your preferences",
        "required": true
      }
    ],
    "optional": []
  },
  "execution": {
    "type": "http",
    "endpoint": "https://your-api.com/execute",
    "method": "POST",
    "limits": {
      "timeoutMs": 5000,
      "maxRetries": 2
    }
  }
}
```

**Agent Manifest** (`agent.manifest.json`):

```json
{
  "manifestVersion": "1.0.0",
  "id": "my-agent",
  "name": "My AI Agent",
  "version": "1.0.0",
  "publisher": {
    "id": "pub_yourname",
    "name": "Your Name"
  },
  "description": {
    "short": "One-line agent description",
    "long": "What this agent specializes in..."
  },
  "persona": {
    "name": "AgentName",
    "description": "Agent personality description",
    "specialties": ["research", "analysis"],
    "tone": "professional"
  },
  "permissions": {
    "required": [],
    "optional": []
  }
}
```

#### 2. Execution Types

| Type     | Use Case                | Isolation      |
| -------- | ----------------------- | -------------- |
| `http`   | External API calls      | Network only   |
| `wasm`   | Compute-heavy, portable | Memory sandbox |
| `docker` | Complex dependencies    | Full container |

#### 3. Submit for Review

1. Go to **Publisher Portal** in marketplace
2. Upload your manifest and assets
3. Wait for admin review (24-48 hours)
4. Once approved, your item is live!

### Revenue Sharing

| Tier     | Publisher Share | Ferni Share |
| -------- | --------------- | ----------- |
| Free     | N/A             | N/A         |
| Freemium | 70%             | 30%         |
| Premium  | 70%             | 30%         |

Payouts processed monthly via Stripe.

---

## API Reference

### User Endpoints

| Method | Endpoint                       | Description    |
| ------ | ------------------------------ | -------------- |
| GET    | `/api/marketplace/browse`      | List all items |
| GET    | `/api/marketplace/browse/:id`  | Item details   |
| POST   | `/api/marketplace/install/:id` | Install item   |
| DELETE | `/api/marketplace/install/:id` | Uninstall      |
| GET    | `/api/marketplace/usage`       | Usage stats    |

### Reviews Endpoints

| Method | Endpoint                            | Description   |
| ------ | ----------------------------------- | ------------- |
| GET    | `/api/marketplace/reviews/:itemId`  | List reviews  |
| POST   | `/api/marketplace/reviews`          | Create review |
| PUT    | `/api/marketplace/reviews/:id`      | Update review |
| DELETE | `/api/marketplace/reviews/:id`      | Delete review |
| POST   | `/api/marketplace/reviews/:id/vote` | Vote helpful  |
| POST   | `/api/marketplace/reviews/:id/flag` | Flag review   |

### Publisher Endpoints

| Method | Endpoint                               | Description |
| ------ | -------------------------------------- | ----------- |
| POST   | `/api/marketplace/publisher/submit`    | Submit item |
| GET    | `/api/marketplace/publisher/items`     | Your items  |
| GET    | `/api/marketplace/publisher/analytics` | Stats       |

### Admin Endpoints (requires admin auth)

| Method | Endpoint                                      | Description       |
| ------ | --------------------------------------------- | ----------------- |
| GET    | `/api/admin/marketplace/queue`                | Review queue      |
| POST   | `/api/admin/marketplace/item/:id/approve`     | Approve item      |
| POST   | `/api/admin/marketplace/item/:id/reject`      | Reject item       |
| POST   | `/api/admin/marketplace/reviews/:id/moderate` | Moderate review   |
| GET    | `/api/admin/marketplace/stats`                | Marketplace stats |

---

## Permission Scopes

| Scope                 | Access Level | Data                |
| --------------------- | ------------ | ------------------- |
| `profile:read`        | Read         | Name, preferences   |
| `profile:write`       | Write        | Update preferences  |
| `conversations:read`  | Read         | Chat history        |
| `conversations:write` | Write        | Send messages       |
| `calendar:read`       | Read         | Calendar events     |
| `calendar:write`      | Write        | Create events       |
| `contacts:read`       | Read         | Contact list        |
| `external:http:read`  | Network      | Fetch external data |
| `external:http:write` | Network      | Post external data  |

---

## Trust Levels

| Level        | Badge | Meaning                          |
| ------------ | ----- | -------------------------------- |
| `platform`   | 🏛️    | Built by Ferni team              |
| `verified`   | ✅    | Publisher verified, code audited |
| `community`  | 👥    | Community contribution           |
| `unverified` | ⚠️    | New submission, not yet reviewed |

---

## Deployment

### Deploy Scheduler Jobs

Background jobs for billing and maintenance:

```bash
# Deploy all scheduler jobs
npm run deploy:marketplace-scheduler

# Dry run (preview without deploying)
npm run deploy:marketplace-scheduler:dry-run
```

**Jobs Deployed:**

- `marketplace-daily-aggregation` - Daily usage metrics
- `marketplace-weekly-reports` - Weekly user reports
- `marketplace-monthly-revenue` - Calculate revenue shares
- `marketplace-publisher-payouts` - Process Stripe payouts
- `marketplace-quarterly-cleanup` - Archive old data

---

## Testing

```bash
# Run all marketplace tests
npm test -- --grep marketplace

# Run specific test suites
npm test -- src/marketplace/__tests__/reviews.test.ts
npm test -- src/api/__tests__/marketplace-admin.test.ts
npm test -- src/tests/marketplace-e2e.test.ts
```

---

## File Structure

```
src/marketplace/
├── index.ts              # Main exports
├── registry.ts           # Tool/agent registration
├── schema/
│   └── types.ts          # TypeScript types
├── executor/
│   ├── sandbox.ts        # Main executor
│   ├── wasm-runtime.ts   # WASM isolation
│   └── docker-runtime.ts # Docker isolation
├── billing/
│   ├── index.ts          # Usage tracking
│   └── stripe-webhooks.ts # Payment processing
├── reviews/
│   └── index.ts          # Ratings system
└── __tests__/
    ├── registry.test.ts
    └── reviews.test.ts

src/api/routes/
├── marketplace-reviews.ts  # Reviews API
└── marketplace-admin.ts    # Admin API

apps/web/src/ui/
├── marketplace.ui.ts                    # Browse/install UI
├── marketplace-permission-consent.ui.ts # Consent modal
├── marketplace-publisher.ui.ts          # Publisher portal
├── marketplace-billing.ui.ts            # Usage dashboard
└── marketplace-admin.ui.ts              # Admin panel
```

---

## Support

- **Documentation**: This guide
- **Issues**: GitHub Issues
- **Publisher Support**: marketplace@ferni.ai
