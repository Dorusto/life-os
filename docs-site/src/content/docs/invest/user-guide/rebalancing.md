---
title: Rebalancing
description: Set target weights for each holding or asset class and see the trade that would close each gap.
---

The rebalancing screen helps you compare your current portfolio allocation with your target allocation and shows you exactly how much to buy or sell to get there.

## Summary tiles

At the top you’ll find four summary tiles:

- **Portfolio value** – the total EUR market value of your portfolio.
- **Targets total** – the sum of all target percentages you’ve entered. The tile highlights green if the sum is 100 % (balanced) or yellow if it isn’t, and a hint explains the sum should be 100 %.
- **Tracked targets** – the number of non‑empty target rows you’ve added.
- **Drifted positions** – the number of positions whose suggested trade is larger than €1 (the default threshold below which a position is considered “on target”).

## Target weights editor

The “Target weights” card lets you add, edit, and remove rows that define the percentage you want for each ticker or asset type.

To add a row, click the **Add target** button. A new row appears with two fields:

- **Target key** – a ticker symbol (e.g. `VWCE`, `AAPL`) or an asset type (`stock`, `etf`, `crypto`, `bond`, `fund`, `other`). When you start typing, a datalist shows suggestions drawn from your held tickers and asset types.
- **Target %** – the percentage of your portfolio value you want this position to represent. You can enter a number with decimals if you wish.

To remove a row, click the **✕** button on the right side of the row.

When you’ve finished editing, click **Save targets**. The save button is disabled until you’ve made changes.

## The 100 % rule

Your target percentages must sum to 100 %. The “Targets total” tile continuously shows the current sum. When the sum is not 100 %, the tile is highlighted and the page reminds you that the targets should sum to 100 %. The **Save targets** button remains clickable even when the sum is off, but the rebalancing suggestions will be misleading until the sum is corrected.

## Drift and suggested trades

Below the target editor you’ll find the “Drift and suggested trades” table. Each row represents one tracked target (and any held ticker that has no target is also listed with a 0 % target so you can see a sell suggestion).

The columns are:

| Column | What it shows |
|---|---|
| **Target** | The ticker or asset type key. |
| **Target %** | The percentage you set for this key. |
| **Current %** | The current percentage of the portfolio this key occupies, rounded to two decimal places. |
| **Current value** | The EUR value of this key’s current holdings. |
| **Target value** | The EUR value this key would have at the target percentage. |
| **Suggested trade** | `Buy €…` (if you need to increase the position), `Sell €…` (if you need to reduce it), or `On target` (if the absolute trade amount is less than €1). |

The **Suggested trade** amount is calculated with the formula:

```
( target % – current % ) × portfolio value
```

Positive means you should buy; negative means you should sell.

When the trade is less than €1 in either direction, the cell shows **On target** so you aren’t bothered by tiny rounding differences.

### Matching rule

When the app looks up the current value for a target key, it first tries to match it to a held **ticker**. If no holding has that ticker, it matches to an **asset type** (the `asset_type` field on the holding). This way you can set targets for specific securities or for broad asset classes.

## Empty state

If you haven’t set any targets yet, the “Target weights” card shows an empty‑state message with a prompt to add your first target, along with the **Add target** button.

## Footnote

At the bottom of the drift table the page displays a footnote:

> Suggested amount is `(target % − current %) × portfolio value`. A target key is matched to a held ticker first, then to an asset type.

That footnote is the same formula quoted above.
