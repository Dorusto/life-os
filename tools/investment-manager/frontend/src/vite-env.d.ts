/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of Majordom Finance's web app, used to link to its chat route. */
  readonly VITE_MAJORDOM_FINANCE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
