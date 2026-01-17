# Ferni Design System - Figma Plugin

> Apply Ferni design tokens, persona themes, and lint for brand compliance.

## Features

### Tokens Tab

Browse and apply Ferni design tokens directly to your Figma elements:
- Color tokens
- Typography tokens
- Spacing tokens

Click any token to apply it to the current selection.

### Personas Tab

Apply complete persona themes with one click:
- **Ferni** - Life Coach (Sage Green)
- **Peter** - Researcher (Teal)
- **Alex** - Communicator (Slate Blue)
- **Maya** - Architect (Terracotta)
- **Jordan** - Celebrator (Coral)
- **Nayan** - Synthesizer (Golden)

### Lint Tab

Check your designs for brand compliance:
- Off-brand colors (warns if not using Ferni tokens)
- Non-standard fonts (should be Inter or Plus Jakarta Sans)
- Suggests closest Ferni token for fixes

## Menu Commands

Quick actions from the plugin menu:
- **Apply Ferni Theme** - Apply Ferni colors to selection
- **Apply [Persona] Theme** - Apply specific persona colors
- **Run Lint** - Check selection for brand issues
- **Sync Tokens** - Refresh tokens from design-system

## Installation

### From Figma Community

Search for "Ferni Design System" in Figma Community plugins.

### Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. In Figma: Plugins → Development → Import plugin from manifest
5. Select the `manifest.json` file

## Development

```bash
npm install
npm run watch  # Rebuild on changes
```

## Token Sync

Tokens are synced from the design-system repository. The plugin fetches:
- `design-system/tokens/colors.json`
- `design-system/tokens/typography.json`
- `design-system/tokens/spacing.json`

## License

MIT © Ferni
