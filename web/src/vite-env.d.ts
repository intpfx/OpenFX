interface ImportMetaEnv {
  readonly VITE_OPENFX_BUILD_HASH?: string;
  readonly VITE_OPENFX_BUILD_TIME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
