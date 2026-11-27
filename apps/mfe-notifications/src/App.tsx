// Islas de React de este microfrontend: cada ruta monta su pantalla dentro del marco común.
import { MfeApp } from '@notifyhub/mfe-runtime';
import { NotificationsPage } from './views/NotificationsPage';
import { NewNotification } from './views/NewNotification';

export function NotificationsApp() {
  return (
    <MfeApp title="Notificaciones">
      <NotificationsPage />
    </MfeApp>
  );
}

export function NewRequestApp() {
  return (
    <MfeApp title="Nueva solicitud">
      <NewNotification />
    </MfeApp>
  );
}
