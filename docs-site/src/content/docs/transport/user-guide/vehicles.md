---
title: Vehicles
description: Find a vehicle, read its detail page, and add or delete log entries.
---

# Vehicles

The **Vehicles** tab lists every vehicle in your fleet. Clicking a vehicle opens its detail page, where you can view its value, specifications, reminders, charts, and log entries.

## Vehicles list

Each row shows:

- The vehicle’s name.
- A subtitle with make, model, and year (when available).
- The current value (if set).
- The last recorded odometer reading.

At the top of the list there is an **Import** button. Use it to bring in vehicle data from a Fuelio export.

If you have no vehicles yet, the list displays an empty state with a message and a button to start an import.

## Vehicle detail page

When you click a vehicle in the list you are taken to its detail page. The page has:

- A **back link** (← Vehicles) to return to the list.
- The vehicle’s name as the page title.
- A **Log out** button to end your session.

The rest of the page is divided into cards and sections.

### Value card

The value card shows the current market value of the vehicle. Below it you see:

- **Delta since acquisition** – how much the value has changed (in euros and as a percentage) since you bought the vehicle.
- **Purchase price** – what you originally paid.
- **Depreciation** – the amount of value lost so far.
- **Projected value in 12 years** – the estimated value at the end of the projection period, based on the depreciation model.
- **Value‑over‑time chart** – a line chart that plots the projected value over the next 12 years. The chart also displays a **salvage floor** line – the minimum value the vehicle is expected to reach.

#### No purchase price set

If you haven’t entered a purchase price, the value card shows the following message:

> “This vehicle has no purchase price set — value tracking is unavailable.”

Without a purchase price the system cannot calculate depreciation, the projection curve, or the salvage floor.

### Info card

The info card shows basic specifications:

- **Class** – for example, SUV, sedan, truck.
- **Year** – the model year.
- **Mileage** – the total distance driven.
- **Depreciation model** – either the class default (a built‑in rate) or a custom annual percentage you have configured.
- **Salvage floor** – the minimum percentage of the original value that the vehicle will keep, displayed as a percentage and as a euro amount.

### Reminders card

The reminders card lists upcoming maintenance items:

- **APK / inspection due** – date of the next roadworthiness test.
- **Insurance due** – date when the insurance policy expires.
- **Service interval** – how many kilometers and/or months between scheduled services.

Keeping these dates up to date helps you avoid missing important deadlines.

### Override history card

An **override** is a manual adjustment you make to the vehicle’s current value (for example, after a professional appraisal). The override history card lists every override you have entered, showing:

- The value you set.
- The date you set it.
- An optional note.

If you haven’t made any overrides the card simply says “No overrides yet.”

### Fuel & Costs section

This section contains five charts that help you track your running costs:

- **Consumption** – average fuel consumption over time (litres per 100 km).
- **Distance** – total kilometres driven per period.
- **Cost per km** – average cost to drive one kilometre.
- **Monthly cost** – total fuel expenditure per month.
- **Mileage** – odometer readings over time (requires start/end dates).

All five charts are updated automatically whenever you add a new log entry.

### Log section

The log section displays the **20 most recent entries** for the vehicle. Each entry shows:

- A **type pill** (Fuel, Service, Maintenance, Insurance, or Other) that identifies the nature of the entry.
- The **date**.
- For **fuel** entries: the number of litres and the total cost.
- For **non‑fuel** entries: the total cost and any notes you added.

Every entry has a **Delete** button (trash icon). Clicking it removes the entry from the log and refreshes all relevant cards and charts.

### Add‑entry form

At the bottom of the page there is a form to record a new log entry. You can fill in:

- **Category** – fuel, service, maintenance, insurance, or other.
- **Date** – when the entry took place.
- **Odometer** – the vehicle’s current mileage at the time of the entry.
- **Fuel‑specific fields** (when the category is “fuel”):
  - **Liters** – amount of fuel dispensed.
  - **Price per liter** – unit price.
  - **Full tank** / **Missed fill‑up** checkboxes.
  - **Station** – an optional location string.
- **Cost** – total cost; for fuel entries the cost is computed automatically when liters and price per liter are supplied.
- **Notes** – an optional text field.

After you submit the form the page refreshes every chart and card so the new entry is reflected everywhere.
