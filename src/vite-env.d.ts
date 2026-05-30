/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIVE_SHARE_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
