---
title: Getting Started
description: Learn how to open Majordom Transport, where vehicle data lives, and how vehicles are created.
---

Majordom Transport is a standalone vehicle log that tracks fuel, costs, mileage, reminders, and depreciation. It has its own frontend and backend, separate from Majordom Finance.

Vehicle data lives in this app's own SQLite database. It is the source of truth for vehicles, fuel logs, costs, and reminders. It is not stored in Actual Budget.

To open the app, go to the standalone web app on its own port (default 3010). The backend runs on port 8010.

On first run, you'll log in with this service's own credentials, separate from Majordom Finance's. With no vehicles yet, the Dashboard and the Vehicles tab both point at the Fuelio import.

Vehicles are created only by importing a Fuelio sync CSV. There is no manual "add vehicle" form.

The main tabs are: Dashboard, Vehicles, Timeline, Stats, Reminders.

Next steps: check the Concepts and User Guide sections for more details.
