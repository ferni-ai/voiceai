# Ferni Landing Page - Squarespace Deployment Guide

This guide explains how to deploy the Ferni landing page to Squarespace.

## Option 1: Custom Code Injection (Recommended)

This method allows you to add the landing page as a custom page while keeping Squarespace's CMS benefits.

### Step 1: Create a Blank Page
1. In Squarespace, go to **Pages** → **+** → **Blank Page**
2. Name it "Home" or whatever you prefer
3. Set it as your homepage in **Settings** → **Website** → **Homepage**

### Step 2: Add Custom Code
1. Go to **Settings** → **Advanced** → **Code Injection**
2. In the **Header** section, paste the contents of `css/styles.css` wrapped in `<style>` tags:

```html
<style>
/* Paste entire contents of css/styles.css here */
</style>
```

3. In the **Footer** section, paste the contents of `js/main.js` wrapped in `<script>` tags:

```html
<script>
/* Paste entire contents of js/main.js here */
</script>
```

### Step 3: Add Page Content
1. Edit your blank page
2. Add a **Code Block** 
3. Paste the contents of `index.html` (everything inside the `<body>` tags)
4. Make sure "Display Source" is unchecked

### Step 4: Hide Squarespace Header/Footer (Optional)
Add this CSS to hide the default Squarespace navigation:

```css
/* Hide Squarespace default elements */
.Header, .Footer {
  display: none !important;
}
```

---

## Option 2: Replace Entire Site

For a completely custom site without Squarespace's CMS:

### Step 1: Access Developer Mode
1. Go to **Settings** → **Advanced** → **Developer Mode**
2. Enable Developer Mode (requires Business plan or higher)

### Step 2: Connect via SFTP
1. Download credentials from Developer Mode settings
2. Connect using an SFTP client (FileZilla, Cyberduck, etc.)
3. Replace template files with your custom code

### Step 3: Upload Files
```
/site.region → Keep or modify
/styles/ → Upload styles.css
/scripts/ → Upload main.js  
/pages/ → Create custom page templates
```

---

## Option 3: Link to External Hosting

If you want to host the site separately:

### Step 1: Host the Static Site
Upload the `ferni-website` folder to:
- **Vercel** (free): `vercel deploy`
- **Netlify** (free): Drag & drop folder
- **GitHub Pages** (free): Push to gh-pages branch
- **Firebase Hosting**: `firebase deploy`

### Step 2: Point Domain
1. In Squarespace, go to **Settings** → **Domains**
2. Add your domain (e.g., app.ferni.ai)
3. Update DNS settings to point to your hosting provider

---

## File Structure

```
ferni-website/
├── index.html          # Main HTML file
├── css/
│   └── styles.css      # All styles
├── js/
│   └── main.js         # Interactive features
└── SQUARESPACE-DEPLOYMENT.md
```

---

## Important Links to Update

Before deploying, update these links in `index.html`:

| Link | Current Value | Update To |
|------|---------------|-----------|
| App URL | `https://app.ferni.ai` | Your app URL |
| Phone | `tel:+18885983952` | Your Ferni phone |
| Privacy | `#` | Your privacy policy |
| Terms | `#` | Your terms of service |

---

## DNS Configuration (for app.ferni.ai)

If hosting on Firebase:

1. Add CNAME record in Squarespace DNS:
   - **Host**: `app`
   - **Type**: CNAME
   - **Value**: `johnb-2025.web.app` (or your Firebase domain)

2. Verify in Firebase Console → Hosting → Custom Domains

---

## Testing Checklist

- [ ] All links work correctly
- [ ] Phone number is tap-to-call on mobile
- [ ] Page loads under 3 seconds
- [ ] Animations work smoothly
- [ ] Mobile layout looks correct
- [ ] Form submissions work (if any)
- [ ] Analytics tracking is set up

---

## Support

For issues with this deployment, check:
1. Browser console for JavaScript errors
2. Network tab for failed resource loads
3. Squarespace Code Injection limits (per-page vs site-wide)

---

Built with ❤️ for Ferni

