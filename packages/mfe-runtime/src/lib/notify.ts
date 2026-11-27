import { toast } from 'sonner';
import { MESSAGE, isEmbedded, postToShell } from './bridge';
import { NOTIFY_EVENT, parseNotification, type NotifyInput, type Severity } from './notification-contract';

/**
 * Emite una notificación de interfaz. Un microfrontend no la muestra él: la manda al módulo de
 * notificaciones del shell (por `postMessage`, porque cada MFE vive en otro origen). Suelto, sin shell,
 * cae a un aviso local para poder probarlo por separado.
 */
export function notify(input: NotifyInput): void {
  if (isEmbedded()) {
    postToShell({ type: MESSAGE.notify, payload: input });
    return;
  }
  const item = parseNotification(input, { sourceMfe: 'local' });
  if (!item) return;
  window.dispatchEvent(new CustomEvent(NOTIFY_EVENT, { detail: item }));
  showToast(item.severity, item.title, item.message);
}

export function showToast(severity: Severity, title: string, description?: string): void {
  const options = { description, duration: severity === 'error' ? 8000 : 4000 };
  if (severity === 'success') toast.success(title, options);
  else if (severity === 'error') toast.error(title, options);
  else if (severity === 'warning') toast.warning(title, options);
  else toast(title, options);
}

type Shortcut = (title: string, extra?: Omit<NotifyInput, 'title' | 'severity'>) => void;
const shortcut =
  (severity: Severity): Shortcut =>
  (title, extra) =>
    notify({ ...extra, severity, title });

notify.info = shortcut('info');
notify.success = shortcut('success');
notify.warning = shortcut('warning');
notify.error = shortcut('error');
