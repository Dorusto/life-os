/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public URL of the Actual Budget instance, linked from the Home menu. */
  readonly VITE_ACTUAL_BUDGET_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
