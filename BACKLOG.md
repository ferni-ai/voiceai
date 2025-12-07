# 📋 Ferni AI Backlog

Product backlog and roadmap for Ferni AI development.

**Last Updated**: December 2024

---

## 🎯 Current Sprint Focus

### In Progress
- [ ] API Security Audit - Authentication middleware integration
- [ ] Documentation overhaul - README, guides, API reference

### Up Next
- [ ] Vector store integration for semantic memory
- [ ] Mobile app polish (iOS/Android)
- [ ] Voice presence auto-tuning

---

## 🚀 Feature Backlog

### P0 - Critical / Active Development

| Feature | Status | Owner | Notes |
|---------|--------|-------|-------|
| API Authentication | 🟡 In Progress | - | JWT + API keys for all routes |
| Voice Agent Stability | ✅ Done | - | Handoff reliability at 95%+ |
| Team Unlock System | ✅ Done | - | Relationship-based unlocking |
| Subscription Integration | ✅ Done | - | Stripe billing working |

### P1 - High Priority

| Feature | Status | Notes |
|---------|--------|-------|
| **Semantic Memory (Vector Store)** | 📋 Planned | Pinecone/Weaviate integration for better recall |
| **Proactive Notifications** | 📋 Planned | Push notifications for habits, milestones |
| **Calendar Integration** | 🟡 Partial | Google Calendar OAuth, need sync |
| **Voice Identification** | 📋 Planned | Multi-user household support |
| **Offline Mode** | 📋 Planned | Basic functionality without network |

### P2 - Medium Priority

| Feature | Status | Notes |
|---------|--------|-------|
| **Multi-language Support** | 📋 Planned | Spanish, Portuguese priority |
| **Custom Personas** | 📋 Planned | User-created agent personalities |
| **Team Sharing** | 📋 Planned | Share progress with accountability partners |
| **Data Export** | 🟡 Partial | GDPR compliance, PDF reports |
| **Analytics Dashboard** | 📋 Planned | User-facing insights |

### P3 - Nice to Have

| Feature | Status | Notes |
|---------|--------|-------|
| Apple Watch App | 📋 Planned | Quick check-ins |
| Smart Home Integration | 📋 Planned | Alexa/Google Home |
| Widget Support | 📋 Planned | iOS/Android widgets |
| Ambient Mode | 📋 Planned | Always-listening background |

---

## 🐛 Known Issues / Tech Debt

### High Priority
- [ ] Large files need splitting (see MIGRATION-TODOS.md)
- [ ] Test coverage gaps in handoff system
- [ ] Memory cleanup on long sessions
- [ ] Rate limiting not fully implemented

### Medium Priority
- [ ] Inconsistent error messages across API
- [ ] Some tools lack proper validation
- [ ] Deprecated tool patterns still in use
- [ ] CSS not fully using design tokens

### Low Priority
- [ ] Console.log statements in some files (use createLogger)
- [ ] Missing JSDoc on some public functions
- [ ] Test helpers could be consolidated
- [ ] Old migration files to clean up

---

## 🏗️ Technical Initiatives

### Infrastructure
- [ ] **Kubernetes Migration** - Move from Cloud Run for better scaling
- [ ] **Multi-region Deployment** - Reduce latency globally
- [ ] **Cost Optimization** - LLM call caching, smarter tool selection

### Performance
- [ ] **Response Latency** - Target < 150ms (currently ~200ms)
- [ ] **Memory Usage** - Reduce per-session footprint
- [ ] **Cold Start** - Faster agent initialization

### Developer Experience
- [ ] **CLI Improvements** - Better agent management tools
- [ ] **Local Firestore** - Full emulator support
- [ ] **E2E Test Suite** - Playwright coverage

---

## 📊 Metrics Targets

| Metric | Current | Target | Notes |
|--------|---------|--------|-------|
| Voice Response Latency | ~200ms | <150ms | Context builder optimization |
| Handoff Success Rate | 95% | 99% | Better error recovery |
| Test Coverage | 60% | 80% | Focus on critical paths |
| User Retention (D7) | TBD | 40% | Improve onboarding |
| NPS Score | TBD | 50+ | Track after launch |

---

## 🗓️ Roadmap

### Q1 2025
- Vector store integration
- Push notifications
- Mobile app polish
- Public beta launch

### Q2 2025
- Multi-language support
- Custom personas
- Team sharing
- Analytics dashboard

### Q3 2025
- Apple Watch app
- Smart home integration
- Enterprise features
- API marketplace

### Q4 2025
- International expansion
- Advanced AI features
- Partner integrations
- Scale infrastructure

---

## 📝 How to Add Items

### Features
1. Add to appropriate priority section
2. Include status, owner (if assigned), notes
3. Link to GitHub issue if exists

### Bugs
1. Add to Known Issues section
2. Categorize by priority
3. Include reproduction steps in linked issue

### Tech Debt
1. Add to Tech Debt section
2. Explain impact and effort
3. Link to relevant code/files

---

## Status Legend

| Status | Meaning |
|--------|---------|
| ✅ Done | Completed and deployed |
| 🟡 In Progress | Currently being worked on |
| 📋 Planned | Scheduled for future sprint |
| 🔴 Blocked | Waiting on dependency |
| ❌ Cancelled | No longer pursuing |

---

## Related Documents

- [MIGRATION-TODOS.md](docs/MIGRATION-TODOS.md) - Architecture migration status
- [CONTRIBUTING.md](CONTRIBUTING.md) - How to contribute
- [docs/features/](docs/features/) - Feature specifications
- [docs/architecture/](docs/architecture/) - Architecture decisions

