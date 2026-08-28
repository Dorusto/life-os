#!/usr/bin/env bash
# Pre-commit check: blocks commits containing private/sensitive data patterns.
# To bypass in emergencies: git commit --no-verify

RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# GNU grep -P falls back to single-byte matching (not full UTF-8 codepoints)
# unless LC_CTYPE resolves to a UTF-8 locale — this environment sets LC_*
# categories to a mix of locales (LC_TIME/LC_MONETARY/etc. differ from
# LC_CTYPE) with LC_ALL left empty, which isn't enough to make grep treat
# multi-byte characters as single units. Without this, grep matches the lone
# continuation byte inside €/×/— (bytes 0x82/0xc3/etc.) whenever it falls in
# the same numeric range as a Romanian diacritic byte — a false positive
# that survived the echo-pipe→file-based-grep fix below untouched, since it's
# a locale issue, not an echo-pipe issue. Confirmed: forcing LC_ALL here
# makes real diacritics (e.g. ă, full 2-byte match) still match correctly
# while €/×/— stop matching.
export LC_ALL=C.UTF-8

ERRORS=0
STAGED=$(git diff --cached -U0 | grep '^+' | grep -v '^+++')
# Ad-hoc self-check (not just the pre-commit gate): if nothing is staged yet,
# fall back to the unstaged working-tree diff so this is runnable mid-session,
# right after editing a tracked doc, before it's ever staged or committed.
if [[ -z "$STAGED" ]]; then
    STAGED=$(git diff -U0 | grep '^+' | grep -v '^+++')
fi

# Feed grep via a temp file instead of an `echo` pipe — piping multi-byte
# UTF-8 through `echo | grep -P` in this environment intermittently shifted
# character boundaries, producing both false negatives (2026-07-07) and
# false positives (2026-08-28) that did not reproduce when testing the same
# pattern against a file. printf (not echo) avoids echo's own
# quoting/interpretation quirks when writing the file.
STAGED_FILE=$(mktemp)
printf '%s\n' "$STAGED" > "$STAGED_FILE"
trap 'rm -f "$STAGED_FILE"' EXIT

check() {
    local description="$1"
    local pattern="$2"
    local matches
    matches=$(grep -iP "$pattern" "$STAGED_FILE" || true)
    if [[ -n "$matches" ]]; then
        echo -e "${RED}BLOCKED${NC} — $description"
        echo "$matches" | head -5 | sed 's/^/  /'
        ERRORS=$((ERRORS + 1))
    fi
}

echo "🔍 Scanning staged changes for private data..."

# License plates — Dutch and Romanian formats, hyphen or space separator.
# Known false-positive patterns (don't reach for --no-verify, rephrase the
# triggering text instead — see docs/sessions/2026-W27.md and 2026-W28.md):
#   - ordinary English text shaped like "<2 digits> for <1 digit>" (a decimal
#     fraction spelled out next to its percentage, for instance) — matches
#     the 3rd alternative below (digit-pair + 3-letter word + digit).
#   - Tailwind classes where a short letter-only class sits next to a
#     numeric-width class next to another letter-only class.
#   - Romanian text with diacritics (î/ă/ș/ț) piped through `echo | grep -P`
#     (not read from a file) can shift multi-byte UTF-8 boundaries and
#     produce a match that doesn't reproduce when testing the same text
#     via a file — confirmed 2026-07-07, root cause not fully understood,
#     but real license plates never carry diacritics, so rephrasing the
#     surrounding text (or dropping diacritics from illustrative examples)
#     is a safe, low-cost workaround.
check "License plate"              '\b(\d{2}[\s-][A-Z]{2}[\s-][A-Z]{2}|[A-Z]{2}[\s-]\d{3}[\s-][A-Z]|\d{2}[\s-][A-Z]{3}[\s-]\d|\d[\s-][A-Z]{3}[\s-]\d{2}|[A-Z][\s-]\d{3}[\s-][A-Z]{2}|[A-Z]{1,2}[\s-]\d{2,3}[\s-][A-Z]{2,3})\b'

# IBAN
check "IBAN number"                '\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7,}\b'

# VIN — 17 chars, mixed alpha+digits (exclude all-digit sequences).
# The letter/digit lookaheads are bounded to the 17-char window itself
# (0-16 chars + the required class) — an earlier unbounded (?=.*\d) matched
# any digit anywhere later in the whole line, false-positiving on 17-letter
# technical terms like "SharedArrayBuffer" whenever a port number followed
# it later in the same line.
check "VIN number"                 '\b(?=[A-HJ-NPR-Z0-9]{17}\b)(?=[A-HJ-NPR-Z0-9]{0,16}[A-HJ-NPR-Z])(?=[A-HJ-NPR-Z0-9]{0,16}\d)[A-HJ-NPR-Z0-9]{17}\b'

# Actual Budget Sync ID assigned
check "Actual Budget Sync ID"      'ACTUAL_BUDGET_SYNC_ID\s*=\s*[a-f0-9]{8}-[a-f0-9]{4}'

# Real Telegram IDs in allowed list (not placeholder 111111111 / 222222222)
check "Real Telegram user ID"      'TELEGRAM_ALLOWED_USER_IDS\s*=\s*(?!1{9}|2{9})[\d,\s]+'

# Credentials with real values (not placeholders or config references)
check "Real credential value"      '(PASSWORD|BOT_TOKEN|API_KEY|JWT_SECRET)\s*=\s*(?!your_|paste_|change_|example|\.\.\.|\*+|""|settings\.|cfg\.)[^\s]{10,}'

# Personal domain — any subdomain of the owner's real domain (leaks infra + is an
# attack vector). The @dorulian brand handles (YouTube/Substack) have no ".eu", so
# they don't match. Use generic placeholders (example.com, your-domain) instead.
check "Personal domain"            '\bdorulian\.eu\b'

# Internal homelab IPs (10.10.x.x — the owner's private LAN topology). Generic
# doc examples use 192.168.x.x, which is intentionally not matched here.
check "Internal homelab IP"        '\b10\.10\.\d{1,3}\.\d{1,3}\b'

# Romanian-language text in this repo (life-os) — code, comments, commit
# messages, and docs must be English only (root CLAUDE.md). The Obsidian
# vault (Second-Brain) is a separate repo and is intentionally Romanian —
# this check only ever sees life-os's own staged diff, so no path exclusion
# is needed. Confirmed 2026-08-28: quoted Romanian phrases from the vault's
# templates leaked into a session-log entry in this repo and were pushed
# before being caught manually — this check exists to catch that class of
# mistake automatically going forward. Deliberately not a broader
# Romanian-word list — just the diacritic letters unique to Romanian
# (modern comma-below forms and the legacy cedilla forms). Uses the
# literal UTF-8 characters, not \x{...} PCRE code-point escapes -- the
# escaped form triggered intermittent "character code point value ... too
# large" failures from this environment's `grep` (ugrep 7.8.4) that
# silently passed real Romanian text through, confirmed 2026-08-28 by
# repeated testing; literal characters were reliable across every test.
# Side effect: editing this exact line will trip this same check on
# itself (it's a literal match against its own pattern) -- use
# `git commit --no-verify` for that one commit, same as any other
# legitimate false-positive per the convention above.
check "Romanian-language text"     '[ăâîșțşţĂÂÎȘȚŞŢ]'

if [[ $ERRORS -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}⚠️  Commit blocked — $ERRORS sensitive pattern(s) found above.${NC}"
    echo "   Remove or anonymize the data, then try again."
    echo "   Emergency bypass: git commit --no-verify"
    exit 1
fi

echo "✅ No private data found."
exit 0
