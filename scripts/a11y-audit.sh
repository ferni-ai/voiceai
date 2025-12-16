#!/bin/bash
# Accessibility Audit Script for Ferni Dashboards
# Checks WCAG 2.1 AA compliance requirements

echo "═══════════════════════════════════════════════════════════════"
echo "  🔍 FERNI DASHBOARD ACCESSIBILITY AUDIT"
echo "  WCAG 2.1 AA Compliance Check"
echo "═══════════════════════════════════════════════════════════════"
echo ""

DASHBOARD_DIR="apps/web/public"
PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

audit_dashboard() {
    local file=$1
    local name=$(basename "$file" .html)
    local issues=()
    local warnings=()
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 Auditing: $name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # 1. Check for skip link
    if grep -q 'skip-link\|skip-to-content\|Skip to' "$file"; then
        echo -e "  ${GREEN}✓${NC} Skip link present"
    else
        echo -e "  ${RED}✗${NC} Missing skip link"
        issues+=("Missing skip link for keyboard navigation")
    fi
    
    # 2. Check for prefers-reduced-motion
    if grep -q 'prefers-reduced-motion' "$file"; then
        echo -e "  ${GREEN}✓${NC} Reduced motion support"
    else
        echo -e "  ${RED}✗${NC} Missing prefers-reduced-motion"
        issues+=("Missing prefers-reduced-motion media query")
    fi
    
    # 3. Check for focus-visible styles
    if grep -q 'focus-visible\|:focus' "$file"; then
        echo -e "  ${GREEN}✓${NC} Focus styles present"
    else
        echo -e "  ${RED}✗${NC} Missing focus styles"
        issues+=("Missing focus-visible or :focus styles")
    fi
    
    # 4. Check for aria-label on buttons
    button_count=$(grep -c '<button' "$file" || echo 0)
    aria_button_count=$(grep -c '<button.*aria-label\|<button.*aria-labelledby' "$file" || echo 0)
    if [ "$button_count" -gt 0 ]; then
        if [ "$aria_button_count" -ge "$((button_count / 2))" ]; then
            echo -e "  ${GREEN}✓${NC} ARIA labels on buttons ($aria_button_count/$button_count)"
        else
            echo -e "  ${YELLOW}⚠${NC} Some buttons missing ARIA labels ($aria_button_count/$button_count)"
            warnings+=("Some buttons missing aria-label ($aria_button_count/$button_count)")
        fi
    else
        echo -e "  ${GREEN}✓${NC} No buttons to check"
    fi
    
    # 5. Check for role attributes
    if grep -q 'role=' "$file"; then
        role_count=$(grep -c 'role=' "$file" || echo 0)
        echo -e "  ${GREEN}✓${NC} Role attributes present ($role_count found)"
    else
        echo -e "  ${YELLOW}⚠${NC} No role attributes found"
        warnings+=("Consider adding role attributes for landmarks")
    fi
    
    # 6. Check for aria-live regions
    if grep -q 'aria-live' "$file"; then
        echo -e "  ${GREEN}✓${NC} Live regions for dynamic content"
    else
        echo -e "  ${YELLOW}⚠${NC} No aria-live regions"
        warnings+=("Consider aria-live for dynamic updates")
    fi
    
    # 7. Check for tokens.css (design system)
    if grep -q 'tokens.css' "$file"; then
        echo -e "  ${GREEN}✓${NC} Design system tokens loaded"
    else
        echo -e "  ${RED}✗${NC} Missing tokens.css"
        issues+=("Missing design system tokens (color contrast may fail)")
    fi
    
    # 8. Check for lang attribute
    if grep -q '<html.*lang=' "$file"; then
        echo -e "  ${GREEN}✓${NC} Language attribute present"
    else
        echo -e "  ${RED}✗${NC} Missing lang attribute on html"
        issues+=("Missing lang attribute on <html>")
    fi
    
    # 9. Check for viewport meta
    if grep -q 'viewport' "$file"; then
        echo -e "  ${GREEN}✓${NC} Viewport meta present"
    else
        echo -e "  ${YELLOW}⚠${NC} Missing viewport meta"
        warnings+=("Missing viewport meta tag")
    fi
    
    # 10. Check for outline: none (anti-pattern)
    if grep -q 'outline:\s*none\|outline:\s*0' "$file"; then
        outline_none_count=$(grep -c 'outline:\s*none\|outline:\s*0' "$file" || echo 0)
        echo -e "  ${RED}✗${NC} Found outline:none ($outline_none_count occurrences)"
        issues+=("outline:none removes focus indicator ($outline_none_count)")
    else
        echo -e "  ${GREEN}✓${NC} No outline:none anti-pattern"
    fi
    
    # Summary for this dashboard
    echo ""
    if [ ${#issues[@]} -eq 0 ]; then
        echo -e "  ${GREEN}✓ PASS${NC} - No critical issues"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ FAIL${NC} - ${#issues[@]} critical issue(s):"
        for issue in "${issues[@]}"; do
            echo -e "    ${RED}•${NC} $issue"
        done
        ((FAIL_COUNT++))
    fi
    
    if [ ${#warnings[@]} -gt 0 ]; then
        echo -e "  ${YELLOW}⚠ WARNINGS${NC} - ${#warnings[@]} recommendation(s):"
        for warn in "${warnings[@]}"; do
            echo -e "    ${YELLOW}•${NC} $warn"
        done
        ((WARN_COUNT++))
    fi
    echo ""
}

# Audit all dashboards
for dashboard in $DASHBOARD_DIR/*-dashboard.html; do
    audit_dashboard "$dashboard"
done

# Also check observability-hub if it exists
if [ -f "$DASHBOARD_DIR/observability-hub.html" ]; then
    audit_dashboard "$DASHBOARD_DIR/observability-hub.html"
fi

# Final summary
echo "═══════════════════════════════════════════════════════════════"
echo "  📊 AUDIT SUMMARY"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo -e "  ${GREEN}✓ PASS:${NC}     $PASS_COUNT dashboards"
echo -e "  ${RED}✗ FAIL:${NC}     $FAIL_COUNT dashboards"
echo -e "  ${YELLOW}⚠ WARNINGS:${NC} $WARN_COUNT dashboards with recommendations"
echo ""
echo "═══════════════════════════════════════════════════════════════"

