#!/bin/bash
# CI Workflow Validation Script
# Run before pushing CI changes to catch common issues

set -e

echo "🚀 CI Workflow Validation"
echo "========================="

cd "$(git rev-parse --show-toplevel)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Basic YAML Structure Check (GitHub Actions compatible)
echo -e "\n${YELLOW}📋 Checking YAML structure...${NC}"
YAML_ERRORS=0
for f in .github/workflows/*.yml; do
  # Check for basic structure: must have 'name:' and 'on:' and 'jobs:'
  if grep -q "^name:" "$f" && grep -q "^on:" "$f" && grep -q "^jobs:" "$f"; then
    : # Valid structure
  else
    echo -e "  ${RED}❌ $(basename $f) missing required fields (name/on/jobs)${NC}"
    YAML_ERRORS=$((YAML_ERRORS + 1))
  fi
done
if [ $YAML_ERRORS -eq 0 ]; then
  echo -e "  ${GREEN}✅ All workflows have required structure${NC}"
else
  echo -e "  ${RED}❌ $YAML_ERRORS files have structural issues${NC}"
fi

# 2. actionlint (if installed)
if command -v actionlint &> /dev/null; then
  echo -e "\n${YELLOW}🔍 Running actionlint...${NC}"
  if actionlint 2>&1 | head -20; then
    echo -e "  ${GREEN}✅ actionlint passed${NC}"
  else
    echo -e "  ${RED}❌ actionlint found issues${NC}"
  fi
else
  echo -e "\n${YELLOW}⚠️  actionlint not installed${NC}"
  echo "  Install with: brew install actionlint"
fi

# 3. Concurrency status
echo -e "\n${YELLOW}📊 Concurrency Status:${NC}"
TOTAL=$(ls .github/workflows/*.yml | wc -l | tr -d ' ')
WITH_CONCURRENCY=$(grep -l "concurrency:" .github/workflows/*.yml 2>/dev/null | wc -l | tr -d ' ')
WITHOUT=$((TOTAL - WITH_CONCURRENCY))

echo "  Total workflows: $TOTAL"
echo -e "  With concurrency: ${GREEN}$WITH_CONCURRENCY${NC}"
echo -e "  Without concurrency: ${YELLOW}$WITHOUT${NC}"

# 4. List workflows missing concurrency
if [ $WITHOUT -gt 0 ]; then
  echo -e "\n${YELLOW}⚠️  Workflows WITHOUT concurrency:${NC}"
  for f in .github/workflows/*.yml; do
    if ! grep -q "concurrency:" "$f" 2>/dev/null; then
      echo "  - $(basename $f)"
    fi
  done
fi

# 5. Check for path filters on key workflows
echo -e "\n${YELLOW}🛤️  Path Filter Status:${NC}"
KEY_WORKFLOWS="ci.yml staging.yml deploy-production.yml"
for workflow in $KEY_WORKFLOWS; do
  if [ -f ".github/workflows/$workflow" ]; then
    if grep -q "paths:" ".github/workflows/$workflow" 2>/dev/null; then
      echo -e "  ${GREEN}✅ $workflow has path filters${NC}"
    else
      echo -e "  ${YELLOW}⚠️  $workflow missing path filters${NC}"
    fi
  fi
done

# 6. Check for cancel-in-progress
echo -e "\n${YELLOW}🔄 Cancel-in-progress Status:${NC}"
WITH_CANCEL=$(grep -l "cancel-in-progress:" .github/workflows/*.yml 2>/dev/null | wc -l | tr -d ' ')
echo "  Workflows with cancel-in-progress: $WITH_CANCEL"

# 7. Summary
echo -e "\n${GREEN}✅ Validation complete${NC}"
echo ""
echo "Next steps:"
echo "  1. Fix any issues found above"
echo "  2. Create a test PR to validate changes"
echo "  3. Watch GitHub Actions tab for expected behavior"
