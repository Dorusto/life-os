---
title: Concepts
description: The Transport data model — vehicles, log entries, and how fuel economy, cost per km, and depreciation are computed.
---

## Source of truth

Majordom Transport keeps its own database — vehicles, fuel entries, cost entries, and reminders all live here, not in Actual Budget. Majordom Finance only reads this data over REST, for chat answers and dashboard widgets; it never writes to it.

## Vehicle record

A vehicle carries: name, make, model, year, plate, fuel type, tank capacity, purchase price and date, a vehicle class, an annual depreciation percentage, a salvage-floor percentage, APK/insurance due dates, service intervals (by distance and by time), and the last service date/mileage.

## Log entry

Every log entry has a type — **Fuel**, **Service**, **Maintenance**, **Insurance**, **Tolls**, **Parking**, **Tax**, or **Other** — plus a date, odometer reading, location, and notes. A fuel entry additionally carries litres, price per litre, total cost, and two flags: whether it was a full tank, and whether a previous fill-up was missed.

## Fuel economy

Average consumption (L/100km) is derived only from **full-tank** entries where no prior fill-up was missed — the distance and litres between two consecutive full tanks give a reliable number. Partial fills are excluded because they don't represent the full amount of fuel used to cover the distance since the last fill, which would skew the result.

## Cost per km

Total cost across all log entries, divided by the distance covered over the same period.

## Depreciation

Each vehicle either follows its class's default depreciation curve, or a custom annual percentage you set yourself — the vehicle's detail page shows which one is active ("Class default" or "Custom (X%/yr)"). A **salvage floor** (a percentage of the purchase price) sets a lower bound the projected value won't drop below. An override history lets you pin a real, observed value at a point in time rather than relying purely on the projection.

## Reminders

Reminders are either date-based (APK, insurance — due on a specific date) or odometer-based (service intervals — due at a specific mileage, or after a set number of months, whichever comes first). Progress toward a reminder is shown against whichever measure applies.

## Fuelio import

A Fuelio sync CSV is the only way to bulk-create log entries — see the User Guide's Fuelio Import page for the actual import flow.

## Glossary

| Term | Meaning |
|---|---|
| Full tank | A fuel entry where the tank was filled completely, used as a fuel-economy anchor point |
| Missed fill-up | A fuel entry flagged as not representing the true distance since the last fill |
| Salvage floor | The minimum value a vehicle's projected depreciation curve won't drop below |
| Class default | The depreciation curve applied when no custom annual percentage is set |
| Override | A manually entered real value that pins the depreciation curve at a point in time |
