# 🚀 Proactive Outreach System - Production Deployment Plan

**Last Updated:** December 13, 2024

## Overview

This document outlines all phases needed to deploy the Proactive Outreach System to production and validate it end-to-end.

### Status (December 2024)

| Component | Status |
|-----------|--------|
| Decision Engine | ✅ Implemented (`src/services/outreach/decision-engine.ts`) |
| Timing Intelligence | ✅ Implemented (`outreach-timing-ml.ts`) |
| ThinkingOfYou Detection | ✅ Implemented + Persona content |
| Outreach Orchestrator | ✅ Implemented (`outreach-orchestrator.ts`) |
| **Delivery (SMS/Call)** | ❌ **BLOCKED** - Needs Twilio credentials |
| **Push Notifications** | ❌ **BLOCKED** - Needs FCM setup |
| **Email Delivery** | ❌ **BLOCKED** - Needs SendGrid/Resend |

**Key Gap:** Detection and decision systems are COMPLETE. Actual delivery is blocked on external service credentials.

---

## Phase 1: Pre-Deployment Checklist ⬜

### 1.1 Build Verification
- [ ] `npm run build` passes with 0 errors
- [ ] Frontend builds: `cd apps/web && npm run build`
- [ ] No TypeScript errors in outreach modules

### 1.2 Environment Variables
Verify these are set in production environment:

```bash
# REQUIRED - Twilio (SMS & Calls)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# REQUIRED - Email (choose one)
SENDGRID_API_KEY=SG.xxxxx
# OR
RESEND_API_KEY=re_xxxxx

# Email Settings
EMAIL_FROM=hello@ferni.ai
EMAIL_FROM_NAME=Ferni

# Webhook Security
SENDGRID_WEBHOOK_KEY=xxxxx
RESEND_WEBHOOK_SECRET=xxxxx

# Push Notifications (optional)
FCM_PROJECT_ID=xxxxx
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FCM_CLIENT_EMAIL=firebase-adminsdk@xxx.iam.gserviceaccount.com

# Webhook Base URL
WEBHOOK_BASE_URL=https://app.ferni.ai
```

### 1.3 Database Ready
- [ ] Firestore collections accessible
- [ ] Indexes created for outreach queries

---

## Phase 2: Deployment ⬜

### 2.1 Deploy UI Server
```bash
npm run deploy:ui
```

### 2.2 Verify Deployment
```bash
# Health check
curl https://app.ferni.ai/health

# Outreach API
curl https://app.ferni.ai/api/outreach/pending?userId=test
```

### 2.3 Deploy Frontend
```bash
npm run deploy:frontend
```

---

## Phase 3: Webhook Configuration ⬜

### 3.1 Twilio Webhooks
1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to Phone Numbers → Your Number
3. Configure webhooks:

| Setting | URL |
|---------|-----|
| SMS Incoming | `https://app.ferni.ai/api/outreach/webhooks/twilio/sms-inbound` |
| SMS Status | `https://app.ferni.ai/api/outreach/webhooks/twilio/sms-status` |
| Voice Status | `https://app.ferni.ai/api/outreach/webhooks/twilio/call-status` |

### 3.2 SendGrid Webhooks
1. Go to [SendGrid Mail Settings](https://app.sendgrid.com/settings/mail_settings)
2. Enable Event Webhook
3. Set URL: `https://app.ferni.ai/api/outreach/webhooks/sendgrid`
4. Select events: Delivered, Opened, Clicked, Bounced
5. Copy verification key to `SENDGRID_WEBHOOK_KEY`

### 3.3 Verify Webhooks
```bash
# Test Twilio webhook validation
curl -X POST https://app.ferni.ai/api/outreach/webhooks/twilio/sms-status \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "MessageSid=test&MessageStatus=delivered"
```

---

## Phase 4: SMS E2E Testing ⬜

### 4.1 Send Test SMS
```bash
curl -X POST https://app.ferni.ai/api/outreach/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "type": "thinking_of_you",
    "priority": "medium",
    "reason": "E2E test"
  }'
```

### 4.2 Verify SMS Received
- [ ] SMS arrives on test phone
- [ ] Message has correct persona voice
- [ ] Delivery status updates in system

### 4.3 Test SMS Reply
- [ ] Reply to SMS
- [ ] Verify inbound webhook fires
- [ ] Response logged in system

---

## Phase 5: Email E2E Testing ⬜

### 5.1 Send Test Email
```bash
curl -X POST https://app.ferni.ai/api/outreach/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "type": "celebration",
    "priority": "low",
    "reason": "Email E2E test",
    "channel": "email"
  }'
```

### 5.2 Verify Email
- [ ] Email arrives in inbox (not spam)
- [ ] HTML renders correctly
- [ ] Persona branding correct
- [ ] Open tracking works
- [ ] Click tracking works

---

## Phase 6: User Flow Testing ⬜

### 6.1 Contact Settings Flow
1. Open app at https://app.ferni.ai
2. Click settings menu (hamburger)
3. Click "Contact Info"
4. [ ] Modal opens with heart icon
5. [ ] Enter phone number
6. [ ] Click "Verify with code"
7. [ ] SMS verification code arrives
8. [ ] Enter code
9. [ ] Phone marked as verified
10. [ ] Save contact info

### 6.2 Schedule UI Flow
1. Click settings menu
2. Click "Upcoming Check-ins"
3. [ ] Modal opens
4. [ ] Upcoming tab shows pending outreach
5. [ ] History tab shows past outreach
6. [ ] Preview button shows full message
7. [ ] Reschedule opens time picker
8. [ ] Cancel removes from list

### 6.3 Outreach Settings Flow
1. Click settings menu
2. Click "Notifications"
3. [ ] Can set quiet hours
4. [ ] Can disable specific channels
5. [ ] Settings persist on reload

---

## Phase 7: Conversation Analysis Testing ⬜

### 7.1 Commitment Detection
1. Have a conversation with Ferni
2. Make a commitment: "I'll start meditating tomorrow morning"
3. End the conversation
4. [ ] Check triggers created:
```bash
curl https://app.ferni.ai/api/outreach/pending?userId=YOUR_USER_ID
```
5. [ ] Commitment follow-up trigger exists

### 7.2 Emotional Support Detection
1. Have a conversation expressing stress/difficulty
2. End the conversation
3. [ ] Check-in trigger created for emotional support

### 7.3 Celebration Detection
1. Have a conversation sharing a win
2. End the conversation
3. [ ] Celebration outreach queued

---

## Phase 8: Timing Intelligence Testing ⬜

### 8.1 Quiet Hours
1. Set quiet hours: 10pm - 8am
2. Trigger outreach during quiet hours
3. [ ] Outreach deferred until morning

### 8.2 Optimal Time Learning
1. Engage with app at consistent times
2. Check timing profile:
```bash
curl https://app.ferni.ai/api/outreach/timing?userId=YOUR_USER_ID
```
3. [ ] Preferred hours detected

---

## Phase 9: Analytics & Monitoring ⬜

### 9.1 Outreach Dashboard
1. Navigate to `/outreach-dashboard.html`
2. [ ] Total outreach count displays
3. [ ] Channel breakdown shows
4. [ ] Response rates calculated
5. [ ] Recent activity timeline works

### 9.2 Logging
- [ ] Outreach events logged with correct levels
- [ ] Errors captured with stack traces
- [ ] User IDs properly anonymized in logs

### 9.3 Error Handling
1. Trigger outreach with invalid phone
2. [ ] Error logged
3. [ ] Retry queued
4. [ ] User not spammed

---

## Phase 10: Load & Performance Testing ⬜

### 10.1 Concurrent Outreach
```bash
# Send 10 outreach requests simultaneously
for i in {1..10}; do
  curl -X POST https://app.ferni.ai/api/outreach/trigger \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"load-test-$i\",\"type\":\"thinking_of_you\",\"priority\":\"low\",\"reason\":\"Load test\"}" &
done
```
- [ ] All requests processed
- [ ] No rate limit errors from Twilio

### 10.2 Memory Check
- [ ] No memory leaks after 100 outreach events
- [ ] Cron jobs running without buildup

---

## Phase 11: Security Validation ⬜

### 11.1 Webhook Security
- [ ] Unsigned Twilio requests rejected
- [ ] Invalid SendGrid signatures rejected
- [ ] CORS properly configured

### 11.2 User Data
- [ ] Phone numbers not logged in plain text
- [ ] Email addresses properly handled
- [ ] No PII in error messages

### 11.3 Rate Limiting
- [ ] User can't trigger unlimited outreach
- [ ] Daily/weekly limits enforced

---

## Phase 12: Production Validation ⬜

### 12.1 Real User Test
1. Enroll a real user (yourself or trusted tester)
2. Complete onboarding
3. Add contact info
4. Have multiple conversations
5. [ ] Outreach feels natural and timely
6. [ ] Not too frequent
7. [ ] Tone matches relationship stage

### 12.2 Multi-Day Test
- Day 1: Initial conversation + commitment
- Day 2: [ ] Follow-up on commitment received
- Day 3-5: [ ] Thinking-of-you if appropriate
- Day 7: [ ] Weekly reflection/celebration

### 12.3 Edge Cases
- [ ] User with no phone (email only)
- [ ] User with no email (SMS only)
- [ ] User who unsubscribes
- [ ] User in different timezone

---

## Rollback Plan

If critical issues found:

1. **Immediate**: Disable outreach system
```bash
# In Firebase/GCP Console, set:
OUTREACH_ENABLED=false
```

2. **Partial**: Disable specific channel
```bash
SMS_ENABLED=false
EMAIL_ENABLED=false
```

3. **Full rollback**: Redeploy previous version
```bash
gcloud run services update-traffic bogle-ui --to-revisions=PREVIOUS_REVISION=100
```

---

## Success Criteria

✅ **Phase Complete** when:
- All checklist items marked complete
- No critical bugs found
- Response time < 500ms for API calls
- Delivery rate > 95%
- User satisfaction positive

---

## Timeline Estimate

| Phase | Duration | Parallel? |
|-------|----------|-----------|
| Phase 1: Pre-deployment | 30 min | - |
| Phase 2: Deployment | 15 min | - |
| Phase 3: Webhooks | 30 min | - |
| Phase 4: SMS Testing | 30 min | - |
| Phase 5: Email Testing | 30 min | Yes with 4 |
| Phase 6: User Flow | 45 min | - |
| Phase 7: Conversation | 1 hour | - |
| Phase 8: Timing | 30 min | - |
| Phase 9: Analytics | 30 min | - |
| Phase 10: Load Test | 30 min | - |
| Phase 11: Security | 30 min | - |
| Phase 12: Validation | 2-5 days | - |

**Total: ~6-7 hours active work + 2-5 days validation**

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Product | | | |

