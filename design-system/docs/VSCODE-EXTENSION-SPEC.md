# 💻 Ferni Design System VS Code Extension

> **Specification for a VS Code extension that brings Ferni's design tokens to developers.**

**Version**: Planning  
**Created**: January 2026  
**Status**: RFC (Request for Comments)

---

## Vision

A VS Code extension that:
1. **Autocompletes tokens** - Type `--color` and see all options
2. **Previews colors** - See hex values as inline swatches
3. **Validates usage** - Warns on off-brand colors
4. **Links to docs** - Jump to token definitions

### Why an Extension?

| Problem | Solution |
|---------|----------|
| Hard to remember token names | Autocomplete with fuzzy search |
| Can't see what colors look like | Inline color swatches |
| Accidentally using wrong colors | Real-time validation |
| Context switching to docs | Hover documentation |

---

## Features Overview

### 1. Token Autocomplete

```css
/* Type -- and get autocomplete */
.button {
  background-color: var(--|
                       ▼
  ┌─────────────────────────────────────┐
  │ 🟢 --color-ferni          #4a6741  │
  │ 🟦 --color-peter          #3a6b73  │
  │ 🟪 --color-alex           #5a6b8a  │
  │ ▢  --color-text-primary   #2C2520  │
  │ ▢  --color-background     #FFFCF8  │
  │ ⏱  --duration-normal      200ms    │
  │ 📐 --space-4              16px     │
  └─────────────────────────────────────┘
```

### 2. Color Preview

```css
/* Inline swatches in gutter */
.card {
  🟢│ background-color: var(--color-ferni);
  ▢ │ color: var(--color-text-primary);
  🟢│ border-color: var(--color-ferni-dark);
}
```

### 3. Hover Documentation

```css
.button {
  animation-duration: var(--duration-normal);
                          ▲
  ┌─────────────────────────────────────┐
  │ --duration-normal                   │
  │                                     │
  │ Value: 200ms                        │
  │ Category: Animation / Durations     │
  │                                     │
  │ Standard transition duration for    │
  │ most UI interactions.               │
  │                                     │
  │ Use for: hover states, focus rings, │
  │ small movements                     │
  │                                     │
  │ [View in Design System ↗]           │
  └─────────────────────────────────────┘
```

### 4. Brand Validation

```css
/* Squiggly warning on non-token colors */
.button {
  background-color: #7B68EE;
                    ~~~~~~~~
  ⚠️ Non-standard color. Consider using:
     var(--color-alex) #5a6b8a
     var(--color-ferni) #4a6741
```

### 5. Quick Fixes

```css
/* Code action on warnings */
.button {
  background-color: #7B68EE; /* Warning */
}
                    ▲
  💡 Quick Fix:
  ├─ Replace with var(--color-alex)
  ├─ Replace with nearest token
  └─ Add to ignore list
```

---

## Supported Files

| File Type | Features |
|-----------|----------|
| `.css` | Autocomplete, preview, validation |
| `.scss` | Autocomplete, preview, validation |
| `.less` | Autocomplete, preview, validation |
| `.tsx/.jsx` | In CSS-in-JS strings |
| `.ts/.js` | In template literals |
| `.vue` | In style blocks |
| `.svelte` | In style blocks |
| `.html` | In style attributes |

---

## Commands

### Command Palette

| Command | Description |
|---------|-------------|
| `Ferni: Show All Tokens` | Open token reference panel |
| `Ferni: Validate File` | Run brand validation on current file |
| `Ferni: Validate Workspace` | Run brand validation on all files |
| `Ferni: Sync Tokens` | Refresh tokens from source |
| `Ferni: Open Design System` | Open design.ferni.ai |
| `Ferni: Copy Token as CSS` | Copy selected token as CSS variable |
| `Ferni: Copy Token as JSON` | Copy selected token as JSON |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+F` | Show token picker |
| `Ctrl+.` on warning | Show quick fixes |

---

## Token Panel

Side panel showing all available tokens:

```
┌─────────────────────────────────────────────────────────────┐
│  FERNI DESIGN TOKENS                           [⟳] [⚙️]    │
├─────────────────────────────────────────────────────────────┤
│  🔍 Search tokens...                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📁 COLORS                                                  │
│  ├─ 📁 Persona                                              │
│  │   ├─ 🟢 --color-ferni         #4a6741    [📋]           │
│  │   ├─ 🟦 --color-peter         #3a6b73    [📋]           │
│  │   ├─ 🟪 --color-alex          #5a6b8a    [📋]           │
│  │   ├─ 🟫 --color-maya          #a67a6a    [📋]           │
│  │   ├─ 🟧 --color-jordan        #c4856a    [📋]           │
│  │   └─ 🟤 --color-nayan         #b8956a    [📋]           │
│  │                                                          │
│  ├─ 📁 Semantic                                             │
│  │   ├─ ▢ --color-text-primary   #2C2520    [📋]           │
│  │   ├─ ▢ --color-text-secondary #5C544A    [📋]           │
│  │   └─ ...                                                 │
│  │                                                          │
│  └─ 📁 Background                                           │
│      ├─ ▢ --color-background     #FFFCF8    [📋]           │
│      └─ ...                                                 │
│                                                             │
│  📁 ANIMATION                                               │
│  ├─ ⏱ --duration-fast           100ms       [📋]           │
│  ├─ ⏱ --duration-normal         200ms       [📋]           │
│  └─ ...                                                     │
│                                                             │
│  📁 SPACING                                                 │
│  ├─ 📐 --space-1                 4px         [📋]           │
│  ├─ 📐 --space-2                 8px         [📋]           │
│  └─ ...                                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Panel Features

- **Search** - Filter tokens by name or value
- **Copy** - Click [📋] to copy CSS variable
- **Insert** - Double-click to insert at cursor
- **Preview** - Color swatches inline
- **Sync** - Refresh from design-system repo

---

## Configuration

### Settings

```json
{
  "ferniDesignSystem.enabled": true,
  "ferniDesignSystem.tokenSource": "local",
  "ferniDesignSystem.tokenPath": "./design-system/tokens",
  "ferniDesignSystem.remoteTokenUrl": "https://raw.githubusercontent.com/ferni/design-system/main/tokens",
  "ferniDesignSystem.validation.enabled": true,
  "ferniDesignSystem.validation.severity": "warning",
  "ferniDesignSystem.validation.ignoredPatterns": [
    "**/node_modules/**",
    "**/dist/**"
  ],
  "ferniDesignSystem.colorPreview.enabled": true,
  "ferniDesignSystem.autocomplete.enabled": true,
  "ferniDesignSystem.autocomplete.includeValues": true
}
```

### Workspace Settings

```json
// .vscode/settings.json
{
  "ferniDesignSystem.tokenPath": "./design-system/tokens",
  "ferniDesignSystem.validation.ignoredFiles": [
    "legacy/**"
  ]
}
```

---

## Validation Rules

### Color Validation

| Rule | Severity | Description |
|------|----------|-------------|
| `off-brand-color` | Warning | Hardcoded color not in palette |
| `similar-token-exists` | Info | Color close to a token value |
| `prefer-variable` | Info | Hardcoded value has a token |

### Animation Validation

| Rule | Severity | Description |
|------|----------|-------------|
| `non-standard-duration` | Info | Duration not a token value |
| `non-standard-easing` | Info | Easing not a token value |

### Spacing Validation

| Rule | Severity | Description |
|------|----------|-------------|
| `non-standard-spacing` | Info | Spacing not a token value |

### Disable Rules

```css
/* ferni-disable-next-line off-brand-color */
.legacy-button {
  background-color: #legacy;
}

/* ferni-disable off-brand-color */
.legacy-section {
  background: #old;
  color: #older;
}
/* ferni-enable off-brand-color */
```

---

## Technical Implementation

### Extension Structure

```
ferni-vscode/
├── src/
│   ├── extension.ts           # Main entry point
│   ├── providers/
│   │   ├── completion.ts      # Autocomplete provider
│   │   ├── hover.ts           # Hover documentation
│   │   ├── colorDecorator.ts  # Inline color swatches
│   │   ├── diagnostics.ts     # Validation/linting
│   │   └── codeActions.ts     # Quick fixes
│   ├── tokens/
│   │   ├── loader.ts          # Token loading/syncing
│   │   ├── parser.ts          # Token JSON parsing
│   │   └── search.ts          # Token search/filter
│   ├── views/
│   │   └── tokenPanel.ts      # Side panel webview
│   └── utils/
│       ├── colorUtils.ts      # Color conversion
│       └── fileUtils.ts       # File handling
├── package.json
├── tsconfig.json
└── README.md
```

### Completion Provider

```typescript
import * as vscode from 'vscode';
import { loadTokens, Token } from './tokens/loader';

export class FerniCompletionProvider implements vscode.CompletionItemProvider {
  private tokens: Token[] = [];

  async activate() {
    this.tokens = await loadTokens();
  }

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.CompletionItem[] {
    const linePrefix = document
      .lineAt(position)
      .text.substr(0, position.character);

    // Check if we're in a CSS variable context
    if (!linePrefix.includes('var(--')) {
      return [];
    }

    return this.tokens.map(token => {
      const item = new vscode.CompletionItem(
        token.name,
        vscode.CompletionItemKind.Variable
      );
      
      item.detail = token.value;
      item.documentation = new vscode.MarkdownString(
        `**${token.name}**\n\n` +
        `Value: \`${token.value}\`\n\n` +
        `Category: ${token.category}\n\n` +
        token.description
      );
      
      // Add color preview for color tokens
      if (token.category === 'color') {
        item.kind = vscode.CompletionItemKind.Color;
      }
      
      return item;
    });
  }
}
```

### Color Decorator

```typescript
import * as vscode from 'vscode';
import { tokens } from './tokens/loader';

export function decorateColors(editor: vscode.TextEditor) {
  const decorations: vscode.DecorationOptions[] = [];
  const text = editor.document.getText();
  
  // Find all var(--color-*) references
  const colorVarRegex = /var\(--color-[\w-]+\)/g;
  let match;
  
  while ((match = colorVarRegex.exec(text)) !== null) {
    const tokenName = match[0].replace('var(', '').replace(')', '');
    const token = tokens.find(t => t.name === tokenName);
    
    if (token) {
      const startPos = editor.document.positionAt(match.index);
      const endPos = editor.document.positionAt(match.index + match[0].length);
      
      decorations.push({
        range: new vscode.Range(startPos, endPos),
        renderOptions: {
          before: {
            contentText: '■',
            color: token.value,
            margin: '0 4px 0 0'
          }
        }
      });
    }
  }
  
  editor.setDecorations(colorDecorationType, decorations);
}
```

### Diagnostics Provider

```typescript
import * as vscode from 'vscode';
import { tokens, findSimilarToken } from './tokens/loader';

export function provideDiagnostics(
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const text = document.getText();
  
  // Find hardcoded hex colors
  const hexRegex = /#[0-9a-fA-F]{3,8}/g;
  let match;
  
  while ((match = hexRegex.exec(text)) !== null) {
    const hexColor = match[0].toLowerCase();
    
    // Check if this color is already a token
    const isToken = tokens.some(t => 
      t.category === 'color' && t.value.toLowerCase() === hexColor
    );
    
    if (!isToken) {
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      
      const similar = findSimilarToken(hexColor);
      
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(startPos, endPos),
        `Non-standard color. Consider using ${similar?.name || 'a design token'}.`,
        vscode.DiagnosticSeverity.Warning
      );
      
      diagnostic.code = 'off-brand-color';
      diagnostic.source = 'Ferni Design System';
      
      diagnostics.push(diagnostic);
    }
  }
  
  return diagnostics;
}
```

---

## Package.json

```json
{
  "name": "ferni-design-system",
  "displayName": "Ferni Design System",
  "description": "Design tokens, autocomplete, and validation for Ferni",
  "version": "1.0.0",
  "publisher": "ferni",
  "engines": {
    "vscode": "^1.85.0"
  },
  "categories": [
    "Other",
    "Linters"
  ],
  "activationEvents": [
    "onLanguage:css",
    "onLanguage:scss",
    "onLanguage:less",
    "onLanguage:typescript",
    "onLanguage:typescriptreact",
    "onLanguage:javascript",
    "onLanguage:javascriptreact",
    "onLanguage:vue",
    "onLanguage:svelte"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "ferniDesignSystem.showTokens",
        "title": "Ferni: Show All Tokens"
      },
      {
        "command": "ferniDesignSystem.validateFile",
        "title": "Ferni: Validate File"
      },
      {
        "command": "ferniDesignSystem.syncTokens",
        "title": "Ferni: Sync Tokens"
      }
    ],
    "configuration": {
      "title": "Ferni Design System",
      "properties": {
        "ferniDesignSystem.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable the Ferni Design System extension"
        },
        "ferniDesignSystem.tokenPath": {
          "type": "string",
          "default": "./design-system/tokens",
          "description": "Path to design tokens"
        },
        "ferniDesignSystem.validation.enabled": {
          "type": "boolean",
          "default": true,
          "description": "Enable design validation"
        }
      }
    },
    "views": {
      "explorer": [
        {
          "id": "ferniTokens",
          "name": "Ferni Tokens"
        }
      ]
    },
    "colors": [
      {
        "id": "ferniDesignSystem.warningBackground",
        "description": "Background color for off-brand warnings",
        "defaults": {
          "dark": "#ff990033",
          "light": "#ff990033"
        }
      }
    ]
  }
}
```

---

## Distribution

### VS Code Marketplace

1. Publish to VS Code Marketplace
2. Free for all users
3. Auto-updates enabled

### Installation

```bash
# From marketplace
ext install ferni.ferni-design-system

# Or from VSIX
code --install-extension ferni-design-system-1.0.0.vsix
```

---

## Roadmap

### v1.0.0 (MVP)

- [ ] Token autocomplete
- [ ] Color preview in gutter
- [ ] Hover documentation
- [ ] Basic validation
- [ ] Token panel view

### v1.1.0

- [ ] Quick fixes
- [ ] Animation token support
- [ ] Workspace-wide validation
- [ ] Settings UI

### v1.2.0

- [ ] Remote token sync
- [ ] Go to definition
- [ ] Brand voice linting (copy)
- [ ] Integration with Figma plugin

---

**© 2026 Ferni. Developer tools for emotional intelligence.**

*"The best tools are invisible until you need them."*
