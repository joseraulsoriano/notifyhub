// Kit compartido del shell y de los microfrontends de NotifyHub.
// Las primitivas de interfaz se importan por ruta: `@notifyhub/mfe-runtime/ui/button`.
export { cn } from './lib/utils';
export {
  DEFAULT_API_URL,
  listenToShell,
  setConnection,
  useConnection,
  type Connection,
} from './lib/connection';
export { createDemoClient, type DemoOptions } from './lib/demo-client';
export { CONTACT_FIELD, FALLBACK_CHAINS, STRATEGY_BY_PRIORITY } from './lib/routing';
export {
  MESSAGE,
  RPC_METHODS,
  answerRpc,
  isEmbedded,
  isRpcMethod,
  navigateShell,
  shellLink,
  shellOrigin,
  type RpcMethod,
  type RpcRequest,
  type RpcResult,
} from './lib/bridge';
export { Page } from './components/page';
export { LoadError, PageHeader } from './components/page-header';
export { FilterSelect } from './components/filter-select';
export { NotificationPanel, NotificationSheet } from './components/notification-panel';
export { ConnectionButton } from './components/connection-dialog';
export { MfeApp } from './components/mfe-app';
export { useIsMobile } from './hooks/use-mobile';
