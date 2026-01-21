#  Ferni Quick Setup Guide

> Complete setup in ~30 minutes. Open each link, follow the steps.

---

##  One-Click Signup Links

Open each in a new tab and complete signup:

| Platform | Signup Link | Username to Grab |
|----------|-------------|------------------|
| **X (Twitter)** | [Create Account ](https://twitter.com/i/flow/signup) | `@ferniAI` |
| **LinkedIn** | [Create Company ](https://www.linkedin.com/company/setup/new/) | `ferni` |
| **Instagram** | [Create Account ](https://www.instagram.com/accounts/emailsignup/) | `@ferni.ai` |
| **TikTok** | [Create Account ](https://www.tiktok.com/signup) | `@ferni.ai` |
| **YouTube** | [Create Channel ](https://www.youtube.com/channel_switcher) | `@ferniAI` |
| **Google Analytics** | [Create Property ](https://analytics.google.com/analytics/web/#/provision) | N/A |
| **Formspree** | [Create Account ](https://formspree.io/register) | N/A |

---

##  Copy-Paste Bios

### X (Twitter) Bio — *Copy this:*
```
Your AI life coach. Six specialists. One conversation. Just talk. 

Call: (888) 598-3952 | Try free at ferni.ai
```

### LinkedIn Tagline — *Copy this:*
```
Your personal AI life coach. Six specialists. One conversation.
```

### Instagram Bio — *Copy this:*
```
Your AI life coach team 
Six specialists. One conversation.
Just talk  ferni.ai
 (888) 598-3952
```

### TikTok Bio — *Copy this:*
```
Your AI life coach  Just talk  ferni.ai
```

### YouTube Description — *Copy this:*
```
Ferni is your personal AI life coach—a team of six specialists working together to help you navigate life. Try free: app.ferni.ai | Call: (888) 598-3952
```

---

##  Email Setup (Pick One Option)

### Option A: Google Workspace (Recommended)
1. Go to [Google Workspace](https://workspace.google.com/business/signup/welcome)
2. Sign up with ferni.ai domain
3. Create aliases: hello@, privacy@, legal@

### Option B: Zoho Mail (Free)
1. Go to [Zoho Mail](https://www.zoho.com/mail/zohomail-pricing.html)
2. Free plan allows custom domain
3. Create: hello@ferni.ai, privacy@ferni.ai, legal@ferni.ai

### Option C: Cloudflare Email Routing (Free forwarding)
1. If domain is on Cloudflare, use [Email Routing](https://dash.cloudflare.com/)
2. Forward hello@ferni.ai  your personal email

---

##  After Signup: Update These Files

Once you have your IDs, update these files:

### 1. Google Analytics ID
**File:** `index.html` (lines 33, 38)
**Find:** `G-XXXXXXXXXX`
**Replace with:** Your actual Measurement ID (looks like `G-ABC123XYZ`)

### 2. Formspree Newsletter Form
**File:** `index.html` (line 950)
**Find:** `https://formspree.io/f/YOUR_NEWSLETTER_FORM_ID`
**Replace with:** Your form endpoint (looks like `https://formspree.io/f/xabcdefg`)

### 3. Formspree Developer Form  
**File:** `index.html` (line 865)
**Find:** `https://formspree.io/f/YOUR_FORM_ID`
**Replace with:** Your form endpoint

### 4. Remove "Coming Soon" from Links Page
**File:** `links.html`
**Find & Remove:** `coming-soon` class from each social link as you create them

---

##  Checklist

Print this and check off as you go:

```
SOCIAL MEDIA (10 min each)
[ ] X/Twitter - @ferniAI
    [ ] Created account
    [ ] Added profile photo
    [ ] Added bio
    [ ] Added website link
    
[ ] LinkedIn - /company/ferni
    [ ] Created company page
    [ ] Added logo
    [ ] Added tagline
    [ ] Added website
    
[ ] Instagram - @ferni.ai
    [ ] Created account
    [ ] Added profile photo
    [ ] Added bio
    [ ] Added link (ferni.ai/links)
    
[ ] TikTok - @ferni.ai
    [ ] Created account
    [ ] Added profile photo
    [ ] Added bio
    
[ ] YouTube - @ferniAI
    [ ] Created channel
    [ ] Added profile photo
    [ ] Added description

TECHNICAL (15 min)
[ ] Google Analytics
    [ ] Created property
    [ ] Got Measurement ID
    [ ] Updated index.html
    
[ ] Formspree
    [ ] Created account
    [ ] Created newsletter form
    [ ] Created developer form
    [ ] Updated index.html
    
[ ] Email
    [ ] Set up hello@ferni.ai
    [ ] Set up privacy@ferni.ai
    [ ] Set up legal@ferni.ai

FINAL
[ ] Updated links.html (removed coming-soon)
[ ] Cross-linked all social profiles
[ ] Tested all forms
[ ] Tested all links
```

---

##  Assets You'll Need

Download/create these before starting:

| Asset | Size | Use |
|-------|------|-----|
| Profile Photo | 400x400px | All platforms |
| X Banner | 1500x500px | Twitter/X |
| LinkedIn Banner | 1128x191px | LinkedIn |
| YouTube Banner | 2560x1440px | YouTube |

**Quick option:** Use the Ferni orb from your site as profile photo. Take a screenshot of the orb at `app.ferni.ai` or use the avatar from your design files.

---

##  You're Done!

After completing setup:
1. Post your first content (see SOCIAL-MEDIA-GUIDE.md for launch posts)
2. Update `links.html` to remove "coming soon" badges
3. Schedule your first week of content

Questions? The full guide is in `SOCIAL-MEDIA-GUIDE.md`

