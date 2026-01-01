# Ferni Mailchimp Brand Guide

> Making every touchpoint feel like Ferni - warm, present, human.

---

## Current Issues (January 2025)

The default Mailchimp experience is **completely off-brand**:
- Generic gray/white styling
- Plain text "ferni.ai" instead of logo
- Extra form fields (First Name, Last Name, Birthday)
- Corporate, cold feel vs. warm, human brand

---

## 1. Subscription Landing Page

### Design Specifications

| Element | Value |
|---------|-------|
| **Background** | `#F5F1E8` (warm cream) |
| **Primary Color** | `#4a6741` (sage green) |
| **Accent Color** | `#3D5A45` (CTA green) |
| **Text Color** | `#2C2520` (natural ink) |
| **Font** | System fonts: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto |
| **Border Radius** | `12px` (buttons), `8px` (inputs) |

### Custom CSS for Mailchimp

```css
/* Paste this into Mailchimp's custom CSS section */

body {
  background-color: #F5F1E8 !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #2C2520;
}

#templateContainer {
  background-color: #ffffff;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(74, 103, 65, 0.08);
  max-width: 480px;
  margin: 40px auto;
  padding: 48px;
}

/* Logo area */
#templateHeader {
  text-align: center;
  padding-bottom: 24px;
}

/* Form title */
h1, .formTitle {
  font-size: 28px;
  font-weight: 600;
  color: #2C2520;
  margin-bottom: 8px;
}

/* Subtitle */
.formSubtitle, #mc_embed_signup .mc-field-group label {
  color: #6B5C4D;
  font-size: 16px;
  font-weight: 400;
}

/* Input fields */
#mc_embed_signup input[type="email"],
#mc_embed_signup input[type="text"] {
  border: 1px solid #E5DFD6;
  border-radius: 8px;
  padding: 14px 16px;
  font-size: 16px;
  width: 100%;
  transition: border-color 0.2s ease;
}

#mc_embed_signup input[type="email"]:focus,
#mc_embed_signup input[type="text"]:focus {
  border-color: #4a6741;
  outline: none;
  box-shadow: 0 0 0 3px rgba(74, 103, 65, 0.1);
}

/* Subscribe button */
#mc_embed_signup .button,
#mc_embed_signup input[type="submit"] {
  background-color: #3D5A45 !important;
  color: #ffffff !important;
  border: none;
  border-radius: 12px;
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.1s ease;
}

#mc_embed_signup .button:hover,
#mc_embed_signup input[type="submit"]:hover {
  background-color: #4a6741 !important;
  transform: translateY(-1px);
}

/* Error messages */
.mce_inline_error {
  color: #c4856a !important;
  font-size: 14px;
}

/* Success message */
#mce-success-response {
  color: #4a6741;
  font-size: 16px;
  padding: 16px;
  background: rgba(74, 103, 65, 0.08);
  border-radius: 8px;
}

/* Footer */
#templateFooter {
  text-align: center;
  color: #9A8B7A;
  font-size: 12px;
  padding-top: 24px;
}
```

### Page Content

**Header**: Ferni logo (sage green wordmark)

**Title**: "Stay in the loop"

**Subtitle**: "Get new articles and Ferni updates delivered to your inbox."

**Single Field**: Email only (remove First Name, Last Name, Birthday)

**Button Text**: "Subscribe"

**Footer**: "We respect your inbox. Unsubscribe anytime."

---

## 2. Confirmation Email (Double Opt-in)

### Subject Line
```
Confirm your subscription to Ferni
```

### Email Body
```
Hey there,

You're one step away from staying in the loop with Ferni.

[Confirm Subscription Button]

If you didn't sign up for this, no worries—just ignore this email.

Talk soon,
The Ferni Team

---

ferni.ai
Your AI life coach
```

### Design Notes
- Cream background (`#F5F1E8`)
- Centered layout, max-width 560px
- Sage green button (`#3D5A45`)
- Ferni logo at top
- Minimal, clean design

---

## 3. Welcome Email (After Confirmation)

### Subject Line
```
Welcome to Ferni
```

### Email Body
```
You're in.

Thanks for joining our community. Here's what to expect:

**What we send:**
- New blog posts about AI coaching, personal growth, and building Ferni
- Product updates when we ship something meaningful
- Occasionally, something we think you'll find genuinely useful

**What we don't send:**
- Spam
- Daily newsletters
- Stuff that wastes your time

If you ever want to chat, just reply to any email. We read everything.

—
The Ferni Team

P.S. Ready to try Ferni? Start a conversation at app.ferni.ai

---

ferni.ai
Building AI that feels human

[Unsubscribe] · [Preferences]
```

### Design Notes
- Same warm cream background
- Clear hierarchy with bold headers
- Bullet points for scannability
- Personal, direct tone (no corporate speak)
- Clear CTA to try the app

---

## 4. Form Field Configuration

### In Mailchimp Audience Settings:

**Required Fields:**
- Email Address ✅

**Remove These Fields:**
- First Name ❌
- Last Name ❌
- Birthday ❌

*Rationale: Simpler forms convert better. We can collect more info later if needed.*

---

## 5. Brand Voice Reminders

### Do:
- Use "you" and "we" (personal)
- Be direct and warm
- Keep sentences short
- Sound like a friend, not a company

### Don't:
- Say "user" or "subscriber"
- Use corporate buzzwords
- Over-promise
- Sound robotic or overly formal

### Example Transformations:

| Generic | Ferni |
|---------|-------|
| "Thank you for subscribing to our newsletter!" | "You're in." |
| "You will receive updates about our products." | "We'll send you stuff worth reading." |
| "Click here to confirm your subscription." | "Confirm your subscription" |
| "We appreciate your interest!" | (skip this—be direct) |

---

## 6. Implementation Checklist

- [ ] Add Ferni logo to Mailchimp
- [ ] Apply custom CSS (see Section 1)
- [ ] Update landing page content
- [ ] Remove extra form fields (keep email only)
- [ ] Update confirmation email template
- [ ] Update welcome email template
- [ ] Test full subscription flow
- [ ] Verify mobile responsiveness

---

## 7. Quick Reference: Colors

| Name | Hex | Usage |
|------|-----|-------|
| Cream Background | `#F5F1E8` | Page backgrounds |
| Sage Green | `#4a6741` | Brand color, success states |
| CTA Green | `#3D5A45` | Buttons, links |
| Natural Ink | `#2C2520` | Primary text |
| Warm Gray | `#6B5C4D` | Secondary text |
| Terracotta | `#c4856a` | Error states |
| Border | `#E5DFD6` | Input borders |

---

## 8. Logo Assets

Use these in Mailchimp:

- **Wordmark**: `/images/ferni-wordmark.svg` (sage green)
- **Favicon**: `/images/favicon-32x32.png`
- **Social Preview**: `/images/og-image.png`

---

*Last updated: January 2025*
*For questions: Check the brand guidelines or ask the team.*
