const prod = import.meta.env.PROD;
const WORKERS = 'sc202357155.workers.dev';

/** URL del API Gateway (Render). En producción se fija al compilar con PUBLIC_TASKFLOW_API_URL. */
export const API_URL: string = import.meta.env.PUBLIC_TASKFLOW_API_URL ?? 'http://localhost:18080';
export const SHELL_URL: string =
  import.meta.env.PUBLIC_TF_SHELL_URL ??
  (prod ? `https://taskflow-console.${WORKERS}` : 'http://localhost:4340');
export const MFE_URLS = {
  projects:
    import.meta.env.PUBLIC_TF_MFE_PROJECTS_URL ??
    (prod ? `https://taskflow-mfe-projects.${WORKERS}` : 'http://localhost:4341'),
  team:
    import.meta.env.PUBLIC_TF_MFE_TEAM_URL ??
    (prod ? `https://taskflow-mfe-team.${WORKERS}` : 'http://localhost:4342'),
} as const;
/** La primera versión (modular, serverless) vive en su propio link. */
export const NOTIFYHUB_URL: string =
  import.meta.env.PUBLIC_NOTIFYHUB_URL ?? `https://notifyhub-console.${WORKERS}`;
