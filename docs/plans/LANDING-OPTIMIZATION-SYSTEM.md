# 🧠 Landing Optimization System

> **Ferni's Team Automatically Optimizes the Landing Page**

## Overview

The Landing Optimization System is an AI-powered automation that uses Ferni's team personas to analyze, suggest, and implement landing page improvements. Each persona contributes their unique perspective.

## Team Roles

| Persona | Role | Focus Areas |
|---------|------|-------------|
| **Peter** | Research Analyst | Statistical patterns, data anomalies, segment analysis |
| **Alex** | Copy Expert | Headline effectiveness, CTA clarity, tone resonance |
| **Maya** | Behavior Specialist | User journey friction, drop-offs, scroll patterns |
| **Jordan** | Planning Lead | Experiment prioritization, campaign timing, roadmap |
| **Ferni** | Team Coordinator | Overall narrative, brand consistency, synthesis |

## System Components

### 1. Backend Services

```
src/services/landing-intelligence/
├── optimization-agent.ts    # AI-powered analysis & recommendations
├── experiments-integration.ts # A/B test definitions & assignment
├── gemini-client.ts         # Gemini 2.0 Flash for AI generation
├── intent-detector.ts       # User intent analysis
├── variant-generator.ts     # Dynamic content variants
├── time-aware.ts            # Time-of-day content adaptation
├── returning-visitor.ts     # Returning user personalization
├── demo-generator.ts        # Dynamic demo conversations
├── layout-optimizer.ts      # Section ordering optimization
└── chat-greeter.ts          # Proactive chat greetings
```

### 2. API Endpoints

```
# Metrics & Reports
GET  /api/landing/optimization/metrics?period=week
POST /api/landing/optimization/report
GET  /api/landing/optimization/reports

# Insights & Experiments
GET  /api/landing/optimization/insights?persona=peter&type=recommendation
GET  /api/landing/optimization/experiments
POST /api/landing/optimization/experiments/:id/approve

# Automated Jobs (Cloud Scheduler)
POST /api/landing/optimization/jobs/daily    # 6am PT
POST /api/landing/optimization/jobs/weekly   # Monday 9am PT

# Manual Trigger
POST /api/landing/optimization/run
```

### 3. Admin Dashboard

Access at: `/admin/landing-insights.html`

Features:
- Real-time metrics (visitors, conversion rate, time on page)
- Team insights from each persona
- Suggested experiments with approve button
- Weekly summary

### 4. Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Daily Check | 6am PT | Anomaly detection, quick wins, alerts |
| Weekly Report | Monday 9am PT | Full team analysis, experiment suggestions |

## Pre-defined A/B Experiments

| Experiment | Section | What It Tests |
|------------|---------|---------------|
| `superpowers_tab_order` | Superpowers | Tab ordering (Memory First vs Reading First) |
| `superpowers_demo_animation` | Superpowers | Animated vs static chat demos |
| `hardest_moments_card_count` | Hardest Moments | 5 cards vs 3 featured cards |
| `hardest_moments_voice_quotes` | Hardest Moments | With/without Ferni quotes |
| `memory_demo_layout` | Memory Demo | Timeline+Insights vs Timeline Only |
| `memory_demo_emotions` | Memory Demo | Show/hide emotion labels |
| `journey_depth_viz` | Journey | Depth bars vs timeline only |
| `hero_tagline_variations` | Hero | Different tagline variations |

## How It Works

### Automatic Optimization Flow

```
1. Cloud Scheduler triggers job
   ↓
2. Collect metrics from Firestore
   ↓
3. Each persona analyzes data via Gemini
   ↓
4. Generate insights & experiment suggestions
   ↓
5. Ferni synthesizes team findings
   ↓
6. Persist report to Firestore
   ↓
7. (Optional) Auto-approve high-confidence experiments
```

### Manual Optimization Flow

```
1. Admin opens /admin/landing-insights.html
   ↓
2. Reviews team insights by persona
   ↓
3. Evaluates suggested experiments
   ↓
4. Clicks "Approve & Start" on chosen experiments
   ↓
5. System activates A/B test
   ↓
6. Results flow back to next analysis cycle
```

## Setup

### 1. Set Environment Variables

```bash
# Required for AI features
export GOOGLE_API_KEY="your-gemini-api-key"
```

### 2. Create Cloud Scheduler Jobs

```bash
# Daily check
gcloud scheduler jobs create http landing-optimization-daily \
  --location=us-central1 \
  --schedule="0 6 * * *" \
  --uri="https://app.ferni.ai/api/landing/optimization/jobs/daily" \
  --http-method=POST \
  --headers="Content-Type=application/json,X-CloudScheduler=true" \
  --time-zone="America/Los_Angeles"

# Weekly report
gcloud scheduler jobs create http landing-optimization-weekly \
  --location=us-central1 \
  --schedule="0 9 * * 1" \
  --uri="https://app.ferni.ai/api/landing/optimization/jobs/weekly" \
  --http-method=POST \
  --headers="Content-Type=application/json,X-CloudScheduler=true" \
  --time-zone="America/Los_Angeles"
```

### 3. Test Locally

```bash
# Generate a report manually
curl -X POST http://localhost:3002/api/landing/optimization/report \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: dev-mode" \
  -d '{"period": "week"}'

# Get insights
curl http://localhost:3002/api/landing/optimization/insights \
  -H "X-Admin-Key: dev-mode"
```

## Feature Flags

| Flag | Purpose |
|------|---------|
| `landing-intelligence` | Master toggle for all AI features |
| `landing-intelligence-ai-variants` | AI-generated content variants |
| `landing-intelligence-intent-detection` | User intent analysis |
| `landing-intelligence-time-aware` | Time-of-day content |
| `landing-intelligence-returning-visitor` | Returning user personalization |
| `landing-intelligence-chat-widget` | Proactive chat widget |
| `landing-intelligence-layout-optimization` | AI section reordering |

## Example Insight Output

```json
{
  "persona": "peter",
  "type": "observation",
  "title": "Mobile Drop-off at Memory Demo",
  "description": "Mobile visitors have 34% lower scroll-through rate at the Memory Demo section compared to desktop. The timeline visualization may be cramped on smaller screens.",
  "confidence": 0.87,
  "actionable": true,
  "suggestedAction": "Consider a mobile-specific layout for the Memory Demo section with vertical stacking."
}
```

## Data Storage

| Collection | Purpose |
|------------|---------|
| `landing_sessions` | Individual visitor sessions |
| `landing_visitors` | Returning visitor profiles |
| `landing_optimization_reports` | Generated reports |
| `landing_experiments` | A/B test results |

## Future Enhancements

1. **Slack Integration**: Post daily insights to #landing-optimization channel
2. **Auto-implement Winners**: Automatically apply winning experiment variants
3. **Predictive Modeling**: Use ML to predict optimal content before testing
4. **Multi-variate Testing**: Test multiple changes simultaneously
5. **Personalization Engine**: Real-time content adaptation per visitor

---

*Built with ❤️ by Ferni's Team*

