// Islas de React de este microfrontend: cada ruta monta su pantalla dentro del marco común.
import { MfeApp } from '@notifyhub/mfe-runtime';
import { SubscriptionsPage } from './views/SubscriptionsPage';

export function SubscriptionsApp() {
  return (
    <MfeApp title="Suscripciones">
      <SubscriptionsPage />
    </MfeApp>
  );
}
