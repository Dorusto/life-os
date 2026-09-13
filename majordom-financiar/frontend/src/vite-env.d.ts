/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public URL of the Actual Budget instance, linked from the Home menu. */
  readonly VITE_ACTUAL_BUDGET_URL?: string
  /**
   * Base URL of the standalone vehicle-manager frontend (its own deployment,
   * default port 3010 in dev) — finance links out to it for vehicle detail
   * (decisions.md#vehicle-manager-standalone-frontend). Left unset, a
   * vehicle-linked account falls back to this app's local transactions view.
   */
  readonly VITE_VEHICLE_APP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
