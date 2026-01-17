# I18n Module

Internationalization utilities for multi-language support.

## Purpose

Provides complete i18n support with:
- Type-safe translation keys
- 11 supported locales including RTL languages
- Intl API-based date/time/number/currency formatting
- Browser locale detection and persistence
- Fallback chain for missing translations

## Architecture Layer

**Layer 10 (Infrastructure)** - Can be imported by any module.

## Key Files

| File | Purpose |
|------|---------|
| `index.ts` | Core i18n API: `t()`, `setLocale()`, `formatDate()`, etc. |
| `types.ts` | Type definitions, locale metadata, fallback chains |
| `rtl.ts` | RTL-specific utilities (Arabic, Hebrew) |
| `pricing.ts` | Locale-aware pricing and currency display |
| `detection/browser.ts` | Browser locale detection |
| `formatters/date.ts` | Date/time formatting |
| `formatters/number.ts` | Number/currency formatting |
| `formatters/plurals.ts` | ICU plural rules |
| `locales/*.json` | Translation files by locale |

## Supported Locales

| Code | Language | Direction |
|------|----------|-----------|
| `en-US` | English (US) | LTR |
| `en-GB` | English (UK) | LTR |
| `es` | Spanish | LTR |
| `fr` | French | LTR |
| `de` | German | LTR |
| `ja` | Japanese | LTR |
| `ko` | Korean | LTR |
| `zh-Hans` | Chinese (Simplified) | LTR |
| `zh-Hant` | Chinese (Traditional) | LTR |
| `ar` | Arabic | RTL |
| `he` | Hebrew | RTL |

## Usage Patterns

```typescript
import { t, setLocale, formatDate, formatCurrency, isRTL } from '../i18n/index.js';

// Initialize with user's locale
await setLocale('ja');

// Translate with interpolation
t('hero.headline');  // "Better than"
t('time.minutesAgo', { n: 5 });  // "5分前"

// Format values
formatDate(new Date());  // "2024年1月15日"
formatCurrency(29.99, 'JPY');  // "¥30"

// Check RTL for Arabic/Hebrew
if (isRTL()) {
  document.dir = 'rtl';
}
```

## Fallback Chain

Missing translations fall back:
1. Current locale
2. Fallback locales (e.g., `zh-Hant` -> `zh-Hans` -> `en-US`)
3. `en-US` (always bundled)
4. Raw key if nothing found

## Translation File Structure

```json
{
  "hero": {
    "headline": "Better than",
    "subheadline": "Your AI companion"
  },
  "time": {
    "justNow": "just now",
    "minutesAgo": "{n} minutes ago"
  }
}
```

## Rules for Adding Translations

1. **Add to en-US.json first** - It's the source of truth
2. **Use interpolation for variables** - `{variable}` syntax
3. **Keep keys consistent** - Dot notation: `section.subsection.key`
4. **Test RTL** - Verify Arabic/Hebrew rendering
5. **Update types** - If adding new top-level sections

## Adding a New Locale

1. Create `locales/{locale}.json` with translations
2. Add to `SupportedLocale` type in `types.ts`
3. Add to `LOCALE_METADATA` in `types.ts`
4. Add fallback chain in `FALLBACK_CHAIN`
5. For RTL: add to `RTL_LOCALES`

## Integration Points

- `apps/web/` - Frontend uses `t()` for all UI text
- `src/api/` - API responses can include localized errors
- `design-system/tokens/i18n.json` - Locale configuration source
