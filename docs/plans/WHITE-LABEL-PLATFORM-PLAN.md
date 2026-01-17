# White-Label Platform Plan

> **Goal**: Transform Ferni into a platform that supports fully white-labeled deployments with custom agent rosters for internal/enterprise use.

**Architecture Model**: Plugin/Extension (Ferni as platform, custom agents as installable extensions)
**Customization Level**: Full white-label (no Ferni references)
**Timeline**: 4-6 weeks production-ready

---

## Executive Summary

This plan creates a **Deployment Bundle** system that packages:
- Custom agent rosters (coordinator + specialists)
- Brand identity (colors, voice, name, logo)
- Feature configuration (which capabilities enabled)
- Team coordination rules (handoffs, routing)

Each deployment is fully isolated and can run with zero Ferni branding.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     FERNI PLATFORM CORE                         │
│  (Shared: voice engine, LLM integration, tool framework)        │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│ DEPLOYMENT A  │     │ DEPLOYMENT B  │     │ DEPLOYMENT C  │
│ "Ferni"       │     │ "ACME Corp"   │     │ "Partner X"   │
│               │     │               │     │               │
│ Agents:       │     │ Agents:       │     │ Agents:       │
│ - Ferni       │     │ - Max (coach) │     │ - Guide       │
│ - Maya        │     │ - Ana (money) │     │ - Advisor     │
│ - Peter       │     │ - Sam (tasks) │     │               │
│ - Alex        │     │               │     │ Brand:        │
│ - Jordan      │     │ Brand:        │     │ - Custom logo │
│ - Nayan       │     │ - ACME colors │     │ - Partner UI  │
│               │     │ - Corp voice  │     │               │
│ Brand:        │     │               │     │ Features:     │
│ - Ferni green │     │ Features:     │     │ - Voice only  │
│ - Full suite  │     │ - No Spotify  │     │ - No music    │
└───────────────┘     │ - Custom MCP  │     └───────────────┘
                      └───────────────┘
```

---

## Phase 1: Deployment Bundle Schema (Week 1)

### 1.1 Create Deployment Bundle Type

**File**: `src/deployments/types.ts`

```typescript
export interface DeploymentBundle {
  // Identity
  id: string;                          // 'ferni-main', 'acme-corp'
  name: string;                        // 'Ferni', 'ACME Advisor'
  version: string;                     // '1.0.0'

  // Branding
  brand: {
    displayName: string;               // 'ACME AI Assistant'
    tagline?: string;                  // 'Your enterprise companion'
    colors: {
      primary: string;                 // Main brand color
      secondary: string;               // Supporting color
      accent: string;                  // CTA buttons
      background: string;              // App background
      text: string;                    // Primary text
    };
    logoUrl?: string;                  // Custom logo
    faviconUrl?: string;               // Browser favicon
    fonts?: {
      display?: string;                // Headings
      body?: string;                   // Body text
    };
  };

  // Agent Roster
  agents: {
    coordinator: {
      bundleId: string;                // 'max-coach' (persona bundle ID)
      displayName?: string;            // Override: 'Max' → 'Your Coach'
      voiceId?: string;                // Custom voice override
    };
    specialists: Array<{
      bundleId: string;                // 'ana-finance'
      displayName?: string;            // Override name
      voiceId?: string;                // Custom voice
      role: string;                    // 'finance', 'productivity'
      handoffTriggers: string[];       // ['budget', 'money', 'invest']
    }>;
  };

  // Team Coordination
  coordination: {
    routingRules: Array<{
      pattern: string | RegExp;        // Topic/intent pattern
      targetAgent: string;             // Agent bundle ID
      confidence?: number;             // Min confidence to route
    }>;
    escalationChain?: Array<{
      from: string;
      to: string;
      condition: string;
    }>;
    defaultHandoffStyle: 'warm' | 'standard' | 'subtle';
  };

  // Feature Configuration
  features: {
    musicEnabled: boolean;
    spotifyIntegration: boolean;
    calendarIntegration: boolean;
    emailIntegration: boolean;
    habitTracking: boolean;
    teamHandoffs: boolean;
    voiceCustomization: boolean;
    // ... extensible
  };

  // Platform Tools
  tools: {
    enabled: string[];                 // Tool IDs to enable
    disabled: string[];                // Explicitly disable
    custom?: Array<{                   // Deployment-specific tools
      id: string;
      manifest: ToolManifest;
    }>;
  };

  // MCP Servers (optional)
  mcpServers?: Array<{
    name: string;
    transport: 'stdio' | 'http';
    command?: string;
    url?: string;
    env?: Record<string, string>;
  }>;

  // Deployment Settings
  deployment: {
    environment: 'development' | 'staging' | 'production';
    region: string;                    // 'us-central1'
    projectId?: string;                // GCP project override
    customDomain?: string;             // 'ai.acme.com'
    minInstances?: number;             // Keep-warm instances
    maxInstances?: number;             // Scale limit
  };

  // Metadata
  metadata: {
    publisher: string;
    createdAt: string;
    updatedAt: string;
    supportEmail?: string;
    documentationUrl?: string;
  };
}
```

### 1.2 Create Deployment Registry

**File**: `src/deployments/registry.ts`

```typescript
export class DeploymentRegistry {
  private cache: Map<string, DeploymentBundle> = new Map();

  // Load deployment from config file or API
  async getDeployment(id: string): Promise<DeploymentBundle>;

  // List all available deployments
  async listDeployments(): Promise<DeploymentBundle[]>;

  // Validate deployment bundle schema
  validateBundle(bundle: DeploymentBundle): ValidationResult;

  // Get current deployment (from env or request context)
  getCurrentDeployment(): DeploymentBundle;
}
```

### 1.3 Create Default Deployments

**File**: `config/deployments/ferni.json` (default)

```json
{
  "id": "ferni-main",
  "name": "Ferni",
  "version": "1.0.0",
  "brand": {
    "displayName": "Ferni",
    "tagline": "Better than human",
    "colors": {
      "primary": "#4a6741",
      "secondary": "#584840",
      "accent": "#3D5A45",
      "background": "#FFFDFB",
      "text": "#2C2520"
    }
  },
  "agents": {
    "coordinator": {
      "bundleId": "ferni",
      "displayName": "Ferni"
    },
    "specialists": [
      { "bundleId": "maya-santos", "role": "habits", "handoffTriggers": ["habit", "routine", "exercise"] },
      { "bundleId": "peter-john", "role": "research", "handoffTriggers": ["research", "stock", "invest"] },
      { "bundleId": "alex-chen", "role": "communication", "handoffTriggers": ["email", "calendar", "schedule"] },
      { "bundleId": "jordan-taylor", "role": "planning", "handoffTriggers": ["event", "milestone", "career"] },
      { "bundleId": "nayan-patel", "role": "wisdom", "handoffTriggers": ["meaning", "purpose", "philosophy"] }
    ]
  },
  "features": {
    "musicEnabled": true,
    "spotifyIntegration": true,
    "calendarIntegration": true,
    "habitTracking": true,
    "teamHandoffs": true
  }
}
```

**File**: `config/deployments/example-enterprise.json` (template)

```json
{
  "id": "example-enterprise",
  "name": "Enterprise AI",
  "version": "1.0.0",
  "brand": {
    "displayName": "Your AI Assistant",
    "tagline": "Powered by your company",
    "colors": {
      "primary": "#0066CC",
      "secondary": "#003366",
      "accent": "#FF6600",
      "background": "#FFFFFF",
      "text": "#333333"
    }
  },
  "agents": {
    "coordinator": {
      "bundleId": "ferni",
      "displayName": "Assistant"
    },
    "specialists": []
  },
  "features": {
    "musicEnabled": false,
    "spotifyIntegration": false,
    "calendarIntegration": true,
    "habitTracking": false,
    "teamHandoffs": false
  }
}
```

### 1.4 Tasks

| Task | Estimate | Dependencies |
|------|----------|--------------|
| Create `DeploymentBundle` type definition | 2h | None |
| Create `DeploymentRegistry` class | 4h | Types |
| Create JSON schema for validation | 2h | Types |
| Create default Ferni deployment config | 1h | Schema |
| Create example enterprise template | 1h | Schema |
| Write unit tests | 3h | All above |

**Phase 1 Total**: ~13 hours (2 days)

---

## Phase 2: Backend Integration (Week 1-2)

### 2.1 Environment Configuration Updates

**File**: `src/config/environment.ts`

```typescript
// Add deployment-aware configuration
export function getConfig(): AppConfig {
  const deploymentId = process.env.DEPLOYMENT_ID || 'ferni-main';
  const deployment = deploymentRegistry.getDeployment(deploymentId);

  return {
    ...baseConfig,
    deployment,
    // Override values from deployment bundle
    personaId: deployment.agents.coordinator.bundleId,
    brandColors: deployment.brand.colors,
    features: deployment.features,
  };
}
```

### 2.2 Persona Loading with Deployment Context

**File**: `src/personas/bundles/loader.ts`

```typescript
// Filter personas by deployment
export async function loadDeploymentPersonas(
  deploymentId: string
): Promise<LoadedPersonaBundle[]> {
  const deployment = await getDeployment(deploymentId);
  const allowedBundles = [
    deployment.agents.coordinator.bundleId,
    ...deployment.agents.specialists.map(s => s.bundleId)
  ];

  // Load only bundles in this deployment
  return loadBundles(allowedBundles);
}

// Apply display name overrides
export function applyDeploymentOverrides(
  bundle: LoadedPersonaBundle,
  deployment: DeploymentBundle
): LoadedPersonaBundle {
  const override = deployment.agents.specialists.find(
    s => s.bundleId === bundle.manifest.id
  );

  if (override?.displayName) {
    bundle.manifest.name = override.displayName;
  }
  if (override?.voiceId) {
    bundle.manifest.voice.voiceId = override.voiceId;
  }

  return bundle;
}
```

### 2.3 Team Configuration from Deployment

**File**: `src/personas/team/team-config.ts`

```typescript
// Generate team config from deployment bundle
export function generateTeamFromDeployment(
  deployment: DeploymentBundle
): TeamConfig {
  return {
    coordinator: {
      personaId: deployment.agents.coordinator.bundleId,
      displayName: deployment.agents.coordinator.displayName,
    },
    members: deployment.agents.specialists.map(spec => ({
      personaId: spec.bundleId,
      displayName: spec.displayName,
      role: spec.role,
      handoffTriggers: spec.handoffTriggers,
    })),
    routingRules: deployment.coordination.routingRules,
    handoffStyle: deployment.coordination.defaultHandoffStyle,
  };
}
```

### 2.4 Feature Flag Integration

**File**: `src/config/feature-flags.ts`

```typescript
// Merge deployment features with base flags
export function getFeatureFlags(deploymentId: string): FeatureFlags {
  const deployment = getDeployment(deploymentId);
  const baseFlags = loadBaseFeatureFlags();

  return {
    ...baseFlags,
    // Deployment overrides
    MUSIC_ENABLED: deployment.features.musicEnabled,
    ENABLE_SPOTIFY: deployment.features.spotifyIntegration,
    ENABLE_CALENDAR: deployment.features.calendarIntegration,
    ENABLE_HABITS: deployment.features.habitTracking,
    ENABLE_TEAM_HANDOFFS: deployment.features.teamHandoffs,
  };
}
```

### 2.5 API Routes for Deployment Info

**File**: `src/api/deployment-routes.ts`

```typescript
// GET /api/deployment/config - Frontend fetches deployment config
router.get('/config', async (req, res) => {
  const deploymentId = req.headers['x-deployment-id'] ||
                       process.env.DEPLOYMENT_ID ||
                       'ferni-main';

  const deployment = await getDeployment(deploymentId);

  // Return frontend-safe config (no secrets)
  res.json({
    id: deployment.id,
    brand: deployment.brand,
    agents: {
      coordinator: deployment.agents.coordinator.displayName,
      specialists: deployment.agents.specialists.map(s => ({
        displayName: s.displayName,
        role: s.role,
      })),
    },
    features: deployment.features,
  });
});

// GET /api/deployment/branding - CSS variables for theming
router.get('/branding', async (req, res) => {
  const deployment = await getCurrentDeployment(req);

  res.type('text/css').send(`
    :root {
      --brand-primary: ${deployment.brand.colors.primary};
      --brand-secondary: ${deployment.brand.colors.secondary};
      --brand-accent: ${deployment.brand.colors.accent};
      --brand-background: ${deployment.brand.colors.background};
      --brand-text: ${deployment.brand.colors.text};
    }
  `);
});
```

### 2.6 Tasks

| Task | Estimate | Dependencies |
|------|----------|--------------|
| Update `environment.ts` for deployment context | 3h | Phase 1 |
| Update persona loader with deployment filtering | 4h | Phase 1 |
| Update team-config.ts to use deployment | 3h | Persona loader |
| Integrate feature flags with deployment | 2h | Phase 1 |
| Create deployment API routes | 3h | Phase 1 |
| Update voice-agent to use deployment context | 4h | All above |
| Write integration tests | 4h | All above |

**Phase 2 Total**: ~23 hours (3-4 days)

---

## Phase 3: Frontend White-Label (Week 2-3)

### 3.1 Create Branding Configuration

**File**: `apps/web/src/config/branding.ts`

```typescript
export interface BrandingConfig {
  appName: string;
  tagline: string;
  coachName: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  features: {
    musicEnabled: boolean;
    teamEnabled: boolean;
    // ... etc
  };
}

let brandingConfig: BrandingConfig | null = null;

export async function loadBranding(): Promise<BrandingConfig> {
  if (brandingConfig) return brandingConfig;

  // Try environment variables first (build-time)
  if (import.meta.env.VITE_APP_NAME) {
    brandingConfig = {
      appName: import.meta.env.VITE_APP_NAME,
      tagline: import.meta.env.VITE_APP_TAGLINE || '',
      coachName: import.meta.env.VITE_COACH_NAME || 'Assistant',
      colors: {
        primary: import.meta.env.VITE_COLOR_PRIMARY || '#4a6741',
        // ... etc
      },
    };
    return brandingConfig;
  }

  // Fetch from API (runtime)
  const response = await fetch('/api/deployment/config');
  const deployment = await response.json();

  brandingConfig = {
    appName: deployment.brand.displayName,
    tagline: deployment.brand.tagline,
    coachName: deployment.agents.coordinator,
    colors: deployment.brand.colors,
    features: deployment.features,
  };

  return brandingConfig;
}

export function getBranding(): BrandingConfig {
  if (!brandingConfig) {
    throw new Error('Branding not loaded. Call loadBranding() first.');
  }
  return brandingConfig;
}
```

### 3.2 Create UI Text Abstraction

**File**: `apps/web/src/config/ui-text.ts`

```typescript
import { getBranding } from './branding.js';

// All user-facing text that mentions the brand
export const UI_TEXT = {
  // App identity
  appTitle: () => getBranding().appName,
  appTagline: () => getBranding().tagline,

  // Coach references
  coachName: () => getBranding().coachName,
  howShouldCoachSound: () => `How should ${getBranding().coachName} sound?`,
  yourJourneyWith: () => `Your journey with ${getBranding().coachName}`,

  // Settings
  settingsTitle: () => `${getBranding().appName} Settings`,
  teamsTitle: () => `${getBranding().appName} for Teams`,

  // Onboarding
  welcomeMessage: () => `Welcome to ${getBranding().appName}`,
  meetYourCoach: () => `Meet ${getBranding().coachName}`,

  // Fallbacks (brand-agnostic)
  connect: 'Connect',
  disconnect: 'Disconnect',
  settings: 'Settings',
  help: 'Help',
};
```

### 3.3 Update HTML Template

**File**: `apps/web/index.html`

```html
<!doctype html>
<html lang="en" data-theme="%VITE_DEFAULT_THEME%">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- Dynamic branding -->
    <title>%VITE_APP_NAME% - %VITE_APP_TAGLINE%</title>
    <meta name="description" content="%VITE_APP_DESCRIPTION%" />
    <meta name="theme-color" content="%VITE_COLOR_PRIMARY%" />
    <meta name="apple-mobile-web-app-title" content="%VITE_APP_NAME%" />

    <!-- Open Graph -->
    <meta property="og:title" content="%VITE_APP_NAME%" />
    <meta property="og:description" content="%VITE_APP_DESCRIPTION%" />
    <meta property="og:image" content="%VITE_OG_IMAGE%" />

    <!-- Dynamic CSS variables (fallback, overridden by API) -->
    <style>
      :root {
        --brand-primary: %VITE_COLOR_PRIMARY%;
        --brand-secondary: %VITE_COLOR_SECONDARY%;
        --brand-accent: %VITE_COLOR_ACCENT%;
      }
    </style>

    <!-- Runtime branding CSS -->
    <link rel="stylesheet" href="/api/deployment/branding" />
  </head>
  <body data-persona="%VITE_DEFAULT_PERSONA%">
    <!-- ... -->
  </body>
</html>
```

### 3.4 Update App Initialization

**File**: `apps/web/src/app.ts`

```typescript
import { loadBranding, getBranding } from './config/branding.js';
import { UI_TEXT } from './config/ui-text.js';

async function initializeApp() {
  // Load branding first
  await loadBranding();
  const branding = getBranding();

  // Update document
  document.title = UI_TEXT.appTitle();
  document.body.setAttribute('data-persona', branding.coachName.toLowerCase());

  // Apply colors to CSS variables
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', branding.colors.primary);
  root.style.setProperty('--brand-secondary', branding.colors.secondary);
  root.style.setProperty('--brand-accent', branding.colors.accent);

  // Initialize rest of app...
}
```

### 3.5 Refactor Hardcoded References

Files to update (47 files with "Ferni" references):

| File | Changes |
|------|---------|
| `src/ui/accent-settings.ui.ts` | Use `UI_TEXT.howShouldCoachSound()` |
| `src/ui/b2b-admin.ui.ts` | Use `UI_TEXT.teamsTitle()` |
| `src/ui/coach.ui.ts` | Use `UI_TEXT.coachName()` |
| `src/ui/connection-heart.ui.ts` | Use `UI_TEXT.yourJourneyWith()` |
| `src/ui/onboarding.ui.ts` | Use `UI_TEXT.welcomeMessage()` |
| `src/ui/dev-panel.ui.ts` | Use `UI_TEXT.coachName()` for buttons |
| `src/config/index.ts` | Dynamic storage keys |
| `src/theme/index.ts` | Remove 'ferni' default |
| ... | ... |

### 3.6 Tasks

| Task | Estimate | Dependencies |
|------|----------|--------------|
| Create `branding.ts` config loader | 3h | Phase 2 API |
| Create `ui-text.ts` abstraction | 2h | Branding |
| Update `index.html` with placeholders | 2h | None |
| Update `app.ts` initialization | 2h | Branding |
| Refactor 47 UI files (batch 1: critical) | 6h | UI text |
| Refactor 47 UI files (batch 2: remaining) | 6h | Batch 1 |
| Update theme system defaults | 2h | Branding |
| Update storage keys to be dynamic | 1h | Branding |
| Write E2E tests for white-label | 4h | All above |

**Phase 3 Total**: ~28 hours (4-5 days)

---

## Phase 4: Deployment Infrastructure (Week 3-4)

### 4.1 Docker Build Variants

**File**: `docker/Dockerfile.agent`

```dockerfile
# Build argument for deployment
ARG DEPLOYMENT_ID=ferni-main

# Environment
ENV DEPLOYMENT_ID=${DEPLOYMENT_ID}
ENV NODE_ENV=production

# Copy deployment config
COPY config/deployments/${DEPLOYMENT_ID}.json /app/config/deployment.json
```

**File**: `cloudbuild.yaml`

```yaml
steps:
  - name: 'gcr.io/kaniko-project/executor:latest'
    args:
      - '--dockerfile=docker/Dockerfile.agent'
      - '--destination=gcr.io/$PROJECT_ID/voice-agent:${_DEPLOYMENT_ID}'
      - '--build-arg=DEPLOYMENT_ID=${_DEPLOYMENT_ID}'
      - '--cache=true'
      - '--cache-ttl=168h'

substitutions:
  _DEPLOYMENT_ID: 'ferni-main'  # Override per deployment
```

### 4.2 Ferni CLI Deployment Commands

**File**: `apps/cli/src/commands/deploy/deploy-bundle.ts`

```typescript
// ferni deploy bundle <deployment-id>
export async function deployBundle(deploymentId: string, options: DeployOptions) {
  // 1. Validate deployment config exists
  const deployment = await loadDeploymentConfig(deploymentId);
  validateDeploymentBundle(deployment);

  // 2. Build Docker image with deployment ID
  await buildDockerImage({
    deploymentId,
    tag: `${deploymentId}:${version}`,
  });

  // 3. Deploy to target (GCE for voice, Cloud Run for UI)
  if (deployment.deployment.environment === 'production') {
    await deployToGCE({
      deploymentId,
      region: deployment.deployment.region,
      minInstances: deployment.deployment.minInstances,
    });
  }

  // 4. Deploy frontend with branding
  await deployFrontend({
    deploymentId,
    customDomain: deployment.deployment.customDomain,
  });

  console.log(`✅ Deployed ${deployment.brand.displayName} (${deploymentId})`);
}
```

### 4.3 Multi-Deployment Routing

**Option A: Subdomain routing**
```
ferni.yourdomain.com     → DEPLOYMENT_ID=ferni-main
acme.yourdomain.com      → DEPLOYMENT_ID=acme-corp
partner.yourdomain.com   → DEPLOYMENT_ID=partner-x
```

**Option B: Path-based routing** (simpler for internal)
```
yourdomain.com/ferni     → DEPLOYMENT_ID=ferni-main
yourdomain.com/acme      → DEPLOYMENT_ID=acme-corp
```

**Option C: Header-based** (API gateway)
```
X-Deployment-ID: acme-corp
```

### 4.4 Environment Variables Template

**File**: `.env.deployment.template`

```bash
# Deployment Identity
DEPLOYMENT_ID=your-deployment-id

# Branding (build-time, for frontend)
VITE_APP_NAME="Your App Name"
VITE_APP_TAGLINE="Your tagline"
VITE_COACH_NAME="Coach Name"
VITE_COLOR_PRIMARY="#0066CC"
VITE_COLOR_SECONDARY="#003366"
VITE_COLOR_ACCENT="#FF6600"
VITE_DEFAULT_PERSONA="your-coordinator"
VITE_DEFAULT_THEME="zen"

# Voice Configuration
COORDINATOR_VOICE_ID="voice-uuid"
SPECIALIST_1_VOICE_ID="voice-uuid"

# Feature Toggles
MUSIC_ENABLED=false
ENABLE_SPOTIFY=false
ENABLE_TEAM_HANDOFFS=true

# Infrastructure
GCP_PROJECT_ID="your-project"
GCP_REGION="us-central1"
CUSTOM_DOMAIN="ai.yourdomain.com"
```

### 4.5 Tasks

| Task | Estimate | Dependencies |
|------|----------|--------------|
| Update Dockerfile for deployment args | 2h | Phase 1 |
| Update cloudbuild.yaml for variants | 2h | Dockerfile |
| Create `ferni deploy bundle` command | 6h | Phase 2-3 |
| Implement subdomain/path routing | 4h | Deploy command |
| Create `.env.deployment.template` | 1h | None |
| Update deploy-gce.ts for multi-deploy | 3h | Deploy command |
| Documentation for deployment process | 2h | All above |

**Phase 4 Total**: ~20 hours (3 days)

---

## Phase 5: Agent Creation Toolkit (Week 4-5)

### 5.1 Agent Bundle Generator CLI

```bash
# Create new agent bundle
ferni agents create my-coach --role coordinator

# Creates:
# src/personas/bundles/my-coach/
# ├── persona.manifest.json  (with prompts to fill)
# ├── identity/
# │   ├── system-prompt.md
# │   └── biography.md
# └── content/behaviors/
#     └── greetings.json
```

**File**: `apps/cli/src/commands/agents/create.ts`

```typescript
export async function createAgent(name: string, options: CreateOptions) {
  const bundlePath = `src/personas/bundles/${name}`;

  // Interactive prompts
  const answers = await inquirer.prompt([
    { name: 'displayName', message: 'Display name:', default: titleCase(name) },
    { name: 'role', message: 'Role:', choices: ['coordinator', 'specialist', 'helper'] },
    { name: 'personality', message: 'Personality trait:', choices: ['warm', 'professional', 'playful'] },
    { name: 'domain', message: 'Primary domain:', choices: ['general', 'finance', 'health', 'productivity'] },
  ]);

  // Generate manifest
  const manifest = generateManifest(name, answers);

  // Create directory structure
  await createBundleStructure(bundlePath, manifest);

  console.log(`✅ Created agent bundle: ${bundlePath}`);
  console.log(`   Next: Edit identity/system-prompt.md to define personality`);
}
```

### 5.2 Deployment Bundle Generator

```bash
# Create new deployment bundle
ferni deployments create acme-corp

# Interactive prompts for:
# - Brand name and colors
# - Coordinator agent selection
# - Specialist agent selection
# - Feature toggles
# - Deployment region
```

### 5.3 Agent Testing Tools

```bash
# Test agent locally
ferni agents test my-coach

# Validates:
# - Manifest schema
# - System prompt quality
# - Voice configuration
# - Handoff triggers
```

### 5.4 Tasks

| Task | Estimate | Dependencies |
|------|----------|--------------|
| Create `ferni agents create` command | 6h | None |
| Create `ferni deployments create` command | 4h | Phase 1 |
| Create `ferni agents test` command | 4h | None |
| Create manifest templates | 2h | Create command |
| Create system prompt templates | 2h | Create command |
| Documentation for agent creation | 3h | All above |

**Phase 5 Total**: ~21 hours (3 days)

---

## Phase 6: Testing & Documentation (Week 5-6)

### 6.1 Test Coverage

| Test Type | Scope | Estimate |
|-----------|-------|----------|
| Unit tests | Deployment registry, config loading | 4h |
| Integration tests | Backend deployment context | 6h |
| E2E tests | Full white-label deployment | 8h |
| Visual regression | UI with different brandings | 4h |

### 6.2 Documentation

| Document | Purpose | Estimate |
|----------|---------|----------|
| `docs/WHITE-LABEL-GUIDE.md` | End-to-end setup guide | 4h |
| `docs/AGENT-CREATION-GUIDE.md` | How to create custom agents | 3h |
| `docs/DEPLOYMENT-BUNDLE-GUIDE.md` | How to configure deployments | 3h |
| API documentation | Deployment endpoints | 2h |

### 6.3 Tasks

| Task | Estimate | Dependencies |
|------|----------|--------------|
| Unit tests for deployment system | 4h | Phase 1-2 |
| Integration tests | 6h | Phase 2-3 |
| E2E tests for white-label | 8h | Phase 3-4 |
| Visual regression tests | 4h | Phase 3 |
| White-label setup guide | 4h | All phases |
| Agent creation guide | 3h | Phase 5 |
| Deployment bundle guide | 3h | Phase 4-5 |
| API documentation | 2h | Phase 2 |

**Phase 6 Total**: ~34 hours (5 days)

---

## Summary Timeline

| Phase | Focus | Duration | Dependencies |
|-------|-------|----------|--------------|
| **Phase 1** | Deployment Bundle Schema | 2 days | None |
| **Phase 2** | Backend Integration | 3-4 days | Phase 1 |
| **Phase 3** | Frontend White-Label | 4-5 days | Phase 2 |
| **Phase 4** | Deployment Infrastructure | 3 days | Phase 1-3 |
| **Phase 5** | Agent Creation Toolkit | 3 days | Phase 1 |
| **Phase 6** | Testing & Documentation | 5 days | All |

**Total Estimate**: ~139 hours (~4-5 weeks at full capacity)

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing Ferni deployment | High | Phase 1 creates Ferni as default deployment, backward compatible |
| Frontend refactor breaks UI | Medium | Visual regression tests, feature flags for gradual rollout |
| Voice agent performance regression | High | Load testing before launch, monitoring dashboards |
| Complex debugging across deployments | Medium | Centralized logging with deployment_id tag |

---

## Success Criteria

- [ ] Ferni continues to work exactly as before (default deployment)
- [ ] Can create new deployment bundle in < 30 minutes
- [ ] Can deploy white-labeled instance with zero Ferni references
- [ ] Custom agents can be created using CLI toolkit
- [ ] All tests pass (unit, integration, E2E)
- [ ] Documentation complete for self-service setup

---

## Quick Start (After Implementation)

```bash
# 1. Create a new deployment
ferni deployments create my-company

# 2. Create custom agents (or use existing)
ferni agents create my-coach --role coordinator
ferni agents create my-specialist --role specialist

# 3. Configure deployment bundle
# Edit config/deployments/my-company.json

# 4. Deploy
ferni deploy bundle my-company

# 5. Access at configured domain
open https://my-company.yourdomain.com
```
