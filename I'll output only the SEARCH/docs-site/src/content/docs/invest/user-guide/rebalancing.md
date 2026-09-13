---
title: Rebalancing
description: Set target weights, see the drift table, and understand the suggested-trade formula.
---

The Rebalancing screen helps you keep your portfolio aligned with your target allocation. You set a target percentage for each tracked position, and the screen shows you the current drift and the trade that would close each gap.

## Summary tiles

At the top of the screen you see four summary tiles:

- **Portfolio value** – the total current value of all tracked positions.
- **Targets total** – the sum of all target percentages you have entered. Next to this number you’ll see the hint “should sum to 100%”.
- **Tracked targets** – the number of positions for which you have set a target.
- **Drifted positions** – the number of positions whose current percentage differs from the target by more than the threshold used for the “On target” label.

## Target weights editor

Below the summary tiles you can edit your target weights.

- **Add a row** – click the “Add row” button to create a new target entry.
- **Key field** – type a ticker symbol (e.g., `VTI`) or an asset type (e.g., `BONDS`). As you type, suggestions appear based on the positions you track.
- **Percentage field** – enter the target percentage for that key. The field accepts numbers and decimals.
- **Remove a row** – click the trash icon next to a row to delete that target.
- **Save targets** – after you finish editing, click “Save targets” to persist your changes.

## The 100% rule

Your target percentages should add up to 100%. The screen checks this as you edit:

- If the sum is exactly 100%, the “Targets total” tile shows the number in green and the Save button is enabled.
- If the sum is not 100%, the tile shows the number in red and the Save button is disabled. A message appears below the editor telling you how far off you are (e.g., “Targets total is 95%, please add 5% more”).

## Drift table

The drift table lists each tracked position with the following columns:

| Column | Description |
|--------|-------------|
| **Target** | The key you entered (ticker or asset type). |
| **Target %** | The percentage you set for that key. |
| **Current %** | The current percentage of that position in your portfolio. |
| **Current value** | The current dollar value of that position. |
| **Target value** | The dollar value the position would have if it matched your target percentage. |
| **Suggested trade** | The action needed to move from the current value to the target value. |

## Suggested-trade cell

The **Suggested trade** column shows one of three values:

- **Buy …** – if the current value is below the target value, the cell shows “Buy” followed by the dollar amount needed (e.g., “Buy $1,250”).
- **Sell …** – if the current value is above the target value, the cell shows “Sell” followed by the dollar amount to reduce (e.g., “Sell $800”).
- **On target** – if the difference between the current value and the target value is within a small threshold (currently $10), the cell shows “On target” instead of a buy or sell amount.

## Footnote

Below the table you’ll find a short footnote that explains the formula:

> Suggested trade = target value − current value.  
> Target value = portfolio value × (target % / 100).  
> Matching rule: first try to match a target key to a ticker symbol; if no ticker matches, try to match it to an asset type.

## Empty state

If you haven’t set any targets yet, the screen shows a message like “No targets set yet. Add a row to start.” The drift table is hidden until you have at least one target.

---

*This page reflects the current behavior of the Rebalancing screen.*
