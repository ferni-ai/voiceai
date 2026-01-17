# Ferni Design System - VS Code Extension

> Design token autocomplete, color preview, and brand validation for Ferni.

## Features

### Token Autocomplete

Type `var(--` in CSS, SCSS, or JavaScript and get suggestions for all Ferni design tokens with values and previews.

### Color Preview

See inline color swatches for Ferni color tokens in your code.

### Brand Validation

Get warnings when using hardcoded colors that aren't part of the Ferni palette.

### Hover Documentation

Hover over any Ferni token to see its value and description.

## Commands

| Command | Description |
|---------|-------------|
| `Ferni: Show All Tokens` | Open panel with all available tokens |
| `Ferni: Validate File` | Run brand validation on current file |
| `Ferni: Validate Workspace` | Run brand validation on all files |
| `Ferni: Sync Tokens` | Refresh tokens from source |
| `Ferni: Open Design System` | Open design.ferni.ai |

## Configuration

```json
{
  "ferniDesignSystem.enabled": true,
  "ferniDesignSystem.tokenSource": "local",
  "ferniDesignSystem.tokenPath": "./design-system/tokens",
  "ferniDesignSystem.validation.enabled": true,
  "ferniDesignSystem.validation.severity": "warning",
  "ferniDesignSystem.colorPreview.enabled": true,
  "ferniDesignSystem.autocomplete.enabled": true
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Shift+F` | Open token picker |
| `Cmd+.` | Quick fix on validation warning |

## Supported Languages

- CSS
- SCSS
- Less
- TypeScript
- JavaScript
- TypeScript React (TSX)
- JavaScript React (JSX)
- Vue
- Svelte
- HTML

## Installation

### From Marketplace

Search for "Ferni Design System" in VS Code extensions.

### Manual

```bash
cd apps/vscode-extension
npm install
npm run package
# Install the .vsix file
```

## Development

```bash
npm install
npm run watch
# Press F5 to debug
```

## License

MIT © Ferni
