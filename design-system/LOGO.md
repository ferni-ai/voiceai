# Ferni Logo

The Ferni logo is the **Ferni orb**: a Ferni Sage circle with two Luxo-style
eyes. It's the same character as the avatar, reduced to its essentials.

> The old "FE" monogram and the single-eye "Three Stones" mark (iris + pupil)
> are **retired**. If you find either in docs, code or assets, replace it.

---

## Rules

1. **Eyes are opaque white ellipses. No pupils, no iris.** Expression comes
   from the eye *shape* (scale/rotation), never from a pupil position.
2. **Catchlights are allowed**: small white dots inside the eye.
3. The orb is Ferni Sage `#4a6741` (`--persona-ferni-primary`), optionally
   with a subtle gradient to a slightly darker sage and a faint outer ring.
4. Don't recolor the orb outside the variants below, stretch it, rotate it, or
   add shadows/glows beyond those in the shipped files.

`pnpm brand:check` fails if a logo or avatar SVG draws a pupil.

---

## Canonical Files

All logo files live in `design-system/assets/logos/` — nowhere else is
canonical (copies under `apps/*/public` are build outputs).

| File                             | Use                                              |
| -------------------------------- | ------------------------------------------------ |
| `ferni-logo.svg`                 | **Primary** — orb with ring, gradient, catchlights |
| `ferni-logo-simple.svg`          | No ring — small sizes, app icons                 |
| `ferni-logo-dark.svg`            | For dark backgrounds                             |
| `logo-monochrome-dark.svg`       | Single-color (Natural Ink) orb for light backgrounds |
| `ferni-favicon.svg`              | Favicon, optimized for 16–32px                   |
| `ferni-logo-expressive.svg`      | Animated, CSS-driven expressions                 |
| `ferni-logo-animated.svg`        | Animated eyes on a solid base                    |
| `ferni-logo.lottie.json`         | Lottie intro animation (iOS/Android/web)         |
| `logo-wordmark-horizontal.svg`   | Orb + "Ferni" wordmark, side by side             |
| `logo-wordmark-stacked.svg`      | Orb above wordmark                               |
| `ferni-text-logo.svg`            | Wordmark only                                    |
| `ferni-eyes-only.svg`            | Eyes without the orb, for custom backgrounds     |
| `personas/*-avatar.svg`          | Per-persona avatars (same eye rules)             |

`logo-primary.svg`, `logo-light-bg.svg` and `logo-dark-bg.svg` are older
aliases of the primary/dark files and will be removed in the asset cleanup.

### PNG exports

PNGs (`ferni-logo-{size}.png`, `ferni-logo-simple-{size}.png`,
`ferni-logo-dark-{size}.png` at 16–1024px) are generated from the SVGs:

```bash
pnpm icons:regenerate
```

---

## Colors

| Element     | Color             | Token                     |
| ----------- | ----------------- | ------------------------- |
| Orb         | `#4a6741`         | `--persona-ferni-primary` |
| Eyes        | `#ffffff`         | —                         |
| Catchlights | `#ffffff`         | —                         |
| Wordmark    | `#2c2520` (light) | `--color-text-primary`    |

---

## Size Guidelines

| Size     | Use case          | File                                    |
| -------- | ----------------- | --------------------------------------- |
| 16–32px  | Favicon, tab icon | `ferni-favicon.svg` or generated PNGs   |
| 24–48px  | Navigation, lists | `ferni-logo-simple.svg`                 |
| 48–128px | Headers, cards    | `ferni-logo.svg`                        |
| 120px+   | Splash, hero      | `ferni-logo.lottie.json` / expressive   |
| 1024px   | App stores        | generated PNG                           |

Minimum digital size: 16px (orb only), 120px wide (with wordmark).

---

## Usage

```html
<!-- Static -->
<img src="/design-system/assets/logos/ferni-logo.svg" alt="Ferni" width="48" height="48" />
```

For expressions, inline `ferni-logo-expressive.svg` and toggle classes on its
eye group; see the file's embedded CSS for the available states.
