# Agent E2E Developer Experience

> **Making it dead simple to define, host, build, and deploy custom AI agents.**

This document outlines the streamlined end-to-end developer experience for creating custom agents like Joel Dickson.

---

## Current State vs. Target State

### Current State (Complex, Manual)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CURRENT: 7+ Steps, Multiple Commands, Manual Wiring                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Create bundle folder manually                                           │
│     └── mkdir -p src/personas/bundles/my-agent/{identity,content}          │
│                                                                             │
│  2. Write persona.manifest.json (copy from template, edit 50+ fields)      │
│                                                                             │
│  3. Write system-prompt.md, biography.md, behavior JSONs                   │
│                                                                             │
│  4. Find/configure voice ID from Cartesia                                   │
│     └── Manual: cartesia.ai → browse voices → copy ID                      │
│                                                                             │
│  5. Create context builder (optional but recommended)                       │
│     └── src/intelligence/context-builders/personas/my-agent-insights/      │
│                                                                             │
│  6. Write deployment script                                                 │
│     └── scripts/deploy-my-agent-page.mts (copy Joel's, modify)             │
│                                                                             │
│  7. Deploy manually                                                         │
│     └── ferni deploy gce (voice agent)                                     │
│     └── Generate page → Firebase                                           │
│     └── Configure custom domain                                            │
│                                                                             │
│  TIME: 2-4 hours for experienced developer                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Target State (Streamlined)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TARGET: 3 Commands, Interactive Wizard, Auto-Wiring                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. ferni agent init my-advisor                                             │
│     ├── Interactive wizard for name, description, personality              │
│     ├── Voice selection from library (or clone prompt)                     │
│     ├── Auto-generates all bundle files                                    │
│     └── Creates dev environment config                                     │
│                                                                             │
│  2. ferni agent preview my-advisor                                          │
│     ├── Starts local dev server with hot reload                            │
│     ├── Opens browser with test page                                       │
│     └── Live voice testing environment                                     │
│                                                                             │
│  3. ferni agent publish my-advisor                                          │
│     ├── Validates bundle completeness                                       │
│     ├── Generates landing page                                             │
│     ├── Deploys to Cloud Run (isolated container)                          │
│     ├── Creates subdomain: my-advisor.agents.ferni.ai                      │
│     └── Outputs shareable URL                                              │
│                                                                             │
│  TIME: 15-30 minutes including content creation                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## New CLI Commands

### 1. `ferni agent init <agent-id>`

Interactive wizard that scaffolds a complete agent:

```bash
$ ferni agent init joel-advisor

┌  Create Your AI Agent
│
◆  What type of agent?
│  ○ 💼 Professional Advisor (business, finance, career)
│  ● 🎓 Personal Mentor (life guidance, wisdom)
│  ○ 🏃 Coach (fitness, habits, accountability)
│  ○ 🧘 Wellness Guide (mindfulness, mental health)
│  ○ 🎭 Custom Character
│
◆  What's your agent's name?
│  Joel Dickson
│
◆  One-line description:
│  Investment strategy expert from Vanguard
│
◆  Longer description (for landing page):
│  Meet Joel Dickson - your personal guide to investment strategy,
│  retirement planning, and financial wisdom.
│
◆  Choose a voice:
│  ○ Browse Cartesia Library...
│  ○ Clone from audio file...
│  ● Use voice ID: 3ebcd114-d280-4eed-a238-b9323a6b8e52
│
◆  Brand colors:
│  Primary: #96151D (Vanguard Red)
│  Secondary: (auto-calculated)
│
◆  Agent personality (1-10 scale):
│  Warmth: ████████░░ 8
│  Directness: ██████████ 10
│  Humor: ████░░░░░░ 4
│  Energy: ██████░░░░ 6
│
✓  Created agent at: src/personas/bundles/joel-advisor/
│
│  Files created:
│  ├── persona.manifest.json
│  ├── identity/system-prompt.md
│  ├── identity/biography.md
│  ├── content/behaviors/greetings.json
│  ├── content/behaviors/catchphrases.json
│  └── content/knowledge/_index.json
│
│  Next steps:
│  1. Edit identity/system-prompt.md with detailed instructions
│  2. Add knowledge to content/knowledge/
│  3. Preview: ferni agent preview joel-advisor
│  4. Publish: ferni agent publish joel-advisor
│
└  Agent created! Ready to customize.
```

### 2. `ferni agent preview <agent-id>`

Local development environment with hot reload:

```bash
$ ferni agent preview joel-advisor

┌  Agent Development Server
│
◇  Starting services...
│
│  ✓ Voice Agent Worker    http://localhost:8080
│  ✓ Token Server          http://localhost:3001
│  ✓ Preview Page          http://localhost:3333
│
│  Press 'o' to open browser
│  Press 'r' to reload agent
│  Press 'q' to quit
│
│  🎙️ Listening for voice...
│
│  [12:34:56] User: "Hey Joel"
│  [12:34:57] Joel: "Hello! What's on your mind about investing today?"
│
│  📝 Changes detected in system-prompt.md
│     Reloading agent...
│  ✓ Agent reloaded
│
└  Development server running

```

### 3. `ferni agent publish <agent-id>`

One-command production deployment:

```bash
$ ferni agent publish joel-advisor

┌  Publish Agent
│
◇  Validating agent bundle...
│  ✓ persona.manifest.json valid
│  ✓ system-prompt.md exists (2.4KB)
│  ✓ Voice ID verified
│  ✓ All required fields present
│
◇  Choose deployment type:
│  ● Ferni Hosted (joel-advisor.agents.ferni.ai)
│  ○ Custom Domain (bring your own)
│  ○ Standalone Container (Docker image only)
│
◇  Generating landing page...
│  ✓ Page generated (98KB)
│  ✓ Favicons created
│  ✓ OG image generated
│
◇  Deploying to Cloud Run...
│  ✓ Container built
│  ✓ Health check passed
│  ✓ Traffic shifted
│
◇  Configuring subdomain...
│  ✓ DNS configured
│  ✓ SSL certificate provisioned
│
◆  Review your agent:
│
│  🌐 Live URL: https://joel-advisor.agents.ferni.ai
│  📊 Dashboard: https://ferni.ai/agents/joel-advisor
│  📋 Share: https://ferni.ai/meet/joel-advisor
│
│  Test it:
│  $ curl https://joel-advisor.agents.ferni.ai/health
│
└  Agent published! 🎉

```

---

## Architecture

### Agent Hosting Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AGENT HOSTING ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User Request                                                               │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CLOUDFLARE / DNS                                  │   │
│  │  *.agents.ferni.ai → Cloud Run Service                              │   │
│  │  custom-domain.com → CNAME to agents.ferni.ai                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CLOUD RUN (Agent Gateway)                         │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │   │
│  │  │ joel-advisor    │  │ wellness-coach  │  │ finance-mentor  │     │   │
│  │  │ Port 8080       │  │ Port 8080       │  │ Port 8080       │     │   │
│  │  │ 0.5 vCPU        │  │ 0.5 vCPU        │  │ 0.5 vCPU        │     │   │
│  │  │ 1GB RAM         │  │ 1GB RAM         │  │ 1GB RAM         │     │   │
│  │  │ min-instances:0 │  │ min-instances:0 │  │ min-instances:0 │     │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │   │
│  │                                                                      │   │
│  │  Isolated containers per agent (security, cost optimization)         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SHARED SERVICES                                   │   │
│  │                                                                      │   │
│  │  LiveKit Cloud (WebRTC)     Cartesia (TTS)      OpenAI (LLM)        │   │
│  │  Token Service              Voice Library       Gemini (alt)        │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cost-Effective Scaling

| Scale | Instance Config | Monthly Cost (Est.) |
|-------|-----------------|---------------------|
| Demo/Personal | min-instances: 0, max: 2 | $5-15 |
| Small Business | min-instances: 1, max: 5 | $30-50 |
| Enterprise | min-instances: 2, max: 20 | $100-300 |

Key optimizations:
- **Cold start**: min-instances: 0 for low-traffic agents
- **Warm pools**: min-instances: 1 for production agents
- **Auto-scale**: Cloud Run scales based on concurrent connections
- **Isolated billing**: Each agent can have separate billing project

---

## File Structure

### Agent Bundle (Enhanced)

```
src/personas/bundles/joel-advisor/
├── persona.manifest.json        # Core configuration (enhanced with deployment config)
├── identity/
│   ├── system-prompt.md         # LLM instructions
│   ├── biography.md             # Agent backstory
│   └── function-calling-specialty.md  # Tool instructions (optional)
├── content/
│   ├── behaviors/
│   │   ├── greetings.json       # Opening phrases
│   │   ├── catchphrases.json    # Signature phrases
│   │   ├── backchannels.json    # Active listening sounds
│   │   └── quirks.json          # Personality quirks
│   ├── knowledge/
│   │   ├── _index.json          # Knowledge catalog
│   │   └── *.md                 # Domain knowledge files
│   └── stories/
│       └── anecdotes.json       # Personal stories
├── brand/                       # NEW: Landing page assets
│   ├── logo.png                 # Agent logo (optional)
│   ├── og-image.png             # Social share image (auto-generated)
│   └── brand.json               # Colors, fonts, theme
└── deploy/                      # NEW: Deployment configuration
    ├── config.json              # Cloud Run settings
    └── Dockerfile               # Custom Dockerfile (optional)
```

### Enhanced persona.manifest.json

```json
{
  "$schema": "https://ferni.ai/schemas/persona-manifest.v3.json",
  "version": "3.0.0",

  "identity": {
    "id": "joel-advisor",
    "name": "Joel Dickson",
    "display_name": "Joel",
    "tagline": "Investment Strategy Expert",
    "description": "Your guide to smart investing and financial wisdom.",
    "icon": "📈",
    "initials": "JD"
  },

  "voice": {
    "provider": "cartesia",
    "voice_id": "3ebcd114-d280-4eed-a238-b9323a6b8e52",
    "default_rate": "medium"
  },

  "personality": {
    "warmth": 0.85,
    "humor_level": 0.4,
    "directness": 0.8,
    "energy": 0.6,
    "traits": ["wise", "patient", "analytical", "approachable"]
  },

  "tools": {
    "domains": ["finance", "research", "productivity"],
    "required": [],
    "forbidden": ["handoff*"]
  },

  "capabilities": {
    "standalone_agent": true,
    "can_handoff": false,
    "music_enabled": false
  },

  "brand": {
    "primary": "#96151D",
    "secondary": "#B41E28",
    "fonts": {
      "display": "Mark Pro",
      "body": "system-ui"
    },
    "theme": "professional"
  },

  "deployment": {
    "type": "cloud-run",
    "subdomain": "joel-advisor",
    "custom_domain": null,
    "min_instances": 0,
    "max_instances": 5,
    "memory": "1Gi",
    "cpu": "0.5",
    "region": "us-central1"
  },

  "analytics": {
    "enabled": true,
    "consent_required": false
  },

  "metadata": {
    "author": "VoiceAI Team",
    "created_at": "2026-01-15T00:00:00Z",
    "updated_at": "2026-01-15T00:00:00Z"
  }
}
```

---

## Implementation Plan

### Phase 1: Core CLI Commands (Week 1-2)

| Task | Priority | Effort |
|------|----------|--------|
| `ferni agent init` - Interactive wizard | P0 | 3d |
| `ferni agent preview` - Local dev server | P0 | 2d |
| `ferni agent publish` - Cloud Run deploy | P0 | 3d |
| `ferni agent list` - Show all agents | P1 | 1d |
| `ferni agent status <id>` - Deployment status | P1 | 1d |

### Phase 2: Enhanced Features (Week 3-4)

| Task | Priority | Effort |
|------|----------|--------|
| Voice library browser/preview | P1 | 2d |
| Voice cloning integration | P1 | 2d |
| Custom domain support | P2 | 2d |
| Analytics dashboard integration | P2 | 3d |
| Agent versioning | P2 | 2d |

### Phase 3: Enterprise Features (Week 5-6)

| Task | Priority | Effort |
|------|----------|--------|
| Team/org agent management | P2 | 3d |
| White-label support | P2 | 3d |
| API for programmatic agent creation | P2 | 2d |
| Agent marketplace submission | P3 | 3d |

---

## API Design

### Agent Registry API

```typescript
// GET /api/agents - List user's agents
interface AgentListResponse {
  agents: AgentSummary[];
  total: number;
}

// POST /api/agents - Create new agent
interface CreateAgentRequest {
  id: string;
  name: string;
  description: string;
  personality: PersonalityConfig;
  voice: VoiceConfig;
  brand: BrandConfig;
  deployment: DeploymentConfig;
}

// GET /api/agents/:id - Get agent details
interface AgentDetailsResponse {
  agent: AgentConfig;
  status: DeploymentStatus;
  metrics: AgentMetrics;
}

// POST /api/agents/:id/deploy - Trigger deployment
interface DeployRequest {
  environment: 'preview' | 'production';
}

// DELETE /api/agents/:id - Delete agent
```

### Agent Gateway API

Each deployed agent exposes:

```
GET  /health              - Health check
GET  /health/ready        - Readiness check
POST /token               - Get LiveKit token
GET  /api/agent           - Agent info
WS   /ws                  - WebSocket for real-time
```

---

## Security Considerations

### Isolation

- Each agent runs in isolated Cloud Run container
- Separate service accounts per agent
- Network policies prevent cross-agent communication
- Secrets stored in Secret Manager

### Authentication

- Landing pages: Optional (configurable)
- API: API key or OAuth2
- Admin: Firebase Auth

### Rate Limiting

- Per-agent rate limits
- Configurable in manifest
- Default: 100 concurrent connections

---

## Developer Experience Comparison

### Before (Joel Dickson Setup)

```bash
# 1. Copy template
cp -r src/personas/bundles/ferni src/personas/bundles/joel-dickson

# 2. Edit 10+ files manually...
vim src/personas/bundles/joel-dickson/persona.manifest.json
vim src/personas/bundles/joel-dickson/identity/system-prompt.md
# ... etc

# 3. Create context builder
mkdir src/intelligence/context-builders/personas/joel-dickson-insights
# ... write TypeScript

# 4. Create deploy script
vim scripts/deploy-joel-page.mts

# 5. Register in various places
vim src/config/voice-ids.ts
vim src/personas/persona-ids.ts

# 6. Build and deploy
pnpm build
ferni deploy gce
npx tsx scripts/deploy-joel-page.mts

# 7. Configure Firebase hosting
vim firebase.json
firebase deploy

# Time: 2-4 hours
```

### After (New Flow)

```bash
# 1. Create agent (5 minutes)
ferni agent init joel-advisor

# 2. Customize (varies)
vim src/personas/bundles/joel-advisor/identity/system-prompt.md

# 3. Preview (instant)
ferni agent preview joel-advisor

# 4. Deploy (2 minutes)
ferni agent publish joel-advisor

# Time: 15-30 minutes
```

---

## Related Documentation

- `docs/architecture/AGENT-EXTENSIBILITY.md` - Commands, hooks, MCP
- `docs/creating-personas.md` - Persona creation guide
- `apps/marketplace-agents/docs/AGENT-DEVELOPMENT-GUIDE.md` - Marketplace agents
- `src/services/page-generator/` - Page generation service

---

## FAQ

### Q: Can I still use the old manual process?
Yes! The new CLI wraps the existing infrastructure. Manual bundle creation still works.

### Q: How are agents billed?
Each agent can be configured for:
- Ferni hosted (usage-based, pay-per-minute)
- Self-hosted (bring your own GCP project)
- Enterprise (flat monthly fee)

### Q: Can I migrate existing agents?
Yes. Run `ferni agent migrate <bundle-path>` to update to the new manifest format.

### Q: What about the main Ferni team (Maya, Jordan, etc.)?
The core team continues to run on GCE as a single multi-agent deployment. This new system is for standalone custom agents.

---

*Last updated: January 2026*
