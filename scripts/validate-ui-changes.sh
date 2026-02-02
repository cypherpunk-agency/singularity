#!/bin/bash
# UI Validation Script
# Validates UI changes before deployment

set -e

echo "=== UI Validation Pipeline ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Protected files that require permission to modify
PROTECTED_FILES=(
    "packages/ui/src/App.tsx"
    "packages/ui/src/main.tsx"
    "packages/ui/src/router.tsx"
    "packages/ui/src/store.ts"
    "packages/ui/src/components/Layout.tsx"
    "packages/ui/src/components/Status.tsx"
    "packages/ui/src/components/Chat.tsx"
    "packages/ui/src/components/AppProvider.tsx"
    "packages/ui/src/hooks/useWebSocket.ts"
    "packages/ui/src/lib/api.ts"
    "packages/ui/vite.config.ts"
    "packages/ui/package.json"
)

# Check for --allow-protected flag
ALLOW_PROTECTED=false
for arg in "$@"; do
    if [ "$arg" == "--allow-protected" ]; then
        ALLOW_PROTECTED=true
    fi
done

# Step 1: Check for protected file modifications
echo "Step 1: Checking for protected file modifications..."
MODIFIED_PROTECTED=()

for file in "${PROTECTED_FILES[@]}"; do
    if git diff --name-only HEAD 2>/dev/null | grep -q "^$file$"; then
        MODIFIED_PROTECTED+=("$file")
    fi
    # Also check staged changes
    if git diff --name-only --cached 2>/dev/null | grep -q "^$file$"; then
        if [[ ! " ${MODIFIED_PROTECTED[@]} " =~ " $file " ]]; then
            MODIFIED_PROTECTED+=("$file")
        fi
    fi
done

if [ ${#MODIFIED_PROTECTED[@]} -gt 0 ]; then
    echo -e "${YELLOW}WARNING: Protected files have been modified:${NC}"
    for file in "${MODIFIED_PROTECTED[@]}"; do
        echo "  - $file"
    done
    if [ "$ALLOW_PROTECTED" = false ]; then
        echo ""
        echo -e "${RED}ERROR: Protected files modified without --allow-protected flag${NC}"
        echo "If you have permission to modify these files, run:"
        echo "  ./scripts/validate-ui-changes.sh --allow-protected"
        exit 1
    else
        echo -e "${YELLOW}Proceeding with --allow-protected flag${NC}"
    fi
else
    echo -e "${GREEN}✓ No protected files modified${NC}"
fi
echo ""

# Step 2: TypeScript type checking
echo "Step 2: Running TypeScript type checking..."
if pnpm --filter @singularity/ui typecheck; then
    echo -e "${GREEN}✓ TypeScript check passed${NC}"
else
    echo -e "${RED}✗ TypeScript check failed${NC}"
    exit 1
fi
echo ""

# Step 3: Run tests
echo "Step 3: Running tests..."
if pnpm --filter @singularity/ui test 2>/dev/null; then
    echo -e "${GREEN}✓ Tests passed${NC}"
else
    # Tests might not exist yet, check if it's a "no tests" error
    if pnpm --filter @singularity/ui test 2>&1 | grep -q "No test files found"; then
        echo -e "${YELLOW}⚠ No tests found (skipping)${NC}"
    else
        echo -e "${RED}✗ Tests failed${NC}"
        exit 1
    fi
fi
echo ""

# Step 4: Production build
echo "Step 4: Running production build..."
if pnpm --filter @singularity/ui build; then
    echo -e "${GREEN}✓ Production build passed${NC}"
else
    echo -e "${RED}✗ Production build failed${NC}"
    exit 1
fi
echo ""

echo "=== Validation Complete ==="
echo -e "${GREEN}All checks passed!${NC}"
