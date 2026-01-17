# Ferni Design System - Figma Plugin Setup

## Local Installation (Development)

1. **Open Figma Desktop** (not the web version)

2. **Import the plugin**:
   - Go to **Plugins** → **Development** → **Import plugin from manifest...**
   - Navigate to this directory and select `manifest.json`

3. **Run the plugin**:
   - Go to **Plugins** → **Development** → **Ferni Design System**
   - Or use the menu commands for quick actions

## Features

### 🎨 Token Browser
- Browse all Ferni color tokens
- Click to apply to selected elements

### 👥 Persona Themes
One-click persona theming:
- **Ferni** (sage green) - Life Coach
- **Peter** (teal) - Researcher  
- **Alex** (slate blue) - Communicator
- **Maya** (terracotta) - Habit Architect
- **Jordan** (coral) - Celebration Catalyst
- **Nayan** (golden) - Wisdom Guide

### 🔍 Brand Linter
Check selected elements for:
- Off-brand colors (suggests closest Ferni token)
- Non-standard fonts (should use Inter or Plus Jakarta Sans)

## Quick Menu Commands

Right-click menu includes:
- Apply Ferni Theme
- Apply Peter Theme
- Apply Alex Theme
- Apply Maya Theme
- Apply Jordan Theme
- Apply Nayan Theme
- Run Lint
- Sync Tokens

## Building from Source

```bash
cd apps/figma-plugin
pnpm install
pnpm build
```

Output:
- `dist/code.js` - Plugin main code
- `dist/ui.js` - Plugin UI bundle
- `dist/ui.html` - Plugin UI entry

## Publishing to Figma Community

1. Go to [Figma Community Publishers](https://www.figma.com/community/publishers)
2. Click "Create a plugin"
3. Fill in plugin details:
   - Name: **Ferni Design System**
   - Description: Design tokens, persona themes, and brand linting for Ferni
   - Categories: Design Systems, Utilities
4. Upload the built files
5. Submit for review

## Troubleshooting

### Plugin not appearing
- Make sure you're using Figma Desktop, not the web version
- Restart Figma after importing

### Changes not reflecting
- Rebuild with `pnpm build`
- Re-import the manifest in Figma

### Lint not finding issues
- Make sure elements are selected before running lint
- Lint checks fills, strokes, and fonts
