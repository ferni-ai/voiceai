# Flawless Localization Plan

> **Goal**: Full internationalization for Landing Page, Payments, and App across 11 locales with RTL support.

## Executive Summary

| Area | Current State | Target State |
|------|---------------|--------------|
| **Landing** | English-only, hardcoded | 11 locales, auto-detection, `/es/`, `/fr/` routes |
| **Payments** | USD only, hardcoded $9.99 | Multi-currency, locale-aware formatting |
| **App** | No i18n library, hardcoded strings | Full translation, RTL support |

**Foundation**: `design-system/tokens/i18n.json` already defines 11 locales with complete formatting specs.

---

## Phase 1: Foundation & Infrastructure

### 1.1 Translation File Structure

```
src/i18n/
├── index.ts                    # i18n initialization & utilities
├── types.ts                    # TranslationKey types (type-safe)
├── locales/
│   ├── en-US.json              # English (US) - Source of truth
│   ├── en-GB.json              # English (UK)
│   ├── es.json                 # Spanish
│   ├── fr.json                 # French
│   ├── de.json                 # German
│   ├── ja.json                 # Japanese
│   ├── ko.json                 # Korean
│   ├── zh-Hans.json            # Chinese (Simplified)
│   ├── zh-Hant.json            # Chinese (Traditional)
│   ├── ar.json                 # Arabic (RTL)
│   └── he.json                 # Hebrew (RTL)
├── formatters/
│   ├── date.ts                 # Date formatting using i18n tokens
│   ├── number.ts               # Number/currency formatting
│   └── plurals.ts              # Pluralization rules
└── detection/
    ├── browser.ts              # Accept-Language detection
    └── persistence.ts          # LocalStorage/cookie persistence
```

### 1.2 Shared i18n Core Module

Create `src/i18n/index.ts`:

```typescript
// Leverages design-system/tokens/i18n.json specifications
export interface I18nConfig {
  locale: string;
  fallbackLocale: 'en-US';
  direction: 'ltr' | 'rtl';
  currency: string;
}

export function createI18n(config: I18nConfig) {
  // Load locale from design-system tokens
  // Provide t() function
  // Provide formatDate(), formatNumber(), formatCurrency()
}
```

### 1.3 Locale Detection & Persistence

```typescript
// Priority order:
// 1. URL parameter (?lang=es)
// 2. Saved preference (localStorage/cookie)
// 3. Accept-Language header
// 4. Geo-IP (existing geo-detection.ts)
// 5. Default: en-US
```

### 1.4 Files to Create

| File | Purpose |
|------|---------|
| `src/i18n/index.ts` | Core i18n module |
| `src/i18n/types.ts` | Type-safe translation keys |
| `src/i18n/locales/en-US.json` | Source translations |
| `src/i18n/formatters/date.ts` | Date formatting |
| `src/i18n/formatters/number.ts` | Number/currency formatting |
| `src/i18n/formatters/plurals.ts` | ICU pluralization |
| `src/i18n/detection/browser.ts` | Browser locale detection |
| `src/i18n/detection/persistence.ts` | Locale persistence |

---

## Phase 2: Landing Page Localization

### 2.1 Eleventy i18n Setup

Install and configure `eleventy-plugin-i18n`:

```javascript
// .eleventy.js additions
const i18n = require('eleventy-plugin-i18n');

module.exports = function(eleventyConfig) {
  eleventyConfig.addPlugin(i18n, {
    translations: {
      en: require('./src/_data/i18n/en.json'),
      es: require('./src/_data/i18n/es.json'),
      // ... other locales
    },
    fallbackLocales: { '*': 'en' }
  });
};
```

### 2.2 URL Structure

| Current | Localized |
|---------|-----------|
| `/` | `/` (default en-US) |
| `/pricing/` | `/pricing/` (en-US), `/es/pricing/`, `/fr/pricing/` |
| `/team/` | `/team/` (en-US), `/es/team/`, `/fr/team/` |

### 2.3 Extract Strings from site.json

**Before** (`src/_data/site.json`):
```json
{
  "hero": {
    "headline": "Better than",
    "headlineAccent": "human."
  }
}
```

**After** (`src/_data/i18n/en.json`):
```json
{
  "hero": {
    "headline": "Better than",
    "headlineAccent": "human."
  }
}
```

**After** (`src/_data/i18n/es.json`):
```json
{
  "hero": {
    "headline": "Mejor que",
    "headlineAccent": "humano."
  }
}
```

### 2.4 Template Updates

**Before**:
```njk
<h1>{{ site.hero.headline }} <span>{{ site.hero.headlineAccent }}</span></h1>
```

**After**:
```njk
<h1>{{ 'hero.headline' | i18n }} <span>{{ 'hero.headlineAccent' | i18n }}</span></h1>
```

### 2.5 Language Switcher Component

```njk
{# src/_includes/partials/language-switcher.njk #}
<div class="language-switcher" data-lang-switcher>
  <button class="current-lang">
    {{ currentLang.flag }} {{ currentLang.name }}
  </button>
  <ul class="lang-dropdown">
    {% for lang in supportedLanguages %}
    <li><a href="{{ lang.url }}">{{ lang.flag }} {{ lang.name }}</a></li>
    {% endfor %}
  </ul>
</div>
```

### 2.6 Priority Locales for Landing (Phase 2a)

Start with 5 high-value markets:

| Locale | Market | Priority |
|--------|--------|----------|
| `en-US` | US/Canada | Source |
| `es` | Spain/LatAm | High |
| `fr` | France/Quebec | High |
| `de` | Germany/DACH | Medium |
| `ja` | Japan | Medium |

### 2.7 Files to Modify

| File | Changes |
|------|---------|
| `apps/website/ferni-website/.eleventy.js` | Add i18n plugin |
| `apps/website/ferni-website/src/_data/site.json` | Keep structure, remove translatable text |
| `apps/website/ferni-website/src/_data/i18n/*.json` | New translation files |
| `apps/website/ferni-website/src/_includes/partials/head.njk` | Add `lang` and `hreflang` |
| `apps/website/ferni-website/src/_includes/partials/header.njk` | Add language switcher |
| All `.njk` templates | Replace hardcoded strings with `| i18n` filter |

---

## Phase 3: Payments Localization

### 3.1 Multi-Currency Stripe Prices

Create separate Stripe prices for each currency:

| Tier | USD | EUR | GBP | JPY |
|------|-----|-----|-----|-----|
| Friend | $9.99 | €9.99 | £8.99 | ¥1,480 |
| Partner | $19.99 | €19.99 | £17.99 | ¥2,980 |

### 3.2 Currency Configuration

```typescript
// src/config/currencies.ts
export const CURRENCY_CONFIG = {
  'en-US': { currency: 'USD', symbol: '$', position: 'before' },
  'en-GB': { currency: 'GBP', symbol: '£', position: 'before' },
  'es': { currency: 'EUR', symbol: '€', position: 'after' },
  'fr': { currency: 'EUR', symbol: '€', position: 'after' },
  'de': { currency: 'EUR', symbol: '€', position: 'after' },
  'ja': { currency: 'JPY', symbol: '¥', position: 'before' },
  // ...
};
```

### 3.3 Locale-Aware Price Formatting

**Before** (`src/types/subscription.ts:209`):
```typescript
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}/mo`;
}
```

**After**:
```typescript
export function formatPrice(
  cents: number,
  locale: string = 'en-US',
  frequency: BillingFrequency = 'monthly'
): string {
  const config = CURRENCY_CONFIG[locale] || CURRENCY_CONFIG['en-US'];
  const amount = cents / 100;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: config.currency,
  }).format(amount) + (frequency === 'monthly' ? '/mo' : '/yr');
}
```

### 3.4 Stripe Price ID per Currency

```typescript
// src/types/subscription.ts - Updated TIER_CONFIGS
export const TIER_CONFIGS: Record<SubscriptionTier, TierConfig> = {
  friend: {
    // ... existing config
    stripePrices: {
      USD: process.env.STRIPE_PRICE_FRIEND_USD,
      EUR: process.env.STRIPE_PRICE_FRIEND_EUR,
      GBP: process.env.STRIPE_PRICE_FRIEND_GBP,
      JPY: process.env.STRIPE_PRICE_FRIEND_JPY,
    },
  },
  // ...
};
```

### 3.5 Checkout Session with Currency

**Before** (`src/services/stripe-subscription.ts:249`):
```typescript
const session = await stripe.checkout.sessions.create({
  line_items: [{ price: config.stripePriceId, quantity: 1 }],
  // ...
});
```

**After**:
```typescript
const session = await stripe.checkout.sessions.create({
  line_items: [{
    price: config.stripePrices[userCurrency] || config.stripePrices.USD,
    quantity: 1
  }],
  currency: userCurrency.toLowerCase(),
  // ...
});
```

### 3.6 Files to Modify

| File | Changes |
|------|---------|
| `src/config/currencies.ts` | New - currency config per locale |
| `src/types/subscription.ts` | Multi-currency TIER_CONFIGS, updated formatPrice |
| `src/services/stripe-subscription.ts` | Currency-aware checkout |
| `apps/website/ferni-website/src/pricing.njk` | Dynamic price display |
| `apps/web/src/ui/subscription.ui.ts` | Locale-aware pricing |

---

## Phase 4: App Localization

### 4.1 i18n Library Choice

**Recommendation**: Use a lightweight custom solution (not i18next) to avoid bundle bloat.

```typescript
// apps/web/src/i18n/index.ts
import type { TranslationKey } from './types';
import enUS from './locales/en-US.json';

const translations: Record<string, typeof enUS> = {
  'en-US': enUS,
  // Lazy-load other locales
};

export function t(key: TranslationKey, params?: Record<string, string>): string {
  const locale = getCurrentLocale();
  const value = getNestedValue(translations[locale], key);
  return interpolate(value, params);
}
```

### 4.2 String Extraction Strategy

Extract hardcoded strings from UI files in priority order:

| Priority | Files | String Count (est.) |
|----------|-------|---------------------|
| 1 | `ui/controls.ui.ts` | ~20 |
| 1 | `ui/subscription.ui.ts` | ~30 |
| 1 | `ui/settings-menu.ui.ts` | ~25 |
| 2 | `ui/greeting.ui.ts` | ~10 |
| 2 | `ui/notifications.ui.ts` | ~15 |
| 3 | All other `ui/*.ts` | ~200 |

### 4.3 Translation Key Naming Convention

```json
{
  "controls": {
    "buttons": {
      "mute": "Mute",
      "unmute": "Unmute",
      "endCall": "End Call"
    },
    "states": {
      "connecting": "Connecting...",
      "connected": "Connected"
    }
  },
  "subscription": {
    "tiers": {
      "free": "Free",
      "friend": "Friend",
      "partner": "Partner"
    },
    "cta": {
      "upgrade": "Upgrade",
      "startTrial": "Start Free Trial"
    }
  }
}
```

### 4.4 UI Component Updates

**Before** (`ui/controls.ui.ts`):
```typescript
button.textContent = 'End Call';
```

**After**:
```typescript
import { t } from '../i18n';
button.textContent = t('controls.buttons.endCall');
```

### 4.5 RTL Support

```typescript
// apps/web/src/i18n/rtl.ts
import { getCurrentLocale } from './detection';

export function getDirection(): 'ltr' | 'rtl' {
  const rtlLocales = ['ar', 'he'];
  const locale = getCurrentLocale();
  return rtlLocales.includes(locale.split('-')[0]) ? 'rtl' : 'ltr';
}

export function applyDirection(): void {
  document.documentElement.dir = getDirection();
  document.documentElement.lang = getCurrentLocale();
}
```

### 4.6 Date/Time Formatting

```typescript
// apps/web/src/i18n/formatters/date.ts
import i18nTokens from '../../../design-system/tokens/i18n.json';

export function formatDate(date: Date, locale: string): string {
  const config = i18nTokens.supportedLocales[locale];
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium'
  }).format(date);
}

export function formatRelativeTime(date: Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diff = Date.now() - date.getTime();
  // ... relative time logic
}
```

### 4.7 Files to Create/Modify

| File | Type | Purpose |
|------|------|---------|
| `apps/web/src/i18n/index.ts` | New | Core t() function |
| `apps/web/src/i18n/types.ts` | New | Type-safe keys |
| `apps/web/src/i18n/locales/*.json` | New | Translation files |
| `apps/web/src/i18n/rtl.ts` | New | RTL support |
| `apps/web/src/i18n/formatters/*.ts` | New | Formatters |
| All `ui/*.ts` files | Modify | Use t() function |

---

## Implementation Timeline

### Sprint 1: Foundation (Week 1-2)
- [ ] Create i18n directory structure
- [ ] Implement core i18n module with t() function
- [ ] Create en-US.json source translations
- [ ] Add locale detection & persistence
- [ ] Add RTL utilities

### Sprint 2: Landing Page (Week 3-4)
- [ ] Install Eleventy i18n plugin
- [ ] Extract site.json to locale files
- [ ] Create language switcher component
- [ ] Update all .njk templates
- [ ] Add hreflang tags for SEO
- [ ] Translate to es, fr (priority locales)

### Sprint 3: Payments (Week 5)
- [ ] Create Stripe prices for EUR, GBP, JPY
- [ ] Update TIER_CONFIGS with multi-currency
- [ ] Implement locale-aware formatPrice
- [ ] Update checkout flow
- [ ] Update pricing display in landing & app

### Sprint 4: App Core UI (Week 6-7)
- [ ] Extract strings from priority UI files
- [ ] Implement t() throughout controls, settings, subscription UIs
- [ ] Add RTL CSS adjustments
- [ ] Test Arabic/Hebrew layouts

### Sprint 5: App Complete (Week 8-9)
- [ ] Extract remaining UI strings
- [ ] Implement date/time formatters
- [ ] Full translation to 5 priority locales
- [ ] Visual testing for text expansion

### Sprint 6: Polish & QA (Week 10)
- [ ] Pseudo-locale testing
- [ ] RTL visual regression tests
- [ ] Translation review & corrections
- [ ] Performance optimization (lazy loading)

---

## Translation Workflow

### Source Management
1. Developers add strings to `en-US.json` only
2. Use descriptive keys: `subscription.upgrade.cta` not `btn1`
3. Include context comments for translators

### Translation Process
1. Export strings to translation platform (Phrase, Lokalise, or Crowdin)
2. Professional translation for primary markets
3. Community translation for secondary markets
4. Review by native speakers

### Quality Checks
- Automated: Missing keys, text expansion, RTL layout
- Manual: Native speaker review, context accuracy

---

## Testing Strategy

### Unit Tests
```typescript
describe('i18n', () => {
  it('returns translation for valid key', () => {
    expect(t('controls.buttons.mute')).toBe('Mute');
  });

  it('interpolates variables', () => {
    expect(t('greeting.hello', { name: 'Ferni' })).toBe('Hello, Ferni');
  });

  it('falls back to en-US for missing translation', () => {
    setLocale('es');
    expect(t('obscure.key')).toBe('English fallback');
  });
});
```

### Visual Tests
- Playwright tests with locale parameter
- Screenshots for each locale
- RTL layout verification

### E2E Tests
- Language switcher flow
- Currency display in checkout
- Date formatting in UI

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Text expansion breaks layouts | Design with 1.5x expansion buffer |
| RTL breaks complex UI | Gradual rollout, start with simple pages |
| Translation quality issues | Professional translators + native review |
| Performance impact | Lazy-load non-default locales |
| SEO impact during migration | Proper hreflang, 301 redirects |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Locale coverage | 11 locales supported |
| Translation completeness | 100% for priority 5 locales |
| RTL support | Full for Arabic, Hebrew |
| Bundle size increase | < 5% for default locale |
| Load time impact | < 100ms for locale switch |

---

## Appendix: Translation Key Inventory

### Landing Page (~150 strings)
- Navigation: 15
- Hero: 20
- Features: 40
- Team: 30
- Pricing: 25
- FAQ: 15
- Footer: 10

### App (~300 strings)
- Controls: 30
- Settings: 50
- Subscription: 40
- Notifications: 25
- Greetings: 20
- Error messages: 30
- Miscellaneous: 105
