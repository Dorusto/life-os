#!/usr/bin/env bash
# Pre-commit check: blocks commits containing private/sensitive data patterns.
# To bypass in emergencies: git commit --no-verify

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
STAGED=$(git diff --cached -U0 | grep '^+' | grep -v '^+++')

check() {
    local description="$1"
    local pattern="$2"
    local matches
    matches=$(echo "$STAGED" | grep -iP "$pattern" || true)
    if [[ -n "$matches" ]]; then
        echo -e "${RED}BLOCKED${NC} — $description"
        echo "$matches" | head -5 | sed 's/^/  /'
        ERRORS=$((ERRORS + 1))
    fi
}

echo "🔍 Scanning staged changes for private data..."

# License plates — Dutch and Romanian formats, hyphen or space separator
check "License plate"              '\b(\d{2}[\s-][A-Z]{2}[\s-][A-Z]{2}|[A-Z]{2}[\s-]\d{3}[\s-][A-Z]|\d{2}[\s-][A-Z]{3}[\s-]\d|\d[\s-][A-Z]{3}[\s-]\d{2}|[A-Z][\s-]\d{3}[\s-][A-Z]{2}|[A-Z]{1,2}[\s-]\d{2,3}[\s-][A-Z]{2,3})\b'

# IBAN
check "IBAN number"                '\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7,}\b'

# VIN — 17 chars, mixed alpha+digits (exclude all-digit sequences)
check "VIN number"                 '\b(?=[A-HJ-NPR-Z0-9]{17}\b)(?=.*[A-HJ-NPR-Z])(?=.*\d)[A-HJ-NPR-Z0-9]{17}\b'

# Actual Budget Sync ID assigned
check "Actual Budget Sync ID"      'ACTUAL_BUDGET_SYNC_ID\s*=\s*[a-f0-9]{8}-[a-f0-9]{4}'

# Real Telegram IDs in allowed list (not placeholder 111111111 / 222222222)
check "Real Telegram user ID"      'TELEGRAM_ALLOWED_USER_IDS\s*=\s*(?!1{9}|2{9})[\d,\s]+'

# Credentials with real values (not placeholders)
check "Real credential value"      '(PASSWORD|BOT_TOKEN|API_KEY|JWT_SECRET)\s*=\s*(?!your_|paste_|change_|example|\.\.\.|\*+|"")[^\s]{10,}'

if [[ $ERRORS -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}⚠️  Commit blocked — $ERRORS sensitive pattern(s) found above.${NC}"
    echo "   Remove or anonymize the data, then try again."
    echo "   Emergency bypass: git commit --no-verify"
    exit 1
fi

echo "✅ No private data found."
exit 0
