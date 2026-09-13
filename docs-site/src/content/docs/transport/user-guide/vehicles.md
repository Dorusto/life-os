---
title: Vehicles
description: Find a vehicle, read its detail page, and add or delete log entries.
---

# Vehicles

The Vehicles tab lists every vehicle in your fleet. From there you can open a vehicle's detail page, where you'll find its value, specs, reminders, charts, and the log.

## Vehicles list

The list shows each vehicle as a row. Each row includes:

- The vehicle's name
- A subtitle with make, model, and year
- The current value
- The last recorded odometer reading

At the top of the list there is an **Import** button. Use it to bring in vehicle data from an external source.

If you have no vehicles yet, the list shows an empty state with a message and a button to add your first vehicle.

## Vehicle detail page

When you click a vehicle in the list, you go to its detail page. The page has:

- A back link to return to the list
- The vehicle's name as the page title
- A **Log out** button to end your session

The rest of the page is divided into cards and sections.

## Value card

The value card shows the current value of the vehicle. It also shows:

- The delta since acquisition (how much the value has changed since you bought it)
- The purchase price
- The depreciation (how much value it has lost)
- The projected value in N years (where N is a number you can set)
- A value-over-time chart with a salvage floor line

The chart shows how the value changes over time, and the salvage floor line marks the minimum value the vehicle is expected to reach.

## No purchase price set

If you haven't entered a purchase price, the value card shows a message instead of the purchase price and depreciation numbers. This means the system cannot calculate depreciation or the projected value until you provide a purchase price.

## Info card

The info card shows basic details about the vehicle:

- Class (for example, SUV, sedan, truck)
- Year
- Mileage
- Depreciation model (either the class default or a custom model you've set)
- Salvage floor percentage and amount

The salvage floor is the percentage of the original value that the vehicle will never drop below, and the amount is that percentage applied to the purchase price.

## Reminders card

The reminders card lists upcoming maintenance items:

- APK/inspection due date
- Insurance due date
- Service interval (in kilometers and/or months)

These reminders help you keep the vehicle in good shape.

## Override history card

An override is a manual adjustment you make to the vehicle's value. The override history card shows each override you've made, including:

- The value you set
- The date you set it
- A note you added

If you haven't made any overrides, the card shows an empty state.

## Fuel & Costs section

This section shows five charts:

- **Consumption** – how many liters per 100 km the vehicle uses over time
- **Distance** – how many kilometers you drive over time
- **Cost per km** – the cost of driving one kilometer
- **Monthly cost** – the total fuel cost per month
- **Mileage** – the odometer reading over time

Each chart updates automatically when you add a new log entry.

## Log section

The log section shows the 20 most recent entries for the vehicle. Each entry has:

- A type pill (for example, Fuel, Service, Repair)
- The date
- For fuel entries: litres and cost
- For other entries: cost and notes

Each entry has a **Delete** button so you can remove an entry if you made a mistake.

## Add-entry form

At the bottom of the page there is a form to add a new log entry. You can record:

- The type of entry (fuel, service, repair, etc.)
- The date
- The litres (for fuel)
- The cost
- Any notes

When you submit the form, the page refreshes every chart and card so the new entry is reflected everywhere.
