# Cloudflare Setup for ferni.ai

DDoS protection, WAF, and CDN setup guide.

## Pre-Flight Checklist

- [ ] Access to Google Domains for ferni.ai
- [ ] Email for Cloudflare account
- [ ] 15-30 minutes for setup

---

## Phase 1: Create Cloudflare Account (5 min)

- [ ] Go to https://cloudflare.com
- [ ] Click "Sign Up" (top right)
- [ ] Enter email and password
- [ ] Verify email

---

## Phase 2: Add Your Site (5 min)

- [ ] Click "Add a site" in dashboard
- [ ] Enter: `ferni.ai`
- [ ] Click "Continue"
- [ ] Select **Free** plan → Click "Continue"
- [ ] Wait for DNS scan to complete

### Verify DNS Records Imported

Cloudflare should detect these. Verify they're correct:

| Type | Name | Content | Proxy Status |
|------|------|---------|--------------|
| A | ferni.ai | 199.36.158.100 | Proxied (orange cloud) |
| CNAME | www | ferni.ai | Proxied (orange cloud) |

- [ ] Confirm A record for ferni.ai exists
- [ ] Confirm proxy status is ORANGE (not gray)
- [ ] Click "Continue"

---

## Phase 3: Change Nameservers (10 min)

Cloudflare will show you two nameservers. Write them down:

```
Nameserver 1: _________________________.ns.cloudflare.com
Nameserver 2: _________________________.ns.cloudflare.com
```

### Update Google Domains

- [ ] Open new tab: https://domains.google.com
- [ ] Click on `ferni.ai`
- [ ] Click "DNS" in left sidebar
- [ ] Under "Name servers", click "Custom name servers"
- [ ] Click "Switch to these settings"
- [ ] Enter Cloudflare nameserver 1
- [ ] Enter Cloudflare nameserver 2
- [ ] Click "Save"
- [ ] Confirm the change when prompted

### Back in Cloudflare

- [ ] Click "Done, check nameservers"
- [ ] Cloudflare will check (may take 5 min - 24 hours)
- [ ] You'll get an email when active

**While waiting, continue with Phase 4...**

---

## Phase 4: Configure Security Settings

### SSL/TLS Settings

- [ ] Go to SSL/TLS → Overview
- [ ] Set encryption mode to **Full (strict)**
- [ ] Go to SSL/TLS → Edge Certificates
- [ ] Enable "Always Use HTTPS": **On**
- [ ] Enable "Automatic HTTPS Rewrites": **On**
- [ ] Set "Minimum TLS Version": **TLS 1.2**

### Security Settings

- [ ] Go to Security → Settings
- [ ] Security Level: **Medium** (or High if paranoid)
- [ ] Challenge Passage: **30 minutes**
- [ ] Browser Integrity Check: **On**

### Bot Protection

- [ ] Go to Security → Bots
- [ ] Bot Fight Mode: **On**
- [ ] (Pro only) Super Bot Fight Mode - skip for now

### DDoS Protection

- [ ] Go to Security → DDoS
- [ ] HTTP DDoS attack protection: **On** (default)
- [ ] Sensitivity: **High**

---

## Phase 5: Add Rate Limiting (Free: 1 rule)

- [ ] Go to Security → WAF
- [ ] Click "Rate limiting rules" tab
- [ ] Click "Create rule"

### Rule: API Rate Limit

```
Rule name: API Rate Limit
If incoming requests match...
  Field: URI Path
  Operator: contains
  Value: /api/

Then...
  Action: Block
  Duration: 1 minute

With the same characteristics...
  Counting expression: IP

Requests: 100
Period: 1 minute
```

- [ ] Click "Deploy"

---

## Phase 6: Add Page Rules (Free: 3 rules)

- [ ] Go to Rules → Page Rules
- [ ] Click "Create Page Rule"

### Rule 1: No Cache for API

```
URL: *ferni.ai/api/*
Settings:
  - Cache Level: Bypass
  - Security Level: High
```
- [ ] Save and Deploy

### Rule 2: Cache Static JS

```
URL: *ferni.ai/*.js
Settings:
  - Cache Level: Cache Everything
  - Edge Cache TTL: 1 month
```
- [ ] Save and Deploy

### Rule 3: Cache Static CSS

```
URL: *ferni.ai/*.css
Settings:
  - Cache Level: Cache Everything
  - Edge Cache TTL: 1 month
```
- [ ] Save and Deploy

---

## Phase 7: Verify Everything Works

### Check DNS Propagation

- [ ] Wait for Cloudflare "Active" email
- [ ] Or check: https://dnschecker.org/#A/ferni.ai
- [ ] Verify IP shows Cloudflare (104.x.x.x or similar), NOT 199.36.158.100

### Test Your Site

- [ ] Open https://ferni.ai in incognito
- [ ] Verify site loads correctly
- [ ] Check SSL certificate shows "Cloudflare Inc"

### Verify Cloudflare Headers

```bash
curl -I https://ferni.ai 2>/dev/null | grep -i "cf-\|server"
```

Should show:
```
server: cloudflare
cf-ray: xxxxxxx-XXX
```

- [ ] Confirm `server: cloudflare` appears
- [ ] Confirm `cf-ray` header exists

---

## Phase 8: Emergency Procedures

### If Site Goes Down

1. Check Cloudflare status: https://cloudflarestatus.com
2. Try "Development Mode" (caches bypass for 3 hours):
   - Caching → Configuration → Development Mode: On

### If Under Attack

1. Go to Security → Settings
2. Enable "Under Attack Mode": **On**
3. This adds 5-second JavaScript challenge to all visitors
4. Turn off when attack stops

### Rollback to Google DNS

If something goes wrong:

1. Go to domains.google.com
2. Click ferni.ai → DNS
3. Switch back to "Google Domains name servers"
4. Wait 5-15 minutes for propagation

---

## Quick Reference

| Setting | Value |
|---------|-------|
| SSL Mode | Full (strict) |
| Security Level | Medium |
| Bot Fight Mode | On |
| Rate Limit | 100 req/min per IP on /api/* |
| Cache | Bypass for API, 1 month for static |

## Support

- Cloudflare Status: https://cloudflarestatus.com
- Cloudflare Docs: https://developers.cloudflare.com
- Community: https://community.cloudflare.com

---

## Post-Setup Checklist

- [ ] Site loads on https://ferni.ai
- [ ] SSL certificate shows Cloudflare
- [ ] `cf-ray` header present in responses
- [ ] Rate limiting rule deployed
- [ ] Page rules deployed
- [ ] Bookmark Cloudflare dashboard

**Setup complete!**
