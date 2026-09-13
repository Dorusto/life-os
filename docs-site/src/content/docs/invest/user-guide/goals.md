---
title: Goals
description: Set target portfolio values and see whether your current pace reaches each goal.
---

Goals let you define a target amount and a target date. The projection card uses your portfolio’s
historical return or a default annual return to project your current value forward, then tells you
whether you are on track.

## Adding a goal

Click **Add goal** at the top of the screen. A form appears with three fields:

- **Name** – a label like “Retirement” or “House down payment”.
- **Target amount (EUR)** – the amount you want to reach.
- **Target date** – the date by which you want to reach it.

The date must be in the future (today or later). When you submit, the goal appears in a card on the
Goals page.

## The goal card

Each goal is shown in its own card. The card includes:

- An **On track** or **Behind target** pill that summarises the projection outcome at a glance.
- The **target amount** and **target date** next to the pill.
- Four figures:

  - **Current** – your portfolio’s total value today.
  - **Projected** – the value the projection expects on the target date.
  - **Rate used** – the annual growth rate applied (shown as a percentage).
  - **Surplus** or **Shortfall** – the difference between the projected and target amounts, coloured
    green for a surplus and red for a shortfall.

## The projection chart

A line chart plots the projected value from today to the target date. A dashed horizontal rule marks
the target amount, so you can see how the line compares visually.

- The chart shows a single series (the goal’s projection) with a shaded area beneath the line.
- The vertical axis labels are in EUR.
- Hover over any point to see the exact value and date.

## How the rate is chosen

The projection rate comes from one of two sources, indicated in a footnote below the chart:

1. **Portfolio’s own historical XIRR** – if the portfolio has enough transactions to compute a
   reliable money‑weighted return, that rate is used. This is the more accurate option because it
   reflects your actual investing behaviour.
2. **Assumed annual return** – if the portfolio is too young to compute a meaningful XIRR (or the
   XIRR calculation fails), the projection uses the default rate set in
   [Settings](/invest/user-guide/settings/). The default is 7 %, but you can change it there.

The footnote also tells you which source was used for the current projection.

## Deleting a goal

Open the goal card’s delete button (trash icon) in the top‑right corner. A confirmation dialog asks
you to confirm. Deleting a goal **removes only the goal and its projection** – your transactions,
holdings, and other data remain untouched.

## Empty state

If you haven’t added any goals yet, the page shows an illustration and a suggestion to add your
first goal by clicking **Add goal**.
