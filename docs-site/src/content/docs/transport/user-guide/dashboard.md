---
title: Dashboard
description: The at-a-glance summary for the selected vehicle, showing fuel economy, costs, distance, and upcoming reminders.
---

The **Dashboard** is the first thing you see when you open Majordom Transport. It gives you a quick overview of the vehicle you are currently managing, with four data cards and a list of service reminders.

## Vehicle switcher

At the top of the Dashboard you’ll find a selector that shows the name and odometer reading of your current vehicle. If you have more than one vehicle, you can tap the card to switch to another one. Your choice is remembered across all tabs (Dashboard, Reminders, etc.), so you won’t have to select the vehicle again when you move between screens.

Below the switcher, a **“View vehicle details →”** link takes you to the full vehicle page where you can see and edit all details for that vehicle.

## Cards

### Fuel economy

This card shows three numbers for the current vehicle:

- **Average** — the overall average fuel consumption (litres per 100 km) across all fill-ups.
- **Last fill** — the consumption for the most recent fill-up.
- **Last price** — the price per litre for the most recent fill-up, along with the date of that fill‑up.

### Costs

- **This month** — total fuel cost for the current month.
- **This year** — total fuel cost for the current year.
- **All time** — the sum of every fuel expense ever recorded for this vehicle.

### Distance

- **Odometer** — the current odometer reading (or manual mileage if no odometer has been entered).
- **This month** — kilometres driven this month.
- **This year** — kilometres driven this year.

The odometer value is taken from the most recent entry. If none has been entered yet, the card shows **“No vehicles yet”** or a dash (‑) where a number would be.

## Reminders

Below the cards you’ll see a **Reminders** section. When there are no upcoming reminders, you’ll see “Nothing due.” Otherwise, the top two reminders are shown, each with:

- A bell icon (red if overdue, otherwise grey).
- The reminder label (e.g. “Oil change”).
- The due date (or due kilometre reading if a date hasn’t been set).
- A horizon text that tells you when the reminder is due:
  - **Overdue** (red text) if the due date has already passed.
  - **Due today** if it’s due on the current day.
  - **in X days** or **in Y km** otherwise.

At the end of the section you’ll find a **“View all”** link that opens the full Reminders list.

## Empty state (no vehicles)

If you haven’t added any vehicles yet, the Dashboard shows a friendly message (“No vehicles yet”) and a button to **Import from Fuelio**.

## Error state

If the summary data for a vehicle fails to load (for example because of a network error), a warning message appears with a **“Retry”** button. The rest of the page is still visible so you can try again or switch to another vehicle.
