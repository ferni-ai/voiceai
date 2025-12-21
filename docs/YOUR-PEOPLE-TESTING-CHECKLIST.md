# Your People - Manual E2E Testing Checklist

> This checklist covers all features of the "Your People" relationship management system.
> Run through this after any changes to ensure nothing is broken.

## Prerequisites

- [ ] Dev server running: `cd apps/web && pnpm dev`
- [ ] UI server running: `PORT=3002 node ui-server.js`
- [ ] Open `http://localhost:3004/?dev` in browser
- [ ] Dev panel visible (DEV badge in bottom-left corner)

---

## 1. Opening "Your People"

### From Settings Menu
- [ ] Click settings gear icon (bottom-right)
- [ ] Menu slides in from right
- [ ] Find "Your People" under "Remember" section
- [ ] Click "Your People"
- [ ] **Expected**: "Your People" dialog opens as centered modal

### Visual Check
- [ ] Has "RELATIONSHIPS" eyebrow label
- [ ] Has "Your People" title
- [ ] Has Insights button (chart icon) in header
- [ ] Has Close button (X icon) in header
- [ ] Has search box with placeholder "Search your people..."
- [ ] Has filter pills: "All", "Needs attention", "Recent"
- [ ] Background has blur effect

---

## 2. Empty State

If no contacts exist:
- [ ] Shows friendly empty state message "No one here yet"
- [ ] Shows "Add Someone" button with dashed border
- [ ] No error messages or console errors

---

## 3. Add Person Flow

### Open Form
- [ ] Click "Add Someone" button
- [ ] **Expected**: "Add a person" modal opens

### Form Fields
- [ ] Name input with placeholder "e.g., Mom, Sarah Chen, Dr. Rivera"
- [ ] Relationship type pills: Family, Friend, Colleague, Mentor, Acquaintance, Other
- [ ] "Add more details" expandable section
- [ ] Cancel button
- [ ] "Add Person" button

### Expandable Details
- [ ] Click "Add more details"
- [ ] **Expected**: Section expands with:
  - [ ] Email field
  - [ ] Phone field
  - [ ] Birthday field (date picker)
  - [ ] "How did you meet?" field
  - [ ] Notes textarea

### Submit Flow
- [ ] Enter name: "Test Person"
- [ ] Select relationship type: "Friend"
- [ ] Click "Add Person"
- [ ] **Expected**: Success toast "Test Person added!"
- [ ] **Expected**: Modal closes
- [ ] **Expected**: "Test Person" appears in the list

### Validation
- [ ] Try submitting empty form
- [ ] **Expected**: Error toast "Add a name first"

---

## 4. Contact List

With contacts present:
- [ ] Each contact shows name
- [ ] Shows relationship type badge/icon
- [ ] Shows last contact date (e.g., "3 days ago")
- [ ] Shows relationship strength indicator
- [ ] Clicking a contact opens Relationship Card

### Filters
- [ ] Click "All" - shows all contacts
- [ ] Click "Needs attention" - shows contacts needing outreach
- [ ] Click "Recent" - shows recently contacted

### Search
- [ ] Type in search box
- [ ] **Expected**: List filters as you type
- [ ] Clear search shows all contacts again

---

## 5. Relationship Card

### Open Card
- [ ] Click on a contact in the list
- [ ] **Expected**: Relationship Card opens

### Header
- [ ] Shows contact name
- [ ] Shows relationship type
- [ ] Shows Edit button
- [ ] Shows Close button

### Quick Actions
- [ ] Call button (if phone exists)
- [ ] Text button (if phone exists)
- [ ] Email button (if email exists)
- [ ] Record button (log a moment)

### Tabs
- [ ] Overview tab (default)
- [ ] Timeline tab
- [ ] Gifts tab
- [ ] Events tab
- [ ] Notes tab

### Overview Tab
- [ ] Shows "Last Contact" info
- [ ] Shows "Relationship Strength" score
- [ ] Shows interests (if any)
- [ ] Shows "Smart Actions" (Gift ideas, Conversation starters)

### Timeline Tab
- [ ] Shows list of past interactions
- [ ] Each interaction shows type, date, summary
- [ ] "Log a Moment" button at top

### Gifts Tab
- [ ] Shows gift history (given and received)
- [ ] "Record a Gift" button
- [ ] "Get gift ideas" button

### Events Tab
- [ ] Shows important dates (birthdays, anniversaries)
- [ ] "Manage Important Dates" button

---

## 6. Log a Moment

### Open Form
- [ ] From Relationship Card, click "Record" quick action
- [ ] OR click "Log a Moment" in Timeline tab
- [ ] **Expected**: "Log a Moment" modal opens

### Form Fields
- [ ] Interaction type dropdown (Call, Text, Email, Meeting, etc.)
- [ ] Date picker (defaults to today)
- [ ] Summary/notes textarea
- [ ] Sentiment pills: Positive, Neutral, Negative
- [ ] Topics input (optional)

### Submit
- [ ] Fill in details
- [ ] Click "Save"
- [ ] **Expected**: Success toast
- [ ] **Expected**: Interaction appears in Timeline

---

## 7. Record a Gift

### Open Form
- [ ] From Relationship Card, click "Record a Gift" in Gifts tab
- [ ] **Expected**: "Record a Gift" modal opens

### Form Fields
- [ ] Direction pills: "I gave" / "I received"
- [ ] Item input
- [ ] Occasion input (Birthday, Holiday, Just because, etc.)
- [ ] Date picker
- [ ] Reaction (if received): Loved, Liked, Okay, Not their thing
- [ ] Price (optional)
- [ ] Notes (optional)

### Submit
- [ ] Fill in details
- [ ] Click "Save"
- [ ] **Expected**: Success toast
- [ ] **Expected**: Gift appears in Gifts tab

---

## 8. Edit Person

### Open Form
- [ ] From Relationship Card, click "Edit" button
- [ ] **Expected**: Edit Person modal opens

### Edit Fields
- [ ] All fields from Add Person should be pre-filled
- [ ] Can edit name, relationship, contact info, interests
- [ ] Can add/remove interests

### Save
- [ ] Make changes
- [ ] Click "Save"
- [ ] **Expected**: Success toast
- [ ] **Expected**: Changes reflected in Relationship Card

---

## 9. Important Dates Manager

### Open Manager
- [ ] From Relationship Card Events tab, click "Manage Important Dates"
- [ ] **Expected**: Important Dates modal opens

### Features
- [ ] Shows existing dates
- [ ] Can add new date (type, date, label)
- [ ] Can delete existing date
- [ ] Toggle recurring on/off

### Save
- [ ] Make changes
- [ ] Click "Save"
- [ ] **Expected**: Success toast
- [ ] **Expected**: Events tab updates

---

## 10. Gift Suggestions (AI)

### Open Suggestions
- [ ] From Relationship Card, click "Get gift ideas"
- [ ] **Expected**: Gift Suggestions modal opens

### Features
- [ ] Shows AI-generated gift ideas
- [ ] Each suggestion has item name, reason, price range
- [ ] Can click to record a gift from suggestion

---

## 11. Conversation Starters (AI)

### Open Starters
- [ ] From Relationship Card, click "Start a conversation"
- [ ] **Expected**: Conversation Starters modal opens

### Features
- [ ] Shows AI-generated topics to discuss
- [ ] Each starter has topic, opener line, context

---

## 12. Relationship Insights Dashboard

### Open Dashboard
- [ ] From "Your People" header, click Insights button (chart icon)
- [ ] **Expected**: Insights dashboard opens

### Features
- [ ] Shows overall relationship health metrics
- [ ] Shows breakdown by relationship type
- [ ] Shows outreach patterns
- [ ] Shows people needing attention

---

## 13. Error Handling

### API Errors
- [ ] Disconnect from network
- [ ] Try adding a person
- [ ] **Expected**: Error toast, not crash

### Empty States
- [ ] Each feature should have appropriate empty state
- [ ] No broken UI when data is missing

---

## 14. Visual/Brand Compliance

### Colors
- [ ] NO hardcoded hex colors visible
- [ ] Uses CSS variables for all colors
- [ ] Persona colors match (Ferni green: #4a6741)

### Icons
- [ ] NO emojis anywhere
- [ ] All icons are SVG
- [ ] Consistent icon style (outlined, 2px stroke)

### Typography
- [ ] Proper hierarchy (eyebrow, title, body)
- [ ] Uses design system fonts

### Animations
- [ ] Smooth modal open/close
- [ ] Uses design system durations
- [ ] Respects reduced-motion preference

---

## 15. Mobile Responsiveness

- [ ] Resize browser to mobile width (375px)
- [ ] All modals should be readable
- [ ] No horizontal overflow
- [ ] Touch targets at least 44px

---

## 16. Accessibility

- [ ] Can navigate with keyboard only
- [ ] Tab order makes sense
- [ ] Focus visible on interactive elements
- [ ] Modals have proper ARIA labels
- [ ] Screen reader announces state changes

---

## Console Check

After running through all tests:
- [ ] No JavaScript errors in console
- [ ] No TypeScript errors
- [ ] No network errors (other than expected 401s when not logged in)

---

## Notes

Record any issues found:

| Issue | Severity | Steps to Reproduce | Notes |
|-------|----------|-------------------|-------|
|       |          |                   |       |

---

Last tested: _______________
Tested by: _______________

