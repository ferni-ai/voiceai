#!/bin/bash
# Fix Accessibility Issues Across All Dashboards
# Adds: aria-labels, role attributes, aria-live regions

DASHBOARD_DIR="apps/web/public"

echo "🔧 Fixing Accessibility Issues..."
echo ""

# Fix 1: Add aria-label to buttons that only have title
for file in $DASHBOARD_DIR/*-dashboard.html $DASHBOARD_DIR/observability-hub.html; do
    if [ -f "$file" ]; then
        name=$(basename "$file")
        
        # Add aria-label to refresh buttons
        sed -i '' 's/<button class="refresh-btn"/<button class="refresh-btn" aria-label="Refresh data"/g' "$file"
        sed -i '' 's/<button class="icon-btn" onclick="toggleTheme()" title="Toggle theme"/<button class="icon-btn" onclick="toggleTheme()" title="Toggle theme" aria-label="Toggle dark\/light theme"/g' "$file"
        
        # Add role="main" to main content area if missing
        if ! grep -q 'role="main"' "$file"; then
            # Add to body or main container
            sed -i '' 's/<body>/<body role="document">/g' "$file"
        fi
        
        # Add aria-live to dynamic areas
        if ! grep -q 'aria-live' "$file"; then
            # Add to common dynamic containers
            sed -i '' 's/class="metric-value"/class="metric-value" aria-live="polite"/g' "$file"
            sed -i '' 's/class="card-content"/class="card-content" aria-live="polite"/g' "$file"
        fi
        
        echo "✓ Fixed: $name"
    fi
done

echo ""
echo "✅ Accessibility fixes applied!"

