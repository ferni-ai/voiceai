# Outreach Services

> **Proactive communication with user's contacts on their behalf.**

## Overview

The outreach module handles Ferni's ability to reach out to people proactively:
- Automated check-ins with family/friends
- Follow-up calls after important events
- Birthday/anniversary reminders
- "Thinking of you" messages

---

## Key Components

### Core Decision & Scheduling
| File | Purpose |
|------|---------|
| `decision-engine.ts` | Decides when/who to reach out to |
| `decision-engine-types.ts` | Decision engine type definitions |
| `outreach-orchestrator.ts` | Orchestrates outreach workflows |
| `scheduled-multi-outreach.ts` | Schedules batch outreach |
| `scheduled-outreach-executor.ts` | Executes scheduled outreach |
| `proactive-scheduler.ts` | Proactive outreach scheduling |
| `proactive-call-scheduler.ts` | Proactive call scheduling |
| `automated-scheduler.ts` | Automated scheduling logic |
| `daily-outreach-job.ts` | Daily job for pending outreach |
| `timing-intelligence.ts` | Optimal timing analysis |

### Call & Conversation
| File | Purpose |
|------|---------|
| `call-result-capture.ts` | Captures outcomes of outbound calls |
| `call-transcript-intelligence.ts` | Analyzes call transcripts |
| `conversational-calls.ts` | Conversational call management |
| `on-behalf-call-orchestrator.ts` | On-behalf call orchestration |
| `smart-callback-queue.ts` | Smart callback queue management |

### Content & Messaging
| File | Purpose |
|------|---------|
| `llm-content-generator.ts` | LLM-based message generation |
| `message-enrichment.ts` | Message enrichment with context |
| `semantic-message-system.ts` | Semantic message routing |
| `persona-outreach-formatter.ts` | Persona-specific formatting |
| `persona-voice-generator.ts` | Persona voice generation |
| `outbound-ssml.ts` | Outbound SSML generation |
| `voice-synthesis.ts` | Voice synthesis for outreach |

### Intelligence & Analytics
| File | Purpose |
|------|---------|
| `outreach-intelligence.ts` | Outreach intelligence engine |
| `outreach-analytics.ts` | Outreach analytics |
| `analytics.ts` | General analytics |
| `engagement-tracking.ts` | Engagement tracking |
| `outreach-history.ts` | Outreach history tracking |
| `outreach-admin.ts` | Admin operations |
| `graph-timing-intelligence.ts` | Graph-based timing intelligence |

### Integration & Bridges
| File | Purpose |
|------|---------|
| `superhuman-outreach-bridge.ts` | Bridges to superhuman insights |
| `superhuman-outreach-integration.ts` | Superhuman integration |
| `superhuman-call-scheduler.ts` | Superhuman-triggered calls |
| `trust-outreach-bridge.ts` | Trust system integration |
| `relationship-adapter.ts` | Relationship data adapter |
| `relationship-health-tracker.ts` | Relationship health tracking |
| `goal-outreach-integration.ts` | Goal-based outreach triggers |
| `pattern-outreach-integration.ts` | Pattern-based outreach |
| `domain-outreach-triggers.ts` | Domain-specific triggers |
| `session-integration.ts` | Session integration |
| `context-aggregator.ts` | Context aggregation |
| `conversation-context-bridge.ts` | Conversation context bridge |
| `conversation-extractor.ts` | Conversation data extraction |

### Onboarding & Engagement
| File | Purpose |
|------|---------|
| `intelligent-onboarding-arc.ts` | Intelligent onboarding flows |
| `onboarding-checkin-arc.ts` | Onboarding check-in arcs |
| `reengagement-arc.ts` | Re-engagement arcs |
| `life-rhythm-outreach.ts` | Life rhythm-aware outreach |
| `prediction-driven-outreach.ts` | Prediction-driven outreach |
| `thinking-of-you.ts` | "Thinking of you" messages |
| `maya-habit-outreach.ts` | Maya persona habit outreach |
| `channel-selector.ts` | Outreach channel selection |
| `user-contact.ts` | User contact management |

### Delivery
| File | Channel |
|------|---------|
| `delivery/delivery-tracker.ts` | Delivery tracking |
| `delivery/email-delivery.ts` | Email delivery |
| `delivery/sms-delivery.ts` | SMS delivery |
| `delivery/push-notifications.ts` | Push notification delivery |

### Persistence & Infrastructure
| File | Purpose |
|------|---------|
| `firestore-persistence.ts` | Firestore persistence layer |
| `trigger-publisher.ts` | Outreach trigger publishing |
| `unified-delivery.ts` | Unified delivery abstraction |
| `maintenance.ts` | Outreach data maintenance |
| `sip-bridge.ts` | SIP protocol bridge |

### Subdirectories
| Directory | Purpose |
|-----------|---------|
| `ab-testing/` | A/B testing for outreach |
| `delivery/` | Delivery channel implementations |
| `webhooks/` | Webhook handlers |

**Total: 63+ modules**

---

## Usage

```typescript
import { scheduleOutreach } from './scheduled-multi-outreach.js';

await scheduleOutreach(userId, {
  contactId: 'contact_123',
  type: 'check_in',
  channel: 'voice',
  scheduledFor: new Date(),
});
```

---

## Integration Points

- **Calendar**: Triggers outreach based on events
- **Contacts**: Gets contact info and preferences
- **Trust Systems**: Respects communication boundaries
- **Identity**: Uses linked accounts for delivery

---

*Last updated: January 2026*
