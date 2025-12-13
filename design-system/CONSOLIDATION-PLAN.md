# Brand Asset Consolidation Plan

## Executive Summary

This document outlines the consolidation of Ferni's brand assets from 4+ scattered locations into a single source of truth in `design-system/`.

## Current State (Before)

```
voiceai/
├── brand/                              # DEPRECATED - will be symlink
│   ├── *.md (guidelines)
│   ├── logos/ (26 files)
│   ├── icons/ (46 files)
│   └── favicons/ (3 files)
├── design-system/
│   ├── tokens/ (JSON - source of truth for values)
│   ├── assets/logos/ (44 files - DUPLICATES)
│   └── dist/ (generated CSS/TS)
├── frontend-typescript/public/
│   ├── design-system/ (COPY of dist/)
│   ├── icons/ (26 files - MORE DUPLICATES)
│   └── sounds/ (audio files)
└── apps/marketing/
    └── (marketing-specific variants - okay to keep)
```

**Problems:**
- 54+ duplicate logo files
- 3 different `tokens.css` files being imported
- No single source of truth for binary assets
- Manual copying between directories

## Target State (After)

```
voiceai/
├── design-system/                      # 🎯 SINGLE SOURCE OF TRUTH
│   ├── tokens/                         # JSON design tokens (edit these)
│   │   ├── colors.json
│   │   ├── typography.json
│   │   ├── spacing.json
│   │   ├── animation.json
│   │   └── effects.json
│   ├── assets/                         # Binary assets (edit these)
│   │   ├── logos/
│   │   │   ├── ferni-logo.svg         # Master SVG
│   │   │   ├── ferni-logo-dark.svg
│   │   │   └── ferni-logo-simple.svg
│   │   ├── icons/
│   │   │   ├── app-icon.svg           # Master app icon
│   │   │   ├── app-icon-ios.svg
│   │   │   └── app-icon-android.svg
│   │   ├── favicons/
│   │   │   └── favicon.svg            # Master favicon
│   │   └── sounds/                     # Audio assets (moved from frontend)
│   │       ├── connect.mp3
│   │       └── ...
│   ├── brand/                          # Brand documentation
│   │   ├── GUIDELINES.md
│   │   ├── SCREEN-GUIDELINES.md
│   │   └── brand-book.html
│   ├── dist/                           # Generated outputs (DON'T EDIT)
│   │   ├── tokens.css
│   │   ├── tokens.ts
│   │   ├── tailwind.config.js
│   │   └── assets/                     # Generated PNG sizes
│   │       ├── logos/
│   │       ├── icons/
│   │       └── favicons/
│   ├── build.js                        # Generates dist/ from tokens/ and assets/
│   └── README.md
│
├── brand/                              # SYMLINK → design-system/brand/
│
├── frontend-typescript/public/
│   └── design-system/                  # COPIED by build.js (don't edit)
│       ├── tokens.css
│       ├── tokens.ts
│       ├── assets/                     # Copied logos, icons, favicons
│       └── sounds/                     # Copied sounds
│
└── apps/marketing/                     # Marketing variants (keep separate)
    └── assets/                         # Platform-specific crops, social sizes
```

## Migration Steps

### Phase 1: Consolidate Assets into design-system/

1. **Move sounds to design-system**
   ```bash
   mv frontend-typescript/public/sounds design-system/assets/sounds
   ```

2. **Consolidate logos** (keep master SVGs only)
   - Keep: `ferni-logo.svg`, `ferni-logo-dark.svg`, `ferni-logo-simple.svg`
   - Generate: All PNG sizes via build.js

3. **Consolidate icons** (keep master SVGs only)
   - Keep: `app-icon.svg`, `app-icon-ios.svg`, `app-icon-android.svg`
   - Generate: All PNG sizes via build.js

4. **Move brand guidelines**
   ```bash
   mv design-system/brand/FERNI-BRAND-GUIDELINES.md design-system/brand/GUIDELINES.md
   mv design-system/brand/FERNI-SCREEN-GUIDELINES.md design-system/brand/SCREEN-GUIDELINES.md
   mv brand/brand-book.html design-system/brand/brand-book.html
   ```

### Phase 2: Update Build System

1. **Enhance build.js** to:
   - Copy `dist/` → `frontend-typescript/public/design-system/`
   - Generate PNG sizes from SVG masters using Sharp
   - Generate favicon formats (ico, png sizes)
   - Copy sounds

2. **Add npm scripts**
   ```json
   {
     "build:design-system": "node design-system/build.js",
     "build:assets": "node design-system/build-assets.js",
     "build:brand": "npm run build:design-system && npm run build:assets"
   }
   ```

### Phase 3: Update Imports

1. **Update all token imports** to use:
   ```css
   @import 'design-system/dist/tokens.css';
   ```

2. **Update asset paths** to use:
   ```html
   <link rel="icon" href="/design-system/assets/favicons/favicon.svg">
   <img src="/design-system/assets/logos/ferni-logo.svg">
   ```

### Phase 4: Create Symlinks for Backwards Compatibility

```bash
# Create symlink for legacy brand/ imports
ln -s design-system/brand brand
```

### Phase 5: Cleanup

1. Delete duplicate files:
   - `brand/logos/*.png` (keep SVGs)
   - `brand/icons/png/` (generated)
   - `design-system/assets/logos/*.png` (generated)
   - `frontend-typescript/public/icons/` (now in design-system)

2. Update `.gitignore`:
   ```
   # Generated assets (rebuild with npm run build:brand)
   design-system/dist/assets/
   frontend-typescript/public/design-system/
   ```

## File Mapping

| Old Location | New Location | Notes |
|--------------|--------------|-------|
| `design-system/brand/FERNI-BRAND-GUIDELINES.md` | `design-system/brand/GUIDELINES.md` | |
| `design-system/brand/FERNI-SCREEN-GUIDELINES.md` | `design-system/brand/SCREEN-GUIDELINES.md` | |
| `brand/brand-book.html` | `design-system/brand/brand-book.html` | |
| `brand/ferni-design-tokens.css` | DELETE | Use `design-system/dist/tokens.css` |
| `brand/logos/*.svg` | `design-system/assets/logos/` | Keep only masters |
| `brand/logos/*.png` | DELETE | Generated by build |
| `brand/icons/*.svg` | `design-system/assets/icons/` | |
| `brand/icons/png/*.png` | DELETE | Generated by build |
| `brand/favicons/*.svg` | `design-system/assets/favicons/` | |
| `frontend-typescript/public/sounds/` | `design-system/assets/sounds/` | |
| `frontend-typescript/public/icons/` | DELETE | Generated by build |
| `frontend-typescript/public/design-system/` | GENERATED | Copied by build |

## Benefits

1. **Single Source of Truth** - One place to update assets
2. **Automated PNG Generation** - SVG masters generate all sizes
3. **Consistent Paths** - All imports use `design-system/`
4. **Better DX** - `npm run build:brand` rebuilds everything
5. **Smaller Repo** - No duplicate PNGs in git
6. **Clear Ownership** - design-system/ owns brand, frontend consumes

## Implementation Checklist

- [ ] Create `design-system/assets/` structure
- [ ] Move sounds to design-system
- [ ] Consolidate logo SVGs (remove PNG duplicates)
- [ ] Consolidate icon SVGs (remove PNG duplicates)
- [ ] Move brand guidelines to design-system/brand/
- [ ] Create `build-assets.js` for PNG generation
- [ ] Update `build.js` to copy to frontend
- [ ] Update all CSS imports (77 files reference tokens.css)
- [ ] Update all asset paths in HTML
- [ ] Create symlink for backwards compatibility
- [ ] Delete duplicate files
- [ ] Update .gitignore
- [ ] Update README documentation
- [ ] Test build in CI

