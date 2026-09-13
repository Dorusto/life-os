---
title: Transport Concepts
description: How vehicle records, log entries, and derived numbers work in Majordom Transport.
---

# Transport Concepts

This page explains the data model behind Majordom Transport: what a vehicle record holds, what a log entry is, and how the derived numbers (fuel economy, cost per km, depreciation) are actually computed.

## Source of truth

The app's own database is the source of truth. Vehicles, fuel entries, cost entries, and reminders live here, not in Actual Budget. Majordom Finance only reads this data over REST for chat and dashboard widgets.

## Vehicle record

Each vehicle carries these fields:

- Name
- Make
- Model
- Year
- Plate
- Fuel type
- Tank capacity
- Purchase price and date
- Vehicle class
- Annual depreciation percentage
- Salvage floor percentage
- APK/insurance due dates
- Service intervals
- Last service

## Log entry

Log entries have a type: fuel, service, maintenance, insurance, or a generic cost type. Each entry carries:

- Date
- Odometer
- Litres (for fuel)
- Price per litre (for fuel)
- Total cost
- Location
- Notes

## Fuel economy

Fuel economy is expressed as litres per 100 km (L/100km). It is derived from the distance and litres between full-tank entries, not from every fill-up. Partial fills are excluded because they don't give a reliable measure of consumption over a known distance.

## Cost per km

Cost per km is the total cost divided by the distance over the same period.

## Depreciation

Depreciation uses a class-default model unless you set a custom annual percentage. A salvage floor acts as a lower bound. You can also override the value with a real observed value, and the override history records those changes.

## Reminders

Reminders can be date-based (APK, insurance) or odometer-based (service interval). Progress is shown relative to the next due date or odometer reading.

## Fuelio import

A Fuelio sync CSV is the only creation path for new data. It is a comma-separated file exported from the Fuelio app.

## Glossary

| Term | Meaning |
|------|---------|
| Vehicle record | The stored data about a single vehicle. |
| Log entry | A single record of a fuel, service, maintenance, insurance, or cost event. |
| Fuel economy | Litres per 100 km, computed from full-tank intervals. |
| Cost per km | Total cost divided by distance over the same period. |
| Depreciation | The reduction in value over time, using a class-default or custom percentage. |
| Salvage floor | The minimum value a vehicle can depreciate to. |
| Override history | A record of manual adjustments to the depreciation value. |
| Reminder | A date-based or odometer-based alert for maintenance or legal requirements. |
| Fuelio sync CSV | A comma-separated file exported from Fuelio, used to import data. |
