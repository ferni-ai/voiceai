# ⚠️ DEPRECATED - See design-system/

> **This folder is deprecated.** Brand assets have been consolidated into `design-system/`.

## New Location

All brand assets and documentation are now managed in the design system:

| What | Old Location | New Location |
|------|--------------|--------------|
| **Brand Guidelines** | `brand/FERNI-BRAND-GUIDELINES.md` | `design-system/brand/GUIDELINES.md` |
| **Screen Guidelines** | `brand/FERNI-SCREEN-GUIDELINES.md` | `design-system/brand/SCREEN-GUIDELINES.md` |
| **Brand Book** | `brand/brand-book.html` | `design-system/brand/brand-book.html` |
| **Logo SVGs** | `brand/logos/*.svg` | `design-system/assets/logos/` |
| **App Icons** | `brand/icons/*.svg` | `design-system/assets/icons/` |
| **Favicons** | `brand/favicons/*.svg` | `design-system/assets/favicons/` |
| **Design Tokens** | `brand/ferni-design-tokens.css` | `design-system/dist/tokens.css` |

## Building Assets

```bash
# Build all design system assets
npm run build:design-system

# This generates:
# - frontend-typescript/public/design-system/ (all assets)
# - Legacy paths maintained for backwards compatibility
```

## Migration Complete

This folder is kept for backwards compatibility. Files here may be removed in a future release.

**For new work, always use `design-system/` as the source of truth.**

See: [`design-system/README.md`](../design-system/README.md)
