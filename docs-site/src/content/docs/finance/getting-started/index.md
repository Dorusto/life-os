---
title: Getting Started
description: Learn what Majordom Finance is, how it connects to Actual Budget, and how to start using it.
---

Majordom Finance is a conversational intelligence layer over Actual Budget. You talk to it, and it does the rest — managing your accounts, categories, and transactions through natural language.

Your financial data lives in Actual Budget, which is the source of truth for accounts, categories, and transactions. Majordom Finance reads and writes through Actual Budget, so you always have a single, reliable record of your finances.

## Opening the app

The web UI runs on the configured `WEB_PORT` (default `3000`). Actual Budget itself runs on port `5006`. When you first open Actual Budget, you may need to use `https://` or `localhost` because of browser security restrictions. If you're accessing it from another machine, set up an SSH tunnel to keep the connection secure.

## First run

Log in with the credentials from your `.env` file. The Chat tab will detect that you haven't configured a budget yet and show a balance-entry card to get you started. The Dashboard will show a "Let's get started" card when there are no accounts yet.

## Main tabs

- Dashboard
- Accounts
- Transactions
- Analytics
- Chat
- Settings

## Next steps

Dive into the [Concepts](/docs/finance/concepts) and [User Guide](/docs/finance/user-guide) sections to learn more about how Majordom Finance works.
