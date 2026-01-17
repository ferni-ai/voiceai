# Chromatic Visual Regression Testing Setup

Chromatic captures screenshots of every Storybook story and compares them across builds to catch visual regressions.

## Quick Setup (5 minutes)

### Step 1: Create Chromatic Project

1. Go to [chromatic.com](https://www.chromatic.com/) and sign in with GitHub
2. Click "Add project"
3. Select the `voiceai` repository
4. Copy the **Project Token** shown

### Step 2: Add Secret to GitHub

1. Go to your repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add these secrets:
   - `CHROMATIC_PROJECT_TOKEN` = your project token
   - `CHROMATIC_APP_ID` = your app ID (shown in Chromatic dashboard URL)

### Step 3: Test Locally (Optional)

```bash
# Run Chromatic locally with your token
cd design-system
CHROMATIC_PROJECT_TOKEN=your_token pnpm chromatic
```

## How It Works

### On Pull Requests
1. Chromatic builds Storybook
2. Captures screenshots of all 32 stories
3. Compares against baseline (main branch)
4. Comments on PR with visual diff link
5. Shows which components changed

### On Main Branch
1. Screenshots become the new baseline
2. Auto-accepts changes (no review needed)

## Workflow Triggers

The Chromatic workflow runs when:
- Push to `main` branch with design-system changes
- Pull request with design-system changes
- Manual trigger via GitHub Actions

## Files

| File | Purpose |
|------|---------|
| `.github/workflows/chromatic.yml` | GitHub Action workflow |
| `design-system/package.json` | `chromatic` and `chromatic:ci` scripts |

## Commands

```bash
# Run locally (requires token)
pnpm chromatic

# Run in CI mode (auto-accepts)
pnpm chromatic:ci
```

## Reviewing Visual Changes

1. Open the Chromatic build link in PR comment
2. Review each changed component
3. Accept or deny changes
4. Changes are tracked in Chromatic dashboard

## Component Count

Current Storybook has **32 stories**:
- Avatar (4 stories)
- Badge (6 stories)
- Button (5 stories)
- Card (6 stories)
- Celebration (2 stories)
- Dialog (2 stories)
- Input (7 stories)
- Select (5 stories)
- Spinner (4 stories)
- Switch (6 stories)
- Textarea (5 stories)
- Toast (3 stories)
- Tooltip (6 stories)
- Waveform (2 stories)
- + Token and Pattern stories

## Troubleshooting

### Build Fails
- Ensure Storybook builds locally: `pnpm build-storybook`
- Check that all stories render without errors

### Screenshots Look Wrong
- Check CSS loading in Storybook
- Ensure fonts are loading (may need font preloading)

### Token Issues
- Regenerate token in Chromatic dashboard
- Update GitHub secret with new token
