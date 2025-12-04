# iOS App Icons

When you run `npx cap add ios`, Capacitor creates an Xcode project.
You'll need to add app icons in Xcode's asset catalog.

## Required Icon Sizes

| Size | Scale | Filename |
|------|-------|----------|
| 20pt | @2x | 40x40 |
| 20pt | @3x | 60x60 |
| 29pt | @2x | 58x58 |
| 29pt | @3x | 87x87 |
| 40pt | @2x | 80x80 |
| 40pt | @3x | 120x120 |
| 60pt | @2x | 120x120 |
| 60pt | @3x | 180x180 |
| 1024pt | @1x | 1024x1024 (App Store) |

## Source Icons

Pre-generated icons are available in:
- `brand/icons/png/ios-*.png`

## Adding Icons

1. Open `ios/App/App.xcworkspace` in Xcode
2. Select Assets.xcassets
3. Select AppIcon
4. Drag icons from brand/icons/png/ to the appropriate slots

Or use a tool like:
- [App Icon Generator](https://appicon.co/)
- [Icon Set Creator](https://apps.apple.com/app/icon-set-creator/id939343785)
