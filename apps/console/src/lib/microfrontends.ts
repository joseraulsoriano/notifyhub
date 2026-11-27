const PRODUCTION = {
  dashboard: 'https://notifyhub-mfe-dashboard.sc202357155.workers.dev',
  notifications: 'https://notifyhub-mfe-notifications.sc202357155.workers.dev',
  operations: 'https://notifyhub-mfe-operations.sc202357155.workers.dev',
  integrations: 'https://notifyhub-mfe-integrations.sc202357155.workers.dev',
};

const LOCAL = {
  dashboard: 'http://localhost:4331',
  notifications: 'http://localhost:4332',
  operations: 'http://localhost:4333',
  integrations: 'http://localhost:4334',
};

const defaults = import.meta.env.PROD ? PRODUCTION : LOCAL;

export const MICROFRONTENDS = {
  dashboard: import.meta.env.PUBLIC_MFE_DASHBOARD_URL ?? defaults.dashboard,
  notifications: import.meta.env.PUBLIC_MFE_NOTIFICATIONS_URL ?? defaults.notifications,
  operations: import.meta.env.PUBLIC_MFE_OPERATIONS_URL ?? defaults.operations,
  integrations: import.meta.env.PUBLIC_MFE_INTEGRATIONS_URL ?? defaults.integrations,
} as const;
