/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
interface ImportMetaEnv {
  readonly PUBLIC_BASE_URL: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
