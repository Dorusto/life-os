# Task: Write Majordom Finance — User Guide: Chat

## Source app / repo path
majordom-financiar

## Target doc file(s)
`../docs-site/src/content/docs/finance/user-guide/chat.md` — relative to `majordom-financiar/`.
Launch Aider from `majordom-financiar/`.

## Context
The Chat tab is the primary interface: you ask in plain language, Majordom answers with text, charts,
or a confirm card.

## Goal
A reader can hold a useful conversation, understand what the cards are asking, and know how to
attach a receipt or a CSV.

## Source material to read (in the app's own repo)
| File | What it contains |
|---|---|
| frontend/src/pages/Chat.tsx | The whole screen: streaming, card dispatch table, media menu, help sheet |
| frontend/src/components/ProposalCard.tsx | Generic confirm/cancel proposal card |
| frontend/src/components/ClarificationCard.tsx | Multiple-choice clarification card |
| frontend/src/components/ReceiptCard.tsx | Receipt review card |
| frontend/src/components/CsvImportCard.tsx | CSV preview card inside chat |
| frontend/src/components/TransactionListCard.tsx | Read-only transaction list card |

## Content required
- What the tab is for, in one paragraph: ask questions, get answers, confirm writes.
- The header actions: overflow menu (Clear chat history, How to use Majordom), notification bell,
  settings.
- The input bar: the `+` media menu (Take photo, Choose from gallery, Upload CSV), the text area,
  Enter to send / Shift+Enter for a newline, and the up/down arrow history.
- Starter suggestions shown on an empty conversation.
- The kinds of reply you can get, one short paragraph each:
  - plain text answers (with markdown)
  - charts and transaction lists (read-only, and they survive a refresh)
  - confirm cards: proposals, budget rebalance, account transfer, balance adjustment, close account,
    transfer conversion, category actions, budget copy, reached goals, goal proposals, vehicle log
    actions, vehicle reminders, vehicle status, notification time
  - clarification cards (pick one option)
  - receipt cards (review extracted data, switch between fuel and grocery)
  - CSV import cards and Fuelio import cards
  - status lines ("Cancelled.", "Saved…") that replace a card once you act on it
- The first-run setup card (enter your real account balances) and the follow-up message.
- A note that confirming a card is the end of the task — the card is replaced by a status line, and
  the exchange is saved to history.
- A note that the help sheet inside the app lists example questions; link to it rather than repeating
  every example.

## Style rules
- Starlight/Astro Markdown (.md), frontmatter with `title` and `description`
- Plain English, end-user tone (not developer-facing), matches wealthfolio.app/docs' style: short
  paragraphs, practical, feature-oriented
- No real personal data (names, IPs, hostnames, domains, license plates) — use generic placeholders
- Do not invent features that don't exist in the code

## Do NOT touch
- `docs-site/astro.config.mjs` (sidebar structure, already decided)
- Any other app's doc pages

## Done when
- The target file contains real, accurate content (not the placeholder text), matching what the
  actual code does

## Suggested difficulty tier
Rapid

## Dispatch args
--file ../docs-site/src/content/docs/finance/user-guide/chat.md
--read frontend/src/pages/Chat.tsx
--read frontend/src/components/ProposalCard.tsx
--read frontend/src/components/ClarificationCard.tsx
--read frontend/src/components/ReceiptCard.tsx
--read frontend/src/components/CsvImportCard.tsx

## Circuit breaker
If you encounter a decision with real architectural impact that isn't documented in decisions.md/architecture.md, stop and describe the situation in your response instead of silently picking an undecided option yourself.
