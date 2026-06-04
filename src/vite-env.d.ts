/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIVE_SHARE_ENABLED?: string;
  readonly VITE_COLLAB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
