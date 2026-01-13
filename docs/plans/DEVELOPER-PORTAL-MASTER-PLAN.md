# Developer Portal & Blog Master Plan

## Executive Summary

Transform **developers.ferni.ai** from a basic documentation site into a **best-in-class developer platform** with:
- Comprehensive API documentation for all v2 Developer Platform APIs
- A dedicated **Developer Blog** leveraging existing Ferni blog infrastructure
- Interactive API explorer and code playground
- OpenAPI specification with auto-generated SDKs

---

## Current State Analysis

### What Exists

| Component | Status | Notes |
|-----------|--------|-------|
| **Ferni Blog** | ✅ Mature | Eleventy-based, Markdown posts, syntax highlighting, responsive |
| **Developer Portal** | ⚠️ Outdated | Basic static pages, focuses on bundle system, missing v2 APIs |
| **v2 APIs** | ✅ Complete | MCP Servers, Tools, Webhooks, Activities, Workflows, OAuth |
| **API Reference** | ❌ Missing | No OpenAPI spec, no auto-generated docs |

### Gap Analysis

| Gap | Impact | Priority |
|-----|--------|----------|
| No v2 API documentation | Developers can't discover capabilities | **CRITICAL** |
| No developer blog | No changelog, tutorials, announcements | **HIGH** |
| No OpenAPI spec | No SDK generation, no Swagger UI | **HIGH** |
| No code playground | Can't test APIs without setup | **MEDIUM** |
| No authentication guide | Confusing onboarding | **HIGH** |
| Outdated getting started | Wrong instructions | **CRITICAL** |

---

## Master Plan: 6 Phases

### Phase 1: Developer Blog Infrastructure (Day 1)
**Leverage existing Ferni blog**

Create a separate developer blog collection in Eleventy:

```
apps/website/ferni-website/src/
├── blog/              # Existing Ferni blog (consumer-facing)
│   ├── blog.json
│   └── *.md
├── dev-blog/          # NEW: Developer blog
│   ├── dev-blog.json  # Layout, permalink config
│   └── *.md           # Developer-focused posts
└── _includes/layouts/
    └── dev-blog-post.njk  # Developer blog layout
```

**Deliverables:**
- `dev-blog.json` - Collection config with `/developers/blog/` permalink
- `dev-blog-post.njk` - Developer-themed layout (code-focused, dark mode support)
- Initial blog posts:
  1. "Introducing the Ferni Developer Platform"
  2. "Getting Started with MCP Server Integration"
  3. "Building Custom Tools for Voice Agents"
  4. "Webhook Events Reference"

---

### Phase 2: API Documentation Overhaul (Day 1-2)
**Complete rewrite of developer docs**

```
apps/website/ferni-website/src/developers/
├── index.njk              # Hero + overview
├── getting-started.md     # REWRITE - v2 auth, first API call
├── authentication.md      # NEW - Firebase, API keys, OAuth
├── api/
│   ├── index.njk          # API reference landing
│   ├── mcp-servers.md     # MCP Server API
│   ├── tools.md           # Custom Tools API
│   ├── webhooks.md        # Webhooks API
│   ├── activities.md      # Activities API
│   ├── workflows.md       # Workflows API
│   └── oauth.md           # OAuth API
├── guides/
│   ├── first-agent.md     # End-to-end tutorial
│   ├── mcp-integration.md # Deep dive on MCP
│   ├── webhook-security.md # HMAC verification
│   └── workflow-patterns.md # Common workflow recipes
├── sdks/
│   ├── typescript.md      # TypeScript SDK docs
│   └── python.md          # Python SDK docs
└── blog/                  # Developer blog posts
```

**API Documentation Format:**
```markdown
# MCP Servers API

Register external MCP servers to extend your voice agents with custom tools.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/v2/developers/mcp-servers | Register a server |
| GET | /api/v2/developers/mcp-servers | List your servers |
| GET | /api/v2/developers/mcp-servers/:id | Get server details |
| PUT | /api/v2/developers/mcp-servers/:id | Update server |
| DELETE | /api/v2/developers/mcp-servers/:id | Delete server |
| POST | /api/v2/developers/mcp-servers/:id/test | Test connection |

## Register a Server

\`\`\`bash
curl -X POST https://api.ferni.ai/api/v2/developers/mcp-servers \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-crm-tools",
    "description": "CRM integration tools",
    "transport": "http",
    "endpoint": "https://my-mcp-server.example.com",
    "autoConnect": true
  }'
\`\`\`

## Response

\`\`\`json
{
  "success": true,
  "data": {
    "id": "mcp_lqx7abc_k3m9",
    "name": "my-crm-tools",
    "status": "active",
    "toolCount": 5
  }
}
\`\`\`
```

---

### Phase 3: OpenAPI Specification (Day 2)
**Auto-generate documentation**

Create OpenAPI 3.1 spec for all v2 endpoints:

```yaml
# src/api/v2/developers/openapi.yaml
openapi: 3.1.0
info:
  title: Ferni Developer Platform API
  version: 2.0.0
  description: Build AI voice agents with custom tools, MCP servers, and workflows

servers:
  - url: https://api.ferni.ai/api/v2
    description: Production

paths:
  /developers/mcp-servers:
    post:
      summary: Register MCP Server
      operationId: createMCPServer
      tags: [MCP Servers]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateMCPServerInput'
      responses:
        '201':
          description: Server created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/MCPServerResponse'
```

**Deliverables:**
- Complete OpenAPI 3.1 spec covering all 40+ endpoints
- Swagger UI at `/developers/api-explorer/`
- Auto-generated TypeScript types
- Redoc static documentation

---

### Phase 4: Interactive API Explorer (Day 2-3)
**Try APIs directly in browser**

Features:
- Swagger UI integration
- "Try it" buttons for each endpoint
- Authentication helper (enter API key, auto-attach to requests)
- Response visualization
- Copy as cURL / fetch / SDK code

```html
<!-- API Explorer page -->
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
<script>
  SwaggerUIBundle({
    url: '/api/v2/developers/openapi.yaml',
    dom_id: '#swagger-ui',
    presets: [SwaggerUIBundle.presets.apis],
  });
</script>
```

---

### Phase 5: SDK Generation & Documentation (Day 3)
**TypeScript and Python SDKs**

Auto-generate from OpenAPI spec:

```bash
# TypeScript SDK
npx openapi-typescript-codegen \
  --input openapi.yaml \
  --output packages/sdk-typescript \
  --client fetch

# Python SDK
openapi-python-client generate \
  --path openapi.yaml \
  --output-path packages/sdk-python
```

**SDK Usage Example:**
```typescript
import { FerniClient } from '@ferni/sdk';

const client = new FerniClient({
  apiKey: 'pk_live_xxx',
});

// Register MCP server
const server = await client.mcpServers.create({
  name: 'my-tools',
  transport: 'http',
  endpoint: 'https://my-server.com',
});

// Test connection
const result = await client.mcpServers.test(server.id);
console.log('Tools discovered:', result.tools);
```

---

### Phase 6: Polish & Launch (Day 3-4)

**Developer Experience Improvements:**

1. **Search** - Algolia DocSearch integration
2. **Dark Mode** - Developer-preferred theme
3. **Changelog** - Automated from GitHub releases
4. **Status Page** - API health dashboard
5. **Rate Limit Dashboard** - Show current usage
6. **Code Samples** - Multiple languages per endpoint

**SEO & Discoverability:**
- Structured data for API documentation
- sitemap.xml for all developer pages
- Meta descriptions for each endpoint

---

## File Structure (Final)

```
apps/website/ferni-website/src/
├── developers/
│   ├── index.njk                    # Landing page
│   ├── getting-started.md           # Quick start guide
│   ├── authentication.md            # Auth methods
│   ├── api/
│   │   ├── index.njk                # API reference index
│   │   ├── mcp-servers.md           # MCP Servers API
│   │   ├── tools.md                 # Custom Tools API
│   │   ├── webhooks.md              # Webhooks API
│   │   ├── activities.md            # Activities API
│   │   ├── workflows.md             # Workflows API
│   │   └── oauth.md                 # OAuth API
│   ├── guides/
│   │   ├── first-agent.md           # Tutorial
│   │   ├── mcp-integration.md       # MCP deep dive
│   │   ├── webhook-security.md      # HMAC guide
│   │   └── workflow-patterns.md     # Recipes
│   ├── sdks/
│   │   ├── index.njk                # SDK overview
│   │   ├── typescript.md            # TS SDK
│   │   └── python.md                # Python SDK
│   └── api-explorer/
│       └── index.njk                # Swagger UI
├── dev-blog/
│   ├── dev-blog.json                # Collection config
│   ├── introducing-developer-platform.md
│   ├── mcp-server-integration.md
│   ├── custom-tools-guide.md
│   ├── webhook-events-reference.md
│   └── workflow-engine-launch.md
└── _includes/layouts/
    ├── docs.njk                     # Documentation layout
    └── dev-blog-post.njk            # Dev blog layout
```

---

## Developer Blog Posts (Initial)

### 1. "Introducing the Ferni Developer Platform"
- What is the Developer Platform
- Overview of capabilities (MCP, Tools, Webhooks, Workflows, OAuth)
- Vision: extend voice agents with any service

### 2. "Building Your First MCP Integration"
- What is MCP (Model Context Protocol)
- Register a server via API
- Test connection and discover tools
- Use tools in voice conversations

### 3. "Custom Tools: Webhook, MCP, or Prompt"
- Three tool execution types explained
- When to use each
- Complete examples

### 4. "Webhook Security Best Practices"
- HMAC-SHA256 signing explained
- Verifying signatures in Node.js/Python
- Handling retries
- Idempotency patterns

### 5. "Workflow Engine: Building Multi-Step Automations"
- DAG workflow concepts
- Trigger types (voice, schedule, event)
- Condition nodes and parallel execution
- Real-world example: Daily standup automation

### 6. "OAuth Integration for External Services"
- BYOC (Bring Your Own Credentials) pattern
- Register OAuth providers
- Token storage and refresh
- Example: Google Calendar integration

---

## Design Guidelines

### Color Palette (Developer Theme)
```css
:root {
  --dev-bg: #0f172a;           /* Dark navy background */
  --dev-surface: #1e293b;      /* Card surface */
  --dev-accent: #38bdf8;       /* Cyan accent */
  --dev-success: #4ade80;      /* Green for success */
  --dev-warning: #fbbf24;      /* Yellow for warnings */
  --dev-error: #f87171;        /* Red for errors */
  --dev-code-bg: #1e1e2e;      /* Code block background */
}
```

### Typography
- Code: `JetBrains Mono` or `Fira Code`
- Headings: `Plus Jakarta Sans` (consistent with Ferni)
- Body: `Inter` (consistent with Ferni)

### Code Block Style
- Syntax highlighting with Prism.js
- Line numbers for long blocks
- Copy button on hover
- Language badge in corner

---

## Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| Phase 1: Blog Infrastructure | 4 hours | dev-blog collection, layout, 2 initial posts |
| Phase 2: API Docs Overhaul | 8 hours | All API reference pages, guides |
| Phase 3: OpenAPI Spec | 4 hours | Complete spec, Swagger UI |
| Phase 4: API Explorer | 4 hours | Interactive try-it page |
| Phase 5: SDKs | 6 hours | TypeScript + Python SDKs |
| Phase 6: Polish | 4 hours | Search, dark mode, changelog |
| **Total** | **30 hours** | Best-in-class developer portal |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first API call | < 10 minutes | Onboarding tracking |
| API documentation coverage | 100% | Automated check |
| Developer satisfaction | > 4.5/5 | Feedback survey |
| Blog posts per month | 2+ | Content calendar |
| SDK downloads | 100+ in first month | npm/PyPI stats |

---

## Next Steps

1. **Approve this plan** - Review and confirm scope
2. **Start Phase 1** - Set up dev-blog infrastructure
3. **Parallel: Phase 2** - Begin API documentation rewrite
4. **Generate OpenAPI spec** - Enable SDK generation
5. **Launch MVP** - Ship initial developer portal refresh
6. **Iterate** - Add features based on developer feedback

---

## Appendix: API Endpoint Summary

### MCP Servers (`/api/v2/developers/mcp-servers`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create MCP server |
| GET | `/` | List servers |
| GET | `/:id` | Get server |
| PUT | `/:id` | Update server |
| DELETE | `/:id` | Delete server |
| POST | `/:id/test` | Test connection |
| GET | `/:id/tools` | List discovered tools |

### Custom Tools (`/api/v2/developers/tools`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create tool |
| GET | `/` | List tools |
| GET | `/:id` | Get tool |
| PUT | `/:id` | Update tool |
| DELETE | `/:id` | Delete tool |
| POST | `/:id/test` | Test execution |

### Webhooks (`/api/v2/developers/webhooks`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create webhook |
| GET | `/` | List webhooks |
| GET | `/:id` | Get webhook |
| PUT | `/:id` | Update webhook |
| DELETE | `/:id` | Delete webhook |
| POST | `/:id/test` | Send test event |
| GET | `/:id/logs` | Get delivery logs |

### Activities (`/api/v2/developers/activities`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Log activity |
| GET | `/` | Query activities |
| GET | `/stats` | Get statistics |
| GET | `/:id` | Get activity |
| PUT | `/:id` | Update activity |
| DELETE | `/:id` | Delete activity |

### Workflows (`/api/v2/developers/workflows`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create workflow |
| GET | `/` | List workflows |
| GET | `/:id` | Get workflow |
| PUT | `/:id` | Update workflow |
| DELETE | `/:id` | Delete workflow |
| POST | `/:id/execute` | Execute workflow |
| POST | `/:id/test` | Test workflow |
| GET | `/:id/executions` | List executions |

### OAuth (`/api/v2/developers/oauth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/providers` | Register provider |
| GET | `/providers` | List providers |
| GET | `/providers/:id` | Get provider |
| PUT | `/providers/:id` | Update provider |
| DELETE | `/providers/:id` | Delete provider |
| POST | `/authorize` | Start OAuth flow |
| GET | `/callback` | OAuth callback |
| GET | `/tokens` | List tokens |
| DELETE | `/tokens/:id` | Revoke token |
