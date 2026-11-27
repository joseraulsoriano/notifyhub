// Variables que Vite reemplaza al compilar la app que consume el kit (shell o microfrontend).
interface ImportMetaEnv {
  readonly PROD: boolean;
  readonly PUBLIC_NOTIFYHUB_API_URL?: string;
  readonly PUBLIC_SHELL_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
