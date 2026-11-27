// Islas de React de este microfrontend: cada ruta monta su pantalla dentro del marco común.
import { MfeApp } from '@notifyhub/mfe-runtime';
import { Dashboard } from './views/DashboardPage';

export function DashboardApp() {
  return (
    <MfeApp title="Resumen">
      <Dashboard />
    </MfeApp>
  );
}
