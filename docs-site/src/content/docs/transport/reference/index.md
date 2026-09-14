---
title: Reference
description: Frequently asked questions and a glossary of terms used across the Transport section.
---

## FAQ

### Where is my vehicle data stored?

Your vehicle data lives in the vehicle-manager service’s own SQLite database (`vehicles.db`). This database is separate from Actual Budget and from any other system — nothing financial is stored here.

### How do I add a vehicle?

There is no manual “add vehicle” form. The only way to bring in a vehicle is by importing a Fuelio CSV file through the **Import** screen. The import will create or update vehicle records based on the plate and name.

### Why is my average consumption blank?

The app computes average consumption (in L/100 km) only after it has **two full‑tank, non‑missed fuel entries** for the same vehicle. If you have fewer than two such entries, the metric stays empty.

### What is the salvage floor?

The salvage floor is a lower bound for your vehicle’s estimated future value. It is calculated as a percentage of the purchase price (default 10%). The depreciation curve will never drop below this floor.

### Why does a reminder show as overdue?

A reminder (APK inspection, insurance, service interval) is marked **overdue** when the due date has passed or, for a service interval, when the last recorded odometer reading exceeds the configured km threshold.

### Can I delete a log entry?

Yes. From the vehicle detail page, each log entry has a trash‑icon button. You can also delete entries from the **Timeline** view. Deletion is permanent.

### Does Majordom Finance see this data?

Yes. The vehicle‑manager REST API is accessible to the Majordom Finance backend over the internal network. This allows the chat assistant and dashboard widgets (e.g., vehicle summary, fuel stats) to read data through a service‑token‑authenticated proxy.

### How do I move my old vehicle data here?

Use the migration script included in the repository:

```bash
cp /path/to/majordom-financiar/data/memory.db /tmp/memory-copy.db
python tools/vehicle-manager/scripts/migrate_from_majordom.py /tmp/memory-copy.db /tmp/vehicles.db
```

After migration, replace your running database with the output file. See the *Self‑Hosting* guide for detailed steps.

---

## Glossary

| Term | Definition |
|------|------------|
| **Vehicle record** | A database row representing a vehicle (make, model, plate, fuel type, reminders, depreciation model, etc.). |
| **Log entry** | A single row in the vehicle log — either a fuel fill‑up, a cost entry, or a service reminder. |
| **Entry type** | The category of a log entry: `fuel`, `service`, `maintenance`, `insurance`, `tolls`, `parking`, `tax`, or `other`. |
| **Full tank** | A fuel entry marked as a full‑tank fill‑up (not missed). The system uses consecutive full‑tank entries to compute average consumption. |
| **L/100 km** | Litres per 100 kilometres — the standard metric for fuel consumption shown on the statistics page. |
| **Cost per km** | Total fuel cost divided by the distance driven over the same period, shown in the statistics. |
| **Odometer** | The vehicle’s distance reading (`odo_km`) recorded with each log entry. The most recent value becomes the vehicle’s current mileage. |
| **Service interval** | A configured distance (km) and/or time (months) after which a service reminder triggers. Intervals are stored per vehicle. |
| **APK / inspection** | The compulsory periodic vehicle inspection (MOT equivalent). Due date is stored per vehicle and shown on the detail page. |
| **Salvage floor** | A percentage (default 10%) of the purchase price that acts as the minimum value in the depreciation projection curve. |
| **Depreciation model** | The annual depreciation percentage used to project future vehicle value. Each vehicle can use a custom percentage or fall back to a class default. |
| **Override** | A manual value entry that replaces the automatically calculated current value on a specific date. Overrides appear in the *Value history* list. |
| **Reminder horizon** | The look‑ahead window (e.g., 30 days) in which upcoming reminders are shown as “coming due”. |
| **Fuelio sync CSV** | A CSV file exported from the Fuelio mobile app. It contains vehicle‑log entries (fuel, service, costs) that can be imported via the vehicle‑manager API. |
| **Service token** | An `X‑Service‑Token` header used for server‑to‑server authentication between Majordom Finance and vehicle‑manager. |
