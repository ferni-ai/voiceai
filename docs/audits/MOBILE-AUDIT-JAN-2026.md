# Mobile Web App Audit Report
**Date:** January 1, 2026
**Auditor:** AI Assistant
**Viewport:** 375x812 (iPhone 13 Pro)

## Executive Summary

The Ferni web app has **one critical accessibility bug** affecting screen reader users, along with several observations about mobile UX. The visual rendering is working correctly - all icons, buttons, and text display properly. However, the accessibility tree shows corrupted text with missing 's' characters.

---

## 🚨 CRITICAL: Accessibility Text Corruption Bug

### Issue Description
The browser's accessibility tree shows text with missing 's' characters, while the visual rendering is correct. This affects **all screen reader users**.

### Affected Elements (Examples from audit)

| Expected Text | Accessibility Tree Shows |
|--------------|-------------------------|
| "Wisdom & long-term thinking" | "Wi dom & long-term thinking" |
| "Disconnect" | "Di connect" |
| "Milestone reached" | "Mile tone reached" |
| "Let's Practice" | "Let' Practice" |
| "Let's Do Something" | "Let' Do Something" |
| "How This Works" | "How Thi Work" |
| "Session Stats" | "Se ion Stat" |
| "How this works" | "How thi work" |
| "Music" | "Mu ic" |
| "Past chats" | "Pa t chat" |

### Impact
- **Screen reader users** will hear nonsensical text
- **Voice control users** cannot activate buttons by name
- **WCAG 2.1 Level A violation** - Guideline 4.1.2 (Name, Role, Value)

### Root Cause Analysis

The visual text renders correctly, meaning:
1. ✅ The i18n strings are correct (verified in `en-US.json`)
2. ✅ The DOM text content is correct (verified via screenshot)
3. ✅ Font loading is working (fonts render visually)
4. ❌ **The accessibility layer is somehow corrupting text**

Possible causes:
1. **Custom font subsetting** - The font may be missing 's' in the accessibility representation
2. **CSS `text-rendering` or `font-feature-settings`** affecting accessibility tree computation
3. **Browser bug** with certain font + CSS combinations
4. **JavaScript text manipulation** we haven't found yet

### Recommended Investigation
1. Test in different browsers (Chrome, Safari, Firefox)
2. Test with different fonts (swap Inter for system-ui temporarily)
3. Check if `aria-label` attributes are also corrupted
4. Use Chrome DevTools Accessibility pane to inspect computed names

### Temporary Fix (if needed)
Add explicit `aria-label` attributes that don't depend on text content:

```typescript
// In mobile-bottom-sheet.ui.ts, line 595-615
// Instead of relying on textContent, explicitly set aria-label
button.setAttribute('aria-label', action.label);
```

---

## ✅ Passed Audits

### 1. Icons and Visual Elements
- All icons render correctly using SVG
- Icons are appropriately sized (24x24 in 28x28 containers)
- Stroke-based Lucide-style icons are consistent
- No broken/missing icons observed

### 2. Touch Targets
- Mobile bottom sheet buttons: **Good** (~80x80 effective area)
- Connect button: **Good** (full-width, ~56px height)
- Settings menu items: **Good** (full-width, ~48px height)
- Team roster buttons: **Needs review** (44x44 minimum, appears borderline)

### 3. Mobile Bottom Sheet
- Opens correctly on mobile trigger click
- Drag-to-close gesture works
- Backdrop dismisses sheet on click
- Escape key closes sheet
- Focus trap is implemented
- 7 quick actions displayed in 4-column grid

### 4. Settings Menu
- Slides in from right correctly
- Close button functional
- All sections expand/collapse properly
- Locked feature indicators display correctly
- Relationship stage banner renders

### 5. Connect/Disconnect Flow
- Connect button triggers voice connection attempt
- Error toast appears correctly when connection fails
- Helper text updates appropriately

---

## Observations & Recommendations

### Mobile Bottom Sheet Actions
Current actions (7 items):
1. How this works (settings)
2. The team
3. Music
4. Calendar
5. Past chats (history)
6. Your people
7. How you're doing (insights)

**Consideration:** Empty 8th slot in 4x2 grid. Could add "Journal" or "Gifts" for visual balance.

### Team Roster on Mobile
The team roster is visible on mobile but may be difficult to scroll horizontally. Consider:
- Vertical list view on mobile
- Or swipe-to-see-more indicator

### Settings Menu Depth
The settings menu has 7 collapsible sections. On mobile, this can feel overwhelming. Consider:
- Remembering scroll position
- "Jump to section" quick links at top
- Search functionality

---

## Test Environment
- Browser: Cursor IDE Browser (Chromium-based)
- Viewport: 375x812
- Dev Mode: Enabled (`?dev` URL param)
- Theme: Default (dark/midnight)

## Files Reviewed
- `apps/web/src/ui/mobile-bottom-sheet.ui.ts`
- `apps/web/src/ui/settings-menu.ui.ts`
- `apps/web/src/ui/controls.ui.ts`
- `apps/web/src/i18n/locales/en-US.json`
- `apps/web/index.html`
- `design-system/dist/tokens.css`
- `design-system/dist/app-components.css`

---

## Action Items

| Priority | Issue | Owner | Status |
|----------|-------|-------|--------|
| 🚨 Critical | Fix accessibility text corruption | Frontend | Open |
| 🟡 Medium | Review team roster mobile scroll | Frontend | Open |
| 🟢 Low | Add 8th action to bottom sheet | Design | Open |
| 🟢 Low | Add settings menu search | Frontend | Backlog |
