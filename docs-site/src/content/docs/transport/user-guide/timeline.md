---
title: Timeline
description: View your vehicle’s full chronological log, grouped by month, and add or delete entries.
---

The **Timeline** tab shows every log entry for the currently selected vehicle, sorted newest‑first and grouped by month. From this screen you can scan the vehicle’s history, see overdue reminders, and quickly remove an entry.

## Header and vehicle switcher

At the top of the page you’ll see the “Timeline” heading and a logout button. Just below it a **Vehicle Switcher** lets you jump between vehicles; the log and summary data update immediately when you switch.

## Reminders banner

If the selected vehicle has any pending reminders (APK due, insurance due, service interval, etc.) a coloured banner appears under the vehicle switcher. It displays the total number of reminders and the label of the first one, along with an “overdue” notice if it’s past its date. Tapping the banner takes you to the **Reminders** tab where you can view all of them and take action.

## Month grouping

All entries are collected by the month they were recorded, newest month at the top. Each month is labelled with its short name (e.g. “Sep 2026”). Inside the month, entries are listed in the order they were returned by the server.

## Entry row

Each entry card shows:

- **Icon** – a small circle with an icon that matches the entry type:
  - Fuel → a fuel‑drop icon
  - Insurance → a shield icon
  - Service / Maintenance → a wrench icon
  - Other → a dollar‑circle icon
- **Type label** – the human‑readable category (Fuel, Service, Maintenance, Insurance, Other).
- **Cost** – displayed on the right, right‑aligned in a monospaced font, using the currency format configured in the app.
- **Date and odometer** – the date the entry was recorded and, if available, the odometer reading (e.g. “12 Sep 2026 · 42,000 km”).
- **Fuel‑specific details** (shown only for fuel entries):
  - Number of litres (e.g. “52.4 L”)
  - Price per litre, with three decimal places (e.g. “€1.299/L”)
  - Optional fuel station name (location)
- **Notes** – for all other entry types and for fuel entries when no fuel‑specific line is present, the notes field text (if any) appears instead.

## Delete button

Every entry has a trash‑can icon on the right. Tapping it permanently removes that entry and automatically refreshes both the log and the summary data (including consumption stats and reminders). There is no confirmation step – the entry is deleted immediately.

## Empty state

When no entries exist for the selected vehicle, the page shows a centred message: “No entries yet.”

## Add‑entry form

At the bottom of the page (above the bottom navigation bar) there is a **+ Add entry** button. Tapping it expands a form where you can create a new log entry. The form includes:

- **Date** (required) – defaults to today.
- **Category** – “Fuel”, “Service”, “Maintenance”, “Insurance”, or “Other”. The fields change depending on the selection.
- **Odometer** (km) – optional.
- **Fuel fields** (shown only for the “Fuel” category):
  - Litres
  - Price per litre
  - Full tank – a checkbox; the app uses this for accurate consumption calculation
  - Missed fill‑up – a checkbox for when you didn’t fill the tank completely
  - Station – an optional text field
- **Cost** (shown for non‑fuel categories) – the total amount paid.
- **Notes** – optional text.

After saving, the form collapses, the new entry appears immediately in the log, and the vehicle’s summary (consumption, totals) is refreshed.
