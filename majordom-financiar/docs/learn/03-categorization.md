# 03 — How memory and categorization work

## What SQLite stores

```
memory.db
├── merchant_mappings ← merchant → confirmed category (from user history)
├── csv_profiles      ← saved CSV import profiles (bank format detection)
├── push_subscriptions ← Web Push subscriptions per user
├── notification_rules ← config per alert type (JSON)
├── notification_log  ← anti-spam log
├── pending_review    ← unconfirmed categorizations (notified after 48h)
├── user_preferences  ← onboarding state, cross-domain prefs
├── chat_history      ← persistent chat per user (max 500 msgs)
└── vehicles + vehicle_log ← vehicle profiles and refuel history
```

**NOT in SQLite:** transactions, balances, categories, budgets — those live in Actual Budget.

## How category is suggested — two levels

**Level 1 — Confirmed by you (from_history=True):**
```
"Lidl" → you confirmed previously it's "Daily Living > Groceries"
→ auto-categorized on import, no question asked
```

**Level 2 — LLM suggestion for unknown merchants:**
```
"Besteller.nl" → no history → LLM suggests based on name
→ shown with "?" badge → you confirm → saved to merchant_mappings
```

**Rules:**
- Auto-categorization **only** when you previously confirmed that exact merchant
- A new merchant always asks — regardless of how confident the LLM is
- `"Other"` is never memorized — it's a fallback, not a category
- Transactions > €50 always get a `?` badge, even if there's history (safety net for large amounts)

## How you "teach" the categorizer

When you confirm a category for "Patreon* Membership":
1. Saved in `merchant_mappings`: `patreon* membership → Lifestyle > Entertainment`
2. Next import: `from_history=True` → auto-categorized directly
3. Category propagated to Actual Budget via `update_transaction_category()`

## The 7 category groups (standard)

| Group | Emoji | Default subcategories |
|-------|-------|----------------------|
| Housing | 🏠 | Home & Maintenance, Utilities |
| Daily Living | 🛒 | Groceries & Drinks, Clothing, Children |
| Transport | 🚗 | Transport |
| Health | 💊 | Health |
| Lifestyle | 🎯 | Restaurants & Cafes, Entertainment & Vacation, Personal |
| Finance | 💰 | Investments & Savings |
| Unexpected | ⚡ | Other |

Created automatically at first setup via `_ensure_default_categories()` in `backend/api/setup.py`. User can add/modify/delete freely after that.

## SmartCategorizer

`backend/core/memory/categorizer.py` — manages `merchant_mappings` table. Key methods:
- `suggest(merchant)` → returns category name + `from_history` flag
- `learn(merchant, category)` → saves confirmed mapping
- Never learns `"Other"` — call `categorizer.learn()` only when category is real

## Important: SmartCategorizer ≠ financial data

It stores **preferences** (Albert Heijn → Groceries), not transactions. It's a performance cache. Actual Budget is still the source of truth for everything financial. If mappings are wrong/stale, delete them: `DELETE FROM merchant_mappings` via Docker exec.
