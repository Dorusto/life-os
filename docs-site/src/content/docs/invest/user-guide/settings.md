---
title: Settings
description: Set your benchmark ticker, assumed annual return, and market-data API key.
---

# Settings

The Settings screen lets you configure the benchmark used for performance comparisons, the assumed annual return for projections, and the market-data API key that powers price updates.

## Performance

In the **Performance** card you can set:

- **Benchmark ticker** – the symbol of a broad index or ETF you want to compare your portfolio against (for example, `VWCE.DE` or `SPY`). The hint suggests using a broad index or ETF.
- **Assumed annual return** – a percentage you expect your investments to grow each year. This value is used in goal projections when there isn’t enough history for a reliable XIRR.

After you change either field, click **Save settings**. The page shows a confirmation message when the save succeeds, or an error message if something goes wrong.

## Market data

The **Market data** card contains the **Twelve Data API key** field. This key is used to fetch current prices for your holdings.

The key is **write‑only**: when you save a new key, it replaces the stored one, and the value is never shown again. If you need to change it later, you can enter a new key and save again.

The card also shows a **configured / not‑configured** indicator:

- **Configured** – a key is present. Prices and totals will be updated using live market data (refreshed at most once per day per symbol). If the API is unavailable, stale cached values are served.
- **Not configured** – no key is set. Prices and totals that depend on market data will be blank.

## Daily refresh and stale cache

Market data is refreshed at most once per day per symbol. If a live call fails (rate limit, network issue, unknown ticker), the app serves the cached value rather than failing the whole page. A stale price beats a broken dashboard.

## Environment variable

You can also set the API key as a server‑side environment variable (`TWELVE_DATA_API_KEY`). When both the saved setting and the environment variable are present, the saved setting takes precedence. The environment variable provides a fallback if no key has been saved in the Settings screen.
