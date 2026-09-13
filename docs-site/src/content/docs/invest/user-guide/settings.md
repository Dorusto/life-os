---
title: Settings
description: Set your benchmark ticker, assumed annual return, and market-data API key.
---

# Settings

The Settings screen lets you configure the benchmark used for performance comparisons, the assumed annual return for projections, and the market-data API key that powers price updates.

## Performance

In the **Performance** card you can set:

- **Benchmark ticker** – the symbol of a broad index or ETF you want to compare your portfolio against (for example, `SPY` or `VTI`). The hint suggests using a broad index or ETF.
- **Assumed annual return** – a percentage you expect your investments to grow each year. This value is used in projections and long‑term planning.

After you change either field, click **Save settings**. The page will show a confirmation message when the save succeeds, or an error message if something goes wrong.

## Market data

The **Market data** card contains the **Twelve Data API key** field. This key is used to fetch current prices for your holdings.

The key is **write‑only**: when you save a new key, it replaces the stored one, and the value is never shown again. If you need to change it later, you can enter a new key and save again.

The card also shows a **configured / not‑configured** indicator:

- **Configured** – a key is present. Prices and totals will be updated using live market data.
- **Not configured** – no key is set. Prices and totals may be missing or stale until you add a key.

## Daily refresh and stale cache

Market data is refreshed once per day. If the data is older than that, the app uses the cached values and shows a note that the data may be stale.

## Environment variable

You can also set the API key as a server‑side environment variable (for example, `TWELVE_DATA_API_KEY`). If the environment variable is present, it takes precedence over any key entered in the Settings screen.
