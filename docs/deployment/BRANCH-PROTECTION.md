# Branch Protection Rules

## Recommended GitHub Settings

Navigate to: **Settings → Branches → Add rule** for `main`

### Required Settings

| Setting | Value | Why |
|---------|-------|-----|
| **Require pull request before merging** | Yes | No direct pushes to main |
| **Require approvals** | 1 | Code review for all changes |
| **Dismiss stale reviews** | Yes | Re-review after new commits |
| **Require status checks** | Yes | CI must pass |
| **Require branches up to date** | Yes | Prevent merge conflicts |
| **Require conversation resolution** | Yes | Address all feedback |
| **Require signed commits** | Optional | Extra security |
| **Include administrators** | Yes | No bypasses |

### Required Status Checks

These checks must pass before merge:

```
ci / typecheck
ci / lint
ci / test
ci / build
```

### How to Configure

1. Go to repo **Settings** → **Branches**
2. Click **Add branch protection rule**
3. Branch name pattern: `main`
4. Enable settings above
5. Click **Create**

### Bypass for Emergencies

Admins can bypass in true emergencies, but must:
1. Document the reason in the commit message
2. Create a follow-up PR to fix any issues
3. Notify the team

### Local Workflow

With these rules, your workflow becomes:

```bash
# Create feature branch
git checkout -b feat/my-feature

# Make changes, commit
git add . && git commit -m "feat: add feature"

# Push and create PR
git push -u origin feat/my-feature
gh pr create

# After approval and CI passes, merge via GitHub UI
```
