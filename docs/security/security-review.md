# Security Review - OWASP Top 10

**Date:** December 2024
**Scope:** Ferni Voice AI Platform (apps/web, backend agents, servers)

## Summary

| Category | Status | Notes |
|----------|--------|-------|
| A01: Broken Access Control | Moderate | Device-based auth, CORS improvements needed |
| A02: Cryptographic Failures | Good | SSL in prod, tokens handled properly |
| A03: Injection | Good | Parameterized queries, input validation |
| A04: Insecure Design | Good | Proper separation of concerns |
| A05: Security Misconfiguration | Moderate | CORS too permissive |
| A06: Vulnerable Components | Moderate | 6 dev dependencies with issues |
| A07: Auth Failures | Acceptable | OAuth implemented correctly |
| A08: Data Integrity | Good | Type guards, validation |
| A09: Logging Failures | Good | Safe logger with PII masking |
| A10: SSRF | Good | URL validation implemented |

---

## A01:2021 - Broken Access Control

### Findings

**Strengths:**
- PostgreSQL store uses parameterized queries preventing SQL injection
- API endpoints properly validate user ID ownership

**Areas for Improvement:**
- CORS configured as `Access-Control-Allow-Origin: *` in health-server.ts:79
- No server-side authentication layer - relies on device IDs
- Consider adding rate limiting on public endpoints

### Recommendations
1. Restrict CORS to specific origins (frontend domains only)
2. Add rate limiting middleware to token-server and ui-server
3. Consider adding API key authentication for sensitive endpoints

---

## A02:2021 - Cryptographic Failures

### Findings

**Strengths:**
- SSL enabled for PostgreSQL in production (`ssl: { rejectUnauthorized: false }`)
- OAuth tokens (Spotify, Google) use proper refresh token rotation
- Token expiry handled with 5-minute buffer

**Areas for Improvement:**
- Spotify tokens stored in plain JSON files (`.spotify-tokens.json`)
- localStorage stores user preferences without encryption

### Recommendations
1. Consider encrypting token files at rest
2. For sensitive localStorage data, use encrypted storage wrapper

---

## A03:2021 - Injection

### Findings

**Strengths:**
- PostgreSQL queries use parameterized statements (`$1`, `$2` placeholders)
  - See: `postgres-store.ts:139` - `WHERE id = $1`
- Comprehensive input validation module (`src/tools/validation.ts`)
  - Email validation with RFC 5322 regex
  - Phone normalization to E.164
  - Text sanitization with HTML entity escaping
  - URL validation limiting to http/https

**innerHTML Usage Analysis:**
- `delight.service.ts:42` - Static HTML string (safe)
- `dom.ts:147` - Wrapper function, requires caller discipline
- `app.ts:518` - Static HTML template (safe)

### Recommendations
1. Consider using `textContent` where possible instead of innerHTML
2. Add CSP headers to prevent inline script execution

---

## A04:2021 - Insecure Design

### Findings

**Strengths:**
- Clear separation between services, tools, and UI layers
- Type guards validate data from external sources (`type-guards.ts`)
- Environment validation before startup (`env-validator.ts`)

No significant issues found.

---

## A05:2021 - Security Misconfiguration

### Findings

**Areas for Improvement:**
- CORS configured as wildcard `*` - should be restricted
- Debug logging enabled in production based on environment variables
- `.env` files need proper `.gitignore` protection

### Current CORS Configuration
```typescript
// health-server.ts:79
res.setHeader('Access-Control-Allow-Origin', '*');
```

### Recommendations
1. Set specific allowed origins:
   ```typescript
   const ALLOWED_ORIGINS = ['https://app.ferni.ai', 'https://ferni.ai'];
   ```
2. Add security headers (Helmet.js or manual):
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: DENY`
   - `Strict-Transport-Security`

---

## A06:2021 - Vulnerable and Outdated Components

### npm audit Results

**Frontend (apps/web/):**
- 6 moderate severity vulnerabilities
- All in dev dependencies (esbuild, vite toolchain)
- Not present in production builds

**Backend (root):**
- 0 vulnerabilities

### Recommendations
1. Run `npm audit fix` periodically
2. Consider automated dependency updates (Dependabot, Renovate)

---

## A07:2021 - Identification and Authentication Failures

### Findings

**Strengths:**
- OAuth state verification for Spotify (`oauthStates` Map in token-server.js:33)
- Token refresh with expiry tracking
- CSRF protection via state parameter

**Current Authentication Model:**
- Device-based identification using `device_id`
- No user accounts/passwords (simplified model)
- Appropriate for current use case

### Recommendations
1. If adding user accounts, implement:
   - Password hashing (bcrypt/argon2)
   - Account lockout after failed attempts
   - MFA option

---

## A08:2021 - Software and Data Integrity Failures

### Findings

**Strengths:**
- Type guards validate data from Firestore/Postgres
- Input sanitization before storage
- JSON.stringify/parse with error handling

No significant issues found.

---

## A09:2021 - Security Logging and Monitoring Failures

### Findings

**Strengths:**
- Safe logger implementation (`utils/safe-logger.js`)
- PII masking functions:
  - `sanitizeEmailForLog()` - masks email local part
  - `sanitizePhoneForLog()` - masks middle digits
- Persistence metrics tracking (`persistence-metrics.ts`)

### Recommendations
1. Add centralized log aggregation (Cloud Logging configured)
2. Set up alerts for authentication failures
3. Monitor for unusual API patterns

---

## A10:2021 - Server-Side Request Forgery (SSRF)

### Findings

**Strengths:**
- URL validation function restricts to http/https protocols
  ```typescript
  // validation.ts:186
  return ['http:', 'https:'].includes(parsed.protocol);
  ```
- External API calls use hardcoded domains (Spotify, Plaid, Google)

No significant issues found.

---

## Action Items

### High Priority
1. [ ] Restrict CORS to specific origins
2. [ ] Add rate limiting to public API endpoints

### Medium Priority
3. [ ] Add security headers (X-Content-Type-Options, etc.)
4. [ ] Set up automated dependency vulnerability scanning
5. [ ] Encrypt token storage files at rest

### Low Priority
6. [ ] Replace innerHTML with safer DOM methods where possible
7. [ ] Add Content Security Policy headers

---

## Files Reviewed

- `src/memory/postgres-store.ts` - Database access
- `src/tools/validation.ts` - Input validation
- `src/services/communication-service.ts` - External API calls
- `src/agents/shared/health-server.ts` - Health/API endpoints
- `token-server.js` - Token generation, Spotify OAuth
- `ui-server.js` - Frontend serving, Plaid integration
- `apps/web/src/services/*.ts` - Frontend services
