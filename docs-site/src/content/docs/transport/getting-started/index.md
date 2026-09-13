---
title: getting started
description: Placeholder — content pending generation.
---

_Content for this section has not been written yet._
---
title: Getting Started with Majordom Transport
description: A standalone vehicle log app with its own database and frontend.
---

# Getting Started

Majordom Transport is a standalone vehicle log designed to track fuel, costs,
mileage, reminders, and depreciation — **separate from any financial app**. It runs
its own frontend and its own backend, using its own SQLite database as the single
source of truth for all vehicle data. Majordom Finance (the main budget app)
knows nothing about vehicles, fuel logs, or service reminders; that information
lives here and only here.

## Where your data lives

All vehicle records, fuel entries, cost entries, and service reminders are stored
in an independent SQLite database. **They are not copied into Actual Budget or any
other accounting tool.** This means you can manage your vehicles independently
without mixing operational data with financial transactions.

## How to open the app

- **Frontend (Web UI):** [http://localhost:3010](http://localhost:3010)
- **Backend API:** [http://localhost:8010](http://localhost:8010) (used by the
  frontend internally; you normally don't need to access it directly)

When you visit the frontend for the first time, you'll be redirected to a login
screen. The credentials for this service are configured via the environment
variables `VEHICLE_MANAGER_USER1_USERNAME` and `VEHICLE_MANAGER_USER1_PASSWORD`
(separate from your Majordom Finance login). Ask your admin for the correct
values, or check your `.env` configuration if you are running the service
yourself.

## First run – no vehicles yet

After logging in, the Dashboard and Vehicles tabs both display an empty state
with a prominent **Import from Fuelio** button. This is the only way to create
a vehicle — ther is no manual “add vehicle” form.

## Creating a vehicle

Vehicles are created by importing a **Fuelio sync CSV** file.

1. Inside the app, navigate to **Dashboard** or **Vehicles** and tap the Import
   button (or use the **Import** icon in the top-right of the Vehicles tab).
2. Select a `.csv` file exported from the Fuelio mobile app.
3. Tap **Import**.

Afer a successfu import, the app creates (or updates) the vehicle and populates
its log with the fuel and cost records found in the CSV. You will see the
vehicle name and a summary of how many entries were added (and any that were
skipped because they already existed).

Because the data format includes location, odometer reading and tank‑full status,
the CSV import is the most convienient way to start tracking svehicle — you
don’t need to manually fill in details.

## Main tabs

Once at least one vehicle exists, you will see five tabs at the bottom of the
screen:

- **Dashboard** – an at‑a‑glance view of fuel economy (average and last
  consumption), costs (this month, this year, all time), distance (odometer,
  ths month, this year), and up‑coming reminders.
- **Vehicles** – a list of all your vehicles with the current market value and
  last odometer reading. Tap a vehicle to see its full profile and edit its
  details.
- **Timeline** – a chronologic view of every log entry (fuel fill‑ups, service
  events, insurance payments) grouped by month.
- **Stats** – charts and bar graphs showing fuel consumption, costs, and
  distance trends over custom date ranges.
- **Reminders** – a list of upcoming service intervals, APK/insurance due dates,
  and odometer‑based reminders, with overdue items highlighted.

## Next steps

Now that you have a vehicle and understand the basic layout, head over to the
[Concepts](/transport/concepts) section to learn more about the data model
and how reminders work. For detailed walk‑throughs of each screen, see the
[User Guide](/transport/guide) chapters.
