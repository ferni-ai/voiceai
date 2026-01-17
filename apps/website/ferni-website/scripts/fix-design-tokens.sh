#!/bin/bash
# Fix common hardcoded design token violations
# Run from ferni-website directory

echo "🔧 Fixing hardcoded design tokens..."

# Common color replacements
find css src/css -name "*.css" -type f -exec sed -i '' \
  -e 's/#4a6741/var(--color-ferni)/g' \
  -e 's/#3d5a35/var(--color-ferni-secondary)/g' \
  -e 's/#2C2520/var(--color-text-primary)/g' \
  -e 's/#2c2520/var(--color-text-primary)/g' \
  -e 's/#F5F1E8/var(--color-bg-primary)/g' \
  -e 's/#f5f1e8/var(--color-bg-primary)/g' \
  -e 's/#FFFDFB/var(--color-bg-elevated)/g' \
  -e 's/#fffdfb/var(--color-bg-elevated)/g' \
  -e 's/#3a6b73/var(--color-peter)/g' \
  -e 's/#5a6b8a/var(--color-alex)/g' \
  -e 's/#a67a6a/var(--color-maya)/g' \
  -e 's/#9a7b5a/var(--color-jack)/g' \
  {} \;

echo "✅ Color tokens fixed"

# Common border-radius replacements
find css src/css -name "*.css" -type f -exec sed -i '' \
  -e 's/border-radius: 4px;/border-radius: var(--radius-xs);/g' \
  -e 's/border-radius: 8px;/border-radius: var(--radius-sm);/g' \
  -e 's/border-radius: 12px;/border-radius: var(--radius-md);/g' \
  -e 's/border-radius: 16px;/border-radius: var(--radius-lg);/g' \
  -e 's/border-radius: 20px;/border-radius: var(--radius-xl);/g' \
  -e 's/border-radius: 24px;/border-radius: var(--radius-xl);/g' \
  {} \;

echo "✅ Border-radius tokens fixed"

# Common font-size replacements (px values)
find css src/css -name "*.css" -type f -exec sed -i '' \
  -e 's/font-size: 10px;/font-size: var(--text-2xs);/g' \
  -e 's/font-size: 11px;/font-size: var(--text-2xs);/g' \
  -e 's/font-size: 12px;/font-size: var(--text-xs);/g' \
  -e 's/font-size: 13px;/font-size: var(--text-sm);/g' \
  -e 's/font-size: 14px;/font-size: var(--text-sm);/g' \
  -e 's/font-size: 15px;/font-size: var(--text-base);/g' \
  -e 's/font-size: 16px;/font-size: var(--text-base);/g' \
  -e 's/font-size: 17px;/font-size: var(--text-lg);/g' \
  -e 's/font-size: 18px;/font-size: var(--text-lg);/g' \
  -e 's/font-size: 20px;/font-size: var(--text-xl);/g' \
  -e 's/font-size: 24px;/font-size: var(--text-2xl);/g' \
  {} \;

echo "✅ Font-size tokens fixed"

# Common font-size replacements (rem values)
find css src/css -name "*.css" -type f -exec sed -i '' \
  -e 's/font-size: 0\.625rem;/font-size: var(--text-2xs);/g' \
  -e 's/font-size: 0\.75rem;/font-size: var(--text-xs);/g' \
  -e 's/font-size: 0\.8125rem;/font-size: var(--text-sm);/g' \
  -e 's/font-size: 0\.875rem;/font-size: var(--text-sm);/g' \
  -e 's/font-size: 0\.9375rem;/font-size: var(--text-base);/g' \
  -e 's/font-size: 1rem;/font-size: var(--text-base);/g' \
  -e 's/font-size: 1\.0625rem;/font-size: var(--text-lg);/g' \
  -e 's/font-size: 1\.125rem;/font-size: var(--text-lg);/g' \
  -e 's/font-size: 1\.25rem;/font-size: var(--text-xl);/g' \
  -e 's/font-size: 1\.5rem;/font-size: var(--text-2xl);/g' \
  -e 's/font-size: 1\.75rem;/font-size: var(--text-2xl);/g' \
  -e 's/font-size: 1\.875rem;/font-size: var(--text-3xl);/g' \
  {} \;

echo "✅ Font-size rem tokens fixed"

echo ""
echo "🎨 Running design lint to check remaining issues..."
npm run lint:design 2>&1 | tail -20
