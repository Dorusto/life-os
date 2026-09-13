---
title: Transport Reference
description: FAQ and glossary for the Transport module.
---

# Transport Reference

## FAQ

### Where is my vehicle data stored?

Your vehicle data is stored in this app's own database, not in Actual Budget.

### How do I add a vehicle?

You can add a vehicle by importing a Fuelio CSV file. There is no manual form.

### Why is my average consumption blank?

Average consumption requires at least two full-tank entries. Once you have two full-tank records, the average will be calculated.

### What is the salvage floor?

The salvage floor is a lower bound on the depreciation curve. It prevents the estimated value from dropping below a certain amount.

### Why does a reminder show as overdue?

A reminder shows as overdue when its due date or due odometer reading has passed.

### Can I delete a log entry?

Yes, you can delete a log entry from the Timeline or from the vehicle detail log.

### Does Majordom Finance see this data?

Yes, Majordom Finance can access this data over REST, for chat and dashboard widgets.

### How do I move my old vehicle data here?

You can use the migration script. See the Self-Hosting section for details.

## Glossary

| Term | Definition |
|------|------------|
| vehicle record | A stored entry for a single vehicle, including its make, model, and other details. |
| log entry | A single record of a fuel fill, service, or other event for a vehicle. |
| entry type | The category of a log entry, such as fuel, service, or other. |
| full tank | A log entry where the tank was filled completely, used for consumption calculations. |
| L/100km | Liters per 100 kilometers, a measure of fuel consumption. |
| cost per km | The cost of driving one kilometer, calculated from fuel cost and consumption. |
| odometer | The total distance traveled by the vehicle, recorded in the log. |
| service interval | The recommended distance or time between services for a vehicle. |
| APK/inspection | The periodic vehicle inspection required in some regions. |
| salvage floor | The minimum value used in the depreciation model. |
| depreciation model | The method used to estimate a vehicle's value over time. |
| override | A manual adjustment to a calculated value, such as a custom depreciation rate. |
| reminder horizon | The number of days or kilometers ahead that reminders are shown. |
| Fuelio sync | The process of importing data from the Fuelio app via CSV. |
| service token | A token used to authenticate service requests. |
