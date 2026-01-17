# Ferni Developers Blog: Content Calendar Template

> **Purpose:** Track, plan, and coordinate 365 days of developer content.

---

## Quick Links

| Resource | Location |
|----------|----------|
| Blog Posts | `apps/website/ferni-website/src/dev-blog/` |
| Images | `apps/website/ferni-website/images/dev-blog/` |
| Social Snippets | `apps/website/ferni-website/social-snippets/` |
| Newsletters | `apps/website/ferni-website/newsletters/` |
| Strategy Doc | `brand/docs/DEVELOPER-BLOG-365-PLAN.md` |

---

## Weekly Publishing Schedule

| Day | Content Type | Primary Audience | Publish Time |
|-----|--------------|------------------|--------------|
| **Monday** | Tutorial | Beginners | 9:00 AM PT |
| **Tuesday** | Deep Dive | Advanced | 9:00 AM PT |
| **Wednesday** | Changelog | All | Auto on release |
| **Thursday** | Case Study / Community | Decision Makers | 9:00 AM PT |
| **Friday** | Quick Tips | All | 9:00 AM PT |
| **Saturday** | Industry Insights | Thought Leadership | 10:00 AM PT |
| **Sunday** | Week Ahead Preview | Engaged Users | 12:00 PM PT |

---

## Monthly Themes

| Month | Theme | Color Accent | Key Content |
|-------|-------|--------------|-------------|
| January | New Beginnings | Cyan | Getting Started, Platform Intro |
| February | Connection | Pink | Voice + Relationships |
| March | Spring Cleaning | Green | Code Quality, Refactoring |
| April | Testing | Blue | Testing Strategies |
| May | Performance | Yellow | Optimization Week |
| June | Mid-Year | Purple | Review, Roadmap |
| July | Hackathon | Orange | Build Challenges |
| August | Basics | Teal | Back to Fundamentals |
| September | Enterprise | Navy | Enterprise Features |
| October | Debugging | Orange | Debugging Horror Stories |
| November | Gratitude | Amber | Community Highlights |
| December | Review | Gold | Year in Review |

---

## Content Tracking Template

Copy this template for each week:

### Week [N]: [Theme]
**Date Range:** YYYY-MM-DD to YYYY-MM-DD

| Day | Title | Category | Status | Author | Notes |
|-----|-------|----------|--------|--------|-------|
| Mon | | Tutorial | ⬜ Draft | | |
| Tue | | Deep Dive | ⬜ Draft | | |
| Wed | | Changelog | 🤖 Auto | Bot | |
| Thu | | Community | ⬜ Draft | | |
| Fri | | Quick Tips | ⬜ Draft | | |
| Sat | | Industry | ⬜ Draft | | |
| Sun | | Preview | ⬜ Draft | | |

**Status Legend:**
- ⬜ Draft - Not started
- 📝 Writing - In progress
- 👀 Review - Ready for review
- ✅ Published - Live
- 🤖 Auto - Automated

---

## Week 1: Platform Foundations
**Date Range:** 2026-01-06 to 2026-01-12

| Day | Title | Category | Status | Author |
|-----|-------|----------|--------|--------|
| Mon | Getting Started with Ferni in 5 Minutes | Tutorial | ✅ Published | Dev Team |
| Tue | Introducing the Ferni Developer Platform | Announcements | ✅ Published | Dev Team |
| Wed | Changelog (auto) | Changelog | 🤖 Auto | Bot |
| Thu | Building Your First MCP Integration | Tutorial | ✅ Published | Dev Team |
| Fri | 5 Code Snippets Every Ferni Developer Needs | Quick Tips | ✅ Published | Dev Team |
| Sat | The Future of Voice AI Interfaces | Industry | ✅ Published | Dev Team |
| Sun | Week 2 Preview | Roadmap | ✅ Published | Dev Team |

---

## Week 2: Security & Performance
**Date Range:** 2026-01-13 to 2026-01-19

| Day | Title | Category | Status | Author |
|-----|-------|----------|--------|--------|
| Mon | Authentication Deep Dive | Deep Dive | ✅ Published | Dev Team |
| Tue | Performance Optimization | Deep Dive | ✅ Published | Dev Team |
| Wed | Changelog (auto) | Changelog | 🤖 Auto | Bot |
| Thu | Community Spotlight: MindfulMoments | Community | ✅ Published | Dev Team |
| Fri | Error Handling Patterns | Quick Tips | ✅ Published | Dev Team |
| Sat | Voice AI vs Chatbots | Industry | ✅ Published | Dev Team |
| Sun | Week 3 Preview | Roadmap | ✅ Published | Dev Team |

---

## Week 3: Testing & Deployment
**Date Range:** 2026-01-20 to 2026-01-26

| Day | Title | Category | Status | Author |
|-----|-------|----------|--------|--------|
| Mon | Unit Testing Voice Agents | Tutorial | ⬜ Draft | |
| Tue | Integration Testing with Mock Voices | Tutorial | ⬜ Draft | |
| Wed | Changelog (auto) | Changelog | 🤖 Auto | Bot |
| Thu | E2E Testing Voice Flows | Tutorial | ⬜ Draft | |
| Fri | Debugging Voice AI | Quick Tips | ⬜ Draft | |
| Sat | Testing Best Practices | Industry | ⬜ Draft | |
| Sun | Week 4 Preview | Roadmap | ⬜ Draft | |

---

## Week 4: Production Readiness
**Date Range:** 2026-01-27 to 2026-02-02

| Day | Title | Category | Status | Author |
|-----|-------|----------|--------|--------|
| Mon | Deploying to Production: Checklist | Tutorial | ⬜ Draft | |
| Tue | Monitoring & Observability | Deep Dive | ⬜ Draft | |
| Wed | Changelog (auto) | Changelog | 🤖 Auto | Bot |
| Thu | Scaling to 1M Conversations | Deep Dive | ⬜ Draft | |
| Fri | Production Debugging Tips | Quick Tips | ⬜ Draft | |
| Sat | Developer Spotlight | Community | ⬜ Draft | |
| Sun | Month 1 Recap | Roadmap | ⬜ Draft | |

---

## Content Ideas Backlog

### Tutorials (High Priority)
- [ ] Building a Customer Support Bot
- [ ] Slack Bot with Voice AI
- [ ] Salesforce Integration
- [ ] Building Multi-Language Support
- [ ] Voice AI for E-commerce
- [ ] Healthcare Voice AI (HIPAA considerations)

### Deep Dives (Technical)
- [ ] Architecture of Real-Time Voice
- [ ] How Emotion Detection Works
- [ ] Building Custom Personas
- [ ] WebRTC Deep Dive
- [ ] Context Window Optimization

### Community
- [ ] Partner spotlight series
- [ ] Open source contributors
- [ ] Hackathon winners
- [ ] User interviews

### Quick Tips Series
- [ ] Debugging tips
- [ ] Performance tips
- [ ] Security tips
- [ ] Testing tips
- [ ] Deployment tips

---

## Guest Author Pipeline

| Author | Company | Topic | Status | ETA |
|--------|---------|-------|--------|-----|
| | | | | |

---

## Metrics to Track

| Metric | Target (Month 1) | Target (Month 6) |
|--------|------------------|------------------|
| Posts published | 28 | 180 |
| Unique visitors | 1,000 | 50,000 |
| Avg. time on page | 2 min | 4 min |
| Newsletter subscribers | 100 | 5,000 |
| Discord members | 50 | 500 |

---

## Automation Scripts

```bash
# Generate changelog post from release
pnpm devblog:changelog --version v1.2.3

# Generate OG images for all posts
pnpm devblog:images:batch

# Generate weekly newsletter
node scripts/generate-weekly-digest.js

# Generate social media snippets
node scripts/generate-social-snippets.js --recent
```

---

## Review Checklist

Before publishing each post:

- [ ] Title < 60 characters
- [ ] Excerpt 150-160 characters
- [ ] OG image generated
- [ ] Internal links to related posts
- [ ] Code examples tested
- [ ] Proofread for typos
- [ ] Social snippets generated
- [ ] Newsletter scheduled (if Friday)

---

*Last updated: January 2026*
