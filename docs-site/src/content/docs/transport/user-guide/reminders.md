---
title: Reminders
description: "View and edit maintenance reminders for your vehicle: inspections, insurance, and service intervals."
---

The **Reminders** tab shows you what is coming due for your vehicle – APK/inspection,
insurance, and scheduled services – and lets you edit the dates and intervals that
drive them.

## Header and vehicle switcher

At the top of the page you see a **Vehicle Switcher** dropdown. Use it to switch
between your vehicles. The reminders you see always belong to the currently
selected vehicle.

## Edit reminders

When you first land on the tab, the edit form is hidden. Click the **Edit reminders**
button to open it.

The form contains six fields:

| Field               | Type   | What to enter                                           |
|---------------------|--------|----------------------------------------------------------|
| APK / inspection due | date   | The next inspection due date (if your country requires it). |
| Insurance due        | date   | Your insurance policy expiration date.                    |
| Service interval (km)| number | How many kilometres between services, e.g. `15000`.      |
| Service interval (months) | number | How many months between services, e.g. `12`.          |
| Last service odometer (km) | number | Odometer reading at the last service.               |
| Last service date    | date   | The date of the most recent service.                     |

After you make changes, click **Save**. The form will close and the reminder list
will update automatically. To discard your changes, click **Cancel**.

## Reminder list

Once you have configured at least one interval or due date, the page shows a list
of reminder cards. Each card contains:

- **Bell icon** – coloured **blue** when the item is not overdue, **red** when
  it is overdue.
- **Label** – e.g. "APK / inspection" or "Insurance".
- **Due date or due odometer** – displayed underneath the label.
- **Horizon text** – says "Overdue" (red), "Due today", "in N days", or "in N km".
- **Progress bar** – a horizontal bar that fills as the interval progresses.
  The bar is **blue** under normal conditions, and turns **red** once the item
  is overdue. The ﬁll percentage is proportional to how far you are through
  the current interval (e.g. how many kilometres / months have passed since the
  last service or due date).

  *Example:* If the service interval is 15000 km and you last serviced the car
  at 80000 km, and the current odometer is 95000 km, the bar will show
  (15000 / 15000) × 100 = 100% (full) and the item will be overdue.

### No reminders configured

If none of the reminder-driving fields have values, the list shows the message
**No reminders configured.** and no cards appear.

## How reminders are computed

Reminders are **computed from the vehicle's own fields**, not stored separately.
Editing the APK due date, insurance due date, service intervals, or last-service
mileage/date on this page is the same as editing those fields on the vehicle
itself. The changes are persisted via the same API endpoint
(`PATCH /vehicles/{id}`) that the vehicle details form uses.

There is no separate “reminder database” – the page simply looks at the vehicle’s
current fields and calculates whether anything is due.
