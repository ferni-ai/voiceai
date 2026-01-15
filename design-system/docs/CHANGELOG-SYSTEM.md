# 📋 Design System Changelog System

> **Automated changelog generation and version management for Ferni Design System.**

**Version**: Planning  
**Created**: January 2026  
**Status**: RFC (Request for Comments)

---

## Vision

A changelog system that:
1. **Auto-generates** from commits and PRs
2. **Categorizes** changes by type and impact
3. **Notifies** stakeholders of updates
4. **Provides** migration guides for breaking changes

### Why Automated?

| Manual Process | Automated Solution |
|----------------|-------------------|
| Forgetting to update | Triggered by merge |
| Inconsistent format | Template-based |
| Missing changes | Scans all commits |
| No notifications | Slack/email integration |

---

## Changelog Format

### CHANGELOG.md

```markdown
# Ferni Design System Changelog

All notable changes to the Ferni Design System will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- New celebration patterns for streak milestones
- Haptic feedback for iOS 18 adaptive haptics

### Changed
- Increased micro-expression duration from 60ms to 80ms

---

## [2.1.0] - 2026-01-20

### Added
- New celebration patterns for milestone achievements (#142)
- Haptic feedback for iOS 18 adaptive haptics (#138)
- React Native component library (beta) (#135)

### Changed
- Increased micro-expression duration from 60ms to 80ms based on user testing (#141)
- Updated persona colors for better accessibility contrast (#139)
  - Peter: #3a6b73 → #3a6b73 (no change, confirmed)
  - Maya: #a67a6a → #a06a5a (improved contrast)

### Fixed
- Animation timing issue on Safari 18 (#140)
- Circadian awareness not respecting user timezone (#137)

### Migration Guide
No breaking changes in this release.

---

## [2.0.0] - 2026-01-01 🎉

### Breaking Changes

⚠️ **This release contains breaking changes. Please read carefully.**

#### Color Token Rename

All color tokens have been renamed for consistency:

| Old Name | New Name |
|----------|----------|
| `--ferni-green` | `--color-ferni` |
| `--peter-teal` | `--color-peter` |
| `--text-dark` | `--color-text-primary` |

**Migration:**
```bash
# Run the migration script
npx @ferni/codemod color-tokens-v2
```

#### Animation Duration Changes

Default durations have been updated:

| Token | Old Value | New Value |
|-------|-----------|-----------|
| `--duration-fast` | 100ms | 150ms |
| `--duration-normal` | 200ms | 250ms |

**Migration:**
Review animations and adjust if timing feels different.

### Added
- Ferni EQ system with 5 emotional intelligence capabilities
- New persona: Nayan (premium)
- Circadian theming tokens
- Relationship depth tokens

### Changed
- Complete token restructure (see breaking changes)
- Typography scale refined

### Removed
- Legacy `--ferni-*` color tokens (use `--color-*` instead)
- Deprecated `animation-old.json` file

---

## [1.5.0] - 2025-12-15

... (previous releases)
```

---

## Version Strategy

### Semantic Versioning

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking change | MAJOR (X.0.0) | Token rename |
| New feature | MINOR (0.X.0) | New component |
| Bug fix | PATCH (0.0.X) | Color correction |

### Pre-release Versions

```
2.0.0-beta.1    # Beta testing
2.0.0-rc.1      # Release candidate
2.0.0           # Stable release
```

---

## Automation

### GitHub Action: Changelog Generation

```yaml
# .github/workflows/changelog.yml
name: Update Changelog

on:
  push:
    branches: [main]
    paths:
      - 'design-system/**'
  pull_request:
    types: [closed]
    branches: [main]

jobs:
  changelog:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Generate Changelog Entry
        uses: actions/github-script@v7
        with:
          script: |
            const { generateChangelogEntry } = require('./scripts/changelog-generator.js');
            const entry = await generateChangelogEntry({
              pr: context.payload.pull_request,
              commits: await github.rest.pulls.listCommits({
                owner: context.repo.owner,
                repo: context.repo.repo,
                pull_number: context.payload.pull_request.number
              })
            });
            return entry;
      
      - name: Update CHANGELOG.md
        run: |
          node scripts/update-changelog.js
      
      - name: Commit Changelog
        run: |
          git config user.name "Ferni Bot"
          git config user.email "bot@ferni.ai"
          git add CHANGELOG.md
          git commit -m "docs: update changelog for PR #${{ github.event.pull_request.number }}"
          git push
```

### Changelog Generator Script

```typescript
// scripts/changelog-generator.ts

interface ChangelogEntry {
  type: 'added' | 'changed' | 'fixed' | 'removed' | 'deprecated' | 'security';
  description: string;
  pr?: number;
  breaking?: boolean;
  migration?: string;
}

const COMMIT_TYPES = {
  'feat': 'added',
  'fix': 'fixed',
  'change': 'changed',
  'remove': 'removed',
  'deprecate': 'deprecated',
  'security': 'security',
};

export async function generateChangelogEntry(options: {
  pr: PullRequest;
  commits: Commit[];
}): Promise<ChangelogEntry[]> {
  const entries: ChangelogEntry[] = [];
  
  for (const commit of options.commits) {
    // Parse conventional commit
    const match = commit.message.match(/^(\w+)(\(.+\))?(!)?:\s*(.+)/);
    if (!match) continue;
    
    const [, type, scope, breaking, description] = match;
    
    entries.push({
      type: COMMIT_TYPES[type] || 'changed',
      description: description,
      pr: options.pr.number,
      breaking: !!breaking,
    });
  }
  
  return entries;
}

export function formatChangelog(entries: ChangelogEntry[]): string {
  const grouped = groupBy(entries, 'type');
  let output = '';
  
  const order = ['added', 'changed', 'deprecated', 'removed', 'fixed', 'security'];
  
  for (const type of order) {
    if (!grouped[type]?.length) continue;
    
    output += `### ${capitalize(type)}\n`;
    for (const entry of grouped[type]) {
      output += `- ${entry.description}`;
      if (entry.pr) output += ` (#${entry.pr})`;
      if (entry.breaking) output += ` ⚠️ BREAKING`;
      output += '\n';
    }
    output += '\n';
  }
  
  return output;
}
```

---

## Commit Convention

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description | Changelog Section |
|------|-------------|-------------------|
| `feat` | New feature | Added |
| `fix` | Bug fix | Fixed |
| `change` | Modification | Changed |
| `remove` | Removal | Removed |
| `deprecate` | Deprecation | Deprecated |
| `docs` | Documentation | (not included) |
| `style` | Formatting | (not included) |
| `refactor` | Refactoring | (not included) |
| `test` | Tests | (not included) |

### Scopes

| Scope | Description |
|-------|-------------|
| `tokens` | Design tokens |
| `colors` | Color system |
| `animation` | Animation/motion |
| `typography` | Typography |
| `components` | UI components |
| `docs` | Documentation |

### Examples

```bash
# New feature
feat(tokens): add circadian awareness tokens

# Bug fix
fix(animation): correct spring easing curve

# Breaking change (note the !)
feat(colors)!: rename all color tokens to --color-* format

BREAKING CHANGE: All color tokens have been renamed.
See migration guide in CHANGELOG.md.

# With PR reference
feat(components): add Avatar celebration state (#142)
```

---

## Release Process

### 1. Prepare Release

```bash
# Create release branch
git checkout -b release/2.1.0

# Bump version
npm version minor

# Update CHANGELOG
node scripts/prepare-release.js 2.1.0
```

### 2. Review Changes

```markdown
## [2.1.0] - 2026-01-20

### Added
- New celebration patterns (#142)
- Haptic feedback for iOS 18 (#138)

### Changed
- Micro-expression duration (#141)

### Fixed
- Safari animation timing (#140)
```

### 3. Create Release

```bash
# Merge to main
git checkout main
git merge release/2.1.0

# Create tag
git tag v2.1.0
git push origin v2.1.0

# Publish
npm publish
```

### 4. Notify Stakeholders

Automated notifications sent to:
- Slack: #design-system-updates
- Email: design-system-subscribers@ferni.ai
- GitHub: Release notes

---

## Notification System

### Slack Integration

```typescript
// scripts/notify-slack.ts

interface ChangelogNotification {
  version: string;
  date: string;
  changes: {
    added: string[];
    changed: string[];
    fixed: string[];
    breaking: string[];
  };
}

export async function notifySlack(changelog: ChangelogNotification) {
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🎨 Design System v${changelog.version}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Released on ${changelog.date}`,
      },
    },
  ];
  
  if (changelog.changes.breaking.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚠️ *Breaking Changes*\n${changelog.changes.breaking.map(c => `• ${c}`).join('\n')}`,
      },
    });
  }
  
  if (changelog.changes.added.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `✨ *Added*\n${changelog.changes.added.map(c => `• ${c}`).join('\n')}`,
      },
    });
  }
  
  // ... more sections
  
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    body: JSON.stringify({ blocks }),
  });
}
```

### Email Digest

Weekly email to subscribers:
- Summary of changes
- Breaking change alerts
- Migration guides
- Upcoming deprecations

---

## Migration Guides

### Format

```markdown
## Migration Guide: v1.x → v2.0

### Color Token Rename

**Impact:** High - All projects using color tokens

**What Changed:**
All color tokens have been renamed from `--ferni-*` to `--color-*` for consistency.

**Automated Migration:**
```bash
npx @ferni/codemod color-tokens-v2
```

**Manual Migration:**
If the codemod doesn't work for your setup:

1. Find all uses of old tokens:
   ```bash
   grep -r "--ferni-" ./src
   ```

2. Replace with new tokens:
   | Old | New |
   |-----|-----|
   | `--ferni-green` | `--color-ferni` |
   | `--peter-teal` | `--color-peter` |

### Animation Duration Changes

**Impact:** Medium - Animations may feel slightly different

**What Changed:**
Default durations have been increased for better accessibility.

**Migration:**
Review animations and adjust if needed. No automated migration required.
```

---

## RSS Feed

```xml
<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Ferni Design System Changelog</title>
  <link href="https://design.ferni.ai/changelog.xml" rel="self"/>
  <link href="https://design.ferni.ai/changelog"/>
  <updated>2026-01-20T00:00:00Z</updated>
  <id>https://design.ferni.ai/changelog</id>
  
  <entry>
    <title>v2.1.0</title>
    <link href="https://design.ferni.ai/changelog#2.1.0"/>
    <id>https://design.ferni.ai/changelog#2.1.0</id>
    <updated>2026-01-20T00:00:00Z</updated>
    <summary>New celebration patterns, haptic feedback, bug fixes</summary>
    <content type="html">
      <![CDATA[
        <h3>Added</h3>
        <ul>
          <li>New celebration patterns for milestone achievements</li>
          <li>Haptic feedback for iOS 18 adaptive haptics</li>
        </ul>
        ...
      ]]>
    </content>
  </entry>
</feed>
```

---

## CLI Commands

```bash
# View changelog
ferni changelog

# View specific version
ferni changelog 2.1.0

# Generate changelog for unreleased changes
ferni changelog generate

# Bump version
ferni changelog bump patch|minor|major

# Create release
ferni changelog release 2.1.0 --notes "Release notes here"
```

---

## Roadmap

### v1.0.0 (MVP)

- [ ] CHANGELOG.md format
- [ ] GitHub Action for generation
- [ ] Conventional commit parsing
- [ ] Slack notifications

### v1.1.0

- [ ] RSS feed
- [ ] Email digest
- [ ] Migration guide generator
- [ ] Breaking change detector

### v1.2.0

- [ ] CLI commands
- [ ] Figma plugin integration
- [ ] VS Code extension integration
- [ ] Public changelog page

---

**© 2026 Ferni. Keeping everyone in sync.**

*"The best changelog is one that writes itself."*
