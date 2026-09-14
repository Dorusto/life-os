---
title: concepts
description: Understand the data model behind Invest — securities, transactions, holdings, cost basis, returns, allocation, rebalancing, goals, and market data.
---

Invest keeps its own database of securities, transactions, holdings, and performance numbers. It does not read from Actual Budget; Majordom Finance only reads this data over REST.

## Source of truth

The app’s own database is the single source of truth. Securities, transactions, holdings, and performance live here, not in Actual Budget. Majordom Finance reads this data over REST, but never writes to it.

## Securities and transactions

A security is any instrument you hold — a stock, an ETF, a bond, or a currency. Each security has a symbol, a name, and a currency.

Transactions are the events that change your holdings. The app supports four types:

- **buy** – you acquire more of a security
- **sell** – you dispose of some of a security
- **dividend** – you receive a cash payment
- **fee** – you pay a charge

Each transaction carries the date, the security, the quantity, the price, and the currency. Transactions can be entered manually or imported from XTB. The import source is recorded so you can see where each entry came from.

## Holdings

A holding is the current position you have in a security. It is derived from the sum of all transactions for that security.

A holding can be **open** – you still own some quantity – or **closed** – you have sold the entire position. Closed positions are kept for historical reference and for return calculations.

## Cost basis

Cost basis is calculated using the **average-cost method**. For each security, the app tracks the average price you paid for the units you still own. When you buy more, the average is recalculated; when you sell, the cost basis of the sold units is removed.

> **Important:** cost basis is a tracking figure, not a tax figure. It is used for performance calculations and for the dashboard, but it is not intended to match your tax reporting.

## Currency

EUR is the base and display currency. Non-EUR securities are converted to EUR using a cached FX rate before they are summed into totals. The FX rate is refreshed at most once per symbol per day, and a stale cached value is used if the API is unavailable.

## XIRR (money-weighted return)

XIRR is a money-weighted return. It measures the annualised return of your portfolio, taking into account the timing and size of your cash flows (buys, sells, dividends, fees). It answers the question: “What annual return would make my actual cash flows produce my current balance?”

Use XIRR when you want to see how your own decisions – when you added or removed money – affected your performance.

## TWR (time-weighted return)

TWR is a time-weighted return. It measures the performance of the underlying investments, independent of when you added or removed money. It splits the timeline into periods between cash flows, calculates the return for each period, and links them together.

Use TWR when you want to compare the performance of your investments against a benchmark, without the noise of your own contributions or withdrawals.

## Benchmark

The benchmark is a ticker you can set in the app. It is used to compare your portfolio’s performance against a market index. The comparison is made by calculating the same return metric (XIRR or TWR) for the benchmark over the same period, and showing the difference.

## Allocation

Allocation shows how your portfolio is distributed. There are three views:

- **by asset type** – e.g. stocks, bonds, cash
- **by holding** – each individual security
- **by currency** – the currency exposure of your holdings

The fixed series colour order is used consistently across all three views, so the same colour always represents the same category.

## Rebalancing

Rebalancing helps you keep your portfolio aligned with your target weights. You define target weights for each asset type or holding. The app calculates the **drift** – the difference between your current weight and your target weight.

When drift exceeds a threshold you set, the app suggests a trade to bring you back in line. The suggested-trade formula is:

```
suggested_trade = (target_weight - current_weight) * portfolio_value
```

A positive value means you should buy more of that asset; a negative value means you should sell some.

## Goals

A goal is a target value you want to reach by a certain date. The app projects the future value of your portfolio using a compounded growth rate.

The projection uses one of two rate sources:

- **historical XIRR** – the actual money-weighted return you have achieved so far
- **assumed annual return** – a fixed rate you set in Settings

You can choose which source to use for each goal.

## Market data

Market data (prices and FX rates) is refreshed at most once per symbol per day. If the API is unavailable, the app serves the last cached value, so a failed call never breaks a page. This means the numbers you see may be slightly stale, but they are always available.

## Glossary

| Term | Meaning |
|------|---------|
| Security | A financial instrument you hold (stock, ETF, bond, currency) |
| Transaction | A buy, sell, dividend, or fee that changes your holdings |
| Holding | Your current position in a security, derived from transactions |
| Open position | A holding where you still own some quantity |
| Closed position | A holding where you have sold the entire position |
| Cost basis | The average price you paid for the units you still own (tracking figure, not tax figure) |
| XIRR | Money-weighted annualised return, sensitive to cash-flow timing |
| TWR | Time-weighted return, independent of cash-flow timing |
| Benchmark | A market index you compare your portfolio against |
| Allocation | How your portfolio is distributed (by asset type, holding, or currency) |
| Drift | The difference between your current weight and your target weight |
| Goal | A target value and date, with a compounded projection |
| Market data | Prices and FX rates, refreshed at most once per day, with stale fallback |
