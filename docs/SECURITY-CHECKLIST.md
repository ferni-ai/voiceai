# Ferni AI - Security Checklist

## Authentication & Authorization

### API Security
- [ ] All API endpoints require authentication (except health checks)
- [ ] JWT tokens are validated on every request
- [ ] Token expiration is enforced (max 1 hour for access tokens)
- [ ] Refresh tokens are stored securely (httpOnly cookies)
- [ ] Rate limiting is enabled on all public endpoints
- [ ] CORS is configured to allow only trusted origins

### LiveKit Security
- [ ] Room tokens are generated server-side only
- [ ] Tokens include participant identity and permissions
- [ ] Room names are not guessable (use UUIDs)
- [ ] Token TTL is limited (max 24 hours)

### User Identification
- [ ] Phone numbers are hashed before storage
- [ ] User IDs are UUIDs, not sequential
- [ ] PII is encrypted at rest

## Data Protection

### Firestore Security
- [ ] Security rules enforce user isolation
- [ ] No client-side writes without validation
- [ ] Sensitive fields are not exposed in queries
- [ ] Backups are encrypted

### Voice Data
- [ ] Audio is not stored unless explicitly requested
- [ ] Transcripts are user-owned and deletable
- [ ] Voice emotion data is anonymized for analytics

### API Keys & Secrets
- [ ] All secrets are in environment variables
- [ ] No secrets in source code or logs
- [ ] Secret rotation is documented
- [ ] Least privilege for service accounts

## Input Validation

### User Input
- [ ] All text input is sanitized
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output encoding)
- [ ] File upload validation (if applicable)

### LLM Prompt Injection
- [ ] User input is separated from system prompts
- [ ] Output is validated before display
- [ ] Tool calls are verified before execution
- [ ] Rate limiting on LLM API calls

## Logging & Monitoring

### Safe Logging
- [ ] No PII in logs (use safeLog)
- [ ] No secrets in logs
- [ ] Request IDs for traceability
- [ ] Error details are sanitized

### Monitoring
- [ ] Failed login attempts are tracked
- [ ] Unusual patterns trigger alerts
- [ ] Error rates are monitored
- [ ] Latency thresholds are enforced

## Infrastructure

### Cloud Run
- [ ] Container runs as non-root
- [ ] Memory limits are set
- [ ] CPU limits are set
- [ ] No privileged mode

### Network
- [ ] HTTPS only (no HTTP)
- [ ] TLS 1.2+ required
- [ ] Certificate auto-renewal
- [ ] DDoS protection enabled

### Dependencies
- [ ] npm audit runs in CI
- [ ] Dependabot is enabled
- [ ] Critical vulnerabilities block deploy
- [ ] Regular dependency updates

## Incident Response

### Preparation
- [ ] Incident response plan documented
- [ ] Contact list is current
- [ ] Runbooks exist for common issues
- [ ] Regular drills are conducted

### Detection
- [ ] Sentry captures exceptions
- [ ] Alerts are configured
- [ ] On-call rotation is set
- [ ] Escalation paths are clear

### Recovery
- [ ] Backup restoration is tested
- [ ] Rollback procedure is documented
- [ ] Post-incident review process exists
- [ ] Lessons learned are captured

## Compliance

### GDPR
- [ ] Privacy policy is published
- [ ] Data export is available
- [ ] Data deletion is available
- [ ] Consent is tracked

### SOC 2 (if applicable)
- [ ] Access controls are documented
- [ ] Change management is followed
- [ ] Monitoring is in place
- [ ] Policies are reviewed annually

## Regular Audits

| Audit Type | Frequency | Last Completed | Next Due |
|------------|-----------|----------------|----------|
| Dependency scan | Weekly | Auto (CI) | - |
| Secret rotation | Monthly | - | - |
| Access review | Quarterly | - | - |
| Penetration test | Annually | - | - |
| Security training | Annually | - | - |

## Quick Commands

```bash
# Run npm audit
npm audit --audit-level=high

# Check for secrets in git history
npx trufflehog git file://. --only-verified

# Run accessibility audit
npx ts-node scripts/accessibility-audit.ts http://localhost:3005

# Verify Firestore security rules
firebase emulators:exec --only firestore "npm run test:security-rules"
```

## Contacts

- Security Lead: security@ferni.ai
- On-Call: oncall@ferni.ai
- Incident Response: incident@ferni.ai

