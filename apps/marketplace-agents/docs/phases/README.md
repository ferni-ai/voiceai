# Custom Tools Implementation Roadmap

> **Total Timeline:** 10-14 weeks  
> **Total Effort:** ~380 engineering hours

## Overview

This roadmap describes how to enable marketplace agents to define and use custom tools—from read-only data fetching to executing trades with user confirmation.

## Phase Summary

| Phase | Timeline | Risk | Key Deliverables |
|-------|----------|------|------------------|
| **[Phase 0](./PHASE-0-FOUNDATION.md)** | 1 week | Low | Schemas, types, validation, security model |
| **[Phase 1](./PHASE-1-READ-ONLY-TOOLS.md)** | 2-3 weeks | Low | Read-only tools, rate limiting, audit logs |
| **[Phase 2](./PHASE-2-WRITE-TOOLS-WITH-CONFIRMATION.md)** | 3-4 weeks | Medium | Voice confirmation, permissions, API keys |
| **[Phase 3](./PHASE-3-FULL-INTEGRATION-SYSTEM.md)** | 4-6 weeks | High | OAuth, UI, adapter framework |

---

## Visual Roadmap

```
Week  1   2   3   4   5   6   7   8   9  10  11  12  13  14
      ├───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
      │ P0│     Phase 1     │      Phase 2       │    Phase 3      │
      │ ██│█████████████████│████████████████████│█████████████████│
      │   │                 │                    │                 │
      │   │ ✓ Tool schemas  │ ✓ Confirmation     │ ✓ OAuth flows   │
      │   │ ✓ Validation    │ ✓ Permissions      │ ✓ Settings UI   │
      │   │ ✓ Read-only     │ ✓ API keys         │ ✓ Adapters      │
      │   │ ✓ Rate limits   │ ✓ Risk controls    │ ✓ Multi-provider│
      └───┴─────────────────┴────────────────────┴─────────────────┘
```

---

## Capability Matrix

| Capability | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|------------|:-------:|:-------:|:-------:|:-------:|
| Tool schema validation | ✓ | ✓ | ✓ | ✓ |
| Load tools from bundles | | ✓ | ✓ | ✓ |
| Execute HTTP requests | | ✓ | ✓ | ✓ |
| Rate limiting | | ✓ | ✓ | ✓ |
| Audit logging | | ✓ | ✓ | ✓ |
| Voice confirmation | | | ✓ | ✓ |
| Permission checking | | | ✓ | ✓ |
| API key storage | | | ✓ | ✓ |
| Risk controls | | | ✓ | ✓ |
| OAuth 2.0 flows | | | | ✓ |
| Token refresh | | | | ✓ |
| Integration UI | | | | ✓ |
| Multiple providers | | | | ✓ |

---

## Example Use Cases by Phase

### After Phase 1: Read-Only Tools

```
User: "What's Apple trading at?"
Agent: [calls get-stock-quote tool]
Agent: "Apple is currently trading at $189.47, up 1.2% today."
```

### After Phase 2: Trading with Confirmation

```
User: "Buy 50 shares of Apple"
Agent: "I can place that order for you."
       [calls place-trade tool]
       
Platform: "Just to confirm: I'm about to buy 50 shares of Apple 
           at the current market price. Say 'yes' to proceed."
           
User: "Yes"

Agent: "Done! I've placed a market order for 50 shares of AAPL.
        Order filled at $189.52."
```

### After Phase 3: Full Integration Flow

```
User: "Connect my Schwab account"
Agent: "I'll help you connect Schwab. Opening the authorization page now."
       [redirects to Schwab OAuth]
       
[User authorizes in Schwab]

Agent: "Great, your Schwab account is now connected! I can see you have
        $45,000 in buying power. Would you like me to review your positions?"
```

---

## Key Architecture Decisions

### 1. Tool Definitions: In Bundle vs Platform

**Decision:** Tools are defined in agent bundles as JSON schemas.

**Rationale:**
- Agent creators have full control
- No platform changes needed for new tools
- Easy to version and distribute
- Platform validates and enforces security

### 2. Credential Storage: Cloud KMS

**Decision:** All secrets encrypted with Google Cloud KMS.

**Rationale:**
- Hardware-backed security
- Key rotation handled by GCP
- Audit logging built-in
- Compliant with SOC2, etc.

### 3. Confirmation: Voice-First

**Decision:** High-risk actions use voice confirmation.

**Rationale:**
- Natural for voice-first product
- Harder to accidentally confirm
- Can fallback to UI
- Fits existing agent conversation flow

### 4. Adapters: Platform-Managed

**Decision:** Integration adapters are part of platform, not bundles.

**Rationale:**
- Security: credentials never exposed to bundles
- Quality: platform team reviews all adapters
- Maintenance: centralized updates
- Future: could open to verified contributors

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| OAuth provider changes API | Medium | Medium | Abstract behind adapter layer |
| Token refresh fails silently | Medium | High | Health checks, alerting |
| User executes unintended trade | Low | Critical | Confirmation + risk controls |
| Credential leak | Very Low | Critical | KMS encryption, audit logs |
| Rate limit abuse | Medium | Low | Per-user, per-tool limits |

---

## Success Metrics

### Phase 1
- [ ] 5+ agents using custom tools
- [ ] <200ms p95 tool execution time
- [ ] 0 validation errors in production

### Phase 2
- [ ] 100+ successful confirmed transactions
- [ ] <5% confirmation timeout rate
- [ ] 0 unauthorized tool executions

### Phase 3
- [ ] 1000+ OAuth connections
- [ ] 3+ broker integrations
- [ ] <1% token refresh failures
- [ ] 4.5+ star user satisfaction for integration UX

---

## Team Resources

| Role | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|------|---------|---------|---------|---------|
| Backend Engineer | 0.5 | 1 | 1.5 | 2 |
| Frontend Engineer | 0 | 0 | 0.5 | 1 |
| Security Review | 0.25 | 0.25 | 0.5 | 0.5 |
| QA | 0 | 0.5 | 1 | 1 |

---

## Getting Started

1. **Read Phase 0** — Understand the foundation
2. **Review schemas** — Familiarize with tool manifest format
3. **Set up dev environment** — Firebase emulator, test API keys
4. **Start with Phase 1** — Build the simplest working version

---

## Questions?

Reach out to the platform team or open an issue with the `custom-tools` label.

